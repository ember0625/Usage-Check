// GitHub Actions에서 Codex 사용량을 대신 조회해서 Worker에 올려요.
// chatgpt.com이 Cloudflare Worker에서 오는 요청을 막기 때문에 필요해요.
// 필요한 환경변수: WORKER_URL (예: https://usage-check.xxx.workers.dev), RELAY_SECRET
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

// 휴대폰에서 붙여넣으면 공백·줄바꿈이 섞이거나 https://가 빠지기 쉬워서 정리해요.
function cleanWorkerUrl(raw) {
  let v = (raw || "").replace(/\s+/g, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    return new URL(v).origin;
  } catch {
    console.error("WORKER_URL 형식이 이상해요. https://usage-check.xxx.workers.dev 처럼 넣어 주세요.");
    process.exit(1);
  }
}
const workerUrl = cleanWorkerUrl(process.env.WORKER_URL);
const secret = (process.env.RELAY_SECRET || "").trim();
if (!workerUrl || !secret) {
  console.error("WORKER_URL 또는 RELAY_SECRET이 설정되지 않았어요.");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${secret}` };
// 새로고침 때 Worker가 이 레포의 워크플로를 실행할 수 있게 레포 이름을 알려줘요. (Actions가 자동으로 넣어주는 값)
const repoHeader = process.env.GITHUB_REPOSITORY ? { "X-GitHub-Repository": process.env.GITHUB_REPOSITORY } : {};

async function getToken(force) {
  const res = await fetch(`${workerUrl}/relay/codex/token${force ? "?force=1" : ""}`, { headers: { ...auth, ...repoHeader } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Worker가 RELAY_SECRET을 거부했어요. Cloudflare와 GitHub의 RELAY_SECRET 값이 같은지 확인해 주세요.");
  if (res.status === 404 && /RELAY_SECRET/.test(body.error || "")) throw new Error("Cloudflare Worker에 RELAY_SECRET Secret이 없어요.");
  if (!res.ok) throw new Error(`Worker 토큰 요청 실패: HTTP ${res.status} ${body.error || ""}`);
  if (body.access_token) console.log(`::add-mask::${body.access_token}`);
  return body;
}

async function callUsage(t) {
  const headers = { Authorization: `Bearer ${t.access_token}`, "User-Agent": "codex-cli", Accept: "application/json" };
  if (t.account_id) headers["ChatGPT-Account-Id"] = t.account_id;
  return fetch(USAGE_URL, { headers });
}

async function report(payload) {
  const res = await fetch(`${workerUrl}/relay/codex/usage`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Worker 보고 실패: HTTP ${res.status}`);
}

let t = await getToken(false);
if (!t.connected) {
  console.log("Codex가 아직 연결되지 않았어요. 건너뜀.");
  process.exit(0);
}

let res = await callUsage(t);
if (res.status === 401) {
  t = await getToken(true);
  res = await callUsage(t);
}

const text = await res.text();
if (res.ok) {
  await report({ ok: true, data: JSON.parse(text) });
  console.log("Codex 사용량을 올렸어요.");
} else {
  const detail = text.trim().startsWith("<") ? "(HTML 응답 — 봇 차단 페이지일 가능성)" : text.slice(0, 300);
  await report({ ok: false, status: res.status, error: `사용량 조회 실패 (GitHub Actions): HTTP ${res.status} ${detail}` });
  console.error(`사용량 조회 실패: HTTP ${res.status}`);
  process.exit(1);
}
