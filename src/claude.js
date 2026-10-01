// Claude (Pro/Max) 구독 한도 조회.
// Claude Code CLI가 쓰는 OAuth 로그인과 /api/oauth/usage 엔드포인트를 그대로 사용합니다(비공식).
import { tokenStore } from "./tokens.js";
import { AuthExpiredError, getJson, pkce, putJson, randomToken, readError, toEpochSeconds } from "./util.js";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const SCOPE = "user:profile";
const PENDING_KEY = "claude:pending";

const LABELS = {
  five_hour: "5시간",
  seven_day: "주간 (전체 모델)",
  seven_day_opus: "주간 (Opus)",
  seven_day_sonnet: "주간 (Sonnet)",
  seven_day_oauth_apps: "주간 (연동 앱)",
};

export async function startLogin(env) {
  const { verifier, challenge } = await pkce();
  const state = randomToken(24);
  await putJson(env.KV, PENDING_KEY, { verifier, state }, { expirationTtl: 900 });
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

export async function finishLogin(env, pasted) {
  const pending = await getJson(env.KV, PENDING_KEY);
  if (!pending) throw new Error("로그인 시간이 지났어요. 'Claude 로그인 열기'부터 다시 해주세요.");
  // 콜백 페이지는 "code#state" 형식으로 보여줍니다.
  const [code, state] = String(pasted || "").trim().split("#");
  if (!code) throw new Error("코드를 붙여넣어 주세요.");
  if (state && state !== pending.state) throw new Error("코드가 가장 최근 로그인 요청과 맞지 않아요. 'Claude 로그인 열기'부터 다시 해주세요.");

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
  await tokenStore(env).put("claude", tokensFromResponse(await res.json()));
  await env.KV.delete(PENDING_KEY);
}

function tokensFromResponse(data, previous) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || previous?.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
}

/** refresh token으로 새 토큰을 받아요. 저장과 순서 관리는 TokenStore가 해요. */
export async function refreshTokens(tokens) {
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
  return tokensFromResponse(await res.json(), tokens);
}

export async function isConnected(env) {
  return !!(await tokenStore(env).get("claude"));
}

export async function disconnect(env) {
  await tokenStore(env).remove("claude");
}

/**
 * 진단용: 일부러 틀린 값으로 요청해서 서버가 어떻게 답하는지 봐요.
 * 400/401이면 요청은 정상적으로 처리된 것이고, 403이면 이 서버에서 오는 요청 자체가 막힌 거예요.
 */
export async function diagnose() {
  const probe = async (name, url, init) => {
    try {
      const res = await fetch(url, init);
      const text = (await res.text().catch(() => "")).trim();
      return { name, status: res.status, body: text.startsWith("<") ? "(HTML 응답)" : text.slice(0, 300) };
    } catch (err) {
      return { name, status: null, body: String(err) };
    }
  };
  const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return Promise.all([
    probe("토큰 교환 (틀린 코드)", TOKEN_URL, json({
      grant_type: "authorization_code", code: "diagnostic", redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID, code_verifier: "diagnostic", state: "diagnostic",
    })),
    probe("토큰 갱신 (틀린 토큰)", TOKEN_URL, json({
      grant_type: "refresh_token", refresh_token: "diagnostic", client_id: CLIENT_ID, scope: SCOPE,
    })),
    probe("사용량 조회 (틀린 토큰)", USAGE_URL, {
      headers: { Authorization: "Bearer diagnostic", "anthropic-beta": "oauth-2025-04-20" },
    }),
  ]);
}

export async function fetchUsage(env) {
  const store = tokenStore(env);
  let tokens = await store.fresh("claude");
  if (!tokens) return null;

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
    tokens = await store.fresh("claude", { force: true, failedAccess: tokens.access_token });
    res = await call(tokens);
  }
  // 401만 로그인 만료로 봐요. 403은 Anthropic 쪽 일시적 거부일 수 있어서 다음 갱신 때 다시 시도해요.
  if (res.status === 401) throw new AuthExpiredError(`사용량 조회 거부: ${await readError(res)}`);
  if (!res.ok) throw new Error(`사용량 조회 실패: ${await readError(res)}`);
  return normalize(await res.json());
}

function normalize(raw) {
  const windows = [];
  for (const [key, w] of Object.entries(raw || {})) {
    // 이름을 아는 한도만 보여줘요. 내부 코드명(예: iguana_necktie)은 숨겨요.
    if (!LABELS[key]) continue;
    if (!w || typeof w !== "object" || typeof w.utilization !== "number") continue;
    windows.push({
      id: key,
      label: LABELS[key],
      used_percent: w.utilization,
      resets_at: toEpochSeconds(w.resets_at),
    });
  }
  const order = Object.keys(LABELS);
  windows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { windows, raw };
}
