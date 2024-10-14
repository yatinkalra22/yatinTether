# P2P Auction System

This is a decentralized peer-to-peer (P2P) auction system built using Hyperswarm RPC and Hypercore. Each client acts as an independent entity, creating, bidding, and managing auctions. The server facilitates the auction and ensures that all events are broadcast to the peers.

## Features

- **Create Auctions**: Any client can create an auction for an item and set a starting price.
- **Place Bids**: Clients can place bids on active auctions.
- **Close Auctions**: Only the auction creator can close an auction.
- **Winner Declaration**: The client with the highest bid at the time of closing wins the auction.
- **Event Broadcasting**: Auction events like new bids or auction creation are broadcast to all connected peers.

## Requirements

- Node.js (version 14.x or higher)

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd yatinTether
   ```
2. Install the required dependencies:
   ```bash
   npm install
   ```

## Starting the Server

The server must be started first to bootstrap the system and allow peers to join.

    node server.js

The server will print out a public key that clients need to connect to.

## Starting the Client

You can start multiple clients to participate in the auction. Each client will join the network and can create, bid, and close auctions.

1. Start a client by running:

   ```bash
   node client.js

   ```

2. You will be prompted to enter a unique client name and the server's public key (which was printed by the server when it started).

3. After connecting, the client can choose to:

- Open a new auction.
- Place a bid on an existing auction.
- Close an auction (only the auction owner can close it).

Running Multiple Clients
You can start multiple clients simultaneously by running the above command (node client.js) in separate terminal windows. Each client can interact with the auction system independently.

## Auction Process

- Opening an Auction: Any client can open an auction by specifying an item and a starting price. The event will be broadcast to the server and peers.
- Placing Bids: Clients can place bids on any open auction. Only bids higher than the current highest bid are accepted.
- Closing an Auction: Only the auction creator can close their auction. When the auction is closed, the client with the highest bid wins.
- Event Broadcasting: All actions (creating an auction, placing a bid, or closing an auction) are broadcast to all clients. Events are logged on the server as well.

## Known Issue

- Closed Channel Issue: There is a known issue where clients may receive a CHANNEL_CLOSED error when listening for auction events (such as new bids or auction creation). This happens even when the channel is expected to be active. As a result, clients sometimes fail to display new events, although they still participate in the auction.
- Workaround: While the server correctly logs all events, clients may need to be restarted or reconnected if they experience the CHANNEL_CLOSED issue. Debugging and improvement are in progress.

## Auction Ownership

- Only the client that created an auction can close it.
- Auction owners can bid on their own items.
- The winner is declared when the auction is closed, and the client with the highest bid wins the item.
