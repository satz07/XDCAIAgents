import ChatPanel from "./ChatPanel.jsx";
import { agentApi } from "./config.js";

const SUGGESTIONS = [
  "What's the USD/EUR exchange rate?",
  "Get me the GBP/USD FX rate",
  "What's the XDC price in USD?",
  "Send 1 USDC to 0xB0EF2A0337A519d50780E33d268341CE75ce8383",
];

export default function DemoTab({ explorerUrl, onBalances, onRefreshBalances }) {
  return (
    <ChatPanel
      chatPath={agentApi("/chat")}
      explorerUrl={explorerUrl}
      onBalances={onBalances}
      onRefreshBalances={onRefreshBalances}
      welcomeMessage="I'm your **XDC payment agent** demo.\n\n1. **Pay for FX rates** via x402 (HTTP 402 → USDC → retry)\n2. **Send USDC** to any address\n\nTry: *What's the USD/EUR rate?*"
      suggestions={SUGGESTIONS}
      placeholder="Ask for FX rates or send USDC…"
    />
  );
}
