export function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(len = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}

export async function pkce() {
  const verifier = randomToken(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

export function decodeJwt(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return null;
  }
}

export async function getJson(kv, key) {
  const v = await kv.get(key);
  return v ? JSON.parse(v) : null;
}

export function putJson(kv, key, value, opts) {
  return kv.put(key, JSON.stringify(value), opts);
}

/** Converts seconds, milliseconds or ISO strings to epoch seconds. */
export function toEpochSeconds(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v > 1e12 ? Math.floor(v / 1000) : v;
  const n = Number(v);
  if (!Number.isNaN(n)) return toEpochSeconds(n);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

export class AuthExpiredError extends Error {}

/**
 * 시간 제한이 있는 fetch. 토큰 갱신은 TokenStore에서 한 번에 하나씩 처리돼서,
 * 응답이 멈추면 다른 요청이 계속 기다리게 돼요. 그래서 모든 외부 요청에 제한을 둬요.
 * 시간 초과는 일반 오류라서 refresh token이 거부된 것으로 처리되지 않아요.
 */
export async function request(url, init = {}, ms = 15000) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") throw new Error(`응답 시간 초과 (${ms / 1000}초)`);
    throw err;
  }
}

export async function readError(res) {
  const text = (await res.text().catch(() => "")).trim();
  // HTML이 오면 보통 봇 차단(챌린지) 페이지라서 본문 대신 짧게 알려줍니다.
  if (text.startsWith("<")) return `HTTP ${res.status} (HTML 응답 — 봇 차단 페이지일 가능성)`;
  return `HTTP ${res.status} ${text.slice(0, 300)}`;
}
