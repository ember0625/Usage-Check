import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { renderPage } from "../src/page.js";
import { widgetScript } from "../src/widget.js";

let mf, kv;
const outbound = [];
before(async () => {
  const built = await build({ entryPoints: ["src/index.js"], bundle: true, write: false, format: "esm", external: ["cloudflare:workers"] });
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "usage-check",
    modules: true, script: built.outputFiles[0].text, compatibilityDate: "2026-09-01",
    kvNamespaces: ["KV"], durableObjects: { TOKENS: { className: "TokenStore", useSQLite: true } },
    bindings: { DASHBOARD_PASSWORD: "test-password", RELAY_SECRET: "test-relay", GITHUB_TOKEN: "test-github" },
    outboundService: async (request) => { outbound.push(request.url); return new Response(null, { status: 204 }); },
  }] }));
  kv = await mf.getKVNamespace("KV");
  await kv.put("session:test-session", "1");
});
after(async () => { await mf?.dispose(); });
const usage = { windows: [{ id: "GXU_FIVE_HOURLY", label: "5시간", used_percent: 24, resets_at: 1800000000 }] };
const send = (payload, secret = "test-relay") => mf.dispatchFetch("https://worker.test/relay/gemini/usage", {
  method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "X-GitHub-Repository": "owner/repo" }, body: JSON.stringify(payload),
});
const dashboard = (suffix = "") => mf.dispatchFetch("https://worker.test/api/usage" + suffix, { headers: { Cookie: "uc_session=test-session" } });

test("relay auth, validated storage, errors, widget and cookie removal work through the real Worker", async () => {
  assert.equal((await send({ ok: true, data: usage }, "wrong")).status, 401);
  assert.equal(await kv.get("usage:gemini"), null);
  assert.equal((await send({ ok: true, data: { windows: [{ ...usage.windows[0], used_percent: "24" }] } })).status, 400);
  assert.equal((await send({ ok: true, data: { ...usage, cookie: "must-not-store" } })).status, 200);
  let result = await (await dashboard()).json();
  assert.equal(result.gemini.connected, true);
  assert.equal(result.gemini.usage.windows[0].used_percent, 24);
  assert.equal(result.gemini.usage.cookie, undefined);
  assert.equal(result.claude.connected, false);
  assert.equal(result.codex.connected, false);
  const timestamp = result.gemini.usage.fetched_at;

  // Gemini-only setup can trigger the existing combined workflow.
  result = await (await dashboard("?refresh=1")).json();
  assert.equal(result.gemini.dispatch.started, true);
  assert.equal(outbound.length, 1);
  assert.ok(outbound[0].includes("owner/repo/actions/workflows/codex-usage.yml/dispatches"));
  result = await (await dashboard("?refresh=1")).json();
  assert.equal(result.gemini.dispatch.reason, "recent");

  await send({ ok: false, code: "auth", error: "must-not-store" });
  result = await (await dashboard()).json();
  assert.equal(result.gemini.usage.ok, false);
  assert.equal(result.gemini.usage.needs_reconnect, true);
  assert.equal(result.gemini.usage.windows[0].used_percent, 24);
  assert.equal(result.gemini.usage.fetched_at, timestamp);
  assert.ok(!JSON.stringify(result).includes("must-not-store"));

  await kv.put("widget:key", "test-widget");
  assert.equal((await mf.dispatchFetch("https://worker.test/api/widget?key=wrong")).status, 401);
  const widget = await (await mf.dispatchFetch("https://worker.test/api/widget?key=test-widget")).json();
  assert.equal(widget.gemini.windows[0].used_percent, 24);
  assert.equal(widget.gemini.ok, false);

  await send({ ok: true, data: usage });
  result = await (await dashboard()).json();
  assert.equal(result.gemini.usage.needs_reconnect, undefined);
  await send({ ok: false, code: "not_configured" });
  result = await (await dashboard()).json();
  assert.equal(result.gemini.connected, false);
  assert.equal(result.gemini.usage.windows, undefined);
});

test("generated dashboard and Scriptable scripts parse", () => {
  for (const options of [{ authed: true }, { authed: false }, { setupMissing: true }]) {
    const html = renderPage(options);
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(match[1]));
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(widgetScript("https://worker.test", "fake-key")));
});


test("stale dashboard and widget share refresh requests and newly relayed results", async () => {
  await send({ ok: true, data: usage });
  const old = JSON.parse(await kv.get("usage:gemini"));
  old.fetched_at = Math.floor(Date.now() / 1000) - 3600;
  await kv.put("usage:gemini", JSON.stringify(old));
  await kv.delete("dispatch:codex");
  const count = outbound.length;
  const page = await (await dashboard()).json();
  assert.equal(page.gemini.dispatch.started, true);
  assert.equal(outbound.length, count + 1);
  const pending = await (await mf.dispatchFetch("https://worker.test/api/widget?key=test-widget&refresh=1")).json();
  assert.equal(pending.gemini.refreshing, true);
  assert.equal(outbound.length, count + 1, "widget reuses the in-flight request");
  await send({ ok: true, data: { windows: [{ ...usage.windows[0], used_percent: 31 }] } });
  const latestPage = await (await dashboard()).json();
  const latestWidget = await (await mf.dispatchFetch("https://worker.test/api/widget?key=test-widget")).json();
  assert.equal(latestPage.gemini.usage.windows[0].used_percent, 31);
  assert.equal(latestWidget.gemini.windows[0].used_percent, 31);
  assert.equal(latestWidget.gemini.refreshing, false);
  assert.equal(outbound.length, count + 1);
});
