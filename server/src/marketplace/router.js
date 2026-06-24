import { Router } from "express";
import { ethers } from "ethers";
import {
  buildPaymentRequired,
  encodePaymentHeader,
  getBuiltinProviders,
  parsePaymentHeader,
  splitPayment,
  verifyUsdcPayment,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
} from "@xdc-x402/shared";
import { bookFlight, resolveFlight, searchFlights } from "./travala.js";

export function createMarketplaceRouter({ provider, networkConfig, demoMode }) {
  const router = Router();
  const platformWallet = process.env.PLATFORM_COMMISSION_WALLET || process.env.PAY_TO_ADDRESS;
  const commissionRate = Number(process.env.PLATFORM_COMMISSION_RATE || 0.005);
  const travala = () => getBuiltinProviders().find((p) => p.id === "travala");
  const providerWallet = () => process.env.TRAVALA_WALLET || travala()?.wallet;

  router.get("/providers", (_req, res) => {
    const providers = getBuiltinProviders().map((p) => ({
      ...p,
      wallet: p.wallet ? `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}` : null,
      platformCommission: `${commissionRate * 100}%`,
    }));
    res.json({ providers, platformWallet, commissionRate });
  });

  router.get("/travala/flights/search", marketplacePaywall(process.env.TRAVALA_SEARCH_PRICE_USDC || "1.0", "Travala flight search"), async (req, res) => {
    try {
      const { from, to, date } = req.query;
      if (!from || !to) {
        return res.status(400).json({ error: "Query params required: from, to" });
      }
      res.json({ ...(await searchFlights({ from, to, date })), paid: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post(
    "/travala/flights/book",
    marketplacePaywallDynamic,
    async (req, res) => {
      try {
        const { flightId, passengerName, payerAddress } = req.body;
        if (!flightId) return res.status(400).json({ error: "flightId required" });

        const booking = await bookFlight({ flightId, passengerName, payerAddress });
        res.json({ ...booking, paid: true });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  function marketplacePaywall(priceUsdc, description) {
    return marketplacePaywallHandler(() => priceUsdc, description);
  }

  function marketplacePaywallDynamic(req, res, next) {
    try {
      const { flightId } = req.body || {};
      const { flight } = resolveFlight(flightId, req.body?.searchContext);
      return marketplacePaywallHandler(() => flight.priceUsdc, `Travala flight booking ${flight.id}`)(req, res, next);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  function marketplacePaywallHandler(getPriceUsdc, description) {
    return (req, res, next) => {
      const priceUsdc = String(getPriceUsdc(req));
      const pw = providerWallet();
      const { provider: providerAmount, commission } = splitPayment(priceUsdc, commissionRate);
      const resource = `${req.method} ${req.originalUrl}`;

      const paymentHeader = req.headers[X_PAYMENT_HEADER];
      if (!paymentHeader) {
        return res.status(402).json(
          buildPaymentRequired({
            payTo: pw,
            amountUsdc: priceUsdc,
            resource,
            description,
            networkConfig,
            extra: {
              marketplace: true,
              provider: "travala",
              providerWallet: pw,
              platformWallet,
              providerAmount: String(providerAmount),
              commissionAmount: String(commission),
              commissionRate,
            },
          })
        );
      }

      const payload = parsePaymentHeader(paymentHeader);
      if (!payload?.txHash) {
        return res.status(402).json({ error: "Invalid payment header" });
      }

      if (demoMode || payload.txHash === "demo-tx") {
        res.setHeader(X_PAYMENT_RESPONSE_HEADER, encodePaymentHeader({ success: true, demo: true }));
        return next();
      }

      verifyMarketplacePayment({
        provider,
        payload,
        providerWallet: pw,
        platformWallet,
        providerAmount,
        commission,
        priceUsdc,
        networkConfig,
      })
        .then((proof) => {
          res.setHeader(X_PAYMENT_RESPONSE_HEADER, encodePaymentHeader(proof));
          next();
        })
        .catch((err) => {
          res.status(402).json({ error: "Payment verification failed", message: err.message });
        });
    };
  }

  return router;
}

async function verifyMarketplacePayment({
  provider,
  payload,
  providerWallet,
  platformWallet,
  providerAmount,
  commission,
  priceUsdc,
  networkConfig,
}) {
  const usdc = process.env.USDC_ADDRESS || networkConfig.usdcAddress;
  const decimals = Number(process.env.USDC_DECIMALS || networkConfig.usdcDecimals);
  const providerAtomic = ethers.parseUnits(String(providerAmount), decimals).toString();
  const commissionAtomic = ethers.parseUnits(String(commission), decimals).toString();

  if (!payload.commissionTxHash) {
    throw new Error("Missing commissionTxHash");
  }

  await verifyUsdcPayment({
    provider,
    txHash: payload.txHash,
    expectedPayTo: providerWallet,
    expectedAmountAtomic: providerAtomic,
    usdcAddress: usdc,
  });

  await verifyUsdcPayment({
    provider,
    txHash: payload.commissionTxHash,
    expectedPayTo: platformWallet,
    expectedAmountAtomic: commissionAtomic,
    usdcAddress: usdc,
  });

  return {
    success: true,
    txHash: payload.txHash,
    commissionTxHash: payload.commissionTxHash,
    providerAmount,
    commission,
    total: priceUsdc,
    marketplace: true,
  };
}
