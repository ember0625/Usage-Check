import * as claude from "./claude.js";
import * as codex from "./codex.js";
import * as grok from "./grok.js";
import { renderGrokPage } from "./grok-page.js";
import { validateUsage as validateGeminiUsage, ERROR_MESSAGES as GEMINI_ERRORS } from "./gemini.js";
import { ICON_SVG, renderPage } from "./page.js";
import { widgetScript } from "./widget.js";
import { tokenStore } from "./tokens.js";
import { AuthExpiredError, randomToken } from "./util.js";

// 토큰 저장소 Durable Object (wrangler.toml의 TOKENS 바인딩)
export { TokenStore } from "./tokens.js";

const PROVIDERS = { claude, codex, grok };
const SESSION_COOKIE = "uc_session";
const SESSION_TTL = 60 * 60 * 24 * 30;

// 갱신 간격(초). 서비스 쪽에 너무 자주 묻지 않도록 정한 값이에요.
const CLAUDE_WIDGET_MAX_AGE = 600; // 위젯이 다시 그려질 때 Claude 값이 이보다 오래됐으면 새로 조회
const RELAY_MAX_AGE = 900; // Codex·Gemini 값이 이보다 오래됐으면 GitHub Actions 중계를 요청
const RELAY_MIN_GAP = 180; // 중계 요청 사이의 최소 간격
const LOGIN_TOKEN_KEY = "claudelogin";
const LOGIN_TOKEN_TTL = 1800;

// 화면 HTML과 manifest는 요청마다 바뀌지 않아서 한 번만 만들어 둬요. (무료 플랜 CPU 시간 절약)
const PAGES = {
  setup: renderPage({ setupMissing: true }),
  login: renderPage({ authed: false }),
  dashboard: renderPage({ authed: true }),
};
const MANIFEST = JSON.stringify({
  name: "AI 사용량",
  short_name: "사용량",
  start_url: "/",
  display: "standalone",
  background_color: "#0C0D10",
  theme_color: "#0C0D10",
  icons: [
    {
      src: "data:image/svg+xml," + encodeURIComponent(ICON_SVG),
      sizes: "any",
      type: "image/svg+xml",
    },
  ],
});

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([refreshAll(env), refreshRelayIfStale(env)]));
  },
};

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!env.DASHBOARD_PASSWORD) {
    return html(PAGES.setup);
  }

  if (pathname === "/api/login" && request.method === "POST") {
    return login(request, env);
  }

  // 로그인 쿠키가 필요 없는 경로는 세션 확인(KV 읽기) 전에 처리해요.
  if (pathname === "/manifest.webmanifest") return manifest();
  if (pathname.startsWith("/relay/")) return relay(request, env, pathname);
  if (pathname === "/api/widget" && request.method === "GET") return widgetData(env, url);

  const authed = await isAuthed(request, env);

  if (pathname === "/" || pathname === "/index.html") {
    return html(authed ? PAGES.dashboard : PAGES.login);
  }

  // 로그인 페이지로 바로 보내는 링크. 비동기 처리 없이 열 수 있어서 휴대폰 팝업 차단에 걸리지 않아요.
  // 홈 화면 앱에서 연 링크는 Safari로 넘어가 쿠키가 없을 수 있어서, 1회용 토큰(t)도 받아요.
  if (pathname === "/claude/login" && request.method === "GET") {
    const t = url.searchParams.get("t");
    const saved = t ? await stateGet(env, LOGIN_TOKEN_KEY) : null;
    const viaToken = !!saved && saved.exp > now() && (await safeEqual(t, saved.t));
    if (!authed && !viaToken) return Response.redirect(new URL("/", url), 302);
    if (viaToken) await stateSet(env, LOGIN_TOKEN_KEY, null);
    const { url: target } = await claude.startLogin(env);
    return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
  }

  if (!authed) return json({ error: "unauthorized" }, 401);
  if (request.method === "POST" && request.headers.get("Content-Type")?.includes("application/json") !== true) {
    return json({ error: "JSON 요청만 허용돼요." }, 415);
  }

  if (pathname === "/api/logout" && request.method === "POST") return logout(request, env);

  if (pathname === "/grok" && request.method === "GET") return html(renderGrokPage());
  if ((pathname === "/api/grok/status" && request.method === "GET") ||
      (pathname === "/api/grok/refresh" && request.method === "POST")) {
    let snap = await tokenStore(env).overview(["usage:grok"]);
    if (snap.connected.grok && (request.method === "POST" || age(snap.state["usage:grok"]) >= CLAUDE_WIDGET_MAX_AGE)) {
      await refreshOne(env, "grok");
      snap = await tokenStore(env).overview(["usage:grok"]);
    }
    return json({ connected: snap.connected.grok, usage: snap.state["usage:grok"], now: now() });
  }

  if (pathname === "/api/usage" && request.method === "GET") {
    let dispatch, out;
    if (url.searchParams.get("refresh") === "1") {
      [, dispatch] = await Promise.all([refreshAll(env), dispatchRelay(env)]);
      out = await readAll(env);
    } else {
      // 중계 요청은 사용량을 바꾸지 않아서, 처음 읽은 값을 그대로 화면에 써요.
      const snap = await snapshot(env);
      dispatch = await refreshRelayIfStale(env, false, snap);
      out = await overviewFrom(env, snap);
    }
    if (dispatch) out.codex.dispatch = dispatch;
    if (dispatch && out.gemini.connected) out.gemini.dispatch = dispatch;
    return json(out);
  }

  if (pathname === "/api/claude/diag" && request.method === "GET") {
    const [results, history] = await Promise.all([claude.diagnose(), tokenStore(env).history()]);
    // history: 토큰 갱신·거부 기록 (토큰 값은 들어 있지 않아요)
    return json({ checked_at: new Date().toISOString(), results, history });
  }

  if (pathname === "/api/widget/key" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return json({ key: await widgetKey(env, !!body.rotate) });
  }
  if (pathname === "/widget.js" && request.method === "GET") {
    const key = await widgetKey(env, false);
    return new Response(widgetScript(url.origin, key), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const m = pathname.match(/^\/api\/(claude|codex|grok)\/(start|finish|poll|disconnect)$/);
  if (m && request.method === "POST") {
    const [, name, action] = m;
    const p = PROVIDERS[name];
    const body = await request.json().catch(() => ({}));
    if (action === "start") return json(await p.startLogin(env));
    if (action === "finish" && name === "claude") {
      await p.finishLogin(env, body.code);
      ctx.waitUntil(refreshOne(env, name));
      return json({ ok: true });
    }
    if (action === "poll" && (name === "codex" || name === "grok")) {
      const r = await p.pollLogin(env);
      if (!r.pending && !r.error) {
        await stateSet(env, `usage:${name}`, null);
        if (name === "grok") await refreshOne(env, name);
        else ctx.waitUntil(refreshOne(env, name));
      }
      return json(r);
    }
    if (action === "disconnect") {
      await p.disconnect(env);
      await stateSet(env, `usage:${name}`, null);
      return json({ ok: true });
    }
  }

  return json({ error: "not found" }, 404);
}

// chatgpt.com이 Cloudflare Worker에서 오는 요청을 막아서, RELAY_SECRET이 있으면
// Codex 조회는 GitHub Actions(scripts/codex-relay.mjs)가 대신 해요.
function usesRelay(env, name) {
  return name === "codex" && !!env.RELAY_SECRET;
}

async function refreshOne(env, name) {
  if (usesRelay(env, name)) return;
  const p = PROVIDERS[name];
  let entry;
  try {
    const usage = await p.fetchUsage(env);
    if (!usage) {
      await stateSet(env, `usage:${name}`, null);
      return;
    }
    entry = { ok: true, fetched_at: now(), ...usage };
  } catch (err) {
    // 이전 값은 실패했을 때만 필요해서, 성공하면 읽지 않아요.
    const prev = await stateGet(env, `usage:${name}`);
    entry = {
      ...(prev || {}),
      ok: false,
      error: err.message || String(err),
      needs_reconnect: err instanceof AuthExpiredError,
      error_at: now(),
    };
  }
  await stateSet(env, `usage:${name}`, entry);
}

async function refreshAll(env) {
  await Promise.all(Object.keys(PROVIDERS).map((n) => refreshOne(env, n)));
}

// 대시보드·위젯·중계 요청이 쓰는 값을 저장소에 한 번만 물어서 가져와요.
// 결과: { connected: { claude, codex }, "usage:claude": …, "usage:codex": …, … }
const SNAPSHOT_KEYS = ["usage:claude", "usage:codex", "usage:gemini", "usage:grok", "dispatch:codex", LOGIN_TOKEN_KEY];

async function snapshot(env) {
  const { connected, state } = await tokenStore(env).overview(SNAPSHOT_KEYS);
  return { connected, ...state };
}

async function readAll(env, opts) {
  return overviewFrom(env, await snapshot(env), opts);
}

// 결과는 항상 같은 순서(claude → codex → gemini)로 담아요.
async function overviewFrom(env, snap, { skipLoginToken = false } = {}) {
  const out = {};
  for (const name of Object.keys(PROVIDERS)) {
    const relayMode = usesRelay(env, name);
    let usage = snap[`usage:${name}`];
    // 중계 모드에선 Worker가 직접 조회하던 시절의 오래된 결과는 보여주지 않아요.
    if (relayMode && usage && usage.via !== "relay") usage = null;
    out[name] = { connected: snap.connected[name], usage, relay: relayMode };
  }
  const geminiUsage = snap["usage:gemini"];
  out.gemini = { connected: geminiUsage?.configured === true, usage: geminiUsage, relay: true };
  if (!skipLoginToken && (!out.claude.connected || out.claude.usage?.needs_reconnect)) {
    out.claude.login_url = `/claude/login?t=${await claudeLoginToken(env, snap[LOGIN_TOKEN_KEY])}`;
  }
  out.now = now();
  return out;
}

// Claude 로그인 링크에 붙는 1회용 토큰이에요.
// 대시보드가 상태를 주기적으로 확인해도 쓰기가 늘지 않게, 유효 시간이 10분 넘게 남은 토큰은 다시 써요.
async function claudeLoginToken(env, saved) {
  if (saved && saved.exp - now() > 600) return saved.t;
  const t = randomToken(24);
  await stateSet(env, LOGIN_TOKEN_KEY, { t, exp: now() + LOGIN_TOKEN_TTL });
  return t;
}

// ---- 새로고침 시 Codex·Gemini 중계 즉시 실행 ----

// GITHUB_TOKEN(이 레포의 Actions 쓰기 권한만 있는 토큰)이 있으면 워크플로를 바로 실행해요.
// 연타로 워크플로가 겹치지 않게 3분에 한 번까지만 실행해요.
async function dispatchRelay(env, snap) {
  snap ??= await snapshot(env);
  if (!env.RELAY_SECRET || (!snap.connected.codex && !snap["usage:gemini"]?.configured)) return null;
  const token = (env.GITHUB_TOKEN || "").trim();
  if (!token) return { started: false, reason: "no_token" };
  const last = Number(snap["dispatch:codex"]) || 0;
  if (now() - last < RELAY_MIN_GAP) return { started: false, reason: "recent", at: last };

  // 레포 이름은 중계 워크플로가 처음 실행될 때 자동으로 저장돼요. 직접 정하고 싶으면 GITHUB_REPO 변수를 넣어요.
  const repo = env.GITHUB_REPO || (await env.KV.get("github:repo"));
  if (!repo) {
    return {
      started: false,
      reason: "error",
      error: "아직 레포 이름을 몰라요. GitHub → Actions → 'Codex·Gemini 사용량 중계' → Run workflow를 한 번 실행해 주세요.",
    };
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/codex-usage.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "usage-check",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res) return { started: false, reason: "error", error: "중계 요청에 연결하지 못했어요. 저장된 사용량을 표시합니다." };
  if (res.status !== 204) {
    const hint =
      res.status === 401
        ? "GITHUB_TOKEN이 틀렸거나 만료됐어요."
        : res.status === 403 || res.status === 404
          ? "GITHUB_TOKEN에 이 레포의 Actions 쓰기 권한이 없어요."
          : (await res.text().catch(() => "")).slice(0, 200);
    return { started: false, reason: "error", error: `중계 즉시 조회 실패 (HTTP ${res.status}): ${hint}` };
  }
  await stateSet(env, "dispatch:codex", now());
  return { started: true, at: now() };
}

// 예약 작업·사이트·위젯이 동일한 서버 캐시의 신선도를 기준으로 중계를 요청해요.
async function refreshRelayIfStale(env, force = false, snap) {
  snap ??= await snapshot(env);
  const xu = snap["usage:codex"];
  const gu = snap["usage:gemini"];
  if (force || (snap.connected.codex && usesRelay(env, "codex") && age(xu) >= RELAY_MAX_AGE) || (gu?.configured && age(gu) >= RELAY_MAX_AGE)) return dispatchRelay(env, snap);
  return null;
}

// 마지막으로 조회(성공 또는 실패)한 뒤 지난 시간(초)
function age(u) {
  return now() - Math.max(u?.fetched_at || 0, u?.error_at || 0);
}

// ---- iOS 위젯 (Scriptable) ----

async function widgetKey(env, rotate) {
  let key = rotate ? null : await env.KV.get("widget:key");
  if (!key) {
    key = randomToken(24);
    await env.KV.put("widget:key", key);
  }
  return key;
}

async function widgetData(env, url) {
  const key = await env.KV.get("widget:key");
  const given = url.searchParams.get("key") || "";
  if (!key || !(await safeEqual(given, key))) return json({ error: "unauthorized" }, 401);

  // 위젯이 다시 그려질 때 오래된 값이면 새로 조회해요.
  // 너무 자주 조회하지 않게 Claude는 10분, Codex·Gemini는 15분 지난 경우에만 해요.
  // 위젯의 새로고침 버튼(force=1)은 이 간격을 무시해요. 중계 요청은 3분 제한이 따로 있어요.
  let relayRefreshing = false;
  let relayDispatch = null;
  let snap = await snapshot(env);
  if (url.searchParams.get("refresh") === "1") {
    const force = url.searchParams.get("force") === "1";
    const refreshClaude = force || age(snap["usage:claude"]) >= CLAUDE_WIDGET_MAX_AGE;
    const refreshGrok = snap.connected.grok && (force || age(snap["usage:grok"]) >= CLAUDE_WIDGET_MAX_AGE);
    const jobs = [];
    if (refreshClaude) jobs.push(refreshOne(env, "claude"));
    if (refreshGrok) jobs.push(refreshOne(env, "grok"));
    jobs.push(refreshRelayIfStale(env, force, snap).then((d) => { relayRefreshing = !!d?.started || d?.reason === "recent"; relayDispatch = d; }));
    await Promise.all(jobs);
    // 새로 조회했거나 중계 요청 시각이 바뀌었을 때만 다시 읽어요.
    if (refreshClaude || refreshGrok || relayDispatch?.started) snap = await snapshot(env);
  }

  const all = await overviewFrom(env, snap, { skipLoginToken: true });
  const dispatchedAt = Number(snap["dispatch:codex"]) || 0;
  const pending = (p) => p.connected && now() - dispatchedAt < RELAY_MIN_GAP && dispatchedAt > Math.max(p.usage?.fetched_at || 0, p.usage?.error_at || 0);
  const pick = (p) => ({
    connected: p.connected,
    ok: p.usage?.ok ?? null,
    fetched_at: p.usage?.fetched_at ?? null,
    error_at: p.usage?.error_at ?? null,
    windows: (p.usage?.windows || []).map(({ label, used_percent, resets_at }) => ({ label, used_percent, resets_at })),
  });
  return json({
    claude: pick(all.claude),
    grok: pick(all.grok),
    codex: { ...pick(all.codex), refreshing: (relayRefreshing && all.codex.connected) || pending(all.codex), dispatch: relayDispatch },
    gemini: { ...pick(all.gemini), refreshing: (relayRefreshing && all.gemini.connected) || pending(all.gemini), dispatch: all.gemini.connected ? relayDispatch : null },
    now: all.now,
  });
}

// ---- GitHub Actions 중계 (Codex·Gemini) ----

async function relay(request, env, pathname) {
  if (!env.RELAY_SECRET) return json({ error: "RELAY_SECRET이 설정되지 않았어요." }, 404);
  const auth = request.headers.get("Authorization") || "";
  if (!(await safeEqual(auth.trim(), `Bearer ${env.RELAY_SECRET.trim()}`))) return json({ error: "unauthorized" }, 401);

  if (pathname === "/relay/gemini/usage" && request.method === "POST") {
    const text = await request.text();
    if (text.length > 8192) return json({ error: "요청이 너무 커요." }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "잘못된 요청" }, 400); }
    let entry;
    if (body?.ok === true) {
      let usage;
      try { usage = validateGeminiUsage(body.data); } catch { return json({ error: "잘못된 사용량 형식" }, 400); }
      entry = { ...usage, configured: true, ok: true, via: "relay", fetched_at: now() };
    } else if (body?.ok === false && typeof body.code === "string" && Object.hasOwn(GEMINI_ERRORS, body.code)) {
      const configured = body.code !== "not_configured";
      const previous = configured ? await stateGet(env, "usage:gemini") : null;
      // 쿠키 삭제 시 이전 계정의 수치를 지워요. 오류 때는 마지막 성공값을 보존해요.
      entry = { ...(previous || {}), configured, ok: false, via: "relay", error: GEMINI_ERRORS[body.code],
        needs_reconnect: body.code === "auth", error_at: now() };
    } else return json({ error: "잘못된 요청" }, 400);
    await stateSet(env, "usage:gemini", entry);
    const repo = request.headers.get("X-GitHub-Repository") || "";
    if (/^[\w.-]+\/[\w.-]+$/.test(repo) && repo !== (await env.KV.get("github:repo"))) await env.KV.put("github:repo", repo);
    return json({ ok: true });
  }

  if (pathname === "/relay/codex/token" && request.method === "GET") {
    // 중계 워크플로가 자기 레포 이름을 알려줘요. 새로고침 때 이 레포의 워크플로를 실행해요.
    // (레포를 복사해 쓰는 사람마다 레포 이름이 달라서, 코드에 박아두지 않고 이렇게 알아내요.)
    const repo = request.headers.get("X-GitHub-Repository") || "";
    if (/^[\w.-]+\/[\w.-]+$/.test(repo) && repo !== (await env.KV.get("github:repo"))) {
      await env.KV.put("github:repo", repo);
    }
    const force = new URL(request.url).searchParams.get("force") === "1";
    try {
      const t = force ? await codex.forceRefresh(env) : await codex.getAccessToken(env);
      return json(t ? { connected: true, ...t } : { connected: false });
    } catch (err) {
      await saveRelayError(env, err.message, err instanceof AuthExpiredError);
      return json({ error: err.message }, 502);
    }
  }

  if (pathname === "/relay/codex/usage" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: "잘못된 요청" }, 400);
    if (body.ok) {
      await stateSet(env, "usage:codex", { ok: true, via: "relay", fetched_at: now(), ...codex.normalize(body.data) });
    } else {
      await saveRelayError(env, String(body.error || "알 수 없는 오류"), body.status === 401);
    }
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

async function saveRelayError(env, message, needsReconnect) {
  const prev = await stateGet(env, "usage:codex");
  await stateSet(env, "usage:codex", {
    ...(prev || {}),
    ok: false,
    via: "relay",
    error: message,
    needs_reconnect: needsReconnect,
    error_at: now(),
  });
}

// ---- 인증 ----

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const failKey = `loginfail:${ip}`;
  const fails = Number(await env.KV.get(failKey)) || 0;
  if (fails >= 10) return json({ error: "시도가 너무 많아요. 15분 뒤에 다시 해주세요." }, 429);

  if (!(await safeEqual(String(body.password || ""), env.DASHBOARD_PASSWORD))) {
    await env.KV.put(failKey, String(fails + 1), { expirationTtl: 900 });
    return json({ error: "비밀번호가 틀렸어요." }, 401);
  }
  const token = randomToken(32);
  await env.KV.put(`session:${token}`, "1", { expirationTtl: SESSION_TTL });
  return json({ ok: true }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`,
  });
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.KV.delete(`session:${token}`);
  return json({ ok: true }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  });
}

async function isAuthed(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  return !!token && !!(await env.KV.get(`session:${token}`));
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ---- 자주 바뀌는 값 저장 (Durable Object, tokens.js) ----

async function stateGet(env, key) {
  return tokenStore(env).getOne(key);
}

async function stateSet(env, key, value) {
  await tokenStore(env).setState(key, value);
}

// ---- 응답 헬퍼 ----

function now() {
  return Math.floor(Date.now() / 1000);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function html(body) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function manifest() {
  return new Response(MANIFEST, { headers: { "Content-Type": "application/manifest+json" } });
}

