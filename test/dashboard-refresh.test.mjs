import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { renderPage } from "../src/page.js";

test("late relay results clear the timeout for each provider when its result arrives", async () => {
  const page = renderPage({ authed: true });
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  const start = 1700000000;
  let now = start;
  const provider = () => ({
    connected: true,
    dispatch: { started: true, at: start },
    usage: { ok: true, fetched_at: start - 60 },
  });
  const data = { codex: provider(), gemini: provider() };
  const app = runInNewContext(
    script.slice(0, script.lastIndexOf('$("#refresh").addEventListener')) +
      "\nrender = () => {}; ({ load, relayWait })",
    {
      Date: { now: () => now * 1000 },
      fetch: async () => ({ ok: true, json: async () => data }),
      setTimeout() {}, clearTimeout() {},
    },
  );

  await app.load(false);
  delete data.codex.dispatch;
  delete data.gemini.dispatch;
  now += 151;
  await app.load(false);
  assert.match(app.relayWait.codex.error, /아직 도착하지/);
  assert.match(app.relayWait.gemini.error, /아직 도착하지/);

  data.codex.usage.fetched_at = now;
  await app.load(false);
  assert.equal(app.relayWait.codex, undefined);
  assert.match(app.relayWait.gemini.error, /아직 도착하지/);

  data.gemini.usage = { ok: false, fetched_at: start - 60, error_at: now };
  await app.load(false);
  assert.equal(app.relayWait.gemini, undefined);
});
