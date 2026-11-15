import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { widgetScript } from "../src/widget.js";

for (const [family, parameter, expected] of [
  ["small", "", ["Claude", "Codex"]],
  ["small", "gemini", ["Gemini"]],
  ["small", "grok", ["Grok"]],
  ["medium", "grok", ["Grok"]],
  ["medium", "", ["Claude", "Codex", "Gemini", "Grok"]],
  ["large", "", ["Claude", "Codex", "Gemini", "Grok"]],
  ["medium", "claude,gemini", ["Claude", "Gemini"]],
]) {
  test(`Scriptable ${family} widget with parameter '${parameter}' includes the intended providers`, async () => {
    const texts = [], images = [], stacks = [];
    class Stack {
      constructor() { this.children = []; stacks.push(this); }
      addStack() { const child = new Stack(); this.children.push(child); return child; }
      addText(text) { texts.push(text); return {}; }
      addImage(image) { images.push(image); return {}; }
      addSpacer() {}
      layoutVertically() {}
      layoutHorizontally() {}
      bottomAlignContent() {}
      centerAlignContent() {}
      topAlignContent() {}
      setPadding() {}
    }
    const now = Math.floor(Date.now() / 1000);
    const five = { label: "5시간", used_percent: 24, resets_at: now + 7200 };
    const weekly = { label: "주간 (전체 모델)", used_percent: 42, resets_at: now + 27 * 3600 + 60 };
    const provider = { connected: true, ok: true, windows: [weekly, five] };
    const data = {
      claude: { ...provider, fetched_at: now - 30 },
      codex: { ...provider, windows: [{ ...weekly, label: "주간" }], fetched_at: now - 10 },
      gemini: { ...provider, fetched_at: now - 20 },
      grok: { ...provider, windows: [{ ...weekly, label: "주간", used_percent: 7 }], fetched_at: now - 5 },
    };
    const context = {
      config: { runsInWidget: true, widgetFamily: family }, args: { widgetParameter: parameter },
      Script: { name: () => "test", setWidget() {}, complete() {} },
      Color: class { constructor(value) { this.value = value; } }, Size: class { constructor(width,height) { this.width=width;this.height=height; } }, ListWidget: Stack,
      Device: { screenSize: () => ({width:390,height:844}) },
      Data: { fromBase64String: (s) => Buffer.from(s,"base64") },
      Image: { fromData: (bytes) => { assert.equal(bytes.subarray(1,4).toString(),"PNG"); return { embedded: true }; } },
      DateFormatter: class { string(date) { return String(date.getTime()); } },
      Font: new Proxy({}, { get: () => () => ({}) }),
      SFSymbol: { named: () => ({ image: {}, applyFont() {} }) },
      FileManager: { local: () => ({ cacheDirectory: () => "/tmp", joinPath: (a, b) => a + b, fileExists: () => false, writeImage() {} }) },
      Request: class { async loadImage() { return {}; } async loadJSON() { return data; } },
    };
    await runInNewContext("(async () => {" + widgetScript("https://example.test", "fake-key") + "})()", context);
    assert.deepEqual(texts.filter((t) => ["Claude", "Codex", "Gemini", "Grok"].includes(t)), expected);
    assert.equal(images.filter((image) => image.embedded).length, expected.length, "every displayed provider uses an embedded logo");
    if (family !== "small") {
      const cards = stacks.filter((s) => s.backgroundColor?.value === "#232426");
      assert.equal(cards.length, expected.length);
      if (expected.length === 4) {
        assert.equal(stacks.filter((s) => s.children.filter((c) => cards.includes(c)).length === 2).length, 2, "four cards form two rows of two");
        assert.equal(new Set(cards.map((c) => c.size.height)).size, 1, "Grok retains the same card height");
      }
      const latest = Math.max(...expected.map((name) => data[name.toLowerCase()].fetched_at));
      assert.ok(texts.includes("최근 갱신 " + latest * 1000), "uses actual latest timestamp among displayed services, not render time or hidden services");
      assert.equal(texts.includes("마지막 수집값"), false);
      assert.ok(texts.includes("1일 3시간"), "restores reset countdowns");
      assert.equal(texts.includes("/"), false);
      for (const name of expected) {
        const start = texts.indexOf(name);
        const end = texts.findIndex((t, i) => i > start && expected.includes(t));
        const row = texts.slice(start, end < 0 ? undefined : end);
        if (name === "Grok") { assert.ok(!row.includes("5시간")); assert.ok(row.includes("7")); continue; }
        assert.ok(row.indexOf("5시간") < row.indexOf("주간"), "five-hour and weekly columns stay in the requested order");
        assert.ok(row.includes("42"));
        if (name === "Codex") {
          assert.ok(row.includes("—") && row.includes("제공 안 됨"), "missing five-hour data is not invented or replaced by weekly data");
        } else assert.ok(row.includes("24"));
      }
    }
  });
}

