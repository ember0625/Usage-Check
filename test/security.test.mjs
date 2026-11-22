import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { request, AuthExpiredError } from "../src/util.js";

// RELAY_SECRET이 없으면 Codex도 Worker에서 직접 조회해요. 외부 응답은 handler로 바꿔 끼워요.
let mf, kv, store, handler = () => new Response(null, { status: 404 });
const calls = [];
before(async () => {
  const built = await build({ entryPoints: ["src/index.js"], bundle: true, write: false, format: "esm", external: ["cloudflare:workers"] });
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "usage-check",
    modules: true, script: built.outputFiles[0].text, compatibilityDate: "2026-09-01",
    kvNamespaces: ["KV"], durableObjects: { TOKENS: { className: "TokenStore", useSQLite: true } },
    bindings: { DASHBOARD_PASSWORD: "right-password" },
    outboundService: async (req) => { calls.push(new URL(req.url).pathname); return handler(req); },
  }] }));
  kv = await mf.getKVNamespace("KV");
  const ns = await mf.getDurableObjectNamespace("TOKENS");
  store = ns.get(ns.idFromName("main"));
  await kv.put("session:s", "1");
  await kv.put("widget:key", "wkey");
});
after(async () => { await mf?.dispose(); });
const nowSec = () => Math.floor(Date.now() / 1000);
const login = (password, ip) => mf.dispatchFetch("https://worker.test/api/login", {
  method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify({ password }),
});

test("request() turns a hung response into a plain timeout error, never an expired login", async () => {
  const server = createServer(() => {}).listen(0);
  try {
    const err = await request(`http://127.0.0.1:${server.address().port}/`, {}, 50).then(() => null, (e) => e);
    assert.ok(err instanceof Error);
    assert.ok(!(err instanceof AuthExpiredError));
    assert.match(err.message, /응답 시간 초과/);
  } finally {
    server.closeAllConnections(); server.close();
  }
});

test("a network failure while refreshing Claude keeps the refresh token usable", async () => {
  await store.write("claude", { access_token: "old", refresh_token: "keep-me", expires_at: nowSec() - 10 });
  handler = () => { throw new Error("network down"); };
  const res = await mf.dispatchFetch("https://worker.test/api/usage?refresh=1", { headers: { Cookie: "uc_session=s" } });
  const body = await res.json();
  assert.equal(body.claude.usage.ok, false);
  assert.equal(body.claude.usage.needs_reconnect, false, "a timeout or network error is not an expired login");
  const saved = await store.read("claude");
  assert.equal(saved.refresh_token, "keep-me");
  assert.equal(saved.rejected, undefined, "the refresh token is not marked as rejected");
  await store.write("claude", null);
});

test("Codex retries once with a refreshed token after a 401", async () => {
  await store.write("codex", { access_token: "stale", refresh_token: "r1", expires_at: nowSec() + 7200 });
  const seen = [];
  handler = (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "fresh", refresh_token: "r2", expires_in: 3600 });
    if (url.pathname === "/backend-api/wham/usage") {
      const token = req.headers.get("Authorization");
      seen.push(token);
      if (token === "Bearer stale") return new Response("expired", { status: 401 });
      return Response.json({ rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 604800, reset_after_seconds: 1000 } } });
    }
    return new Response(null, { status: 404 });
  };
  const body = await (await mf.dispatchFetch("https://worker.test/api/usage?refresh=1", { headers: { Cookie: "uc_session=s" } })).json();
  assert.deepEqual(seen, ["Bearer stale", "Bearer fresh"]);
  assert.equal(body.codex.usage.ok, true);
  assert.equal(body.codex.usage.windows[0].used_percent, 12);
  assert.equal((await store.read("codex")).access_token, "fresh");
  await store.write("codex", null);
  await store.setState("usage:codex", null);
});

test("the widget does not refresh Claude when Claude is not connected", async () => {
  await store.write("claude", null);
  // 연결이 끊긴 뒤 남은 값이 위젯 새로고침마다 덮어써지지 않아야 해요. (쓰기 낭비)
  const leftover = { ok: false, error: "x", fetched_at: 1 };
  await store.setState("usage:claude", leftover);
  calls.length = 0;
  const res = await mf.dispatchFetch("https://worker.test/api/widget?key=wkey&refresh=1&force=1");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).claude.connected, false);
  assert.deepEqual((await store.getState(["usage:claude"]))["usage:claude"], leftover);
  assert.equal(calls.length, 0);
});

test("login attempts are counted per IP in the Durable Object, even when sent at once", async () => {
  const results = await Promise.all(Array.from({ length: 15 }, () => login("wrong", "203.0.113.1")));
  const codes = results.map((r) => r.status).sort();
  assert.equal(codes.filter((c) => c === 401).length, 10);
  assert.equal(codes.filter((c) => c === 429).length, 5);
  assert.equal((await login("right-password", "203.0.113.1")).status, 429, "blocked even with the right password");
  assert.equal((await kv.list({ prefix: "loginfail:" })).keys.length, 0, "failed logins no longer write to KV");
  // 15분이 지나면 다시 시도할 수 있어요.
  assert.equal(await store.loginAttempt("203.0.113.1", nowSec() + 901), true);
});

test("a successful login clears that IP's failures", async () => {
  for (let i = 0; i < 9; i++) assert.equal((await login("wrong", "203.0.113.2")).status, 401);
  const ok = await login("right-password", "203.0.113.2");
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("Set-Cookie"), /uc_session=/);
  for (let i = 0; i < 10; i++) assert.equal((await login("wrong", "203.0.113.2")).status, 401);
  assert.equal((await login("wrong", "203.0.113.2")).status, 429);
});

test("HTML pages send a Content-Security-Policy", async () => {
  for (const headers of [{}, { Cookie: "uc_session=s" }]) {
    const res = await mf.dispatchFetch("https://worker.test/", { headers });
    const csp = res.headers.get("Content-Security-Policy");
    assert.ok(csp);
    for (const part of ["default-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "font-src https://cdn.jsdelivr.net", "img-src 'self' data:"]) assert.ok(csp.includes(part), part);
    assert.equal(res.headers.get("X-Frame-Options"), "DENY");
  }
});

test("the Codex relay reports an unreadable 200 response instead of crashing", async () => {
  const reports = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url.startsWith("/relay/codex/token")) return res.end(JSON.stringify({ connected: true, access_token: "t" }));
      if (req.url === "/relay/codex/usage") { reports.push(JSON.parse(body)); return res.end("{}"); }
      res.statusCode = 404; res.end("{}");
    });
  }).listen(0);
  // chatgpt.com 요청만 200 OK HTML 차단 페이지로 바꿔요.
  const preload = "data:text/javascript," + encodeURIComponent(`const real = globalThis.fetch;
globalThis.fetch = (url, init) => String(url).startsWith("https://chatgpt.com/") ? Promise.resolve(new Response("<html>blocked</html>", { status: 200 })) : real(url, init);`);
  try {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["--import", preload, "scripts/codex-relay.mjs"], {
        env: { ...process.env, WORKER_URL: `http://127.0.0.1:${server.address().port}`, RELAY_SECRET: "s", GITHUB_REPOSITORY: "" }, stdio: "ignore",
      });
      child.on("exit", resolve);
    });
    assert.equal(code, 1);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].ok, false);
    assert.match(reports[0].error, /응답을 읽을 수 없어요/);
  } finally {
    server.close();
  }
});
