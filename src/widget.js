// iOS 홈 화면 위젯용 Scriptable 스크립트를 만들어요.
// 대시보드의 "iOS 위젯" 칸에서 복사해 Scriptable 앱에 붙여넣으면 돼요.
export function widgetScript(origin, key) {
  return `// AI 사용량 위젯 (Scriptable)
// 대시보드: ${origin}/
const API = ${JSON.stringify(`${origin}/api/widget?key=${key}`)};
const DASHBOARD = ${JSON.stringify(`${origin}/`)};
// 새로고침 아이콘: 브라우저 대신 Scriptable에서 이 스크립트를 바로 실행해요.
const REFRESH = "scriptable:///run/" + encodeURIComponent(Script.name()) + "?refresh=1";
// 새로고침 버튼으로 실행됐는지 (앱 안에서 실행될 때만 true)
const MANUAL = !config.runsInWidget && args.queryParameters && args.queryParameters.refresh === "1";

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

// 위젯 크기별 글자·막대 크기
const SIZES = {
  small: { width: 120, name: 12, label: 10, pct: 12, bar: 4, rowGap: 4, remain: false, max: 2 },
  medium: { width: 138, name: 14, label: 12, pct: 16, bar: 7, rowGap: 9, remain: true, max: 2 },
  large: { width: 138, name: 15, label: 13, pct: 17, bar: 7, rowGap: 11, remain: true, max: 5 },
};

const LOGOS = {
  claude: "https://www.google.com/s2/favicons?domain=claude.ai&sz=128",
  codex: "https://www.google.com/s2/favicons?domain=openai.com&sz=128",
};

// 로고는 한 번 받아서 기기에 저장해 두고 다시 써요.
async function logo(name) {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), "usage-check-logo-" + name + ".png");
  if (fm.fileExists(path)) return fm.readImage(path);
  try {
    const img = await new Request(LOGOS[name]).loadImage();
    fm.writeImage(path, img);
    return img;
  } catch (e) {
    return null;
  }
}

async function load() {
  try {
    // 위젯이 다시 그려질 때마다 서버가 오래된 값을 새로 조회해요. 버튼으로 실행하면 간격 제한 없이 바로 조회해요.
    const r = new Request(API + "&refresh=1" + (MANUAL ? "&force=1" : ""));
    r.timeoutInterval = 20;
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

function addText(parent, text, font, color) {
  const t = parent.addText(text);
  t.font = font;
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

function addRow(parent, w, S) {
  const row = parent.addStack();
  row.layoutVertically();
  const top = row.addStack();
  top.size = new Size(S.width, 0);
  top.layoutHorizontally();
  top.bottomAlignContent();
  addText(top, shortLabel(w.label), Font.mediumSystemFont(S.label), C.text);
  if (S.remain) {
    top.addSpacer(4);
    const r = addText(top, remain(w.resets_at), Font.systemFont(S.label - 2), C.muted);
    r.minimumScaleFactor = 0.8;
  }
  top.addSpacer();
  const p = Math.max(0, Math.min(100, w.used_percent));
  addText(top, Math.round(w.used_percent) + "%", Font.boldRoundedSystemFont(S.pct), levelColor(p));
  row.addSpacer(S.remain ? 3 : 2);
  const bar = row.addStack();
  bar.size = new Size(S.width, S.bar);
  bar.backgroundColor = C.track;
  bar.cornerRadius = S.bar / 2;
  bar.layoutHorizontally();
  if (p > 0) {
    const fill = bar.addStack();
    fill.size = new Size(Math.max(S.bar, (S.width * p) / 100), S.bar);
    fill.backgroundColor = levelColor(p);
    fill.cornerRadius = S.bar / 2;
  }
  bar.addSpacer();
}

function addProvider(parent, name, color, icon, p, S, withRefresh) {
  const col = parent.addStack();
  col.layoutVertically();
  const h = col.addStack();
  h.size = new Size(S.width, 0);
  h.centerAlignContent();
  if (icon) {
    const img = h.addImage(icon);
    img.imageSize = new Size(S.name + 4, S.name + 4);
    img.cornerRadius = (S.name + 4) / 4.5;
  } else {
    addText(h, "●", Font.systemFont(S.name - 4), color);
  }
  h.addSpacer(6);
  addText(h, name, Font.boldSystemFont(S.name), C.text);
  h.addSpacer();
  if (withRefresh) addRefreshIcon(h, S, false);
  col.addSpacer(S.rowGap - 2);
  if (!p || !p.connected) return addText(col, "연결 안 됨", Font.systemFont(S.label), C.muted);
  const ws = (p.windows || []).slice(0, S.max);
  if (!ws.length) return addText(col, "데이터 없음", Font.systemFont(S.label), C.muted);
  ws.forEach((w, i) => {
    if (i) col.addSpacer(S.rowGap);
    addRow(col, w, S);
  });
  if (p.ok === false) {
    col.addSpacer(4);
    addText(col, "갱신 실패", Font.systemFont(S.label - 2), C.bad);
  } else if (p.refreshing && MANUAL) {
    col.addSpacer(4);
    addText(col, "약 1분 뒤 반영", Font.systemFont(S.label - 2), C.muted);
  }
}

function addFooter(parent, S, family) {
  const f = parent.addStack();
  f.layoutHorizontally();
  f.centerAlignContent();
  const df = new DateFormatter();
  df.dateFormat = "HH:mm";
  addText(f, df.string(new Date()) + " 기준", Font.systemFont(S.label - 2), C.muted);
  f.addSpacer();
  addRefreshIcon(f, S, true);
}

function addRefreshIcon(parent, S, tappable) {
  const btn = parent.addStack();
  btn.centerAlignContent();
  // 작은 위젯은 iOS 제약으로 부분 터치가 안 돼서 위젯 전체가 새로고침 링크예요.
  if (tappable) btn.url = REFRESH;
  const sym = SFSymbol.named("arrow.clockwise");
  sym.applyFont(Font.semiboldSystemFont(S.name));
  const img = btn.addImage(sym.image);
  img.imageSize = new Size(S.name, S.name);
  img.tintColor = C.muted;
}

const [data, claudeLogo, codexLogo] = await Promise.all([load(), logo("claude"), logo("codex")]);
const family = config.widgetFamily || "medium";
const S = SIZES[family] || SIZES.medium;
const widget = new ListWidget();
widget.backgroundColor = C.bg;
widget.url = family === "small" ? REFRESH : DASHBOARD;
// iOS에 5분 뒤 다시 그려 달라고 요청해요. 실제 시점은 iOS가 정해요.
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (data.error) {
  widget.setPadding(14, 15, 12, 15);
  addText(widget, "AI 사용량", Font.boldSystemFont(S.name), C.text);
  widget.addSpacer(6);
  addText(widget, data.error === "unauthorized" ? "위젯 키가 바뀌었어요. 스크립트를 다시 복사하세요." : "불러오기 실패", Font.systemFont(S.label), C.bad);
  widget.addSpacer();
  addFooter(widget, S, family);
} else if (family === "small") {
  // 작은 위젯은 세로 공간이 빠듯해서 시각 줄을 빼고 새로고침 아이콘을 Claude 줄 오른쪽에 둬요.
  widget.setPadding(11, 13, 11, 13);
  addProvider(widget, "Claude", C.claude, claudeLogo, data.claude, S, true);
  widget.addSpacer();
  addProvider(widget, "Codex", C.codex, codexLogo, data.codex, S, false);
} else {
  widget.setPadding(14, 15, 12, 15);
  const cols = widget.addStack();
  cols.layoutHorizontally();
  cols.topAlignContent();
  addProvider(cols, "Claude", C.claude, claudeLogo, data.claude, S, false);
  cols.addSpacer();
  addProvider(cols, "Codex", C.codex, codexLogo, data.codex, S, false);
  widget.addSpacer();
  addFooter(widget, S, family);
}

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
`;
}
