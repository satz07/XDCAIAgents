# XDC x402 FX Agent

End-to-end demo: an AI agent pays for FX rate APIs using **HTTP 402 (x402)** with **USDC on XDC Network** — no API keys, no subscriptions.

Inspired by [Agentic XDC Payments](https://www.xdc.dev/rushabh_parmar/building-an-ai-agent-that-sends-usdc-on-xdc-network-using-plain-english-3af7) and extended with x402 pay-per-use API access.

## Architecture

```
User (React) → Agent API (Node) → FX API (Node)
                      ↓                    ↓ 402 Payment Required
                 USDC on XDC  ←──────── pay 0.1 USDC
                      ↓                    ↓ retry + X-PAYMENT header
                 plain English answer ← JSON rate data
```

| Component | Port | Role |
|-----------|------|------|
| `client/` | 5173 | React chat UI |
| `agent/` | 3001 | AI agent — parses intent, pays x402, sends USDC |
| `server/` | 4021 | FX rate API with HTTP 402 paywall (0.1 USDC/request) |
| `shared/` | — | x402 protocol helpers + on-chain verification |

## Two agent skills

| Skill | Mechanism |
|-------|-----------|
| Pay a person/address | Direct USDC `transfer()` on XDC (article flow) |
| Pay a website/API | x402: 402 → USDC payment → retry with proof |

## Quick start (demo mode)

Demo mode works **without a wallet** — simulates x402 payment flow locally.

```bash
npm install
cp .env.example .env   # DEMO_MODE=true by default
npm run dev
```

Open **http://localhost:5173** and try:

- `What's the USD/EUR exchange rate?`
- `Get me the XDC/USD price`

You'll see the full x402 flow: intent → API call → 402 → demo payment → retry → rate.

## Live mode (XDC Mainnet)

1. Set in `.env`:

```env
DEMO_MODE=false
AGENT_PRIVATE_KEY=0x...          # wallet with USDC + XDC for gas
PAY_TO_ADDRESS=0x...             # your receiving wallet for API fees
ANTHROPIC_API_KEY=sk-...         # optional — enables Claude intent parsing
```

2. Fund the agent wallet with:
   - **USDC** on XDC (`0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1`)
   - **XDC** for gas (~0.01 XDC per transfer)

3. `npm run dev` and ask for FX rates — each call costs **0.1 USDC**.

## x402 flow (FX API)

1. Agent calls `GET /fx/USD-EUR`
2. Server responds **HTTP 402** with payment metadata:

```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:50",
    "maxAmountRequired": "100000",
    "payTo": "0x...",
    "asset": "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1"
  }]
}
```

3. Agent sends **0.1 USDC** on XDC to `payTo`
4. Agent retries with `X-PAYMENT` header (base64 JSON with `txHash`)
5. Server verifies on-chain USDC transfer → returns FX JSON

## XDC-specific notes

- Legacy tx **type 0** (no EIP-1559)
- Min gas price **12.5 gwei**
- USDC Mainnet: `0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1`

## Project structure

```
├── client/          React + Vite UI
├── agent/           AI agent (parser, x402 client, USDC wallet)
├── server/          FX API with x402 middleware
├── shared/          x402 protocol + verification
└── .env.example
```

## API endpoints

**FX API** (`:4021`)

- `GET /health` — service info
- `GET /pairs` — supported currency pairs
- `GET /fx/:pair` — paid FX rate (e.g. `/fx/USD-EUR`)

**Agent API** (`:3001`)

- `GET /health` — wallet status
- `POST /chat` — `{ "message": "..." }`

## References

- [Building an AI Agent That Sends USDC on XDC](https://www.xdc.dev/rushabh_parmar/building-an-ai-agent-that-sends-usdc-on-xdc-network-using-plain-english-3af7)
- [x402 on XDC Blockchain](https://www.xdc.dev/ts/integrating-x402-micropayments-on-the-xdc-blockchain-522d)
- [Coinbase x402 Docs](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
