# XDC Agent Marketplace — architecture & implementation plan

## Vision

A **marketplace** where companies (Travala, FX oracles, etc.) list x402 APIs.
Users chat in plain English → AI agent pays USDC on XDC → gets data → can book/act.

**Revenue:** `0.5%` platform commission to XDC marketplace wallet; `99.5%` to provider (e.g. Travala).

---

## Architecture

```
User (React)
  ├── Tab: Marketplace  →  Travala flights, future providers
  └── Tab: x402 Demo     →  original FX micropayment demo

Agent API (:3001)
  ├── POST /marketplace/chat
  └── POST /chat (demo)

Server API (:4021)
  ├── /marketplace/providers
  ├── /marketplace/travala/flights/search  (x402 + commission)
  └── /fx/:pair  (original demo)
```

---

## Payment split (marketplace)

For a **1.0 USDC** flight search:

| Recipient | Amount |
|-----------|--------|
| Travala wallet | 0.995 USDC |
| Platform wallet | 0.005 USDC |

Agent sends **two USDC transfers**, then retries API with both tx hashes in `X-PAYMENT`.

---

## Adding a new provider

1. Register in `shared/marketplace.js` → `getBuiltinProviders()`
2. Add route under `server/src/marketplace/`
3. Wrap with x402 + `marketplacePaywall` middleware
4. Add intent rules in `agent/src/parser.js`
5. Add handler in `agent/src/marketplace.js`
6. Provider card appears automatically in Marketplace tab

---

## Travala integration path

| Phase | What |
|-------|------|
| **Now (MVP)** | Mock flight search + x402 + commission split |
| **Next** | [Travala Travel MCP](https://www.travala.com/blog/introducing-travalas-agentic-ai-travel-protocol/) for live hotels |
| **Later** | Flights when Travala expands MCP; real booking + USDC settlement |

---

## Env vars

```env
TRAVALA_WALLET=0x...           # provider receives 99.5%
PLATFORM_COMMISSION_WALLET=0x... # platform receives 0.5%
PLATFORM_COMMISSION_RATE=0.005
TRAVALA_SEARCH_PRICE_USDC=1.0
```

---

## Run

```bash
npm run dev
# Marketplace tab → "Find flights from London to Paris"
```
