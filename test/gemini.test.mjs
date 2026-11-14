import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, validateUsage, usageUrl } from "../src/gemini.js";
import { fetchUsage, runRelay } from "../scripts/gemini-relay.mjs";

const sample = (pools) => ")]}'\n" + JSON.stringify([{ data: { viewer: { rpcs: { getUsageInfo: { pools } } } }, errors: [{ message: "unrelated private data" }] }]);
const fixture = sample([
  { poolType: "GXU_FIVE_HOURLY", percentageUsed: 0.24, gxu: { windowRefreshesAt: "2026-11-14T12:00:00Z" } },
  { poolType: "GXU_WEEKLY", percentageUsed: 0, gxu: { windowRefreshesAt: "invalid" } },
]);
const isCode = (code) => (e) => e.code === code;

test("preflight uses only Google, accepts exported JSON and needs no Worker configuration", async () => {
  const urls = [], logs = [];
  const code = await runRelay({ GEMINI_CHECK_ONLY: "true", GEMINI_COOKIE: JSON.stringify([{ name: "SID", value: "private-cookie", domain: ".google.com", path: "/" }]) }, {
    fetchImpl: async (url, opts) => {
      urls.push(url);
      assert.equal(new URL(url).hostname, "gemini.google.com");
      assert.equal(opts.headers.Cookie, "SID=private-cookie");
      return new Response(fixture);
    }, log: (m) => logs.push(m), error: (m) => logs.push(m),
  });
  assert.equal(code, 0);
  assert.equal(urls.length, 1);
  assert.ok(logs.includes("5시간: 24% 사용"));
  assert.ok(logs.includes("주간: 0% 사용"));
  assert.equal(logs.join().includes("private"), false);
});

test("preflight failures never send to Worker or expose raw errors", async () => {
  for (const cookie of ["", "invalid-private", "SID=private-cookie"]) {
    const logs = [], urls = [];
    const code = await runRelay({ GEMINI_CHECK_ONLY: "true", GEMINI_COOKIE: cookie, WORKER_URL: "https://worker.example", RELAY_SECRET: "private-relay" }, {
      fetchImpl: async (url) => { urls.push(url); throw Error("private-response"); },
      log: (m) => logs.push(m), error: (m) => logs.push(m),
    });
    assert.equal(code, 1);
    assert.equal(urls.length, cookie === "SID=private-cookie" ? 1 : 0);
    assert.ok(urls.every((url) => new URL(url).hostname === "gemini.google.com"));
    assert.equal(logs.join().includes("private"), false);
  }
});

test("maps fractions to percentages, preserves zero and rejects private fields", () => {
  const usage = normalize(fixture);
  assert.deepEqual(usage.windows.map((w) => w.used_percent), [24, 0]);
  assert.equal(usage.windows[0].resets_at, Date.parse("2026-11-14T12:00:00Z") / 1000);
  assert.equal(usage.windows[1].resets_at, null);
  assert.equal(JSON.stringify(usage).includes("private"), false);
  assert.equal(new URL(usageUrl()).hostname, "gemini.google.com");
});

test("unknown/missing pools stay absent; no quota and invalid JSON fail explicitly", () => {
  assert.throws(() => normalize(sample([{ poolType: "GXU_FIVE_HOURLY", percentageUsed: null }])), isCode("no_quota"));
  assert.throws(() => normalize("[]"), isCode("schema"));
  assert.throws(() => normalize("not-json"), isCode("schema"));
  assert.throws(() => normalize('[{"data":{"viewer":null}}]'), isCode("auth"));
  const one = normalize(sample([{ poolType: "GXU_WEEKLY", percentageUsed: 0.5 }]));
  assert.equal(one.windows.length, 1);
  assert.equal(one.windows[0].used_percent, 50);
});

test("Worker payload validation drops unknown fields and rejects duplicates and invalid numbers", () => {
  const usage = normalize(fixture);
  usage.cookie = "private";
  usage.windows[0].label = "untrusted";
  usage.windows[0].raw = "private";
  assert.equal(JSON.stringify(validateUsage(usage)).includes("private"), false);
  assert.equal(validateUsage(usage).windows[0].label, "5시간");
  assert.throws(() => validateUsage({ windows: [usage.windows[0], usage.windows[0]] }));
  for (const value of [null, -1, 101, NaN, Infinity, "24"]) {
    assert.throws(() => validateUsage({ windows: [{ ...usage.windows[0], used_percent: value }] }));
  }
});

test("Google request scopes credentials and never follows redirects", async () => {
  let count = 0;
  const usage = await fetchUsage("SID=fake-cookie", { fetchImpl: async (url, opts) => {
    count++;
    assert.equal(new URL(url).hostname, "gemini.google.com");
    assert.equal(opts.headers.Cookie, "SID=fake-cookie");
    assert.equal(opts.redirect, "manual");
    return new Response(fixture);
  } });
  assert.equal(count, 1);
  assert.equal(usage.windows[0].used_percent, 24);
});

test("authentication, throttling, availability and query drift remain distinct", async () => {
  for (const [status, code] of [[302, "auth"], [401, "auth"], [403, "auth"], [429, "rate_limit"], [503, "unavailable"], [400, "schema"]]) {
    await assert.rejects(fetchUsage("SID=fake", { fetchImpl: async () => new Response("private-response", { status }) }), isCode(code));
  }
  await assert.rejects(fetchUsage("SID=fake", { fetchImpl: async () => new Response("<html>login</html>") }), isCode("auth"));
  await assert.rejects(fetchUsage("SID=fake\nother=value"), isCode("cookie_format"));
});

test("relay sends only normalized data; logs and Worker payload contain no cookies or raw response", async () => {
  const sent = [], logs = [];
  const code = await runRelay({ GEMINI_COOKIE: "SID=private-cookie", RELAY_SECRET: "relay", WORKER_URL: "https://worker.example", GITHUB_REPOSITORY: "owner/repo" }, {
    fetchImpl: async (url, opts) => {
      if (new URL(url).hostname === "gemini.google.com") return new Response(fixture);
      sent.push(JSON.parse(opts.body));
      assert.equal(opts.headers.Cookie, undefined);
      assert.equal(opts.redirect, "manual");
      return new Response('{"ok":true}');
    }, log: (m) => logs.push(m), error: (m) => logs.push(m),
  });
  assert.equal(code, 0);
  assert.equal(sent[0].ok, true);
  assert.equal(JSON.stringify({ sent, logs }).includes("private"), false);
});

test("missing cookie reports unconfigured without calling Google", async () => {
  const urls = [];
  const code = await runRelay({ RELAY_SECRET: "relay", WORKER_URL: "https://worker.example" }, {
    fetchImpl: async (url, opts) => { urls.push(url); assert.deepEqual(JSON.parse(opts.body), { ok: false, code: "not_configured" }); return new Response("{}"); }, log: () => {},
  });
  assert.equal(code, 0);
  assert.deepEqual(urls, ["https://worker.example/relay/gemini/usage"]);
});

test("Google network errors are reported as safe codes, including unexpected private messages", async () => {
  let reported;
  const logs = [];
  const code = await runRelay({ GEMINI_COOKIE: "SID=private", RELAY_SECRET: "relay", WORKER_URL: "https://worker.example" }, {
    fetchImpl: async (url, opts) => {
      if (new URL(url).hostname === "gemini.google.com") throw Error("private exception");
      reported = JSON.parse(opts.body); return new Response("{}");
    }, log: (m) => logs.push(m), error: (m) => logs.push(m),
  });
  assert.equal(code, 1);
  assert.deepEqual(reported, { ok: false, code: "unavailable" });
  assert.equal(logs.join().includes("private"), false);
});
