// Claude (Pro/Max) 구독 한도 조회.
// Claude Code CLI가 쓰는 OAuth 로그인과 /api/oauth/usage 엔드포인트를 그대로 사용합니다(비공식).
import { AuthExpiredError, getJson, pkce, putJson, randomToken, readError, toEpochSeconds } from "./util.js";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const SCOPE = "user:profile";
const TOKENS_KEY = "claude:tokens";
const PENDING_KEY = "claude:pending";

const LABELS = {
  five_hour: "5시간",
  seven_day: "주간 (전체 모델)",
  seven_day_opus: "주간 (Opus)",
  seven_day_sonnet: "주간 (Sonnet)",
  seven_day_oauth_apps: "주간 (연동 앱)",
};

export async function startLogin(kv) {
  const { verifier, challenge } = await pkce();
  const state = randomToken(24);
  await putJson(kv, PENDING_KEY, { verifier, state }, { expirationTtl: 900 });
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  return { url: url.toString() };
}

export async function finishLogin(kv, pasted) {
  const pending = await getJson(kv, PENDING_KEY);
  if (!pending) throw new Error("로그인 시간이 지났어요. 다시 시작해 주세요.");
  // 콜백 페이지는 "code#state" 형식으로 보여줍니다.
  const [code, state] = String(pasted || "").trim().split("#");
  if (!code) throw new Error("코드를 붙여넣어 주세요.");
  if (state && state !== pending.state) throw new Error("코드가 이번 로그인 요청과 맞지 않아요. 다시 시작해 주세요.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pending.verifier,
      state: pending.state,
    }),
  });
  if (!res.ok) throw new Error(`토큰 교환 실패: ${await readError(res)}`);
  await saveTokens(kv, await res.json());
  await kv.delete(PENDING_KEY);
}

async function saveTokens(kv, data, previous) {
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || previous?.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
  await putJson(kv, TOKENS_KEY, tokens);
  return tokens;
}

async function refresh(kv, tokens) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: CLIENT_ID,
      scope: SCOPE,
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

export async function fetchUsage(kv) {
  let tokens = await getJson(kv, TOKENS_KEY);
  if (!tokens) return null;
  if (tokens.expires_at - 300 < Date.now() / 1000) tokens = await refresh(kv, tokens);

  const call = (t) =>
    fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${t.access_token}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
      },
    });
  let res = await call(tokens);
  if (res.status === 401) {
    tokens = await refresh(kv, tokens);
    res = await call(tokens);
  }
  if (res.status === 401 || res.status === 403) throw new AuthExpiredError(`사용량 조회 거부: ${await readError(res)}`);
  if (!res.ok) throw new Error(`사용량 조회 실패: ${await readError(res)}`);
  return normalize(await res.json());
}

function normalize(raw) {
  const windows = [];
  for (const [key, w] of Object.entries(raw || {})) {
    if (!w || typeof w !== "object" || typeof w.utilization !== "number") continue;
    windows.push({
      id: key,
      label: LABELS[key] || key,
      used_percent: w.utilization,
      resets_at: toEpochSeconds(w.resets_at),
    });
  }
  const order = Object.keys(LABELS);
  windows.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  return { windows, raw };
}
