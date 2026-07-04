"use client";
// 학급 목표 배너 — 교사가 교사탭에서 문구 수정/숨김. 홈·독서 상단 공용.
import { useClassBanner } from "@/lib/query/classMeta";

export default function ClassBanner({ compact = false }: { compact?: boolean }) {
  const { data: banner } = useClassBanner();
  if (!banner || !banner.active || !banner.title.trim()) return null;
  // 흰 카드 + 주황 왼줄 액센트 — 다른 탭과 같은 카드 문법 (그라데이션 블록은 컨셉이 튐)
  return (
    <div
      className={`rounded-card border border-ink-200 border-l-4 border-l-warn bg-white px-4 shadow-card ${
        compact ? "py-2.5" : "py-3"
      }`}
    >
      {!compact && banner.sub?.trim() && (
        <p className="text-xs font-bold text-warn">{banner.sub}</p>
      )}
      <p className={`font-extrabold text-ink-900 ${compact ? "text-base" : "mt-0.5 text-lg"}`}>
        🎯 {banner.title}
      </p>
    </div>
  );
}
