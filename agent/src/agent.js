import { ethers } from "ethers";
import { getExplorerTxUrl, getNetworkConfig, normalizeAddress } from "@xdc-x402/shared";
import { parseIntent } from "./parser.js";
import { fetchWithX402 } from "./x402-client.js";
import { transferUsdc } from "./usdc.js";
import { fetchUsdcBalances } from "./wallet.js";
import { recordTransaction } from "./transactions.js";

const FX_API = process.env.FX_API_URL || "http://localhost:4021";
const PRICE = process.env.FX_PRICE_USDC || "0.1";
const MAX_TRANSFER = Number(process.env.MAX_TRANSFER_USDC || 100);

export async function runAgent(message, { wallet, demoMode, confirm = false }) {
  const steps = [];
  const intent = await parseIntent(message);
  steps.push({ type: "intent", data: intent });

  if (intent.action === "chat") {
    return {
      reply: intent.reply,
      steps,
      needsConfirmation: false,
    };
  }

  if (intent.action === "fx_rate") {
    const pair = intent.pair.replace("/", "-");
    const url = `${FX_API}/fx/${pair}`;
    steps.push({ type: "api_call", url, priceUsdc: PRICE });

    const result = await fetchWithX402(url, {
      wallet,
      demoMode,
      onPayment: (ev) => steps.push({ type: "x402", ...ev }),
    });

    if (!result.res.ok) {
      return {
        reply: `FX API error: ${result.body?.message || result.body?.error || result.res.status}`,
        steps,
        needsConfirmation: false,
      };
    }

    const { pair: p, rate, date, source } = result.body;
    const paidNote = result.paid
      ? ` (paid ${result.payment.amountUsdc} USDC${result.payment.txHash ? `, tx ${result.payment.txHash.slice(0, 10)}…` : ""})`
      : "";

    return {
      reply: `The ${p} exchange rate is **${rate}** as of ${date} (source: ${source})${paidNote}.`,
      steps,
      data: result.body,
      payment: result.payment,
      needsConfirmation: false,
    };
  }

  if (intent.action === "transfer") {
    const { amount, to } = intent;
    if (amount <= 0 || amount > MAX_TRANSFER) {
      return {
        reply: `Amount must be between 0 and ${MAX_TRANSFER} USDC.`,
        steps,
        needsConfirmation: false,
      };
    }

    const summary = {
      action: "transfer",
      to: normalizeAddress(to),
      amount,
      gas: "~0.01 XDC",
    };
    steps.push({ type: "transfer_preview", data: summary });

    if (!confirm) {
      return {
        reply: `Send **${amount} USDC** to \`${summary.to}\`?\nGas: ~0.01 XDC (legacy tx)\n\nReply **yes** to confirm.`,
        steps,
        needsConfirmation: true,
        pending: summary,
      };
    }

    if (demoMode || !wallet) {
      steps.push({ type: "demo_transfer", data: summary });
      return {
        reply: `Demo mode: would send ${amount} USDC to ${summary.to}. Set AGENT_PRIVATE_KEY for live transfers.`,
        steps,
        needsConfirmation: false,
      };
    }

    const tx = await transferUsdc(wallet, summary.to, amount);
    const explorer = getExplorerTxUrl(tx.txHash);
    recordTransaction({
      type: "transfer",
      txHash: tx.txHash,
      amountUsdc: String(amount),
      from: wallet.address,
      to: summary.to,
      blockNumber: tx.blockNumber,
      description: `USDC transfer to ${summary.to}`,
    });
    steps.push({ type: "transfer_complete", data: { ...tx, explorer } });
    return {
      reply: `Sent **${amount} USDC** to \`${summary.to}\`.\nTx: [${tx.txHash}](${explorer})\nBlock: ${tx.blockNumber}`,
      steps,
      needsConfirmation: false,
      payment: { ...tx, explorerUrl: explorer },
    };
  }

  return { reply: "Unknown action.", steps, needsConfirmation: false };
}

export function getAgentMeta(wallet, demoMode) {
  const chainId = Number(process.env.CHAIN_ID || 50);
  const receiverAddress = process.env.PAY_TO_ADDRESS || null;
  const net = getNetworkConfig(chainId);
  return {
    demoMode,
    fxApiUrl: FX_API,
    pricePerRequest: PRICE,
    chainId,
    network: chainId === 51 ? "XDC Apothem (eip155:51)" : "XDC Mainnet (eip155:50)",
    explorerUrl: net.explorerUrl,
    walletAddress: wallet?.address || null,
    receiverAddress,
  };
}

export async function getBalances(wallet, provider) {
  const rpc = provider ?? wallet?.provider;
  return fetchUsdcBalances(rpc, {
    agentAddress: wallet?.address,
    receiverAddress: process.env.PAY_TO_ADDRESS || null,
  });
}

export async function getAgentStatus(wallet, demoMode, provider) {
  const meta = getAgentMeta(wallet, demoMode);
  const balances = await getBalances(wallet, provider);
  return { ...meta, balances };
}
