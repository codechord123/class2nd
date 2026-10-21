"use client";
// 🗺️ 감정 지도 (교사) — ① 한 달 히트맵(학생 × 날짜)으로 '언제 누가' 흐렸는지 한눈에,
// ② 날짜를 고르면 그날 반 전체를 모둠 자리 그대로 펼쳐 본다 (2026-10-21 사용자 요청:
// "날별로 전체 감정지도를 확인할 수 있으면 좋겠어").
// 데이터는 이미 읽은 moodHistory(+오늘 실시간 병합)뿐 — 추가 읽기 0 (모둠 배치만 캐시된 스왑 문서).
// 색은 0~5가 '나쁨↔좋음' 양극이라 발산형: 장미(나쁨)·초록(좋음) 두 색 + 가운데로 갈수록 옅게.
// 색만으로 구분하지 않도록 칸마다 얼굴 이모지를 함께 둔다.
import { useMemo, useState } from "react";
import { students, studentById } from "@/lib/roster";
import { isWeekend, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { useSchedule } from "@/lib/query/seatChange";
import { MOOD_FACES, MOOD_LABELS, type MoodHistory } from "@/lib/query/mood";
import Card from "@/components/ui/Card";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dow = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const pad = (n: number) => String(n).padStart(2, "0");

/** 0~5 → 칸 배경 (발산형: 0·1·2 장미 진→옅, 3·4·5 초록 옅→진) */
const CELL = [
  "bg-rose-500 text-white",
  "bg-rose-300",
  "bg-rose-100",
  "bg-emerald-100",
  "bg-emerald-300",
  "bg-emerald-500 text-white",
] as const;

export default function MoodMap({
  hist,
  today,
  onPick,
}: {
  hist: MoodHistory | undefined;
  today: string;
  onPick: (id: number) => void;
}) {
  const active = useMemo(() => students.filter((s) => !s.inactive), []);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);

  // 그 달 학사일(주말 제외, 오늘까지) — 기록이 있는 주말이 있으면 그날도 넣는다
  const days = useMemo(() => {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: string[] = [];
    for (let i = 1; i <= last; i++) {
      const d = `${ym}-${pad(i)}`;
      if (d > today) break;
      const has = Object.keys(hist?.byDate?.[d] ?? {}).length > 0;
      if (!isWeekend(d) || has) out.push(d);
    }
    return out;
  }, [ym, today, hist]);

  const shiftMonth = (k: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    setYm(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  // 선택한 날 — 모둠 배치는 그 주(그날 스왑 포함) 실제 자리표
  const row = hist?.byDate?.[sel] ?? {};
  const schedule = useSchedule(weekOfDate(sel, SEMESTER_START, TOTAL_WEEKS), sel);
  const vals = Object.values(row).filter((v): v is number => typeof v === "number");
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const dist = [0, 1, 2, 3, 4, 5].map((v) => vals.filter((x) => x === v).length);
  const datesWithData = useMemo(
    () => Object.keys(hist?.byDate ?? {}).filter((d) => Object.keys(hist!.byDate[d] ?? {}).length).sort(),
    [hist]
  );
  const stepDay = (k: number) => {
    const i = datesWithData.indexOf(sel);
    const next = i < 0 ? (k < 0 ? datesWithData.filter((d) => d < sel).pop() : datesWithData.find((d) => d > sel)) : datesWithData[i + k];
    if (next) {
      setSel(next);
      setYm(next.slice(0, 7));
    }
  };

  return (
    <Card
      className="lg:col-span-2"
      title="🗺️ 감정 지도"
      desc="날짜를 누르면 그날 반 전체를 모둠별로 펼쳐 봐요. 이름을 누르면 그 학생의 흐름으로 가요."
    >
      {/* ── ① 한 달 히트맵 ── */}
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => shiftMonth(-1)} className="press min-h-11 rounded-btn px-3 text-sm font-bold text-ink-500" aria-label="이전 달">
          ◀
        </button>
        <span className="text-[15px] font-bold text-ink-800">{Number(ym.slice(5, 7))}월</span>
        <button
          onClick={() => shiftMonth(1)}
          disabled={ym >= today.slice(0, 7)}
          className="press min-h-11 rounded-btn px-3 text-sm font-bold text-ink-500 disabled:opacity-30"
          aria-label="다음 달"
        >
          ▶
        </button>
      </div>

      {!days.length ? (
        <p className="mt-2 text-sm text-ink-400">이 달엔 아직 학사일이 없어요.</p>
      ) : (
        <div className="mt-1 overflow-x-auto rounded-btn border border-ink-200">
          <table className="border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-bold text-ink-500">이름</th>
                {days.map((d) => (
                  <th key={d} className="p-0">
                    <button
                      onClick={() => setSel(d)}
                      title={`${md(d)} (${dow(d)}) 감정 지도 보기`}
                      className={`press flex w-7 flex-col items-center rounded py-1 leading-tight ${
                        sel === d ? "bg-brand text-white" : d === today ? "text-brand-strong" : "text-ink-500"
                      }`}
                    >
                      <span className="tnum font-bold">{Number(d.slice(8, 10))}</span>
                      <span className="text-[9px] opacity-80">{dow(d)}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.id}>
                  <th className="sticky left-0 z-10 bg-white px-2 text-left font-bold whitespace-nowrap text-ink-700">
                    <button onClick={() => onPick(s.id)} className="press hover:text-brand-strong">
                      {s.name}
                    </button>
                  </th>
                  {days.map((d) => {
                    const v = hist?.byDate?.[d]?.[String(s.id)];
                    return (
                      <td key={d} className="p-[1px]">
                        <button
                          onClick={() => setSel(d)}
                          title={`${s.name} · ${md(d)} (${dow(d)}) · ${typeof v === "number" ? `${MOOD_FACES[v]} ${MOOD_LABELS[v]} (${v})` : "기록 없음"}`}
                          className={`grid h-6 w-7 place-items-center rounded-[4px] text-[12px] leading-none ${
                            typeof v === "number" ? CELL[v] : "bg-ink-50 text-ink-300"
                          } ${sel === d ? "ring-1 ring-brand" : ""}`}
                        >
                          {typeof v === "number" ? MOOD_FACES[v] : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 범례 — 색과 얼굴을 함께 */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
        {MOOD_FACES.map((f, v) => (
          <span key={v} className="inline-flex items-center gap-1">
            <span className={`grid h-5 w-6 place-items-center rounded-[4px] text-[11px] ${CELL[v]}`}>{f}</span>
            {v}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="grid h-5 w-6 place-items-center rounded-[4px] bg-ink-50 text-ink-300">·</span>기록 없음
        </span>
      </div>

      {/* ── ② 그날의 반 전체 지도 (모둠별) ── */}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => stepDay(-1)} className="press min-h-11 rounded-btn bg-ink-100 px-3 text-sm font-bold text-ink-600" aria-label="이전 기록일">
            ◀
          </button>
          <input
            type="date"
            value={sel}
            max={today}
            onChange={(e) => {
              if (!e.target.value) return;
              setSel(e.target.value);
              setYm(e.target.value.slice(0, 7));
            }}
            className="min-h-11 rounded-btn border border-ink-300 px-2 text-sm"
          />
          <button onClick={() => stepDay(1)} className="press min-h-11 rounded-btn bg-ink-100 px-3 text-sm font-bold text-ink-600" aria-label="다음 기록일">
            ▶
          </button>
          <span className="text-[15px] font-bold text-ink-900">
            {md(sel)} ({dow(sel)}){sel === today && " · 오늘"}
          </span>
        </div>

        {!vals.length ? (
          <p className="mt-3 rounded-btn bg-ink-50 px-3 py-3 text-sm text-ink-500">이 날은 기분 기록이 없어요.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-700">
              반 평균 <b className="tnum">{avg!.toFixed(1)}</b> / 5 · 기록{" "}
              <b className="tnum">
                {vals.length}/{active.length}
              </b>
              명
              <span className="ml-2 text-ink-500">
                {[5, 4, 3, 2, 1, 0]
                  .filter((v) => dist[v])
                  .map((v) => `${MOOD_FACES[v]}${dist[v]}`)
                  .join("  ")}
              </span>
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {schedule.groups.map((g) => {
                const ids = [g.chair, ...g.members.map((m) => m.studentId)].filter(
                  (id) => !studentById.get(id)?.inactive
                );
                const gv = ids.map((id) => row[String(id)]).filter((v): v is number => typeof v === "number");
                const gAvg = gv.length ? gv.reduce((a, b) => a + b, 0) / gv.length : null;
                return (
                  <div key={g.groupId} className="rounded-card border border-ink-200 p-2.5">
                    <p className="flex items-baseline justify-between text-xs font-bold text-ink-600">
                      {g.groupId}모둠
                      <span className="tnum font-normal text-ink-400">{gAvg == null ? "–" : `평균 ${gAvg.toFixed(1)}`}</span>
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {ids.map((id) => {
                        const v = row[String(id)];
                        const has = typeof v === "number";
                        return (
                          <li key={id}>
                            <button
                              onClick={() => onPick(id)}
                              title={has ? `${MOOD_LABELS[v]} (${v})` : "기록 없음"}
                              className={`press flex w-full items-center justify-between rounded-btn px-2 py-1 text-[13px] font-bold ${
                                has ? CELL[v] : "bg-ink-50 text-ink-400"
                              }`}
                            >
                              <span>{nm(id)}</span>
                              <span className="text-base leading-none">{has ? MOOD_FACES[v] : "—"}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

