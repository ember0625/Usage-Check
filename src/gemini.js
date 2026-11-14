// Gemini 앱의 웹 사용량. Gemini API/CLI 한도와는 별개예요.
// 조회 규격 참고: https://github.com/steipete/CodexBar/blob/main/docs/gemini.md
// Google의 비공식 persisted query라 서명이 바뀌면 갱신해야 해요.
export const QUERY_SIGNATURE = "2/dWbCvkVB0X16r9NPnxifeOAAqdCqMf0xeWvau9yPy7g=";
export const ERROR_MESSAGES = {
  not_configured: "GitHub Actions Secret에 GEMINI_COOKIE를 등록하고 중계를 한 번 실행해 주세요.",
  auth: "Google 로그인이 만료됐거나 요청이 거부됐어요. Gemini 사용량 페이지를 확인하고 GEMINI_COOKIE를 갱신해 주세요.",
  rate_limit: "Gemini 조회가 너무 잦아요. 다음 자동 갱신을 기다려 주세요.",
  unavailable: "Gemini 사용량 서버에 연결할 수 없어요. 다음 갱신 때 다시 시도해요.",
  schema: "Gemini 사용량 응답 형식이 바뀌었어요. 조회 코드를 업데이트해야 해요.",
  no_quota: "이 Google 계정에서는 Gemini 앱 사용 한도 정보가 제공되지 않았어요.",
  cookie_format: "GEMINI_COOKIE 형식을 확인해 주세요. Cookie 요청 헤더의 값만 입력해야 해요.",
};

export class GeminiError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.unavailable);
    this.code = code in ERROR_MESSAGES ? code : "unavailable";
  }
}

export function usageUrl(signature = QUERY_SIGNATURE) {
  const url = new URL("https://gemini.google.com/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery");
  url.searchParams.set("query_signature", signature);
  url.searchParams.set("variables", JSON.stringify({
    g1Request: { entrypoints: ["GEMINI_USAGE_SETTINGS_UPGRADE_BANNER"] },
    workspaceRequest: { recommendationsForSurfaceRequests: [] },
  }));
  return url.toString();
}

export function normalize(text) {
  let results;
  try { results = JSON.parse(text.trim().replace(/^\)\]\}'\s*/, "")); }
  catch { throw new GeminiError("schema"); }
  if (!Array.isArray(results)) throw new GeminiError("schema");
  const result = results.find((r) => r?.data && Object.hasOwn(r.data, "viewer"));
  if (!result) throw new GeminiError("schema");
  if (result.data.viewer === null) throw new GeminiError("auth");
  const pools = result.data.viewer?.rpcs?.getUsageInfo?.pools;
  if (!Array.isArray(pools)) throw new GeminiError("schema");
  const windows = [];
  for (const [id, label] of [["GXU_FIVE_HOURLY", "5시간"], ["GXU_WEEKLY", "주간"]]) {
    const pool = pools.find((p) => p?.poolType === id);
    const value = pool?.percentageUsed;
    // 누락된 한도를 0%로 만들지 않아요. 실제 0은 유효해요.
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    const rawReset = pool.gxu?.windowRefreshesAt;
    const reset = typeof rawReset === "string" && /^\d{4}-\d{2}-\d{2}T/.test(rawReset) ? Date.parse(rawReset) : NaN;
    windows.push({ id, label, used_percent: Math.min(100, value * 100), resets_at: Number.isFinite(reset) ? Math.floor(reset / 1000) : null });
  }
  if (!windows.length) throw new GeminiError("no_quota");
  // 원본 응답에는 계정 정보가 있을 수 있으므로 사용량 필드만 반환해요.
  return { windows };
}

// 중계 서버가 보낸 자료도 다시 검증하고 허용한 필드만 저장해요.
export function validateUsage(data) {
  if (!Array.isArray(data?.windows) || !data.windows.length || data.windows.length > 2) throw new GeminiError("schema");
  const labels = { GXU_FIVE_HOURLY: "5시간", GXU_WEEKLY: "주간" };
  const seen = new Set();
  const windows = data.windows.map((w) => {
    if (!w || !Object.hasOwn(labels, w.id) || seen.has(w.id) || typeof w.used_percent !== "number" || !Number.isFinite(w.used_percent) || w.used_percent < 0 || w.used_percent > 100) throw new GeminiError("schema");
    if (w.resets_at !== null && (!Number.isSafeInteger(w.resets_at) || w.resets_at < 0 || w.resets_at > 8640000000000)) throw new GeminiError("schema");
    seen.add(w.id);
    return { id: w.id, label: labels[w.id], used_percent: w.used_percent, resets_at: w.resets_at };
  });
  windows.sort((a, b) => Object.keys(labels).indexOf(a.id) - Object.keys(labels).indexOf(b.id));
  return { windows };
}
