"use client";
// 🏆 모둠 대항전 — 모둠 기록을 '공동의 목표'로 보여주는 통계 (사용자 요청).
// 전부 이미 캐시되는 문서 재사용: 누적 점수(_cumulative) + 독서 통계 + 최근 집계일 메타.
import { students, studentById } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { weekBooks } from "@/lib/readingStreak";
import { useReadingStats } from "@/lib/query/reading";
import {
  useCumulativeScores,
  useDailyScores,
  useLatestAggregated,
  type DailyMeta,
} from "@/lib/query/evaluation";
import { groupDayScore } from "@/lib/groupScore";

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
  // 오늘 집계가 이미 있으면 오늘 것을 보여준다 — 선생님이 준 오늘의 모둠 점수가
  // 다음날까지 안 보이던 문제(사용자 보고) 수정. 둘 다 Team 탭 캐시 재사용 (추가 읽기 0).
  const { data: todayScores } = useDailyScores(today);
  const todayMeta = (todayScores as { _meta?: DailyMeta } | null | undefined)?._meta;

  const cumMap = (cum ?? {}) as Record<string, unknown>;
  const scoreOf = (id: number) => {
    const v = cumMap[String(id)];
    return typeof v === "number" ? v : 0;
  };

  // 누적 모둠 점수 — 일일 모둠 점수(순위 1회 반영)의 합 (_cumulative.groupCum).
  // 아직 새 방식으로 집계된 날이 없으면 기존 지표(개인 누적 합)로 폴백.
  const groupCumMap = cumMap.groupCum as Record<string, number> | undefined;
  const useLeague = !!groupCumMap && Object.keys(groupCumMap).length > 0;

  // 현재 모둠 구성 기준 (전출 학생 제외)
  const groups = schedule.groups.map((g) => {
    const ids = [g.chair, ...g.members.map((m) => m.studentId)].filter(
      (id) => !studentById.get(id)?.inactive
    );
    return {
      groupId: g.groupId,
      ids,
      score: useLeague
        ? (groupCumMap![String(g.groupId)] ?? 0)
        : ids.reduce((a, id) => a + scoreOf(id), 0),
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

  // 최근 집계일의 모둠 성적 — 오늘 집계가 있으면 오늘, 없으면 어제 이하.
  // 점수는 저장된 groupSums 대신 행에서 실시간 재계산 (순위 1회 규칙) —
  // 규칙 변경 전에 집계된 날도 화면·분해 카드와 항상 같은 값을 보여주기 위해.
  const useToday = !!todayMeta;
  const yMeta = useToday ? todayMeta! : latestAgg?.meta;
  const yDate = useToday ? today : latestAgg?.date;
  const srcRows = (useToday ? (todayScores as Record<string, unknown>) : latestAgg?.rows) ?? null;
  const ySchedule = yDate
    ? scheduleOfWeek(weekOfDate(yDate, SEMESTER_START, TOTAL_WEEKS))
    : schedule;
  const yGroupSums: Record<string, number> = {};
  if (srcRows)
    for (const g of ySchedule.groups) {
      const ids = [g.chair, ...g.members.map((m) => m.studentId)].filter(
        (id) => !studentById.get(id)?.inactive
      );
      yGroupSums[String(g.groupId)] = groupDayScore(srcRows, ids).total;
    }
  const yMax = Math.max(0, ...Object.values(yGroupSums));
  const yBest = new Set(
    Object.entries(yGroupSums)
      .filter(([, v]) => v === yMax && yMax > 0)
      .map(([k]) => Number(k))
  );
  const yMission = new Set(yMeta?.missionGroups ?? []);
  const hasYesterday = Object.values(yGroupSums).some((v) => v !== 0);

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
          {/* 누적 점수 대항 — 새 방식: 일일 모둠 점수(순위 1회)의 누적 */}
          <div>
            <p className="text-xs font-bold text-ink-600">
              {useLeague ? "🏅 누적 모둠 점수 (일일 모둠 점수의 합)" : "🏅 누적 점수 (모둠 합계)"}
            </p>
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
            <p className="text-xs font-bold text-ink-600">
              🐢 이번 주 독서 (모둠 권수 합) —{" "}
              <span className="text-brand-strong">주 1위 모둠 전원 실버 +1!</span>
            </p>
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
          {hasYesterday && yDate && (
            <div>
              <p className="text-xs font-bold text-ink-600">
                📅 {yDate === today
                  ? "오늘"
                  : `최근 집계일 (${Number(yDate.slice(5, 7))}월 ${Number(yDate.slice(8, 10))}일)`}{" "}
                모둠 점수
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
        모둠 점수 = <b>선생님 순위(모둠당 1회) + 칭찬 미션(달성 시 +1) + 독서 + 보너스</b>.
        서로 주고받는 부서장 평가·득표·MVP는 <b>개인 점수에만</b> 들어가요 — 몰아주기로는
        모둠 순위가 안 바뀌어요! ({students.length}명 · 현재 모둠 기준)
      </p>
    </section>
  );
}
