"use client";
// 💌 받은 마음 — 친구들이 나에게 준 칭찬·건의를 날짜별로 모아 보기 (사용자 요청).
// 집계 문서(_meta)의 칭찬·건의 배열 재사용 — 기본은 최근 집계일(오늘 우선),
// ◀ ▶ 로 하루씩 이동 (날짜당 문서 1개, 캐시 — 읽기 예산 안).
import { useState } from "react";
import { studentById } from "@/lib/roster";
import { shiftDate, todayKST } from "@/lib/date";
import { useDailyScores, useLatestAggregated, type DailyMeta } from "@/lib/query/evaluation";

export default function ReceivedNotes({ studentId }: { studentId: number }) {
  const today = todayKST();
  const [sel, setSel] = useState<string | null>(null); // null = 자동 (오늘 → 최근 집계일)
  const { data: todayScores } = useDailyScores(today);
  const { data: latestAgg } = useLatestAggregated(shiftDate(today, -1), true);
  const autoDate = (todayScores as { _meta?: DailyMeta } | null | undefined)?._meta
    ? today
    : (latestAgg?.date ?? today);
  const date = sel ?? autoDate;
  const { data: dayDoc } = useDailyScores(date);
  const meta = (dayDoc as { _meta?: DailyMeta } | null | undefined)?._meta;

  const comps = (meta?.compliments ?? []).filter((c) => c.to === studentId);
  const sugs = (meta?.peerSuggestions ?? []).filter((s) => s.to === studentId);
  const nm = (id: number) => studentById.get(id)?.name ?? "?";
  const fmt = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">💌 받은 마음</h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSel(shiftDate(date, -1))}
            className="press rounded-btn bg-ink-100 px-2.5 py-1.5 text-sm font-bold text-ink-600"
            aria-label="하루 전"
          >
            ◀
          </button>
          <span className="tnum min-w-20 text-center text-sm font-bold text-ink-700">{fmt}</span>
          <button
            onClick={() => setSel(shiftDate(date, 1))}
            disabled={date >= today}
            className="press rounded-btn bg-ink-100 px-2.5 py-1.5 text-sm font-bold text-ink-600 disabled:opacity-30"
            aria-label="하루 후"
          >
            ▶
          </button>
          {sel !== null && sel !== autoDate && (
            <button
              onClick={() => setSel(null)}
              className="press rounded-btn bg-brand-weak px-2.5 py-1.5 text-xs font-bold text-brand-strong"
            >
              최근으로
            </button>
          )}
        </div>
      </div>

      {!meta ? (
        <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          이 날은 집계 기록이 없어요.
        </p>
      ) : comps.length === 0 && sugs.length === 0 ? (
        <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          이 날 받은 칭찬·건의가 없어요 — 내일의 주인공은 나!
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {comps.length > 0 && (
            <div>
              <p className="text-xs font-bold text-pink-600">💌 받은 칭찬 ({comps.length})</p>
              <ul className="mt-1.5 space-y-1.5">
                {comps.map((c, i) => (
                  <li key={i} className="rounded-btn bg-pink-50 px-3 py-2 text-sm text-ink-800">
                    <b className="text-pink-700">{nm(c.from)}</b> · {c.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sugs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-brand-strong">🙋 받은 건의 ({sugs.length})</p>
              <ul className="mt-1.5 space-y-1.5">
                {sugs.map((s, i) => (
                  <li key={i} className="rounded-btn bg-brand-weak/50 px-3 py-2 text-sm text-ink-800">
                    <b className="text-brand-strong">{nm(s.from)}</b> · {s.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink-400">
        칭찬·건의는 선생님 집계 후에 보여요 — ◀ ▶ 로 지난 날짜도 볼 수 있어요.
      </p>
    </section>
  );
}
