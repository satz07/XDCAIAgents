/**
 * FX rate data — uses Frankfurter (free, no key) as upstream source.
 * In production this would be your proprietary oracle; here we wrap it behind x402.
 */

const PAIRS = {
  "USD/EUR": { from: "USD", to: "EUR" },
  "EUR/USD": { from: "EUR", to: "USD" },
  "USD/GBP": { from: "USD", to: "GBP" },
  "GBP/USD": { from: "GBP", to: "USD" },
  "USD/INR": { from: "USD", to: "INR" },
  "USD/JPY": { from: "USD", to: "JPY" },
  "USD/XDC": null,
};

export async function getFxRate(pair) {
  const normalized = pair.toUpperCase().replace(/\s/g, "");
  const key = normalized.includes("/") ? normalized : `USD/${normalized}`;

  if (key === "USD/XDC" || key === "XDC/USD") {
    return fetchXdcUsdRate();
  }

  const spec = PAIRS[key];
  if (!spec) {
    const [base, quote] = key.split("/");
    if (!base || !quote) throw new Error(`Unknown pair: ${pair}`);
    return fetchRate(base, quote);
  }
  return fetchRate(spec.from, spec.to);
}

async function fetchRate(from, to) {
  const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FX upstream error: ${res.status}`);
  const data = await res.json();
  const rate = data.rates?.[to];
  if (!rate) throw new Error(`Rate not available for ${from}/${to}`);
  return {
    pair: `${from}/${to}`,
    rate,
    base: from,
    quote: to,
    date: data.date,
    source: "frankfurter",
    timestamp: new Date().toISOString(),
  };
}

async function fetchXdcUsdRate() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=xdce-crowd-sale&vs_currencies=usd"
  );
  if (!res.ok) throw new Error("XDC price upstream error");
  const data = await res.json();
  const rate = data["xdce-crowd-sale"]?.usd;
  if (!rate) throw new Error("XDC/USD rate unavailable");
  return {
    pair: "XDC/USD",
    rate,
    base: "XDC",
    quote: "USD",
    date: new Date().toISOString().slice(0, 10),
    source: "coingecko",
    timestamp: new Date().toISOString(),
  };
}

export function listSupportedPairs() {
  return Object.keys(PAIRS);
}
