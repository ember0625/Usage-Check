// iPhone Safari 확장 프로그램의 현재 사이트 JSON export 또는 Header String을 받습니다.
// Cookie-Editor 소스를 재사용하지 않는 독립적인 형식 변환기입니다.
export function parseGeminiCookies(raw, now = Date.now() / 1000) {
  const fail = () => { throw new Error("쿠키 형식을 확인해 주세요. Gemini 페이지의 Export → JSON 또는 Header String을 그대로 붙여넣으세요."); };
  if (typeof raw !== "string" || raw.length > 64000) return fail();
  const text = raw.trim();
  const validName = (name) => typeof name === "string" && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name);
  const validValue = (value) => typeof value === "string" && /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(value);
  if (!text) return fail();
  if (!text.startsWith("[")) {
    if (/[\r\n]/.test(text) || /^cookie\s*:/i.test(text)) return fail();
    const parts = text.split(";").map((part) => part.trim());
    for (const part of parts) {
      const at = part.indexOf("=");
      if (at < 1 || !validName(part.slice(0, at)) || !validValue(part.slice(at + 1))) return fail();
    }
    return parts.join("; ");
  }
  let items;
  try { items = JSON.parse(text); } catch { return fail(); }
  if (!Array.isArray(items) || !items.length || items.length > 300) return fail();
  const host = "gemini.google.com";
  const path = "/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery";
  const selected = [];
  for (const cookie of items) {
    if (!cookie || typeof cookie !== "object" || typeof cookie.domain !== "string") return fail();
    const domain = cookie.domain.toLowerCase().replace(/^\./, "");
    // JSON 내 다른 사이트와 다른 Google 서비스 전용 쿠키는 절대 전송하지 않아요.
    if (domain !== "google.com" && domain !== host) continue;
    if (cookie.hostOnly === true && domain !== host) continue;
    if (cookie.partitionKey) continue; // 다른 최상위 사이트에 묶인 쿠키는 사용하지 않아요.
    const cookiePath = cookie.path ?? "/";
    if (typeof cookiePath !== "string" || !cookiePath.startsWith("/")) return fail();
    if (cookiePath !== path && !(path.startsWith(cookiePath) && (cookiePath.endsWith("/") || path[cookiePath.length] === "/"))) continue;
    if (cookie.session !== true && cookie.expirationDate != null) {
      if (typeof cookie.expirationDate !== "number" || !Number.isFinite(cookie.expirationDate)) return fail();
      if (cookie.expirationDate <= now) continue;
    }
    if (!validName(cookie.name) || !validValue(cookie.value)) return fail();
    selected.push({ name: cookie.name, value: cookie.value, path: cookiePath });
  }
  if (!selected.length) return fail();
  selected.sort((a, b) => b.path.length - a.path.length);
  return selected.map((cookie) => cookie.name + "=" + cookie.value).join("; ");
}
