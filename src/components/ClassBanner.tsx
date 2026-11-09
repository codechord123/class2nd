"use client";
// 학급 목표 배너 — 교사가 교사탭에서 문구 수정/숨김. 홈·독서 상단 공용.
import { useClassBanner } from "@/lib/query/classMeta";

export default function ClassBanner({ compact = false }: { compact?: boolean }) {
  const { data: banner } = useClassBanner();
  if (!banner) return null;
  const showMain = banner.active && banner.title.trim();
  const showEvent = banner.eventActive && banner.eventText?.trim();
  if (!showMain && !showEvent) return null;
  // 🍎 2026-11 미니멀 개편: 파랑 그라데이션 → 짙은 잉크 한 장 (Apple 프로모 카드). 화면에서 가장 무거운 덩어리라
  // 한 번에 "이게 우리 반 목표"가 읽히고, 아래 흰 카드들과 경쟁하지 않는다.
  return (
    <div className="space-y-1.5">
      {showMain && (
        <div
          className={`rounded-card bg-ink-900 px-5 text-white ${
            compact ? "py-3" : "py-3.5"
          }`}
        >
          {!compact && banner.sub?.trim() && (
            <p className="text-xs font-medium text-white/60">{banner.sub}</p>
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
