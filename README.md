# AI 사용량 (Usage-Check)

Claude와 Codex 구독 플랜의 **사용 한도(5시간·주간)를 휴대폰에서 한눈에** 보는 개인용 대시보드예요.
내 Cloudflare 계정(무료)에 내 사이트로 설치해서 쓰고, **휴대폰만으로 설치할 수 있어요.**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ember0625/Usage-Check)

| 서비스 | 보여주는 것 |
|---|---|
| **Claude** (Pro/Max) | 5시간 한도, 주간 한도. 앱·웹·Claude Code 사용량이 모두 합쳐진 값이에요 |
| **Codex** (ChatGPT 플랜) | Codex 5시간·주간 한도 (CLI·클라우드·IDE 공용). ChatGPT 일반 채팅 한도는 아니에요 |

- 15분마다 자동 갱신, 새로고침 버튼으로 바로 갱신
- 사용량에 따라 색이 바뀌어요 (50% 이상 노랑, 80% 이상 빨강)
- iOS 홈 화면 위젯 (무료 앱 Scriptable)

## 시작하기 전에 꼭 읽어 주세요

- **비공식 방식이에요.** Claude Code와 Codex CLI가 로그인하고 사용량을 조회하는 방식을 그대로 빌려 써요.
  공식 기능이 아니라서 언제든 바뀌거나 막힐 수 있고, 각 서비스 약관상 **회색지대**예요. 사용 여부는 본인이 판단해 주세요.
- **각자 자기 사이트를 설치해서 쓰는 방식이에요.** 로그인 토큰은 **내 Cloudflare 계정에만** 저장돼요.
  다른 사람의 사이트에 내 계정을 연결하지 마세요.
- 대시보드는 **사용량을 읽기만** 해요. Claude는 프로필·사용량 조회 권한만 요청해요.
  Codex 토큰은 Codex CLI와 같은 권한이라, 사이트 비밀번호를 꼭 길게 정해 주세요.

## 준비물

- GitHub 계정
- Cloudflare 계정 (무료, 카드 등록 필요 없음)
- 휴대폰 브라우저 (PC가 없어도 돼요)

## 설치하기 (약 15분)

### 1단계. 비밀 문자열 두 개 정하기

메모장에 아래 두 개를 정해 적어 두세요. 둘 다 **길고 추측하기 어렵게** 정해 주세요.

| 이름 | 용도 | 예시 |
|---|---|---|
| `DASHBOARD_PASSWORD` | 내 대시보드에 들어갈 때 쓰는 비밀번호 | `sunny-Piano-4821-river` |
| `RELAY_SECRET` | GitHub Actions와 내 사이트가 서로 확인하는 값 (입력할 일은 없어요) | `k9Fz2-mQ7x-Lp4R-8vWn-Tq3J` |

### 2단계. Cloudflare에 배포하기

1. 위의 **Deploy to Cloudflare** 버튼을 눌러요.
2. Cloudflare에 로그인하고 **GitHub 계정을 연결**해요.
   - 이 레포가 **내 GitHub에 복사**되고, 그 복사본이 내 사이트로 배포돼요.
3. 설정 화면에서
   - 레포 이름과 프로젝트 이름은 그대로 둬도 돼요.
   - `DASHBOARD_PASSWORD`, `RELAY_SECRET` 칸에 **1단계에서 정한 값**을 넣어요.
4. **Create and deploy**를 눌러요. 저장소(KV, Durable Object)는 자동으로 만들어져요.
5. 배포가 끝나면 나오는 주소를 메모해요. 예: `https://usage-check.내이름.workers.dev`

<details>
<summary>버튼 대신 직접 하고 싶다면 (fork 방식)</summary>

1. 이 레포를 **Fork**해요.
2. [Cloudflare 대시보드](https://dash.cloudflare.com) → **Workers & Pages → Create → Import a repository** → fork한 레포를 골라요.
3. 배포가 끝나면 Worker → **Settings → Variables and Secrets → Add**에서 **Secret** 타입으로 `DASHBOARD_PASSWORD`, `RELAY_SECRET`을 추가해요.

fork 방식은 나중에 GitHub의 **Sync fork** 버튼으로 업데이트를 받기 쉬워요.
</details>

### 3단계. GitHub에 비밀값 두 개 넣기

Codex 사용량은 chatgpt.com이 Cloudflare에서 오는 요청을 막아서, **내 GitHub Actions가 15분마다 대신 조회**해서 내 사이트에 올려요.
이를 위해 **복사된 내 레포**에 비밀값을 넣어 줘요.

1. 내 레포 → **Settings → Secrets and variables → Actions → New repository secret**
2. 두 개를 추가해요.
   - `RELAY_SECRET`: 1단계와 **똑같은 값**
   - `WORKER_URL`: 2단계에서 메모한 주소 (예: `https://usage-check.내이름.workers.dev`)
3. 내 레포 → **Actions** 탭으로 가요.
   - 워크플로를 켜라는 안내가 보이면 켜 주세요.
   - **Codex 사용량 중계 → Run workflow**를 눌러 한 번 바로 실행해요.

### 4단계. 계정 연결하기

1. 내 사이트 주소를 열고 `DASHBOARD_PASSWORD`로 로그인해요.
2. **Claude → 연결하기**
   1. 새 탭에서 Claude에 로그인하고 승인해요.
   2. 화면에 나온 코드를 복사해요.
   3. 대시보드로 돌아와 붙여넣고 **연결 완료**를 눌러요.
3. **Codex → 연결하기**
   1. 화면에 나온 코드를 복사해요.
   2. **OpenAI 로그인 열기**를 눌러 로그인하고 코드를 입력해요.
   3. 승인하면 자동으로 연결돼요.
   - 기기 코드 로그인이 막혀 있다면 ChatGPT 보안 설정에서 허용해 주세요.
4. 브라우저 메뉴의 **홈 화면에 추가**를 누르면 앱처럼 쓸 수 있어요.

설치 끝! 🎉

## 선택 기능

### 새로고침하면 Codex도 바로 조회하기

`GITHUB_TOKEN`을 넣지 않으면 Codex는 15분마다 자동으로만 갱신돼요.
토큰을 넣으면 새로고침을 누를 때 GitHub Actions가 바로 실행돼요. 30초~1분 뒤 반영돼요.

1. GitHub 오른쪽 위 프로필 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Repository access: **Only select repositories** → **내 레포**
   - Permissions → **Actions: Read and write**
   - **Generate token** → 토큰을 복사해요.
2. Cloudflare → 내 Worker → **Settings → Variables and Secrets → Add**에서 **Secret** 타입으로 `GITHUB_TOKEN`을 추가하고, 값에 복사한 토큰을 넣어요.

레포 이름은 Actions가 처음 실행될 때 자동으로 알아내서 따로 넣을 필요 없어요.

### iOS 홈 화면 위젯

1. 대시보드 맨 아래 **iOS 위젯 → 위젯 스크립트 복사**를 눌러요.
2. 무료 앱 [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)에서 **+** → 붙여넣기 → 제목을 `AI 사용량`으로 바꿔요.
3. 홈 화면에 Scriptable 위젯을 추가하고, 스크립트로 **AI 사용량**을 골라요.

- 새로고침 아이콘 ↻을 누르면 Scriptable이 열리면서 바로 새로 조회한 값을 보여줘요.
- 홈 화면 위젯 자체가 다시 그려지는 시점은 iOS가 정해요.

## 무료 한도

혼자 쓰기에는 모두 충분해요.

| 서비스 | 무료 한도 | 이 사이트 사용량 |
|---|---|---|
| Cloudflare Workers | 하루 요청 10만 회 | 하루 수백 회 |
| Cloudflare KV 쓰기 | 하루 1,000회 | 하루 약 200~400회 |
| GitHub Actions | 공개 레포는 무제한, 비공개 레포는 월 2,000분 | 15분마다 1분 → **비공개면 한도를 넘을 수 있어요** |

레포를 비공개로 쓰려면 `.github/workflows/codex-usage.yml`의 실행 주기를 `*/30`으로 늘려 주세요.

## 문제 해결

| 증상 | 해결 |
|---|---|
| 사이트에 "설정이 하나 남았어요"가 떠요 | Cloudflare Secret `DASHBOARD_PASSWORD`가 없어요. 2단계를 확인해 주세요 |
| Codex에 "Cloudflare에서 직접 조회하면 막혀요"가 떠요 | Cloudflare Secret `RELAY_SECRET`이 없어요 |
| Codex가 계속 "첫 조회를 기다리는 중"이에요 | 3단계의 GitHub 비밀값과 Actions 실행 결과를 확인해 주세요. 실패한 실행을 열면 원인이 적혀 있어요 |
| Actions 로그에 "RELAY_SECRET을 거부" | Cloudflare와 GitHub의 `RELAY_SECRET` 값이 서로 달라요 |
| Actions 로그에 "주소를 찾을 수 없음(ENOTFOUND)" | `WORKER_URL`에 오타가 있어요. 사이트 주소를 복사해서 다시 넣어 주세요 |
| "GitHub Actions가 … 이후로 실행되지 않았어요" | 공개 레포는 60일 동안 커밋이 없으면 예약 실행이 멈춰요. Actions 탭에서 다시 켜 주세요 |
| Claude 연결이 풀렸어요 | 다시 연결해 주세요. 원인은 대시보드 로그인 상태에서 `/api/claude/diag`를 열면 기록으로 볼 수 있어요 |

## 업데이트 받기

- **fork 방식**: 내 레포의 **Sync fork** 버튼을 누르면 돼요. Cloudflare가 자동으로 다시 배포해요.
- **Deploy 버튼 방식**: 복사본이라 자동으로 연결돼 있지 않아요. 원본 레포의 바뀐 파일을 내 레포에 직접 반영해 주세요.

## 작동 방식

```
[휴대폰 브라우저 / 위젯]
        │ 비밀번호 로그인
        ▼
[내 Cloudflare Worker] ── 15분마다 ──▶ Anthropic: Claude 사용량 조회
        ▲    │
        │    └─ 토큰 저장소(Durable Object): 토큰 갱신을 한 번에 하나씩 처리
        │
[내 GitHub Actions] ── 15분마다 ──▶ chatgpt.com: Codex 사용량 조회 → Worker에 올림
```

```
src/index.js    라우팅, 비밀번호 세션, 15분 크론, 중계 API
src/tokens.js   토큰 저장소 (Durable Object)
src/claude.js   Claude 로그인(OAuth, 코드 붙여넣기)과 사용량 조회
src/codex.js    Codex 로그인(기기 코드)과 토큰 갱신
src/page.js     대시보드 화면
src/widget.js   iOS 위젯(Scriptable) 스크립트
scripts/codex-relay.mjs, .github/workflows/codex-usage.yml   Codex 조회 중계 (GitHub Actions)
```

## 로컬 개발 (PC가 있을 때)

```sh
npm install
cp .dev.vars.example .dev.vars   # 값 채우기
npm run dev
```
