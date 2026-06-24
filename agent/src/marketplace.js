import { fetchMarketplaceX402 } from "./marketplace-client.js";

const MARKETPLACE_API = process.env.MARKETPLACE_API_URL || process.env.FX_API_URL || "http://localhost:4021";

function findFlight(flightId, sessionContext) {
  const ctx = sessionContext?.lastSearch;
  const id = String(flightId).trim();

  if (/^TVL-/i.test(id) && ctx?.flights) {
    const match = ctx.flights.find((f) => f.id.toUpperCase() === id.toUpperCase());
    if (match) return { flight: match, date: ctx.date, from: ctx.from, to: ctx.to };
  }

  const num = parseInt(id, 10);
  if (!Number.isNaN(num) && ctx?.flights?.[num - 1]) {
    const flight = ctx.flights[num - 1];
    return { flight, date: ctx.date, from: ctx.from, to: ctx.to };
  }

  if (/^TVL-/i.test(id)) {
    const parts = id.toUpperCase().split("-");
    if (parts.length >= 4) {
      return {
        flight: { id: id.toUpperCase(), airline: "Flight", from: parts[1], to: parts[2], priceUsdc: "?" },
        date: ctx?.date,
        from: parts[1],
        to: parts[2],
      };
    }
  }

  throw new Error(`Flight not found: ${flightId}. Search first, then book by number (e.g. _Book flight 1_).`);
}

function pickCheapest(flights) {
  return [...flights].sort((a, b) => {
    const priceDiff = Number(a.priceUsdc) - Number(b.priceUsdc);
    if (priceDiff !== 0) return priceDiff;
    return a.stops - b.stops;
  })[0];
}

function formatFlightList(flights, cheapestId) {
  return flights
    .slice(0, 4)
    .map((f, i) => {
      const tag = f.id === cheapestId ? " **← cheapest**" : "";
      return `${i + 1}. **${f.airline}** \`${f.id}\` · ${f.from}→${f.to} · ${f.departure.slice(11, 16)} · **${f.priceUsdc} USDC** · ${f.stops === 0 ? "Direct" : `${f.stops} stop`}${tag}`;
    })
    .join("\n");
}

async function searchFlightsApi({ from, to, date }, { wallet, demoMode, onPayment }) {
  const params = new URLSearchParams({ from, to });
  if (date) params.set("date", date);
  const url = `${MARKETPLACE_API}/marketplace/travala/flights/search?${params}`;
  return fetchMarketplaceX402(url, { wallet, demoMode, onPayment });
}

async function bookFlightApi(bookBody, { wallet, demoMode, onPayment }) {
  const url = `${MARKETPLACE_API}/marketplace/travala/flights/book`;
  return fetchMarketplaceX402(url, {
    wallet,
    demoMode,
    onPayment,
    method: "POST",
    body: bookBody,
  });
}

function buildBookBody(flight, sessionContext, wallet, passengerName) {
  return {
    flightId: flight.id,
    passengerName: passengerName || "Guest",
    payerAddress: wallet?.address,
    searchContext: sessionContext?.lastSearch,
  };
}

export async function runMarketplaceAgent(intent, { wallet, demoMode, onPayment, confirm = false, sessionContext }) {
  if (intent.action === "flight_search") {
    const { from, to, date } = intent;
    const result = await searchFlightsApi({ from, to, date }, { wallet, demoMode, onPayment });

    if (!result.res.ok) {
      return {
        reply: `Travala API error: ${result.body?.message || result.body?.error || result.res.status}`,
        payment: result.payment,
      };
    }

    const { route, flights, date: d } = result.body;
    const cheapest = pickCheapest(flights);
    const lines = formatFlightList(flights, cheapest.id);

    const paidNote = result.paid
      ? `\n\n_Search: paid ${result.payment.amountUsdc} USDC (${result.payment.providerAmount} → Travala, ${result.payment.commission} platform fee)_`
      : "";

    return {
      reply: `**Flights: ${route}** (${d})\n\n${lines}${paidNote}\n\n_Reply **Book flight 1** or **Book ${cheapest.id}** to reserve._`,
      payment: result.payment,
      data: result.body,
      sessionContext: {
        lastSearch: { from, to, date: d, flights, route },
      },
    };
  }

  if (intent.action === "flight_book_cheapest") {
    const { from, to, date, passengerName } = intent;
    let searchPayment = null;
    let searchData = sessionContext?.lastSearch;

    const sameRoute =
      searchData &&
      searchData.from?.toLowerCase() === from.toLowerCase() &&
      searchData.to?.toLowerCase() === to.toLowerCase();

    if (!confirm || !sameRoute || !searchData?.flights?.length) {
      const result = await searchFlightsApi({ from, to, date }, { wallet, demoMode, onPayment });
      if (!result.res.ok) {
        return {
          reply: `Travala API error: ${result.body?.message || result.body?.error || result.res.status}`,
          payment: result.payment,
        };
      }
      searchData = { from, to, date: result.body.date, flights: result.body.flights, route: result.body.route };
      searchPayment = result.payment;
    }

    const cheapest = pickCheapest(searchData.flights);
    const bookBody = buildBookBody(cheapest, { lastSearch: searchData }, wallet, passengerName);

    if (!confirm) {
      const lines = formatFlightList(searchData.flights, cheapest.id);
      const searchNote = searchPayment?.amountUsdc
        ? `\n\n_Search: paid ${searchPayment.amountUsdc} USDC_`
        : "";

      return {
        reply: `**Flights: ${searchData.route}** (${searchData.date})\n\n${lines}${searchNote}\n\n**Cheapest: ${cheapest.airline}** · ${cheapest.from}→${cheapest.to} · **${cheapest.priceUsdc} USDC**\n\nBook this flight with USDC? Platform fee (0.5%) included.\n\nReply **yes** or tap **Confirm** to pay and book.`,
        needsConfirmation: true,
        pending: true,
        payment: searchPayment,
        sessionContext: { lastSearch: searchData, pendingBook: bookBody },
      };
    }

    const result = await bookFlightApi(bookBody, { wallet, demoMode, onPayment });

    if (!result.res.ok) {
      return {
        reply: `Booking failed: ${result.body?.message || result.body?.error || result.res.status}`,
        payment: result.payment || searchPayment,
      };
    }

    const { bookingRef, flight: booked, passengerName: pax, totalUsdc } = result.body;
    const bookNote = result.paid
      ? `\n\n_Booking: paid ${result.payment.amountUsdc} USDC (${result.payment.providerAmount} → Travala, ${result.payment.commission} platform fee)_`
      : "";

    return {
      reply: `**Booking confirmed** ✈️\n\nRef: **${bookingRef}**\n${booked.airline} · ${booked.from}→${booked.to} (cheapest)\n${booked.departure?.slice(0, 10)} · ${pax}\nTotal: **${totalUsdc} USDC**${bookNote}`,
      payment: result.payment,
      data: result.body,
      sessionContext: { lastSearch: searchData, lastBooking: result.body },
    };
  }

  if (intent.action === "flight_book") {
    const { flightId, passengerName } = intent;
    let resolved;
    try {
      resolved = findFlight(flightId, sessionContext);
    } catch (err) {
      return { reply: err.message, payment: null };
    }

    const { flight, date } = resolved;
    const bookBody = buildBookBody(flight, sessionContext, wallet, passengerName);

    if (!confirm) {
      return {
        reply: `**Book this flight?**\n\n**${flight.airline}** ${flight.from}→${flight.to}\nDate: ${date || "TBD"} · **${flight.priceUsdc} USDC**\nPassenger: ${bookBody.passengerName}\n\nPlatform fee (0.5%) included in split.\n\nReply **yes** or tap Confirm to pay and book.`,
        needsConfirmation: true,
        pending: true,
        payment: null,
        sessionContext: { pendingBook: bookBody },
      };
    }

    const result = await bookFlightApi(bookBody, { wallet, demoMode, onPayment });

    if (!result.res.ok) {
      return {
        reply: `Booking failed: ${result.body?.message || result.body?.error || result.res.status}`,
        payment: result.payment,
      };
    }

    const { bookingRef, flight: booked, passengerName: pax, totalUsdc } = result.body;
    const paidNote = result.paid
      ? `\n\n_Paid ${result.payment.amountUsdc} USDC (${result.payment.providerAmount} → Travala, ${result.payment.commission} platform fee)_`
      : "";

    return {
      reply: `**Booking confirmed** ✈️\n\nRef: **${bookingRef}**\n${booked.airline} · ${booked.from}→${booked.to}\n${booked.departure?.slice(0, 10)} · ${pax}\nTotal: **${totalUsdc} USDC**${paidNote}`,
      payment: result.payment,
      data: result.body,
      sessionContext: { lastBooking: result.body },
    };
  }

  if (intent.action === "list_providers") {
    const res = await fetch(`${MARKETPLACE_API}/marketplace/providers`);
    const data = await res.json();
    const list = data.providers
      .map((p) => `**${p.logo} ${p.name}** — ${p.tagline}\n${p.apis.map((a) => `  · ${a.name}: ${a.priceUsdc} USDC`).join("\n")}`)
      .join("\n\n");
    return {
      reply: `**XDC Agent Marketplace**\n\nPlatform fee: **${data.commissionRate * 100}%** per transaction\n\n${list}`,
      payment: null,
    };
  }

  return {
    reply: 'Try: _"Find and book the cheapest flight from Dubai to London"_ · _"Find flights from London to Paris"_',
    payment: null,
  };
}
