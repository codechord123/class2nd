// 자리 배치 및 일정 — Phase 2에서 구현.
// 21주 자리표는 정적 JSON(data/static/schedules-21w.json)으로 제공 — DB 읽기 0회.
// 토큰 자리변경: 수요일 자정 마감 · 동일 자리 선착순 (신청만 Firestore).
export const metadata = { title: "자리 배치 | 2학기 학급 자치" };

export default function SeatsPage() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">🪑 자리 배치 및 일정</h2>
      <p className="mt-1 text-sm text-slate-500">
        21주 자리 일정 사전 계산(시뮬레이티드 어닐링) 후 여기에 공개됩니다. (Phase 2)
      </p>
      <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">
        <li>자리는 2주마다 학사 일정에 따라 자동 전환</li>
        <li>토큰을 내면 자리 변경 가능 — 마감: 자리 바꿈 전주 수요일 자정</li>
        <li>같은 자리에 신청이 몰리면 선착순</li>
      </ul>
    </section>
  );
}
