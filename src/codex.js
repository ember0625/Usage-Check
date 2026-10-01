// Codex (ChatGPT 구독) 한도 조회.
// Codex CLI의 기기 코드 로그인과 /backend-api/wham/usage 엔드포인트를 그대로 사용합니다(비공식).
import { AuthExpiredError, decodeJwt, getJson, putJson, readError, toEpochSeconds } from "./util.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
const VERIFY_URL = `${ISSUER}/codex/device`;
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const TOKENS_KEY = "codex:tokens";
const PENDING_KEY = "codex:pending";

export async function startLogin(kv) {
  const res = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`기기 코드 요청 실패: ${await readError(res)}`);
  const data = await res.json();
  const pending = {
    device_auth_id: data.device_auth_id,
    user_code: data.user_code || data.usercode,
    interval: Number(data.interval) || 5,
  };
  await putJson(kv, PENDING_KEY, pending, { expirationTtl: 900 });
  return { url: VERIFY_URL, user_code: pending.user_code, interval: pending.interval };
}

/** 한 번 확인합니다. 아직 승인 전이면 { pending: true }. */
export async function pollLogin(kv) {
  const pending = await getJson(kv, PENDING_KEY);
  if (!pending) throw new Error("로그인 시간이 지났어요. 다시 시작해 주세요.");
  const res = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_auth_id: pending.device_auth_id, user_code: pending.user_code }),
  });
  if (res.status === 403 || res.status === 404) return { pending: true };
  if (!res.ok) throw new Error(`승인 확인 실패: ${await readError(res)}`);
  const code = await res.json();

  const tokenRes = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code.authorization_code,
      redirect_uri: `${ISSUER}/deviceauth/callback`,
      client_id: CLIENT_ID,
      code_verifier: code.code_verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`토큰 교환 실패: ${await readError(tokenRes)}`);
  await saveTokens(kv, await tokenRes.json());
  await kv.delete(PENDING_KEY);
  return { pending: false };
}

async function saveTokens(kv, data, previous) {
  const idToken = data.id_token || previous?.id_token;
  const claims = decodeJwt(idToken) || {};
  const access = decodeJwt(data.access_token) || {};
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || previous?.refresh_token,
    id_token: idToken,
    account_id: claims["https://api.openai.com/auth"]?.chatgpt_account_id || previous?.account_id,
    expires_at: access.exp || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
  await putJson(kv, TOKENS_KEY, tokens);
  return tokens;
}

async function refresh(kv, tokens) {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });
  if (res.status === 400 || res.status === 401) throw new AuthExpiredError(`토큰 갱신 실패: ${await readError(res)}`);
  if (!res.ok) throw new Error(`토큰 갱신 실패: ${await readError(res)}`);
  return saveTokens(kv, await res.json(), tokens);
}

export async function isConnected(kv) {
  return !!(await kv.get(TOKENS_KEY));
}

export async function disconnect(kv) {
  await kv.delete(TOKENS_KEY);
}

/** 만료가 가까우면 갱신해서 유효한 토큰을 돌려줘요. 연결 안 됐으면 null. */
export async function getAccessToken(kv) {
  let tokens = await getJson(kv, TOKENS_KEY);
  if (!tokens) return null;
  if (tokens.expires_at - 600 < Date.now() / 1000) tokens = await refresh(kv, tokens);
  return { access_token: tokens.access_token, account_id: tokens.account_id || null };
}

export async function forceRefresh(kv) {
  const tokens = await getJson(kv, TOKENS_KEY);
  if (!tokens) return null;
  const t = await refresh(kv, tokens);
  return { access_token: t.access_token, account_id: t.account_id || null };
}

/**
 * Worker에서 직접 조회해요. chatgpt.com이 Cloudflare Worker에서 오는 요청을 막는 경우가 있어서,
 * 그럴 땐 GitHub Actions 중계(scripts/codex-relay.mjs)를 써요.
 */
export async function fetchUsage(kv) {
  const t = await getAccessToken(kv);
  if (!t) return null;
  const headers = { Authorization: `Bearer ${t.access_token}`, "User-Agent": "codex-cli", Accept: "application/json" };
  if (t.account_id) headers["ChatGPT-Account-Id"] = t.account_id;
  const res = await fetch(USAGE_URL, { headers });
  if (res.status === 401) throw new AuthExpiredError(`사용량 조회 거부: ${await readError(res)}`);
  if (!res.ok) throw new Error(`사용량 조회 실패: ${await readError(res)}`);
  return normalize(await res.json());
}

function windowLabel(seconds, fallback) {
  const m = Math.round((seconds || 0) / 60);
  if (!m) return fallback;
  if (m === 300) return "5시간";
  if (m === 10080) return "주간";
  if (m % 1440 === 0) return `${m / 1440}일`;
  if (m % 60 === 0) return `${m / 60}시간`;
  return `${m}분`;
}

function toWindow(w, id, fallback, prefix = "") {
  if (!w || typeof w.used_percent !== "number") return null;
  const resetsAt =
    toEpochSeconds(w.reset_at) ??
    (w.reset_after_seconds != null ? Math.floor(Date.now() / 1000) + w.reset_after_seconds : null);
  return {
    id,
    label: prefix + windowLabel(w.limit_window_seconds, fallback),
    used_percent: w.used_percent,
    resets_at: resetsAt,
  };
}

export function normalize(raw) {
  const windows = [];
  const push = (rl, id, prefix) => {
    if (!rl) return;
    const a = toWindow(rl.primary_window, `${id}-primary`, "기본", prefix);
    const b = toWindow(rl.secondary_window, `${id}-secondary`, "보조", prefix);
    if (a) windows.push(a);
    if (b) windows.push(b);
  };
  push(raw?.rate_limit, "codex", "");
  for (const extra of raw?.additional_rate_limits || []) {
    const name = extra.limit_name || extra.metered_feature || extra.limit_id || "추가";
    push(extra.rate_limit, name, `${name} · `);
  }
  return { windows, plan: raw?.plan_type || null, raw };
}
