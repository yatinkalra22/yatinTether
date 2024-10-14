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

  const keyPair = DHT.keyPair(crypto.randomBytes(32));
  const dht = new DHT({
    keyPair,
    bootstrap: [{ host: '127.0.0.1', port: 30001 }],
  });

  const rpc = new RPC({ dht });
  const rpcServer = rpc.createServer();

  const peers = new Map(); 
  const auctions = {};
  const bids = {};

  const addPeer = (peerPublicKey) => {
    // Prevent adding the server itself as a peer
    if (peerPublicKey.equals(rpcServer.publicKey)) {
      console.log('Attempted to add self as peer. Ignoring.');
      return;
    }

    const peerHex = peerPublicKey.toString('hex');
    if (!peers.has(peerHex)) {
      peers.set(peerHex, { peerPublicKey, connected: true });
      console.log(`Peer added: ${peerHex}`);
    }
  };

  const notifyPeers = async (action, data, excludePeer = null) => {
    for (const [peerKey, { peerPublicKey, connected }] of peers.entries()) {
      if (excludePeer && peerKey === excludePeer.toString('hex')) continue;

      if (!connected) {
        console.warn(`Skipping peer ${peerKey} as the channel is closed`);
        continue;
      }

      try {
        await rpc.request(peerPublicKey, action, Buffer.from(JSON.stringify(data), 'utf-8'));
      } catch (error) {
        if (error.code === 'CHANNEL_CLOSED') {
          console.warn(`Failed to notify peer ${peerKey}: ${error.message}`);
          peers.delete(peerKey); // Remove the disconnected peer
        } else {
          console.error(`Error notifying peer ${peerKey}:`, error);
        }
      }
    }
  };

  rpcServer.respond('addPeer', async (rawRequest) => {
    const request = JSON.parse(rawRequest.toString());
    addPeer(Buffer.from(request.clientPublicKey, 'hex')); // Ensure the public key is added as a buffer
    return Buffer.from('OK');
  });

  // Handler for creating an auction
  rpcServer.respond('openAuction', async (rawRequest, peerPublicKey) => {
    const request = JSON.parse(rawRequest.toString());
    const { item, price, clientName } = request;

    if (auctions[item]) {
      return Buffer.from(JSON.stringify({ error: 'Auction for this item already exists' }), 'utf-8');
    }

    // Store auction details, including the creator's clientName
    auctions[item] = { price, highestBid: null, closed: false, creator: clientName };

    console.log(`${clientName} opens auction: sell ${item} for ${price} USDt`);

    await notifyPeers('newAuction', { item, price, clientName }, peerPublicKey);

    return Buffer.from(JSON.stringify({ status: 'Auction opened', item }), 'utf-8');
  });

  // Handler for making a bid
  rpcServer.respond('makeBid', async (rawRequest, peerPublicKey) => {
    const request = JSON.parse(rawRequest.toString());
    const { item, clientName, amount } = request;

    if (!auctions[item] || auctions[item].closed) {
      return Buffer.from(JSON.stringify({ error: 'Auction not available' }), 'utf-8');
    }

    const auction = auctions[item];
    if (!auction.highestBid || amount > auction.highestBid.amount) {
      auction.highestBid = { bidder: clientName, amount };
      console.log(`${clientName} makes bid for ${item}: ${amount} USDt`);

      await notifyPeers('newBid', { item, bidder: clientName, amount }, peerPublicKey);
    }

    return Buffer.from(JSON.stringify({ status: 'Bid placed', item, amount }), 'utf-8');
  });

  // Handler for closing the auction
  rpcServer.respond('closeAuction', async (rawRequest, peerPublicKey) => {
    const request = JSON.parse(rawRequest.toString());
    const { item, clientName } = request;

    if (!auctions[item] || auctions[item].closed) {
      return Buffer.from(JSON.stringify({ error: 'Auction not available or already closed' }), 'utf-8');
    }

    // Check if the client trying to close the auction is the creator
    if (auctions[item].creator !== clientName) {
      return Buffer.from(JSON.stringify({ error: 'Only the auction creator can close it' }), 'utf-8');
    }

    auctions[item].closed = true;
    const winner = auctions[item].highestBid ? auctions[item].highestBid.bidder : 'No Winner';
    const amount = auctions[item].highestBid ? auctions[item].highestBid.amount : 0;

    console.log(`${clientName} closes auction ${item}. Winner: ${winner}, Amount: ${amount} USDt`);

    await notifyPeers('auctionClosed', { item, winner, amount, clientName }, peerPublicKey);

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
