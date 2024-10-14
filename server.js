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

  const dht = new DHT({
    keyPair: DHT.keyPair(crypto.randomBytes(32)),
    bootstrap: [{ host: '127.0.0.1', port: 30001 }],
  });

  const rpc = new RPC({ dht });
  const rpcServer = rpc.createServer();

  const peers = [];
  const auctions = {};
  const bids = {};

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

  // Handler for creating an auction
  rpcServer.respond('openAuction', async (rawRequest) => {
    const request = JSON.parse(rawRequest.toString());
    const { item, price, clientName } = request;

    if (auctions[item]) {
      return Buffer.from(JSON.stringify({ error: 'Auction for this item already exists' }), 'utf-8');
    }

    auctions[item] = { price, highestBid: null, closed: false };

    console.log(`${clientName} opens auction: sell ${item} for ${price} USDt`);

    await notifyPeers('newAuction', { item, price, clientName });

    return Buffer.from(JSON.stringify({ status: 'Auction opened', item }), 'utf-8');
  });

  // Handler for making a bid
  rpcServer.respond('makeBid', async (rawRequest) => {
    const request = JSON.parse(rawRequest.toString());
    const { item, bidder, amount } = request;

    if (!auctions[item] || auctions[item].closed) {
      return Buffer.from(JSON.stringify({ error: 'Auction not available' }), 'utf-8');
    }

    const auction = auctions[item];
    if (!auction.highestBid || amount > auction.highestBid.amount) {
      auction.highestBid = { bidder, amount };
      console.log(`${bidder} makes bid for ${item}: ${amount} USDt`);

      await notifyPeers('newBid', { item, bidder, amount });
    }

    return Buffer.from(JSON.stringify({ status: 'Bid placed', item, amount }), 'utf-8');
  });

  // Handler for closing the auction
  rpcServer.respond('closeAuction', async (rawRequest) => {
    const request = JSON.parse(rawRequest.toString());
    const { item, clientName } = request;

    if (!auctions[item] || auctions[item].closed) {
      return Buffer.from(JSON.stringify({ error: 'Auction not available or already closed' }), 'utf-8');
    }

    auctions[item].closed = true;
    const winner = auctions[item].highestBid ? auctions[item].highestBid.bidder : 'No Winner';
    const amount = auctions[item].highestBid ? auctions[item].highestBid.amount : 0;

    console.log(`${clientName} closes auction ${item}. Winner: ${winner}, Amount: ${amount} USDt`);

    await notifyPeers('auctionClosed', { item, winner, amount, clientName });

    return Buffer.from(
      JSON.stringify({ status: 'Auction closed', winner, amount }),
      'utf-8'
    );
  });

  rpcServer.respond('newAuction', async (rawData) => {
    const data = JSON.parse(rawData.toString());
    console.log(`${data.clientName} opens auction: sell ${data.item} for ${data.price} USDt`);
    return Buffer.from('OK');
  });

  rpcServer.respond('newBid', async (rawData) => {
    const data = JSON.parse(rawData.toString());
    console.log(`${data.clientName} makes bid for ${data.item}: ${data.amount} USDt`);
    return Buffer.from('OK');
  });

  rpcServer.respond('auctionClosed', async (rawData) => {
    const data = JSON.parse(rawData.toString());
    console.log(`${data.clientName} closes auction ${data.item}. Winner: ${data.winner} with ${data.amount} USDt`);
    return Buffer.from('OK');
  });

  await rpcServer.listen();
  console.log(`RPC server running with public key: ${rpcServer.publicKey.toString('hex')}`);
};

main().catch(console.error);
