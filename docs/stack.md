# 효자손 기술 스택 (맥스튜디오 작업본)

| 층 | 고른 것 | 이유 |
|---|---|---|
| 언어·구성 | TypeScript, pnpm 워크스페이스 `apps/web` + `apps/server` | 한 언어로 화면·서버·체인 SDK를 다 씀 |
| 화면 | Vite + React SPA → Vercel | QR·제출용 고정 주소. 화면 5개(챌린지·리더보드·엄마·자녀 설정·가족방) |
| 서버 | Hono(Node 24) on Mac Studio + 고정 공개 주소(AWS Lightsail 프록시 + SSH 역터널, 승인 후) · 대안 cloudflared 임시 터널 | MAWS 로그인 정보가 이 맥에만 있어서 결제는 여기서 돌아야 함 |
| 실시간 | SSE(`/events`) | 리더보드·가족방이 시도/거절을 바로 받음. 웹소켓 불필요 |
| 저장소 | SQLite(`better-sqlite3`) | 시도·결제·가족방 기록. 행사 하루짜리라 파일 하나면 충분 |
| 엄마 음성 | Vapi Web SDK, Vapi 내장 모델 + 서버 도구(`pay`, `check_scam`, `notify_family`) | 음성은 지연이 생명. 로컬 프록시(약 6초)는 통화에 느림 |
| 할머니 채팅·근거·브리핑 | AWS Bedrock `global.anthropic.claude-haiku-4-5` (서울 리전, 실측 약 2.4초) · 막히면 로컬 프록시 `127.0.0.1:10100` | 챌린지는 답이 빨라야 재밌음. 로컬 프록시는 약 6초 |
| 사기 판정 | Articul8 Bivia `/boolean`(사기 여부·확률) | 확률 숫자가 화면·발표에 그대로 쓰임 |
| 결제 1겹 | MAWS를 MCP stdio로 호출(`m-aws serve`): `agent.create` → `policy.set` → `policy.preflight` → `transfer.send` | 에이전트 지갑이 서명 전에 `POLICY_REJECTED` |
| 결제 2겹 | PCL 지급 계약(`@maroo-chain/viem@0.5.0`), 허용 상점·1회 한도 규칙 | MAWS 한도는 체인이 안 읽음. 체인이 직접 막는 건 PCL |
| 상점 주소 | 로컬에서 만든 테스트 지갑(관리사무소·약국·쇼핑몰) | 허용 목록 대상. 사기범 주소는 목록 밖 |

이름 규칙: 에이전트·어시스턴트·지갑 라벨에는 모두 `맥스튜디오`를 붙인다(맥북 작업본과 구분).
