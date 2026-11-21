import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { widgetScript } from "../src/widget.js";

for (const [family, parameter, expected] of [
  ["small", "", ["Claude", "Codex", "Gemini", "Grok"]],
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
      constructor() { this.children = []; this.texts = []; stacks.push(this); }
      addStack() { const child = new Stack(); this.children.push(child); return child; }
      addText(text) { texts.push(text); this.texts.push(text); return {}; }
      addImage(image) { images.push(image); const node = { image }; this.images = [...(this.images || []), node]; return node; }
      addSpacer() {}
      layoutVertically() {}
      layoutHorizontally() {}
      bottomAlignContent() {}
      centerAlignContent() {}
      topAlignContent() {}
      setPadding(...padding) { this.padding = padding; }
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
      LinearGradient: class {}, Point: class { constructor(x,y) {this.x=x;this.y=y;} },
      Rect: class { constructor(x,y,width,height) { Object.assign(this, { x, y, width, height }); } },
      Path: class { addRoundedRect(rect) { this.rect = rect; } addEllipse(rect) { this.ellipse = rect; } move() {} addLine() {} },
      DrawContext: class {
        constructor() { this.fills = []; this.strokes = []; }
        addPath(path) { this.path = path; }
        setFillColor(color) { this.color = color; }
        setStrokeColor(color) { this.stroke = color; }
        setLineWidth() {}
        fillPath() { this.fills.push({ width: this.path.rect.width, color: this.color.value }); }
        fillEllipse() {}
        strokePath() { this.strokes.push({ track: !!this.path.ellipse, color: this.stroke.value }); }
        getImage() { return this.strokes.length ? { ring: { strokes: this.strokes } } : { bar: { width: this.size.width, fills: this.fills } }; }
      },
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
    assert.equal(images.filter((image) => image.embedded).length, expected.length, "every displayed provider uses an embedded logo");
    if (family === "small") {
      // 작은 위젯: 글자 없이 로고 + 링. 5시간·주간이 다 있으면 링 2개, 하나뿐이면 1개.
      assert.deepEqual(texts, []);
      const rings = stacks.filter((st) => st.backgroundImage?.ring).map((st) => st.backgroundImage.ring.strokes.filter((x) => x.track).length);
      assert.deepEqual(rings, expected.map((name) => (name === "Codex" || name === "Grok" ? 1 : 2)));
      for (const st of stacks.filter((x) => x.backgroundImage?.ring)) {
        assert.equal(st.size.width, st.size.height, "rings are drawn in square cells");
        assert.ok(st.size.width >= 55, "rings stay large enough to read");
      }
      return;
    }
    assert.deepEqual(texts.filter((t) => ["Claude", "Codex", "Gemini", "Grok"].includes(t)), expected);
    if (family !== "small") {
      const labelSlots = stacks.filter(s => s.size && s.texts.some(t => t === "5시간" || t === "주간"));
      assert.equal(new Set(labelSlots.map(s => s.size.width)).size, 1, "all limit labels reserve the same width before the separator");
      assert.equal(texts.filter(t => t === "|").length, expected.reduce((n, name) => n + (name === "Grok" ? 1 : 2), 0));
      const cards = stacks.filter((s) => s.backgroundColor?.value === "#232426");
      assert.equal(cards.length, expected.length);
      const descendants = node => node.children.flatMap(c => [c, ...descendants(c)]);
      for (const card of cards) {
        const [top, right, bottom, left] = card.padding;
        const r = card.cornerRadius;
        for (const y of [top, bottom]) for (const x of [left, right]) {
          const dx = Math.max(0, r - x), dy = Math.max(0, r - y);
          assert.ok(dx * dx + dy * dy <= (r - card.borderWidth) ** 2, "content corners stay inside the rounded card border");
        }
        const bars = descendants(card).flatMap(s => s.images || []).filter(node => node.image.bar);
        assert.ok(bars.length > 0);
        for (const node of bars) {
          assert.equal(node.imageSize.width, card.size.width - left - right, "full usage tracks respect both safe insets");
          assert.equal(node.image.bar.fills[0].color, "#444851");
          assert.equal(node.image.bar.fills[0].width, node.imageSize.width);
        }
      }
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


test("widget bars shade elapsed time and the large widget predicts exhaustion", async () => {
  const texts = [], bars = [];
  class Stack {
    addStack() { return new Stack(); }
    addText(text) { texts.push(text); return {}; }
    addImage(image) { if (image.bar) bars.push(image.bar); return {}; }
    addSpacer() {} layoutVertically() {} layoutHorizontally() {} bottomAlignContent() {} centerAlignContent() {} setPadding() {}
  }
  const now = Math.floor(Date.now() / 1000);
  // 5시간 중 절반이 지났는데 86% 사용 → 약 24분 뒤 소진. 주간은 77% 지났는데 57% → 여유.
  const claude = { connected: true, ok: true, fetched_at: now, windows: [
    { label: "5시간", used_percent: 86, resets_at: now + 9000 },
    { label: "주간", used_percent: 57, resets_at: now + Math.round(0.23 * 7 * 86400) },
  ] };
  const context = {
    config: { runsInWidget: true, widgetFamily: "large" }, args: { widgetParameter: "claude" },
    Script: { name: () => "test", setWidget() {}, complete() {} },
    Color: class { constructor(value) { this.value = value; } }, Size: class { constructor(width,height) { this.width=width;this.height=height; } }, ListWidget: Stack,
    LinearGradient: class {}, Point: class {}, Device: { screenSize: () => ({width:390,height:844}) },
    Rect: class { constructor(x,y,width,height) { Object.assign(this, { x, y, width, height }); } },
    Path: class { addRoundedRect(rect) { this.rect = rect; } },
    DrawContext: class {
      constructor() { this.fills = []; }
      addPath(path) { this.path = path; } setFillColor(color) { this.color = color; }
      fillPath() { this.fills.push({ width: this.path.rect.width, color: this.color.value }); }
      getImage() { return { bar: { width: this.size.width, fills: this.fills } }; }
    },
    Data: { fromBase64String: (s) => Buffer.from(s,"base64") }, Image: { fromData: () => ({}) },
    DateFormatter: class { string() { return ""; } }, Font: new Proxy({}, { get: () => () => ({}) }),
    SFSymbol: { named: () => ({ image: {}, applyFont() {} }) },
    Request: class { async loadJSON() { return { claude }; } },
  };
  await runInNewContext("(async () => {" + widgetScript("https://example.test", "k") + "})()", context);
  assert.equal(bars.length, 2);
  const [five, week] = bars;
  assert.deepEqual(five.fills.map((f) => f.color), ["#444851", "#6B717C", "#F06B5F"], "track, elapsed shade, then usage on top");
  assert.ok(Math.abs(five.fills[1].width / five.width - 0.5) < 0.01);
  assert.ok(Math.abs(week.fills[1].width / week.width - 0.77) < 0.01);
  assert.ok(texts.includes("24분 뒤 소진 예상"), JSON.stringify(texts));
  assert.ok(texts.includes("여유 있음"));
});
