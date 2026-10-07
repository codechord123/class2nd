"use client";
// 📊 감정 통계 (교사) — 이미 읽어 둔 moodHistory 하나로 전부 계산한다 (추가 읽기 0).
// 목적은 '평균 구경'이 아니라 '변화가 생긴 아이를 빨리 찾기'다 — 그래서 변화 감지를 맨 위에.
// 단일 값은 장난일 수 있으므로 모든 판정은 최근 여러 번의 '평균 차이'·'흔들림'으로 한다.
import { useMemo, useState } from "react";
import { students, studentById } from "@/lib/roster";
import { shiftDate, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { useSchedule } from "@/lib/query/seatChange";
import { MOOD_FACES, recentMoods, type MoodHistory } from "@/lib/query/mood";
import Card from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const fmtDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** 최근 5번 평균이 그 전 5번보다 이만큼 움직이면 '변화'로 본다 */
const SHIFT = 1.2;
/** 최근 10번 표준편차가 이 이상이면 '기복이 큼' */
const SWING = 1.5;

type Range = "4w" | "all";

function Chip({ id, onPick, children }: { id: number; onPick: (id: number) => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => onPick(id)}
      className="press rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink-700 ring-1 ring-ink-200"
    >
      {nm(id)} <span className="tnum font-normal text-ink-500">{children}</span>
    </button>
  );
}

export default function MoodStats({
  hist,
  today,
  onPick,
}: {
  hist: MoodHistory | undefined;
  today: string;
  onPick: (id: number) => void;
}) {
  const [range, setRange] = useState<Range>("4w");
  const active = useMemo(() => students.filter((s) => !s.inactive), []);
  const week = weekOfDate(today, SEMESTER_START, TOTAL_WEEKS);
  const schedule = useSchedule(week, today);

  const from = range === "4w" ? shiftDate(today, -27) : "0000-00-00";
  const days = useMemo(
    () =>
      Object.entries(hist?.byDate ?? {})
        .filter(([d, row]) => d >= from && d <= today && Object.keys(row ?? {}).length)
        .sort(([a], [b]) => a.localeCompare(b)),
    [hist, from, today]
  );

  const s = useMemo(() => {
    const series = days.map(([date, row]) => {
      const vs = Object.values(row);
      return { date, avg: mean(vs), n: vs.length };
    });
    const dist = [0, 0, 0, 0, 0, 0];
    const byDow: number[][] = [[], [], [], [], [], [], []];
    for (const [date, row] of days) {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      for (const v of Object.values(row)) {
        dist[v] = (dist[v] ?? 0) + 1;
        byDow[dow].push(v);
      }
    }
    const response = series.length ? mean(series.map((x) => x.n)) / Math.max(1, active.length) : 0;

    // 변화 감지 — 학생별 최근 기록(기간과 무관하게 '최근 흐름')
    const falling: { id: number; before: number; now: number }[] = [];
    const rising: { id: number; before: number; now: number }[] = [];
    const swinging: { id: number; sd: number }[] = [];
    for (const st of active) {
      const r = recentMoods(hist, st.id, 10).map((x) => x.v);
      const now = r.slice(-5);
      const before = r.slice(0, -5);
      if (now.length >= 3 && before.length >= 3) {
        const d = mean(now) - mean(before);
        if (d <= -SHIFT) falling.push({ id: st.id, before: mean(before), now: mean(now) });
        if (d >= SHIFT) rising.push({ id: st.id, before: mean(before), now: mean(now) });
      }
      if (r.length >= 5) {
        const m = mean(r);
        const sd = Math.sqrt(mean(r.map((v) => (v - m) ** 2)));
        if (sd >= SWING) swinging.push({ id: st.id, sd });
      }
    }
    falling.sort((a, b) => a.now - a.before - (b.now - b.before));
    rising.sort((a, b) => b.now - b.before - (a.now - a.before));
    swinging.sort((a, b) => b.sd - a.sd);
    return { series, dist, byDow, response, falling, rising, swinging };
  }, [days, hist, active]);

  // 이번 주 모둠별 평균 — 모둠은 2주마다 바뀌므로 기간 평균이 아니라 '이번 주'만 의미가 있다
  const groupAvg = useMemo(() => {
    const ws = schedule.weekStart;
    const rows = Object.entries(hist?.byDate ?? {}).filter(([d]) => d >= ws && d <= today);
    return schedule.groups.map((g) => {
      const ids = [g.chair, ...g.members.map((m) => m.studentId)];
      const vs = rows.flatMap(([, row]) =>
        ids.map((id) => row[String(id)]).filter((v): v is number => typeof v === "number")
      );
      return { groupId: g.groupId, avg: vs.length ? mean(vs) : null, n: vs.length };
    });
  }, [hist, schedule, today]);

  const totalVotes = s.dist.reduce((a, b) => a + b, 0);

  // 꺾은선 — 0~5 축, 반 평균. 점 위에 마우스를 올리면 날짜·인원
  const W = 600;
  const H = 150;
  const P = 14;
  const xs = (i: number) => P + (s.series.length <= 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (s.series.length - 1));
  const ys = (v: number) => H - P - (v / 5) * (H - 2 * P);
  const path = s.series.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(p.avg).toFixed(1)}`).join(" ");

  return (
    <Card
      title="📊 감정 통계"
      desc="반 전체 흐름과 '변화가 생긴 아이'를 찾아줘요. 이름을 누르면 아래 학생별 돌아보기가 열려요."
    >
      <div className="mt-3">
        <SegmentedControl
          tabs={[
            { key: "4w", label: "최근 4주" },
            { key: "all", label: "학기 전체" },
          ]}
          active={range}
          onChange={setRange}
        />
      </div>

      {!s.series.length ? (
        <p className="mt-3 text-sm text-ink-400">이 기간엔 아직 기록이 없어요.</p>
      ) : (
        <>
          {/* 1) 변화 감지 — 가장 먼저 봐야 할 것 */}
          <div className="mt-3 space-y-2">
            {s.falling.length > 0 && (
              <div className="rounded-btn bg-rose-50 p-3 ring-1 ring-rose-200">
                <p className="text-xs font-bold text-rose-800">📉 요즘 떨어진 친구 — 최근 5번 평균이 그 전보다 {SHIFT}↓</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.falling.map((x) => (
                    <Chip key={x.id} id={x.id} onPick={onPick}>
                      {x.before.toFixed(1)}→{x.now.toFixed(1)}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {s.swinging.length > 0 && (
              <div className="rounded-btn bg-amber-50 p-3 ring-1 ring-amber-200">
                <p className="text-xs font-bold text-amber-800">🎢 기복이 큰 친구 — 최근 10번이 크게 오르내려요</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.swinging.map((x) => (
                    <Chip key={x.id} id={x.id} onPick={onPick}>
                      ±{x.sd.toFixed(1)}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {s.rising.length > 0 && (
              <div className="rounded-btn bg-emerald-50 p-3 ring-1 ring-emerald-200">
                <p className="text-xs font-bold text-emerald-800">📈 좋아진 친구 — 알아봐 주면 힘이 돼요</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.rising.map((x) => (
                    <Chip key={x.id} id={x.id} onPick={onPick}>
                      {x.before.toFixed(1)}→{x.now.toFixed(1)}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {!s.falling.length && !s.swinging.length && !s.rising.length && (
              <p className="rounded-btn bg-ink-50 px-3 py-2 text-xs text-ink-500">
                눈에 띄는 변화는 없어요. (기록이 6번 이상 쌓인 아이부터 변화를 판정해요)
              </p>
            )}
          </div>

          {/* 2) 반 평균 추이 */}
          <p className="mt-4 text-[13px] font-bold text-ink-700">
            반 평균 추이{" "}
            <span className="font-normal text-ink-400">
              · 평균 응답률 <b className="tnum">{Math.round(s.response * 100)}%</b>
            </span>
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full rounded-btn bg-ink-50" role="img" aria-label="반 평균 추이">
            {[1, 2, 3, 4].map((v) => (
              <line key={v} x1={P} x2={W - P} y1={ys(v)} y2={ys(v)} className="stroke-ink-200" strokeWidth={1} />
            ))}
            <line x1={P} x2={W - P} y1={ys(2.5)} y2={ys(2.5)} className="stroke-ink-300" strokeDasharray="3 3" />
            <path d={path} fill="none" className="stroke-brand" strokeWidth={2} strokeLinejoin="round" />
            {s.series.map((p, i) => (
              <circle key={p.date} cx={xs(i)} cy={ys(p.avg)} r={3} className={p.avg <= 2 ? "fill-rose-500" : "fill-brand"}>
                <title>{`${fmtDay(p.date)} 평균 ${p.avg.toFixed(1)} · ${p.n}명`}</title>
              </circle>
            ))}
          </svg>
          <div className="flex justify-between text-[10px] text-ink-400 tnum">
            <span>{fmtDay(s.series[0].date)}</span>
            <span>{fmtDay(s.series[s.series.length - 1].date)}</span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* 3) 요일별 평균 */}
            <div>
              <p className="text-[13px] font-bold text-ink-700">요일별 평균</p>
              <div className="mt-1.5 flex items-end gap-1.5">
                {[1, 2, 3, 4, 5].map((dow) => {
                  const m = mean(s.byDow[dow]);
                  return (
                    <div key={dow} className="flex flex-1 flex-col items-center gap-1">
                      <span className="tnum text-[11px] font-bold text-ink-600">
                        {Number.isNaN(m) ? "–" : m.toFixed(1)}
                      </span>
                      <span
                        className={`w-full rounded-t ${Number.isNaN(m) ? "bg-ink-100" : m <= 2.5 ? "bg-amber-300" : "bg-brand/60"}`}
                        style={{ height: `${Number.isNaN(m) ? 4 : 6 + m * 12}px` }}
                      />
                      <span className="text-[11px] text-ink-500">{DOW[dow]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4) 분포 */}
            <div>
              <p className="text-[13px] font-bold text-ink-700">고른 기분 분포</p>
              <div className="mt-1.5 space-y-1">
                {[5, 4, 3, 2, 1, 0].map((v) => (
                  <div key={v} className="flex items-center gap-1.5">
                    <span className="w-5 text-center text-sm leading-none">{MOOD_FACES[v]}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <span
                        className={`block h-full ${v <= 1 ? "bg-rose-400" : v <= 2 ? "bg-amber-400" : "bg-emerald-400"}`}
                        style={{ width: `${totalVotes ? (s.dist[v] / totalVotes) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="tnum w-8 text-right text-[11px] text-ink-500">
                      {totalVotes ? Math.round((s.dist[v] / totalVotes) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 5) 이번 주 모둠별 */}
      <p className="mt-4 text-[13px] font-bold text-ink-700">
        이번 주 모둠별 평균 <span className="font-normal text-ink-400">— 모둠 분위기 살피기</span>
      </p>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
        {groupAvg.map((g) => (
          <div
            key={g.groupId}
            className={`rounded-btn p-2 text-center ring-1 ${
              g.avg == null
                ? "bg-ink-50 ring-ink-200"
                : g.avg <= 2.5
                  ? "bg-amber-50 ring-amber-200"
                  : "bg-white ring-ink-200"
            }`}
          >
            <p className="text-[11px] font-bold text-ink-500">{g.groupId}모둠</p>
            <p className="tnum text-[15px] font-extrabold text-ink-800">{g.avg == null ? "–" : g.avg.toFixed(1)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
