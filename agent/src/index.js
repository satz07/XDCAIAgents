import "./env.js";
import cors from "cors";
import express from "express";
import { runAgent, getAgentMeta, getBalances } from "./agent.js";
import { safeJson } from "./safe-json.js";
import { runMarketplaceAgent } from "./marketplace.js";
import { parseIntent } from "./parser.js";
import { loadWallet } from "./wallet.js";
import { getAllTransactions } from "./transactions.js";
import { friendlyPaymentError } from "./errors.js";

const PORT = Number(process.env.AGENT_PORT || 3005);
const HOST = process.env.HOST || "0.0.0.0";
const DEMO_MODE = process.env.DEMO_MODE === "true" || !process.env.AGENT_PRIVATE_KEY;

const { wallet, provider } = loadWallet();

console.log(
  `[agent] config rpc=${process.env.XDC_RPC_URL} timeout=${process.env.BALANCE_RPC_TIMEOUT_MS || 30000}ms chain=${process.env.CHAIN_ID}`
);

const pending = new Map();
const marketplacePending = new Map();
const sessionContext = new Map();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json(getAgentMeta(wallet, DEMO_MODE));
});

app.get("/balances", async (_req, res) => {
  const t0 = Date.now();
  console.log("[agent] GET /balances");
  try {
    const balances = await getBalances(wallet, provider);
    console.log(`[agent] GET /balances ok (${Date.now() - t0}ms)`, balances);
    res.json(balances);
  } catch (err) {
    console.error(`[agent] GET /balances error (${Date.now() - t0}ms):`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/transactions", async (_req, res) => {
  try {
    const txs = await getAllTransactions(provider, {
      agentAddress: wallet?.address,
      receiverAddress: process.env.PAY_TO_ADDRESS,
    });
    const status = await getAgentMeta(wallet, DEMO_MODE);
    res.json({ transactions: txs, explorerUrl: status.explorerUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat", async (req, res) => {
  const t0 = Date.now();
  try {
    const { message, sessionId = "default", confirm = false } = req.body;
    console.log(`[agent] POST /chat`, { message: message?.slice(0, 60), sessionId, confirm });
    if (!message?.trim()) {
      return res.status(400).json({ error: "message required" });
    }

    const isConfirm = confirm || /^\s*yes\s*$/i.test(message);
    let effectiveMessage = message;

    if (isConfirm && pending.has(sessionId)) {
      effectiveMessage = pending.get(sessionId);
    } else if (!isConfirm) {
      pending.delete(sessionId);
    }

    const result = await runAgent(effectiveMessage, {
      wallet,
      demoMode: DEMO_MODE,
      confirm: isConfirm,
    });

    if (result.needsConfirmation && result.pending) {
      pending.set(sessionId, effectiveMessage);
    } else {
      pending.delete(sessionId);
    }

    console.log(`[agent] POST /chat ok (${Date.now() - t0}ms)`);
    res.json({ ...result });
  } catch (err) {
    console.error(`[agent] POST /chat error (${Date.now() - t0}ms):`, err);
    res.status(500).json({ error: friendlyPaymentError(err) });
  }
});

app.get("/marketplace/providers", async (_req, res) => {
  try {
    const base = process.env.MARKETPLACE_API_URL || process.env.FX_API_URL || "http://localhost:4021";
    const r = await fetch(`${base}/marketplace/providers`);
    if (!r.ok) throw new Error(`Marketplace server error ${r.status} — is FX API running on :4021?`);
    res.json(await safeJson(r));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/marketplace/chat", async (req, res) => {
  const t0 = Date.now();
  try {
    const { message, sessionId = "default", confirm = false } = req.body;
    console.log(`[agent] POST /marketplace/chat`, { message: message?.slice(0, 60), sessionId, confirm });
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    const isConfirm = confirm || /^\s*yes\s*$/i.test(message);
    let effectiveMessage = message;

    if (isConfirm && marketplacePending.has(sessionId)) {
      effectiveMessage = marketplacePending.get(sessionId);
    } else if (!isConfirm) {
      marketplacePending.delete(sessionId);
    }

    const steps = [];
    const intent = await parseIntent(effectiveMessage, "marketplace");
    steps.push({ type: "intent", data: intent });

    if (intent.action === "chat" && !isConfirm) {
      return res.json({ reply: intent.reply, steps, payment: null });
    }

    const ctx = sessionContext.get(sessionId) || {};
    const result = await runMarketplaceAgent(intent, {
      wallet,
      demoMode: DEMO_MODE,
      confirm: isConfirm,
      sessionContext: ctx,
      onPayment: (ev) => steps.push({ type: "x402", ...ev }),
    });

    if (result.sessionContext) {
      sessionContext.set(sessionId, { ...ctx, ...result.sessionContext });
    }

    if (result.needsConfirmation && result.pending) {
      marketplacePending.set(sessionId, effectiveMessage);
    } else {
      marketplacePending.delete(sessionId);
    }

    console.log(`[agent] POST /marketplace/chat ok (${Date.now() - t0}ms)`);
    res.json({ ...result, steps });
  } catch (err) {
    console.error(`[agent] POST /marketplace/chat error (${Date.now() - t0}ms):`, err);
    res.status(500).json({ error: friendlyPaymentError(err) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n  AI Agent API → http://${HOST}:${PORT}`);
  console.log(`  Demo mode: ${DEMO_MODE}`);
  console.log(`  Wallet: ${wallet?.address || "(none)"}\n`);
});
