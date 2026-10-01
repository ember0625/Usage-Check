import * as claude from "./claude.js";
import * as codex from "./codex.js";
import { ICON_SVG, renderPage } from "./page.js";
import { AuthExpiredError, getJson, putJson, randomToken } from "./util.js";

const PROVIDERS = { claude, codex };
const SESSION_COOKIE = "uc_session";
const SESSION_TTL = 60 * 60 * 24 * 30;

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshAll(env));
  },
};

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!env.DASHBOARD_PASSWORD) {
    return html(renderPage({ setupMissing: true }));
  }

  if (pathname === "/api/login" && request.method === "POST") {
    return login(request, env);
  }

  const authed = await isAuthed(request, env);

  if (pathname === "/" || pathname === "/index.html") {
    return html(renderPage({ authed }));
  }
  if (pathname === "/manifest.webmanifest") return manifest();

  if (!authed) return json({ error: "unauthorized" }, 401);
  if (request.method === "POST" && request.headers.get("Content-Type")?.includes("application/json") !== true) {
    return json({ error: "JSON 요청만 허용돼요." }, 415);
  }

  if (pathname === "/api/logout" && request.method === "POST") return logout(request, env);

  if (pathname === "/api/usage" && request.method === "GET") {
    if (url.searchParams.get("refresh") === "1") await refreshAll(env);
    return json(await readAll(env));
  }

  const m = pathname.match(/^\/api\/(claude|codex)\/(start|finish|poll|disconnect)$/);
  if (m && request.method === "POST") {
    const [, name, action] = m;
    const p = PROVIDERS[name];
    const body = await request.json().catch(() => ({}));
    if (action === "start") return json(await p.startLogin(env.KV));
    if (action === "finish" && name === "claude") {
      await p.finishLogin(env.KV, body.code);
      ctx.waitUntil(refreshOne(env, name));
      return json({ ok: true });
    }
    if (action === "poll" && name === "codex") {
      const r = await p.pollLogin(env.KV);
      if (!r.pending) ctx.waitUntil(refreshOne(env, name));
      return json(r);
    }
    if (action === "disconnect") {
      await p.disconnect(env.KV);
      await env.KV.delete(`usage:${name}`);
      return json({ ok: true });
    }
  }

  return json({ error: "not found" }, 404);
}

async function refreshOne(env, name) {
  const p = PROVIDERS[name];
  const prev = await getJson(env.KV, `usage:${name}`);
  let entry;
  try {
    const usage = await p.fetchUsage(env.KV);
    if (!usage) {
      await env.KV.delete(`usage:${name}`);
      return;
    }
    entry = { ok: true, fetched_at: now(), ...usage };
  } catch (err) {
    entry = {
      ...(prev || {}),
      ok: false,
      error: err.message || String(err),
      needs_reconnect: err instanceof AuthExpiredError,
      error_at: now(),
    };
  }
  await putJson(env.KV, `usage:${name}`, entry);
}

async function refreshAll(env) {
  await Promise.all(Object.keys(PROVIDERS).map((n) => refreshOne(env, n)));
}

async function readAll(env) {
  const out = {};
  for (const [name, p] of Object.entries(PROVIDERS)) {
    const [connected, usage] = await Promise.all([p.isConnected(env.KV), getJson(env.KV, `usage:${name}`)]);
    out[name] = { connected, usage };
  }
  out.now = now();
  return out;
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
  return new Response(
    JSON.stringify({
      name: "AI 사용량",
      short_name: "사용량",
      start_url: "/",
      display: "standalone",
      background_color: "#0f1115",
      theme_color: "#0f1115",
      icons: [
        {
          src: "data:image/svg+xml," + encodeURIComponent(ICON_SVG),
          sizes: "any",
          type: "image/svg+xml",
        },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
