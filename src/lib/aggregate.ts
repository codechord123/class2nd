// 일일 점수 집계 — 교사 세션에서 실행 (Admin SDK/서비스 계정 불필요).
// 원시 평가를 읽는 유일한 코드 경로: 하루 최대 25문서(평가)를
// 교사만 1회 읽고, 결과는 dailyScores/{date} 문서 하나로 저장한다.
// 학생들은 이 결과 문서만 읽으므로 읽기 폭증이 구조적으로 불가능하다.
// 재집계해도 누적이 어긋나지 않도록 이전 집계분을 빼고 더한다(멱등).
import {
  addDoc,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { todayKST, weekOfDate } from "@/lib/date";
import { streakAtWeek, weekBooks } from "@/lib/readingStreak";
import type { ReadingStats } from "@/lib/query/reading";
import type { ClassSettings, DailyScoreRow, RoleKey } from "@/types";
import { groupDayScore } from "@/lib/groupScore";
import { peerScoreFromChecks } from "@/lib/peerCriteria";
import { eventMultipliers, type EventBoost } from "@/lib/eventBoost";

export interface AggregateResult {
  date: string;
  evaluatorCount: number;
  groupRanks: Record<number, number>;
  /** 이번 집계로 지급된 마일스톤 실버 (studentId → 개수) */
  milestoneSilver?: Record<string, number>;
  /** 이번 집계로 적립된 학급 골드 */
  milestoneGold?: number;
  /** 칭찬 연속 보너스 — 이번 집계로 5일(+1)/10일(+2) 도달한 학생 */
  compStreakBonus?: Record<string, number>;
}

// ── 마일스톤 보상 (사용자 확정 규칙) ─────────────────────────────
// · 누적 점수 25점이 모일 때마다 → 실버 1개 (자동 지급, 점수는 소모되지 않음)
// · 학급 전체가 번 실버 합산 25개마다 → 학급 골드토큰 1개 적립
//   (재료 = 마일스톤 실버 + 세션 보상 실버 + 교사 수동 지급 실버 — 수동 지급 포함은 사용자 확정.
//    수동 지급은 useGrantSilver가 silverEarned에 직접 증분하고, 여기서는 합산만 한다)
// 지급 이력은 _cumulative에 저장(scoreSilverPaid·silverEarned·classGoldPaid) —
// 재집계로 점수가 내려가도 이미 준 것은 회수하지 않는다(멱등·단조 증가).
// silverEarned는 델타(increment)로만 쓴다 — 수동 지급 경로와 겹쳐도 증분이 유실되지 않게.
const SILVER_PER_SCORE = 25;
const GOLD_PER_SILVER = 25;
// 독서 하루 점수 상한 — 감상문을 몰아 써도 그날 점수는 이만큼 권수까지만 (권수 기록은 캡 없음).
// 순위표(설정)처럼 자주 바꾸진 않아 상수로 둔다 (사용자 확정: 2권, 3권 허용 시 부정 우려).
const DAILY_READ_CAP = 2;
// 감상문 1권당 점수 (사용자 확정: 개인 노력 비중을 높이려 1→2점).
const READ_POINTS_PER_BOOK = 2;
// 칭찬 개인 점수 상한 (present 모둠원 전원 칭찬 시 만점).
const COMP_MAX = 2;

// ── 집계 락 ─────────────────────────────────────────────────────
// 집계·정산은 "읽고 → 계산 → 여러 문서에 쓰기"라 두 실행이 겹치면 늦게 쓴 쪽이
// 먼저 쓴 쪽을 덮는다 (예: 교사 수동 재집계 + 자동 집계, 탭 2개).
// classData/aggLock 문서를 트랜잭션으로 선점(60초 임대)해 한 번에 하나만 실행.
// 교사 세션에서만 호출되는 경로라 규칙상 학생은 이 문서를 쓸 수 없다.
const LOCK_LEASE_MS = 60_000;

async function withAggLock<T>(job: string, fn: () => Promise<T>): Promise<T> {
  const d = db();
  const lockRef = doc(d, "classData", "aggLock");
  await runTransaction(d, async (tx) => {
    const snap = await tx.get(lockRef);
    const until = snap.exists() ? ((snap.data().until as number) ?? 0) : 0;
    if (until > Date.now())
      throw new Error("다른 집계가 진행 중이에요. 잠시 후 다시 시도해주세요.");
    tx.set(lockRef, { until: Date.now() + LOCK_LEASE_MS, job });
  });
  try {
    return await fn();
  } finally {
    // 해제 실패해도 60초 뒤 임대가 만료되므로 영구 잠김은 없다
    await setDoc(lockRef, { until: 0, job: "" }).catch(() => {});
  }
}

async function grantMilestones(
  cum: Record<string, unknown>,
  extraSilver: Record<string, number>, // 이번에 다른 자동 경로로 지급된 실버(세션 보상)
  reason: string
): Promise<{ silver: Record<string, number>; gold: number }> {
  // 베타(개학 전)엔 2학기 실버·골드를 지급하지 않는다 — 개학부터 진짜(사용자 확정).
  // 점수(누적)는 그대로 쌓이되 실버는 0으로 유지되어, 베타 초기화 후 자동 복원도 막힌다.
  if (todayKST() < SEMESTER_START) return { silver: {}, gold: 0 };
  const d = db();
  const scorePaid = { ...((cum.scoreSilverPaid as Record<string, number>) ?? {}) };
  const earned = { ...((cum.silverEarned as Record<string, number>) ?? {}) };
  const earnedDelta: Record<string, number> = {}; // 이번 실행에서 늘어난 만큼만 (increment 쓰기용)
  const silverGrant: Record<string, number> = {};

  for (const s of students) {
    const sid = String(s.id);
    // ① 누적 점수 25점 단위 → 실버
    const score = typeof cum[sid] === "number" ? (cum[sid] as number) : 0;
    const entitled = Math.floor(Math.max(score, 0) / SILVER_PER_SCORE);
    const delta = entitled - (scorePaid[sid] ?? 0);
    if (delta > 0) {
      silverGrant[sid] = delta;
      scorePaid[sid] = entitled;
    }
    // 번 실버 개인별 기록 (골드 계산의 재료 + 통계용)
    const gained = (silverGrant[sid] ?? 0) + (extraSilver[sid] ?? 0);
    if (gained > 0) {
      earnedDelta[sid] = gained;
      earned[sid] = (earned[sid] ?? 0) + gained;
    }
  }

  // ② 학급 합산 자동 실버 25개 단위 → 학급 골드 적립.
  //    classGoldPaid가 없으면(방식 전환 직후) 기존 개인별 goldPaid 합계를 승계 — 이중 지급 방지
  const legacyGoldPaid = (cum.goldPaid as Record<string, number>) ?? {};
  const classGoldPaid =
    typeof cum.classGoldPaid === "number"
      ? (cum.classGoldPaid as number)
      : Object.values(legacyGoldPaid).reduce((a, b) => a + b, 0);
  const totalEarned = Object.values(earned).reduce((a, b) => a + b, 0);
  const goldEntitled = Math.floor(totalEarned / GOLD_PER_SILVER);
  const goldDelta = Math.max(goldEntitled - classGoldPaid, 0);

  const writes: Promise<unknown>[] = [];
  const silverEntries = Object.entries(silverGrant);
  if (silverEntries.length) {
    writes.push(
      setDoc(
        doc(d, "coinTxns", "0_balances"),
        Object.fromEntries(silverEntries.map(([sid, n]) => [sid, increment(n)])),
        { merge: true }
      )
    );
    for (const [sid, n] of silverEntries)
      writes.push(
        addDoc(collection(d, "coinTxns"), {
          studentId: Number(sid),
          amount: n,
          item: reason,
          type: "milestone",
          status: "approved",
          createdAt: Date.now(),
        })
      );
  }
  // 학급 골드 적립 — 골드 잔량 문서(s1Spends/0_balances)의 earned 필드에 누적
  if (goldDelta > 0) {
    writes.push(
      setDoc(doc(d, "s1Spends", "0_balances"), { classGoldEarned: increment(goldDelta) }, { merge: true })
    );
  }
  if (silverEntries.length || goldDelta > 0) {
    writes.push(
      setDoc(
        doc(d, "dailyScores", "_cumulative"),
        {
          scoreSilverPaid: scorePaid,
          // 델타만 increment — 절대값 대입이면 동시에 들어온 수동 지급 증분을 덮어쓴다
          silverEarned: Object.fromEntries(
            Object.entries(earnedDelta).map(([sid, n]) => [sid, increment(n)])
          ),
          classGoldPaid: classGoldPaid + goldDelta,
        },
        { merge: true }
      )
    );
  }
  await Promise.all(writes);
  return { silver: silverGrant, gold: goldDelta };
}

// ── 방학 독서 적립 (사용자 확정: 감상문은 상시 누적, 방학에도 1편 = 누적 1점) ──
// 방학 감상문은 readingStats.byWeek["0"] 버킷에 쌓인다 (주간 통계 밖 — 스트릭·모둠
// 대항·주간 보상은 개학(1주차)부터). 이 함수는 버킷과 vacReadPaid 마커의 차이만큼
// 누적 점수에 반영한다 — 날짜와 무관하게 멱등이라 방학 중 교사가 드문드문 접속해도
// 유실이 없고, 초기화로 _cumulative(마커 포함)가 지워져도 다음 실행이 전액 복원한다.
// 삭제로 버킷이 줄면 음수 델타로 점수도 되돌린다 (이미 지급된 마일스톤 실버는 회수 없음).
export interface VacationReadResult {
  students: number; // 반영된 학생 수
  points: number; // 반영된 점수 합 (음수 보정 포함)
  milestoneSilver: number; // 이번 반영으로 지급된 마일스톤 실버 수
}

export async function payVacationReading(): Promise<VacationReadResult | null> {
  return withAggLock("vacationRead", async () => {
    const d = db();
    const cumSnap = await getDoc(doc(d, "dailyScores", "_cumulative"));
    const cum = (cumSnap.exists() ? cumSnap.data() : {}) as Record<string, unknown>;
    // 독서 점수는 이제 '일일 집계(countReads)'로 오늘 점수·누적에 반영한다. 예전 마커 경로가 누적에
    // 직접 넣었던 점수(vacReadPoints/옛 vacReadPaid=권수)를 되돌려(목표 0) 이중계산을 없앤다.
    // 되돌릴 게 없으면 no-op(초기화 후엔 마커도 없어 no-op). 한 번 청산되면 이후로도 no-op.
    const paidPts = (cum.vacReadPoints as Record<string, number>) ?? {};
    const paidCount = (cum.vacReadPaid as Record<string, number>) ?? {};

    const deltas: Record<string, number> = {};
    for (const s of students) {
      const sid = String(s.id);
      const already = paidPts[sid] ?? paidCount[sid] ?? 0; // 예전 마커로 이미 지급된 점수
      if (already !== 0) deltas[sid] = -already; // 목표 0 → 되돌림
    }
    const entries = Object.entries(deltas);
    if (!entries.length) return null;

    await setDoc(
      doc(d, "dailyScores", "_cumulative"),
      {
        ...Object.fromEntries(entries.map(([sid, n]) => [sid, increment(n)])),
        vacReadPoints: Object.fromEntries(entries.map(([sid]) => [sid, 0])),
        vacReadPaid: Object.fromEntries(entries.map(([sid]) => [sid, 0])),
      },
      { merge: true }
    );

    return {
      students: entries.length,
      points: entries.reduce((a, [, n]) => a + n, 0),
      milestoneSilver: 0,
    };
  });
}

// ── 독서 날짜 일괄 재집계 — 감상문이 있는 모든 날짜를 다시 집계해 일일 read(+2/편)를 채운다.
// 쓰임 두 곳(둘 다 드묾, 교사 전용이라 전량 조회 허용):
//   ① 일일 read 전환 마이그레이션 — 예전 마커(+1/편)로만 지급됐던 과거 날짜 치유 (1회)
//   ② 베타 초기화 복원 — dailyScores가 지워져도 남은 감상문으로 독서 점수 재구축 (초기화 시 재예약)
// aggregateDate가 멱등이라 몇 번 돌아도 안전. 반환: 재집계된 날짜 목록.
export async function reaggregateReadingDates(settings: ClassSettings): Promise<string[]> {
  const d = db();
  const today = todayKST();
  const snap = await getDocs(collection(d, "readingReports"));
  const dates = new Set<string>();
  snap.forEach((r) => {
    const v = r.data();
    if (v.isDraft) return; // 초안은 점수가 아니다
    const ms = Number(v.createdAt) || 0;
    if (!ms) return;
    const date = new Date(ms + 9 * 3600000).toISOString().slice(0, 10); // KST 날짜
    if (date <= today) dates.add(date);
  });
  const sorted = [...dates].sort();
  for (const date of sorted) await aggregateDate(date, settings, { skipIfEmpty: true });
  return sorted;
}

export async function aggregateDate(
  date: string,
  settings: ClassSettings,
  opts?: { skipIfEmpty?: boolean } // 자동 집계용: 기록이 전혀 없는 날(주말 등)은 문서를 만들지 않음
): Promise<AggregateResult | null> {
  return withAggLock(`aggregate:${date}`, () => aggregateDateInner(date, settings, opts));
}

async function aggregateDateInner(
  date: string,
  settings: ClassSettings,
  opts?: { skipIfEmpty?: boolean }
): Promise<AggregateResult | null> {
  const d = db();

  // 그날 감상문 (편수만큼 독서 점수 — 쓴 만큼) — createdAt 하루 범위 쿼리 (교사 1회)
  const dayStartMs = new Date(date + "T00:00:00+09:00").getTime();
  const dayEndMs = dayStartMs + 86400000;

  // 1) 원시 평가 읽기 (교사 1회 — 최대 25문서)
  const [evalSnap, prevSnap, cumSnap, bestSnap, reportSnap, attSnap, evSnap] = await Promise.all([
    getDocs(collection(d, "evaluations", date, "entries")),
    getDoc(doc(d, "dailyScores", date)), // 재집계 시 이전분 차감용
    getDoc(doc(d, "dailyScores", "_cumulative")),
    getDoc(doc(d, "classData", "bestGroups")), // 모둠 간 평가 폐지 → 교사 '오늘의 모둠'이 순위 결정
    getDocs(
      query(
        collection(d, "readingReports"),
        where("createdAt", ">=", dayStartMs),
        where("createdAt", "<", dayEndMs)
      )
    ),
    getDoc(doc(d, "classData", "attendance")), // 그날 결석 명단 — 팀 활동에서 제외
    getDoc(doc(d, "classData", "eventBoost")), // 이벤트 점수 배수 (기간 안이면 적용)
  ]);

  // 이벤트 배수 — 이 날짜가 이벤트 기간 안이면 칭찬·미션·MVP·독서에 배수 적용(멱등).
  const ev = eventMultipliers(
    evSnap.exists() ? (evSnap.data() as EventBoost) : undefined,
    date
  );

  // 결석 학생 — 그날 칭찬·평가를 못 하므로 모둠 '전원' 판정·팀 보상에서 빼야
  // 남은 모둠원이 미션을 달성할 수 있다 (교사가 기록, 전출과 달리 그 날짜만 제외).
  const absentSet = new Set<number>(
    (attSnap.exists() ? ((attSnap.data() as Record<string, number[]>)[date] ?? []) : []).map(Number)
  );

  // 2) 모둠 내 점수: 받은 평가 합 (+ MVP 득표 집계)
  //    "_"로 시작하는 키는 점수가 아닌 부가 필드(_mvp, _compliment)
  const peer: Record<number, number> = {};
  const mvpVotes: Record<number, number> = {};
  // 칭찬·건의·바라는 점도 _meta에 보관 → 기간 인쇄(일/주/월)가 집계 문서만 읽으면 되게 함
  const compliments: { from: number; to: number; text: string }[] = [];
  const peerSuggestions: { from: number; to: number; text: string }[] = [];
  const toTeacher: { from: number; text: string }[] = [];
  const reflections: { from: number; text: string }[] = []; // 세션 모둠 반성 (마지막 주말 작성)
  const bossReasons: { from: number; to: number; text: string }[] = []; // 부서장 투표 이유 (인기투표 억제·리포트 근거)
  // 부서장 평가 O/X 상세 — 실명 공개·이의제기용 (수신자별로 접어 저장)
  const peerChecksRaw: { from: number; to: number; checks: boolean[] }[] = [];
  evalSnap.forEach((entry) => {
    const data = entry.data();
    const from = Number(entry.id);
    // 부서장 평가 점수는 저장된 숫자 필드가 아니라 체크(_peerChecks)에서 '현재 규칙'으로 다시 계산한다.
    //   → 옛 규칙(−1/−2)으로 저장된 숫자를 무시하고, 재집계만 하면 음수가 자동으로 사라진다(자기 치유).
    const pc = data._peerChecks as Record<string, boolean[]> | undefined;
    if (pc)
      for (const [to, checks] of Object.entries(pc)) {
        if (Number(to) === from || !Array.isArray(checks)) continue;
        peer[Number(to)] = (peer[Number(to)] ?? 0) + peerScoreFromChecks(checks.map(Boolean));
        peerChecksRaw.push({ from, to: Number(to), checks: checks.map(Boolean) });
      }
    if (typeof data._mvp === "number" && data._mvp > 0 && data._mvp !== from) {
      mvpVotes[data._mvp] = (mvpVotes[data._mvp] ?? 0) + 1; // _mvp:0 = 취소, 자기 투표 무효
      const reason = (data._mvpReason as string | undefined)?.trim();
      if (reason) bossReasons.push({ from, to: data._mvp, text: reason });
    }
    // 구버전 단일 칭찬(_compliment) + 신버전 친구별 칭찬(_compliments) — 자기 칭찬 무효
    const legacy = data._compliment as { to: number; text: string } | undefined;
    if (legacy?.text && legacy.to !== from)
      compliments.push({ from, to: legacy.to, text: legacy.text });
    const cmap = data._compliments as Record<string, string> | undefined;
    if (cmap)
      for (const [to, text] of Object.entries(cmap))
        if (text?.trim() && Number(to) !== from) compliments.push({ from, to: Number(to), text });
    const smap = data._peerSuggestions as Record<string, string> | undefined;
    if (smap)
      for (const [to, text] of Object.entries(smap))
        if (text?.trim()) peerSuggestions.push({ from, to: Number(to), text });
    if (typeof data._toTeacher === "string" && data._toTeacher)
      toTeacher.push({ from, text: data._toTeacher });
    if (typeof data._reflection === "string" && data._reflection)
      reflections.push({ from, text: data._reflection });
  });

  // 3) 순위 산정: 교사가 매긴 1~5위(ranking)에 rankPoints(기본 5·4·3·2·1) 배분.
  //    구버전(단일 groupId)은 1위만, 미선정이면 순위 점수 0 (호출부에서 경고 표시).
  const rankPoint = (rank: number) =>
    settings.rankPoints[rank - 1] ?? settings.rankPoints[settings.rankPoints.length - 1] ?? 0;
  const bestEntry = bestSnap.exists()
    ? (bestSnap.data() as Record<string, { groupId: number; ranking?: number[] } | undefined>)[
        date
      ]
    : undefined;
  const ranks: Record<number, number> = bestEntry?.ranking?.length
    ? Object.fromEntries(bestEntry.ranking.map((g, i) => [g, i + 1]))
    : bestEntry?.groupId
      ? { [bestEntry.groupId]: 1 }
      : {};

  // 독서 점수는 '그날 감상문 편수 × 2점'을 오늘 점수(일일)에 반영한다 (사용자 확정: 2권=+4).
  // autoRun이 교사 탭 열림·집계 때 그날/밀린 날을 자동 집계하므로 날짜별 수동 집계는 불필요.
  // (예전 방학 마커 경로 payVacationReading은 이중계산 방지로 되돌려 정리한다.)
  const countReads = true;

  // 기록이 전혀 없는 날(평가·감상문·순위 없음, 기존 집계도 없음)은 건너뛴다 —
  // 자동 집계가 주말·방학 날짜마다 빈 문서를 쌓지 않게 (기존 집계가 있으면 재집계해 0으로 보정)
  const reportsRelevant = countReads && !reportSnap.empty;
  if (opts?.skipIfEmpty && evalSnap.empty && !reportsRelevant && !prevSnap.exists() && !bestEntry)
    return null;

  // 4) 해당 날짜의 자리표에서 모둠 소속 확인 → 모둠원 전원 동일 순위 점수
  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const groupOfStudent: Record<number, number> = {};
  const roleOf: Record<number, RoleKey> = {};
  for (const g of schedule.groups) {
    groupOfStudent[g.chair] = g.groupId;
    roleOf[g.chair] = "소통"; // 의장 = 소통 부서장
    for (const m of g.members) {
      groupOfStudent[m.studentId] = g.groupId;
      roleOf[m.studentId] = m.role;
    }
  }

  // 부서장 평가 O/X 상세를 수신자별로 접는다 — 실명 공개·이의제기용 (점수는 peer[]로 이미 합산).
  const peerDetail: Record<
    string,
    { from: number; dept: RoleKey; checks: boolean[]; score: number }[]
  > = {};
  for (const pc of peerChecksRaw) {
    const dept = roleOf[pc.from];
    if (!dept) continue; // 그 주 자리표에 없는 평가자 — 상세 생략(점수는 peer[]로 이미 반영).
    // ↑ undefined를 넣으면 Firestore가 문서 쓰기를 거부해 집계 전체가 실패한다(방어).
    (peerDetail[String(pc.to)] ??= []).push({
      from: pc.from,
      dept,
      checks: pc.checks,
      score: peerScoreFromChecks(pc.checks),
    });
  }

  // 4-0) 그날 감상문 편수 (편당 +1점 — 쓴 만큼 그대로, 개학 이후 날짜만)
  //      임시저장 잔존 문서(isDraft)는 절대 세지 않는다 — 초안은 점수가 아니다 (사용자 확정)
  const readCount: Record<number, number> = {};
  if (countReads)
    reportSnap.forEach((r) => {
      const data = r.data();
      if (data.isDraft) return;
      const sid = data.studentId as number | undefined;
      if (typeof sid === "number") readCount[sid] = (readCount[sid] ?? 0) + 1;
    });

  // 4-1) 모둠 칭찬 미션: 모둠원 전원이 칭찬을 1개 이상 받으면 그 모둠 전원 +1점
  //      (서로 칭찬하기를 매일 미션으로 — 협력하면 다 같이 이득)
  //      전출(inactive) 학생 + 그날 결석(absentSet) 학생은 '전원' 판정에서 제외 —
  //      빈자리·결석 때문에 미션이 막히지 않게 (결석 제외는 boss·MVP·오늘의 모둠 판정에도 공통 적용)
  const activeIdsOf = (g: { chair: number; members: { studentId: number }[] }) =>
    [g.chair, ...g.members.map((m) => m.studentId)].filter(
      (id) => !studentById.get(id)?.inactive && !absentSet.has(id)
    );
  const complimentedIds = new Set(compliments.map((c) => c.to));
  const missionGroups: number[] = [];
  for (const g of schedule.groups) {
    const ids = activeIdsOf(g);
    if (ids.length && ids.every((id) => complimentedIds.has(id))) missionGroups.push(g.groupId);
  }
  const missionSet = new Set(missionGroups);

  // 4-1b) 칭찬 개인 점수(comp) — '하는 것'에 개인 점수를 준다 (사용자 확정).
  //   comp = 내림(2 × 칭찬한 present 모둠원 수 / present 모둠원 수), 최대 2.
  //   만점을 받으려면 present 모둠원 '전원'을 칭찬해야 하므로, 편 갈라 배제하면 본인이 손해다.
  //   present 모둠원 수(T)는 결석·전출을 자동으로 뺀다 → 결석 규칙과 자연히 연결.
  const givenTo: Record<number, Set<number>> = {};
  for (const c of compliments) (givenTo[c.from] ??= new Set()).add(c.to);
  const comp: Record<number, number> = {};
  for (const g of schedule.groups) {
    const ids = activeIdsOf(g);
    const idSet = new Set(ids);
    for (const id of ids) {
      const T = ids.length - 1; // 자신 제외한 present 모둠원 수
      if (T <= 0) continue;
      const given = givenTo[id];
      const c = given ? [...given].filter((to) => to !== id && idSet.has(to)).length : 0;
      comp[id] = Math.min(Math.floor((2 * c) / T), COMP_MAX);
    }
  }

  // 4-2) 오늘의 부서장 (투표): 각 모둠 최다 득표(1표 이상, 동점 모두).
  //      "그날 부서 일을 가장 잘한 사람" — 최다 득표자에게 고정 +1점 (득표수 비례 아님).
  //      투표 시 이유를 필수로 받아(UI) 인기투표를 억제한다 (사용자 확정).
  const bossWinners: number[] = [];
  for (const g of schedule.groups) {
    const ids = activeIdsOf(g);
    const max = Math.max(0, ...ids.map((id) => mvpVotes[id] ?? 0));
    if (max > 0) bossWinners.push(...ids.filter((id) => (mvpVotes[id] ?? 0) === max));
  }

  // 5) 학생별 행 구성 (기존 보너스는 유지)
  //    1차 기본 점수 = 부서장평가 + 선생님 모둠순위 + 칭찬미션 + 독서(2권 캡) + 부서장(고정+1) + 교사보너스
  //    (MVP·오늘의 모둠 보너스는 이 기본 점수 확정 후 별도 단계에서 가산 — 순환 방지)
  const prevRows = (prevSnap.exists() ? prevSnap.data() : {}) as Record<
    string,
    DailyScoreRow | unknown
  >;
  const baseParts: Record<
    number,
    {
      peer: number;
      groupRank: number;
      bonus: number;
      mission: number;
      comp: number;
      boss: number;
      read: number;
      sum: number;
    }
  > = {};
  // 오늘의 부서장 = 각 모둠 최다 득표자 (bossWinners). 점수는 득표수 비례가 아니라
  // 고정 +1 (사용자 확정 — 몰표로 점수를 부풀리는 인기투표 방지)
  const bossSet = new Set(bossWinners);
  for (const s of students) {
    const prevRow = prevRows[String(s.id)] as DailyScoreRow | undefined;
    // 결석 학생은 그날 팀 활동에서 빠진다 — 순위·미션·부서장 등 팀 점수 미부여
    // (교사 보너스만 유지). 남을 막지도, 팀 보상을 받지도 않는다 (사용자 확정).
    const absent = absentSet.has(s.id);
    // 결석 학생은 부서장 평가 점수도 0 — 결석날 기준 미충족으로 −1 받는 억울함 방지
    // (결석 = 팀·상호 점수 미부여, 교사 보너스만 유지. 사용자 확정)
    const p = absent ? 0 : (peer[s.id] ?? 0);
    // 순위에 든 모둠 소속이면 그 순위 점수 — 교사 1위 모둠은 +1점 더
    const myRank = absent ? undefined : ranks[groupOfStudent[s.id]];
    const gr = myRank ? rankPoint(myRank) + (myRank === 1 ? 1 : 0) : 0;
    const bonus = prevRow?.bonus ?? 0;
    // 이벤트 배수 적용 (칭찬 미션·개인, 독서). 이벤트 없으면 ev.*=1이라 변화 없음.
    const mission = !absent && missionSet.has(groupOfStudent[s.id]) ? 1 * ev.mission : 0;
    const boss = bossSet.has(s.id) ? 1 : 0; // 최다 득표자 고정 +1 (결석은 bossSet에서 이미 제외)
    // 칭찬 개인 점수 — 결석 학생은 칭찬을 못 하니 자연히 0 (comp에 없음)
    const cm = (comp[s.id] ?? 0) * ev.comp;
    // 독서: 감상문 편수만큼이되 하루 DAILY_READ_CAP권까지, 권당 READ_POINTS_PER_BOOK점 (권수 기록은 캡 없음)
    const read = Math.min(readCount[s.id] ?? 0, DAILY_READ_CAP) * READ_POINTS_PER_BOOK * ev.read;
    baseParts[s.id] = {
      peer: p,
      groupRank: gr,
      bonus,
      mission,
      comp: cm,
      boss,
      read,
      sum: p + gr + bonus + mission + cm + boss + read,
    };
  }

  // 5-1) 오늘의 MVP (사용자 확정 규칙): 투표가 아니라 그날 모든 점수(기본 점수) 합산으로 —
  //      각 모둠 1위 +1점, 학급 전체 1위는 +2점 추가(모둠 1위 겸이므로 합 +3).
  //      동점자 모두 인정, 기본 점수 0점 초과일 때만 (기록 없는 날 전원 MVP 방지).
  const mvpPts: Record<number, number> = {};
  const mvpWinners: number[] = []; // 모둠별 점수 1위(동점 포함) — ★ 표시·세션 '최다 MVP' 집계용
  for (const g of schedule.groups) {
    const ids = activeIdsOf(g);
    const max = Math.max(0, ...ids.map((id) => baseParts[id]?.sum ?? 0));
    if (max > 0)
      for (const id of ids)
        if ((baseParts[id]?.sum ?? 0) === max) {
          mvpPts[id] = 1;
          mvpWinners.push(id);
        }
  }
  const activeStudents = students.filter((s) => !s.inactive && !absentSet.has(s.id));
  const classMax = Math.max(0, ...activeStudents.map((s) => baseParts[s.id]?.sum ?? 0));
  const classTop =
    classMax > 0
      ? activeStudents.filter((s) => baseParts[s.id]?.sum === classMax).map((s) => s.id)
      : [];
  // 학급 1위는 모둠 1위(+1)를 겸하므로, 학급 가산 +1을 더해 합 +2 (사용자 확정)
  for (const id of classTop) mvpPts[id] = (mvpPts[id] ?? 0) + 1;

  const rows: Record<number, DailyScoreRow> = {};
  for (const s of students) {
    const b = baseParts[s.id];
    const mvp = (mvpPts[s.id] ?? 0) * ev.mvp; // 이벤트 배수 (MVP 점수)
    rows[s.id] = {
      peer: b.peer,
      groupRank: b.groupRank,
      bonus: b.bonus,
      mission: b.mission,
      comp: b.comp,
      boss: b.boss,
      mvp,
      read: b.read,
      best: 0, // 오늘의 모둠 보너스는 아래에서 선정 후 가산
      total: b.sum + mvp,
    };
  }

  // 5-2) '오늘의 모둠' 타이틀 — 모둠 점수(groupDayScore 규칙) 1위가 자동으로 받는다.
  //      규칙(사용자 확정): 내부 상호평가(peer·boss)·MVP는 개인 점수 전용(담합 방지),
  //      선생님 순위·칭찬 미션은 모둠당 1회, 독서·보너스는 합산.
  //      개인 행(rows)은 전 항목 각자 그대로 — 개인 점수는 바뀌지 않는다.
  //      best(오늘의 모둠 보너스)는 아직 0이라 모둠 점수·MVP 판정에 영향 없음(순환 차단).
  const groupSums: Record<number, number> = {};
  for (const g of schedule.groups) {
    const ids = activeIdsOf(g);
    groupSums[g.groupId] = groupDayScore(rows as unknown as Record<string, unknown>, ids).total;
  }
  const bestSum = Math.max(0, ...Object.values(groupSums));
  const autoBestGroups =
    bestSum > 0
      ? Object.entries(groupSums)
          .filter(([, v]) => v === bestSum)
          .map(([k]) => Number(k))
      : [];

  // 5-3) 오늘의 모둠 → 개인 +1 (맨 마지막 가산 — 사용자 확정).
  //      모둠 점수·MVP 선정이 모두 끝난 뒤라 이 보너스가 그 판정에 되먹임되지 않는다.
  const bestGroupSet = new Set(autoBestGroups);
  for (const s of students) {
    if (
      bestGroupSet.has(groupOfStudent[s.id]) &&
      !studentById.get(s.id)?.inactive &&
      !absentSet.has(s.id)
    ) {
      rows[s.id].best = 1;
      rows[s.id].total += 1;
    }
  }

  // 6) 저장: 그날 문서 1개 + 누적 문서 1개 (이전 집계분 빼고 더해 멱등)
  type CumDoc = Record<string, number> & {
    mvpWins?: Record<string, number>;
    mvpVotesTotal?: Record<string, number>;
    bestGroupWins?: Record<string, number>; // 오늘의 모둠(autoBest)에 든 횟수 — 팀 기여도
    // 이 외에 칭찬 연속 보너스 상태 필드(compStreak*, compBonusToday)가 함께 저장된다
  };
  const cum = (cumSnap.exists() ? cumSnap.data() : {}) as CumDoc;
  const prevMeta =
    (prevSnap.exists()
      ? (prevSnap.data()._meta as
          | {
              mvpVotes?: Record<string, number>;
              mvpWinners?: number[];
              autoBestGroups?: number[];
              autoBestMembers?: number[]; // 그 날 best=1 받은 실제 명단 (재집계 차감용)
              groupSums?: Record<string, number>;
              groupCumApplied?: boolean;
            }
          | undefined)
      : undefined) ?? {};
  const mvpWins = { ...cum.mvpWins };
  const mvpVotesTotal = { ...cum.mvpVotesTotal };
  for (const w of prevMeta.mvpWinners ?? []) mvpWins[String(w)] = (mvpWins[String(w)] ?? 0) - 1;
  for (const [sid, n] of Object.entries(prevMeta.mvpVotes ?? {}))
    mvpVotesTotal[sid] = (mvpVotesTotal[sid] ?? 0) - n;
  for (const w of mvpWinners) mvpWins[String(w)] = (mvpWins[String(w)] ?? 0) + 1;
  for (const [sid, n] of Object.entries(mvpVotes))
    mvpVotesTotal[String(sid)] = (mvpVotesTotal[String(sid)] ?? 0) + n;

  // 오늘의 모둠 포함 횟수(팀 기여도) — 실제 오늘의 모둠(autoBestGroups) 모둠원 전원 +1.
  // 멱등: 같은 날 재집계 시 이전에 실제로 준 명단(_meta.autoBestMembers)을 빼고 새로 더한다.
  //   ※ 명단을 그때그때 activeIdsOf로 다시 계산하면, 결석이 두 집계 사이에 바뀔 때
  //     차감 집합과 가산 집합이 어긋나 유령 카운트가 남는다 → 저장된 명단으로 차감해야 안전.
  //     (구버전 문서엔 명단이 없으니 autoBestGroups로 폴백 — 그 시점엔 결석 개념이 없었음)
  const membersOfGid = (gid: number) => {
    const g = schedule.groups.find((x) => x.groupId === gid);
    return g ? activeIdsOf(g) : [];
  };
  const autoBestMembers = autoBestGroups.flatMap(membersOfGid);
  const prevBestMembers =
    prevMeta.autoBestMembers ?? (prevMeta.autoBestGroups ?? []).flatMap(membersOfGid);
  const bestGroupWins = { ...cum.bestGroupWins };
  for (const sid of prevBestMembers)
    bestGroupWins[String(sid)] = (bestGroupWins[String(sid)] ?? 0) - 1;
  for (const sid of autoBestMembers)
    bestGroupWins[String(sid)] = (bestGroupWins[String(sid)] ?? 0) + 1;

  for (const s of students) {
    const prevTotal = (prevRows[String(s.id)] as DailyScoreRow | undefined)?.total ?? 0;
    cum[String(s.id)] = (cum[String(s.id)] ?? 0) - prevTotal + rows[s.id].total;
  }

  // 누적 모둠 점수 — 일일 모둠 점수(순위 1회 반영)를 모둠 자리(1~5)별로 누적.
  // 개인 누적의 합은 순위 점수가 인원수만큼 들어가 대항전 지표로 부적합 (사용자 확정).
  // 멱등: 이 날이 이전 집계에서 누적에 반영됐으면(groupCumApplied) 그 몫을 빼고 새로 더한다.
  {
    const cumAny = cum as Record<string, unknown>;
    const groupCum = { ...((cumAny.groupCum as Record<string, number> | undefined) ?? {}) };
    const prevGS = prevMeta.groupCumApplied ? (prevMeta.groupSums ?? {}) : {};
    for (const g of schedule.groups) {
      const k = String(g.groupId);
      groupCum[k] = (groupCum[k] ?? 0) - (Number(prevGS[k]) || 0) + (groupSums[g.groupId] ?? 0);
    }
    cumAny.groupCum = groupCum;
    cumAny.groupCumRule = 2; // 회계 규칙 버전 — autoRun이 구규칙 누적을 감지해 재전환하는 마커
  }

  // ── 칭찬 연속 보너스 (사용자 확정) ─────────────────────────────
  // 학사일(평가 제출이 있는 날) 기준으로 칭찬을 연속으로 보내면:
  //   5일 연속 도달 시 +1점 · 10일 연속 도달 시 +2점 (누적 점수 직접 가산).
  // 세션(기)이 바뀌면 연속이 리셋된다 (월~금 ×2주 = 10일이 만점).
  // 멱등 장치: 같은 날 재집계 시 compStreakPrev(전날 상태)에서 다시 계산하고,
  // 그날 이미 준 보너스(compBonusToday)를 빼고 새로 더한다. 과거 날짜 재집계는 건드리지 않음.
  const compStreakBonus: Record<string, number> = {};
  {
    const cumAny = cum as Record<string, unknown>;
    const period = periodOfWeek(week);
    const streakDay = (cumAny.compStreakDay as string) ?? "";
    const isSchoolDay = evalSnap.size > 0;
    if (date >= streakDay) {
      const sameDay = streakDay === date;
      let base =
        (sameDay
          ? (cumAny.compStreakPrev as Record<string, number>)
          : (cumAny.compStreak as Record<string, number>)) ?? {};
      const oldBonus = sameDay ? ((cumAny.compBonusToday as Record<string, number>) ?? {}) : {};
      // 새 기(세션) 진입 — 연속 리셋 (같은 날 재집계는 이미 리셋된 base라 통과)
      if (!sameDay && ((cumAny.compStreakPeriod as number) ?? period) !== period) base = {};

      const senders = new Set(compliments.map((c) => c.from));
      const newStreak: Record<string, number> = {};
      const newBonus: Record<string, number> = {};
      for (const s of students) {
        const sid = String(s.id);
        const prev = base[sid] ?? 0;
        // 결석은 연속을 끊지 않는다 — 아파서 못 온 날 스트릭이 0이 되지 않게 유지(사용자 확정)
        const absent = absentSet.has(s.id);
        const next = absent ? prev : isSchoolDay ? (senders.has(s.id) ? prev + 1 : 0) : prev;
        if (next > 0) newStreak[sid] = next;
        if (isSchoolDay && !absent) {
          if (next === 5) newBonus[sid] = 1;
          else if (next === 10) newBonus[sid] = 2;
          if (newBonus[sid]) compStreakBonus[sid] = newBonus[sid];
        }
      }
      for (const sid of new Set([...Object.keys(oldBonus), ...Object.keys(newBonus)])) {
        cum[sid] = (cum[sid] ?? 0) - (oldBonus[sid] ?? 0) + (newBonus[sid] ?? 0);
      }
      cumAny.compStreak = newStreak;
      cumAny.compStreakPrev = base;
      cumAny.compStreakDay = date;
      cumAny.compStreakPeriod = period;
      cumAny.compBonusToday = newBonus;
    }
  }

  await Promise.all([
    setDoc(doc(d, "dailyScores", date), {
      ...rows,
      _meta: {
        aggregatedAt: Date.now(),
        ranks, // 교사 순위 (점수 배분용 — 타이틀과 분리)
        mvpVotes, // 오늘의 부서장 득표 (1표당 +1점)
        mvpWinners, // 점수 MVP — 모둠별 1위 (동점 포함)
        classTop, // 학급 전체 1위 (+2 추가 대상)
        bossWinners, // 오늘의 부서장 (투표 최다 — 고정 +1점)
        bossReasons, // 부서장 투표 이유 (인기투표 억제 근거 — 리포트 표시)
        autoBestGroups, // 오늘의 모둠 — 최종 총점 모둠 합계 1위 (자동 타이틀)
        autoBestMembers, // best=1 받은 실제 명단 (재집계 시 결석 변동에도 멱등 차감)
        groupSums, // 모둠별 총점 합계 (순위 1회 반영 — 리포트·누적 모둠 점수 재료)
        groupCumApplied: true, // 이 날 몫이 누적 모둠 점수에 반영됨 (재집계 멱등 마커)
        missionGroups,
        peerDetail, // 부서장 평가 O/X 상세 (수신자별 — 실명 공개·이의제기용)
        compliments,
        peerSuggestions,
        toTeacher,
        reflections, // 세션 모둠 반성 — 세션 리포트 인쇄에 수록
      },
    }),
    setDoc(doc(d, "dailyScores", "_cumulative"), {
      ...cum,
      mvpWins,
      mvpVotesTotal,
      bestGroupWins,
    }),
  ]);

  // 마일스톤 보상 — 누적 점수 25점 단위 실버 자동 지급 (+실버 25개 단위 학급 골드)
  const ms = await grantMilestones(cum, {}, "🏅 점수 25점 달성 보상");

  return {
    date,
    evaluatorCount: evalSnap.size,
    groupRanks: ranks,
    milestoneSilver: ms.silver,
    milestoneGold: ms.gold,
    compStreakBonus,
  };
}

/** 주차 → 격주 기간 번호 (1~11) */
export function periodOfWeek(week: number): number {
  return Math.floor((week - 1) / 2) + 1;
}

export function dateRangeOfPeriod(period: number): [string, string] {
  const first = scheduleOfWeek(period * 2 - 1).weekStart;
  const lastWeek = Math.min(period * 2, TOTAL_WEEKS);
  const end = new Date(scheduleOfWeek(lastWeek).weekStart + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  return [first, end.toISOString().slice(0, 10)];
}

// ── 세션(2주) 자동 보상 정산 ───────────────────────────────────
// · 최다 MVP(그날 점수 모둠 1위 횟수 최다) → 실버 1개
// · 성장상: 지난 세션 대비 세션 총점 상승폭 최다(양수만, 동점 모두) → 실버 1개 (2기부터)
// · 최고 모둠(1위 최다) → 모둠원 전원 실버 1개
// · 최다 거북이독서(두 주 합산 권수 최다) → 실버 1개
// · 주간 최다 독서 모둠(각 주 감상문 권수 합 1위) → 모둠원 전원 실버 1개 (주마다 — 두 주면 최대 2개)
// · 최다 칭찬미션 모둠(미션 달성 일수 최다) → 모둠원 전원 실버 1개
// · 독서 스트릭: 주간 목표 달성 주마다 연속 주수만큼 보너스 점수(누적 가산) (1주=1, 2주=2, 3주+=3 상한)
// 멱등: biweeklyScores/session-{period} 마커 재사용(신규 규칙 불필요). 세션 종료 후 월요일에 실행.
export interface SessionSettleResult {
  period: number;
  range: [string, string];
  mvps: number[];
  bestGroups: number[];
  bestGroupMembers: number[];
  readingTop: number[]; // 최다 독서
  readingTopGroups: number[]; // 주간 최다 독서 모둠 (두 주 합집합 — 표시용)
  readingTopGroupMembers: number[]; // 지급 대상 (주별 — 두 주 모두 1위면 같은 학생이 2번)
  missionTopGroups: number[]; // 최다 미션 모둠
  missionTopMembers: number[];
  growthTop: number[]; // 성장상 — 지난 세션 대비 총점 상승폭 최다 (2기부터)
  streakPoints: Record<string, number>; // studentId → 스트릭 보너스(누적 점수 가산)
  alreadySettled: boolean;
}

const STREAK_CAP = 3; // 스트릭 보상 상한 (주당 최대 보너스 점수)

/** 최댓값(>0)을 가진 키들 (동점 모두, 전부 0이면 빈 배열) */
function topKeys(counts: Record<number, number>): number[] {
  const max = Math.max(0, ...Object.values(counts));
  if (max <= 0) return [];
  return Object.entries(counts)
    .filter(([, v]) => v === max)
    .map(([k]) => Number(k));
}

export async function settleSession(period: number): Promise<SessionSettleResult> {
  return withAggLock(`settle:${period}`, () => settleSessionInner(period));
}

async function settleSessionInner(period: number): Promise<SessionSettleResult> {
  const d = db();
  const [start, end] = dateRangeOfPeriod(period);
  const marker = doc(d, "biweeklyScores", `session-${period}`);

  const existing = await getDoc(marker);
  if (existing.exists() && existing.data().awardedAt) {
    const data = existing.data();
    return {
      period,
      range: [start, end],
      mvps: data.mvps ?? [],
      bestGroups: data.bestGroups ?? [],
      bestGroupMembers: data.bestGroupMembers ?? [],
      readingTop: data.readingTop ?? [],
      readingTopGroups: data.readingTopGroups ?? [],
      readingTopGroupMembers: data.readingTopGroupMembers ?? [],
      missionTopGroups: data.missionTopGroups ?? [],
      missionTopMembers: data.missionTopMembers ?? [],
      growthTop: data.growthTop ?? [],
      streakPoints: data.streakPoints ?? {},
      alreadySettled: true,
    };
  }

  // 기간 내 일일 집계 문서(최대 14개) + 독서 통계·설정 (교사 1회)
  const [snap, statsSnap, settingsSnap] = await Promise.all([
    getDocs(
      query(
        collection(d, "dailyScores"),
        where(documentId(), ">=", start),
        where(documentId(), "<=", end)
      )
    ),
    getDoc(doc(d, "readingStats", "main")),
    getDoc(doc(d, "classData", "settings")),
  ]);
  const mvpCount: Record<number, number> = {};
  const rank1Count: Record<number, number> = {};
  const missionCount: Record<number, number> = {};
  const sessionTotals: Record<number, number> = {}; // 성장상 계산용 — 이번 세션 총점
  snap.forEach((day) => {
    const data = day.data();
    const meta = (data._meta ?? {}) as {
      mvpWinners?: number[];
      ranks?: Record<string, number>;
      autoBestGroups?: number[];
      missionGroups?: number[];
    };
    for (const w of meta.mvpWinners ?? []) mvpCount[w] = (mvpCount[w] ?? 0) + 1;
    // 오늘의 모둠 횟수 — 자동 타이틀(총점 합계 1위)이 있으면 그것, 없으면(구버전) 교사 1위
    if (meta.autoBestGroups?.length) {
      for (const g of meta.autoBestGroups) rank1Count[g] = (rank1Count[g] ?? 0) + 1;
    } else {
      for (const [g, r] of Object.entries(meta.ranks ?? {}))
        if (r === 1) rank1Count[Number(g)] = (rank1Count[Number(g)] ?? 0) + 1;
    }
    for (const g of meta.missionGroups ?? []) missionCount[g] = (missionCount[g] ?? 0) + 1;
    for (const s of students) {
      const row = data[String(s.id)] as DailyScoreRow | undefined;
      if (row?.total != null) sessionTotals[s.id] = (sessionTotals[s.id] ?? 0) + row.total;
    }
  });

  const mvps = topKeys(mvpCount);
  const bestGroups = topKeys(rank1Count);
  const missionTopGroups = topKeys(missionCount);

  // 성장상 — 지난 세션 대비 총점 상승폭 최다 (양수만, 동점 모두). 1기는 비교 대상이 없어 없음.
  // 지난 세션 집계 문서(최대 14개)를 정산 때 1회만 추가로 읽는다.
  let growthTop: number[] = [];
  if (period >= 2) {
    const [ps, pe] = dateRangeOfPeriod(period - 1);
    const prevSnap = await getDocs(
      query(
        collection(d, "dailyScores"),
        where(documentId(), ">=", ps),
        where(documentId(), "<=", pe)
      )
    );
    const prevTotals: Record<number, number> = {};
    prevSnap.forEach((day) => {
      const data = day.data();
      for (const s of students) {
        const row = data[String(s.id)] as DailyScoreRow | undefined;
        if (row?.total != null) prevTotals[s.id] = (prevTotals[s.id] ?? 0) + row.total;
      }
    });
    const growth: Record<number, number> = {};
    for (const s of students) {
      const g = (sessionTotals[s.id] ?? 0) - (prevTotals[s.id] ?? 0);
      if (g > 0) growth[s.id] = g;
    }
    growthTop = topKeys(growth);
  }

  // 모둠원 전원 명단 (세션 내 모둠 구성은 고정 — 세션 첫 주 자리표 사용)
  const schedule = scheduleOfWeek(period * 2 - 1);
  const membersOf = (gid: number) => {
    const g = schedule.groups.find((x) => x.groupId === gid);
    return g ? [g.chair, ...g.members.map((m) => m.studentId)] : [];
  };
  const bestGroupMembers = bestGroups.flatMap(membersOf);
  const missionTopMembers = missionTopGroups.flatMap(membersOf);

  // 독서: 최다 독서(두 주 합산 권수 최다) + 스트릭 보상(주간 목표 달성 주마다 연속 주수만큼)
  // 권수는 쓴 만큼 그대로 — 성의 없는 글은 교사가 삭제하면 통계·판정에서 자동 제외된다.
  const quota =
    (settingsSnap.exists() ? (settingsSnap.data().weeklyReadingQuota as number) : undefined) ?? 3;
  const stats = (statsSnap.exists() ? statsSnap.data() : {}) as ReadingStats;
  const w1 = period * 2 - 1;
  const w2 = Math.min(period * 2, TOTAL_WEEKS);

  const readSum: Record<number, number> = {};
  for (const s of students)
    readSum[s.id] = weekBooks(stats, s.id, w1) + (w2 !== w1 ? weekBooks(stats, s.id, w2) : 0);
  const readingTop = topKeys(readSum);

  // 주간 최다 독서 모둠 — 각 주별 모둠 감상문 권수 합 1위 모둠 전원 실버 1개 (사용자 요청).
  // "주마다" 주는 보상이라 두 주 모두 1위면 그 모둠원은 2개 (전출 학생은 지급 제외).
  const readingTopGroupMembers: number[] = [];
  const readingTopGroupSet = new Set<number>();
  const activeMembersOf = (gid: number) =>
    membersOf(gid).filter((id) => !studentById.get(id)?.inactive);
  for (const w of w2 !== w1 ? [w1, w2] : [w1]) {
    const groupBooks: Record<number, number> = {};
    for (const g of schedule.groups)
      groupBooks[g.groupId] = activeMembersOf(g.groupId).reduce(
        (a, id) => a + weekBooks(stats, id, w),
        0
      );
    for (const gid of topKeys(groupBooks)) {
      readingTopGroupSet.add(gid);
      readingTopGroupMembers.push(...activeMembersOf(gid));
    }
  }
  const readingTopGroups = [...readingTopGroupSet];

  // 스트릭 보상은 실버가 아닌 '보너스 점수'(누적 점수 가산) — 1주=1, 2주 연속=2, 상한 STREAK_CAP
  const streakPoints: Record<string, number> = {};
  if (quota > 0) {
    for (const s of students) {
      let award = 0;
      for (const w of w2 !== w1 ? [w1, w2] : [w1]) {
        const st = streakAtWeek(stats, s.id, quota, w);
        if (st > 0) award += Math.min(st, STREAK_CAP);
      }
      if (award > 0) streakPoints[String(s.id)] = award;
    }
  }

  // 실버 지급 개수 (최다 MVP 1 + 최고모둠 1 + 최다독서 1 + 주간독서모둠 주당 1 + 최다미션모둠 1 + 성장상 1)
  const grant: Record<number, number> = {};
  for (const sid of mvps) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of bestGroupMembers) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of readingTop) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of readingTopGroupMembers) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of missionTopMembers) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of growthTop) grant[sid] = (grant[sid] ?? 0) + 1;

  const entries = Object.entries(grant);
  const hasStreak = Object.keys(streakPoints).length > 0;
  // 지급 대상이 전혀 없으면 마커를 남기지 않아 재실행 가능하게 둔다
  if (entries.length === 0 && !hasStreak) {
    return {
      period,
      range: [start, end],
      mvps: [],
      bestGroups: [],
      bestGroupMembers: [],
      readingTop: [],
      readingTopGroups: [],
      readingTopGroupMembers: [],
      missionTopGroups: [],
      missionTopMembers: [],
      growthTop: [],
      streakPoints: {},
      alreadySettled: false,
    };
  }
  // 마커 선점 — 지급 '전'에 awardedAt부터 기록해, 두 실행(자동+수동, 탭 2개)이
  // 겹쳐도 한쪽만 지급한다. 회수 불가 시스템이라 이중 지급이 최악의 사고.
  const claimed = await runTransaction(d, async (tx) => {
    const snap = await tx.get(marker);
    if (snap.exists() && snap.data().awardedAt) return false;
    tx.set(marker, { awardedAt: Date.now(), range: [start, end] });
    return true;
  });
  if (!claimed) {
    return {
      period,
      range: [start, end],
      mvps,
      bestGroups,
      bestGroupMembers,
      readingTop,
      readingTopGroups,
      readingTopGroupMembers,
      missionTopGroups,
      missionTopMembers,
      growthTop,
      streakPoints,
      alreadySettled: true,
    };
  }

  for (const [sid, n] of entries) {
    await addDoc(collection(d, "coinTxns"), {
      studentId: Number(sid),
      amount: n,
      item: `세션 보상 (${period}기)`,
      type: "mvp",
      status: "approved",
      createdAt: Date.now(),
    });
  }
  if (entries.length) {
    await setDoc(
      doc(d, "coinTxns", "0_balances"),
      Object.fromEntries(entries.map(([sid, n]) => [sid, increment(n)])),
      { merge: true }
    );
  }
  // 스트릭 보너스 → 누적 점수에 가산 (일일 재집계는 델타 방식이라 이 가산은 보존됨)
  if (hasStreak) {
    await setDoc(
      doc(d, "dailyScores", "_cumulative"),
      Object.fromEntries(Object.entries(streakPoints).map(([sid, n]) => [sid, increment(n)])),
      { merge: true }
    );
  }
  // 세션 보상 실버도 '실버 25개 → 골드' 마일스톤에 누적 (문서 1회 재읽기 — 교사 경로)
  if (entries.length) {
    const cumSnap = await getDoc(doc(d, "dailyScores", "_cumulative"));
    await grantMilestones(
      cumSnap.exists() ? cumSnap.data() : {},
      Object.fromEntries(entries.map(([sid, n]) => [sid, n])),
      "🏅 점수 25점 달성 보상"
    );
  }
  // 선점 시 만든 마커에 결과 상세를 병합 (awardedAt은 선점 시각 유지)
  await setDoc(
    marker,
    {
      mvps,
      bestGroups,
      bestGroupMembers,
      readingTop,
      readingTopGroups,
      readingTopGroupMembers,
      missionTopGroups,
      missionTopMembers,
      growthTop,
      streakPoints,
      mvpCount,
      rank1Count,
      completedAt: Date.now(),
    },
    { merge: true }
  );

  return {
    period,
    range: [start, end],
    mvps,
    bestGroups,
    bestGroupMembers,
    readingTop,
    readingTopGroups,
    readingTopGroupMembers,
    missionTopGroups,
    missionTopMembers,
    growthTop,
    streakPoints,
    alreadySettled: false,
  };
}

// ── 교사 보너스 점수 (델타 증감 — UI 문구 "더하거나 뺍니다"와 동일 의미) ──
// 단일 트랜잭션: 일일 행과 누적을 같이 읽고 같이 쓴다.
// (기존엔 절대값 대입 + 비트랜잭션이라, 재집계와 겹치면 누적이 어긋나거나
//  같은 값을 두 번 눌러도 티가 안 나는 문제가 있었다)
// 반환값: 반영 후 그날의 보너스 합계.
export async function addBonus(date: string, studentId: number, delta: number): Promise<number> {
  return withAggLock(`bonus:${date}:${studentId}`, async () => {
    const d = db();
    const dayRef = doc(d, "dailyScores", date);
    const cumRef = doc(d, "dailyScores", "_cumulative");
    return runTransaction(d, async (tx) => {
      const [daySnap, cumSnap] = await Promise.all([tx.get(dayRef), tx.get(cumRef)]);
      const day = daySnap.exists() ? daySnap.data() : {};
      const prevRow = (day[String(studentId)] as DailyScoreRow | undefined) ?? {
        peer: 0,
        groupRank: 0,
        bonus: 0,
        total: 0,
      };
      const newBonus = (prevRow.bonus ?? 0) + delta;
      // total은 전 항목 합 — boss·best를 빠뜨리면 교사 보너스를 줄 때 그 학생의
      // 부서장·오늘의 모둠 점수가 사라진다 (기존 boss 누락 버그도 함께 수정).
      const newRow: DailyScoreRow = {
        ...prevRow,
        bonus: newBonus,
        total:
          prevRow.peer +
          prevRow.groupRank +
          newBonus +
          (prevRow.mission ?? 0) +
          (prevRow.comp ?? 0) +
          (prevRow.boss ?? 0) +
          (prevRow.mvp ?? 0) +
          (prevRow.read ?? 0) +
          (prevRow.best ?? 0),
      };
      const cum = cumSnap.exists() ? cumSnap.data() : {};
      const prevCum =
        typeof cum[String(studentId)] === "number" ? (cum[String(studentId)] as number) : 0;
      tx.set(dayRef, { [String(studentId)]: newRow }, { merge: true });
      tx.set(cumRef, { [String(studentId)]: prevCum - prevRow.total + newRow.total }, { merge: true });
      return newBonus;
    });
  });
}

// ── 베스트플레이어(오늘의 모둠 포함 횟수) 재계산 (교사 도구) ────────────────
// 저장된 모든 일일 집계 문서를 훑어 '그날 오늘의 모둠(모둠 총점 1위)' 모둠원을 세어
// _cumulative.bestGroupWins를 통째로 다시 쓴다. 집계 로직 변경·초기화로 카운터가
// 비거나 어긋났을 때 한 번에 복구하는 옵트인 도구 (교사 화면에서만 실행).
export async function recomputeBestGroupWins(): Promise<Record<string, number>> {
  const d = db();
  const snap = await getDocs(collection(d, "dailyScores"));
  const wins: Record<string, number> = {};
  for (const day of snap.docs) {
    if (day.id.startsWith("_")) continue; // _cumulative 등 메타 문서 제외
    const data = day.data() as Record<string, unknown> & {
      _meta?: { autoBestMembers?: number[] };
    };
    let members: number[] = [];
    if (data._meta?.autoBestMembers?.length) {
      members = data._meta.autoBestMembers; // 집계가 저장한 실제 명단 우선
    } else {
      // 구버전 문서(명단 없음)는 저장된 rows에서 그날 오늘의 모둠을 재계산
      const schedule = scheduleOfWeek(weekOfDate(day.id, SEMESTER_START, TOTAL_WEEKS));
      const activeIdsOf = (g: { chair: number; members: { studentId: number }[] }) =>
        [g.chair, ...g.members.map((m) => m.studentId)].filter(
          (id) => !studentById.get(id)?.inactive
        );
      const groupSums: Record<number, number> = {};
      for (const g of schedule.groups)
        groupSums[g.groupId] = groupDayScore(data, activeIdsOf(g)).total;
      const bestSum = Math.max(0, ...Object.values(groupSums));
      if (bestSum > 0)
        for (const g of schedule.groups)
          if (groupSums[g.groupId] === bestSum) members.push(...activeIdsOf(g));
    }
    for (const sid of members) wins[String(sid)] = (wins[String(sid)] ?? 0) + 1;
  }
  await setDoc(doc(d, "dailyScores", "_cumulative"), { bestGroupWins: wins }, { merge: true });
  return wins;
}
