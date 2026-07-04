"use client";
// 홈 '내 현황' + 학급 스코어보드 — 이미 캐시되는 문서만 재사용 (추가 읽기 0).
// 레드팀 결론: 홈에 '살아있는 숫자'가 없다 → 목표(배너) 다음에 현재(숫자)를 배치.
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { useBalances } from "@/lib/query/wallet";
import { useCumulativeScores, useMyEvaluation } from "@/lib/query/evaluation";
import {
  getS1WalletOf,
  s1ClassGoldRemaining,
  s1TotalOf,
  s1BooksOf,
} from "@/lib/staticData";
import { todayKST, weekOfDate } from "@/lib/date";
import { weekBooks } from "@/lib/readingStreak";
import { SEMESTER_START, TOTAL_WEEKS, currentWeekNum } from "@/lib/schedule";
import { groupOf, roleOf } from "@/lib/schedule";

// 컴팩트 스탯 타일 — 톤별 옅은 바탕색으로 서로 구별되게, 숫자는 크게 (살아있는 숫자)
type Legacy = "slate" | "emerald" | "indigo" | "amber";
const toneStyle: Record<Legacy, { tile: string; value: string }> = {
  slate: { tile: "bg-ink-50", value: "text-ink-900" },
  emerald: { tile: "bg-success-weak", value: "text-success" },
  indigo: { tile: "bg-brand-weak", value: "text-brand-strong" },
  amber: { tile: "bg-warn-weak", value: "text-warn" },
};
function Stat({ label, value, sub, tone = "slate" }: { label: string; value: React.ReactNode; sub?: string; tone?: Legacy }) {
  const s = toneStyle[tone];
  return (
    <div className={`rounded-btn px-2 py-2.5 text-center ${s.tile}`}>
      <p className="text-[11px] leading-tight text-ink-500">{label}</p>
      <p className={`tnum text-xl font-extrabold leading-tight ${s.value}`}>{value}</p>
      {sub && <p className="text-[10px] leading-tight text-ink-400">{sub}</p>}
    </div>
  );
}

export default function MyStatus() {
  const { role, studentId } = useSession();
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();
  const { data: s2Bal } = useBalances("s2");
  const { data: s1Used } = useBalances("s1");
  const { data: cum } = useCumulativeScores();
  const today = todayKST();
  const { data: myEval } = useMyEvaluation(today, role === "student" ? studentId : null);

  const week = weekOfDate(today, SEMESTER_START, TOTAL_WEEKS);
  const quota = settings?.weeklyReadingQuota ?? 3;

  // 학급 스코어보드 (전원 공통)
  const s2Total = Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const classTotalBooks = s1TotalOf(stats) + s2Total;
  const goldLeft =
    s1ClassGoldRemaining -
    ((s1Used?.classGoldUsed as number | undefined) ?? 0) +
    ((s1Used?.classGoldEarned as number | undefined) ?? 0);
  const classScore = Object.entries((cum ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => /^\d+$/.test(k) && typeof v === "number")
    .reduce((a, [, v]) => a + (v as number), 0);

  const classBoard = (
    <section className="grid grid-cols-3 gap-1.5">
      <Stat label="🐢 학급 총 권수" value={classTotalBooks} sub={`2학기 +${s2Total}`} tone="emerald" />
      <Stat label="🏅 학급 총점" value={classScore} tone="indigo" />
      <Stat label="🥇 골드토큰" value={goldLeft} sub="학급 공용" tone="amber" />
    </section>
  );

  if (role !== "student" || !studentId) return classBoard;

  // 내 현황 (학생)
  const myWeekRead = weekBooks(stats, studentId, week);
  const mySilver = s2Bal?.[String(studentId)] ?? 0;
  const myCarry =
    (getS1WalletOf(studentId)?.silverRemaining ?? 0) -
    ((s1Used?.[String(studentId)] as number | undefined) ?? 0);
  const myScore = ((cum ?? {}) as Record<string, unknown>)[String(studentId)];
  const nowWeek = currentWeekNum();
  const myGroup = groupOf(nowWeek, studentId);
  const myRole = roleOf(nowWeek, studentId);
  const myTotalBooks = s1BooksOf(stats, studentId) + (stats?.total?.[String(studentId)] ?? 0);

  // 오늘 할 일 — Team 탭과 같은 판정 (내 평가 문서 하나, 캐시 공유라 추가 읽기 0)
  const evalRec = (myEval ?? {}) as Record<string, unknown>;
  const targets = myGroup
    ? [myGroup.chair, ...myGroup.members.map((m) => m.studentId)].filter((id) => id !== studentId)
    : [];
  const doneScores = targets.length > 0 && targets.every((id) => typeof evalRec[id] === "number");
  const doneMvp = typeof evalRec._mvp === "number" && (evalRec._mvp as number) > 0;
  const doneComp = Object.values(
    (evalRec._compliments as Record<string, string>) ?? {}
  ).some((v) => v?.trim());
  const doneRead = myWeekRead >= quota;
  const todos: { label: string; done: boolean }[] = [
    { label: "모둠 평가", done: doneScores },
    { label: "MVP", done: doneMvp },
    { label: "칭찬", done: doneComp },
    { label: `독서 ${myWeekRead}/${quota}`, done: doneRead },
  ];
  const allDone = todos.every((t) => t.done);

  return (
    <div className="space-y-3">
      {/* 오늘 할 일 — 매일 열 이유를 홈 최상단에 */}
      <a
        href="/team"
        className={`block rounded-card border p-3 shadow-card ${
          allDone ? "border-success/40 bg-success-weak" : "border-ink-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="text-sm font-bold text-ink-900">
            {allDone ? "🎉 오늘 할 일 완료!" : "📌 오늘 할 일"}
          </span>
          <span className="flex flex-wrap gap-1">
            {todos.map((t) => (
              <span
                key={t.label}
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  t.done ? "bg-success-weak text-success" : "bg-ink-100 text-ink-500"
                }`}
              >
                {t.done ? "✓" : "○"} {t.label}
              </span>
            ))}
          </span>
        </div>
      </a>

      <section className="rise rounded-card border border-ink-200 bg-white p-3 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-sm font-bold text-ink-900">🙋 내 현황</h2>
          {myGroup && (
            <span className="text-xs text-ink-400">
              이번 주 나: <b className="text-brand">{myGroup.groupId}모둠 · {myRole} 지킴이</b>
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Stat label="누적 점수" value={typeof myScore === "number" ? myScore : 0} tone="indigo" />
          <Stat label="2학기 실버" value={mySilver} />
          <Stat label="이월 실버" value={myCarry} tone="amber" />
          <a
            href="/shop"
            className="press rounded-btn border border-brand/30 bg-brand-weak px-2 py-2 text-center hover:bg-brand/15"
          >
            <p className="text-[11px] leading-tight text-brand-strong">상점</p>
            <p className="text-base font-extrabold leading-tight">🛒</p>
            <p className="text-[10px] font-bold leading-tight text-brand-strong">쓰러 가기 →</p>
          </a>
        </div>
      </section>

      {/* 🐢 거북이 독서 — 이번 주 + 누적 + 감상문 쓰기 */}
      <a
        href="/reading"
        className="flex items-center justify-between gap-2 rounded-card border border-emerald-200 bg-emerald-50/60 p-3 shadow-card"
      >
        <span className="flex items-center gap-3">
          <span className="text-2xl">🐢</span>
          <span>
            <span className="block text-sm font-bold text-emerald-800">거북이 독서</span>
            <span className="block text-xs text-emerald-700">
              이번 주{" "}
              <b className={myWeekRead >= quota ? "text-success" : ""}>
                {myWeekRead}/{quota}권
              </b>{" "}
              · 누적 <b>{myTotalBooks}권</b>
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-btn bg-success px-3 py-2 text-xs font-bold text-white">
          ✍️ 감상문 쓰기
        </span>
      </a>

      {classBoard}
    </div>
  );
}
