"use strict";

const RPC = require("@hyperswarm/rpc");
const DHT = require("hyperdht");
const readline = require("readline");
const crypto = require("crypto");

const main = async () => {
  const keyPair = DHT.keyPair(crypto.randomBytes(32));
  const dht = new DHT({
    keyPair,
    bootstrap: [{ host: "127.0.0.1", port: 30001 }],
  });

  const rpc = new RPC({ dht });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let serverPublicKey;
  let clientName;

  const askQuestion = (question) => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  };

  const initializeClient = async () => {
    clientName = await askQuestion("Enter your unique name (e.g., Client#1): ");
    console.log(`Welcome, ${clientName}!`);
  };

  const getServerPublicKey = async () => {
    const serverKeyInput = await askQuestion(
      "Step 1: Enter server public key: "
    );
    serverPublicKey = Buffer.from(serverKeyInput.trim(), "hex");
  };

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

  const startListeningForUpdates = async () => {
    const listener = rpc.createServer();

    listener.respond("newAuction", async (rawData) => {
      const data = JSON.parse(rawData.toString());
      console.log(
        `Client: ${data.clientName} opens auction: sell ${data.item} for ${data.price} USDt`
      );
      return Buffer.from("OK");
    });

    listener.respond("newBid", async (rawData) => {
      const data = JSON.parse(rawData.toString());
      console.log(
        `Client: ${data.clientName} makes bid for ${data.item}: ${data.amount} USDt`
      );
      return Buffer.from("OK");
    });

    listener.respond("auctionClosed", async (rawData) => {
      const data = JSON.parse(rawData.toString());
      console.log(
        `Client: ${data.clientName} closes auction ${data.item}. Winner: ${data.winner} with ${data.amount} USDt`
      );
      return Buffer.from("OK");
    });

    await listener.listen();
    console.log("Client is listening for updates from peers...");
  };

  const getAction = async () => {
    const action = await askQuestion(
      "Step 2: Choose action (openAuction, makeBid, closeAuction): "
    );
    return action.trim();
  };

  const getDetailsForAction = async (action) => {
    let payload;
    switch (action) {
      case "openAuction":
        const item = await askQuestion("Enter item name: ");
        const price = await askQuestion("Enter starting price (USDt): ");
        payload = { clientName, item, price: Number(price) };
        break;

      case "makeBid":
        const bidItem = await askQuestion("Enter item name to bid on: ");
        const amount = await askQuestion("Enter bid amount (USDt): ");
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

  const sendRequest = async (action, payload) => {
    try {
      const request = Buffer.from(JSON.stringify(payload), "utf-8");
      const response = await rpc.request(serverPublicKey, action, request);
      console.log("Response:", response.toString("utf-8"));
    } catch (error) {
      console.error(`Error performing action "${action}":`, error.message);
    }
  };

  await initializeClient();
  await getServerPublicKey();
  await addClientAsPeer();
  await startListeningForUpdates();

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
