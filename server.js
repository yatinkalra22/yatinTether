'use strict';

const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');
const path = require('path');

// Initialize auction system
const main = async () => {
  const clientName = process.argv[2] || `client-${Date.now()}`; 
  const dbPath = path.join('./auction-db', clientName);

  const core = new Hypercore(dbPath);
  const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' });
  await db.ready();

  // Distributed hash table
  const dht = new DHT({
    keyPair: DHT.keyPair(crypto.randomBytes(32)),
    bootstrap: [{ host: '127.0.0.1', port: 30001 }],
  });

  const rpc = new RPC({ dht });
  const rpcServer = rpc.createServer();

  const peers = [];

  const auctions = {};
  const bids = {};

  // Add a peer to the network
  const addPeer = (peer) => {
    if (!peers.includes(peer)) {
      peers.push(peer);
      console.log(`Peer added: ${peer.toString('hex')}`);
    }
  };

  const notifyPeers = async (action, data) => {
    for (const peer of peers) {
      try {
        await rpc.request(peer, action, Buffer.from(JSON.stringify(data), 'utf-8'));
      } catch (error) {
        console.error(`Failed to notify peer ${peer.toString('hex')}:`, error);
      }
    }
  };

  rpcServer.respond('openAuction', async (rawRequest) => {
    const request = JSON.parse(rawRequest.toString());
    const { auctionId, item, price, clientName } = request;

    auctions[auctionId] = { item, price, highestBid: null, closed: false };
    console.log(`${clientName} opens auction: sell ${item} for ${price} USDt`);

    await notifyPeers('newAuction', { auctionId, item, price, clientName });

    return Buffer.from(JSON.stringify({ status: 'Auction opened', auctionId }), 'utf-8');
  });

  // Handler for making a bid
  rpcServer.respond('makeBid', async (rawRequest) => {
    const request = JSON.parse(rawRequest.toString());
    const { auctionId, bidder, amount } = request;

    if (!auctions[auctionId] || auctions[auctionId].closed) {
      return Buffer.from(JSON.stringify({ error: 'Auction not available' }), 'utf-8');
    }

    const auction = auctions[auctionId];
    if (!auction.highestBid || amount > auction.highestBid.amount) {
      auction.highestBid = { bidder, amount };
      console.log(`${bidder} makes bid for ${auctionId}: ${amount} USDt`);

      // Notify peers of the new bid
      await notifyPeers('newBid', { auctionId, bidder, amount });
    }

    return Buffer.from(JSON.stringify({ status: 'Bid placed', auctionId, amount }), 'utf-8');
  });

  // Handler for closing the auction
  rpcServer.respond('closeAuction', async (rawRequest) => {
    const request = JSON.parse(rawRequest.toString());
    const { auctionId, clientName } = request;

    if (!auctions[auctionId] || auctions[auctionId].closed) {
      return Buffer.from(JSON.stringify({ error: 'Auction not available or already closed' }), 'utf-8');
    }

    auctions[auctionId].closed = true;
    const winner = auctions[auctionId].highestBid ? auctions[auctionId].highestBid.bidder : 'No Winner';
    const amount = auctions[auctionId].highestBid ? auctions[auctionId].highestBid.amount : 0;

    console.log(`${clientName} closes auction ${auctionId}. Winner: ${winner}, Amount: ${amount} USDt`);

    // Notify peers
    await notifyPeers('auctionClosed', { auctionId, winner, amount, clientName });

    return Buffer.from(
      JSON.stringify({ status: 'Auction closed', winner, amount }),
      'utf-8'
    );
  });

  // Listener for new auction updates from peers
  rpcServer.respond('newAuction', async (rawData) => {
    const data = JSON.parse(rawData.toString());
    console.log(`${data.clientName} opens auction: sell ${data.item} for ${data.price} USDt`);
    return Buffer.from('OK');
  });

  // Listener for new bid updates from peers
  rpcServer.respond('newBid', async (rawData) => {
    const data = JSON.parse(rawData.toString());
    console.log(`${data.clientName} makes bid for ${data.auctionId}: ${data.amount} USDt`);
    return Buffer.from('OK');
  });

  // Listener for auction closed updates from peers
  rpcServer.respond('auctionClosed', async (rawData) => {
    const data = JSON.parse(rawData.toString());
    console.log(`${data.clientName} closes auction ${data.auctionId}. Winner: ${data.winner} with ${data.amount} USDt`);
    return Buffer.from('OK');
  });

  // Listen on the RPC server
  await rpcServer.listen();
  console.log(`RPC server running with public key: ${rpcServer.publicKey.toString('hex')}`);
};

main().catch(console.error);
