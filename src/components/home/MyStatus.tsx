"use client";
// 홈 구성 (사용자 확정 레이아웃):
//   ① 오늘 할 일 — 큰 타일 4개 (제일 중요한 행동이 제일 크게)
//   ② 내 현황 + 우리 반 — 한 카드로 통합 (정보 대비 공간 낭비 제거)
//   ③ 거북이 독서 통합 — 마라톤 + 내 통계 + 미션 독려 + 감상문 쓰기
// 이미 캐시되는 문서만 재사용 (추가 읽기 0).
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats, useMyTodayReadCount } from "@/lib/query/reading";
import { useBalances, useMyRequests } from "@/lib/query/wallet";
import { useMyAppeals } from "@/lib/query/appeals";
import { useWeekRequests } from "@/lib/query/seatChange";
import { usePolls, votesOf, isPollClosed } from "@/lib/query/board";
import { useCumulativeScores, useDailyScores, useLatestAggregated, useMyEvaluation, type DailyMeta } from "@/lib/query/evaluation";
import { getS1WalletOf, s1TotalOf, s1BooksOf } from "@/lib/staticData";
import { classGoldLeft } from "@/lib/gold";
import { isWeekend, shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { weekBooks } from "@/lib/readingStreak";
import { FIRST_SCHOOL_DAY, SEMESTER_START, TOTAL_WEEKS, currentWeekNum } from "@/lib/schedule";
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
  const { data: myTodayRead } = useMyTodayReadCount(role === "student" ? studentId : null);
  const { data: s2Bal } = useBalances("s2");
  const { data: s1Used } = useBalances("s1");
  const { data: cum } = useCumulativeScores();
  const today = todayKST();
  const { data: myEval } = useMyEvaluation(today, role === "student" ? studentId : null);
  // 💌 받은 마음 알림 — 가장 최근 집계일의 칭찬 중 내가 받은 것 (팀 탭과 캐시 공유, 추가 읽기 최소)
  const { data: todayScores } = useDailyScores(today);
  const { data: latestAgg } = useLatestAggregated(shiftDate(today, -1), role === "student");
  // 🛒 상점 신청 결과 알림 — 상점 탭과 캐시 공유 (읽기 추가 최소)
  const { data: myS2Reqs } = useMyRequests("s2", role === "student" ? studentId : null);
  const { data: myS1Reqs } = useMyRequests("s1", role === "student" ? studentId : null);
  // 💺 자리·🙋 이의제기 결과 알림 — 각 탭과 캐시 공유
  const nowWeekNum = currentWeekNum();
  const sessionStartWeek = nowWeekNum - ((nowWeekNum - 1) % 2);
  const { data: weekReqs } = useWeekRequests(sessionStartWeek);
  const { data: myAppeals } = useMyAppeals(role === "student" ? studentId : null);
  // 🗳 진행 중 투표 — 오늘 할 일 타일용 (투표 탭과 캐시 공유, 최근 1페이지만)
  const { data: polls } = usePolls(1);

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

  // 받은 마음 배너 — 오늘 집계가 있으면 오늘, 없으면 최근 집계일 기준 (ReceivedNotes와 동일 소스)
  const todayMeta = (todayScores as { _meta?: DailyMeta } | null | undefined)?._meta;
  const noteMeta = todayMeta ?? latestAgg?.meta;
  const noteDate = todayMeta ? today : latestAgg?.date;
  const myNotes = (noteMeta?.compliments ?? []).filter((c) => c.to === studentId).length;
  const noteLabel =
    noteDate === today
      ? "오늘"
      : noteDate
        ? `${Number(noteDate.slice(5, 7))}월 ${Number(noteDate.slice(8, 10))}일에`
        : "";

  // 상점 신청 결과 — 마지막 확인 이후 승인/반려된 건 ("선생님 됐어요?"를 앱이 대신 답한다).
  // 상점 탭을 열면 본 것으로 처리(shop 페이지에서 마커 갱신) → 배너 자동 소멸.
  const seenKey = `shop-decided-seen-${studentId}`;
  const seenAt = typeof window !== "undefined" ? Number(localStorage.getItem(seenKey) ?? 0) : 0;
  const decided = [...(myS2Reqs ?? []), ...(myS1Reqs ?? [])]
    .filter((r) => r.status !== "pending" && ((r as { decidedAt?: number }).decidedAt ?? 0) > seenAt)
    .sort((a, b) => ((b as { decidedAt?: number }).decidedAt ?? 0) - ((a as { decidedAt?: number }).decidedAt ?? 0));
  const firstDecided = decided[0];

  // 자리 신청 결과 — 이번 기(세션) 내 신청 중 결정된 것
  const seatSeenKey = `seat-decided-seen-${studentId}`;
  const seatSeenAt = typeof window !== "undefined" ? Number(localStorage.getItem(seatSeenKey) ?? 0) : 0;
  const seatDecided = (weekReqs ?? [])
    .filter(
      (r) =>
        r.studentId === studentId &&
        r.status !== "pending" &&
        ((r as { decidedAt?: number }).decidedAt ?? 0) > seatSeenAt
    )
    .sort((a, b) => ((b as { decidedAt?: number }).decidedAt ?? 0) - ((a as { decidedAt?: number }).decidedAt ?? 0))[0];

  // 이의제기 답변 — 결과 자체를 배너에 담는다 (다른 화면엔 접수 표시만 있음)
  const appealSeenKey = `appeal-decided-seen-${studentId}`;
  const appealSeenAt = typeof window !== "undefined" ? Number(localStorage.getItem(appealSeenKey) ?? 0) : 0;
  const appealDecided = (myAppeals ?? [])
    .filter(
      (a) => a.status !== "pending" && ((a as { resolvedAt?: number }).resolvedAt ?? 0) > appealSeenAt
    )
    .sort((a, b) => ((b as { resolvedAt?: number }).resolvedAt ?? 0) - ((a as { resolvedAt?: number }).resolvedAt ?? 0))[0];

  // 오늘 할 일 — Team 탭과 같은 판정 (내 평가 문서 하나, 캐시 공유라 추가 읽기 0)
  const evalRec = (myEval ?? {}) as Record<string, unknown>;
  const targets = myGroup
    ? [myGroup.chair, ...myGroup.members.map((m) => m.studentId)].filter((id) => id !== studentId)
    : [];
  // 완료 판정은 Team 탭·완주 보너스 집계와 동일하게 '한 명 이상 평가' (기준 불일치 혼란 방지)
  const doneScores = targets.some((id) => typeof evalRec[id] === "number");
  const doneMvp = typeof evalRec._mvp === "number" && (evalRec._mvp as number) > 0;
  const doneFair = typeof evalRec._fair === "number" && (evalRec._fair as number) > 0;
  const doneComp = Object.values(
    (evalRec._compliments as Record<string, string>) ?? {}
  ).some((v) => v?.trim());
  // 📌 오늘 할 일 '독서' 완료 = 오늘 감상문 1편 이상 (완주 보너스 aggregate readCount>0와 동일 기준).
  // 주간 미션(3권)이 아니라 '오늘 1편'이 완주 조건이라, 이 신호를 완주 판정에 쓴다.
  const doneReadToday = (myTodayRead ?? 0) >= 1;
  // 진행 중인데 아직 투표 안 한 것 — 있으면 오늘 할 일에 타일로 (참여가 학급 자치의 핵심)
  const openUnvoted = (polls ?? []).filter(
    (pl) => !isPollClosed(pl) && votesOf(pl, String(studentId)).length === 0
  ).length;
  // 주말·공휴일엔 모둠 탭의 평가·투표·칭찬이 잠긴다 (Team 탭과 같은 판정) —
  // 홈 할 일에도 띄우지 않아야 '눌렀는데 잠겨 있는' 헛걸음이 없다. 쉬는 날엔 독서·상점만.
  // 방학(개학 전)엔 평일에도 학급 루틴이 없다 — 독서만 열려 있는 방학 모드 (베타 종료 후).
  const evalOpen = !vacation && !isWeekend(today) && !(settings?.holidays ?? []).includes(today);
  // 개학(8/18 화) D-day — 방학 모드 헤더에 표시
  const daysToSchool = Math.ceil(
    (new Date(FIRST_SCHOOL_DAY + "T00:00:00+09:00").getTime() -
      new Date(today + "T00:00:00+09:00").getTime()) / 86400000
  );
  const todos: {
    icon: string;
    label: string;
    sub: string;
    done?: boolean; // undefined = 완료 개념 없는 바로가기 (상점)
    href: string;
  }[] = [
    ...(evalOpen
      ? [
          { icon: "📋", label: "부서장 평가", sub: "내 부서 기준으로", done: doneScores, href: "/team#peer-eval" },
          { icon: "👑", label: "부서장 투표", sub: "가장 잘한 부서장", done: doneMvp, href: "/team#boss-vote" },
          { icon: "🤝", label: "페어플레이 투표", sub: "배려왕 한 표!", done: doneFair, href: "/team#fair-vote" },
          { icon: "💌", label: "칭찬 보내기", sub: "미션: 전원 받기", done: doneComp, href: "/team#compliment" },
          // 🐢 독서 — 학사일엔 '오늘 1편'이 완주 5번째 항목 (주간 3권 미션과 별개)
          {
            icon: "🐢",
            label: "감상문 쓰기",
            sub: vacation ? "오늘 1편이면 완료 (+2점)" : `오늘 1편 (주 미션 ${quota}권)`,
            done: doneReadToday,
            href: "/reading",
          },
        ]
      : [
          // 쉬는 날(주말·공휴일)엔 완주 대상이 아니라 단순 표시 — 독서는 언제나 열려 있음
          vacation
            ? { icon: "🐢", label: `방학 독서 ${myWeekRead}권`, sub: "1권 = +2점 · 무제한", href: "/reading" }
            : { icon: "🐢", label: `독서 ${myWeekRead}/${quota}권`, sub: "이번 주 미션", href: "/reading" },
        ]),
    ...(openUnvoted > 0
      ? [{ icon: "🗳", label: `투표 ${openUnvoted}건`, sub: "우리 반 일에 한 표!", href: "/vote" }]
      : []),
    {
      icon: "🛒",
      label: "상점",
      // 교사 사용 잠금 중엔 '쓰러 가기'로 헛걸음하지 않게 잠금 상태를 타일에서 미리 알림
      sub: settings?.usageLocked ? "🔒 지금은 잠겨 있어요" : `실버 ${mySilver}개 쓰러 가기`,
      href: "/shop",
    },
  ];
  const checkable = todos.filter((t) => t.done !== undefined);
  const doneCount = checkable.filter((t) => t.done).length;
  // 쉬는 날 + 방학이면 체크 항목이 0개 — 0/0을 '완료'로 축하하지 않는다
  const allDone = checkable.length > 0 && doneCount === checkable.length;

  return (
    <div className="space-y-4">
      {/* ① 거북이 독서 통합 — 학급 미션(배너) 바로 아래 붙여서 최상단 (사용자 확정) */}
      {readingCard({ weekRead: myWeekRead, totalBooks: myTotalBooks })}

      {/* 💌 받은 마음 배너 — 칭찬 받은 걸 3단계 파고들지 않아도 홈에서 바로 알게 (발견성) */}
      {myNotes > 0 && noteDate && (
        <a
          href="/team#received"
          className="press flex items-center gap-2.5 rounded-card border border-pink-200 bg-pink-50 px-4 py-3 shadow-card"
        >
          <span className="text-2xl">💌</span>
          <span className="min-w-0 flex-1 text-sm text-ink-800">
            <b>{noteLabel} 친구들이 보낸 마음 {myNotes}개</b>가 도착해 있어요!
          </span>
          <span className="shrink-0 text-xs font-bold text-pink-600">보러 가기 →</span>
        </a>
      )}

      {/* 🛒 상점 신청 결과 배너 — 승인/반려가 나온 걸 홈에서 바로 알게 */}
      {firstDecided && (
        <a
          href="/shop"
          className="press flex items-center gap-2.5 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 shadow-card"
        >
          <span className="text-2xl">🛒</span>
          <span className="min-w-0 flex-1 text-sm text-ink-800">
            <b>
              "{firstDecided.item}" {firstDecided.status === "approved" ? "✅ 승인" : "❌ 반려"}
            </b>
            {decided.length > 1 && ` 외 ${decided.length - 1}건`} — 신청 결과가 나왔어요!
          </span>
          <span className="shrink-0 text-xs font-bold text-amber-600">확인하기 →</span>
        </a>
      )}

      {/* 💺 자리 신청 결과 배너 */}
      {seatDecided && (
        <a
          href="/seats"
          onClick={() => {
            try { localStorage.setItem(seatSeenKey, String(Date.now())); } catch {}
          }}
          className={`press flex items-center gap-2.5 rounded-card border px-4 py-3 shadow-card ${
            seatDecided.status === "approved"
              ? "border-success/30 bg-success-weak" // 승인 = 초록 (인접한 상점 앰버와 구분)
              : "border-ink-200 bg-ink-50"
          }`}
        >
          <span className="text-2xl">💺</span>
          <span className="min-w-0 flex-1 text-sm text-ink-800">
            {seatDecided.status === "approved" ? (
              <b>자리 변경 승인! {seatDecided.targetGroup}모둠 {seatDecided.targetRole} 지킴이로 이동해요 🎉</b>
            ) : (
              <b>자리 신청이 반려됐어요 — 다음 기에 다시 도전!</b>
            )}
          </span>
          <span className={`shrink-0 text-xs font-bold ${seatDecided.status === "approved" ? "text-success" : "text-ink-500"}`}>자리표 보기 →</span>
        </a>
      )}

      {/* 🙋 이의제기 답변 배너 — 결과를 배너가 직접 알려준다 */}
      {appealDecided && (
        <a
          href="/team#received"
          onClick={() => {
            try { localStorage.setItem(appealSeenKey, String(Date.now())); } catch {}
          }}
          className="press flex items-center gap-2.5 rounded-card border border-brand/30 bg-brand-weak/40 px-4 py-3 shadow-card"
        >
          <span className="text-2xl">🙋</span>
          <span className="min-w-0 flex-1 text-sm text-ink-800">
            <b>
              이의제기 답변:{" "}
              {appealDecided.status === "resolved"
                ? `✅ 인정${(appealDecided as { delta?: number }).delta ? ` (${(appealDecided as { delta?: number }).delta! > 0 ? "+" : ""}${(appealDecided as { delta?: number }).delta}점 조정)` : ""}`
                : "검토 후 반려"}
            </b>
            {appealDecided.teacherNote && ` — “${appealDecided.teacherNote}”`}
          </span>
          <span className="shrink-0 text-xs font-bold text-brand-strong">자세히 →</span>
        </a>
      )}

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
            {allDone
              ? "🎉 오늘 할 일 완료!"
              : evalOpen
                ? "📌 오늘 할 일"
                : vacation
                  ? "🏖️ 신나는 여름 방학!"
                  : "🏖️ 오늘은 쉬는 날"}
          </h2>
          <span className="text-xs font-bold text-ink-500">
            {evalOpen || checkable.length > 0
              ? `${doneCount}/${checkable.length} 완료`
              : vacation && daysToSchool > 0
                ? `개학(8/18)까지 D-${daysToSchool}`
                : "평가·칭찬은 학교 오는 날에!"}
          </span>
        </div>
        {/* 📌 완주 보너스 안내 — 독서는 '오늘 1권'이 기준 (주간 미션과 별개) */}
        {evalOpen && (
          <p className="mt-1 text-[11px] text-ink-400">
            💡 할 일 5개(상점 제외, 독서는 <b>오늘 1권</b>)를 다 하면 <b>+1점</b> — 모둠
            전원이 다 하면 <b>모둠 점수 +1</b> 더!
          </p>
        )}
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
