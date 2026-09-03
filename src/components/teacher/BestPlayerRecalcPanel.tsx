"use client";
// 📈 우리 반 통계 검증 (교사 도구) — 저장된 모든 집계일을 다시 세어 MVP·페어플레이·
// 베스트플레이어 누적이 맞는지 대조하고, 어긋난 값만 보여준 뒤 한 번에 맞춘다.
// 읽기는 누를 때 컬렉션 1회 — 상시 조회가 아니라 옵트인 도구다.
import { useState } from "react";
import { auditClassStats, applyClassStatsAudit, type ClassStatsAudit } from "@/lib/aggregate";
import { useQueryClient } from "@tanstack/react-query";
import { studentById } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";

export default function BestPlayerRecalcPanel() {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<ClassStatsAudit | null>(null);

  async function check() {
    if (busy) return;
    setBusy(true);
    try {
      setAudit(await auditClassStats());
    } catch (e) {
      toast(e instanceof Error ? e.message : "검증에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!audit || busy) return;
    setBusy(true);
    try {
      await applyClassStatsAudit(audit);
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      toast(`✅ 통계 ${audit.diffs.length}건을 맞췄어요.`, "success");
      setAudit({ ...audit, diffs: [] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "보정에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const bestTotal = audit ? Object.values(audit.bestGroupWins).reduce((a, b) => a + b, 0) : 0;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h3 className="text-lg font-bold">📈 우리 반 통계 검증</h3>
      <p className="mt-1 text-[13px] text-ink-500">
        저장된 모든 집계일을 다시 세어 <b>MVP · 페어플레이 · 베스트플레이어</b> 누적이 맞는지
        확인해요. 어긋난 값이 있으면 목록으로 보여주고 한 번에 맞출 수 있어요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void check()}
          disabled={busy}
          className="press rounded-btn bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy && !audit ? "검증 중…" : "통계 검증"}
        </button>
        {audit && audit.diffs.length > 0 && (
          <button
            onClick={() => void apply()}
            disabled={busy}
            className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {audit.diffs.length}건 맞추기
          </button>
        )}
      </div>

      {audit && (
        <div className="mt-3 rounded-btn bg-ink-50 p-3 text-[13px] text-ink-700">
          <p>
            집계일 <b className="tnum">{audit.days}</b>일 확인 · 👑 베스트플레이어 총{" "}
            <b className="tnum">{bestTotal}</b>회
          </p>
          {audit.skippedAllTied > 0 && (
            <p className="mt-1 text-warn">
              ⚠️ 그중 <b className="tnum">{audit.skippedAllTied}</b>일은{" "}
              <b>전 모둠 동점이라 &apos;오늘의 모둠&apos;을 뽑지 않았어요</b> — 대개 그날 모둠
              순위를 넣지 않아 미션 점수만 남은 날이에요. 순위를 넣고 그 날짜를 재집계하면
              베스트플레이어가 쌓여요.
            </p>
          )}
          {audit.diffs.length === 0 ? (
            <p className="mt-1 font-bold text-success">✅ 누적이 모두 일치해요.</p>
          ) : (
            <ul className="mt-2 space-y-0.5">
              {audit.diffs.map((x) => (
                <li key={`${x.key}-${x.sid}`} className="flex justify-between">
                  <span>
                    {x.label} · {studentById.get(Number(x.sid))?.name ?? `?${x.sid}`}
                  </span>
                  <b className="tnum">
                    {x.now} → {x.should}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
