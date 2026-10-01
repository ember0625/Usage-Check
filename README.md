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

## 구조

```
src/index.js   라우팅, 비밀번호 세션, 15분 크론
src/claude.js  Claude OAuth(PKCE, 코드 붙여넣기) + /api/oauth/usage
src/codex.js   Codex 기기 코드 로그인 + /backend-api/wham/usage
src/page.js    휴대폰용 대시보드 화면
```

로그인 토큰과 마지막 사용량은 Workers KV에 저장돼요. **연결 해제**를 누르면 토큰이 삭제돼요.

## 로컬 개발 (PC가 있을 때)

```sh
npm install
echo 'DASHBOARD_PASSWORD=test' > .dev.vars
npm run dev
```
