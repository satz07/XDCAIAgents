import { ethers } from "ethers";
import {
  encodePaymentHeader,
  getExplorerTxUrl,
  getNetworkConfig,
  normalizeAddress,
  splitPayment,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
} from "@xdc-x402/shared";
import { safeJson } from "./safe-json.js";
import { transferUsdc } from "./usdc.js";
import { recordTransaction } from "./transactions.js";

const network = () => getNetworkConfig();

/**
 * x402 fetch with marketplace commission split:
 * provider gets (100% - commission), platform gets commission (default 0.5%)
 */
export async function fetchMarketplaceX402(url, { wallet, demoMode, onPayment, method = "GET", body = null }) {
  const init = {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  let res = await fetch(url, init);

  if (res.status !== 402) {
    const parsed = await res.text().then((t) => {
      try {
        return JSON.parse(t);
      } catch {
        return { error: t.slice(0, 80) };
      }
    });
    return { res, body: parsed, paid: false, payment: null };
  }

  const paymentRequired = await safeJson(res);
  const accept = paymentRequired.accepts?.[0];
  const extra = accept?.extra || {};
  const amountUsdc = ethers.formatUnits(accept.maxAmountRequired, network().usdcDecimals);
  const providerWallet = extra.providerWallet || accept.payTo;
  const platformWallet = extra.platformWallet || process.env.PLATFORM_COMMISSION_WALLET;
  const commissionRate = extra.commissionRate || Number(process.env.PLATFORM_COMMISSION_RATE || 0.005);
  const { provider: providerAmount, commission } = splitPayment(amountUsdc, commissionRate);

  onPayment?.({
    step: "payment_required",
    amountUsdc,
    providerAmount,
    commission,
    providerWallet,
    platformWallet,
    marketplace: true,
  });

  let txHash;
  let commissionTxHash;

  if (demoMode || !wallet) {
    txHash = "demo-tx";
    commissionTxHash = "demo-tx";
    onPayment?.({ step: "demo_payment", txHash, amountUsdc });
  } else {
    const tx1 = await transferUsdc(wallet, providerWallet, providerAmount);
    const tx2 = await transferUsdc(wallet, platformWallet, commission);
    txHash = tx1.txHash;
    commissionTxHash = tx2.txHash;
    recordTransaction({
      type: "marketplace_payment",
      txHash,
      commissionTxHash,
      amountUsdc,
      providerAmount,
      commission,
      from: wallet.address,
      to: normalizeAddress(providerWallet),
      description: url,
    });
    onPayment?.({
      step: "paid",
      txHash,
      commissionTxHash,
      amountUsdc,
      providerAmount,
      commission,
      explorer: getExplorerTxUrl(txHash),
    });
  }

  const paymentPayload = {
    scheme: "exact",
    network: accept.network || network().caip2,
    txHash,
    commissionTxHash,
    marketplace: true,
  };

  res = await fetch(url, {
    ...init,
    headers: { ...init.headers, [X_PAYMENT_HEADER]: encodePaymentHeader(paymentPayload) },
  });

  const responseBody = await safeJson(res);
  const explorerUrl = txHash && txHash !== "demo-tx" ? getExplorerTxUrl(txHash) : null;

  return {
    res,
    body: responseBody,
    paid: true,
    payment: {
      txHash,
      commissionTxHash,
      amountUsdc,
      providerAmount,
      commission,
      explorerUrl,
      marketplace: true,
    },
  };
}
