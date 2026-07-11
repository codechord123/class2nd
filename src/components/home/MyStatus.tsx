"use client";
// 홈 구성 (사용자 확정 레이아웃):
//   ① 오늘 할 일 — 큰 타일 4개 (제일 중요한 행동이 제일 크게)
//   ② 내 현황 + 우리 반 — 한 카드로 통합 (정보 대비 공간 낭비 제거)
//   ③ 거북이 독서 통합 — 마라톤 + 내 통계 + 미션 독려 + 감상문 쓰기
// 이미 캐시되는 문서만 재사용 (추가 읽기 0).
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { useBalances } from "@/lib/query/wallet";
import { useCumulativeScores, useMyEvaluation } from "@/lib/query/evaluation";
import { getS1WalletOf, s1TotalOf, s1BooksOf } from "@/lib/staticData";
import { classGoldLeft } from "@/lib/gold";
import { isWeekend, todayKST, weekOfDate } from "@/lib/date";
import { weekBooks } from "@/lib/readingStreak";
import { SEMESTER_START, TOTAL_WEEKS, currentWeekNum } from "@/lib/schedule";
import { groupOf, roleOf } from "@/lib/schedule";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import ReadingAlert from "@/components/reading/ReadingAlert";
import { useUiText, uiTextOf } from "@/lib/uiText";
import JuiceBurst from "@/components/ui/Juice";

type Tone = "slate" | "emerald" | "indigo" | "amber";
const toneStyle: Record<Tone, { tile: string; value: string }> = {
  slate: { tile: "bg-ink-50", value: "text-ink-900" },
  emerald: { tile: "bg-success-weak", value: "text-success" },
  indigo: { tile: "bg-brand-weak", value: "text-brand-strong" },
  amber: { tile: "bg-warn-weak", value: "text-warn" },
};
function Stat({ label, value, sub, tone = "slate" }: { label: string; value: React.ReactNode; sub?: string; tone?: Tone }) {
  const s = toneStyle[tone];
  return (
    <div className={`rounded-btn px-2 py-2.5 text-center ${s.tile}`}>
      <p className="text-[11px] leading-tight text-ink-600">{label}</p>
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
  const vacation = today < SEMESTER_START; // 방학: 주간 미션 없음, 권수는 0주차 버킷에 누적

  // 학급 스코어보드 (전원 공통)
  const s2Total = Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const classTotalBooks = s1TotalOf(stats) + s2Total;
  const goldLeft = classGoldLeft(s1Used as Record<string, number> | undefined);
  const classScore = Object.entries((cum ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => /^\d+$/.test(k) && typeof v === "number")
    .reduce((a, [, v]) => a + (v as number), 0);

  const classTiles = (
    <>
      <Stat label="🐢 학급 권수" value={classTotalBooks} sub={`2학기 +${s2Total}`} tone="emerald" />
      <Stat label="🏅 학급 총점" value={classScore} tone="indigo" />
      <Stat label="🥇 골드" value={goldLeft} sub="학급 공용" tone="amber" />
    </>
  );

  // 독서 통합 카드 — 마라톤 + 미션 독려 + (학생) 내 통계·CTA
  // 독려 메시지는 문구 편집(classData/uiText)으로 교사가 수정 가능 — 날짜 기반 로테이션
  const { data: uiText } = useUiText();
  const cheers = uiTextOf(uiText, "home.cheers")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  const dayNum = Number(today.slice(8, 10));
  const cheer = cheers[dayNum % Math.max(cheers.length, 1)] ?? "";
  const readingCard = (myRead?: { weekRead: number; totalBooks: number }) => (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <TurtleMarathon bare />
      {myRead && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
          <span className="text-sm text-ink-700">
            {vacation ? (
              <>
                🙋 나: 방학 동안 <b className="text-emerald-700">{myRead.weekRead}권</b> · 누적{" "}
                <b>{myRead.totalBooks}권</b>
              </>
            ) : (
              <>
                🙋 나: 이번 주{" "}
                <b className={myRead.weekRead >= quota ? "text-success" : "text-emerald-700"}>
                  {myRead.weekRead}/{quota}권
                </b>{" "}
                · 누적 <b>{myRead.totalBooks}권</b>
              </>
            )}
          </span>
          <a
            href="/reading"
            className="press shrink-0 rounded-btn bg-brand px-3 py-2 text-xs font-bold text-white"
          >
            ✍️ 감상문 쓰기
          </a>
        </div>
      )}
      {/* 주간 미션 진행 알림 + 참여 독려 한 줄 */}
      {myRead && (
        <div className="mt-2">
          <ReadingAlert />
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-emerald-700">💚 {cheer}</p>
    </section>
  );

  if (role !== "student" || !studentId) {
    return (
      <div className="space-y-4">
        <section className="rounded-card border border-ink-200 bg-white p-3 shadow-card">
          <h2 className="text-sm font-bold text-ink-900">🏫 우리 반</h2>
          <div className="mt-2 grid grid-cols-3 gap-1.5">{classTiles}</div>
        </section>
        {readingCard()}
      </div>
    );
  }

  // 내 현황 (학생) — 방학엔 0주차(방학) 버킷을 보여준다
  const myWeekRead = weekBooks(stats, studentId, vacation ? 0 : week);
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
  // 주말·공휴일엔 모둠 탭의 평가·투표·칭찬이 잠긴다 (Team 탭과 같은 판정) —
  // 홈 할 일에도 띄우지 않아야 '눌렀는데 잠겨 있는' 헛걸음이 없다. 쉬는 날엔 독서·상점만.
  const evalOpen = !isWeekend(today) && !(settings?.holidays ?? []).includes(today);
  const todos: {
    icon: string;
    label: string;
    sub: string;
    done?: boolean; // undefined = 완료 개념 없는 바로가기 (상점)
    href: string;
  }[] = [
    ...(evalOpen
      ? [
          { icon: "🤝", label: "부서장 평가", sub: "내 부서 기준으로", done: doneScores, href: "/team" },
          { icon: "👑", label: "부서장 투표", sub: "1표당 +1점", done: doneMvp, href: "/team" },
          { icon: "💌", label: "칭찬 보내기", sub: "미션: 전원 받기", done: doneComp, href: "/team" },
        ]
      : []),
    vacation
      ? {
          // 방학: 주간 미션이 없으니 완료 개념 없는 누적 표시 (상점 타일과 동일 취급)
          icon: "🐢",
          label: `방학 독서 ${myWeekRead}권`,
          sub: "1권 = +2점 · 무제한",
          href: "/reading",
        }
      : {
          icon: "🐢",
          label: `독서 ${myWeekRead}/${quota}권`,
          sub: "이번 주 미션",
          done: doneRead,
          href: "/reading",
        },
    { icon: "🛒", label: "상점", sub: `실버 ${mySilver}개 쓰러 가기`, href: "/shop" },
  ];
  const checkable = todos.filter((t) => t.done !== undefined);
  const doneCount = checkable.filter((t) => t.done).length;
  // 쉬는 날 + 방학이면 체크 항목이 0개 — 0/0을 '완료'로 축하하지 않는다
  const allDone = checkable.length > 0 && doneCount === checkable.length;

  return (
    <div className="space-y-4">
      {/* ① 거북이 독서 통합 — 학급 미션(배너) 바로 아래 붙여서 최상단 (사용자 확정) */}
      {readingCard({ weekRead: myWeekRead, totalBooks: myTotalBooks })}

      {/* ② 오늘 할 일 — 큰 타일 */}
      <section className="relative rounded-card border border-ink-200 bg-white p-4 shadow-card">
        {/* 전체 완료 순간의 축하 juice (완료 상태로 열어도 한 번 터짐 — 기분 좋음 우선) */}
        <JuiceBurst
          fireKey={allDone ? 1 : 0}
          emojis={["🎉", "✨", "🏆"]}
          className="left-1/2 top-3"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-ink-900">
            {allDone ? "🎉 오늘 할 일 완료!" : evalOpen ? "📌 오늘 할 일" : "🏖️ 오늘은 쉬는 날"}
          </h2>
          <span className="text-xs font-bold text-ink-500">
            {evalOpen || checkable.length > 0
              ? `${doneCount}/${checkable.length} 완료`
              : "평가·칭찬은 학교 오는 날에!"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {todos.map((t) => (
            <a
              key={t.label}
              href={t.href}
              className={`press rounded-card border p-3 text-center transition-colors ${
                t.done
                  ? "border-success/40 bg-success-weak"
                  : t.done === undefined
                    ? "border-brand/30 bg-brand-weak/40 hover:bg-brand-weak"
                    : "border-ink-200 bg-white hover:border-brand/50 hover:bg-brand-weak/40"
              }`}
            >
              <p className="text-2xl">{t.icon}</p>
              <p className={`mt-1 text-sm font-extrabold ${t.done ? "text-success" : "text-ink-900"}`}>
                {t.label}
              </p>
              <p
                className={`mt-0.5 text-[11px] font-bold ${
                  t.done ? "badge-pop text-success" : "text-brand"
                }`}
              >
                {t.done ? "✓ 완료" : `${t.sub} →`}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* ③ 내 현황 + 우리 반 — 한 카드 통합 */}
      <section className="rise rounded-card border border-ink-200 bg-white p-3 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-sm font-bold text-ink-900">🙋 내 현황 · 🏫 우리 반</h2>
          {myGroup && (
            <span className="text-xs text-ink-400">
              이번 주 나: <b className="text-brand">{myGroup.groupId}모둠 · {myRole} 부서장</b>
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 lg:grid-cols-6">
          <Stat label="누적 점수" value={typeof myScore === "number" ? myScore : 0} tone="indigo" />
          <Stat label="2학기 실버" value={mySilver} />
          <Stat label="이월 실버" value={myCarry} tone="amber" />
          {classTiles}
        </div>
      </section>
    </div>
  );
}
