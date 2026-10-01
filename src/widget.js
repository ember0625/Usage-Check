// iOS 홈 화면 위젯용 Scriptable 스크립트를 만들어요.
// 대시보드의 "iOS 위젯" 칸에서 복사해 Scriptable 앱에 붙여넣으면 돼요.
export function widgetScript(origin, key) {
  return `// AI 사용량 위젯 (Scriptable)
// 대시보드: ${origin}/
const API = ${JSON.stringify(`${origin}/api/widget?key=${key}`)};
const DASHBOARD = ${JSON.stringify(`${origin}/`)};

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#15171c")),
  text: Color.dynamic(new Color("#16181d"), new Color("#eef0f4")),
  muted: Color.dynamic(new Color("#6b7280"), new Color("#9aa1ae")),
  track: Color.dynamic(new Color("#e5e7eb"), new Color("#2a2e37")),
  ok: new Color("#22c55e"),
  warn: new Color("#f59e0b"),
  bad: new Color("#ef4444"),
  claude: new Color("#d97757"),
  codex: new Color("#10a37f"),
};

async function load() {
  try {
    const r = new Request(API);
    r.timeoutInterval = 15;
    const data = await r.loadJSON();
    if (data.error) return { error: data.error };
    return data;
  } catch (e) {
    return { error: String(e) };
  }
}

function levelColor(p) {
  return p >= 90 ? C.bad : p >= 70 ? C.warn : C.ok;
}

function shortLabel(label) {
  if (label === "주간 (전체 모델)") return "주간";
  const m = label.match(/^주간 \\((.+)\\)$/);
  return m ? "주간·" + m[1] : label;
}

function remain(ts) {
  if (!ts) return "";
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "곧 초기화";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return d + "일 " + h + "시간";
  if (h) return h + "시간 " + m + "분";
  return m + "분";
}

function addRow(parent, w, width, compact) {
  const row = parent.addStack();
  row.layoutVertically();
  const top = row.addStack();
  top.size = new Size(width, 0);
  top.layoutHorizontally();
  top.centerAlignContent();
  const lt = top.addText(shortLabel(w.label));
  lt.font = Font.mediumSystemFont(compact ? 10 : 11);
  lt.textColor = C.text;
  lt.lineLimit = 1;
  if (!compact) {
    top.addSpacer(4);
    const rt = top.addText(remain(w.resets_at));
    rt.font = Font.systemFont(9);
    rt.textColor = C.muted;
    rt.lineLimit = 1;
  }
  top.addSpacer();
  const p = Math.max(0, Math.min(100, w.used_percent));
  const pt = top.addText(Math.round(w.used_percent) + "%");
  pt.font = Font.boldSystemFont(compact ? 11 : 12);
  pt.textColor = levelColor(p);
  row.addSpacer(2);
  const bar = row.addStack();
  bar.size = new Size(width, 4);
  bar.backgroundColor = C.track;
  bar.cornerRadius = 2;
  bar.layoutHorizontally();
  if (p > 0) {
    const fill = bar.addStack();
    fill.size = new Size(Math.max(4, (width * p) / 100), 4);
    fill.backgroundColor = levelColor(p);
    fill.cornerRadius = 2;
  }
  bar.addSpacer();
}

function addNote(parent, text, color) {
  const t = parent.addText(text);
  t.font = Font.systemFont(10);
  t.textColor = color || C.muted;
  t.lineLimit = 1;
}

function addProvider(parent, name, color, p, width, max, compact) {
  const col = parent.addStack();
  col.layoutVertically();
  const h = col.addStack();
  h.centerAlignContent();
  const dot = h.addText("●");
  dot.font = Font.systemFont(8);
  dot.textColor = color;
  h.addSpacer(4);
  const t = h.addText(name);
  t.font = Font.boldSystemFont(compact ? 11 : 12);
  t.textColor = C.text;
  col.addSpacer(compact ? 3 : 5);
  if (!p || !p.connected) return addNote(col, "연결 안 됨");
  const ws = (p.windows || []).slice(0, max);
  if (!ws.length) return addNote(col, "데이터 없음");
  ws.forEach((w, i) => {
    if (i) col.addSpacer(compact ? 4 : 6);
    addRow(col, w, width, compact);
  });
  if (p.ok === false) {
    col.addSpacer(3);
    addNote(col, "갱신 실패 · 대시보드 확인", C.bad);
  }
}

const data = await load();
const family = config.widgetFamily || "medium";
const widget = new ListWidget();
widget.backgroundColor = C.bg;
widget.url = DASHBOARD;
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (data.error) {
  widget.setPadding(12, 14, 12, 14);
  addNote(widget, "AI 사용량", C.text);
  widget.addSpacer(4);
  addNote(widget, data.error === "unauthorized" ? "위젯 키가 바뀌었어요. 스크립트를 다시 복사하세요." : "불러오기 실패", C.bad);
} else if (family === "small") {
  widget.setPadding(10, 12, 10, 12);
  addProvider(widget, "Claude", C.claude, data.claude, 112, 2, true);
  widget.addSpacer(6);
  addProvider(widget, "Codex", C.codex, data.codex, 112, 2, true);
  widget.addSpacer();
} else {
  widget.setPadding(12, 14, 12, 14);
  const head = widget.addStack();
  head.centerAlignContent();
  const title = head.addText("AI 사용량");
  title.font = Font.boldSystemFont(13);
  title.textColor = C.text;
  head.addSpacer();
  const df = new DateFormatter();
  df.dateFormat = "HH:mm";
  const upd = head.addText(df.string(new Date()) + " 기준");
  upd.font = Font.systemFont(10);
  upd.textColor = C.muted;
  widget.addSpacer(8);
  const max = family === "large" ? 5 : 2;
  const cols = widget.addStack();
  cols.layoutHorizontally();
  cols.topAlignContent();
  addProvider(cols, "Claude", C.claude, data.claude, 138, max, false);
  cols.addSpacer();
  addProvider(cols, "Codex", C.codex, data.codex, 138, max, false);
  widget.addSpacer();
}

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
`;
}
