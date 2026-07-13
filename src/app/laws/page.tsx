// 📜 법률 탭 — 건의 게시판에서 독립한 법률 전용 화면 (사용자 요청).
// 부서별 제안·토론·통과(채택) 현황·헌법 일괄 등록을 한곳에서.
// 화면 로직은 BoardPage(view="laws")를 재사용한다 — 상세·댓글·상태 관리 공통.
import BoardPage from "../board/page";

export default function LawsPage() {
  return <BoardPage view="laws" />;
}
