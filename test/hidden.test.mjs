import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { widgetScript } from "../src/widget.js";

// 구독을 쉬는 서비스를 숨기는 설정: 대시보드·위젯에서 빠지고 자동 조회도 하지 않아요.
let mf, kv, store;
const calls = [];
before(async () => {
  const built = await build({ entryPoints: ["src/index.js"], bundle: true, write: false, format: "esm", external: ["cloudflare:workers"] });
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "usage-check",
    modules: true, script: built.outputFiles[0].text, compatibilityDate: "2026-09-01",
    kvNamespaces: ["KV"], durableObjects: { TOKENS: { className: "TokenStore", useSQLite: true } },
    bindings: { DASHBOARD_PASSWORD: "pw" },
    outboundService: async (req) => {
      calls.push(new URL(req.url).hostname);
      return Response.json({ five_hour: { utilization: 10, resets_at: null } });
    },
  }] }));
  kv = await mf.getKVNamespace("KV");
  const ns = await mf.getDurableObjectNamespace("TOKENS");
  store = ns.get(ns.idFromName("main"));
  await kv.put("session:s", "1");
  await kv.put("widget:key", "wkey");
  await store.write("claude", { access_token: "a", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 7200 });
});
after(async () => { await mf?.dispose(); });
const authed = { Cookie: "uc_session=s" };
const settings = (body) => mf.dispatchFetch("https://worker.test/api/settings", {
  method: "POST", headers: { ...authed, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("the hidden list is validated, saved and returned to the dashboard and widget", async () => {
  assert.equal((await settings({ hidden: "grok" })).status, 400);
  assert.equal((await mf.dispatchFetch("https://worker.test/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
  const saved = await (await settings({ hidden: ["grok", "nope", "gemini", "grok"] })).json();
  assert.deepEqual(saved.hidden, ["gemini", "grok"], "unknown names and duplicates are dropped, order is fixed");
  const dash = await (await mf.dispatchFetch("https://worker.test/api/usage", { headers: authed })).json();
  assert.deepEqual(dash.hidden, ["gemini", "grok"]);
  const widget = await (await mf.dispatchFetch("https://worker.test/api/widget?key=wkey")).json();
  assert.deepEqual(widget.hidden, ["gemini", "grok"]);
});

test("a hidden service is not fetched by the dashboard refresh or the widget", async () => {
  await settings({ hidden: ["claude"] });
  calls.length = 0;
  await mf.dispatchFetch("https://worker.test/api/usage?refresh=1", { headers: authed });
  await mf.dispatchFetch("https://worker.test/api/widget?key=wkey&refresh=1&force=1");
  assert.equal(calls.filter((h) => h.endsWith("anthropic.com")).length, 0);

  await settings({ hidden: [] });
  calls.length = 0;
  await mf.dispatchFetch("https://worker.test/api/usage?refresh=1", { headers: authed });
  assert.equal(calls.filter((h) => h.endsWith("anthropic.com")).length, 1, "shown again, so it is fetched again");
});

function runWidget(family, data, parameter = "") {
  const texts = [];
  class Stack {
    addStack() { return new Stack(); }
    addText(t) { texts.push(t); return {}; }
    addImage() { return {}; }
    addSpacer() {} layoutVertically() {} layoutHorizontally() {} bottomAlignContent() {} centerAlignContent() {} setPadding() {}
  }
  const context = {
    config: { runsInWidget: true, widgetFamily: family }, args: { widgetParameter: parameter },
    Script: { name: () => "t", setWidget() {}, complete() {} },
    Color: class { constructor(v) { this.value = v; } }, Size: class { constructor(w, h) { this.width = w; this.height = h; } },
    ListWidget: Stack, Point: class {}, Rect: class { constructor(x, y, w, h) { Object.assign(this, { width: w, height: h }); } },
    Path: class { addRoundedRect(r) { this.rect = r; } addEllipse() {} move() {} addLine() {} },
    DrawContext: class { addPath() {} setFillColor() {} setStrokeColor() {} setLineWidth() {} fillPath() {} strokePath() {} fillEllipse() {} getImage() { return {}; } },
    Device: { screenSize: () => ({ width: 390, height: 844 }) },
    Data: { fromBase64String: (s) => Buffer.from(s, "base64") }, Image: { fromData: () => ({}) },
    DateFormatter: class { string() { return ""; } }, Font: new Proxy({}, { get: () => () => ({}) }),
    SFSymbol: { named: () => ({ image: {}, applyFont() {} }) },
    Request: class { async loadJSON() { return data; } },
  };
  return runInNewContext("(async () => {" + widgetScript("https://x.test", "k") + "})()", context).then(() => texts);
}

test("the widget leaves out hidden services unless the Parameter names them", async () => {
  const p = { connected: true, ok: true, fetched_at: 1, windows: [{ label: "주간", used_percent: 5, resets_at: null }] };
  const data = { claude: p, codex: p, gemini: p, grok: p, hidden: ["gemini", "grok"] };
  const names = (texts) => texts.filter((t) => ["Claude", "Codex", "Gemini", "Grok"].includes(t));
  assert.deepEqual(names(await runWidget("medium", data)), ["Claude", "Codex"]);
  assert.deepEqual(names(await runWidget("medium", data, "grok")), ["Grok"], "an explicit Parameter wins");
  const empty = await runWidget("medium", { ...data, hidden: ["claude", "codex", "gemini", "grok"] });
  assert.ok(empty.some((t) => t.includes("보여줄 서비스가 없어요")));
  // 예전 서버 응답(hidden 없음)에서는 전부 보여줘요.
  assert.deepEqual(names(await runWidget("medium", { claude: p, codex: p, gemini: p, grok: p })), ["Claude", "Codex", "Gemini", "Grok"]);
});
