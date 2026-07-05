"use client";
// 학급 목표 배너 — 교사가 교사탭에서 문구 수정/숨김. 홈·독서 상단 공용.
import { useClassBanner } from "@/lib/query/classMeta";

export default function ClassBanner({ compact = false }: { compact?: boolean }) {
  const { data: banner } = useClassBanner();
  if (!banner) return null;
  const showMain = banner.active && banner.title.trim();
  const showEvent = banner.eventActive && banner.eventText?.trim();
  if (!showMain && !showEvent) return null;
  // 그라데이션 배너 유지하되 브랜드 파랑으로 — 앱 전체가 파랑 한 계열로 통일 (사용자 결정)
  return (
    <div className="space-y-1.5">
      {showMain && (
        <div
          className={`rounded-card bg-gradient-to-r from-brand to-blue-600 px-5 text-white shadow ${
            compact ? "py-3" : "py-3.5"
          }`}
        >
          {!compact && banner.sub?.trim() && (
            <p className="text-xs font-medium opacity-90">{banner.sub}</p>
          )}
          <p className={`font-extrabold ${compact ? "text-base" : "mt-0.5 text-lg"}`}>
            🎯 {banner.title}
          </p>
        </div>
      )}
      {/* 이벤트 주간 — 노란 띠 (주간 특별 미션 안내) */}
      {showEvent && (
        <div className="rounded-btn bg-amber-100 px-4 py-2 text-sm font-bold text-amber-800">
          🎉 이벤트 주간 — {banner.eventText}
        </div>
      )}
    </div>
  );
}
