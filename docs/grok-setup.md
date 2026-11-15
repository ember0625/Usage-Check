# Grok 연결

1. 기존 사이트에 로그인하고 아래 **Grok 연결·사용량** 링크를 열어요 (`/grok`).
2. **Grok 연결**을 누른 다음 **Grok에서 승인하기**를 눌러요.
3. xAI 화면의 인증 코드가 사이트의 코드와 일치하는지 확인하고 **개인 계정**으로 승인해요.
4. 원래 탭으로 돌아오면 자동 확인해요. 필요하면 **승인 완료 · 확인**을 누르세요.
5. 주간 사용률과 초기화까지 남은 시간을 Grok 앱의 사용량 화면과 비교하세요.

아이폰만으로 연결할 수 있어요. 인증 코드는 최대 30분간 유효하고, 시작 버튼을 연속으로 눌러도 같은 대기 중인 코드를 사용해요. 새로고침한 탭에서도 승인을 이어서 확인해요.

로그인 정보는 기존 Cloudflare Durable Object에 저장해요. 다른 서비스 토큰과 함께 새로 발급받을 필요가 없고, 연결 해제는 Grok에만 적용돼요. 만료가 가까워지면 refresh token을 자동 갱신하고, 갱신이 거부된 경우 다시 로그인을 안내해요. 연결 해제는 이 사이트의 로그인 정보를 삭제하는 기능이에요. xAI 계정 전체의 다른 로그인 세션까지 취소하지는 않아요.

## 사용량과 갱신

- 공식 Grok CLI가 이용하는 `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`에서 주간 구독 공용 사용률과 초기화 시각을 읽어요.
- 응답의 `config.creditUsagePercent`는 이미 백분율이에요. `currentPeriod.type`이 `USAGE_PERIOD_TYPE_WEEKLY`인지 검증해요. 응답에 없는 5시간 한도나 사용률을 0으로 만들지 않아요.
- Cloudflare의 기존 15분 예약 작업에 포함돼요. Grok 연결 화면과 위젯 조회 요청에서는 마지막 조회가 10분 이상 지난 경우 다시 조회해요. 수동 갱신은 즉시 조회해요.
- 조회 실패 때 마지막 성공값과 성공 시각을 보존하고 오류를 함께 보여줘요.
- `/api/usage`, `/api/widget` 응답에 `grok` 데이터가 추가돼요. `src/widget.js`와 기존 위젯의 배치는 변경하지 않았어요.

## 구현 근거와 검증 범위

- [공식 기기 코드 로그인 구현](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-login/src/device_code.rs)
- [공식 OAuth 설정](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-login/src/config.rs)
- [공식 사용량 조회 구현](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/src/extensions/billing.rs)

공개 OAuth 클라이언트로 `openid offline_access grok-cli:access`만 요청해요. 대화·워크스페이스 쓰기 권한은 요청하지 않지만, `grok-cli:access`는 사용량 읽기만을 위한 전용 권한은 아니에요. 앱 자체는 사용량 조회에만 사용해요. 비공식 연동이라 서비스 변경의 영향을 받을 수 있어요.

실제 인증 서버에서 기기 코드 발급이 성공하는 것을 확인했어요. 자동 테스트는 중복 요청, 만료·승인 거부, 토큰 갱신, 조회 실패 시 이전 값 보존, 비밀값 응답 차단을 확인해요. 실제 계정의 사용률 및 Cloudflare에서의 계정별 조회 성공 여부는 사용자가 승인한 뒤 확인해야 해요.
