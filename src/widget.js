import { BRAND_LOGOS } from "./brand-logos.js";

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

// Fluent 참고 시안: 차분한 표면·테두리, 사용량 단계별 초록·주황·빨강.
const C = {
  bg: new Color("#1B1D20"),      // 위젯·대시보드 배경
  card: new Color("#232426"),
  edge: new Color("#454950", 0.8),
  separator: new Color("#858B95"),
  text: new Color("#F2F3F5"),    // 제목
  label: new Color("#E2E4E8"),   // 항목 이름 (5시간, 주간)
  muted: new Color("#AFB3BC"),   // 남은 시간, 시각
  track: new Color("#444851"),   // 막대 바탕
  shade: new Color("#6B717C"),   // 초기화 주기 중 지난 시간만큼 밝게 칠한 바탕
  ok: new Color("#6CD18C"),
  warn: new Color("#EEA15C"),
  bad: new Color("#F06B5F"),
  claude: new Color("#D97757"),
  codex: new Color("#2DC8A8"),
  gemini: new Color("#8AB4F8"),
  grok: new Color("#F2F3F5"),
};

// 중간·큰 위젯은 사진처럼 2×2 카드. 작은 위젯은 선택한 서비스만 세로로 표시해요.
const SIZES = {
  small: { width: 120, name: 12, label: 10, pct: 13, bar: 4, rowGap: 4 },
  medium: { name: 10, label: 8, pct: 10, bar: 3, timer: 8, icon: 13, pad: 5, gap: 6, rowGap: 2, footer: 8, footerInset: 6, radius: 12 },
  large: { name: 15, label: 12, pct: 20, bar: 6, timer: 11, icon: 22, pad: 13, gap: 10, rowGap: 12, footer: 10, footerInset: 6, radius: 16, pace: 10 },
};

// 로고를 스크립트에 함께 넣어서 네트워크나 이미지 캐시 없이 표시해요.
const LOGOS = ${JSON.stringify(BRAND_LOGOS)};
function logo(name) {
  return Image.fromData(Data.fromBase64String(LOGOS[name].split(",")[1]));
}

function gridSize(family) {
  let screen = 390;
  try { const size = Device.screenSize(); screen = Math.min(size.width, size.height); } catch (e) {}
  // Scriptable의 iPhone 위젯 크기(pt). iPad/알 수 없는 기기는 보수적인 크기를 사용해요.
  const sizes = screen <= 320 ? [292, 141, 311] : screen <= 375 ? [329, 155, 345]
    : screen <= 393 ? [338, 158, 354] : screen <= 414 ? [360, 169, 379] : [364, 170, 382];
  return { width: sizes[0], height: family === "large" ? sizes[2] : sizes[1] };
}

// 위젯이 다시 그려질 때마다 서버가 오래된 값을 새로 조회해요. 버튼으로 실행하면 간격 제한 없이 바로 조회해요.
async function load(query = "&refresh=1" + (MANUAL ? "&force=1" : "")) {
  try {
    const r = new Request(API + query);
    r.timeoutInterval = 20;
    const data = await r.loadJSON();
    if (data.error) return { error: data.error };
    return data;
  } catch (e) {
    return { error: String(e) };
  }
}

// 50% 미만 초록, 50% 이상 주황, 80% 이상 빨강
function levelColor(p) {
  return p >= 80 ? C.bad : p >= 50 ? C.warn : C.ok;
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

// 한도 주기 길이(초). 라벨로 알아내요: "5시간", "주간", "주간 (Opus)" 등.
function period(label) {
  const s = String(label || "");
  if (s.includes("주간")) return 7 * 86400;
  const m = s.match(/(\\d+)(일|시간|분)/);
  return m ? Number(m[1]) * { 일: 86400, 시간: 3600, 분: 60 }[m[2]] : null;
}

// 사용 속도: 주기 중 지난 비율과, 이 속도면 언제 한도에 닿는지(초기화 전일 때만)
function pace(w) {
  const len = period(w && w.label);
  if (!len || !w.resets_at || !Number.isFinite(w.used_percent)) return null;
  const left = w.resets_at - Date.now() / 1000;
  if (left <= 0) return null;
  const elapsed = Math.max(0, Math.min(1, 1 - left / len));
  const used = Math.max(0, Math.min(100, w.used_percent));
  let eta = null;
  // 막 초기화된 직후(주기의 5% 미만)는 예측이 크게 흔들려서 하지 않아요.
  if (used > 0 && used < 100 && elapsed >= 0.05) {
    const toFull = elapsed * len * (100 / used - 1);
    if (toFull < left) eta = toFull;
  }
  return { elapsed, eta, used };
}

function duration(sec) {
  const m = Math.max(1, Math.round(sec / 60)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  if (d) return d + "일 " + h + "시간";
  if (h) return h + "시간 " + (m % 60) + "분";
  return m + "분";
}

// 막대를 그림으로 그려요. 위젯의 칸(stack)은 겹칠 수 없어서, 지난 시간 음영 위에 사용량을 덮으려면 직접 그려야 해요.
function barImage(width, height, p, color, elapsed, minFill) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const r = height / 2;
  const fill = (w, c) => {
    const path = new Path();
    path.addRoundedRect(new Rect(0, 0, w, height), r, r);
    dc.addPath(path);
    dc.setFillColor(c);
    dc.fillPath();
  };
  fill(width, C.track);
  if (elapsed > 0) fill(Math.max(height, width * elapsed), C.shade);
  if (p > 0) fill(Math.max(minFill, (width * p) / 100), color);
  return dc.getImage();
}

function addBar(parent, width, height, p, color, w, minFill) {
  const info = pace(w);
  const img = parent.addImage(barImage(width, height, p, color, info ? info.elapsed : 0, minFill));
  img.imageSize = new Size(width, height);
  return info;
}

function addText(parent, text, font, color) {
  const t = parent.addText(text);
  t.font = font;
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

// 작은 위젯의 한도 한 줄 (이름, 퍼센트, 막대)
function addRow(parent, w, S) {
  const row = parent.addStack();
  row.layoutVertically();
  const top = row.addStack();
  top.size = new Size(S.width, 0);
  top.layoutHorizontally();
  top.bottomAlignContent();
  addText(top, shortLabel(w.label), Font.mediumSystemFont(S.label), C.label);
  top.addSpacer();
  // 대시보드처럼 숫자는 크게, %는 작게
  const p = Math.max(0, Math.min(100, w.used_percent));
  const color = levelColor(p);
  addText(top, String(Math.round(w.used_percent)), Font.semiboldSystemFont(S.pct), color);
  addText(top, "%", Font.semiboldSystemFont(Math.round(S.pct * 0.55)), color);
  row.addSpacer(2);
  // 대시보드처럼 아주 작은 값도 최소 6pt는 보이게 해요.
  addBar(row, S.width, S.bar, p, color, w, 6);
}

// 작은 위젯의 서비스 한 칸
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
  if (withRefresh) addRefreshIcon(h, S, true);
  col.addSpacer(S.rowGap - 2);
  if (!p || !p.connected) return addText(col, "연결 안 됨", Font.systemFont(S.label), C.muted);
  const ws = (p.windows || []).slice(0, 2);
  if (!ws.length) return addText(col, "데이터 없음", Font.systemFont(S.label), C.muted);
  ws.forEach((w, i) => {
    if (i) col.addSpacer(S.rowGap);
    addRow(col, w, S);
  });
  if (p.fetched_at && Date.now() / 1000 - p.fetched_at > 2700) {
    col.addSpacer(3);
    addText(col, "오래된 데이터", Font.systemFont(S.label - 2), C.warn);
  }
  if (p.ok === false) {
    col.addSpacer(4);
    addText(col, "갱신 실패", Font.systemFont(S.label - 2), C.bad);
  }
}

// 카드 안에서는 라벨·초기화까지 남은 시간·퍼센트를 한 줄에 놓아요.
function addUsageCell(parent, label, w, p, S) {
  const cell = parent.addStack();
  cell.layoutVertically();
  cell.size = new Size(S.width, 0);
  const top = cell.addStack();
  top.layoutHorizontally();
  top.bottomAlignContent();
  // 라벨 길이에 관계없이 모든 카드의 구분선을 동일한 x 위치에 놓아요.
  const labelSlot = top.addStack();
  labelSlot.layoutHorizontally();
  labelSlot.setPadding(0, 0, 0, 0);
  labelSlot.size = new Size(Math.ceil(S.label * 4), 0);
  const labelText = addText(labelSlot, label, Font.semiboldSystemFont(S.label), C.label);
  labelText.minimumScaleFactor = 0.9;
  // 고정 폭 칸은 글자를 가운데에 놓아서, 로고·막대와 같은 왼쪽 선에 맞추려고 오른쪽을 채워요.
  labelSlot.addSpacer();
  top.addSpacer(3);
  addText(top, "|", Font.systemFont(S.timer), C.separator);
  top.addSpacer(4);
  const caption = !p?.connected ? "연결 안 됨" : !w ? "제공 안 됨" : remain(w.resets_at) || "초기화 정보 없음";
  const timer = addText(top, caption, Font.systemFont(S.timer), C.muted);
  timer.minimumScaleFactor = 0.8;
  top.addSpacer();
  const value = w && Number.isFinite(w.used_percent) ? Math.max(0, Math.min(100, w.used_percent)) : null;
  const color = value === null ? C.muted : levelColor(value);
  addText(top, value === null ? "—" : String(Math.round(value)), Font.semiboldSystemFont(S.pct), color);
  if (value !== null) addText(top, "%", Font.mediumSystemFont(S.label), color);
  cell.addSpacer(1);
  const info = addBar(cell, S.width, S.bar, value || 0, color, w, S.bar);
  // 큰 위젯에만 "이 속도면 언제 소진"을 한 줄로 적어요. 중간 위젯은 음영만으로 보여줘요.
  if (S.pace && info && value !== null && value < 100) {
    cell.addSpacer(3);
    const fast = info.eta !== null;
    addText(cell, fast ? duration(info.eta) + " 뒤 소진 예상" : "여유 있음", Font.mediumSystemFont(S.pace), fast ? C.warn : C.muted);
  }
}

function addProviderCard(parent, id, title, icon, p, S, width, height) {
  const card = parent.addStack();
  card.layoutVertically();
  card.size = new Size(width, height);
  card.backgroundColor = C.card;
  const surface = new LinearGradient();
  surface.colors = [new Color("#2B2E34"), new Color("#24272C")];
  surface.locations = [0, 1];
  surface.startPoint = new Point(0, 0);
  surface.endPoint = new Point(1, 1);
  card.backgroundGradient = surface;
  card.borderColor = C.edge;
  card.borderWidth = 0.6;
  card.cornerRadius = S.radius;
  // 큰 모서리 반경의 곡선 밖으로 로고·막대가 나가지 않도록 안전 영역을 확보해요.
  // 세로 여백은 유지해서 두 한도 행의 높이를 줄이지 않아요.
  const insetX = Math.max(S.pad, Math.ceil(S.radius * 0.7));
  const contentWidth = width - insetX * 2;
  card.setPadding(S.pad, insetX, S.pad, insetX);
  const h = card.addStack();
  h.size = new Size(contentWidth, 0);
  h.layoutHorizontally();
  h.centerAlignContent();
  const img = h.addImage(icon);
  img.imageSize = new Size(S.icon, S.icon);
  img.cornerRadius = S.icon / 4;
  h.addSpacer(6);
  addText(h, title, Font.boldSystemFont(S.name), C.text);
  h.addSpacer();
  const stale = p?.fetched_at && Date.now() / 1000 - p.fetched_at > 2700;
  if (p?.connected && (p.ok === false || stale)) {
    const badge = SFSymbol.named("exclamationmark.circle");
    const warning = h.addImage(badge.image);
    warning.imageSize = new Size(S.label + 1, S.label + 1);
    warning.tintColor = p.ok === false ? C.bad : C.warn;
  }
  card.addSpacer();
  const windows = p?.connected ? p.windows || [] : [];
  // Grok에는 5시간 줄과 빈 막대 자체를 만들지 않아요.
  const labels = id === "grok" ? ["주간"] : ["5시간", "주간"];
  labels.forEach((label, i) => {
    if (i) card.addSpacer(S.rowGap);
    const w = windows.find((window) => shortLabel(window.label) === label);
    addUsageCell(card, label, w, p, { ...S, width: contentWidth });
  });
  // 주간 한 줄인 Grok도 아래에 붙여서, 옆 카드의 주간 줄과 같은 높이에 놓아요.
}

// 현재 그린 시각이 아니라, 표시 중인 서비스의 실제 최근 수집 성공 시각이에요.
function lastUpdated(data, names) {
  const times = names.map((name) => data[name]?.connected ? data[name].fetched_at : null)
    .filter((ts) => typeof ts === "number" && Number.isFinite(ts) && ts > 0);
  if (!times.length) return "갱신 기록 없음";
  const date = new Date(Math.max(...times) * 1000);
  const df = new DateFormatter();
  df.dateFormat = date.toDateString() === new Date().toDateString() ? "HH:mm" : "M/d HH:mm";
  return "최근 갱신 " + df.string(date);
}

function addFooter(parent, S, updated) {
  const f = parent.addStack();
  f.layoutHorizontally();
  f.centerAlignContent();
  if (S.footerInset) f.addSpacer(S.footerInset);
  addText(f, updated, Font.systemFont(S.footer || Math.max(9, S.label - 2)), C.muted);
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

// ---- 새로고침 버튼으로 앱에서 실행됐을 때 ----
// 홈 화면 위젯을 다시 그리는 시점은 iOS가 정해서, 여기서 진행 상황과 결과를 직접 보여줘요.

function summary(p) {
  if (!p || !p.connected) return "연결 안 됨";
  const ws = (p.windows || []).slice(0, 2).map((w) => shortLabel(w.label) + " " + Math.round(w.used_percent) + "%");
  return ws.length ? ws.join(" · ") : "데이터 없음";
}

function clock(ts) {
  const df = new DateFormatter();
  df.dateFormat = "HH:mm:ss";
  return df.string(ts ? new Date(ts * 1000) : new Date());
}

function relayNote(d) {
  if (!d) return "";
  if (d.started) return "";
  if (d.reason === "no_token") return "바로 조회하려면 Cloudflare에 GITHUB_TOKEN이 필요해요 (지금은 15분마다 자동)";
  if (d.reason === "recent") return "3분 안에 이미 요청했어요. 곧 반영돼요";
  return d.error || "";
}

async function manualRefresh() {
  const table = new UITable();
  table.showSeparators = true;
  const rows = { claude: ["갱신 중…", ""], codex: ["갱신 중…", ""], gemini: ["갱신 중…", ""], grok: ["갱신 중…", ""], foot: "" };
  const draw = () => {
    table.removeAllRows();
    const head = new UITableRow();
    head.isHeader = true;
    head.height = 56;
    head.addText("AI 사용량 새로고침", clock() + " 기준").titleFont = Font.boldSystemFont(20);
    table.addRow(head);
    for (const [name, title] of [["claude", "Claude"], ["codex", "Codex"], ["gemini", "Gemini"], ["grok", "Grok"]]) {
      const r = new UITableRow();
      r.height = 72;
      const cell = r.addText(title + "  " + rows[name][0], rows[name][1]);
      cell.titleFont = Font.semiboldSystemFont(16);
      cell.subtitleFont = Font.systemFont(13);
      cell.subtitleColor = Color.gray();
      table.addRow(r);
    }
    if (rows.foot) {
      const f = new UITableRow();
      f.height = 64;
      const c = f.addText(rows.foot);
      c.titleFont = Font.systemFont(13);
      c.titleColor = Color.gray();
      table.addRow(f);
    }
    table.reload();
  };
  draw();
  const shown = table.present();

  const startedAt = Date.now() / 1000;
  const data = await load();
  if (data.error) {
    rows.claude = ["불러오기 실패", data.error];
    rows.codex = ["", ""];
    rows.gemini = ["", ""];
    rows.grok = ["", ""];
    draw();
    await shown;
    return;
  }
  rows.claude = data.claude.ok === false
    ? ["갱신 실패", "대시보드에서 확인해 주세요"]
    : [summary(data.claude), "갱신됨 " + clock(data.claude.fetched_at)];

  rows.grok = data.grok?.ok === false
    ? [summary(data.grok), "갱신 실패 · 대시보드에서 확인해 주세요"]
    : [summary(data.grok), data.grok?.fetched_at ? "갱신됨 " + clock(data.grok.fetched_at) : "대시보드에서 연결해 주세요"];

  const pending = new Set();
  let latest = data;
  const updateRows = () => {
    for (const name of ["codex", "gemini"]) {
      const p = latest[name];
      if (pending.has(name)) rows[name] = ["갱신 중…", "GitHub Actions로 조회하는 중"];
      else if (p && p.ok === false && p.connected) rows[name] = [summary(p), "갱신 실패 · 대시보드에서 확인해 주세요"];
      else rows[name] = [summary(p), p && p.fetched_at ? "마지막 수집 " + clock(p.fetched_at) : "설정과 조회 상태는 대시보드에서 확인해 주세요"];
      if (p && p.dispatch && !p.refreshing && p.connected) {
        const note = relayNote(p.dispatch);
        if (note) rows[name][1] = note;
      }
    }
  };
  for (const name of ["codex", "gemini"]) {
    if (data[name] && data[name].refreshing) pending.add(name);
  }
  updateRows(); draw();
  for (let i = 0; i < 30 && pending.size; i++) {
    await new Promise((r) => Timer.schedule(4000, false, r));
    const d = await load("");
    if (!d.error) {
      latest = d;
      for (const name of pending) {
        const p = d[name];
        const since = data[name].dispatch && data[name].dispatch.at || startedAt;
        if (p && Math.max(p.fetched_at || 0, p.error_at || 0) >= since) pending.delete(name);
      }
    }
    updateRows(); draw();
  }
  for (const name of pending) rows[name] = [summary(latest[name]), "아직 도착하지 않았어요. 잠시 뒤 다시 확인해 주세요"];
  rows.foot = "홈 화면 위젯은 iOS가 다시 그릴 때 반영돼요. 이 화면을 닫고 홈으로 돌아가면 보통 곧 바뀌어요.";
  draw();
  // 사용자가 이 화면을 닫을 때까지 기다렸다가 스크립트를 끝내요.
  await shown;
}

if (MANUAL) {
  await manualRefresh();
} else {
  const data = await load();
  const family = config.widgetFamily || "medium";
  const icons = Object.fromEntries(Object.keys(LOGOS).map((name) => [name, logo(name)]));
  const titles = { claude: "Claude", codex: "Codex", gemini: "Gemini", grok: "Grok" };
  // 작은 위젯은 기존 두 서비스를 유지해요. Parameter에 gemini를 넣으면 Gemini 전용으로 쓸 수 있어요.
  const requested = String(args.widgetParameter || "").toLowerCase().split(",").map((v) => v.trim()).filter((v) => Object.keys(titles).includes(v));
  const defaults = family === "small" ? ["claude", "codex"] : ["claude", "codex", "gemini", "grok"];
  const names = [...new Set(requested.length ? requested : defaults)].slice(0, family === "small" ? 2 : 4);
  const S = { ...(SIZES[family] || SIZES.medium) };
  if (family !== "small" && family !== "large" && gridSize(family).width <= 292) {
    Object.assign(S, { pad: 4, name: 9, label: 7.5, pct: 9, icon: 11, timer: 7 });
  }
  const widget = new ListWidget();
  const updated = lastUpdated(data, names);
  widget.backgroundColor = C.bg;
  widget.url = family === "small" ? REFRESH : DASHBOARD;
  // iOS에 5분 뒤 다시 그려 달라고 요청해요. 실제 시점은 iOS가 정해요.
  const pending = names.some((name) => data[name]?.refreshing);
  widget.refreshAfterDate = new Date(Date.now() + (pending ? 1 : 5) * 60 * 1000);

  if (data.error) {
    widget.setPadding(14, 15, 12, 15);
    addText(widget, "AI 사용량", Font.boldSystemFont(S.name), C.text);
    widget.addSpacer(6);
    addText(widget, data.error === "unauthorized" ? "위젯 키가 바뀌었어요. 스크립트를 다시 복사하세요." : "불러오기 실패", Font.systemFont(S.label), C.bad);
    widget.addSpacer();
    addFooter(widget, S, updated);
  } else if (family === "small") {
    widget.setPadding(11, 13, 11, 13);
    names.forEach((name, i) => {
      if (i) widget.addSpacer();
      addProvider(widget, titles[name], C[name], icons[name], data[name], S, i === 0);
    });
  } else {
    const size = gridSize(family);
    const outerX = family === "large" ? 14 : 12;
    const outerY = family === "large" ? 14 : 9;
    widget.setPadding(outerY, outerX, outerY, outerX);
    const columns = names.length === 1 ? 1 : 2;
    const rows = Math.ceil(names.length / columns);
    const cardWidth = (size.width - outerX * 2 - S.gap * (columns - 1)) / columns;
    const cardHeight = (size.height - outerY * 2 - Math.max(S.footer + 3, S.name + 3) - S.gap * rows) / rows;
    for (let i = 0; i < rows; i++) {
      if (i) widget.addSpacer(S.gap);
      const row = widget.addStack();
      row.layoutHorizontally();
      names.slice(i * columns, (i + 1) * columns).forEach((name, j) => {
        if (j) row.addSpacer(S.gap);
        addProviderCard(row, name, titles[name], icons[name], data[name], S, cardWidth, cardHeight);
      });
    }
    widget.addSpacer(S.gap);
    addFooter(widget, S, updated);
  }

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
}
Script.complete();
`;
}

