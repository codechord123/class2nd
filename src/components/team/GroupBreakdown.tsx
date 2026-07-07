"use client";
// 🔍 모둠 점수 분해 — 각 모둠이 '어떤 항목으로' 점수를 받았는지 (사용자 요청: 개인 분해처럼).
// 오늘 집계가 있으면 오늘, 없으면 최근 집계일 — Team 탭이 이미 캐시하는 문서 2개 재사용 (추가 읽기 0).
import { studentById } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { useDailyScores, useLatestAggregated } from "@/lib/query/evaluation";
import type { DailyScoreRow } from "@/types";

const PARTS: { key: keyof DailyScoreRow; icon: string; label: string }[] = [
  { key: "peer", icon: "🤝", label: "모둠 평가" },
  { key: "groupRank", icon: "🏆", label: "선생님 순위" },
  { key: "mission", icon: "💌", label: "칭찬 미션" },
  { key: "boss", icon: "👑", label: "부서장 득표" },
  { key: "mvp", icon: "⭐", label: "MVP" },
  { key: "read", icon: "🐢", label: "독서" },
  { key: "bonus", icon: "🎁", label: "보너스" },
];

export default function GroupBreakdown({
  myStudentId,
  date: dateProp,
}: {
  myStudentId?: number | null;
  date?: string; // 지정 시 그 날짜 고정 (교사 날짜별 보기) — 미지정 시 오늘→최근 집계일
}) {
  const today = todayKST();
  const target = dateProp ?? today;
  const { data: targetScores } = useDailyScores(target);
  const { data: latestAgg } = useLatestAggregated(shiftDate(today, -1), !dateProp);

  // 대상 날짜 집계 문서가 있으면 그것을, (오늘 모드에서) 없으면 최근 집계일로 폴백
  const targetHasRows =
    targetScores != null && Object.keys(targetScores).some((k) => /^\d+$/.test(k));
  const rows = (targetHasRows ? targetScores : dateProp ? null : latestAgg?.rows) as
    | Record<string, unknown>
    | null
    | undefined;
  const date = targetHasRows ? target : dateProp ? null : latestAgg?.date;
  if (!rows || !date) {
    // 날짜를 직접 고른 경우엔 침묵 대신 빈 상태를 보여준다 (탐색 피드백)
    if (dateProp)
      return (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <h3 className="text-lg font-bold">🔍 모둠 점수, 어디서 왔을까?</h3>
          <p className="mt-2 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
            {Number(dateProp.slice(5, 7))}월 {Number(dateProp.slice(8, 10))}일에는 집계 기록이
            없어요.
          </p>
        </section>
      );
    return null;
  }

  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const rowOf = (id: number) => rows[String(id)] as DailyScoreRow | undefined;

  const groups = schedule.groups.map((g) => {
    const ids = [g.chair, ...g.members.map((m) => m.studentId)].filter(
      (id) => !studentById.get(id)?.inactive
    );
    const sums: Record<string, number> = {};
    let total = 0;
    for (const p of PARTS) sums[p.key] = 0;
    for (const id of ids) {
      const r = rowOf(id);
      if (!r) continue;
      for (const p of PARTS) sums[p.key] += (r[p.key] as number | undefined) ?? 0;
      total += r.total ?? 0;
    }
    return { groupId: g.groupId, ids, sums, total };
  });
  if (groups.every((g) => g.total === 0) && !dateProp) return null;

  const fmtDay = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
  const isToday = date === today;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">🔍 모둠 점수, 어디서 왔을까?</h3>
        <span className="text-xs text-ink-400">
          {isToday ? "오늘" : `최근 집계일 ${fmtDay}`} 기준
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {[...groups]
          .sort((a, b) => b.total - a.total)
          .map((g) => {
            const mine = myStudentId != null && g.ids.includes(myStudentId);
            return (
              <div
                key={g.groupId}
                className={`rounded-btn p-2.5 ${mine ? "bg-brand-weak/50" : "bg-ink-50"}`}
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-bold text-ink-800">
                    {g.groupId}모둠{mine && " ★"}
                  </p>
                  <p className="text-xs text-ink-500">
                    합계 <b className="tnum text-sm text-ink-900">{g.total}</b>점
                  </p>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {PARTS.map((p) => {
                    const v = g.sums[p.key];
                    return (
                      <span
                        key={p.key}
                        className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                          v > 0
                            ? "bg-white text-brand-strong"
                            : v < 0
                              ? "bg-danger-weak text-danger"
                              : "bg-white/60 text-ink-300"
                        }`}
                      >
                        {p.icon} {p.label} <b className="tnum">{v > 0 ? `+${v}` : v}</b>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        모둠원 점수를 항목별로 합친 값이에요 — 어떤 활동이 모둠 점수를 만들었는지 볼 수 있어요.
      </p>
    </section>
  );
}
