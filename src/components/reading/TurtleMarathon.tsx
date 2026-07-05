"use client";
// 🐢 거북이 독서 마라톤 — 1학기와 이어서 목표 진행:
//   학급 누적 = 1학기(정적) + 2학기(readingStats). 바에 1학기 구간을 진하게 표시.
//   거북이는 종종걸음으로 항상 움직이고, 누르면 폴짝 뛰며 ✨가 터진다 (참여감).
import { useState } from "react";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { s1TotalOf } from "@/lib/staticData";

export default function TurtleMarathon({ bare = false }: { bare?: boolean }) {
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();
  const [hopKey, setHopKey] = useState(0); // 클릭할 때마다 점프 애니메이션 재시작

  const goal = settings?.readingGoal ?? 1250;
  const s2Total = Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const s1Total = s1TotalOf(stats);
  const total = s1Total + s2Total;
  const progress = Math.min((total / goal) * 100, 100);
  const s1Progress = Math.min((s1Total / goal) * 100, 100);

  return (
    // bare: 다른 카드 안에 합쳐 넣을 때 (독서 탭 상단 압축 — 카드 개수 줄이기)
    // 흰 카드 + 에메랄드 액센트 — 다른 탭과 같은 카드 문법 (배경색 블록은 컨셉이 튐)
    <div
      className={bare ? "" : "rounded-card border border-ink-200 bg-white p-4 shadow-card"}
    >
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
      <button
        type="button"
        onClick={() => setHopKey((k) => k + 1)}
        aria-label="거북이 응원하기"
        className="relative mt-2 block h-8 w-full cursor-pointer overflow-hidden rounded-full border-2 border-emerald-300 bg-emerald-100 shadow-inner"
      >
        {/* 2학기 진행분 (연한 색, 전체 길이) — 줄무늬가 흐르며 '달리는 중' 느낌 */}
        <div
          className="bar-stripes absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-300 to-emerald-400 transition-all duration-1000 ease-out"
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
        {/* 클릭 응원 ✨ — hopKey로 리마운트해 애니메이션 재시작 */}
        {hopKey > 0 && (
          <div
            key={`s-${hopKey}`}
            className="spark-pop pointer-events-none absolute top-1/2 z-30 text-sm"
            style={{ left: `max(24px, calc(${progress}% - 6px))` }}
          >
            ✨
          </div>
        )}
        <div
          key={hopKey}
          className={`absolute top-1/2 z-20 -translate-y-1/2 text-xl drop-shadow-lg transition-all duration-1000 ease-out ${
            hopKey > 0 ? "turtle-hop" : "turtle-runner"
          }`}
          style={{ left: `max(4px, calc(${progress}% - 26px))` }}
          onAnimationEnd={(e) => {
            // 점프가 끝나면 다시 종종걸음으로
            if (e.animationName === "turtle-hop") e.currentTarget.classList.replace("turtle-hop", "turtle-runner");
          }}
        >
          🐢
        </div>
      </button>
      <p className="mt-1.5 text-right text-[11px] font-medium text-emerald-700">
        1학기 <b className="tnum">{s1Total}권</b> + 2학기 <b className="tnum">{s2Total}권</b>{" "}
        — 이어서 달려요!
      </p>
    </div>
  );
}
