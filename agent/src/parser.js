import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You classify user messages for a crypto payment agent on XDC Network.
Return ONLY valid JSON, no markdown.

Actions:
- "fx_rate": user wants an exchange rate / FX price (e.g. "USD to EUR", "what's the GBP rate")
- "transfer": user wants to send USDC to a wallet address
- "chat": general question not requiring payment

For fx_rate extract:
  { "action": "fx_rate", "pair": "USD/EUR" }

For transfer extract:
  { "action": "transfer", "amount": <number>, "to": "<address>" }

For chat:
  { "action": "chat", "reply": "<brief helpful reply>" }

Normalize pairs as BASE/QUOTE uppercase. Default to USD/EUR if unclear.`;

function hasValidAnthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return false;
  // Skip placeholders like "sk-..." from .env.example
  if (key.includes("...") || key.length < 20) return false;
  return key.startsWith("sk-ant-") || key.startsWith("sk-");
}

export async function parseIntent(message, mode = "demo") {
  if (hasValidAnthropicKey()) {
    try {
      return await parseWithClaude(message, mode);
    } catch (err) {
      console.warn("Claude parser failed, using rules:", err.message);
    }
  }
  return parseWithRules(message, mode);
}

async function parseWithClaude(message, mode) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: SYSTEM,
    messages: [{ role: "user", content: message }],
  });
  const text = response.content[0]?.text || "{}";
  return JSON.parse(text.trim());
}

function parseWithRules(message, mode = "demo") {
  const lower = message.toLowerCase();

  if (mode === "marketplace") {
    return parseMarketplaceRules(message, lower);
  }

  const transferMatch = lower.match(
    /send\s+([\d.]+)\s+usdc\s+to\s+(0x[a-f0-9]{40}|xdc[a-f0-9]{40})/i
  );
  if (transferMatch) {
    return {
      action: "transfer",
      amount: parseFloat(transferMatch[1]),
      to: transferMatch[2],
    };
  }

  const fxPatterns = [
    /(?:fx|exchange\s+rate|rate|price)\s+(?:for\s+)?([a-z]{3})\s*(?:\/|to)\s*([a-z]{3})/i,
    /([a-z]{3})\s*(?:\/|to)\s*([a-z]{3})\s*(?:rate|price|fx)/i,
    /what(?:'s| is) the (?:exchange )?rate (?:for )?([a-z]{3})\s*(?:to|\/)\s*([a-z]{3})/i,
    /how much is (?:1 )?([a-z]{3}) in ([a-z]{3})/i,
    /(?:get|show|fetch)\s+(?:me\s+)?(?:the\s+)?([a-z]{3})\/([a-z]{3})/i,
  ];

  for (const re of fxPatterns) {
    const m = message.match(re);
    if (m) {
      return { action: "fx_rate", pair: `${m[1].toUpperCase()}/${m[2].toUpperCase()}` };
    }
  }

  if (lower.includes("eur") || lower.includes("euro") || lower.includes("fx")) {
    return { action: "fx_rate", pair: "USD/EUR" };
  }
  if (lower.includes("xdc")) {
    return { action: "fx_rate", pair: "XDC/USD" };
  }

  return {
    action: "chat",
    reply:
      "I can help with FX rates (paid API via x402) or USDC transfers. Try: \"What's the USD/EUR rate?\" or \"Send 1 USDC to 0x...\"",
  };
}

function parseMarketplaceRules(message, lower) {
  if (lower.includes("list") && (lower.includes("provider") || lower.includes("marketplace"))) {
    return { action: "list_providers" };
  }

  const bookCheapestPatterns = [
    /(?:find|search|get).{0,40}(?:cheapest|lowest|best\s+price).{0,40}(?:flight|flights).{0,30}from\s+([a-z\s]+?)\s+to\s+([a-z\s]+)/i,
    /(?:book|reserve).{0,30}(?:the\s+)?(?:cheapest|lowest).{0,30}(?:flight|flights).{0,30}from\s+([a-z\s]+?)\s+to\s+([a-z\s]+)/i,
    /find\s+and\s+book(?:\s+the)?(?:\s+(?:cheapest|lowest))?(?:\s+flight)?\s+from\s+([a-z\s]+?)\s+to\s+([a-z\s]+)/i,
  ];

  for (const re of bookCheapestPatterns) {
    const m = message.match(re);
    if (m) {
      const passengerMatch = message.match(/(?:for|passenger)\s+([a-z][a-z\s'-]{1,40})/i);
      return {
        action: "flight_book_cheapest",
        from: m[1].trim(),
        to: m[2].trim(),
        date: null,
        passengerName: passengerMatch?.[1]?.trim() || null,
      };
    }
  }

  const bookPatterns = [
    /book\s+(?:flight\s+)?(TVL-[A-Z]{3}-[A-Z]{3}-\d+)/i,
    /reserve\s+(?:flight\s+)?(TVL-[A-Z]{3}-[A-Z]{3}-\d+)/i,
    /book\s+(?:flight\s+)?(?:option\s+|#)?(\d+)/i,
    /reserve\s+(?:flight\s+)?#?(\d+)/i,
  ];

  for (const re of bookPatterns) {
    const m = message.match(re);
    if (m) {
      const passengerMatch = message.match(/(?:for|passenger)\s+([a-z][a-z\s'-]{1,40})/i);
      return {
        action: "flight_book",
        flightId: m[1],
        passengerName: passengerMatch?.[1]?.trim() || null,
      };
    }
  }

  const flightPatterns = [
    /flights?\s+from\s+([a-z\s]+?)\s+to\s+([a-z\s]+)/i,
    /find\s+flights?\s+([a-z]{3})\s+to\s+([a-z]{3})/i,
    /search\s+flights?\s+([a-z\s]+?)\s+to\s+([a-z\s]+)/i,
    /([a-z]+)\s+to\s+([a-z]+)\s+flights?/i,
  ];

  for (const re of flightPatterns) {
    const m = message.match(re);
    if (m) {
      return {
        action: "flight_search",
        from: m[1].trim(),
        to: m[2].trim(),
        date: null,
      };
    }
  }

  if (lower.includes("flight") || lower.includes("travala")) {
    return { action: "flight_search", from: "London", to: "Paris", date: null };
  }

  return {
    action: "chat",
    reply:
      'Marketplace: _"Find and book the cheapest flight from Dubai to London"_ · _"Find flights from London to Paris"_ · _"Book flight 1"_',
  };
}
