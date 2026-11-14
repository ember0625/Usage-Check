# Gemini 앱 자동 조회 설정

Gemini 앱의 **5시간·주간 사용률과 초기화 시각**을 GitHub Actions에서 조회합니다. Gemini API/AI Studio, Gemini CLI, Antigravity 사용량과는 다릅니다.

이 기능은 Google의 공개 API가 아닌 웹 사용량 페이지의 내부 조회 규격을 이용합니다. 현재 공개 구현을 참고해 작성했지만, 사용자의 실제 계정 및 GitHub 실행 환경에서 조회가 되는지는 설정 후 확인해야 합니다. Google의 변경·로그인 만료·추가 인증으로 중단될 수 있습니다.

## 기존 사용자: 설정 순서

1. 이 변경을 `main`에 반영하고 Cloudflare Worker의 새 배포가 완료될 때까지 기다립니다.
2. GitHub 저장소 → **Settings → Secrets and variables → Actions**에 기존 `WORKER_URL`, `RELAY_SECRET`이 있는지 확인합니다. Worker와 GitHub의 `RELAY_SECRET`은 같아야 합니다.
3. 아래 방법으로 **본인 계정**의 Cookie 요청 헤더 값을 확보하고, 같은 화면의 **New repository secret**으로 `GEMINI_COOKIE`를 추가합니다.
4. **Actions → Codex·Gemini 사용량 중계 → Run workflow**를 실행합니다.
5. 대시보드를 다시 열고 Gemini의 5시간·주간 사용률과 초기화 시각을 [Google 사용량 페이지](https://gemini.google.com/usage)와 비교합니다. 표시 반올림 차이는 있을 수 있습니다.
6. 기존 Scriptable 위젯을 사용한다면 대시보드에서 **위젯 스크립트 복사**를 다시 실행하여 기존 스크립트를 교체합니다.

이후 기존 워크플로가 약 15분 간격으로 두 서비스를 조회합니다. 예약 실행은 GitHub 사정으로 지연될 수 있습니다. Codex 단계가 실패하더라도 Gemini 단계는 실행합니다. `GEMINI_COOKIE`가 없으면 Google 조회는 하지 않으며 Gemini를 미설정 상태로 보고합니다.

## 쿠키 가져오기

**이 가이드에서 확인한 방법은 개발자 도구가 있는 데스크톱 브라우저를 사용합니다. 아이폰 Safari만으로 같은 절차를 수행하는 방법이나 로그인 버튼 한 번으로 연결하는 기능은 제공하지 않습니다.** 쿠키 확보 후 GitHub Secret 등록과 대시보드 사용은 휴대폰에서 할 수 있습니다. 만료 시에도 새 쿠키가 필요할 수 있습니다.

1. 개인 브라우저에서 원하는 Google 계정으로 `https://gemini.google.com/usage`에 로그인합니다. 여러 계정에 로그인돼 있다면 사용할 계정을 별도 브라우저 프로필에서 확인하세요.
2. 개발자 도구의 **Network** 탭을 열고 페이지를 새로고침합니다.
3. `executeQuery`로 검색하고, 응답의 `getUsageInfo` 안에 `GXU_FIVE_HOURLY` 또는 `GXU_WEEKLY`가 있는 요청을 선택합니다. 둘 다 없다면 그 계정에서 앱 사용량이 제공되는지 먼저 확인하세요.
4. **Request Headers → Cookie**의 **값만** 복사합니다. 형태는 `이름=값; 다른이름=값`입니다. `Cookie:` 접두사, 전체 cURL 명령, Response의 Set-Cookie 값은 넣지 않습니다.
5. 위 값을 GitHub **Actions Secret `GEMINI_COOKIE`**에 직접 붙여넣습니다. 코드, Issues, PR, 채팅에는 넣지 마세요.

Google 로그인 쿠키는 사용량 전용 토큰이 아니므로 계정 접근 권한처럼 취급해야 합니다. 스크립트는 쿠키를 `gemini.google.com`에만 전송하고 리다이렉트를 따라가지 않습니다. Worker에는 사용률·초기화 시각과 정해진 오류 코드만 전달하며, 원본 Google 응답·쿠키는 보내거나 출력하지 않습니다. Cloudflare에 `GEMINI_COOKIE`를 추가할 필요는 없습니다.

## 새로고침과 연결 해제

- 즉시 조회: 기존 Cloudflare Secret `GITHUB_TOKEN`에 **이 저장소의 Actions 쓰기 권한**이 있으면 대시보드·위젯 새로고침이 두 서비스의 중계를 함께 실행합니다. 보통 1~2분 뒤 반영됩니다. 토큰이 없으면 예약 실행을 기다리거나 GitHub에서 수동 실행합니다.
- 만료: 브라우저에서 사용량 페이지가 정상인지 확인한 다음 `GEMINI_COOKIE`를 교체하고 중계를 실행합니다. Cookie 인증에는 Claude/Codex처럼 자동 refresh-token 갱신이 구현되어 있지 않습니다.
- 해제: GitHub에서 `GEMINI_COOKIE` Secret을 삭제하고 중계를 실행합니다. Worker에 저장된 이전 Gemini 사용량도 제거된 미설정 상태로 바뀝니다. 예약 실행을 기다려도 같은 처리가 됩니다.
- 다른 계정으로 변경: 먼저 위 해제 절차를 완료한 다음 새 쿠키를 등록하세요. 첫 성공 전에는 이전 계정의 마지막 수치를 혼동하지 않도록 하기 위함입니다.

## 위젯

- 중간/큰 위젯: Gemini가 설정되면 세 서비스를 표시합니다.
- 작은 위젯: 기존 Claude·Codex 표시를 유지합니다. 위젯 편집 → **Parameter**에 `gemini`를 입력하면 Gemini 전용으로 표시합니다.
- 표시 서비스 선택: `claude,gemini`처럼 입력할 수 있습니다. 작은 위젯은 최대 2개, 나머지는 최대 3개입니다.
- 조회 실패 시 마지막 성공값을 유지하고 실패를 표시합니다. 45분 넘은 성공값에는 오래된 데이터 표시가 붙습니다. iOS가 홈 화면을 다시 그리는 시점은 별개입니다.

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

Node.js 22 이상에서 `npm ci`, `npm test`, `npm run check`를 실행합니다. 테스트는 가짜 응답과 로컬 Worker로 동작하며 실제 Google 계정에 접속하지 않습니다. 실제 계정 검증은 설정 순서 5번을 따르세요.

조회 규격 참고: [CodexBar Gemini app 문서](https://github.com/steipete/CodexBar/blob/main/docs/gemini.md), [Google Gemini 앱 한도 도움말](https://support.google.com/gemini/answer/16275805).
