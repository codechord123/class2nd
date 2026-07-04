"use client";
// 베타 테스트 배너 — 개학 전 테스트 기간(~7/20)에만 표시. 날짜가 지나면 자동으로 사라진다.
import { todayKST } from "@/lib/date";
import { useSession } from "@/stores/session";

export const BETA_END = "2026-07-20";

export default function BetaBanner() {
  const { role } = useSession();
  const today = todayKST();
  if (!role || today > BETA_END) return null;
  return (
    <div className="bg-violet-600 px-4 py-1.5 text-center text-xs font-bold text-white">
      🧪 베타 테스트 기간 (~7/20 방학 전) — 지금 기록은 연습이에요! 개학 전에 깨끗하게
      초기화돼요.
    </div>
  );
}
