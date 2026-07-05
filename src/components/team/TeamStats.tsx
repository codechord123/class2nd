"use client";
// 통계: ① 누적 점수 ② MVP 횟수(그날 점수 합산 모둠 1위 — 동점 포함)
//      ③ 오늘의 모둠 포함 횟수(선생님이 뽑은 오늘의 모둠에 들어간 횟수 = 팀 기여도)
// 데이터 출처는 문서 2개(_cumulative + bestGroups) + 정적 자리표 — 추가 읽기 없음.
import { students } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { weekOfDate } from "@/lib/date";
import type { BestGroups } from "@/lib/query/classMeta";

interface CumDoc {
  [sid: string]: number | Record<string, number> | undefined;
  mvpWins?: Record<string, number>;
}

function TopList({
  title,
  desc,
  counts,
  unit,
}: {
  title: string;
  desc: string;
  counts: Record<string, number>;
  unit: string;
}) {
  const ranked = students
    .map((s) => ({ name: s.name, n: counts[String(s.id)] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  return (
    <div className="rounded-btn border border-ink-200 bg-ink-50/60 p-3">
      <p className="text-[13px] font-extrabold text-ink-800">{title}</p>
      <p className="text-[11px] text-ink-500">{desc}</p>
      {ranked.length === 0 ? (
        <p className="mt-1 text-xs text-ink-400">아직 기록이 없어요</p>
      ) : (
        <ol className="mt-1.5 space-y-1 text-sm">
          {ranked.map((x, i) => (
            <li key={x.name} className="flex justify-between text-ink-800">
              <span>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {x.name}
              </span>
              <b className="tnum">
                {x.n}
                {unit}
              </b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function TeamStats({
  cumScores,
  bestGroups,
}: {
  cumScores: Record<string, unknown> | null | undefined;
  bestGroups: BestGroups | undefined;
}) {
  const cum = (cumScores ?? {}) as CumDoc;

  // 누적 점수 (숫자 필드만)
  const totals: Record<string, number> = {};
  for (const s of students) {
    const v = cum[String(s.id)];
    if (typeof v === "number") totals[String(s.id)] = v;
  }

  // 오늘의 모둠 포함 횟수: 선정된 날짜의 자리표에서 그 모둠 소속 전원 카운트
  const inBestGroup: Record<string, number> = {};
  for (const [date, v] of Object.entries(bestGroups ?? {})) {
    const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
    const g = scheduleOfWeek(week).groups.find((x) => x.groupId === v.groupId);
    if (!g) continue;
    for (const sid of [g.chair, ...g.members.map((m) => m.studentId)]) {
      inBestGroup[String(sid)] = (inBestGroup[String(sid)] ?? 0) + 1;
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h3 className="text-lg font-bold">📈 우리 반 통계</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <TopList
          title="🏅 누적 점수 TOP 5"
          desc="매일 평가 집계의 합"
          counts={totals}
          unit="점"
        />
        <TopList
          title="⭐ MVP 횟수"
          desc="그날 점수 합산 모둠 1위 (동점 포함)"
          counts={cum.mvpWins ?? {}}
          unit="회"
        />
        <TopList
          title="👑 오늘의 모둠 포함 횟수"
          desc="선생님이 뽑은 오늘의 모둠에 든 횟수 (팀 기여도)"
          counts={inBestGroup}
          unit="회"
        />
      </div>
    </section>
  );
}
