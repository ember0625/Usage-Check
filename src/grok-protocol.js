import { AuthExpiredError, decodeJwt } from "./util.js";

// Public client used by the official Grok device flow. No client secret.
// https://github.com/xai-org/grok-build/tree/main/crates/codegen/xai-grok-login/src
export const CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const ISSUER = "https://auth.x.ai";
export const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const seconds = () => Math.floor(Date.now() / 1000);

async function request(url, options) {
  try {
    return await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error("Grok 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

async function form(path, values) {
  const response = await request(ISSUER + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json",
      "User-Agent": "usage-check/0.1", "x-grok-client-surface": "ui" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...values }),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function verificationURL(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || !["accounts.x.ai", "auth.x.ai"].includes(u.hostname) || u.username || u.password || u.port) {
    throw new Error("Grok 인증 주소를 확인하지 못했어요.");
  }
  return u.href;
}

export async function startDevice() {
  // No conversation, workspace, API-key or billing write permissions requested.
  const { response, data } = await form("/oauth2/device/code", {
    scope: "openid offline_access grok-cli:access", referrer: "usage-check",
  });
  if (!response.ok) throw new Error(`Grok 로그인 시작 실패 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`);
  if (!data || typeof data.device_code !== "string" || !data.device_code ||
      typeof data.user_code !== "string" || !/^[A-Za-z0-9-]{4,32}$/.test(data.user_code) ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Grok 로그인 응답을 확인하지 못했어요.");
  const interval = Number.isFinite(data.interval) && data.interval > 0 ? Math.ceil(data.interval) : 5;
  return { device_code: data.device_code, user_code: data.user_code,
    url: verificationURL(data.verification_uri_complete || data.verification_uri),
    interval, expires_at: seconds() + Math.min(data.expires_in, 1800), next_poll: seconds() + interval };
}

export function publicDevice(pending) {
  return { pending: true, user_code: pending.user_code, url: pending.url,
    expires_at: pending.expires_at, interval: Math.max(pending.interval, pending.next_poll - seconds()) };
}

export async function pollDevice(pending) {
  if (seconds() >= pending.expires_at) return { error: "인증 코드가 만료됐어요. 연결을 다시 시작해 주세요.", terminal: true };
  if (seconds() < pending.next_poll) return { pending };
  // Reserve the next poll even when the network fails. Caller persists before sending.
  const { response, data } = await form("/oauth2/token", {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: pending.device_code,
  });
  if (response.ok) return { tokens: tokensFromResponse(data) };
  if (data?.error === "authorization_pending") return { pending: { ...pending, next_poll: seconds() + pending.interval } };
  if (data?.error === "slow_down" || response.status === 429) {
    const interval = pending.interval + 5;
    return { pending: { ...pending, interval, next_poll: seconds() + interval } };
  }
  if (data?.error === "access_denied") return { error: "Grok 로그인을 승인하지 않았어요. 다시 연결할 수 있어요.", terminal: true };
  if (data?.error === "expired_token") return { error: "인증 코드가 만료됐어요. 연결을 다시 시작해 주세요.", terminal: true };
  return { error: `Grok 로그인 확인 실패 (HTTP ${response.status}). 잠시 후 다시 확인해 주세요.` };
}

export function tokensFromResponse(data, previous = {}) {
  if (typeof data?.access_token !== "string" || !data.access_token ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Grok 로그인 토큰 응답을 확인하지 못했어요.");
  const claims = decodeJwt(data.access_token) || {};
  const identity = decodeJwt(data.id_token) || {};
  // Display identity only; authorization is always verified by the upstream server.
  const principalType = claims.principal_type || claims.principalType || previous.principal_type;
  if (principalType && principalType !== "User") throw new Error("개인 Grok 사용량을 조회하려면 개인 계정으로 승인해 주세요.");
  return { access_token: data.access_token,
    refresh_token: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : previous.refresh_token,
    expires_at: seconds() + data.expires_in,
    user_id: identity.sub || previous.user_id || "",
    principal_type: principalType,
    principal_id: claims.principal_id || claims.principalId || previous.principal_id };
}

export async function refreshTokens(previous) {
  if (!previous.refresh_token) throw new AuthExpiredError("Grok 로그인이 만료됐어요. 다시 연결해 주세요.");
  const values = { grant_type: "refresh_token", refresh_token: previous.refresh_token };
  if (previous.principal_type) values.principal_type = previous.principal_type;
  if (previous.principal_id) values.principal_id = previous.principal_id;
  const { response, data } = await form("/oauth2/token", values);
  if (!response.ok) {
    if (["invalid_grant", "invalid_client"].includes(data?.error) || response.status === 401) {
      throw new AuthExpiredError("Grok 로그인이 만료됐어요. 다시 연결해 주세요.");
    }
    throw new Error(`Grok 로그인 갱신 실패 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`);
  }
  return tokensFromResponse(data, previous);
}

export async function requestUsage(tokens) {
  return request(BILLING_URL, { headers: { Authorization: `Bearer ${tokens.access_token}`,
    "X-XAI-Token-Auth": "xai-grok-cli", Accept: "application/json", "User-Agent": "usage-check/0.1",
    ...(tokens.user_id ? { "x-userid": tokens.user_id } : {}) } });
}

export function normalize(data) {
  const config = data?.config;
  const period = config?.currentPeriod;
  const percent = config?.creditUsagePercent;
  const end = typeof period?.end === "string" ? Date.parse(period.end) : NaN;
  if (period?.type !== "USAGE_PERIOD_TYPE_WEEKLY" || !Number.isFinite(end) ||
      typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("Grok 주간 사용량을 확인하지 못했어요. 해당 계정의 사용량 제공 여부를 확인하거나 잠시 후 다시 조회해 주세요.");
  }
  // Shared subscription allowance, not API spending or this device's message count.
  return { windows: [{ id: "grok-weekly", label: "주간", used_percent: percent, resets_at: Math.floor(end / 1000) }] };
}
