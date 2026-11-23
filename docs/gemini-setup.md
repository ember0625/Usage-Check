# Gemini 앱 자동 조회 설정

Gemini 앱의 **5시간·주간 사용률과 초기화 시각**을 GitHub Actions에서 조회합니다. Gemini API/AI Studio, Gemini CLI, Antigravity 사용량과는 다릅니다.

이 기능은 Google의 공개 API가 아닌 웹 사용량 페이지의 내부 조회 규격을 이용합니다. Google의 변경·로그인 만료·추가 인증으로 중단될 수 있습니다.

## 1. 아이폰에서 현재 사이트 쿠키 내보내기

1. [Cookie-Editor](https://apps.apple.com/kr/app/cookie-editor/id6446215341)를 설치하고 앱을 한 번 엽니다. 개발자 이름은 **Christophe Gagnier**입니다. 비슷한 이름의 앱과 구분하세요. 확인 시 한국 App Store에서 무료이며, JSON·Header String 내보내기를 지원합니다.
2. Safari의 확장 프로그램 메뉴에서 Cookie-Editor를 켭니다. 설정 앱에서도 Safari → 확장 프로그램에서 켤 수 있습니다. iOS 버전에 따라 Safari 설정이 '앱' 아래에 있을 수 있습니다.
3. **Safari 일반 탭**에서 [Gemini 사용량 페이지](https://gemini.google.com/usage)를 열고 원하는 Google 계정으로 로그인합니다. Gemini 앱 내부 화면이나 개인정보 보호 브라우징은 사용하지 않습니다.
4. 그 페이지에서 Safari 메뉴 → Cookie-Editor를 열고 현재 Google 사이트 접근을 허용합니다. 쿠키 목록이 나타나는지 먼저 확인합니다.
5. **현재 사이트**의 Export → **JSON**으로 복사합니다. Header String도 지원합니다. 전체 브라우저 쿠키 내보내기는 사용하지 않습니다.

### 목록이 비어 있다면

로그인한 페이지·확장 권한·일반 탭인지 확인하고 새로고침한 뒤 확장을 다시 엽니다. 그래도 비어 있으면 아직 연결 조건을 통과하지 못한 것입니다. 쿠키 목록이 비어 있는 채로 설정이나 배포를 진행하지 마세요.

Safari의 cookie store 조회 문제는 [Cookie-Editor #361](https://github.com/Moustachauve/cookie-editor/issues/361)에 보고됐고 소스 수정이 합쳐졌지만, App Store 배포판에 포함됐는지는 별도 확인이 필요합니다. GitHub 최신 소스가 수정됐다는 이유로 설치 앱에서도 해결됐다고 단정하지 않습니다. 구글 로그인 쿠키를 삭제하거나 Safari 전체 데이터를 지우지 마세요.

## 2. 배포 없이 아이폰에서 연결 확인

`mobile/Gemini-Connection-Check.js`의 코드를 Scriptable의 새 스크립트에 붙여넣고 실행합니다. 실행 후 나타나는 입력란에 **1단계에서 내보낸 JSON/헤더**를 붙여넣습니다. 스크립트 본문에 쿠키를 넣지 마세요.

- 성공: '아이폰 조회 성공'과 사용률·초기화 시각이 표시됩니다. Google 사용량 페이지와 비교합니다.
- 실패: 오류 문구 또는 HTTP 상태 코드만 공유합니다. 쿠키 값이나 쿠키가 보이는 스크린샷은 공유하지 않습니다.
- 이 검사 도구는 Google에 한 번 직접 요청합니다. GitHub·Worker에 요청하거나 쿠키를 파일·Keychain·로그에 저장하지 않습니다. 자동으로 리다이렉트를 따라가지 않습니다.
- 아이폰에서 성공해도 GitHub Actions 실행 환경에서 성공한 것은 아닙니다. 서버 검증은 다음 단계에서 별도로 합니다.

## 3. GitHub에 쿠키 등록하고 조회 확인

1. 아이폰 Safari에서 본인 GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret을 엽니다.
2. 이름 `GEMINI_COOKIE`, 값은 내보낸 JSON 또는 Header String **그대로** 등록합니다. 변환·터미널·PC 개발자 도구가 필요하지 않습니다.
3. Actions → **Codex·Gemini 사용량 중계** → **Run workflow**를 기본 브랜치에서 실행합니다. 기존 `WORKER_URL`, `RELAY_SECRET`이 설정되어 있어야 대시보드에 전송됩니다.
4. 대시보드의 Gemini 수치를 [Gemini 사용량 페이지](https://gemini.google.com/usage)와 비교합니다.
5. 기존 Scriptable 위젯 스크립트를 대시보드에서 다시 복사합니다.

기본 브랜치가 아닌 브랜치에서 실행하면 **검사 전용**으로 동작합니다. Google 조회 결과(사용률)만 로그에 출력하고 Worker에는 아무것도 보내지 않습니다. 공개 저장소라면 이 사용률은 공개 로그에 보입니다. 쿠키·Google 원본 응답·계정 식별자는 어느 경우에도 출력하지 않습니다.

GitHub의 15분 예약 실행이 기본 경로입니다. Cloudflare에 Actions 쓰기 권한이 있는 `GITHUB_TOKEN`을 설정하면, 예약 실행이 밀려 Codex·Gemini 값이 15분 넘게 오래됐을 때 Worker(15분마다)·사이트·위젯이 중계를 요청합니다. 중복 요청은 3분간 제한합니다. 열린 사이트는 1분마다 서버 상태를 확인하고, 위젯은 중계 중일 때 iOS에 1분 뒤 갱신을 요청합니다. 홈 화면에는 잠깐 지나가는 '갱신 중' 상태를 표시하지 않고, 실패하거나 45분 넘게 오래된 경우에만 표시합니다. 실제 위젯 표시 시점은 iOS가 결정합니다. Codex 단계가 실패하더라도 Gemini 단계는 실행합니다. 쿠키가 없으면 Google 조회는 하지 않습니다.

Google 로그인 쿠키는 사용량 전용 토큰이 아닙니다. **GitHub Secret 입력란에만 직접 등록**하고 코드·PR·채팅에는 붙여넣지 마세요. 서버는 쿠키를 Google에만 전송하고, Worker에는 사용률·초기화 시각 또는 정해진 오류 코드만 보냅니다. JSON 내보내기는 Gemini에 적용되는 도메인·경로의 유효한 쿠키만 사용합니다. Cloudflare에 `GEMINI_COOKIE`를 등록할 필요는 없습니다.

## 새로고침과 연결 해제

- 즉시 조회: 기존 Cloudflare Secret `GITHUB_TOKEN`에 **이 저장소의 Actions 쓰기 권한**이 있으면 대시보드·위젯 새로고침이 두 서비스의 중계를 함께 실행합니다. 보통 1~2분 뒤 반영됩니다. 토큰이 없으면 예약 실행을 기다리거나 GitHub에서 수동 실행합니다.
- 만료: 브라우저에서 사용량 페이지가 정상인지 확인한 다음 `GEMINI_COOKIE`를 교체하고 중계를 실행합니다. Cookie 인증에는 Claude/Codex처럼 자동 refresh-token 갱신이 구현되어 있지 않습니다.
- 해제: GitHub에서 `GEMINI_COOKIE` Secret을 삭제하고 중계를 실행합니다. Worker에 저장된 이전 Gemini 사용량도 제거된 미설정 상태로 바뀝니다. 예약 실행을 기다려도 같은 처리가 됩니다.
- 다른 계정으로 변경: 먼저 위 해제 절차를 완료한 다음 새 쿠키를 등록하세요. 첫 성공 전에는 이전 계정의 마지막 수치를 혼동하지 않도록 하기 위함입니다.

## 위젯

- 모든 크기의 위젯이 Claude·Codex·Gemini·Grok 네 서비스를 표시합니다. 중간·큰 위젯은 서비스마다 한 줄, 작은 위젯은 로고와 링 2×2입니다.
- 표시 서비스 선택: 대시보드의 **표시할 서비스**에서 끈 서비스는 위젯에서도 숨습니다. 위젯 편집 → **Parameter**에 `gemini`나 `claude,gemini`처럼 입력하면 그 설정 대신 입력한 서비스만 그 순서로 표시합니다 (최대 4개).
- 조회 실패 시 마지막 성공값을 유지하고 실패를 표시합니다. 45분 넘은 성공값에는 오래된 데이터 표시가 붙습니다. iOS가 홈 화면을 다시 그리는 시점은 별개입니다.

## 정식 배포 설정

Cloudflare Worker → Settings → Build에서 **Production branch**를 `main`, **Deploy command**를 `npx wrangler deploy`로 설정합니다. 저장 후 main의 최신 빌드를 다시 실행합니다. Preview command는 별도 항목이므로 정식 배포 명령으로 바꾸지 않습니다.

로그에 `npx wrangler preview`가 나오고 `previews` 블록을 요구한다면 미리보기 명령이 실행된 것입니다. 정식 배포가 목적이라면 Production branch와 Deploy command를 먼저 확인합니다. 빈 `previews` 블록만 추가하는 것으로 정식 배포가 되지는 않습니다.

## 문제 해결

| 상태 | 확인할 내용 |
|---|---|
| 자동 조회 설정 필요 | `GEMINI_COOKIE` 등록, 새 Worker 배포, Actions 수동 실행 |
| 로그인 만료 또는 거부 | Google 사용량 페이지 확인, 쿠키 재등록; 서버 환경이 거부될 수도 있어 무조건 만료라는 뜻은 아닙니다 |
| 한도 정보 없음 | 해당 Google 계정의 앱 사용량 페이지에 실제 5시간·주간 한도가 있는지 확인 |
| 응답 형식 변경 | 내부 query signature나 응답 스키마 변경 가능성. 개발자가 최신 규격 확인 후 수정 |
| HTTP 404로 결과 전송 실패 | Worker에 새 코드가 배포됐는지 확인 |
| HTTP 401로 결과 전송 실패 | GitHub와 Worker의 `RELAY_SECRET` 일치 여부 |

조회 서명만 변경된 경우, 규격을 확인한 개발자가 Actions **Variable** `GEMINI_QUERY_SIGNATURE`를 설정하여 교체할 수 있습니다. 응답 구조까지 바뀐 경우 코드 수정이 필요합니다. 누락된 한도를 0%로 대체하지 않습니다.

## 개발 및 검증

Node.js 22 이상에서 `npm ci`, `npm test`, `npm run check`를 실행합니다. 테스트는 가짜 응답과 로컬 Worker로 동작하며 실제 Google 계정에 접속하지 않습니다. 아이폰 검사 도구는 `npm run build:phonecheck`로 생성합니다. 실제 계정 검증은 위 2·3단계를 따르세요.

조회 규격 참고: [CodexBar Gemini app 문서](https://github.com/steipete/CodexBar/blob/main/docs/gemini.md), [Google Gemini 앱 한도 도움말](https://support.google.com/gemini/answer/16275805).
