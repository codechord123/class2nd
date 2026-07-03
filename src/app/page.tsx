// 개요(홈) — 거북이 경고 + 짜파게티 배너가 항상 최상단 (요구사항 §C).
// 경고의 실제 부족 권수 계산은 Phase 4(거북이 독서)에서 연결한다.
import Link from "next/link";
import { students } from "@/lib/roster";

export default function HomePage() {
  return (
    <div className="space-y-4">
      {/* 최종 목표 배너 — 상단 고정 */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-5 text-white shadow">
        <p className="text-sm font-medium opacity-90">🐢 거북이 독서 최종 미션</p>
        <p className="mt-1 text-2xl font-extrabold">🍜 짜파게티 파티까지 달린다!</p>
        <p className="mt-1 text-sm opacity-90">매주 3권씩 꾸준히 읽으면 우리 반 모두 파티!</p>
      </div>

      {/* 미달성 경고 자리 — Phase 4에서 학생별 부족 권수 연결 */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        ⚠️ 이번 주 독서 미달 알림이 여기에 표시됩니다. (2학기 개학 후 활성화)
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link href="/team" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow">
          <h2 className="font-bold">🤝 Team — 2학기 핵심!</h2>
          <p className="mt-1 text-sm text-slate-500">
            우리 모둠 상호평가 + 우수 모둠 벤치마킹. 매일 종회 시간에 참여하세요.
          </p>
        </Link>
        <Link href="/seats" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow">
          <h2 className="font-bold">🪑 자리 배치</h2>
          <p className="mt-1 text-sm text-slate-500">
            21주 자리 일정 미리보기 · 토큰으로 자리 변경 신청 (수요일 자정 마감, 선착순)
          </p>
        </Link>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">우리 반</h2>
        <p className="mt-1 text-sm text-slate-500">
          {students.length}명 · 의장 {students.filter((s) => s.isChair).length}명 · 5모둠 ×
          5명 · 2주마다 자리 교체
        </p>
      </section>
    </div>
  );
}
