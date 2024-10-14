'use strict';

const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const readline = require('readline');
const crypto = require('crypto');

const main = async () => {
  // Generate a new key pair for the client
  const keyPair = DHT.keyPair(crypto.randomBytes(32));
  const dht = new DHT({
    keyPair,
    bootstrap: [{ host: '127.0.0.1', port: 30001 }],
  });

  const rpc = new RPC({ dht });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let serverPublicKey;
  let clientName;

  /**
   * Promisified question prompt.
   * @param {string} question - The question to ask the user.
   * @returns {Promise<string>} - The user's input.
   */
  const askQuestion = (question) => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  };

  /**
   * Initializes the client by asking for a unique name.
   */
  const initializeClient = async () => {
    clientName = await askQuestion("Enter your unique name (e.g., Client#1): ");
    console.log(`Welcome, ${clientName}!`);
  };

  /**
   * Prompts the user to input the server's public key.
   */
  const getServerPublicKey = async () => {
    const serverKeyInput = await askQuestion(
      "Step 1: Enter server public key: "
    );
    serverPublicKey = Buffer.from(serverKeyInput.trim(), "hex");
  };

  /**
   * Adds the client as a peer to the server.
   */
  const addClientAsPeer = async () => {
    const clientPublicKey = keyPair.publicKey;
    const payload = {
      clientName,
      clientPublicKey: clientPublicKey.toString("hex"),
    };
    await rpc.request(
      serverPublicKey,
      "addPeer",
      Buffer.from(JSON.stringify(payload))
    );
    console.log(`Client added as peer: ${clientPublicKey.toString("hex")}`);
  };

  /**
   * Starts listening for updates from peers.
   */
  const startListeningForUpdates = async () => {
    const listener = rpc.createServer();

    listener.respond("newAuction", async (rawData) => {
      const data = JSON.parse(rawData.toString());
      console.log(
        `\n[Update] ${data.clientName} opens auction: sell ${data.item} for ${data.price} USDt`
      );
      return Buffer.from("OK");
    });

    listener.respond("newBid", async (rawData) => {
      const data = JSON.parse(rawData.toString());
      console.log(
        `\n[Update] ${data.bidder} makes bid for ${data.item}: ${data.amount} USDt`
      );
      return Buffer.from("OK");
    });

    listener.respond("auctionClosed", async (rawData) => {
      const data = JSON.parse(rawData.toString());
      console.log(
        `\n[Update] ${data.clientName} closes auction ${data.item}. Winner: ${data.winner} with ${data.amount} USDt`
      );
      return Buffer.from("OK");
    });

    await listener.listen();
    console.log("Client is listening for updates from peers...");
  };

  /**
   * Prompts the user to choose an action.
   * @returns {Promise<string>} - The chosen action.
   */
  const getAction = async () => {
    const action = await askQuestion(
      "Step 2: Choose action (openAuction, makeBid, closeAuction): "
    );
    return action.trim();
  };

  /**
   * Gathers necessary details based on the chosen action.
   * @param {string} action - The chosen action.
   * @returns {Promise<object|null>} - The payload for the action or null if invalid.
   */
  const getDetailsForAction = async (action) => {
    let payload;
    switch (action) {
      case "openAuction":
        const item = await askQuestion("Enter item name: ");
        const price = await askQuestion("Enter starting price (USDt): ");
        if (isNaN(price) || Number(price) <= 0) {
          console.log("Invalid price. Please enter a positive number.");
          return null;
        }
        payload = { clientName, item, price: Number(price) };
        break;

      case "makeBid":
        const bidItem = await askQuestion("Enter item name to bid on: ");
        const amount = await askQuestion("Enter bid amount (USDt): ");
        if (isNaN(amount) || Number(amount) <= 0) {
          console.log("Invalid bid amount. Please enter a positive number.");
          return null;
        }
        payload = { clientName, item: bidItem, amount: Number(amount) };
        break;

      case "closeAuction":
        const closeItem = await askQuestion("Enter item name to close: ");
        payload = { clientName, item: closeItem };
        break;

      default:
        console.log("Unknown action. Please try again.");
        payload = null;
    }
    return payload;
  };

  /**
   * Sends a request to the server based on the chosen action.
   * @param {string} action - The chosen action.
   * @param {object} payload - The payload for the action.
   */
  const sendRequest = async (action, payload) => {
    try {
      const request = Buffer.from(JSON.stringify(payload), "utf-8");
      const response = await rpc.request(serverPublicKey, action, request);
      const responseData = JSON.parse(response.toString("utf-8"));

      if (responseData.error) {
        console.log(`Error: ${responseData.error}`);
      } else {
        console.log("Response:", responseData);
      }
    } catch (error) {
      console.error(`Error performing action "${action}":`, error.message);
    }
  };

  // Initialize the client
  await initializeClient();

  // Get the server's public key
  await getServerPublicKey();

  // Add the client as a peer to the server
  await addClientAsPeer();

  // Start listening for updates
  await startListeningForUpdates();

  // Main loop to handle user actions
  while (true) {
    const action = await getAction();

    if (["openAuction", "makeBid", "closeAuction"].includes(action)) {
      const payload = await getDetailsForAction(action);

      if (payload) {
        await sendRequest(action, payload);
      }
    } else {
      console.log("Invalid action. Please choose from the available options.");
    }
  }
};

main().catch(console.error);
