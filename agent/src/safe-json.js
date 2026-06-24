export async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      res.ok
        ? "Invalid JSON from server"
        : `Server error ${res.status} — restart agent & server (npm run dev). Got HTML instead of JSON.`
    );
  }
}
