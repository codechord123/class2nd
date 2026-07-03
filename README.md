# 2학기 학급 자치 시스템 (class2nd)

초등 5학년 학급(25명)의 2학기 모둠·독서·상점 관리 웹앱. 1학기 앱의 Firebase 읽기 한도 초과 문제를 구조적으로 해결하는 리뉴얼 프로젝트.

- 설계안: [`docs/2학기-리뉴얼-설계안.md`](docs/2학기-리뉴얼-설계안.md)
- 1학기 앱(참고용): [`legacy/s1-index.html`](legacy/s1-index.html)

## 스택
Next.js (App Router) + TypeScript + Tailwind · Firebase(Firestore/Auth) · TanStack Query + Zustand · Vercel 배포(GitHub 연동)

## 실행
```bash
npm install
cp .env.example .env.local   # Firebase 값 채우기 (미설정이어도 정적 데이터 화면은 동작)
npm run dev
```

## 데이터 원칙 (읽기 절감)
- **정적 데이터는 DB 금지**: 1학기 이월 지갑·거북이 백업·21주 자리표 → `data/static/*.json` (Firebase 읽기 0회)
- **집계는 서버 사전계산**: 원시 평가를 클라이언트가 읽지 않고, Cron이 만든 `dailyScores`만 읽음
- **전체 컬렉션 onSnapshot 금지**, 쓰기 후 전체 재조회 금지 (React Query 캐시 + 낙관적 업데이트)

## 1학기 이월 (별도 지갑 방식)
- 학생별 이월 실버: `data/static/s1-silver-wallet.json` → `silverRemaining` (합계 316개)
- 학급 골드토큰 이월분: 14개 (`classGold.remaining`)
- 이월분은 "1학기 이월 지갑"에서만 사용/차감 — 2학기 재화와 절대 합산하지 않음

## 진행 상황
- [x] Phase 0 — 설계·스캐폴딩·정적 데이터 연동 (홈/상점/거북이 1학기 조회 동작)
- [x] Phase 1 — 인증(교사/학생) + Firestore 규칙 (`firestore.rules` 콘솔 게시 필요)
- [x] Phase 2 — 21주 자리 사전계산(어닐링) + 자리표/캘린더 (토큰 자리변경 신청은 Phase 5)
- [x] Phase 3 — Team 평가(모둠 내/간) + 교사 집계(원시 평가는 교사만 읽음)
- [x] Phase 4 — 거북이 독서(주 3권·경고·순위 캐러셀·감상문)
- [x] Phase 5 — 상점(2학기)·이월 지갑 차감·게시판·투표·자리변경 신청
- [x] Phase 6 — 격주 MVP 정산·보너스 + 1학기 차용(마라톤·감상문 확장·댓글·메뉴판·링크·메모)
