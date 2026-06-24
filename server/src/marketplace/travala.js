/**
 * Travala flight adapter (MVP).
 * Production: Travala Travel MCP when flights API is live.
 */

const ROUTES = {
  "london-paris": { from: "LHR", to: "CDG", fromCity: "London", toCity: "Paris" },
  "paris-london": { from: "CDG", to: "LHR", fromCity: "Paris", toCity: "London" },
  "nyc-london": { from: "JFK", to: "LHR", fromCity: "New York", toCity: "London" },
  "dubai-london": { from: "DXB", to: "LHR", fromCity: "Dubai", toCity: "London" },
  "dubai-singapore": { from: "DXB", to: "SIN", fromCity: "Dubai", toCity: "Singapore" },
};

const bookings = new Map();
const MOCK_FLIGHT_PRICE_USDC = process.env.TRAVALA_MOCK_FLIGHT_PRICE_USDC || "1.0";

function parseRoute(from, to) {
  const f = (from || "").toUpperCase();
  const t = (to || "").toUpperCase();
  const key = `${f}-${t}`.toLowerCase();
  if (ROUTES[key]) return ROUTES[key];

  for (const r of Object.values(ROUTES)) {
    if (
      (r.from === f || r.fromCity.toLowerCase().startsWith(from?.toLowerCase())) &&
      (r.to === t || r.toCity.toLowerCase().startsWith(to?.toLowerCase()))
    ) {
      return r;
    }
  }
  return { from: f || "LHR", to: t || "CDG", fromCity: from || "Origin", toCity: to || "Destination" };
}

function buildFlights(route, travelDate) {
  const base = Number(MOCK_FLIGHT_PRICE_USDC);
  const carriers = ["Emirates", "British Airways", "Air France", "Singapore Airlines", "Lufthansa"];

  return carriers.slice(0, 4).map((airline, i) => ({
    id: `TVL-${route.from}-${route.to}-${i + 1}`,
    airline,
    from: route.from,
    to: route.to,
    fromCity: route.fromCity,
    toCity: route.toCity,
    departure: `${travelDate}T${String(8 + i * 3).padStart(2, "0")}:30:00Z`,
    arrival: `${travelDate}T${String(11 + i * 3).padStart(2, "0")}:45:00Z`,
    duration: `${2 + i}h ${15 + i * 10}m`,
    stops: i % 2,
    priceUsdc: (base + i * 0.25).toFixed(2),
    cabin: "Economy",
    provider: "travala",
    bookable: true,
  }));
}

export async function searchFlights({ from, to, date }) {
  const route = parseRoute(from, to);
  const travelDate = date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const flights = buildFlights(route, travelDate);

  return {
    provider: "travala",
    route: `${route.fromCity} (${route.from}) → ${route.toCity} (${route.to})`,
    date: travelDate,
    flights,
    source: "travala-mvp",
    timestamp: new Date().toISOString(),
    note: "Reply e.g. _Book flight 1_ or _Book TVL-LHR-CDG-1_ to reserve.",
  };
}

/** Resolve flight by ID (TVL-LHR-CDG-1) or index (1-4) from a route */
export function resolveFlight(flightIdOrIndex, context = {}) {
  const id = String(flightIdOrIndex).trim().toUpperCase();

  if (/^TVL-/.test(id)) {
    const parts = id.split("-");
    if (parts.length >= 4) {
      const from = parts[1];
      const to = parts[2];
      const idx = parseInt(parts[3], 10) - 1;
      const route = parseRoute(from, to);
      const date = context.date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const flights = buildFlights(route, date);
      const flight = flights.find((f) => f.id.toUpperCase() === id) || flights[idx];
      if (flight) return { flight, date };
    }
  }

  const num = parseInt(id, 10);
  if (!Number.isNaN(num) && context.flights?.length) {
    const flight = context.flights[num - 1];
    if (flight) return { flight, date: context.date };
  }

  if (!Number.isNaN(num)) {
    const route = parseRoute(context.from || "London", context.to || "Paris");
    const date = context.date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const flights = buildFlights(route, date);
    const flight = flights[num - 1];
    if (flight) return { flight, date };
  }

  throw new Error(`Flight not found: ${flightIdOrIndex}. Search first, then book by number or ID.`);
}

export async function bookFlight({ flightId, passengerName, payerAddress }) {
  const { flight, date } = resolveFlight(flightId);
  const bookingRef = `TRV-${Date.now().toString(36).toUpperCase()}`;
  const booking = {
    bookingRef,
    status: "confirmed",
    flight,
    date,
    passengerName: passengerName || "Guest",
    payerAddress: payerAddress || null,
    totalUsdc: flight.priceUsdc,
    provider: "travala",
    bookedAt: new Date().toISOString(),
    note: "MVP booking — connect Travala MCP for live PNR/tickets.",
  };
  bookings.set(bookingRef, booking);
  return booking;
}

export function getBooking(bookingRef) {
  return bookings.get(bookingRef) || null;
}
