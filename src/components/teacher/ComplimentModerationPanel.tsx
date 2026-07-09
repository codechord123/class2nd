"use client";
// 💌 칭찬 점검 (교사) — 그날 칭찬을 훑어보고, 복붙·무관한 칭찬을 삭제하면 재집계로
// 칭찬 개인 점수(comp)와 팀 미션이 자동으로 되돌려진다. 같은 문구 반복은 🚩로 자동 표시.
import { useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { studentById } from "@/lib/roster";
import { aggregateDate } from "@/lib/aggregate";
import { useSettings } from "@/lib/query/settings";
import { useDailyScores, type DailyMeta } from "@/lib/query/evaluation";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedback } from "@/components/ui/Feedback";

const norm = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();

export default function ComplimentModerationPanel({ date }: { date: string }) {
  const { data: settings } = useSettings();
  const { data: dayDoc } = useDailyScores(date);
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);

  const compliments = ((dayDoc as { _meta?: DailyMeta } | null | undefined)?._meta?.compliments ??
    []) as { from: number; to: number; text: string }[];
  const name = (id: number) => studentById.get(id)?.name ?? `${id}번`;

  // 같은 사람이 여러 명에게 '같은 문구'를 쓴 경우 → 복붙 의심 🚩
  const dupKeys = new Set<string>();
  const seen = new Map<string, number>();
  for (const c of compliments) {
    const k = `${c.from}|${norm(c.text)}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) if (n >= 2) dupKeys.add(k);

  async function del(c: { from: number; to: number; text: string }) {
    const key = `${c.from}-${c.to}`;
    if (busy) return;
    setBusy(key);
    try {
      // 원본 평가 문서에서 그 칭찬을 비운다 → 집계가 '없음'으로 처리
      const evalRef = doc(db(), "evaluations", date, "entries", String(c.from));
      const patch: Record<string, unknown> = { _compliments: { [String(c.to)]: "" } };
      // 구버전 단일 칭찬(_compliment)이 같은 대상이면 함께 비운다 (신버전만 지우면 살아남음)
      const snap = await getDoc(evalRef);
      const legacy = snap.exists()
        ? (snap.data()._compliment as { to?: number } | undefined)
        : undefined;
      if (legacy && legacy.to === c.to) patch._compliment = { to: c.to, text: "" };
      await setDoc(evalRef, patch, { merge: true });
      // 재집계 → 칭찬 개인 점수·팀 미션 되돌림
      if (settings) await aggregateDate(date, settings);
      void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
      void qc.invalidateQueries({ queryKey: ["dailyScores", "_cumulative"] });
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      toast("칭찬을 삭제하고 점수를 되돌렸어요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "삭제에 실패했어요.", "error");
    } finally {
      setBusy(null);
    }
  }

  const fmt = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">💌 칭찬 점검</h3>
        <span className="text-xs text-ink-400">{fmt(date)} · 총 {compliments.length}건</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-500">
        복붙(🚩 같은 문구 반복)·무관한 칭찬을 삭제하면 <b>재집계로 점수가 되돌아가요</b>. 삭제 전
        오늘 집계가 되어 있어야 목록이 보여요.
      </p>
      {compliments.length === 0 ? (
        <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          이 날 칭찬 기록이 없어요 (집계 후 표시).
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {compliments.map((c) => {
            const dup = dupKeys.has(`${c.from}|${norm(c.text)}`);
            const short = c.text.trim().length < 10;
            const key = `${c.from}-${c.to}`;
            return (
              <li
                key={key}
                className={`flex items-start gap-2 rounded-btn px-3 py-2 text-sm ${
                  dup || short ? "bg-danger-weak/50" : "bg-ink-50"
                }`}
              >
                <span className="shrink-0 text-xs font-bold text-ink-500">
                  {name(c.from)} → {name(c.to)}
                </span>
                <span className="min-w-0 flex-1 text-ink-700 [overflow-wrap:anywhere]">
                  {(dup || short) && (
                    <span className="mr-1 font-bold text-danger">
                      {dup ? "🚩복붙" : "🚩짧음"}
                    </span>
                  )}
                  {c.text}
                </span>
                <button
                  onClick={() => void del(c)}
                  disabled={busy === key}
                  className="press shrink-0 rounded-btn border border-ink-300 bg-white px-2 py-1 text-xs font-bold text-danger disabled:opacity-50"
                >
                  {busy === key ? "…" : "삭제"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
