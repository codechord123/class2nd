"use client";
// 홈 '내 현황' + 학급 스코어보드 — 이미 캐시되는 문서만 재사용 (추가 읽기 0).
// 레드팀 결론: 홈에 '살아있는 숫자'가 없다 → 목표(배너) 다음에 현재(숫자)를 배치.
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { useBalances } from "@/lib/query/wallet";
import { useCumulativeScores } from "@/lib/query/evaluation";
import { getS1WalletOf, s1ClassGoldRemaining, s1TotalBooks } from "@/lib/staticData";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS, currentWeekNum } from "@/lib/schedule";
import { groupOf, roleOf } from "@/lib/schedule";

import StatCard from "@/components/ui/StatCard";

// 도메인 톤 → StatCard 토큰 톤 매핑
type Legacy = "slate" | "emerald" | "indigo" | "amber";
const toneMap: Record<Legacy, "neutral" | "brand" | "success" | "warn"> = {
  slate: "neutral",
  emerald: "success",
  indigo: "brand",
  amber: "warn",
};
function Stat({ label, value, sub, tone = "slate" }: { label: string; value: React.ReactNode; sub?: string; tone?: Legacy }) {
  return <StatCard label={label} value={value} sub={sub} tone={toneMap[tone]} />;
}

export default function MyStatus() {
  const { role, studentId } = useSession();
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();
  const { data: s2Bal } = useBalances("s2");
  const { data: s1Used } = useBalances("s1");
  const { data: cum } = useCumulativeScores();

  const week = weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);
  const quota = settings?.weeklyReadingQuota ?? 3;

  // 학급 스코어보드 (전원 공통)
  const s2Total = Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const classTotalBooks = s1TotalBooks + s2Total;
  const goldLeft = s1ClassGoldRemaining - ((s1Used?.classGoldUsed as number | undefined) ?? 0);
  const classScore = Object.entries((cum ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => /^\d+$/.test(k) && typeof v === "number")
    .reduce((a, [, v]) => a + (v as number), 0);

  const classBoard = (
    <section className="grid grid-cols-3 gap-2">
      <Stat label="🐢 학급 총 권수" value={classTotalBooks} sub={`2학기 +${s2Total}`} tone="emerald" />
      <Stat label="🏅 학급 총점" value={classScore} tone="indigo" />
      <Stat label="🥇 골드토큰" value={goldLeft} sub="학급 공용" tone="amber" />
    </section>
  );

  if (role !== "student" || !studentId) return classBoard;

  // 내 현황 (학생)
  const myWeekRead = stats?.byWeek?.[String(week)]?.[String(studentId)] ?? 0;
  const mySilver = s2Bal?.[String(studentId)] ?? 0;
  const myCarry =
    (getS1WalletOf(studentId)?.silverRemaining ?? 0) -
    ((s1Used?.[String(studentId)] as number | undefined) ?? 0);
  const myScore = ((cum ?? {}) as Record<string, unknown>)[String(studentId)];
  const nowWeek = currentWeekNum();
  const myGroup = groupOf(nowWeek, studentId);
  const myRole = roleOf(nowWeek, studentId);

  return (
    <div className="space-y-3">
      <section className="rise rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="font-bold text-ink-900">🙋 내 현황</h2>
          {myGroup && (
            <span className="text-xs text-ink-400">
              이번 주 나: <b className="text-brand">{myGroup.groupId}모둠 · {myRole} 지킴이</b>
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="이번 주 독서"
            value={`${myWeekRead}/${quota}권`}
            tone={myWeekRead >= quota ? "emerald" : "slate"}
          />
          <Stat label="누적 점수" value={typeof myScore === "number" ? myScore : 0} tone="indigo" />
          <Stat label="2학기 실버" value={mySilver} />
          <Stat label="이월 실버" value={myCarry} tone="amber" />
        </div>
      </section>
      {classBoard}
    </div>
  );
}
