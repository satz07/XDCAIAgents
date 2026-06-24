import { ethers } from "ethers";
import {
  ERC20_ABI,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  XDC_MAINNET,
  getNetworkConfig,
} from "./constants.js";

/**
 * Build x402-style 402 Payment Required body (inspired by Coinbase x402 spec).
 */
export function buildPaymentRequired({
  payTo,
  amountUsdc,
  resource,
  description,
  networkConfig = getNetworkConfig(),
  extra: extraFields = {},
}) {
  const usdcAddress = process.env.USDC_ADDRESS || networkConfig.usdcAddress;
  const decimals = Number(process.env.USDC_DECIMALS || networkConfig.usdcDecimals);
  const amountAtomic = ethers.parseUnits(String(amountUsdc), decimals).toString();
  return {
    x402Version: 1,
    error: "Payment Required",
    accepts: [
      {
        scheme: "exact",
        network: networkConfig.caip2,
        maxAmountRequired: amountAtomic,
        resource,
        description,
        mimeType: "application/json",
        payTo,
        maxTimeoutSeconds: 300,
        asset: usdcAddress,
        extra: {
          name: "USDC",
          version: "1",
          chainId: networkConfig.chainId,
          ...extraFields,
        },
      },
    ],
  };
}

export function parsePaymentHeader(headerValue) {
  if (!headerValue) return null;
  try {
    const decoded = Buffer.from(headerValue, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    try {
      return JSON.parse(headerValue);
    } catch {
      return null;
    }
  }
}

export function encodePaymentHeader(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Verify an on-chain USDC transfer matches the payment requirement.
 */
export async function verifyUsdcPayment({
  provider,
  txHash,
  expectedPayTo,
  expectedAmountAtomic,
  usdcAddress = XDC_MAINNET.usdcAddress,
  demoMode = false,
}) {
  if (demoMode) {
    return {
      valid: true,
      txHash: txHash || "demo-tx",
      payer: "0xDemoMode",
      amount: expectedAmountAtomic,
    };
  }

  let receipt = null;
  for (let i = 0; i < 15; i++) {
    receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction not found or failed");
  }

  const iface = new ethers.Interface(ERC20_ABI);
  const usdc = usdcAddress.toLowerCase();
  const payTo = normalizeAddress(expectedPayTo);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== usdc) continue;
    let parsed;
    try {
      parsed = iface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (parsed?.name !== "Transfer") continue;

    const to = normalizeAddress(parsed.args.to);
    const value = parsed.args.value;
    if (to === payTo && value >= BigInt(expectedAmountAtomic)) {
      return {
        valid: true,
        txHash,
        payer: parsed.args.from,
        amount: value.toString(),
        blockNumber: receipt.blockNumber,
      };
    }
  }

  throw new Error("No matching USDC transfer found in transaction");
}

export function normalizeAddress(addr) {
  if (!addr) return "";
  const a = addr.startsWith("xdc") ? "0x" + addr.slice(3) : addr;
  return ethers.getAddress(a).toLowerCase();
}

export { X_PAYMENT_HEADER, X_PAYMENT_RESPONSE_HEADER };
