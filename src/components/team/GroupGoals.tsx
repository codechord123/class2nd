"use client";
// 🏆 모둠 대항전 — 모둠 기록을 '공동의 목표'로 보여주는 통계 (사용자 요청).
// 전부 이미 캐시되는 문서 재사용: 누적 점수(_cumulative) + 독서 통계 + 최근 집계일 메타.
import { students, studentById } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { weekBooks } from "@/lib/readingStreak";
import { useReadingStats } from "@/lib/query/reading";
import { useCumulativeScores, useLatestAggregated } from "@/lib/query/evaluation";

function BarRow({
  label,
  value,
  max,
  highlight,
  crown,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  highlight?: boolean;
  crown?: boolean;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`w-16 shrink-0 font-bold ${highlight ? "text-brand-strong" : "text-ink-700"}`}
      >
        {crown && "👑 "}
        {label}
        {highlight && " ★"}
      </span>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
        <span
          className={`block h-full rounded-full transition-all duration-700 ${
            crown ? "bg-warn" : highlight ? "bg-brand" : "bg-ink-300"
          }`}
          style={{ width: `${Math.max((value / Math.max(max, 1)) * 100, value > 0 ? 4 : 0)}%` }}
        />
      </span>
      <span className="tnum w-14 shrink-0 text-right font-bold text-ink-700">
        {value.toLocaleString()}
        {unit}
      </span>
    </div>
  );
}

export default function GroupGoals({ myStudentId }: { myStudentId?: number | null }) {
  const { data: cum } = useCumulativeScores();
  const { data: stats } = useReadingStats();
  const today = todayKST();
  const week = weekOfDate(today, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const { data: latestAgg } = useLatestAggregated(shiftDate(today, -1), true);

  const cumMap = (cum ?? {}) as Record<string, unknown>;
  const scoreOf = (id: number) => {
    const v = cumMap[String(id)];
    return typeof v === "number" ? v : 0;
  };

  // 현재 모둠 구성 기준 (전출 학생 제외)
  const groups = schedule.groups.map((g) => {
    const ids = [g.chair, ...g.members.map((m) => m.studentId)].filter(
      (id) => !studentById.get(id)?.inactive
    );
    return {
      groupId: g.groupId,
      ids,
      score: ids.reduce((a, id) => a + scoreOf(id), 0),
      weekBooksSum: ids.reduce((a, id) => a + weekBooks(stats, id, week), 0),
    };
  });
  const maxScore = Math.max(0, ...groups.map((g) => g.score));
  const maxBooks = Math.max(0, ...groups.map((g) => g.weekBooksSum));
  const myGroup = myStudentId
    ? groups.find((g) => g.ids.includes(myStudentId))
    : undefined;
  const leader = groups.find((g) => g.score === maxScore && maxScore > 0);
  const gap = myGroup && leader && leader.groupId !== myGroup.groupId ? leader.score - myGroup.score : 0;

  // 어제(최근 집계일)의 모둠 성적
  const yGroupSums = latestAgg?.meta.groupSums ?? {};
  const yBest = new Set(latestAgg?.meta.autoBestGroups ?? []);
  const yMission = new Set(latestAgg?.meta.missionGroups ?? []);
  const hasYesterday = Object.keys(yGroupSums).length > 0;
  const yMax = Math.max(0, ...Object.values(yGroupSums));

  const hasAny = maxScore > 0 || maxBooks > 0 || hasYesterday;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">🏆 모둠 대항전</h3>
        <span className="text-xs text-ink-400">{week}주차 모둠 기준</span>
      </div>

      {/* 우리 모둠 목표 한 줄 — 공동의 목표를 문장으로 */}
      {myGroup && (
        <p className="mt-2 rounded-btn bg-brand-weak px-3 py-2 text-sm text-brand-strong">
          {leader && leader.groupId === myGroup.groupId ? (
            <>
              👑 우리 <b>{myGroup.groupId}모둠</b>이 누적 <b>{myGroup.score}점</b>으로{" "}
              <b>선두</b>예요 — 지켜내요!
            </>
          ) : (
            <>
              🔥 우리 <b>{myGroup.groupId}모둠</b> 누적 <b>{myGroup.score}점</b> — 1위(
              {leader?.groupId}모둠)까지 <b>{gap}점</b> 남았어요. 오늘 평가·칭찬·독서로 따라잡아요!
            </>
          )}
        </p>
      )}

      {!hasAny ? (
        <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          아직 모둠 기록이 없어요 — 오늘 첫 점수를 만들어보세요!
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {/* 누적 점수 대항 */}
          <div>
            <p className="text-xs font-bold text-ink-600">🏅 누적 점수 (모둠 합계)</p>
            <div className="mt-1.5 space-y-1">
              {[...groups]
                .sort((a, b) => b.score - a.score)
                .map((g) => (
                  <BarRow
                    key={g.groupId}
                    label={`${g.groupId}모둠`}
                    value={g.score}
                    max={maxScore}
                    unit="점"
                    crown={g.score === maxScore && maxScore > 0}
                    highlight={myGroup?.groupId === g.groupId}
                  />
                ))}
            </div>
          </div>

          {/* 이번 주 독서 대항 */}
          <div>
            <p className="text-xs font-bold text-ink-600">🐢 이번 주 독서 (모둠 권수 합)</p>
            <div className="mt-1.5 space-y-1">
              {[...groups]
                .sort((a, b) => b.weekBooksSum - a.weekBooksSum)
                .map((g) => (
                  <BarRow
                    key={g.groupId}
                    label={`${g.groupId}모둠`}
                    value={g.weekBooksSum}
                    max={maxBooks}
                    unit="권"
                    crown={g.weekBooksSum === maxBooks && maxBooks > 0}
                    highlight={myGroup?.groupId === g.groupId}
                  />
                ))}
            </div>
          </div>

          {/* 최근 집계일의 모둠 성적 — 오늘의 모둠·미션 배지 */}
          {hasYesterday && latestAgg && (
            <div>
              <p className="text-xs font-bold text-ink-600">
                📅 최근 집계일 ({Number(latestAgg.date.slice(5, 7))}월{" "}
                {Number(latestAgg.date.slice(8, 10))}일) 모둠 점수
              </p>
              <div className="mt-1.5 space-y-1">
                {Object.entries(yGroupSums)
                  .sort((a, b) => b[1] - a[1])
                  .map(([g, v]) => (
                    <div key={g} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-16 shrink-0 font-bold ${
                          myGroup?.groupId === Number(g) ? "text-brand-strong" : "text-ink-700"
                        }`}
                      >
                        {yBest.has(Number(g)) && "👑 "}
                        {g}모둠
                        {myGroup?.groupId === Number(g) && " ★"}
                      </span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
                        <span
                          className={`block h-full rounded-full ${
                            yBest.has(Number(g)) ? "bg-warn" : "bg-ink-300"
                          }`}
                          style={{ width: `${Math.max((v / Math.max(yMax, 1)) * 100, v > 0 ? 4 : 0)}%` }}
                        />
                      </span>
                      <span className="tnum w-14 shrink-0 text-right font-bold text-ink-700">
                        {v}점
                      </span>
                      {yMission.has(Number(g)) && (
                        <span className="shrink-0 rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold text-pink-600">
                          🎯 미션
                        </span>
                      )}
                    </div>
                  ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                👑 = 오늘의 모둠 (그날 총점 합계 1위) · 🎯 = 칭찬 미션 달성
              </p>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink-400">
        모둠 점수는 부서장 평가·부서장 표·선생님 순위·독서·미션을 모두 합친 값이에요 — 모둠이
        같이 움직여야 올라가요! ({students.length}명 · 현재 모둠 기준)
      </p>
    </section>
  );
}
