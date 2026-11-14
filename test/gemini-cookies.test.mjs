import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeminiCookies } from "../src/gemini-cookies.js";
import { fetchUsage } from "../scripts/gemini-relay.mjs";

const cookie = (extra = {}) => ({ name: "SID", value: "fake=value", domain: ".google.com", path: "/", httpOnly: true, secure: true, hostOnly: false, session: true, ...extra });

test("accepts multiline mobile JSON and preserves HttpOnly cookie values exactly", () => {
  assert.equal(parseGeminiCookies(JSON.stringify([cookie()], null, 2)), "SID=fake=value");
});

test("filters unrelated domains, Google service cookies, wrong paths and expired cookies", () => {
  const raw = [cookie(), cookie({domain:"evilgoogle.com"}), cookie({domain:"accounts.google.com"}), cookie({domain:"google.com.evil.test"}), cookie({hostOnly:true}), cookie({path:"/usage"}), cookie({session:false,expirationDate:10}), cookie({partitionKey:{topLevelSite:"https://elsewhere.test"}})];
  assert.equal(parseGeminiCookies(JSON.stringify(raw), 100), "SID=fake=value");
});

test("keeps Gemini host-only cookies and sorts longer matching paths first", () => {
  const raw=[cookie(),cookie({name:"TOKEN",domain:"gemini.google.com",hostOnly:true,path:"/_/BardChatUi"})];
  assert.equal(parseGeminiCookies(JSON.stringify(raw)), "TOKEN=fake=value; SID=fake=value");
});

test("accepts mobile Header String without re-encoding values", () => {
  assert.equal(parseGeminiCookies("SID=a=b;  TOKEN=c%2Fd"), "SID=a=b; TOKEN=c%2Fd");
});

test("rejects malformed or unsafe exports without echoing input", () => {
  for (const raw of ["[]", "[", "Cookie: SID=secret", "SID=secret\r\nOther=bad", "SID=secret; bad", "{\"value\":\"secret\"}", JSON.stringify([cookie({value:"secret; injected=x"})]), JSON.stringify([cookie({name:"bad name"})]), JSON.stringify([cookie({domain:"elsewhere.test"})])]) {
    assert.throws(() => parseGeminiCookies(raw), (err) => !err.message.includes("secret"));
  }
});

test("mobile export reaches only Google as a normal Cookie header", async () => {
  const data = JSON.stringify([{data:{viewer:{rpcs:{getUsageInfo:{pools:[{poolType:"GXU_WEEKLY",percentageUsed:0.2}]}}}}}]);
  const result = await fetchUsage(JSON.stringify([cookie()], null, 2), { fetchImpl: async (url, opts) => {
    assert.equal(new URL(url).host, "gemini.google.com");
    assert.equal(opts.headers.Cookie, "SID=fake=value");
    return new Response(data);
  }});
  assert.equal(result.windows[0].used_percent, 20);
});
