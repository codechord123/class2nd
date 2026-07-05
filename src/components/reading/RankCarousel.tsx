"use client";
// 움직이는 가로 순위 (1·2학기 합산, 목표 연속) — 레드팀 결론 반영:
// TOP 10만 순위 배지로 노출, 나머지는 비노출(하위권 공개 낙인 방지).
// 항상 흐르고, 마우스 올리기(데스크탑) 또는 탭(디벗 — hover 없음)으로 멈춘다.
import { useState } from "react";
import { students } from "@/lib/roster";
import { s1BooksOf } from "@/lib/staticData";
import type { ReadingStats } from "@/lib/query/reading";

export default function RankCarousel({ stats }: { stats: ReadingStats | undefined }) {
  // 태블릿(디벗)은 hover가 없어 흐르는 이름을 읽기 어렵다 — 탭으로 멈춤/재생 토글
  const [paused, setPaused] = useState(false);

  const ranked = students
    .map((s) => {
      const s1 = s1BooksOf(stats, s.id);
      const s2 = stats?.total?.[String(s.id)] ?? 0;
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
      <span className="tnum text-xs text-ink-600">
        {s.count}권{s.s2 > 0 && <span> (+{s.s2})</span>}
      </span>
    </div>
  );

  // 두 세트를 각각 pr-2로 감싼다 — 전체 폭의 정확히 절반씩이 되어 -50% 루프의
  // 이음새에서 칩이 잘리거나 간격이 튀지 않는다 (1위 잘림 보정)
  const set = (dup: boolean) => (
    <div aria-hidden={dup || undefined} className="flex gap-2 pr-2">
      {ranked.map((s, i) => (
        <Item key={`${dup ? "d-" : ""}${s.id}`} s={s} i={i} dup={dup} />
      ))}
    </div>
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setPaused((v) => !v)}
        aria-label={paused ? "순위 다시 흐르게" : "순위 멈추기"}
        className="block w-full cursor-pointer overflow-hidden text-left"
      >
        <div
          className="marquee flex w-max py-1"
          style={paused ? { animationPlayState: "paused" } : undefined}
        >
          {set(false)}
          {set(true)}
        </div>
      </button>
      <p className="mt-1 text-[11px] text-ink-500">
        1·2학기 합산 TOP 10 · (+n)은 2학기에 읽은 권수 ·{" "}
        {paused ? "▶️ 눌러서 다시 흘려요" : "한 번 누르면 멈춰요"}
      </p>
    </div>
  );
}
