export function friendlyPaymentError(err) {
  const msg = err?.message || String(err);
  if (err?.code === "CALL_EXCEPTION" || msg.includes("reverted") || msg.includes("insufficient funds")) {
    return "USDC payment failed — check your wallet has enough USDC for this booking (search + ticket). Restart `npm run dev` if prices should be 1 USDC.";
  }
  if (msg.length > 200) {
    return msg.split("\n")[0].slice(0, 200);
  }
  return msg;
}
