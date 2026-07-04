"use client";
// 학급 목표 배너 — 교사가 교사탭에서 문구 수정/숨김. 홈·독서 상단 공용.
import { useClassBanner } from "@/lib/query/classMeta";

export default function ClassBanner({ compact = false }: { compact?: boolean }) {
  const { data: banner } = useClassBanner();
  if (!banner || !banner.active || !banner.title.trim()) return null;
  // 한 줄 정보(목표 문구)가 화면을 크게 차지하지 않게 — 홈도 컴팩트 비율로 통일
  return (
    <div
      className={`rounded-card bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-white shadow ${
        compact ? "py-3" : "py-3.5"
      }`}
    >
      {!compact && banner.sub?.trim() && (
        <p className="text-xs font-medium opacity-90">{banner.sub}</p>
      )}
      <p className={`font-extrabold ${compact ? "text-lg" : "mt-0.5 text-xl"}`}>{banner.title}</p>
    </div>
  );
}
