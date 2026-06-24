import { useEffect, useState } from "react";
import DemoTab from "./DemoTab.jsx";
import MarketplaceTab from "./MarketplaceTab.jsx";
import { agentApiUrls, SHOW_MARKETPLACE } from "./config.js";
import "./App.css";

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsdc(val) {
  return Number(val).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatBalance(entry) {
  if (!entry) return "…";
  if (entry.error) return "—";
  if (entry.formatted != null) return `${fmtUsdc(entry.formatted)} USDC`;
  return "…";
}

async function fetchJson(urls, label = "fetch") {
  for (const url of urls) {
    const t0 = performance.now();
    try {
      console.log(`[client] ${label} → ${url}`);
      const r = await fetch(url);
      const ms = Math.round(performance.now() - t0);
      console.log(`[client] ${label} ← ${url} status=${r.status} (${ms}ms)`);
      if (!r.ok) continue;
      const data = await r.json();
      console.log(`[client] ${label} data:`, data);
      return data;
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      console.warn(`[client] ${label} failed ${url} (${ms}ms):`, err.message);
    }
  }
  return null;
}

export default function App() {
  const [tab, setTab] = useState(SHOW_MARKETPLACE ? "marketplace" : "demo");
  const [status, setStatus] = useState(null);
  const [balances, setBalances] = useState(null);
  const [balanceError, setBalanceError] = useState(null);
  const [balancesLoading, setBalancesLoading] = useState(true);

  async function refreshBalances() {
    setBalancesLoading(true);
    console.log("[client] refreshBalances start");
    const data = await fetchJson(agentApiUrls("/balances"), "balances");
    if (!data) {
      console.error("[client] refreshBalances: no data");
      setBalanceError("Cannot load balances — is agent API reachable?");
      setBalancesLoading(false);
      return;
    }
    setBalances(data);
    const agentErr = data.agent?.error;
    const recvErr = data.receiver?.error;
    if (agentErr || recvErr) {
      console.warn("[client] balance errors:", { agentErr, recvErr });
      setBalanceError(agentErr || recvErr);
    } else {
      setBalanceError(null);
    }
    setBalancesLoading(false);
    console.log("[client] refreshBalances done", data);
  }

  async function refreshStatus() {
    console.log("[client] refreshStatus start");
    const data = await fetchJson(agentApiUrls("/health"), "health");
    if (!data) {
      setBalanceError("Cannot reach agent API");
      setStatus({ demoMode: true });
      setBalancesLoading(false);
      return;
    }
    setStatus(data);
    await refreshBalances();
  }

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshBalances, 30_000);
    return () => clearInterval(id);
  }, []);

  function explorerAddr(addr) {
    if (!addr || !status?.explorerUrl) return null;
    return `${status.explorerUrl}/address/${addr}`;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">x402</div>
          <div>
            <h1>XDC Agent Platform</h1>
            <p>{SHOW_MARKETPLACE ? "Marketplace + x402 pay-per-use APIs" : "x402 pay-per-use API demo"}</p>
          </div>
        </div>
        <div className="header-right">
          {status && (
            <div className="status-pills">
              <span className={`pill ${status.demoMode ? "demo" : "live"}`}>
                {status.demoMode ? "Demo" : "Live"}
              </span>
            </div>
          )}
        </div>
      </header>

      {SHOW_MARKETPLACE && (
        <nav className="tab-bar">
          <button
            type="button"
            className={`tab-btn ${tab === "marketplace" ? "active" : ""}`}
            onClick={() => setTab("marketplace")}
          >
            Marketplace
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "demo" ? "active" : ""}`}
            onClick={() => setTab("demo")}
          >
            x402 Demo
          </button>
        </nav>
      )}

      <div className="balance-panel">
        <div className="balance-panel-header">
          <span>USDC Balances</span>
          <button type="button" className="refresh-btn" onClick={refreshStatus} disabled={balancesLoading}>
            {balancesLoading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
        {balanceError && <div className="balance-error">{balanceError}</div>}
        <div className="balance-cards">
          <div className="balance-card agent">
            <div className="balance-label">Agent (payer)</div>
            <div className="balance-amount">{formatBalance(balances?.agent)}</div>
            <div className="balance-addr mono">
              {explorerAddr(balances?.agent?.address || status?.walletAddress) ? (
                <a href={explorerAddr(balances?.agent?.address || status?.walletAddress)} target="_blank" rel="noreferrer">
                  {shortAddr(balances?.agent?.address || status?.walletAddress)}
                </a>
              ) : (
                shortAddr(status?.walletAddress) || "—"
              )}
            </div>
          </div>
          <div className="balance-card receiver">
            <div className="balance-label">Platform / receiver</div>
            <div className="balance-amount">{formatBalance(balances?.receiver)}</div>
            <div className="balance-addr mono">
              {shortAddr(balances?.receiver?.address || status?.receiverAddress) || "—"}
            </div>
          </div>
        </div>
      </div>

      {SHOW_MARKETPLACE && tab === "marketplace" ? (
        <MarketplaceTab
          explorerUrl={status?.explorerUrl}
          onBalances={(b) => {
            setBalances(b);
            setBalanceError(null);
            setBalancesLoading(false);
          }}
          onRefreshBalances={refreshBalances}
        />
      ) : (
        <DemoTab
          explorerUrl={status?.explorerUrl}
          onBalances={(b) => {
            setBalances(b);
            setBalanceError(null);
            setBalancesLoading(false);
          }}
          onRefreshBalances={refreshBalances}
        />
      )}
    </div>
  );
}
