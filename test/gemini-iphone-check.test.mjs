import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../mobile/Gemini-Connection-Check.js", import.meta.url), "utf8");
const raw = JSON.stringify([{ domain: ".google.com", path: "/", name: "SID", value: "fake-private-cookie", httpOnly: true, session: true }]);
async function simulate({ cancel = false, status = 200, redirect = false } = {}) {
  const alerts = [], requests = [];
  class Alert {
    constructor() { alerts.push(this); }
    addAction() {}
    addCancelAction() {}
    addSecureTextField() {}
    textFieldValue() { return raw; }
    async presentAlert() { return cancel ? -1 : 0; }
  }
  class Request {
    constructor(url) { this.url = url; }
    async loadString() {
      requests.push({ url: this.url, headers: { ...this.headers } });
      this.response = { statusCode: status };
      if (redirect) assert.equal(this.onRedirect({ url: "https://elsewhere.test" }), null);
      return JSON.stringify([{ data: { viewer: { rpcs: { getUsageInfo: { pools: [{ poolType: "GXU_FIVE_HOURLY", percentageUsed: 0.24 }] } } } } }]);
    }
  }
  // Deliberately no URL, FileManager, Keychain, fetch, console or Pasteboard globals.
  await runInNewContext("(async () => {" + source + "})()", { Alert, Request, Script: { complete() {} } });
  return { alerts, requests };
}

test("phone checker runs without browser URL APIs and only displays usage", async () => {
  const { alerts, requests } = await simulate();
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).hostname, "gemini.google.com");
  assert.equal(requests[0].headers.Cookie, "SID=fake-private-cookie");
  assert.equal(alerts.at(-1).title, "아이폰 조회 성공");
  assert.ok(alerts.at(-1).message.includes("24%"));
  assert.ok(!JSON.stringify(alerts).includes("fake-private-cookie"));
});

test("phone checker cancel makes no request", async () => {
  const { requests } = await simulate({ cancel: true });
  assert.equal(requests.length, 0);
});

test("phone checker stops redirects without exposing credentials", async () => {
  const { alerts, requests } = await simulate({ status: 302, redirect: true });
  assert.equal(requests.length, 1);
  assert.equal(alerts.at(-1).title, "로그인 확인 필요");
  assert.ok(!JSON.stringify(alerts).includes("fake-private-cookie"));
});
