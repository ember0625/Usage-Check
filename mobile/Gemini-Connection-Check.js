// src/gemini-cookies.js
function parseGeminiCookies(raw, now = Date.now() / 1e3) {
  const fail = () => {
    throw new Error("\uCFE0\uD0A4 \uD615\uC2DD\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694. Gemini \uD398\uC774\uC9C0\uC758 Export \u2192 JSON \uB610\uB294 Header String\uC744 \uADF8\uB300\uB85C \uBD99\uC5EC\uB123\uC73C\uC138\uC694.");
  };
  if (typeof raw !== "string" || raw.length > 64e3) return fail();
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
  try {
    items = JSON.parse(text);
  } catch {
    return fail();
  }
  if (!Array.isArray(items) || !items.length || items.length > 300) return fail();
  const host = "gemini.google.com";
  const path = "/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery";
  const selected = [];
  for (const cookie of items) {
    if (!cookie || typeof cookie !== "object" || typeof cookie.domain !== "string") return fail();
    const domain = cookie.domain.toLowerCase().replace(/^\./, "");
    if (domain !== "google.com" && domain !== host) continue;
    if (cookie.hostOnly === true && domain !== host) continue;
    if (cookie.partitionKey) continue;
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

// src/gemini.js
var QUERY_SIGNATURE = "2/dWbCvkVB0X16r9NPnxifeOAAqdCqMf0xeWvau9yPy7g=";
var ERROR_MESSAGES = {
  not_configured: "GitHub Actions Secret\uC5D0 GEMINI_COOKIE\uB97C \uB4F1\uB85D\uD558\uACE0 \uC911\uACC4\uB97C \uD55C \uBC88 \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.",
  auth: "Google \uB85C\uADF8\uC778\uC774 \uB9CC\uB8CC\uB410\uAC70\uB098 \uC694\uCCAD\uC774 \uAC70\uBD80\uB410\uC5B4\uC694. Gemini \uC0AC\uC6A9\uB7C9 \uD398\uC774\uC9C0\uB97C \uD655\uC778\uD558\uACE0 GEMINI_COOKIE\uB97C \uAC31\uC2E0\uD574 \uC8FC\uC138\uC694.",
  rate_limit: "Gemini \uC870\uD68C\uAC00 \uB108\uBB34 \uC7A6\uC544\uC694. \uB2E4\uC74C \uC790\uB3D9 \uAC31\uC2E0\uC744 \uAE30\uB2E4\uB824 \uC8FC\uC138\uC694.",
  unavailable: "Gemini \uC0AC\uC6A9\uB7C9 \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4\uC694. \uB2E4\uC74C \uAC31\uC2E0 \uB54C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
  schema: "Gemini \uC751\uB2F5\uC744 \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC77C\uC2DC\uC801\uC778 \uC751\uB2F5 \uC624\uB958 \uB610\uB294 \uC870\uD68C \uADDC\uACA9 \uBCC0\uACBD\uC77C \uC218 \uC788\uC5B4\uC694. \uB2E4\uC74C \uAC31\uC2E0\uC5D0\uB3C4 \uACC4\uC18D\uB418\uBA74 \uD655\uC778\uC774 \uD544\uC694\uD574\uC694.",
  no_quota: "\uC774 Google \uACC4\uC815\uC5D0\uC11C\uB294 Gemini \uC571 \uC0AC\uC6A9 \uD55C\uB3C4 \uC815\uBCF4\uAC00 \uC81C\uACF5\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.",
  cookie_format: "GEMINI_COOKIE \uD615\uC2DD\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694. Safari \uD655\uC7A5 \uD504\uB85C\uADF8\uB7A8\uC5D0\uC11C \uD604\uC7AC Gemini \uC0AC\uC774\uD2B8\uB97C JSON \uB610\uB294 Header String\uC73C\uB85C \uB0B4\uBCF4\uB0B4 \uADF8\uB300\uB85C \uB4F1\uB85D\uD558\uC138\uC694."
};
var GeminiError = class extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.unavailable);
    this.code = code in ERROR_MESSAGES ? code : "unavailable";
  }
};
function usageUrl(signature = QUERY_SIGNATURE) {
  const variables = JSON.stringify({
    g1Request: { entrypoints: ["GEMINI_USAGE_SETTINGS_UPGRADE_BANNER"] },
    workspaceRequest: { recommendationsForSurfaceRequests: [] }
  });
  return "https://gemini.google.com/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery?query_signature=" + encodeURIComponent(signature) + "&variables=" + encodeURIComponent(variables);
}
function normalize(text) {
  let results;
  try {
    results = JSON.parse(text.trim().replace(/^\)\]\}'\s*/, ""));
  } catch {
    throw new GeminiError("schema");
  }
  if (!Array.isArray(results)) throw new GeminiError("schema");
  const result = results.find((r) => r?.data && Object.hasOwn(r.data, "viewer"));
  if (!result) throw new GeminiError("schema");
  if (result.data.viewer === null) throw new GeminiError("auth");
  const pools = result.data.viewer?.rpcs?.getUsageInfo?.pools;
  if (!Array.isArray(pools)) throw new GeminiError("schema");
  const windows = [];
  for (const [id, label] of [["GXU_FIVE_HOURLY", "5\uC2DC\uAC04"], ["GXU_WEEKLY", "\uC8FC\uAC04"]]) {
    const pool = pools.find((p) => p?.poolType === id);
    const value = pool?.percentageUsed;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    const rawReset = pool.gxu?.windowRefreshesAt;
    const reset = typeof rawReset === "string" && /^\d{4}-\d{2}-\d{2}T/.test(rawReset) ? Date.parse(rawReset) : NaN;
    windows.push({ id, label, used_percent: Math.min(100, value * 100), resets_at: Number.isFinite(reset) ? Math.floor(reset / 1e3) : null });
  }
  if (!windows.length) throw new GeminiError("no_quota");
  return { windows };
}

// scripts/gemini-iphone-check.entry.mjs
async function show(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("\uD655\uC778");
  await alert.presentAlert();
}
async function main() {
  const prompt = new Alert();
  prompt.title = "Gemini \uC5F0\uACB0 \uD655\uC778";
  prompt.message = "Safari\uC5D0\uC11C \uD604\uC7AC Gemini \uC0AC\uC774\uD2B8\uC758 \uCFE0\uD0A4\uB97C JSON \uB610\uB294 Header String\uC73C\uB85C \uB0B4\uBCF4\uB0B4 \uBD99\uC5EC\uB123\uC73C\uC138\uC694. Google\uC5D0 \uD55C \uBC88 \uC9C1\uC811 \uC870\uD68C\uD569\uB2C8\uB2E4. \uC800\uC7A5\uC18C\xB7\uB300\uC2DC\uBCF4\uB4DC\uB294 \uBCC0\uACBD\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
  prompt.addSecureTextField("\uB0B4\uBCF4\uB0B8 \uCFE0\uD0A4 \uBD99\uC5EC\uB123\uAE30");
  prompt.addAction("Google\uC5D0 \uC870\uD68C");
  prompt.addCancelAction("\uCDE8\uC18C");
  if (await prompt.presentAlert() === -1) return;
  let header;
  try {
    header = parseGeminiCookies(prompt.textFieldValue(0));
  } catch (error) {
    await show("\uD615\uC2DD \uD655\uC778 \uD544\uC694", error.message);
    return;
  }
  const request = new Request(usageUrl());
  request.method = "GET";
  request.headers = { Cookie: header, Accept: "application/json", Referer: "https://gemini.google.com/usage" };
  request.timeoutInterval = 20;
  let redirected = false;
  request.onRedirect = () => {
    redirected = true;
    return null;
  };
  let text;
  try {
    text = await request.loadString();
  } catch {
    await show("\uC5F0\uACB0 \uD655\uC778 \uC2E4\uD328", "\uB124\uD2B8\uC6CC\uD06C \uB610\uB294 \uB85C\uADF8\uC778 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694. \uCFE0\uD0A4 \uAC12\uC740 \uACF5\uC720\uD558\uC9C0 \uB9D0\uACE0 \uC774 \uC624\uB958 \uBB38\uAD6C\uB9CC \uC54C\uB824\uC8FC\uC138\uC694.");
    return;
  } finally {
    request.headers = {};
    header = null;
  }
  const status = request.response?.statusCode;
  if (redirected || [301, 302, 303, 307, 308, 401, 403].includes(status) || text.trimStart().startsWith("<")) {
    await show("\uB85C\uADF8\uC778 \uD655\uC778 \uD544\uC694", "Google\uC774 \uC694\uCCAD\uC744 \uAC70\uBD80\uD588\uC5B4\uC694. Safari\uC5D0\uC11C Gemini \uC0AC\uC6A9\uB7C9 \uD398\uC774\uC9C0\uB97C \uB2E4\uC2DC \uC5F4\uACE0 \uD604\uC7AC \uC0AC\uC774\uD2B8\uC758 \uCFE0\uD0A4\uB97C \uC0C8\uB85C \uB0B4\uBCF4\uB0B4\uC138\uC694. HTTP " + (status || "\uC54C \uC218 \uC5C6\uC74C"));
    return;
  }
  if (status !== 200) {
    await show("\uC870\uD68C \uC2E4\uD328", "Google \uC751\uB2F5: HTTP " + (status || "\uC54C \uC218 \uC5C6\uC74C") + ". \uC7A0\uC2DC \uD6C4 \uC7AC\uC2DC\uB3C4\uD558\uAC70\uB098 \uC774 \uC0C1\uD0DC \uCF54\uB4DC\uB9CC \uC54C\uB824\uC8FC\uC138\uC694.");
    return;
  }
  let usage;
  try {
    usage = normalize(text);
  } catch (error) {
    await show("\uC870\uD68C \uACB0\uACFC \uD655\uC778 \uD544\uC694", error instanceof GeminiError ? error.message : "\uC0AC\uC6A9\uB7C9 \uC751\uB2F5\uC744 \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    return;
  }
  const lines = usage.windows.map((w) => w.label + ": " + Math.round(w.used_percent) + "% \uC0AC\uC6A9" + (w.resets_at ? "\n\uCD08\uAE30\uD654: " + new Date(w.resets_at * 1e3).toLocaleString("ko-KR") : ""));
  await show("\uC544\uC774\uD3F0 \uC870\uD68C \uC131\uACF5", lines.join("\n\n") + "\n\nGoogle \uC571\uC758 \uC218\uCE58\uC640 \uBE44\uAD50\uD558\uC138\uC694. \uC11C\uBC84\uC5D0\uC11C\uC758 15\uBD84 \uC790\uB3D9 \uC870\uD68C \uAC80\uC99D\uC740 \uBCC4\uB3C4\uC785\uB2C8\uB2E4.");
}
await main();
Script.complete();
