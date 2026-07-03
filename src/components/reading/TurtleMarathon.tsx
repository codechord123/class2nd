"use client";
// 🐢 거북이 독서 마라톤 현황 (1학기 명물 위젯 이식) — 학급 전체 권수가
// 목표(짜파게티 파티)를 향해 달리는 트랙. readingStats 1문서로 렌더.
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";

export default function TurtleMarathon() {
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();

  const goal = settings?.readingGoal ?? 1250;
  const total = Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const progress = Math.min((total / goal) * 100, 100);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-sm font-extrabold text-emerald-800">
          🐢 거북이 독서 마라톤 현황
        </h3>
        <p className="text-xs font-bold text-emerald-600">
          학급 목표 {goal.toLocaleString()}권 중 <b>{total.toLocaleString()}권</b> 달성! (
          {Math.floor(progress)}%)
        </p>
      </div>
      <div className="relative mt-2 h-8 w-full overflow-hidden rounded-full border-2 border-emerald-300 bg-emerald-100 shadow-inner">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
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
    </div>
  );
}
