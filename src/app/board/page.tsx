// 건의 게시판 — Phase 5에서 구현 (최근 N개 페이지네이션, 열람 중 문서만 구독).
export const metadata = { title: "건의 게시판 | 2학기 학급 자치" };

export default function BoardPage() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">📬 건의 게시판</h2>
      <p className="mt-1 text-sm text-slate-500">개학 후 열립니다. (Phase 5)</p>
    </section>
  );
}
