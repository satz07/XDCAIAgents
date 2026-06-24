import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsdc(val) {
  return Number(val).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function ChatPanel({
  chatPath,
  welcomeMessage,
  suggestions,
  placeholder,
  explorerUrl,
  onBalances,
  onRefreshBalances,
}) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: welcomeMessage, payment: null },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const sessionId = useRef(`s-${Date.now()}`);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function txExplorerUrl(payment) {
    if (!payment?.txHash || payment.txHash === "demo-tx") return null;
    return payment.explorerUrl || (explorerUrl ? `${explorerUrl}/tx/${payment.txHash}` : null);
  }

  async function send(confirm = false) {
    const text = input.trim();
    if (!text && !confirm) return;
    const userMsg = confirm ? "yes" : text;
    if (!confirm) setInput("");

    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const t0 = performance.now();
      console.log("[client] chat →", chatPath, { message: userMsg, confirm, sessionId: sessionId.current });
      const res = await fetch(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          sessionId: sessionId.current,
          confirm,
        }),
      });
      const text = await res.text();
      const ms = Math.round(performance.now() - t0);
      console.log(`[client] chat ← status=${res.status} (${ms}ms)`, text.slice(0, 300));
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Agent API error — restart with npm run dev. (${res.status})`
        );
      }
      if (data.error) throw new Error(data.error);
      console.log("[client] chat reply:", { reply: data.reply?.slice(0, 80), payment: data.payment, balances: data.balances });

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply,
          needsConfirmation: data.needsConfirmation,
          payment: data.payment,
        },
      ]);
      if (data.balances && onBalances) onBalances(data.balances);
      onRefreshBalances?.();
    } catch (err) {
      console.error("[client] chat error:", err);
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <main className="chat">
        {messages.map((msg, i) => (
          <div key={i} className="message-group">
            <div className={`message ${msg.role}`}>
              <div className="bubble">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
                {msg.needsConfirmation && (
                  <button className="confirm-btn" onClick={() => send(true)} disabled={loading}>
                    Confirm (yes)
                  </button>
                )}
              </div>
            </div>
            {msg.role === "assistant" && msg.payment?.txHash && (
              <div className="msg-tx">
                {msg.payment.txHash === "demo-tx" ? (
                  <span className="msg-tx-demo">Demo payment</span>
                ) : (
                  <>
                    <span className="msg-tx-label">
                      {msg.payment.amountUsdc ? `${fmtUsdc(msg.payment.amountUsdc)} USDC` : ""}
                      {msg.payment.commission
                        ? ` (${fmtUsdc(msg.payment.providerAmount)} provider + ${fmtUsdc(msg.payment.commission)} fee)`
                        : ""}
                      {" · "}
                      {shortAddr(msg.payment.txHash)}
                    </span>
                    {txExplorerUrl(msg.payment) && (
                      <a className="msg-tx-link" href={txExplorerUrl(msg.payment)} target="_blank" rel="noreferrer">
                        View on explorer ↗
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="bubble loading-bubble">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="suggestions">
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => setInput(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>

      <footer className="input-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && send()}
          placeholder={placeholder}
          disabled={loading}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()}>
          Send
        </button>
      </footer>
    </>
  );
}
