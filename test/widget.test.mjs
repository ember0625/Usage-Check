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
    const provider = { connected: true, ok: true, fetched_at: Date.now() / 1000, windows: [{ label: "5시간", used_percent: 24, resets_at: Date.now() / 1000 + 3600 }] };
    const context = {
      config: { runsInWidget: true, widgetFamily: family }, args: { widgetParameter: parameter },
      Script: { name: () => "test", setWidget() {}, complete() {} },
      Color: class {}, Size: class {}, ListWidget: Stack,
      Font: new Proxy({}, { get: () => () => ({}) }),
      SFSymbol: { named: () => ({ image: {}, applyFont() {} }) },
      FileManager: { local: () => ({ cacheDirectory: () => "/tmp", joinPath: (a, b) => a + b, fileExists: () => false, writeImage() {} }) },
      Request: class { async loadImage() { return {}; } async loadJSON() { return { claude: provider, codex: provider, gemini: provider }; } },
    };
    await runInNewContext("(async () => {" + widgetScript("https://example.test", "fake-key") + "})()", context);
    assert.deepEqual(texts.filter((t) => ["Claude", "Codex", "Gemini"].includes(t)), expected);
  });
}
