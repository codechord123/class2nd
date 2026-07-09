"use client";
// 🤝 받은 부서장 평가 — 누가(실명) 내 어떤 기준을 O/X 했는지, 그래서 몇 점인지 보여준다.
// 억울하면 이의제기(사유) → 교사 검토. 캐시된 집계 문서(_meta.peerDetail) 재사용(추가 읽기 0).
import { useState } from "react";
import { studentById } from "@/lib/roster";
import { shiftDate, todayKST } from "@/lib/date";
import { useDailyScores, useLatestAggregated, type DailyMeta } from "@/lib/query/evaluation";
import { usePeerCriteria } from "@/lib/query/classMeta";
import { useCreateAppeal, useMyAppeals } from "@/lib/query/appeals";
import { useFeedback } from "@/components/ui/Feedback";
import type { RoleKey } from "@/types";

type PeerItem = { from: number; dept: string; checks: boolean[]; score: number };

export default function ReceivedPeerEval({
  studentId,
  readOnly,
}: {
  studentId: number;
  readOnly?: boolean; // 교사가 학생 화면을 열람할 때는 이의제기 버튼 숨김
}) {
  const today = todayKST();
  const { data: todayScores } = useDailyScores(today);
  const { data: latestAgg } = useLatestAggregated(shiftDate(today, -1), true);
  const { data: criteria } = usePeerCriteria();
  const { data: myAppeals } = useMyAppeals(readOnly ? null : studentId);
  const createAppeal = useCreateAppeal(studentId);
  const { toast } = useFeedback();
  const [openFrom, setOpenFrom] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const sid = String(studentId);
  const todayMeta = (todayScores as { _meta?: DailyMeta } | null | undefined)?._meta;
  const hasToday = !!todayMeta?.peerDetail?.[sid];
  const meta = hasToday ? todayMeta : latestAgg?.meta;
  const date = hasToday ? today : latestAgg?.date;
  const items = (meta?.peerDetail?.[sid] ?? []) as PeerItem[];

  if (!items.length || !date) return null;

  const fmtDay = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  const appealedFroms = new Set((myAppeals ?? []).filter((a) => a.date === date).map((a) => a.from));

  async function submitAppeal(from: number, dept: string) {
    if (busy) return;
    if (!reason.trim()) {
      toast("이의제기 사유를 적어주세요.", "warn");
      return;
    }
    setBusy(true);
    try {
      await createAppeal({ date: date!, from, dept, reason });
      setOpenFrom(null);
      setReason("");
      toast("이의제기를 접수했어요 — 선생님이 확인할 거예요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "접수에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">🤝 받은 부서장 평가</h3>
        <span className="text-xs text-ink-400">{fmtDay(date)}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-600">
        친구들이 나를 <b>자기 부서 기준</b>으로 이렇게 평가했어요. 사실과 다르면{" "}
        {readOnly ? "학생이 이의제기할 수 있어요." : "이의제기해요 — 선생님이 확인해요."}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => {
          const deptCriteria = criteria?.[it.dept as RoleKey] ?? [];
          const already = appealedFroms.has(it.from);
          return (
            <li key={it.from} className="rounded-btn bg-ink-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink-800">
                  {studentById.get(it.from)?.name ?? "?"}
                  <span className="ml-1 text-xs font-normal text-ink-500">{it.dept} 부서장</span>
                </span>
                <span
                  className={`tnum rounded-full px-2 py-0.5 text-xs font-bold ${
                    it.score > 0
                      ? "bg-success text-white"
                      : it.score < 0
                        ? "bg-danger text-white"
                        : "bg-ink-200 text-ink-600"
                  }`}
                >
                  {it.score > 0 ? `+${it.score}` : it.score}점
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {it.checks.map((ok, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-[13px] text-ink-700">
                    <span className={ok ? "text-success" : "text-danger"}>{ok ? "⭕" : "❌"}</span>
                    <span className="[overflow-wrap:anywhere]">{deptCriteria[i] ?? `기준 ${i + 1}`}</span>
                  </p>
                ))}
              </div>
              {!readOnly &&
                (already ? (
                  <p className="mt-1.5 text-[11px] font-bold text-brand">✓ 이의제기 접수됨</p>
                ) : openFrom === it.from ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing)
                          void submitAppeal(it.from, it.dept);
                      }}
                      autoFocus
                      placeholder="예: 저 오늘 숙제 했어요 (사실을 적어요)"
                      className="min-w-0 flex-1 rounded-btn border border-ink-300 bg-white px-2.5 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => void submitAppeal(it.from, it.dept)}
                      disabled={busy}
                      className="press shrink-0 rounded-btn bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      제출
                    </button>
                    <button
                      onClick={() => setOpenFrom(null)}
                      className="shrink-0 text-xs text-ink-400"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setOpenFrom(it.from);
                      setReason("");
                    }}
                    className="mt-1.5 text-[11px] font-bold text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline"
                  >
                    🙋 이의제기
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
