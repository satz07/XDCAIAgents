import { ethers } from "ethers";
import {
  encodePaymentHeader,
  getExplorerTxUrl,
  getNetworkConfig,
  normalizeAddress,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
} from "@xdc-x402/shared";
import { transferUsdc } from "./usdc.js";
import { recordTransaction } from "./transactions.js";

const network = () => getNetworkConfig();

/**
 * Fetch a URL; if 402, pay USDC on XDC and retry with payment proof.
 */
export async function fetchWithX402(url, { wallet, demoMode, onPayment }) {
  const init = { method: "GET", headers: { Accept: "application/json" } };
  let res = await fetch(url, init);

  if (res.status !== 402) {
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return { res, body, paid: false, payment: null };
  }

  const paymentRequired = await res.json();
  const accept = paymentRequired.accepts?.[0];
  if (!accept) throw new Error("402 response missing payment accepts");

  const amountUsdc = ethers.formatUnits(accept.maxAmountRequired, network().usdcDecimals);
  const payTo = accept.payTo;

  onPayment?.({
    step: "payment_required",
    amountUsdc,
    payTo,
    network: accept.network,
    resource: accept.resource,
  });

  let txHash;

  if (demoMode || !wallet) {
    txHash = "demo-tx";
    onPayment?.({ step: "demo_payment", txHash, amountUsdc, payTo });
  } else {
    const result = await transferUsdc(wallet, payTo, amountUsdc);
    txHash = result.txHash;
    const explorer = getExplorerTxUrl(txHash);
    recordTransaction({
      type: "x402_payment",
      txHash,
      amountUsdc,
      from: wallet.address,
      to: normalizeAddress(payTo),
      blockNumber: result.blockNumber,
      description: accept.resource || url,
    });
    onPayment?.({
      step: "paid",
      txHash,
      amountUsdc,
      payTo: normalizeAddress(payTo),
      blockNumber: result.blockNumber,
      explorer,
    });
  }

  const paymentPayload = {
    scheme: "exact",
    network: accept.network || network().caip2,
    txHash,
  };

  res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      [X_PAYMENT_HEADER]: encodePaymentHeader(paymentPayload),
    },
  });

  const paymentResponseHeader = res.headers.get(X_PAYMENT_RESPONSE_HEADER);
  let paymentProof = null;
  if (paymentResponseHeader) {
    try {
      paymentProof = JSON.parse(
        Buffer.from(paymentResponseHeader, "base64").toString("utf8")
      );
    } catch {
      paymentProof = null;
    }
  }

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  const explorerUrl =
    txHash && txHash !== "demo-tx" ? getExplorerTxUrl(txHash) : null;

  return {
    res,
    body,
    paid: true,
    payment: { txHash, amountUsdc, payTo, proof: paymentProof, explorerUrl },
  };
}
