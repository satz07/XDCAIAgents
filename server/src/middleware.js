import { ethers } from "ethers";
import {
  buildPaymentRequired,
  encodePaymentHeader,
  parsePaymentHeader,
  verifyUsdcPayment,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
} from "@xdc-x402/shared";

const paidCache = new Map();

export function createX402Middleware({ payTo, priceUsdc, demoMode, provider, networkConfig }) {
  const usdcAddress = process.env.USDC_ADDRESS || networkConfig.usdcAddress;
  const decimals = Number(process.env.USDC_DECIMALS || networkConfig.usdcDecimals);
  return async function x402Middleware(req, res, next) {
    const resource = `${req.method} ${req.originalUrl}`;
    const cacheKey = `${resource}:${req.ip}`;

  if (paidCache.has(cacheKey)) {
      const cached = paidCache.get(cacheKey);
      if (Date.now() - cached.at < 5 * 60 * 1000) {
        res.setHeader(X_PAYMENT_RESPONSE_HEADER, encodePaymentHeader(cached.proof));
        return next();
      }
      paidCache.delete(cacheKey);
    }

    const paymentHeader = req.headers[X_PAYMENT_HEADER];
    if (!paymentHeader) {
      const body = buildPaymentRequired({
        payTo,
        amountUsdc: priceUsdc,
        resource,
        description: "FX exchange rate lookup (pay-per-use)",
        networkConfig,
      });
      return res.status(402).json(body);
    }

    const payload = parsePaymentHeader(paymentHeader);
    if (!payload?.txHash) {
      return res.status(402).json({
        error: "Invalid payment header — expected { txHash, network, scheme }",
      });
    }

    try {
      const expectedAmount = ethers.parseUnits(String(priceUsdc), decimals);
      const proof = await verifyUsdcPayment({
        provider,
        txHash: payload.txHash,
        expectedPayTo: payTo,
        expectedAmountAtomic: expectedAmount.toString(),
        usdcAddress,
        demoMode: demoMode || payload.txHash === "demo-tx",
      });

      const responseProof = {
        success: true,
        txHash: proof.txHash,
        payer: proof.payer,
        amount: proof.amount,
        network: networkConfig.caip2,
      };
      paidCache.set(cacheKey, { at: Date.now(), proof: responseProof });
      res.setHeader(X_PAYMENT_RESPONSE_HEADER, encodePaymentHeader(responseProof));
      next();
    } catch (err) {
      return res.status(402).json({
        error: "Payment verification failed",
        message: err.message,
        retry: true,
      });
    }
  };
}
