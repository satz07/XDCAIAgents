import { ethers } from "ethers";
import {
  ERC20_ABI,
  getExplorerTxUrl,
  getNetworkConfig,
} from "@xdc-x402/shared";

const sessionTxs = [];

export function recordTransaction(tx) {
  const entry = {
    ...tx,
    id: `${tx.txHash}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    explorerUrl: tx.txHash && tx.txHash !== "demo-tx" ? getExplorerTxUrl(tx.txHash) : null,
  };
  sessionTxs.unshift(entry);
  if (sessionTxs.length > 50) sessionTxs.pop();
  return entry;
}

export function getSessionTransactions() {
  return [...sessionTxs];
}

/**
 * Fetch recent on-chain USDC transfers for agent and receiver wallets.
 */
export async function fetchOnChainTransactions(provider, { agentAddress, receiverAddress, limit = 10 }) {
  const network = getNetworkConfig();
  const usdcAddr = process.env.USDC_ADDRESS || network.usdcAddress;
  const decimals = Number(process.env.USDC_DECIMALS || network.usdcDecimals);
  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, provider);

  const addresses = [agentAddress, receiverAddress].filter(Boolean);
  if (!addresses.length) return [];

  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 50_000);

  const allLogs = [];
  for (const addr of addresses) {
    const sent = await usdc.queryFilter(usdc.filters.Transfer(addr, null), fromBlock, currentBlock);
    const received = await usdc.queryFilter(usdc.filters.Transfer(null, addr), fromBlock, currentBlock);
    allLogs.push(...sent, ...received);
  }

  const unique = new Map();
  for (const log of allLogs) {
    if (unique.has(log.transactionHash)) continue;
    const parsed = usdc.interface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) continue;

    const from = parsed.args.from.toLowerCase();
    const to = parsed.args.to.toLowerCase();
    const amount = ethers.formatUnits(parsed.args.value, decimals);

    let type = "transfer";
    if (receiverAddress && to === receiverAddress.toLowerCase()) type = "x402_payment";
    else if (agentAddress && from === agentAddress.toLowerCase()) type = "outgoing";

    unique.set(log.transactionHash, {
      txHash: log.transactionHash,
      type,
      from: parsed.args.from,
      to: parsed.args.to,
      amountUsdc: amount,
      blockNumber: log.blockNumber,
      timestamp: null,
      explorerUrl: getExplorerTxUrl(log.transactionHash),
      source: "on-chain",
    });
  }

  const txs = [...unique.values()]
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .slice(0, limit);

  for (const tx of txs) {
    try {
      const block = await provider.getBlock(tx.blockNumber);
      tx.timestamp = block ? new Date(block.timestamp * 1000).toISOString() : null;
    } catch {
      /* ignore */
    }
  }

  return txs;
}

export async function getAllTransactions(provider, { agentAddress, receiverAddress }) {
  const onChain = await fetchOnChainTransactions(provider, { agentAddress, receiverAddress });
  const session = getSessionTransactions();

  const seen = new Set(onChain.map((t) => t.txHash));
  const merged = [...onChain];
  for (const tx of session) {
    if (tx.txHash && !seen.has(tx.txHash)) merged.push(tx);
  }

  return merged
    .sort((a, b) => {
      const ta = a.timestamp || "";
      const tb = b.timestamp || "";
      return tb.localeCompare(ta);
    })
    .slice(0, 20);
}
