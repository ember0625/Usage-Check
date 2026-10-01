export const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0C0D10"/><rect x="14" y="34" width="9" height="18" rx="3" fill="#D97757"/><rect x="28" y="22" width="9" height="30" rx="3" fill="#2DC8A8"/><rect x="42" y="12" width="9" height="40" rx="3" fill="#8B8E96"/></svg>';

// Claude Design "AI 사용량 모바일 인터페이스" 핸드오프를 따른 스타일이에요.
const STYLE = `
:root {
  --bg: #0C0D10; --card: #15171B; --inset: #0F1013;
  --line: rgba(255,255,255,.06); --line2: rgba(255,255,255,.12);
  --text: #ECEDEF; --text2: #D7D9DE; --text3: #C9CBD1;
  --muted: #9A9DA5; --muted2: #8B8E96; --muted3: #7C8088; --muted4: #6B6F77;
  --track: #24272D; --ok: #3DD68C; --warn: #F2B544; --bad: #F06B5F;
  --danger: #E8857A; --danger-text: #F09A8F;
  --claude: #D97757; --codex: #2DC8A8;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); }
body { -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; word-break: keep-all; overflow-wrap: anywhere; }
a { color: var(--text3); }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
main {
  min-height: 100vh; max-width: 430px; margin: 0 auto;
  padding: max(64px, calc(env(safe-area-inset-top) + 24px)) 20px max(48px, calc(env(safe-area-inset-bottom) + 24px));
  font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--text); font-variant-numeric: tabular-nums;
}
button { font-family: inherit; cursor: pointer; }
button:disabled { cursor: default; }

.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
.top-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
.subtitle { margin: 0; font-size: 14px; color: var(--muted2); letter-spacing: -0.01em; }
.refresh {
  flex: none; display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; margin-top: 2px;
  background: transparent; border: 1px solid var(--line2); border-radius: 10px; color: var(--text2);
  font-size: 14px; font-weight: 500; line-height: 1; letter-spacing: -0.01em; transition: background .15s;
}
.refresh:hover { background: rgba(255,255,255,.05); }
.refresh:active { background: rgba(255,255,255,.09); }
.spinner {
  width: 12px; height: 12px; border-radius: 50%; display: inline-block;
  border: 1.5px solid rgba(255,255,255,.2); border-top-color: var(--text2); animation: spin .7s linear infinite;
}

.cards { display: flex; flex-direction: column; gap: 14px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 20px 20px 14px; }
.card-head { display: flex; align-items: center; gap: 10px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.logo { width: 24px; height: 24px; border-radius: 7px; flex: none; display: block; }
h2 { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -0.02em; flex: 1; }
.badge { font-size: 12px; color: var(--muted); border: 1px solid var(--line2); border-radius: 999px; padding: 3px 9px; line-height: 1.2; }

.windows { display: flex; flex-direction: column; gap: 22px; margin-top: 22px; }
.win { display: flex; flex-direction: column; gap: 10px; }
.win-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.win-label { font-size: 15px; font-weight: 500; color: var(--text3); letter-spacing: -0.01em; }
.pct { display: flex; align-items: baseline; gap: 1px; transition: color .3s; }
.pct-num { font-size: 30px; font-weight: 650; letter-spacing: -0.03em; line-height: 1; }
.pct-sign { font-size: 16px; font-weight: 600; }
.bar { height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
.fill { height: 100%; border-radius: 3px; transition: width .6s cubic-bezier(.2,.7,.2,1); }
.win-bottom { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; letter-spacing: -0.01em; }
.win-left { color: var(--muted); }
.win-at { color: var(--muted4); }

.foot { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
.meta { font-size: 13px; color: var(--muted3); letter-spacing: -0.01em; }
.foot-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; }
.text-btn {
  display: flex; align-items: center; gap: 7px; padding: 6px 0; background: none; border: 0;
  color: var(--muted); font-size: 13px; font-weight: 500;
}
.text-btn:hover { color: var(--text2); }
.tri { display: inline-block; font-size: 9px; transition: transform .2s; }
.tri.open { transform: rotate(90deg); }
.disc-btn {
  padding: 6px 10px; margin-right: -10px; background: none; border: 0; border-radius: 8px;
  color: var(--muted3); font-size: 13px; font-weight: 500;
}
.disc-btn:hover { color: var(--danger); background: rgba(232,133,122,.08); }
.confirm { display: flex; align-items: center; gap: 6px; animation: fadein .18s ease-out; }
.confirm-q { font-size: 13px; color: var(--muted); margin-right: 4px; }
.chip { height: 30px; padding: 0 11px; border: 0; border-radius: 8px; font-size: 13px; font-weight: 500; }
.chip.cancel { background: rgba(255,255,255,.06); color: var(--text3); }
.chip.danger { background: rgba(232,133,122,.16); color: var(--danger-text); font-weight: 600; }
pre.raw {
  margin: 0 0 6px; padding: 12px 14px; background: var(--inset); border: 1px solid rgba(255,255,255,.04); border-radius: 12px;
  font: 11.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; color: #A8ABB2; overflow: auto; max-height: 220px;
  animation: fadein .18s ease-out;
}

.status-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding-bottom: 6px; }
.status-text { font-size: 14px; color: var(--muted3); }
.primary-sm {
  height: 34px; padding: 0 14px; background: var(--text); border: 0; border-radius: 10px; color: #111214;
  font-size: 13px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; flex: none;
}
.primary-sm:active, .primary:active { opacity: .85; }
.primary {
  width: 100%; height: 46px; background: var(--text); border: 0; border-radius: 12px; color: #111214;
  font-size: 15px; font-weight: 600; text-decoration: none; display: flex; align-items: center; justify-content: center;
}
.primary:disabled { opacity: .5; }
.secondary {
  width: 100%; height: 46px; background: transparent; border: 1px solid var(--line2); border-radius: 12px; color: var(--text2);
  font-size: 15px; font-weight: 500; text-decoration: none; display: flex; align-items: center; justify-content: center;
}

.panel { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; animation: fadein .18s ease-out; }
.steps { margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.55; color: var(--text3); letter-spacing: -0.01em; }
.steps li + li { margin-top: 4px; }
textarea, input {
  width: 100%; font: inherit; font-size: 15px; padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--line2); background: var(--inset); color: var(--text); outline: none;
}
textarea:focus, input:focus { border-color: rgba(255,255,255,.28); }
.code {
  font: 600 28px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-align: center;
  padding: 14px; background: var(--inset); border: 1px dashed var(--line2); border-radius: 12px; user-select: all;
}
.note { font-size: 13px; color: var(--muted3); letter-spacing: -0.01em; }
.err { font-size: 13px; color: var(--bad); letter-spacing: -0.01em; word-break: break-word; }
.empty { margin-top: 18px; font-size: 14px; color: var(--muted3); }

.widget-head { display: flex; align-items: center; gap: 10px; width: 100%; background: none; border: 0; padding: 0; color: inherit; text-align: left; }
.widget-head .tri { color: var(--muted); font-size: 10px; }

.bottom { display: flex; justify-content: center; margin-top: 28px; }
.bottom .text-btn { color: var(--muted3); }
.login { display: flex; flex-direction: column; gap: 12px; }
`;

const SCRIPT = `
const $ = (s) => document.querySelector(s);
const PROVIDERS = {
  claude: { title: "Claude", color: "var(--claude)", logo: "https://www.google.com/s2/favicons?domain=claude.ai&sz=128" },
  codex: { title: "Codex", color: "var(--codex)", logo: "https://www.google.com/s2/favicons?domain=openai.com&sz=128" },
};
let state = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") { location.reload(); throw new Error("로그인이 필요해요"); }
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

function levelColor(p) {
  if (p >= 80) return "var(--bad)";
  if (p >= 50) return "var(--warn)";
  return "var(--ok)";
}

function fmtLeft(sec) {
  const m = Math.max(0, Math.round(sec / 60)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return d + "일 " + h + "시간";
  if (h) return h + "시간 " + mm + "분";
  return mm + "분";
}

function fmtAt(ts) {
  return new Date(ts * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function ago(ts) {
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "방금 전";
  if (m < 60) return m + "분 전";
  return Math.floor(m / 60) + "시간 전";
}

function renderWindow(w) {
  const p = Math.max(0, Math.min(100, w.used_percent));
  const color = levelColor(p);
  return el("div", { class: "win" },
    el("div", { class: "win-top" },
      el("span", { class: "win-label" }, w.label),
      el("span", { class: "pct", style: "color:" + color },
        el("span", { class: "pct-num" }, String(Math.round(w.used_percent))),
        el("span", { class: "pct-sign" }, "%"))),
    el("div", { class: "bar" },
      el("div", { class: "fill", style: "width:" + (p ? "max(" + p + "%, 6px)" : "0%") + ";background:" + color })),
    el("div", { class: "win-bottom" },
      el("span", { class: "win-left", "data-reset": w.resets_at || "" }),
      el("span", { class: "win-at" }, w.resets_at ? fmtAt(w.resets_at) : "")));
}

function tickResets() {
  const now = Date.now() / 1000;
  document.querySelectorAll("[data-reset]").forEach((n) => {
    const t = Number(n.dataset.reset);
    n.textContent = t ? (t - now <= 0 ? "곧 초기화" : fmtLeft(t - now) + " 후 초기화") : "초기화 시각 정보 없음";
  });
}

// ---- 화면 상태 ----
// 다시 그려도 입력값·열림 상태가 유지되도록 여기에 보관해요.
const ui = { raw: {}, confirm: null, refreshing: false, widgetOpen: false };
const flows = { claudeOpen: false, claudeDraft: "", claudeMsg: "", claudeBusy: false, codex: null };
try { flows.claudeOpen = sessionStorage.getItem("claudeOpen") === "1"; } catch (e) {}

function setClaudeOpen(v) {
  flows.claudeOpen = v;
  try { sessionStorage.setItem("claudeOpen", v ? "1" : "0"); } catch (e) {}
}

// ---- Claude 연결 ----

function claudeLoginUrl() {
  return (state.claude && state.claude.login_url) || "/claude/login";
}

function claudeButton(label) {
  return el("a", {
    class: "primary-sm", href: claudeLoginUrl(), target: "_blank", rel: "noopener",
    onclick: () => { setClaudeOpen(true); setTimeout(render, 0); },
  }, label);
}

function claudePanel() {
  if (!flows.claudeOpen) return null;
  const input = el("textarea", { rows: "3", placeholder: "여기에 코드를 붙여넣기" });
  input.value = flows.claudeDraft;
  input.addEventListener("input", () => { flows.claudeDraft = input.value; });
  return el("div", { class: "panel" },
    el("ol", { class: "steps" },
      el("li", {}, "새 탭에서 Claude에 로그인하고 승인하세요."),
      el("li", {}, "화면에 나오는 코드를 복사하세요."),
      el("li", {}, "이 탭으로 돌아와 붙여넣고 '연결 완료'를 누르세요.")),
    input,
    el("button", { class: "primary", disabled: flows.claudeBusy, onclick: () => finishClaude() }, flows.claudeBusy ? "연결 중…" : "연결 완료"),
    el("a", { class: "secondary", href: claudeLoginUrl(), target: "_blank", rel: "noopener" }, "로그인 페이지 다시 열기"),
    flows.claudeMsg ? el("div", { class: "err" }, flows.claudeMsg) : null);
}

async function finishClaude() {
  const code = flows.claudeDraft.trim();
  if (!code) { flows.claudeMsg = "코드를 붙여넣어 주세요."; render(); return; }
  flows.claudeBusy = true; flows.claudeMsg = ""; render();
  try {
    await api("/api/claude/finish", { method: "POST", body: JSON.stringify({ code }) });
    flows.claudeDraft = "";
    flows.claudeBusy = false;
    setClaudeOpen(false);
    await new Promise((r) => setTimeout(r, 1500));
    await load(false);
  } catch (e) {
    flows.claudeBusy = false;
    flows.claudeMsg = e.message;
    render();
  }
}

// ---- Codex 연결 ----

function codexButton(label) {
  return el("button", { class: "primary-sm", onclick: () => startCodex() }, label);
}

function codexPanel() {
  const f = flows.codex;
  if (!f) return null;
  return el("div", { class: "panel" },
    el("ol", { class: "steps" },
      el("li", {}, "아래 코드를 복사하세요."),
      el("li", {}, "OpenAI 페이지를 열고 로그인한 뒤 코드를 입력하세요."),
      el("li", {}, "승인이 끝나면 이 화면이 자동으로 바뀌어요.")),
    f.user_code ? el("div", { class: "code" }, f.user_code) : null,
    f.url ? el("a", { class: "primary", href: f.url, target: "_blank", rel: "noopener" }, "OpenAI 로그인 열기") : null,
    el("div", { class: f.error ? "err" : "note" }, f.error || f.status),
    f.error ? el("button", { class: "secondary", onclick: () => startCodex() }, "다시 시도") : null);
}

async function startCodex() {
  flows.codex = { status: "준비 중…" };
  render();
  try {
    const r = await api("/api/codex/start", { method: "POST", body: "{}" });
    flows.codex = { ...r, status: "승인을 기다리는 중…", started: Date.now() };
    render();
    setTimeout(pollCodex, 5000);
  } catch (e) {
    flows.codex = { error: e.message };
    render();
  }
}

async function pollCodex() {
  const f = flows.codex;
  if (!f || f.error || !f.started) return;
  if (Date.now() - f.started > 15 * 60 * 1000) { f.error = "시간이 지났어요. 다시 시도해 주세요."; render(); return; }
  try {
    const p = await api("/api/codex/poll", { method: "POST", body: "{}" });
    if (!p.pending) {
      flows.codex = null;
      await new Promise((r) => setTimeout(r, 1500));
      await load(false);
      return;
    }
  } catch (e) { f.error = e.message; render(); return; }
  setTimeout(pollCodex, Math.max(3, f.interval || 5) * 1000);
}

function connectButton(name, label) {
  return name === "claude" ? claudeButton(label) : codexButton(label);
}

function connectPanel(name) {
  return name === "claude" ? claudePanel() : codexPanel();
}

// ---- 카드 ----

function renderFoot(name, s) {
  const u = s.usage || {};
  const meta = [];
  if (u.fetched_at) meta.push("마지막 성공: " + ago(u.fetched_at));
  if (s.relay) meta.push("GitHub Actions로 갱신");
  const foot = el("div", { class: "foot" });
  if (meta.length) foot.append(el("span", { class: "meta" }, meta.join(" · ")));

  if (name === "codex") {
    const n = codexWaitNote();
    if (n) foot.append(n);
    const last = Math.max(u.fetched_at || 0, u.error_at || 0);
    if (s.relay && last && Date.now() / 1000 - last > 45 * 60) {
      foot.append(el("span", { class: "err" }, "GitHub Actions가 " + ago(last) + " 이후로 실행되지 않았어요. 레포의 Actions 탭을 확인해 주세요."));
    }
  }
  if (s.usage && !u.ok && u.error) {
    foot.append(el("span", { class: "err" }, u.needs_reconnect ? "로그인이 만료됐어요. 다시 연결해 주세요." : "갱신 실패: " + u.error));
    if (name === "codex" && !s.relay) {
      foot.append(el("span", { class: "note" }, "Codex는 Cloudflare에서 직접 조회하면 막혀요. Worker에 Secret RELAY_SECRET을 등록하면 GitHub Actions 중계로 바뀌어요."));
    }
  }

  const open = !!ui.raw[name];
  const row = el("div", { class: "foot-row" });
  row.append(u.raw
    ? el("button", { class: "text-btn", onclick: () => { ui.raw[name] = !open; render(); } },
        el("span", { class: "tri" + (open ? " open" : "") }, "▶"), "원본 응답")
    : el("span"));
  if (u.needs_reconnect) {
    row.append(connectButton(name, "다시 연결"));
  } else if (ui.confirm === name) {
    row.append(el("div", { class: "confirm" },
      el("span", { class: "confirm-q" }, "해제할까요?"),
      el("button", { class: "chip cancel", onclick: () => { ui.confirm = null; render(); } }, "취소"),
      el("button", { class: "chip danger", onclick: () => disconnect(name) }, "해제")));
  } else {
    row.append(el("button", { class: "disc-btn", onclick: () => { ui.confirm = name; render(); } }, "연결 해제"));
  }
  foot.append(row);
  if (open && u.raw) foot.append(el("pre", { class: "raw" }, JSON.stringify(u.raw, null, 2)));
  if (u.needs_reconnect) { const p = connectPanel(name); if (p) foot.append(p); }
  return foot;
}

function logoEl(meta) {
  const img = el("img", { class: "logo", src: meta.logo, alt: "", referrerpolicy: "no-referrer" });
  // 로고를 못 받아오면 디자인 시안의 색 점으로 대신해요.
  img.addEventListener("error", () => img.replaceWith(el("span", { class: "dot", style: "background:" + meta.color })));
  return img;
}

function renderCard(name) {
  const meta = PROVIDERS[name];
  const s = state[name];
  const u = s.usage;
  const card = el("section", { class: "card" },
    el("div", { class: "card-head" },
      logoEl(meta),
      el("h2", {}, meta.title),
      u && u.plan ? el("span", { class: "badge" }, u.plan) : null));

  if (!s.connected) {
    card.append(el("div", { class: "status-row" },
      el("span", { class: "status-text" }, "연결되지 않음"),
      connectButton(name, name === "claude" && flows.claudeOpen ? "로그인 열기" : "연결하기")));
    const p = connectPanel(name);
    if (p) card.append(p);
    return card;
  }

  if (u && u.windows && u.windows.length) {
    card.append(el("div", { class: "windows" }, u.windows.map(renderWindow)));
  } else if (!u) {
    card.append(el("p", { class: "empty" }, s.relay
      ? "GitHub Actions의 첫 조회를 기다리는 중이에요. 레포 → Actions → 'Codex 사용량 중계' → Run workflow로 바로 실행할 수 있어요."
      : "아직 데이터가 없어요. 새로고침을 눌러보세요."));
  } else {
    card.append(el("p", { class: "empty" }, "한도 정보가 없어요."));
  }
  card.append(renderFoot(name, s));
  return card;
}

// ---- iOS 위젯 ----

function renderWidgetCard() {
  const card = el("section", { class: "card", style: ui.widgetOpen ? null : "padding-bottom:20px" },
    el("button", { class: "widget-head", onclick: () => { ui.widgetOpen = !ui.widgetOpen; render(); } },
      el("h2", {}, "iOS 위젯"),
      el("span", { class: "tri" + (ui.widgetOpen ? " open" : "") }, "▶")));
  if (!ui.widgetOpen) return card;
  const msg = el("div", { class: "note" });
  card.append(el("div", { class: "panel" },
    el("ol", { class: "steps" },
      el("li", {}, "App Store에서 무료 앱 'Scriptable'을 설치하세요."),
      el("li", {}, "아래 '위젯 스크립트 복사'를 누르세요."),
      el("li", {}, "Scriptable에서 오른쪽 위 + → 붙여넣기 → 맨 위 제목을 'AI 사용량'으로 바꾸고 Done."),
      el("li", {}, "홈 화면을 길게 눌러 + → Scriptable 위젯(작게/중간) 추가."),
      el("li", {}, "위젯을 길게 눌러 '위젯 편집' → Script를 'AI 사용량'으로 고르세요.")),
    el("button", { class: "primary", onclick: () => copyWidget(msg) }, "위젯 스크립트 복사"),
    el("button", { class: "secondary", onclick: () => rotateWidgetKey(msg) }, "위젯 키 새로 만들기"),
    msg,
    el("span", { class: "note" }, "스크립트에는 위젯 전용 키가 들어 있어요. 누군가에게 보여줬다면 '위젯 키 새로 만들기'를 누르고 다시 복사하세요.")));
  card.append(el("div", { style: "height:6px" }));
  return card;
}

async function copyWidget(msg) {
  msg.className = "note";
  msg.textContent = "복사 중…";
  const text = fetch("/widget.js", { credentials: "same-origin" }).then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
  try {
    // iOS Safari는 버튼을 누른 순간에 클립보드 쓰기를 시작해야 해서 Promise를 그대로 넘겨요.
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
    } else {
      await navigator.clipboard.writeText(await text);
    }
    msg.textContent = "복사했어요! Scriptable에 붙여넣으세요.";
  } catch (e) {
    const area = el("textarea", { rows: "6", readonly: true });
    area.value = await text.catch(() => "");
    msg.replaceChildren("자동 복사가 안 돼요. 아래 글을 길게 눌러 전체 선택 → 복사하세요.", area);
  }
}

async function rotateWidgetKey(msg) {
  if (!confirm("위젯 키를 새로 만들까요? 기존 위젯은 스크립트를 다시 복사해야 동작해요.")) return;
  await api("/api/widget/key", { method: "POST", body: JSON.stringify({ rotate: true }) });
  msg.className = "note";
  msg.textContent = "새 키를 만들었어요. '위젯 스크립트 복사'를 다시 눌러 Scriptable에 붙여넣으세요.";
}

// ---- 그리기 ----

function renderRefresh() {
  const btn = $("#refresh");
  const busy = ui.refreshing || (codexWait && !codexWait.error);
  btn.disabled = ui.refreshing;
  btn.replaceChildren(busy ? el("span", { class: "spinner" }) : "", busy ? "갱신 중" : "새로고침");
}

function render() {
  renderRefresh();
  if (!state) return;
  const active = document.activeElement;
  const wasTyping = active && active.tagName === "TEXTAREA" && !active.readOnly;
  $("#cards").replaceChildren(...Object.keys(PROVIDERS).map(renderCard), renderWidgetCard());
  if (wasTyping) { const t = document.querySelector(".panel textarea"); if (t) t.focus(); }
  tickResets();
}

// 새로고침으로 GitHub Actions를 실행했으면, 새 Codex 값이 올라올 때까지 잠깐씩 다시 확인해요.
let codexWait = null;

async function load(refresh) {
  if (refresh) { ui.refreshing = true; renderRefresh(); }
  try {
    state = await api("/api/usage" + (refresh ? "?refresh=1" : ""));
    const d = state.codex && state.codex.dispatch;
    if (d && d.started) codexWait = { since: d.at, until: Date.now() + 150000 };
    else if (d && d.reason === "recent" && !codexWait) codexWait = { since: d.at, until: Date.now() + 60000 };
    else if (d && d.reason === "error") codexWait = { error: d.error };
  } catch (e) {
    $("#cards").replaceChildren(el("div", { class: "card err" }, e.message));
  } finally {
    if (refresh) ui.refreshing = false;
  }
  render();
  scheduleCodexCheck();
}

function codexUpdatedSince(since) {
  const u = state && state.codex && state.codex.usage;
  return !!u && Math.max(u.fetched_at || 0, u.error_at || 0) >= since;
}

function scheduleCodexCheck() {
  if (!codexWait || codexWait.error) return;
  if (codexUpdatedSince(codexWait.since) || Date.now() > codexWait.until) {
    codexWait = null;
    render();
    return;
  }
  clearTimeout(scheduleCodexCheck.t);
  scheduleCodexCheck.t = setTimeout(() => load(false), 8000);
}

function codexWaitNote() {
  if (!codexWait) return null;
  if (codexWait.error) return el("span", { class: "err" }, codexWait.error);
  return el("span", { class: "note" }, "GitHub Actions로 새로 조회하는 중… (30초~1분)");
}

async function disconnect(name) {
  ui.confirm = null;
  ui.raw[name] = false;
  await api("/api/" + name + "/disconnect", { method: "POST", body: "{}" });
  load(false);
}

async function logout() {
  await api("/api/logout", { method: "POST", body: "{}" });
  location.reload();
}

$("#refresh").addEventListener("click", () => load(true));
$("#logout").addEventListener("click", logout);
// 다른 탭에서 돌아왔을 때 숫자만 새로 받아와요. 입력 중인 코드와 진행 상태는 flows에 남아 있어요.
document.addEventListener("visibilitychange", () => { if (!document.hidden && !flows.claudeBusy) load(false); });
setInterval(tickResets, 15000);
// 위젯의 새로고침 아이콘은 /?refresh=1로 열려요. 바로 새로 조회하고 주소는 원래대로 돌려놔요.
const fromWidget = new URLSearchParams(location.search).get("refresh") === "1";
if (fromWidget) history.replaceState(null, "", "/");
load(fromWidget);
`;

const LOGIN_SCRIPT = `
document.querySelector("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.querySelector("#err");
  err.textContent = "";
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: document.querySelector("#pw").value }),
  });
  if (res.ok) location.reload();
  else err.textContent = (await res.json().catch(() => ({}))).error || "로그인 실패";
});
`;

function shell(body, script = "") {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0C0D10">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="AI 사용량">
<meta name="robots" content="noindex">
<title>AI 사용량</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(ICON_SVG)}">
<link rel="apple-touch-icon" href="data:image/svg+xml,${encodeURIComponent(ICON_SVG)}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${STYLE}</style>
</head>
<body><main>${body}</main>${script ? `<script>${script}</script>` : ""}</body>
</html>`;
}

const TITLE = `<div class="top-text"><h1>AI 사용량</h1><p class="subtitle">Claude 15분 · Codex 30분마다 자동 갱신</p></div>`;

export function renderPage({ authed, setupMissing }) {
  if (setupMissing) {
    return shell(`
<header class="top">${TITLE}</header>
<section class="card">
  <div class="card-head"><h2>설정이 하나 남았어요</h2></div>
  <p class="steps" style="padding:0;margin:14px 0 6px">Cloudflare 대시보드 → 이 Worker → <b>Settings → Variables and Secrets</b>에서
  <b>Secret</b> 타입으로 <code>DASHBOARD_PASSWORD</code>를 추가해 주세요. 저장하면 바로 적용돼요.</p>
</section>`);
  }
  if (!authed) {
    return shell(
      `
<header class="top">${TITLE}</header>
<form id="login" class="card login">
  <div class="card-head"><h2>로그인</h2></div>
  <span class="note">대시보드 비밀번호를 입력하세요.</span>
  <input id="pw" type="password" autocomplete="current-password" required>
  <button type="submit" class="primary">들어가기</button>
  <div id="err" class="err"></div>
  <div style="height:6px"></div>
</form>`,
      LOGIN_SCRIPT
    );
  }
  return shell(
    `
<header class="top">
  ${TITLE}
  <button id="refresh" class="refresh">새로고침</button>
</header>
<div id="cards" class="cards"><p class="empty">불러오는 중…</p></div>
<div class="bottom"><button id="logout" class="text-btn">로그아웃</button></div>`,
    SCRIPT
  );
}
