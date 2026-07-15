// 🕵️ 숨은 기여 탭 — 건의 게시판에서 독립한 숨은 기여 추천 전용 화면 (사용자 요청).
// 드러나지 않게 학급을 도운 친구를 추천 → 👍👎 투표 → 금요일 선생님 지급.
// 화면 로직은 BoardPage(view="hidden")를 재사용한다 — 상세·댓글·찬반 공통.
import BoardPage from "../board/page";

export default function HiddenPage() {
  return <BoardPage view="hidden" />;
}
