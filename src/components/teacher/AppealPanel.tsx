"use client";
// 🙋 점수 이의제기 검토 (교사) — 학생이 받은 부서장 평가에 낸 이의제기를 확인하고,
// 합당하면 점수를 조정(addBonus)하거나 반려한다. 조정은 그 집계일의 보너스로 더해 누적에 반영.
import { useState } from "react";
import { studentById } from "@/lib/roster";
import { addBonus } from "@/lib/aggregate";
import { useAllAppeals, useResolveAppeal } from "@/lib/query/appeals";
import { useFeedback } from "@/components/ui/Feedback";

export default function AppealPanel() {
  const [open, setOpen] = useState(false);
  const { data: appeals, isFetching, refetch } = useAllAppeals(open);
  const resolve = useResolveAppeal();
  const { toast } = useFeedback();
  const [note, setNote] = useState<Record<string, string>>({});
  const [delta, setDelta] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const name = (id: number) => studentById.get(id)?.name ?? `${id}번`;
  const fmt = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  const pending = (appeals ?? []).filter((a) => a.status === "pending");
  const done = (appeals ?? []).filter((a) => a.status !== "pending");

  async function act(a: (typeof pending)[number], kind: "resolve" | "reject") {
    if (busy) return;
    const memo = (note[a.id] ?? "").trim();
    if (kind === "reject" && !memo) {
      toast("반려 사유를 적어주세요.", "warn");
      return;
    }
    setBusy(a.id);
    try {
      if (kind === "resolve") {
        const d = delta[a.id] ?? 0;
        if (d !== 0) await addBonus(a.date, a.studentId, d); // 그날 보너스로 조정 → 누적 반영
        await resolve.mutateAsync({ id: a.id, status: "resolved", teacherNote: memo, delta: d });
        toast(`조정 완료 (${d >= 0 ? "+" : ""}${d}점).`, "success");
      } else {
        await resolve.mutateAsync({ id: a.id, status: "rejected", teacherNote: memo });
        toast("반려했어요.");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "처리에 실패했어요.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">
          🙋 점수 이의제기
          {pending.length > 0 && (
            <span className="ml-1.5 rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">
              {pending.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => (open ? refetch() : setOpen(true))}
          className="press rounded-btn bg-ink-100 px-3 py-1.5 text-sm font-bold text-ink-600"
        >
          {isFetching ? "불러오는 중…" : open ? "새로고침" : "이의제기 확인"}
        </button>
      </div>
      <p className="mt-1 text-[13px] text-ink-500">
        학생이 받은 부서장 평가에 낸 이의제기예요. 사실을 확인하고 조정(±점)하거나 반려해요.
      </p>

      {open && pending.length === 0 && (
        <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          대기 중인 이의제기가 없어요 👍
        </p>
      )}

      {pending.map((a) => (
        <div key={a.id} className="mt-3 rounded-btn border border-warn/40 bg-warn-weak/40 p-3">
          <p className="text-sm font-bold text-ink-800">
            {name(a.studentId)}{" "}
            <span className="text-xs font-normal text-ink-500">
              · {fmt(a.date)} · {a.from != null ? `${name(a.from)}(${a.dept}) 평가` : "점수"}
            </span>
          </p>
          <p className="mt-1 rounded-btn bg-white px-3 py-2 text-sm text-ink-700 [overflow-wrap:anywhere]">
            💬 {a.reason}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              value={note[a.id] ?? ""}
              onChange={(e) => setNote({ ...note, [a.id]: e.target.value })}
              placeholder="처리 메모 (학생에게 회신)"
              className="min-w-0 flex-1 rounded-btn border border-ink-300 px-2.5 py-1.5 text-sm"
            />
            <div className="flex items-center gap-1 rounded-btn border border-ink-300 bg-white px-2 py-1">
              <span className="text-xs text-ink-500">조정</span>
              <button
                onClick={() => setDelta({ ...delta, [a.id]: (delta[a.id] ?? 0) - 1 })}
                className="press px-1.5 text-sm font-bold text-ink-600"
              >
                −
              </button>
              <span className="tnum w-6 text-center text-sm font-bold">{delta[a.id] ?? 0}</span>
              <button
                onClick={() => setDelta({ ...delta, [a.id]: (delta[a.id] ?? 0) + 1 })}
                className="press px-1.5 text-sm font-bold text-ink-600"
              >
                +
              </button>
            </div>
            <button
              onClick={() => void act(a, "resolve")}
              disabled={busy === a.id}
              className="press rounded-btn bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              조정·완료
            </button>
            <button
              onClick={() => void act(a, "reject")}
              disabled={busy === a.id}
              className="press rounded-btn border border-ink-300 bg-white px-3 py-1.5 text-xs font-bold text-ink-500 disabled:opacity-50"
            >
              반려
            </button>
          </div>
        </div>
      ))}

      {open && done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-ink-400">
            처리된 이의제기 {done.length}건
          </summary>
          <ul className="mt-2 space-y-1">
            {done.map((a) => (
              <li key={a.id} className="rounded-btn bg-ink-50 px-3 py-1.5 text-xs text-ink-600">
                <b>{name(a.studentId)}</b> · {fmt(a.date)} ·{" "}
                {a.status === "resolved" ? (
                  <span className="text-success">조정 {a.delta ? `${a.delta >= 0 ? "+" : ""}${a.delta}점` : ""}</span>
                ) : (
                  <span className="text-ink-400">반려</span>
                )}
                {a.teacherNote ? ` — ${a.teacherNote}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
