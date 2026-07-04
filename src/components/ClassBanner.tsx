"use client";
// 학급 목표 배너 — 교사가 교사탭에서 문구 수정/숨김. 홈·독서 상단 공용.
import { useClassBanner } from "@/lib/query/classMeta";

export default function ClassBanner({ compact = false }: { compact?: boolean }) {
  const { data: banner } = useClassBanner();
  if (!banner || !banner.active || !banner.title.trim()) return null;
  return (
    <div
      className={`rounded-card bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow ${
        compact ? "px-5 py-3" : "p-4"
      }`}
    >
      {!compact && banner.sub?.trim() && (
        <p className="text-sm font-medium opacity-90">{banner.sub}</p>
      )}
      <p className={compact ? "text-lg font-extrabold" : "mt-1 text-2xl font-extrabold"}>
        {banner.title}
      </p>
    </div>
  );
}
