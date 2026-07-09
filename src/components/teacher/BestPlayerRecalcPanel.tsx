"use client";
// 👑 베스트플레이어 재계산 (교사 도구) — 저장된 모든 집계일에서 '오늘의 모둠'에 든 횟수를
// 다시 세어 누적 카운터(bestGroupWins)를 복구한다. 집계 로직 변경·초기화 후 비어 있을 때 사용.
import { useState } from "react";
import { recomputeBestGroupWins } from "@/lib/aggregate";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedback } from "@/components/ui/Feedback";

export default function BestPlayerRecalcPanel() {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const wins = await recomputeBestGroupWins();
      const n = Object.values(wins).reduce((a, b) => a + b, 0);
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      toast(
        n > 0
          ? `베스트플레이어를 다시 계산했어요 (총 ${n}회 반영).`
          : "아직 '오늘의 모둠'으로 뽑힌 날이 없어요 — 모둠 점수(순위·미션·독서)가 있는 날부터 쌓여요.",
        n > 0 ? "success" : "warn"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "재계산에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h3 className="text-lg font-bold">👑 베스트플레이어 재계산</h3>
      <p className="mt-1 text-[13px] text-ink-500">
        저장된 모든 집계일에서 <b>오늘의 모둠(그날 모둠 총점 1위)</b>에 든 횟수를 다시 세어
        통계를 복구해요. 집계 방식이 바뀌었거나 초기화 뒤 통계가 비어 보일 때 눌러요.
      </p>
      <button
        onClick={() => void run()}
        disabled={busy}
        className="press mt-3 rounded-btn bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? "계산 중…" : "다시 계산"}
      </button>
    </section>
  );
}
