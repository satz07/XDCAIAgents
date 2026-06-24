import { ethers } from "ethers";
import { ERC20_ABI, XDC_MAINNET } from "@xdc-x402/shared";

function balanceTimeoutMs() {
  return Number(process.env.BALANCE_RPC_TIMEOUT_MS || 30_000);
}

export function withTimeout(promise, ms, label = "RPC") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out (${ms}ms)`)), ms);
    }),
  ]);
}

export function loadWallet() {
  const key = process.env.AGENT_PRIVATE_KEY;
  const rpc = process.env.XDC_RPC_URL || XDC_MAINNET.rpcUrl;
  const chainId = Number(process.env.CHAIN_ID || XDC_MAINNET.chainId);
  const provider = new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });

  if (!key) {
    return { provider, wallet: null, demoMode: true };
  }

  const wallet = new ethers.Wallet(key, provider);
  return { provider, wallet, demoMode: false };
}

async function readBalance(provider, address, usdcAddr, decimals, timeoutMs) {
  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, provider);
  const bal = await withTimeout(usdc.balanceOf(address), timeoutMs, "USDC balance");
  return {
    raw: bal.toString(),
    formatted: ethers.formatUnits(bal, decimals),
    address,
  };
}

export async function getUsdcBalanceForAddress(provider, address) {
  const usdcAddr = process.env.USDC_ADDRESS || XDC_MAINNET.usdcAddress;
  const decimals = Number(process.env.USDC_DECIMALS || XDC_MAINNET.usdcDecimals);
  const chainId = Number(process.env.CHAIN_ID || XDC_MAINNET.chainId);
  const rpc = process.env.XDC_RPC_URL || XDC_MAINNET.rpcUrl;
  const fallback = process.env.XDC_RPC_FALLBACK_URL;
  const timeoutMs = balanceTimeoutMs();
  const t0 = Date.now();
  console.log(`[agent] balanceOf start ${shortAddr(address)} via ${rpc} timeout=${timeoutMs}ms`);

  try {
    const result = await readBalance(provider, address, usdcAddr, decimals, timeoutMs);
    console.log(`[agent] balanceOf ok ${shortAddr(address)} = ${result.formatted} USDC (${Date.now() - t0}ms)`);
    return result;
  } catch (err) {
    if (fallback && fallback !== rpc) {
      console.warn(`[agent] balanceOf retry via fallback ${fallback}`);
      try {
        const fallbackProvider = new ethers.JsonRpcProvider(fallback, chainId, { staticNetwork: true });
        const result = await readBalance(fallbackProvider, address, usdcAddr, decimals, timeoutMs);
        console.log(`[agent] balanceOf ok (fallback) ${shortAddr(address)} = ${result.formatted} USDC (${Date.now() - t0}ms)`);
        return result;
      } catch (fallbackErr) {
        console.error(`[agent] balanceOf fallback fail (${Date.now() - t0}ms):`, fallbackErr.message);
      }
    }
    console.error(`[agent] balanceOf fail ${shortAddr(address)} (${Date.now() - t0}ms):`, err.message);
    throw err;
  }
}

function shortAddr(addr) {
  if (!addr) return "?";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function fetchUsdcBalances(provider, { agentAddress, receiverAddress }) {
  const balances = { agent: null, receiver: null };
  if (!provider) return balances;

  const tasks = [];
  if (agentAddress) {
    tasks.push(
      getUsdcBalanceForAddress(provider, agentAddress)
        .then((b) => {
          balances.agent = b;
        })
        .catch((e) => {
          balances.agent = { error: e.message, address: agentAddress };
        })
    );
  }
  if (receiverAddress) {
    tasks.push(
      getUsdcBalanceForAddress(provider, receiverAddress)
        .then((b) => {
          balances.receiver = b;
        })
        .catch((e) => {
          balances.receiver = { error: e.message, address: receiverAddress };
        })
    );
  }
  await Promise.all(tasks);
  return balances;
}

export async function getUsdcBalance(walletOrProvider, address) {
  if (address) {
    const provider = walletOrProvider.provider ?? walletOrProvider;
    return getUsdcBalanceForAddress(provider, address);
  }
  return getUsdcBalanceForAddress(walletOrProvider.provider, walletOrProvider.address);
}
