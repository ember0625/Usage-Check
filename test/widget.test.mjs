import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { widgetScript } from "../src/widget.js";

for (const [family, parameter, expected, sample = "standard"] of [
  ["small", "", ["Claude", "Codex", "Gemini", "Grok"]],
  ["small", "gemini", ["Gemini"]],
  ["small", "gemini", ["Gemini"], "five-hour only"],
  ["small", "gemini", ["Gemini"], "zero weekly"],
  ["small", "grok", ["Grok"]],
  ["medium", "grok", ["Grok"]],
  ["medium", "", ["Claude", "Codex", "Gemini", "Grok"]],
  ["large", "", ["Claude", "Codex", "Gemini", "Grok"]],
  ["medium", "claude,gemini", ["Claude", "Gemini"]],
]) {
  test(`Scriptable ${family} widget with parameter '${parameter}' and ${sample} data`, async () => {
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
    if (sample === "five-hour only") data.gemini.windows = [five];
    if (sample === "zero weekly") data.gemini.windows = [five, { ...weekly, used_percent: 0 }];
    const context = {
      config: { runsInWidget: true, widgetFamily: family }, args: { widgetParameter: parameter },
      Script: { name: () => "test", setWidget() {}, complete() {} },
      Color: class { constructor(value) { this.value = value; } }, Size: class { constructor(width,height) { this.width=width;this.height=height; } }, ListWidget: Stack,
      LinearGradient: class {}, Point: class { constructor(x,y) {this.x=x;this.y=y;} },
      Rect: class { constructor(x,y,width,height) { Object.assign(this, { x, y, width, height }); } },
      Path: class { addRoundedRect(rect) { this.rect = rect; } addEllipse(rect) { this.ellipse = rect; } move() {} addLine() {} },
      DrawContext: class {
        constructor() { this.fills = []; this.strokes = []; this.dots = []; }
        addPath(path) { this.path = path; }
        setFillColor(color) { this.color = color; }
        setStrokeColor(color) { this.stroke = color; }
        setLineWidth() {}
        fillPath() { this.fills.push({ width: this.path.rect.width, color: this.color.value }); }
        fillEllipse(rect) { this.dots.push({ rect, color: this.color.value }); }
        strokePath() { this.strokes.push({ track: this.path.ellipse, color: this.stroke.value }); }
        getImage() { return this.strokes.length || this.dots.length ? { ring: { strokes: this.strokes, dots: this.dots } } : { bar: { width: this.size.width, fills: this.fills } }; }
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
      const cells = stacks.filter((st) => st.backgroundImage?.ring);
      const rings = cells.map((st) => st.backgroundImage.ring.strokes.filter((x) => x.track).length);
      assert.deepEqual(rings, expected.map((name) => (name === "Codex" || name === "Grok" || sample === "five-hour only" ? 1 : 2)));
      for (const st of cells) {
        assert.equal(st.size.width, st.size.height, "rings are drawn in square cells");
        assert.ok(st.size.width >= 55, "rings stay large enough to read");
      }
      if (sample !== "standard") {
        const { strokes, dots } = cells[0].backgroundImage.ring;
        const tracks = strokes.flatMap((stroke) => stroke.track ? [stroke.track] : []);
        const grayDots = dots.filter((dot) => dot.color === "#3A3A3C");
        assert.ok(strokes.some((stroke) => stroke.color === "#30D158"), "five-hour usage is drawn");
        if (sample === "five-hour only") {
          assert.ok(grayDots.length > 0, "missing weekly usage has a dotted outer ring");
          assert.ok(Math.max(...grayDots.map((dot) => dot.rect.x)) > tracks[0].x + tracks[0].width,
            "weekly placeholder is outside the five-hour track");
        } else {
          assert.equal(grayDots.length, 0, "actual zero weekly usage keeps its solid empty track");
          assert.ok(tracks[0].width > tracks[1].width);
        }
      }
      return;
    }
    assert.deepEqual(texts.filter((t) => ["Claude", "Codex", "Gemini", "Grok"].includes(t)), expected);
    if (family !== "small") {
      assert.equal(texts.includes("|"), false, "the row layout has no separators");
      // 서비스마다 한 줄. 모든 막대는 같은 폭이라 5시간·주간 칸이 줄마다 같은 위치에 와요.
      const bars = stacks.flatMap((st) => st.images || []).filter((node) => node.image.bar);
      assert.equal(bars.length, expected.reduce((n, name) => n + (name === "Grok" ? 1 : 2), 0));
      assert.equal(new Set(bars.map((node) => node.imageSize.width)).size, 1, "all limit columns share one width");
      for (const node of bars) assert.equal(node.image.bar.fills[0].color, "#3A3A3C");
      const rows = stacks.filter((st) => st.size?.width && st.texts.some((t) => ["Claude", "Codex", "Gemini", "Grok"].includes(t)));
      assert.equal(rows.length, expected.length, "one row per provider");
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


test("large widget keeps elapsed shading, usage colors and reset times without forecasts", async () => {
  const texts = [], bars = [];
  class Stack {
    addStack() { return new Stack(); }
    addText(text) { texts.push(text); return {}; }
    addImage(image) { if (image.bar) bars.push(image.bar); return {}; }
    addSpacer() {} layoutVertically() {} layoutHorizontally() {} bottomAlignContent() {} centerAlignContent() {} setPadding() {}
  }
  const now = Math.floor(Date.now() / 1000);
  // 5시간은 절반이 지났고 86% 사용, 주간은 77%가 지났고 57% 사용.
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
  assert.deepEqual(five.fills.map((f) => f.color), ["#3A3A3C", "#48484A", "#FF453A"], "track, elapsed shade, then usage on top");
  assert.ok(Math.abs(five.fills[1].width / five.width - 0.5) < 0.01);
  assert.ok(Math.abs(week.fills[1].width / week.width - 0.77) < 0.01);
  assert.deepEqual(week.fills.map((f) => f.color), ["#3A3A3C", "#48484A", "#FFD60A"]);
  assert.ok(texts.some((text) => /^2시간 \d+분$/.test(text)), "the five-hour reset countdown remains visible");
  assert.ok(!texts.some((text) => /소진|여유/.test(text)), "neither a forecast nor a pace verdict is shown");
});
