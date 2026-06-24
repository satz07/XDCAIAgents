/** Agent API base. Empty = use Vite dev proxy (/api → localhost:3005). */
export function getAgentApiBase() {
  const url = import.meta.env.VITE_AGENT_API_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  return "/api";
}

export function agentApi(path) {
  const base = getAgentApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Set VITE_SHOW_MARKETPLACE=true to re-enable the marketplace tab. */
export const SHOW_MARKETPLACE = import.meta.env.VITE_SHOW_MARKETPLACE === "true";

export function agentApiUrls(path) {
  const primary = agentApi(path);
  if (getAgentApiBase() === "/api") {
    return [primary, `http://localhost:3005${path.startsWith("/") ? path : `/${path}`}`];
  }
  return [primary];
}
