# Grok 연결

1. 사이트에 로그인하고 대시보드의 **Grok** 카드에서 **연결하기**를 눌러요.
2. 카드에 인증 코드가 나오면 **Grok 로그인 열기**를 눌러요.
3. xAI 화면의 인증 코드가 카드의 코드와 일치하는지 확인하고 **개인 계정**으로 승인해요.
4. 원래 탭으로 돌아오면 자동으로 연결되고 카드에 주간 사용량이 나와요.
5. 주간 사용률과 초기화까지 남은 시간을 Grok 앱의 사용량 화면과 비교하세요.

아이폰만으로 연결할 수 있어요. 인증 코드는 최대 30분간 유효하고, **연결하기**를 연속으로 눌러도 같은 대기 중인 코드를 사용해요. 탭이 새로고침돼도 승인을 이어서 확인해요.

로그인 정보는 기존 Cloudflare Durable Object에 저장해요. 다른 서비스 토큰과 함께 새로 발급받을 필요가 없고, 연결 해제는 Grok에만 적용돼요. 만료가 가까워지면 refresh token을 자동 갱신하고, 갱신이 거부된 경우 다시 로그인을 안내해요. 연결 해제는 이 사이트의 로그인 정보를 삭제하는 기능이에요. xAI 계정 전체의 다른 로그인 세션까지 취소하지는 않아요.

## 사용량과 갱신

- 공식 Grok CLI가 이용하는 `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`에서 주간 구독 공용 사용률과 초기화 시각을 읽어요.
- 응답의 `config.creditUsagePercent`는 이미 백분율이에요. `currentPeriod.type`이 `USAGE_PERIOD_TYPE_WEEKLY`인지 검증해요. 응답에 없는 5시간 한도나 사용률을 0으로 만들지 않아요.
- Cloudflare의 기존 15분 예약 작업에 포함돼요. 위젯이 다시 그려질 때는 마지막 조회가 10분 이상 지난 경우 다시 조회해요. 대시보드의 **새로고침**은 즉시 조회해요.
- 조회 실패 때 마지막 성공값과 성공 시각을 보존하고 오류를 함께 보여줘요.
- 메인 대시보드와 `/api/usage`, `/api/widget` 응답에 Grok 주간 사용량이 표시돼요. 중간·큰 위젯은 Claude·Codex / Gemini·Grok의 2×2 카드이며, Grok에는 주간 항목만 표시해요. 로고는 스크립트에 포함돼요.
- 위젯 디자인을 적용하려면 사이트의 **iOS 위젯 → 위젯 스크립트 복사**를 눌러 기존 Scriptable 스크립트를 교체하세요. Parameter가 비어 있으면 네 카드가 모두 표시되고, `grok`을 넣으면 Grok만 표시돼요.

## 구현 근거와 검증 범위

- [공식 기기 코드 로그인 구현](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-login/src/device_code.rs)
- [공식 OAuth 설정](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-login/src/config.rs)
- [공식 사용량 조회 구현](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/src/extensions/billing.rs)

공개 OAuth 클라이언트로 `openid offline_access grok-cli:access`만 요청해요. 대화·워크스페이스 쓰기 권한은 요청하지 않지만, `grok-cli:access`는 사용량 읽기만을 위한 전용 권한은 아니에요. 앱 자체는 사용량 조회에만 사용해요. 비공식 연동이라 서비스 변경의 영향을 받을 수 있어요.

실제 인증 서버에서 기기 코드 발급이 성공하는 것을 확인했어요. 자동 테스트는 중복 요청, 만료·승인 거부, 토큰 갱신, 조회 실패 시 이전 값 보존, 비밀값 응답 차단을 확인해요. 실제 계정의 사용률 및 Cloudflare에서의 계정별 조회 성공 여부는 사용자가 승인한 뒤 확인해야 해요.
