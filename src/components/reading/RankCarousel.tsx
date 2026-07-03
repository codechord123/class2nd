"use client";
// 움직이는 가로 슬라이드 순위 (요구사항 §C — 경쟁 자극).
// CSS 무한 마퀴: 목록을 2벌 이어붙여 -50%까지 이동을 반복.
import { students } from "@/lib/roster";

export default function RankCarousel({ totals }: { totals: Record<string, number> }) {
  const ranked = students
    .map((s) => ({ ...s, count: totals[String(s.id)] ?? 0 }))
    .sort((a, b) => b.count - a.count);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}위`);

  const items = ranked.map((s, i) => (
    <div
      key={`${s.id}`}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
        i < 3 ? "bg-amber-100 font-bold text-amber-800" : "bg-white/70 text-slate-600"
      }`}
    >
      <span>{medal(i)}</span>
      <span>{s.name}</span>
      <span className="text-xs opacity-70">{s.count}권</span>
    </div>
  ));

  return (
    <div className="overflow-hidden">
      <div className="marquee flex w-max gap-2 py-1">
        {items}
        {ranked.map((s, i) => (
          <div
            key={`dup-${s.id}`}
            aria-hidden
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
              i < 3 ? "bg-amber-100 font-bold text-amber-800" : "bg-white/70 text-slate-600"
            }`}
          >
            <span>{medal(i)}</span>
            <span>{s.name}</span>
            <span className="text-xs opacity-70">{s.count}권</span>
          </div>
        ))}
      </div>
    </div>
  );
}
