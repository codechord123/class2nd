"use client";
// 1학기 거북이 독서 — 권수 통계 전용.
// 감상문 전문은 [📖 감상문] 탭에 1·2학기가 통합되어 이 컴포넌트에서는 더 보여주지 않는다.
// 권수 = 실제 작성한 감상문 수(정적) + 선생님 보정(readingStats/main.s1Adj) — 추가 읽기 0.
import { students } from "@/lib/roster";
import { s1BooksByStudent, s1TotalOf } from "@/lib/staticData";
import { useReadingStats } from "@/lib/query/reading";

export default function S1Archive() {
  const { data: stats } = useReadingStats();
  const total = s1TotalOf(stats);

  return (
    <section className="rounded-card border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-emerald-900">📚 1학기 거북이 독서 권수</h3>
        <span className="text-sm text-emerald-700">
          학급 합계 <b className="tnum">{total}권</b>
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {students.map((s) => {
          const base = s1BooksByStudent[String(s.id)] ?? 0;
          const adj = stats?.s1Adj?.[String(s.id)] ?? 0;
          const n = base + adj;
          return (
            <li key={s.id} className="flex justify-between border-b border-emerald-100 py-1">
              <span>{s.name}</span>
              <b className={n > 0 ? "tnum text-emerald-700" : "tnum text-ink-300"}>
                {n}권
                {adj !== 0 && (
                  <span className="ml-1 text-[10px] font-normal text-ink-400">
                    (감상문 {base}{adj > 0 ? `+${adj}` : adj})
                  </span>
                )}
              </b>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-500">
        ※ 권수는 <b>실제 작성한 감상문 수</b> 기준이에요 (선생님이 종이 감상문 등을 인정하면
        보정으로 더해져요).
      </p>
    </section>
  );
}
