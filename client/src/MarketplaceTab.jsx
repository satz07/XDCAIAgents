import { useEffect, useState } from "react";
import ChatPanel from "./ChatPanel.jsx";
import { agentApi } from "./config.js";

const SUGGESTIONS = [
  "Find and book the cheapest flight from Dubai to London",
  "Find flights from London to Paris",
  "Book flight 1",
  "List marketplace providers",
];

export default function MarketplaceTab({ explorerUrl, onBalances, onRefreshBalances }) {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    fetch(agentApi("/marketplace/providers"))
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || []))
      .catch(() => {});
  }, []);

  return (
    <div className="marketplace-tab">
      <div className="provider-grid">
        {providers.map((p) => (
          <div key={p.id} className="provider-card">
            <div className="provider-logo">{p.logo}</div>
            <div>
              <div className="provider-name">{p.name}</div>
              <div className="provider-tag">{p.tagline}</div>
              {p.apis?.map((a) => (
                <div key={a.id} className="provider-api">
                  {a.name} · <strong>{a.priceUsdc} USDC</strong>
                </div>
              ))}
              <div className="provider-fee">Platform fee: {p.platformCommission}</div>
            </div>
          </div>
        ))}
      </div>

      <ChatPanel
        chatPath={agentApi("/marketplace/chat")}
        explorerUrl={explorerUrl}
        onBalances={onBalances}
        onRefreshBalances={onRefreshBalances}
        welcomeMessage="**XDC Agent Marketplace** — pay-per-use APIs with USDC + x402.\n\nTry: _Find and book the cheapest flight from Dubai to London_\n\nSearch → pick cheapest → confirm → pay in USDC."
        suggestions={SUGGESTIONS}
        placeholder="Find and book cheapest flight Dubai to London…"
      />
    </div>
  );
}
