"use client";
// 샘플 데이터 패널 — 개학 전 리포트가 실제로 어떻게 보이는지 미리보기용.
// 생성 → 자동 집계까지 한 번에, 삭제 → 재집계로 누적 점수까지 원상복구.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { generateSampleDay, clearSampleDay } from "@/lib/sampleData";
import { useSettings } from "@/lib/query/settings";
import { useFeedback } from "@/components/ui/Feedback";

export default function SampleDataPanel({ date }: { date: string }) {
  const { data: settings } = useSettings();
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
    void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
    void qc.invalidateQueries({ queryKey: ["bestGroups"] });
    void qc.invalidateQueries({ queryKey: ["readingStats"] });
    void qc.invalidateQueries({ queryKey: ["readingReports"] });
  }

  async function generate() {
    if (busy || !settings) return;
    const ok = await confirm({
      title: "샘플 평가를 만들까요?",
      body: `${date} 날짜로 25명 전원의 평가·MVP·칭찬·건의 + 감상문 8편 샘플을 만들고 바로 집계해요.\n리포트가 실제 모습으로 채워집니다. (아래 '샘플 지우기'로 되돌릴 수 있어요)`,
      confirmLabel: "만들기",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await generateSampleDay(date, settings);
      refresh();
      toast(
        `🎲 샘플 ${r.entries}명 + 감상문 ${r.reports}편 생성·집계 완료! 순위: ${r.ranking.map((g, i) => `${i + 1}위 ${g}모둠`).join(" ")}`,
        "success"
      );
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "생성 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (busy || !settings) return;
    const ok = await confirm({
      title: "샘플을 지울까요?",
      body: `${date} 날짜의 평가 기록과 샘플 감상문을 모두 삭제하고 재집계해요. 누적 점수·권수도 원래대로 돌아갑니다.`,
      confirmLabel: "지우기",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const n = await clearSampleDay(date, settings);
      refresh();
      toast(`🧹 ${n}건 삭제·재집계 완료 — 원상복구됐어요.`, "success");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "삭제 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-dashed border-ink-300 bg-ink-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink-800">🧪 샘플 데이터 (미리보기용)</p>
          <p className="mt-0.5 text-xs text-ink-500">
            아이들이 아직 안 써도 리포트·집계가 어떻게 보이는지 확인할 수 있어요.
          </p>
        </div>
        <span className="flex gap-1.5">
          <button
            onClick={() => void generate()}
            disabled={busy}
            className="press rounded-btn bg-brand px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? "처리 중…" : "🎲 샘플 만들기"}
          </button>
          <button
            onClick={() => void clear()}
            disabled={busy}
            className="press rounded-btn border border-ink-300 bg-white px-3 py-2 text-xs font-bold text-ink-600 disabled:opacity-50"
          >
            🧹 샘플 지우기
          </button>
        </span>
      </div>
    </section>
  );
}
