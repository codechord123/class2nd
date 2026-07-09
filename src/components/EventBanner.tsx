"use client";
// 🎉 이벤트 배너 — 이벤트가 오늘 진행 중일 때만 학생·교사에게 표시 (동기부여).
// 이미 캐시되는 eventBoost 문서 재사용 (추가 읽기 0에 가깝다 · 10분 staleTime).
import { todayKST } from "@/lib/date";
import { useEventBoost } from "@/lib/query/classMeta";

const LABELS: { key: "comp" | "mission" | "mvp" | "read"; label: string }[] = [
  { key: "comp", label: "💌 칭찬" },
  { key: "mission", label: "🎯 칭찬 미션" },
  { key: "mvp", label: "⭐ MVP" },
  { key: "read", label: "🐢 독서" },
];

export default function EventBanner() {
  const { data: ev } = useEventBoost();
  if (!ev || !ev.active || !ev.from || !ev.to) return null;
  const today = todayKST();
  if (today < ev.from || today > ev.to) return null;

  const boosts = LABELS.filter((l) => (ev[l.key] as number) > 1).map(
    (l) => `${l.label} ×${ev[l.key]}`
  );
  if (!boosts.length) return null;

  return (
    <div className="rounded-card border border-amber-300 bg-gradient-to-r from-amber-50 to-pink-50 px-4 py-3 shadow-card">
      <p className="text-sm font-extrabold text-amber-800">
        🎉 {ev.name?.trim() || "점수 이벤트"} 진행 중!
      </p>
      <p className="mt-0.5 text-[13px] font-bold text-amber-700">
        {boosts.join(" · ")} — 오늘 점수가 두 배로 쌓여요!
      </p>
    </div>
  );
}
