import "./env.js";
import cors from "cors";
import express from "express";
import { ethers } from "ethers";
import { getNetworkConfig, XDC_MAINNET } from "@xdc-x402/shared";
import { createX402Middleware } from "./middleware.js";
import { createMarketplaceRouter } from "./marketplace/router.js";
import { getFxRate, listSupportedPairs } from "./fx.js";

const PORT = Number(process.env.FX_API_PORT || 4021);
const HOST = process.env.HOST || "0.0.0.0";
const PAY_TO = process.env.PAY_TO_ADDRESS;
const PRICE = process.env.FX_PRICE_USDC || "0.1";
const DEMO_MODE = process.env.DEMO_MODE === "true";
const CHAIN_ID = Number(process.env.CHAIN_ID || XDC_MAINNET.chainId);
const network = getNetworkConfig(CHAIN_ID);
const RPC = process.env.XDC_RPC_URL || network.rpcUrl;

if (!PAY_TO && !DEMO_MODE) {
  console.error("Set PAY_TO_ADDRESS or enable DEMO_MODE=true");
  process.exit(1);
}

const payTo = PAY_TO || "0x0000000000000000000000000000000000000001";
const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);

const app = express();
app.use(cors());
app.use(express.json());

const x402 = createX402Middleware({
  payTo,
  priceUsdc: PRICE,
  demoMode: DEMO_MODE,
  provider,
  networkConfig: network,
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "x402-fx-api",
    network: network.caip2,
    chainId: CHAIN_ID,
    usdcAddress: process.env.USDC_ADDRESS || network.usdcAddress,
    priceUsdc: PRICE,
    payTo,
    demoMode: DEMO_MODE,
  });
});

app.use("/marketplace", createMarketplaceRouter({ provider, networkConfig: network, demoMode: DEMO_MODE }));

app.get("/pairs", (_req, res) => {
  res.json({ pairs: listSupportedPairs(), priceUsdc: PRICE });
});

app.get("/fx/:pair", x402, async (req, res) => {
  try {
    const pair = req.params.pair.replace("-", "/");
    const data = await getFxRate(pair);
    res.json({
      ...data,
      paid: true,
      priceUsdc: PRICE,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/fx", x402, async (req, res) => {
  try {
    const pair = req.query.pair || "USD/EUR";
    const data = await getFxRate(String(pair));
    res.json({
      ...data,
      paid: true,
      priceUsdc: PRICE,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n  FX API (x402) → http://${HOST}:${PORT}`);
  console.log(`  Price: ${PRICE} USDC per request`);
  console.log(`  Pay to: ${payTo}`);
  console.log(`  Demo mode: ${DEMO_MODE}\n`);
});
