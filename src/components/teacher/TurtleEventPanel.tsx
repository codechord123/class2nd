"use client";
// 🐢 거북이 응원 이벤트 현황 — 교사 전용. 학생 화면에서는 클릭 수를 숨기므로
// (깜짝 이벤트) 선생님만 여기서 진행도를 보고 발표 타이밍을 잡는다.
// 목표 횟수는 교사가 직접 저장(기본 10,000), 지급 후 '다시 열기'로 재개설 (사용자 요청).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLICK_EVENT_GOAL, CLICK_EVENT_GOLD } from "@/lib/autoRun";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";

export default function TurtleEventPanel() {
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [goalDraft, setGoalDraft] = useState<string | null>(null); // null = 서버값 표시
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["turtleClicksTeacher"],
    queryFn: async (): Promise<{ count: number; eventGold: number; goal: number }> => {
      const snap = await getDoc(doc(db(), "classData", "turtleClicks"));
      const d = snap.exists() ? snap.data() : {};
      return {
        count: (d.count as number) ?? 0,
        eventGold: (d.eventGold as number) ?? 0,
        goal: (d.goal as number) || CLICK_EVENT_GOAL,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const count = data?.count ?? 0;
  const goal = data?.goal ?? CLICK_EVENT_GOAL;
  const paid = (data?.eventGold ?? 0) > 0;
  const pct = Math.min((count / Math.max(goal, 1)) * 100, 100);

  async function saveGoal() {
    const n = Number(goalDraft ?? goal);
    if (!Number.isInteger(n) || n <= 0) {
      toast("목표 횟수는 1 이상의 정수여야 해요.", "warn");
      return;
    }
    setBusy(true);
    try {
      await setDoc(doc(db(), "classData", "turtleClicks"), { goal: n }, { merge: true });
      qc.setQueryData(
        ["turtleClicksTeacher"],
        (prev: { count: number; eventGold: number; goal: number } | undefined) =>
          prev ? { ...prev, goal: n } : prev
      );
      setGoalDraft(null);
      toast(`✅ 이벤트 목표를 ${n.toLocaleString()}번으로 저장했어요.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function rearm() {
    const ok = await confirm({
      title: "이벤트를 다시 열까요?",
      body: `지급 기록을 지우고 이벤트를 재개설해요. 현재 클릭(${count.toLocaleString()}번)이 이미 목표 이상이면 다음 접속 때 바로 골드 +${CLICK_EVENT_GOLD}가 또 지급되니, 먼저 목표 횟수를 더 높게 저장해주세요.`,
      confirmLabel: "다시 열기",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await setDoc(doc(db(), "classData", "turtleClicks"), { eventGold: 0 }, { merge: true });
      void qc.invalidateQueries({ queryKey: ["turtleClicksTeacher"] });
      toast("♻️ 이벤트를 다시 열었어요 — 목표 달성 시 골드가 다시 지급돼요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "재개설에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="🐢 거북이 응원 깜짝 이벤트 (교사만 보여요)"
      desc={`응원 클릭 목표 달성 시 학급 골드 +${CLICK_EVENT_GOLD} — 아이들 화면엔 클릭 수가 안 보여요.`}
    >
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <b className="tnum text-lg text-emerald-700">{count.toLocaleString()}</b>
          <span className="text-xs text-ink-400">
            / {goal.toLocaleString()}번 ({Math.floor(pct)}%)
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
            : count >= goal
              ? "🎯 목표 달성! 다음 자동 집계(접속) 때 골드가 지급돼요."
              : `달성까지 ${(goal - count).toLocaleString()}번 남았어요. 지급은 접속 시 자동이에요.`}
        </p>

        {/* 목표 횟수 저장 — 이스터에그 난이도를 학급 상황에 맞게 */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <span className="text-xs font-bold text-ink-600">🎯 목표 횟수</span>
          <input
            type="number"
            min={1}
            value={goalDraft ?? String(goal)}
            onChange={(e) => setGoalDraft(e.target.value)}
            className="w-28 rounded-btn border border-ink-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => void saveGoal()}
            disabled={busy || (goalDraft === null || Number(goalDraft) === goal)}
            className="press rounded-btn bg-brand px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            저장
          </button>
          {paid && (
            <button
              onClick={() => void rearm()}
              disabled={busy}
              className="press rounded-btn border border-warn/50 bg-white px-3 py-1.5 text-sm font-bold text-warn disabled:opacity-40"
            >
              ♻️ 이벤트 다시 열기
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
