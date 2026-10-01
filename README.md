# Usage-Check

Claude와 Codex 구독 플랜의 사용 한도(5시간·주간)를 휴대폰에서 한눈에 보는 대시보드예요.
Cloudflare Workers(무료)에서 돌아가고, 15분마다 자동으로 갱신돼요.

| 서비스 | 보여주는 것 |
|---|---|
| Claude (Pro/Max) | 5시간 한도, 주간 한도(전체·Opus·Sonnet). 앱·웹·Claude Code 사용량이 모두 합산된 값이에요 |
| Codex (ChatGPT 플랜) | 5시간·주간 Codex 한도 (CLI·클라우드·IDE 공용) |

> ⚠️ 두 서비스 모두 **비공식 엔드포인트**(각 CLI가 내부적으로 쓰는 것)를 사용해요.
> 언제든 바뀌거나 막힐 수 있고, 약관상 회색지대예요. 대시보드는 사용량만 읽고 모델 호출은 하지 않아요.

## 휴대폰으로 배포하기

### 1. Worker 만들기 (GitHub 연결)
1. 휴대폰 브라우저로 [dash.cloudflare.com](https://dash.cloudflare.com) 접속
2. **Workers & Pages → Create → Workers 탭 → Import a repository**
3. GitHub 계정을 연결하고 `Usage-Check` 레포 선택
4. 설정 화면에서
   - Project name: **`usage-check`** (wrangler.toml의 `name`과 같아야 해요)
   - Deploy command: `npx wrangler deploy` (기본값)
5. **Deploy** 누르기. KV 저장소는 첫 배포 때 자동으로 만들어져요.

> 지금 코드는 `claude/ai-usage-limit-dashboard-c3lklp` 브랜치에 있어요. 이 브랜치를 `main`에 머지하거나,
> Worker의 **Settings → Build → Branch control**에서 배포 브랜치를 이 브랜치로 바꿔 주세요.

### 2. 비밀번호 설정
1. 만든 Worker → **Settings → Variables and Secrets → Add**
2. Type: **Secret**, Name: `DASHBOARD_PASSWORD`, Value: 길고 추측하기 어려운 비밀번호
3. 저장

### 3. 연결하기
1. Worker 주소(`https://usage-check.<계정>.workers.dev`)를 열고 비밀번호로 로그인
2. **Claude 연결하기** → Claude 로그인 페이지에서 승인 → 나오는 코드를 복사해서 붙여넣기
3. **Codex 연결하기** → 화면의 코드를 복사 → OpenAI 페이지에서 로그인 후 코드 입력 → 자동으로 연결 완료
   - 안 되면 ChatGPT **설정 → 보안**에서 Codex 기기 코드 로그인 허용 옵션을 켜 주세요.
4. 브라우저 메뉴의 **홈 화면에 추가**를 누르면 앱처럼 쓸 수 있어요.

### 4. Codex 조회를 GitHub Actions로 돌리기 (필수)
chatgpt.com이 Cloudflare Worker에서 오는 요청을 막아서(HTTP 403), Codex 사용량은 GitHub Actions가 15분마다 대신 조회해 Worker에 올려요.

1. 아무도 추측 못 할 긴 문자열을 하나 정해요 (예: 비밀번호 생성기로 만든 32자). 이게 `RELAY_SECRET`이에요.
2. **Cloudflare**: Worker → Settings → Variables and Secrets → Add → Secret, 이름 `RELAY_SECRET`, 값은 위 문자열 → Deploy
3. **GitHub**: 레포 → Settings → Secrets and variables → Actions → **New repository secret** 두 개 추가
   - `RELAY_SECRET`: 위와 같은 문자열
   - `WORKER_URL`: 대시보드 주소 (예: `https://usage-check.xxx.workers.dev`, 끝에 `/` 없이)
4. 레포 → **Actions** 탭 → "Codex 사용량 중계" → **Run workflow**로 한 번 바로 실행해 보기

> GitHub는 60일 동안 레포에 활동이 없으면 예약 실행을 멈춰요. 그러면 Actions 탭에서 다시 켜 주세요.

## 구조

```
src/index.js   라우팅, 비밀번호 세션, 15분 크론
src/claude.js  Claude OAuth(PKCE, 코드 붙여넣기) + /api/oauth/usage
src/codex.js   Codex 기기 코드 로그인, 토큰 갱신
src/page.js    휴대폰용 대시보드 화면
scripts/codex-relay.mjs + .github/workflows/codex-usage.yml  Codex 조회 중계 (GitHub Actions)
```

로그인 토큰과 마지막 사용량은 Workers KV에 저장돼요. **연결 해제**를 누르면 토큰이 삭제돼요.

## 로컬 개발 (PC가 있을 때)

```sh
npm install
echo 'DASHBOARD_PASSWORD=test' > .dev.vars
npm run dev
```
