"use client";
// 🐢 거북이 응원 이벤트 현황 — 교사 전용. 학생 화면에서는 클릭 수를 숨기므로
// (깜짝 이벤트) 선생님만 여기서 진행도를 보고 발표 타이밍을 잡는다.
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLICK_EVENT_GOAL, CLICK_EVENT_GOLD } from "@/lib/autoRun";
import Card from "@/components/ui/Card";

export default function TurtleEventPanel() {
  const { data } = useQuery({
    queryKey: ["turtleClicksTeacher"],
    queryFn: async (): Promise<{ count: number; eventGold: number }> => {
      const snap = await getDoc(doc(db(), "classData", "turtleClicks"));
      const d = snap.exists() ? snap.data() : {};
      return {
        count: (d.count as number) ?? 0,
        eventGold: (d.eventGold as number) ?? 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const count = data?.count ?? 0;
  const paid = (data?.eventGold ?? 0) > 0;
  const pct = Math.min((count / CLICK_EVENT_GOAL) * 100, 100);

  return (
    <Card
      title="🐢 거북이 응원 깜짝 이벤트 (교사만 보여요)"
      desc={`응원 클릭 ${CLICK_EVENT_GOAL.toLocaleString()}번 달성 시 학급 골드 +${CLICK_EVENT_GOLD} — 1회성. 아이들 화면엔 클릭 수가 안 보여요.`}
    >
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <b className="tnum text-lg text-emerald-700">{count.toLocaleString()}</b>
          <span className="text-xs text-ink-400">
            / {CLICK_EVENT_GOAL.toLocaleString()}번 ({Math.floor(pct)}%)
          </span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
            style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-600">
          {paid
            ? `✅ 이벤트 완료 — 학급 골드 +${data?.eventGold} 지급됨. 아이들에게 발표하셨나요? 🎉`
            : count >= CLICK_EVENT_GOAL
              ? "🎯 목표 달성! 다음 자동 집계(접속) 때 골드가 지급돼요."
              : `달성까지 ${(CLICK_EVENT_GOAL - count).toLocaleString()}번 남았어요. 지급은 접속 시 자동이에요.`}
        </p>
      </div>
    </Card>
  );
}
