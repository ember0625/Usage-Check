import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { widgetScript } from "../src/widget.js";

for (const [family, parameter, expected] of [
  ["small", "", ["Claude", "Codex"]],
  ["small", "gemini", ["Gemini"]],
  ["medium", "", ["Claude", "Codex", "Gemini"]],
  ["large", "", ["Claude", "Codex", "Gemini"]],
  ["medium", "claude,gemini", ["Claude", "Gemini"]],
]) {
  test(`Scriptable ${family} widget with parameter '${parameter}' includes the intended providers`, async () => {
    const texts = [];
    class Stack {
      addStack() { return new Stack(); }
      addText(text) { texts.push(text); return {}; }
      addImage() { return {}; }
      addSpacer() {}
      layoutVertically() {}
      layoutHorizontally() {}
      bottomAlignContent() {}
      centerAlignContent() {}
      topAlignContent() {}
      setPadding() {}
    }
    const now = Math.floor(Date.now() / 1000);
    const provider = { connected: true, ok: true, windows: [{ label: "5시간", used_percent: 24, resets_at: now + 3600 }] };
    const data = {
      claude: { ...provider, fetched_at: now - 30 },
      codex: { ...provider, fetched_at: now - 10 },
      gemini: { ...provider, fetched_at: now - 20 },
    };
    const context = {
      config: { runsInWidget: true, widgetFamily: family }, args: { widgetParameter: parameter },
      Script: { name: () => "test", setWidget() {}, complete() {} },
      Color: class {}, Size: class {}, ListWidget: Stack,
      DateFormatter: class { string(date) { return String(date.getTime()); } },
      Font: new Proxy({}, { get: () => () => ({}) }),
      SFSymbol: { named: () => ({ image: {}, applyFont() {} }) },
      FileManager: { local: () => ({ cacheDirectory: () => "/tmp", joinPath: (a, b) => a + b, fileExists: () => false, writeImage() {} }) },
      Request: class { async loadImage() { return {}; } async loadJSON() { return data; } },
    };
    await runInNewContext("(async () => {" + widgetScript("https://example.test", "fake-key") + "})()", context);
    assert.deepEqual(texts.filter((t) => ["Claude", "Codex", "Gemini"].includes(t)), expected);
    if (family !== "small") {
      const latest = Math.max(...expected.map((name) => data[name.toLowerCase()].fetched_at));
      assert.ok(texts.includes("최근 갱신 " + latest * 1000), "uses actual latest timestamp among displayed services, not render time or hidden services");
      assert.equal(texts.includes("마지막 수집값"), false);
    }
  });
}
