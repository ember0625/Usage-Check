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

// 대시보드와 같은 어두운 배경. 사용량 색과 바탕은 iOS 배터리 위젯과 같은 시스템 색(다크 모드).
const C = {
  bg: new Color("#1B1D20"),      // 위젯·대시보드 배경
  text: new Color("#F2F3F5"),    // 제목
  label: new Color("#E2E4E8"),   // 항목 이름 (5시간, 주간)
  muted: new Color("#AFB3BC"),   // 남은 시간, 시각
  track: new Color("#3A3A3C"),   // 막대·링 바탕 (systemGray4: 배경이 배터리 위젯보다 밝아서 한 단계 밝게)
  shade: new Color("#48484A"),   // 초기화 주기 중 지난 시간만큼 밝게 칠한 바탕 (systemGray3)
  ok: new Color("#30D158"),      // systemGreen
  warn: new Color("#FFD60A"),    // systemYellow
  bad: new Color("#FF453A"),     // systemRed
  claude: new Color("#D97757"),
  codex: new Color("#2DC8A8"),
  gemini: new Color("#8AB4F8"),
  grok: new Color("#F2F3F5"),
};

// 중간·큰 위젯은 서비스마다 한 줄 (로고·이름 | 5시간 | 주간). 작은 위젯은 2×2 링이에요.
const SIZES = {
  small: { name: 12, label: 10, pad: 12, gap: 10 },
  medium: { name: 11, label: 8.5, pct: 11, bar: 3, timer: 7, icon: 14, padX: 14, padTop: 9, padBottom: 7, colGap: 12, barGap: 1, footer: 8, nameRatio: 0.27 },
  large: { name: 14, label: 12, pct: 18, bar: 5, timer: 10, icon: 20, padX: 16, padTop: 16, padBottom: 13, colGap: 14, barGap: 3, footer: 10, pace: 9.5, nameRatio: 0.3 },
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

// 50% 미만 초록, 50% 이상 노랑, 80% 이상 빨강
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

// ---- 작은 위젯: 배터리 위젯처럼 2×2 링 ----
// 바깥 링은 항상 주간, 안쪽 링은 5시간. 5시간 한도가 없으면(Grok, Codex Pro) 바깥 주간 링 하나예요.
// 가운데에는 로고만 있어요.

function ringImage(D, rings, alert) {
  const dc = new DrawContext();
  dc.size = new Size(D, D);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const W = 6;
  const c = D / 2;
  const at = (r, angle) => new Point(c + r * Math.cos(angle), c + r * Math.sin(angle));
  rings.forEach((ring, i) => {
    const r = c - W / 2 - i * (W + 2);
    dc.setLineWidth(W);
    const track = new Path();
    track.addEllipse(new Rect(c - r, c - r, r * 2, r * 2));
    dc.addPath(track);
    dc.setStrokeColor(C.track);
    dc.strokePath();
    if (!(ring.p > 0)) return;
    // 12시 방향에서 시계 방향으로. DrawContext에는 호(arc)가 없어서 짧은 선으로 이어 그려요.
    const start = -Math.PI / 2;
    const sweep = (Math.min(100, ring.p) / 100) * Math.PI * 2;
    const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 60)));
    const arc = new Path();
    arc.move(at(r, start));
    for (let k = 1; k <= steps; k++) arc.addLine(at(r, start + (sweep * k) / steps));
    dc.addPath(arc);
    dc.setStrokeColor(ring.color);
    dc.strokePath();
    // 선 끝을 둥글게 (아주 작은 값도 점으로 보여요)
    dc.setFillColor(ring.color);
    for (const angle of [start, start + sweep]) {
      const q = at(r, angle);
      dc.fillEllipse(new Rect(q.x - W / 2, q.y - W / 2, W, W));
    }
  });
  // 오래된 데이터(노랑)·갱신 실패(빨강) 표시 점. 배경색 테두리로 링과 떨어뜨려요.
  if (alert) {
    dc.setFillColor(C.bg);
    dc.fillEllipse(new Rect(D - 15, 0, 15, 15));
    dc.setFillColor(alert);
    dc.fillEllipse(new Rect(D - 12, 3, 9, 9));
  }
  return dc.getImage();
}

function addRingCell(parent, name, icon, p, D) {
  const cell = parent.addStack();
  cell.size = new Size(D, D);
  cell.layoutHorizontally();
  cell.centerAlignContent();
  const windows = p && p.connected ? p.windows || [] : [];
  const pick = (label) => windows.find((w) => shortLabel(w.label) === label && Number.isFinite(w.used_percent));
  const rings = [pick("주간"), name === "grok" ? null : pick("5시간")].filter(Boolean).map((w) => {
    const v = Math.max(0, Math.min(100, w.used_percent));
    return { p: v, color: levelColor(v) };
  });
  // 연결 안 됨·데이터 없음은 빈 링으로 보여줘요.
  if (!rings.length) rings.push({ p: 0 });
  const stale = p && p.connected && p.fetched_at && Date.now() / 1000 - p.fetched_at > 2700;
  const alert = p && p.connected && p.ok === false ? C.bad : stale ? C.warn : null;
  cell.backgroundImage = ringImage(D, rings, alert);
  const size = Math.round(D * 0.34);
  const img = cell.addImage(icon);
  img.imageSize = new Size(size, size);
  img.cornerRadius = size / 4.5;
}

// 왼쪽 정렬된 한 줄 글자. 고정 폭 칸은 내용을 가운데에 놓아서 오른쪽을 채워요.
function addLine(parent, text, font, color, width) {
  const line = parent.addStack();
  line.layoutHorizontally();
  line.size = new Size(width, 0);
  const t = addText(line, text, font, color);
  line.addSpacer();
  return t;
}

// 한도 한 칸: 이름·퍼센트 / 막대 / 남은 시간 (큰 위젯은 "이 속도면" 한 줄 더)
function addUsageColumn(parent, label, w, p, S, width) {
  const col = parent.addStack();
  col.layoutVertically();
  col.size = new Size(width, 0);
  // Grok의 5시간 칸은 비워 둬서, 주간 칸이 다른 줄과 같은 위치에 오게 해요.
  if (!label) return;
  const top = col.addStack();
  top.layoutHorizontally();
  top.bottomAlignContent();
  top.size = new Size(width, 0);
  addText(top, label, Font.mediumSystemFont(S.label), C.label);
  top.addSpacer();
  const value = w && Number.isFinite(w.used_percent) ? Math.max(0, Math.min(100, w.used_percent)) : null;
  const color = value === null ? C.muted : levelColor(value);
  addText(top, value === null ? "—" : String(Math.round(value)), Font.semiboldSystemFont(S.pct), color);
  if (value !== null) addText(top, "%", Font.mediumSystemFont(S.label), color);
  col.addSpacer(S.barGap);
  const info = addBar(col, width, S.bar, value || 0, color, w, S.bar);
  col.addSpacer(S.barGap);
  const caption = !p?.connected ? "연결 안 됨" : !w ? "제공 안 됨" : remain(w.resets_at) || "초기화 정보 없음";
  addLine(col, caption, Font.systemFont(S.timer), C.muted, width).minimumScaleFactor = 0.8;
  // 큰 위젯에만 "이 속도면 언제 소진"을 한 줄로 적어요. 중간 위젯은 음영만으로 보여줘요.
  if (S.pace && info && value !== null && value < 100) {
    col.addSpacer(1);
    const fast = info.eta !== null;
    addLine(col, fast ? duration(info.eta) + " 뒤 소진 예상" : "여유 있음", Font.mediumSystemFont(S.pace), fast ? C.warn : C.muted, width).minimumScaleFactor = 0.8;
  }
}

// 서비스 한 줄: 로고·이름 | 5시간 | 주간
function addProviderRow(parent, id, title, icon, p, S, width) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(width, 0);
  const nameWidth = Math.round(width * S.nameRatio);
  const lead = Math.round(S.colGap / 2);
  const colWidth = Math.floor((width - nameWidth - lead - S.colGap) / 2);
  const head = row.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  head.size = new Size(nameWidth, 0);
  const img = head.addImage(icon);
  img.imageSize = new Size(S.icon, S.icon);
  head.addSpacer(Math.round(S.icon * 0.4));
  const name = addText(head, title, Font.boldSystemFont(S.name), C.text);
  name.minimumScaleFactor = 0.8;
  const stale = p?.fetched_at && Date.now() / 1000 - p.fetched_at > 2700;
  if (p?.connected && (p.ok === false || stale)) {
    head.addSpacer(3);
    const badge = SFSymbol.named("exclamationmark.circle");
    const warning = head.addImage(badge.image);
    warning.imageSize = new Size(S.label, S.label);
    warning.tintColor = p.ok === false ? C.bad : C.warn;
  }
  head.addSpacer();
  row.addSpacer(lead);
  const windows = p?.connected ? p.windows || [] : [];
  const pick = (label) => windows.find((window) => shortLabel(window.label) === label);
  // Grok에는 5시간 한도가 없어서 그 칸을 비워 둬요.
  addUsageColumn(row, id === "grok" ? null : "5시간", id === "grok" ? null : pick("5시간"), p, S, colWidth);
  row.addSpacer(S.colGap);
  addUsageColumn(row, "주간", pick("주간"), p, S, colWidth);
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
  // Parameter에 claude,gemini처럼 적으면 그 서비스만 그 순서로 보여줘요.
  const requested = String(args.widgetParameter || "").toLowerCase().split(",").map((v) => v.trim()).filter((v) => Object.keys(titles).includes(v));
  const names = [...new Set(requested.length ? requested : Object.keys(titles))].slice(0, 4);
  const S = { ...(SIZES[family] || SIZES.medium) };
  if (family !== "small" && family !== "large" && gridSize(family).width <= 292) {
    Object.assign(S, { padX: 11, name: 9.5, label: 8, pct: 10, icon: 12, timer: 7, colGap: 9 });
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
    // 위젯 전체가 새로고침 링크예요 (작은 위젯은 iOS 제약으로 부분 터치가 안 돼요).
    const side = gridSize("small").height;
    const D = Math.floor((side - S.pad * 2 - S.gap) / 2);
    widget.setPadding(S.pad, S.pad, S.pad, S.pad);
    for (let i = 0; i < names.length; i += 2) {
      if (i) widget.addSpacer(S.gap);
      const row = widget.addStack();
      row.layoutHorizontally();
      names.slice(i, i + 2).forEach((name, j) => {
        if (j) row.addSpacer(S.gap);
        addRingCell(row, name, icons[name], data[name], D);
      });
    }
  } else {
    const size = gridSize(family);
    widget.setPadding(S.padTop, S.padX, S.padBottom, S.padX);
    const width = size.width - S.padX * 2;
    names.forEach((name, i) => {
      if (i) widget.addSpacer();
      addProviderRow(widget, name, titles[name], icons[name], data[name], S, width);
    });
    widget.addSpacer();
    addFooter(widget, S, updated);
  }

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
}
Script.complete();
`;
}

