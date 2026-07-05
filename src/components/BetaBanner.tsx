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
    <div className="border-b border-violet-100 bg-violet-50 px-4 py-1.5 text-center text-[11px] font-semibold text-violet-700">
      <span className="mr-1.5 rounded-full bg-violet-600 px-1.5 py-px text-[10px] font-bold text-white">
        BETA
      </span>
      테스트 기간 (~7/20) · 점수·상점 기록은 연습이에요 — 개학 전에 초기화돼요 · 🐢 독서
      감상문은 진짜! 계속 쌓여요
    </div>
  );
}
