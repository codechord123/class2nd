"use client";
// 움직이는 가로 순위 (1·2학기 합산, 목표 연속) — 레드팀 결론 반영:
// TOP 10만 순위 배지로 노출, 나머지는 비노출(하위권 공개 낙인 방지).
import { students } from "@/lib/roster";
import { s1BooksByStudent } from "@/lib/staticData";

export default function RankCarousel({ totals }: { totals: Record<string, number> }) {
  const ranked = students
    .map((s) => {
      const s1 = s1BooksByStudent[String(s.id)] ?? 0;
      const s2 = totals[String(s.id)] ?? 0;
      return { ...s, count: s1 + s2, s2 };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (!ranked.length) {
    return <p className="text-xs text-ink-400">아직 기록이 없어요 — 첫 주자가 되어보세요!</p>;
  }

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}위`);
  const Item = ({ s, i, dup }: { s: (typeof ranked)[number]; i: number; dup?: boolean }) => (
    <div
      aria-hidden={dup}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
        i < 3
          ? "border-amber-300 bg-amber-100 font-bold text-amber-900"
          : "border-ink-200 bg-white font-medium text-ink-700"
      }`}
    >
      <span>{medal(i)}</span>
      <span>{s.name}</span>
      <span className="tnum text-xs text-ink-500">
        {s.count}권{s.s2 > 0 && <span> (+{s.s2})</span>}
      </span>
    </div>
  );

  return (
    <div>
      <div className="overflow-hidden">
        <div className="marquee flex w-max gap-2 py-1">
          {ranked.map((s, i) => (
            <Item key={s.id} s={s} i={i} />
          ))}
          {ranked.map((s, i) => (
            <Item key={`d-${s.id}`} s={s} i={i} dup />
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-ink-500">
        1·2학기 합산 TOP 10 · (+n)은 2학기에 읽은 권수 · 마우스를 올리면 멈춰요
      </p>
    </div>
  );
}
