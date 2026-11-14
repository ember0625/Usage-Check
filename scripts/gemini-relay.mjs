// 쿠키는 GitHub Secret에서만 읽고 Google로만 전송해요.
// Worker에는 정규화된 사용량 또는 정해진 오류 코드만 보냅니다.
import { pathToFileURL } from "node:url";
import { GeminiError, ERROR_MESSAGES, normalize, usageUrl } from "../src/gemini.js";
import { parseGeminiCookies } from "../src/gemini-cookies.js";

export async function fetchUsage(cookie, { fetchImpl = fetch, signature } = {}) {
  let value;
  try { value = parseGeminiCookies(cookie); } catch { throw new GeminiError("cookie_format"); }
  let response;
  try {
    response = await fetchImpl(usageUrl(signature), {
      headers: { Cookie: value, Accept: "application/json", Referer: "https://gemini.google.com/usage" },
      redirect: "manual", signal: AbortSignal.timeout(20000),
    });
  } catch { throw new GeminiError("unavailable"); }
  if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) throw new GeminiError("auth");
  if (response.status === 429) throw new GeminiError("rate_limit");
  if (response.status >= 500) throw new GeminiError("unavailable");
  if (response.status !== 200) throw new GeminiError("schema");
  let text;
  try { text = await response.text(); } catch { throw new GeminiError("unavailable"); }
  if (text.trimStart().startsWith("<")) throw new GeminiError("auth");
  return normalize(text);
}

export async function fetchUsageWithRetry(cookie, { fetchImpl = fetch, signature, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = console.log } = {}) {
  try { return await fetchUsage(cookie, { fetchImpl, signature }); }
  catch (err) {
    // 인증 거부·429는 재시도하지 않아요. 원본 응답/오류에는 개인정보가 있을 수 있어 출력하지 않아요.
    if (!(err instanceof GeminiError) || !["schema", "unavailable"].includes(err.code)) throw err;
    log("Gemini 응답 확인 실패. 3초 뒤 한 번 재시도합니다.");
    await sleep(3000);
    return fetchUsage(cookie, { fetchImpl, signature });
  }
}

export async function runRelay(env = process.env, { fetchImpl = fetch, log = console.log, error = console.error, sleep } = {}) {
  const cookie = env.GEMINI_COOKIE || "";
  // PR 브랜치에서는 실제 서버 조회만 확인하고 기존 대시보드에 전송하지 않아요.
  if (env.GEMINI_CHECK_ONLY === "true") {
    if (!cookie.trim()) { error(ERROR_MESSAGES.not_configured); return 1; }
    try {
      const data = await fetchUsageWithRetry(cookie, { fetchImpl, signature: env.GEMINI_QUERY_SIGNATURE || undefined, log, sleep });
      log("Gemini 서버 조회 성공 (검사 전용: 대시보드 변경 없음)");
      for (const window of data.windows) log(`${window.label}: ${Number(window.used_percent.toFixed(2))}% 사용`);
      return 0;
    } catch (err) {
      error(ERROR_MESSAGES[err instanceof GeminiError ? err.code : "unavailable"]);
      return 1;
    }
  }
  const secret = (env.RELAY_SECRET || "").trim();
  let origin;
  try {
    const url = new URL((env.WORKER_URL || "").trim());
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    origin = url.origin;
  } catch {
    if (!cookie.trim()) { log("Gemini가 설정되지 않아 건너뜀."); return 0; }
    error("WORKER_URL에 올바른 https 주소를 설정해 주세요."); return 1;
  }
  if (!secret) {
    if (!cookie.trim()) { log("Gemini가 설정되지 않아 건너뜀."); return 0; }
    error("RELAY_SECRET을 설정해 주세요."); return 1;
  }
  let payload;
  if (!cookie.trim()) {
    payload = { ok: false, code: "not_configured" };
  } else {
    try {
      const data = await fetchUsageWithRetry(cookie, { fetchImpl, signature: env.GEMINI_QUERY_SIGNATURE || undefined, log, sleep });
      payload = { ok: true, data };
    } catch (err) {
      payload = { ok: false, code: err instanceof GeminiError ? err.code : "unavailable" };
    }
  }
  try {
    const response = await fetchImpl(`${origin}/relay/gemini/usage`, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "X-GitHub-Repository": env.GITHUB_REPOSITORY || "" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) { error(`Gemini 결과 전송 실패 (HTTP ${response.status}). Worker 배포와 RELAY_SECRET을 확인해 주세요.`); return 1; }
  } catch { error("Worker에 Gemini 결과를 전송하지 못했어요."); return 1; }
  if (payload.ok) { log("Gemini 앱 사용량을 올렸어요."); return 0; }
  if (payload.code === "not_configured") { log("Gemini가 설정되지 않았어요. GEMINI_COOKIE 등록 후 다시 실행해 주세요."); return 0; }
  error(ERROR_MESSAGES[payload.code]);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runRelay();
