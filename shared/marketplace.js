/** Platform commission (marketplace fee) — default 0.5% */
export const DEFAULT_COMMISSION_RATE = 0.005;

export function splitPayment(totalUsdc, commissionRate = DEFAULT_COMMISSION_RATE) {
  const total = Number(totalUsdc);
  const commission = Math.round(total * commissionRate * 1e6) / 1e6;
  const provider = Math.round((total - commission) * 1e6) / 1e6;
  return { total, provider, commission, commissionRate };
}

export function getBuiltinProviders(env = process.env) {
  const travalaWallet = env.TRAVALA_WALLET || env.PAY_TO_ADDRESS || "";
  const platformWallet = env.PLATFORM_COMMISSION_WALLET || env.PAY_TO_ADDRESS || "";

  return [
    {
      id: "travala",
      name: "Travala",
      tagline: "Crypto-native travel — flights & hotels",
      logo: "✈️",
      wallet: travalaWallet,
      commissionRate: Number(env.PLATFORM_COMMISSION_RATE || DEFAULT_COMMISSION_RATE),
      status: "live",
      note: "Flight search MVP. Full Travala Travel MCP integration planned.",
      apis: [
        {
          id: "flight-search",
          name: "Flight search",
          description: "Search flights, prices in USDC — pay per query via x402",
          method: "GET",
          path: "/marketplace/travala/flights/search",
          priceUsdc: env.TRAVALA_SEARCH_PRICE_USDC || "1.0",
        },
        {
          id: "flight-book",
          name: "Flight booking",
          description: "Book a flight — pay ticket price in USDC via x402 (commission split)",
          method: "POST",
          path: "/marketplace/travala/flights/book",
          priceUsdc: "flight price",
        },
      ],
    },
    {
      id: "fx-oracle",
      name: "FX Oracle",
      tagline: "Exchange rates for trade finance",
      logo: "💱",
      wallet: env.PAY_TO_ADDRESS || "",
      commissionRate: Number(env.PLATFORM_COMMISSION_RATE || DEFAULT_COMMISSION_RATE),
      status: "live",
      apis: [
        {
          id: "fx-rate",
          name: "FX rate lookup",
          description: "USD/EUR, GBP/USD and more",
          method: "GET",
          path: "/fx",
          priceUsdc: env.FX_PRICE_USDC || "0.1",
        },
      ],
    },
  ];
}
