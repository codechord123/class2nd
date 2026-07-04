"use client";
// 🐢 거북이 독서 마라톤 — 1학기와 이어서 목표 진행:
//   학급 누적 = 1학기(정적) + 2학기(readingStats). 바에 1학기 구간을 진하게 표시.
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { s1TotalBooks } from "@/lib/staticData";

export default function TurtleMarathon() {
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();

  const goal = settings?.readingGoal ?? 1250;
  const s2Total = Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const total = s1TotalBooks + s2Total;
  const progress = Math.min((total / goal) * 100, 100);
  const s1Progress = Math.min((s1TotalBooks / goal) * 100, 100);

  return (
    <div className="rounded-card border border-emerald-300 bg-emerald-50/70 p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-emerald-900">🐢 거북이 독서 마라톤</h3>
        {/* 성취 숫자가 이 블록의 주인공 — 크게, 진하게 */}
        <p className="flex items-baseline gap-1.5">
          <b className="tnum text-xl font-extrabold text-emerald-700">
            {total.toLocaleString()}
          </b>
          <span className="text-sm font-bold text-emerald-600">/ {goal.toLocaleString()}권</span>
          <span className="tnum rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-extrabold text-white">
            {Math.floor(progress)}%
          </span>
        </p>
      </div>
      <div className="relative mt-2 h-8 w-full overflow-hidden rounded-full border-2 border-emerald-300 bg-emerald-100 shadow-inner">
        {/* 2학기 진행분 (연한 색, 전체 길이) */}
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-300 to-emerald-400 transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
        {/* 1학기 구간 (진한 색) */}
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-600"
          style={{ width: `${s1Progress}%` }}
        />
        <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-base drop-shadow">
          🍜
        </div>
        <div
          className="absolute top-1/2 z-20 -translate-y-1/2 text-xl drop-shadow-lg transition-all duration-1000 ease-out"
          style={{ left: `max(4px, calc(${progress}% - 26px))` }}
        >
          🐢
        </div>
      </div>
      <p className="mt-1.5 text-right text-[11px] font-medium text-emerald-700">
        1학기 <b className="tnum">{s1TotalBooks}권</b> + 2학기 <b className="tnum">{s2Total}권</b>{" "}
        — 이어서 달려요!
      </p>
    </div>
  );
}
