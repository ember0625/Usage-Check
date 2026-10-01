export const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f1115"/><rect x="14" y="34" width="9" height="18" rx="3" fill="#d97757"/><rect x="28" y="22" width="9" height="30" rx="3" fill="#10a37f"/><rect x="42" y="12" width="9" height="40" rx="3" fill="#8b93a7"/></svg>';

const STYLE = `
:root {
  --bg: #f4f5f7; --card: #ffffff; --text: #16181d; --muted: #6b7280; --line: #e5e7eb;
  --track: #eceef2; --ok: #16a34a; --warn: #d97706; --bad: #dc2626;
  --claude: #c96442; --codex: #10a37f; --btn: #16181d; --btn-text: #fff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115; --card: #181b21; --text: #eef0f4; --muted: #9aa1ae; --line: #2a2e37;
    --track: #262a33; --ok: #22c55e; --warn: #f59e0b; --bad: #f87171;
    --claude: #e08a6c; --codex: #34c79c; --btn: #eef0f4; --btn-text: #0f1115;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body {
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif;
  padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  -webkit-text-size-adjust: 100%;
}
main { max-width: 560px; margin: 0 auto; }
header { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 16px; }
h1 { font-size: 22px; margin: 0; letter-spacing: -0.02em; }
.sub { color: var(--muted); font-size: 13px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px; margin-bottom: 14px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.name { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.pill { font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; }
.win { margin: 14px 0; }
.win-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.win-label { font-weight: 600; }
.pct { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 20px; }
.bar { height: 10px; background: var(--track); border-radius: 999px; overflow: hidden; margin: 6px 0 4px; }
.fill { height: 100%; border-radius: 999px; transition: width .4s; }
.reset { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.msg { font-size: 14px; color: var(--muted); }
.err { font-size: 13px; color: var(--bad); word-break: break-word; margin-top: 8px; }
button, .btn {
  appearance: none; border: 0; border-radius: 12px; padding: 12px 16px; font: inherit; font-weight: 600;
  background: var(--btn); color: var(--btn-text); cursor: pointer; text-decoration: none; display: inline-block; text-align: center;
}
button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--line); padding: 8px 12px; font-size: 14px; }
button:disabled { opacity: .5; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.row > * { flex: 1 1 auto; }
input, textarea {
  width: 100%; font: inherit; padding: 12px; border-radius: 12px; border: 1px solid var(--line);
  background: var(--bg); color: var(--text);
}
ol { padding-left: 20px; margin: 8px 0; }
ol li { margin: 6px 0; }
.code { font: 700 28px/1.2 ui-monospace, Menlo, monospace; letter-spacing: .12em; text-align: center; padding: 12px; border: 1px dashed var(--line); border-radius: 12px; margin: 8px 0; user-select: all; }
details { margin-top: 10px; }
summary { color: var(--muted); font-size: 13px; cursor: pointer; }
pre { font-size: 11px; overflow-x: auto; background: var(--bg); padding: 8px; border-radius: 8px; }
footer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 18px; }
.hidden { display: none !important; }
`;

const SCRIPT = `
const $ = (s) => document.querySelector(s);
const PROVIDERS = {
  claude: { title: "Claude", color: "var(--claude)" },
  codex: { title: "Codex", color: "var(--codex)" },
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
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

function levelColor(p) {
  if (p >= 90) return "var(--bad)";
  if (p >= 70) return "var(--warn)";
  return "var(--ok)";
}

function fmtRemain(sec) {
  if (sec <= 0) return "곧 초기화";
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  if (d) return d + "일 " + h + "시간 후 초기화";
  if (h) return h + "시간 " + m + "분 후 초기화";
  return m + "분 후 초기화";
}

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function ago(ts) {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return "방금";
  if (s < 3600) return Math.floor(s / 60) + "분 전";
  return Math.floor(s / 3600) + "시간 전";
}

function renderWindow(w) {
  const p = Math.max(0, Math.min(100, w.used_percent));
  const resetEl = el("div", { class: "reset", "data-reset": w.resets_at || "" });
  return el("div", { class: "win" },
    el("div", { class: "win-top" },
      el("span", { class: "win-label" }, w.label),
      el("span", { class: "pct", style: "color:" + levelColor(p) }, Math.round(w.used_percent) + "%")),
    el("div", { class: "bar" }, el("div", { class: "fill", style: "width:" + p + "%;background:" + levelColor(p) })),
    resetEl);
}

function tickResets() {
  const now = Math.floor(Date.now() / 1000);
  document.querySelectorAll("[data-reset]").forEach((n) => {
    const t = Number(n.dataset.reset);
    n.textContent = t ? fmtRemain(t - now) + " · " + fmtTime(t) : "초기화 시각 정보 없음";
  });
}

function renderCard(name) {
  const meta = PROVIDERS[name];
  const s = state[name];
  const card = el("section", { class: "card", id: "card-" + name });
  const head = el("div", { class: "card-head" },
    el("div", { class: "name" }, el("span", { class: "dot", style: "background:" + meta.color }), meta.title));
  card.append(head);

  if (!s.connected) {
    card.append(el("p", { class: "msg" }, "아직 연결되지 않았어요."),
      el("div", { class: "row" }, el("button", { onclick: () => connect(name) }, meta.title + " 연결하기")));
    card.append(el("div", { id: "flow-" + name }));
    return card;
  }

  const u = s.usage;
  if (u && u.plan) head.append(el("span", { class: "pill" }, u.plan));
  if (!u) {
    card.append(el("p", { class: "msg" }, "아직 데이터가 없어요. 새로고침을 눌러보세요."));
  } else {
    if (u.windows && u.windows.length) u.windows.forEach((w) => card.append(renderWindow(w)));
    else card.append(el("p", { class: "msg" }, "한도 정보가 응답에 없어요. 아래 원본 응답을 확인해 주세요."));
    if (u.fetched_at) card.append(el("div", { class: "sub" }, "마지막 성공: " + ago(u.fetched_at)));
    if (!u.ok) {
      card.append(el("div", { class: "err" }, (u.needs_reconnect ? "로그인이 만료됐어요. 다시 연결해 주세요. " : "갱신 실패: ") + u.error));
      if (u.needs_reconnect) card.append(el("div", { class: "row" }, el("button", { onclick: () => connect(name) }, "다시 연결")));
    }
    if (u.raw) card.append(el("details", {}, el("summary", {}, "원본 응답"), el("pre", {}, JSON.stringify(u.raw, null, 2))));
  }
  card.append(el("div", { id: "flow-" + name }));
  card.append(el("div", { class: "row" }, el("button", { class: "ghost", onclick: () => disconnect(name) }, "연결 해제")));
  return card;
}

function render() {
  const root = $("#cards");
  root.replaceChildren(...Object.keys(PROVIDERS).map(renderCard));
  tickResets();
}

async function load(refresh) {
  const btn = $("#refresh");
  btn.disabled = true;
  try {
    state = await api("/api/usage" + (refresh ? "?refresh=1" : ""));
    render();
  } catch (e) {
    $("#cards").replaceChildren(el("div", { class: "card err" }, e.message));
  } finally {
    btn.disabled = false;
  }
}

async function disconnect(name) {
  if (!confirm(PROVIDERS[name].title + " 연결을 해제할까요?")) return;
  await api("/api/" + name + "/disconnect", { method: "POST", body: "{}" });
  load(false);
}

async function connect(name) {
  const box = $("#flow-" + name);
  box.replaceChildren(el("p", { class: "msg" }, "준비 중…"));
  try {
    const r = await api("/api/" + name + "/start", { method: "POST", body: "{}" });
    if (name === "claude") claudeFlow(box, r); else codexFlow(box, r);
  } catch (e) {
    box.replaceChildren(el("div", { class: "err" }, e.message));
  }
}

function claudeFlow(box, r) {
  const input = el("textarea", { rows: "3", placeholder: "여기에 코드를 붙여넣기" });
  const err = el("div", { class: "err" });
  const submit = el("button", { onclick: async () => {
    submit.disabled = true; err.textContent = "";
    try {
      await api("/api/claude/finish", { method: "POST", body: JSON.stringify({ code: input.value }) });
      setTimeout(() => load(false), 1500);
    } catch (e) { err.textContent = e.message; submit.disabled = false; }
  } }, "연결 완료");
  box.replaceChildren(
    el("ol", {},
      el("li", {}, "아래 버튼으로 Claude 로그인 페이지를 열고 승인하세요."),
      el("li", {}, "화면에 나오는 코드를 복사하세요."),
      el("li", {}, "이 화면으로 돌아와 붙여넣고 '연결 완료'를 누르세요.")),
    el("div", { class: "row" }, el("a", { class: "btn", href: r.url, target: "_blank", rel: "noopener" }, "Claude 로그인 열기")),
    el("div", { class: "row" }, input),
    el("div", { class: "row" }, submit),
    err);
}

function codexFlow(box, r) {
  const status = el("p", { class: "msg" }, "승인을 기다리는 중…");
  box.replaceChildren(
    el("ol", {},
      el("li", {}, "아래 코드를 복사하세요."),
      el("li", {}, "버튼으로 OpenAI 페이지를 열고 로그인한 뒤 코드를 입력하세요."),
      el("li", {}, "승인이 끝나면 이 화면이 자동으로 바뀌어요.")),
    el("div", { class: "code" }, r.user_code),
    el("div", { class: "row" }, el("a", { class: "btn", href: r.url, target: "_blank", rel: "noopener" }, "OpenAI 로그인 열기")),
    status);
  const started = Date.now();
  const poll = async () => {
    if (!document.body.contains(status)) return;
    if (Date.now() - started > 15 * 60 * 1000) { status.textContent = "시간이 지났어요. 다시 연결해 주세요."; return; }
    try {
      const p = await api("/api/codex/poll", { method: "POST", body: "{}" });
      if (!p.pending) { status.textContent = "연결됐어요!"; setTimeout(() => load(false), 1500); return; }
    } catch (e) { status.className = "err"; status.textContent = e.message; return; }
    setTimeout(poll, Math.max(3, r.interval || 5) * 1000);
  };
  setTimeout(poll, 5000);
}

async function logout() {
  await api("/api/logout", { method: "POST", body: "{}" });
  location.reload();
}

$("#refresh").addEventListener("click", () => load(true));
$("#logout").addEventListener("click", logout);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
setInterval(tickResets, 30000);
load(false);
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
<meta name="theme-color" content="#0f1115">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="AI 사용량">
<meta name="robots" content="noindex">
<title>AI 사용량</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(ICON_SVG)}">
<link rel="apple-touch-icon" href="data:image/svg+xml,${encodeURIComponent(ICON_SVG)}">
<style>${STYLE}</style>
</head>
<body><main>${body}</main>${script ? `<script>${script}</script>` : ""}</body>
</html>`;
}

export function renderPage({ authed, setupMissing }) {
  if (setupMissing) {
    return shell(`
<header><h1>AI 사용량</h1></header>
<section class="card">
  <p><b>설정이 하나 남았어요.</b></p>
  <p class="msg">Cloudflare 대시보드 → 이 Worker → <b>Settings → Variables and Secrets</b>에서
  <b>Secret</b> 타입으로 <code>DASHBOARD_PASSWORD</code>를 추가해 주세요. 저장하면 바로 적용돼요.</p>
</section>`);
  }
  if (!authed) {
    return shell(
      `
<header><h1>AI 사용량</h1></header>
<form id="login" class="card">
  <p class="msg">대시보드 비밀번호를 입력하세요.</p>
  <input id="pw" type="password" autocomplete="current-password" required>
  <div class="row"><button type="submit">들어가기</button></div>
  <div id="err" class="err"></div>
</form>`,
      LOGIN_SCRIPT
    );
  }
  return shell(
    `
<header>
  <div><h1>AI 사용량</h1><div class="sub">15분마다 자동 갱신</div></div>
  <button id="refresh" class="ghost">새로고침</button>
</header>
<div id="cards"><p class="msg">불러오는 중…</p></div>
<footer><button id="logout" class="ghost">로그아웃</button></footer>`,
    SCRIPT
  );
}
