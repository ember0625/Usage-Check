// iPhone Scriptable용 연결 확인 도구. npm run build:phonecheck로 단일 파일을 생성합니다.
// 쿠키는 직접 Google에만 보내며, 로그/파일/Keychain/Worker/GitHub에 저장하거나 전송하지 않습니다.
import { parseGeminiCookies } from "../src/gemini-cookies.js";
import { GeminiError, normalize, usageUrl } from "../src/gemini.js";

async function show(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("확인");
  await alert.presentAlert();
}

async function main() {
  const prompt = new Alert();
  prompt.title = "Gemini 연결 확인";
  prompt.message = "Safari에서 현재 Gemini 사이트의 쿠키를 JSON 또는 Header String으로 내보내 붙여넣으세요. Google에 한 번 직접 조회합니다. 저장소·대시보드는 변경하지 않습니다.";
  prompt.addSecureTextField("내보낸 쿠키 붙여넣기");
  prompt.addAction("Google에 조회");
  prompt.addCancelAction("취소");
  if (await prompt.presentAlert() === -1) return;
  let header;
  try { header = parseGeminiCookies(prompt.textFieldValue(0)); }
  catch (error) { await show("형식 확인 필요", error.message); return; }

  const request = new Request(usageUrl());
  request.method = "GET";
  request.headers = { Cookie: header, Accept: "application/json", Referer: "https://gemini.google.com/usage" };
  request.timeoutInterval = 20;
  let redirected = false;
  request.onRedirect = () => { redirected = true; return null; };
  let text;
  try { text = await request.loadString(); }
  catch {
    await show("연결 확인 실패", "네트워크 또는 로그인 상태를 확인해 주세요. 쿠키 값은 공유하지 말고 이 오류 문구만 알려주세요.");
    return;
  } finally {
    request.headers = {};
    header = null;
  }
  const status = request.response?.statusCode;
  if (redirected || [301, 302, 303, 307, 308, 401, 403].includes(status) || text.trimStart().startsWith("<")) {
    await show("로그인 확인 필요", "Google이 요청을 거부했어요. Safari에서 Gemini 사용량 페이지를 다시 열고 현재 사이트의 쿠키를 새로 내보내세요. HTTP " + (status || "알 수 없음"));
    return;
  }
  if (status !== 200) {
    await show("조회 실패", "Google 응답: HTTP " + (status || "알 수 없음") + ". 잠시 후 재시도하거나 이 상태 코드만 알려주세요.");
    return;
  }
  let usage;
  try { usage = normalize(text); }
  catch (error) { await show("조회 결과 확인 필요", error instanceof GeminiError ? error.message : "사용량 응답을 해석하지 못했어요."); return; }
  const lines = usage.windows.map((w) => w.label + ": " + Math.round(w.used_percent) + "% 사용" +
    (w.resets_at ? "\n초기화: " + new Date(w.resets_at * 1000).toLocaleString("ko-KR") : ""));
  await show("아이폰 조회 성공", lines.join("\n\n") + "\n\nGoogle 앱의 수치와 비교하세요. 서버에서의 15분 자동 조회 검증은 별도입니다.");
}

await main();
Script.complete();
