"use client";
// 자동 집계·정산 — 교사 화면이 열릴 때 밀린 작업을 스스로 처리한다 (서버·크론 불필요).
//   · 일일 집계: 자정이 지나 '확정된' 날(어제까지)을 하루 단위로 자동 집계.
//     오늘 것은 자동으로 하지 않는다 — 아직 기록이 쌓이는 중이라 수동 실행(순위 저장 후)이 기준.
//   · 세션 정산: 일요일 자정 기준 — 세션이 끝난 다음 날부터 자동 실행 (주말 독서까지 포함).
//   · 재집계 요청(redoDates): 학생이 과거 날짜 감상문을 삭제하면 그 날짜가 마커에 쌓이고,
//     다음 교사 접속 때 그날만 다시 집계한다 (점수·마일스톤 근거 최신화).
// 하루 1회만 (classData/autoRun 마커를 트랜잭션으로 선점 → 탭 2개여도 이중 정산 없음).
// 단, redoDates가 남아 있으면 이미 오늘 실행했어도 그 날짜들만 추가 처리한다.
// 모든 작업이 멱등이라 수동 실행과 겹쳐도 점수가 어긋나지 않는다.
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { kstDateOf, shiftDate, todayKST } from "@/lib/date";
import {
  aggregateDate,
  dateRangeOfPeriod,
  DAILY_READ_CAP,
  payVacationReading,
  READ_POINTS_PER_BOOK,
  reaggregateReadingDates,
  settleSession,
  type SessionSettleResult,
  type VacationReadResult,
} from "@/lib/aggregate";
import { eventMultipliers, type EventBoost } from "@/lib/eventBoost";
import { students } from "@/lib/roster";
import type { ClassSettings } from "@/types";

const MAX_BACKFILL_DAYS = 14; // 오래 접속 안 했을 때 소급 집계 상한 (읽기 예산 보호)
const TOTAL_PERIODS = 11;
// 거북이 응원 깜짝 이벤트 — 10,000클릭 달성 시 학급 골드 +5 (1회성, 사용자 확정)
export const CLICK_EVENT_GOAL = 10000;
export const CLICK_EVENT_GOLD = 5;

export interface AutoRunResult {
  aggregatedDates: string[];
  settledPeriods: number[];
  settleResults: SessionSettleResult[];
  /** 감상문 삭제로 재집계된 날짜들 */
  redoneDates: string[];
  /** 평가는 있었는데 교사 순위(오늘의 모둠)가 없어 순위 점수 0으로 집계된 날짜들 — 경고 대상 */
  missedRankDates: string[];
  /** 소급 상한(14일)에 걸려 집계를 건너뛴 구간 (없으면 undefined) */
  skippedRange?: { from: string; to: string; days: number };
  /** 거북이 응원 클릭 10,000번 달성으로 지급된 학급 골드 */
  clickGold?: number;
  /** 예전 방학 마커 적립분 정리(일일 점수 이관으로 되돌림) 결과 */
  vacationRead?: VacationReadResult;
  /** 독서 일일점수 스윕으로 재집계된 날짜들 (마이그레이션·베타 초기화 복원) */
  readMigratedDates?: string[];
  /** 누적 모둠 점수(groupCum) 자동 마이그레이션 실행됨 — 화면 캐시 무효화 필요 */
  groupCumMigrated?: boolean;
  /** 🩺 독서 점수 자가 점검이 불일치를 찾아 자동 재집계한 날짜들 */
  healedDates?: string[];
  /** ⚖️ 주간 누적 정합 점검이 찾은 표류 학생 (이름 · 차이) — 자동 보정 없이 경고만 */
  cumDrift?: { name: string; diff: number }[];
}

/**
 * ⚖️ 누적 점수 정합 점검 (주 1회) — Σ일별 총점 + Σ스트릭 보너스 vs 누적 문서.
 * aggregateDate가 일일 문서와 누적 문서를 따로 쓰기 때문에, 그 사이에 죽으면
 * 델타 방식 특성상 재집계로도 복구되지 않는 영구 표류가 생길 수 있다 — 여기서 잡는다.
 * 점수는 교사 결정 사항이라 자동 보정하지 않고 경고만 (점수 진단의 보정 버튼으로 처리).
 * 비용: dailyScores·biweeklyScores 전량 (주 1회, 학기말 ~130문서) — 읽기 예산 안.
 */
async function findCumDrift(d: Firestore): Promise<{ name: string; diff: number }[]> {
  const [days, markers] = await Promise.all([
    getDocs(collection(d, "dailyScores")),
    getDocs(collection(d, "biweeklyScores")),
  ]);
  let cum: Record<string, unknown> = {};
  const sums: Record<string, number> = {};
  days.forEach((snap) => {
    if (snap.id === "_cumulative") {
      cum = snap.data();
      return;
    }
    const data = snap.data() as Record<string, { total?: number } | unknown>;
    for (const s of students) {
      const row = data[String(s.id)] as { total?: number } | undefined;
      // 전입 학생은 초기화일 이전의 옛 주인 기록을 세지 않는다 (아래 transferResetOn 제외와 병행)
      if (row && typeof row === "object" && typeof row.total === "number")
        sums[String(s.id)] = (sums[String(s.id)] ?? 0) + row.total;
    }
  });
  const streaks: Record<string, number> = {};
  markers.forEach((m) => {
    const sp = (m.data().streakPoints ?? {}) as Record<string, number>;
    for (const [sid, n] of Object.entries(sp)) streaks[sid] = (streaks[sid] ?? 0) + n;
  });
  const resetOn = (cum.transferResetOn as Record<string, string>) ?? {};
  const drift: { name: string; diff: number }[] = [];
  for (const s of students) {
    const sid = String(s.id);
    if (s.inactive || resetOn[sid]) continue; // 전출·전입 학생은 정상적 불일치 — 제외
    const expected = (sums[sid] ?? 0) + (streaks[sid] ?? 0);
    const actual = typeof cum[sid] === "number" ? (cum[sid] as number) : 0;
    const diff = Math.round((actual - expected) * 100) / 100;
    if (Math.abs(diff) >= 0.5) drift.push({ name: s.name, diff }); // 반올림 잡음 무시
  }
  return drift;
}

/**
 * 🩺 독서 점수 자가 점검 — 최근 날짜의 '집계된 read 점수'와 '실제 감상문 수'를 대조한다.
 * 삭제·수정이 재집계로 이어지지 못한 사고(잠금 경합, 인증 유실, 큐 유실)가 나면
 * 점수표에 옛 값이 조용히 남는다 — 여기서 잡아 그 날짜만 재집계 큐에 올린다.
 * 비용: 감상문 범위 쿼리 1번 + 문서 N+1개 (하루 1회, 교사) — 읽기 예산 안.
 */
async function findStaleReadDates(d: Firestore, days: string[]): Promise<string[]> {
  if (!days.length) return [];
  const fromMs = new Date(days[0] + "T00:00:00+09:00").getTime();
  const toMs = new Date(days[days.length - 1] + "T00:00:00+09:00").getTime() + 86400000;
  const [reportsSnap, evSnap, ...daySnaps] = await Promise.all([
    getDocs(
      query(
        collection(d, "readingReports"),
        where("createdAt", ">=", fromMs),
        where("createdAt", "<", toMs)
      )
    ),
    getDoc(doc(d, "classData", "eventBoost")),
    ...days.map((day) => getDoc(doc(d, "dailyScores", day))),
  ]);
  // 날짜별·학생별 실제 감상문 수 (초안 제외 — 집계와 같은 기준)
  const counts: Record<string, Record<string, number>> = {};
  reportsSnap.forEach((r) => {
    const v = r.data();
    if (v.isDraft) return;
    const day = kstDateOf(Number(v.createdAt) || 0);
    const sid = String(v.studentId);
    (counts[day] ??= {})[sid] = (counts[day][sid] ?? 0) + 1;
  });
  const boost = evSnap.exists() ? (evSnap.data() as EventBoost) : undefined;
  const stale: string[] = [];
  days.forEach((day, i) => {
    const snap = daySnaps[i];
    if (!snap.exists()) return; // 아직 집계 전인 날 — 옛 값이 아니라 '없는' 것이니 통과
    const rows = snap.data() as Record<string, unknown>;
    const mult = eventMultipliers(boost, day).read;
    for (const s of students) {
      const row = rows[String(s.id)] as { read?: number } | undefined;
      if (!row || typeof row !== "object") continue;
      const expected =
        Math.min(counts[day]?.[String(s.id)] ?? 0, DAILY_READ_CAP) * READ_POINTS_PER_BOOK * mult;
      if ((row.read ?? 0) !== expected) {
        stale.push(day);
        break; // 이 날짜는 재집계 대상 확정 — 나머지 학생은 볼 필요 없음
      }
    }
  });
  return stale;
}

let inFlight: Promise<AutoRunResult | null> | null = null;

/** 교사 세션에서 하루 1회: 밀린 일일 집계 + 끝난 세션 정산. 이미 실행됐으면 null. */
export function runAutoTasks(settings: ClassSettings): Promise<AutoRunResult | null> {
  // 같은 탭에서의 중복 호출(개발 모드 이중 이펙트 포함)은 같은 실행을 공유
  inFlight ??= doRun(settings).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function doRun(settings: ClassSettings): Promise<AutoRunResult | null> {
  const d = db();
  const today = todayKST();
  const yesterday = shiftDate(today, -1);
  const markerRef = doc(d, "classData", "autoRun");

  // 0) 누적 모둠 점수(groupCum) 마이그레이션 — 누적 문서에 없거나 회계 규칙이
  //    구버전이면 오늘을 재집계해 최신 규칙으로 전환한다. 하루 1회 선점과 무관하게
  //    검사(문서 1개 읽기, 최신이면 no-op) — 교사가 화면만 열어도 전환되게.
  let groupCumMigrated = false;
  try {
    const cumSnap = await getDoc(doc(d, "dailyScores", "_cumulative"));
    if (cumSnap.exists()) {
      const c = cumSnap.data();
      if (!c.groupCum || ((c.groupCumRule as number | undefined) ?? 1) < 2) {
        const r = await aggregateDate(today, settings, { skipIfEmpty: true });
        if (r) groupCumMigrated = true;
      }
    }
  } catch {
    // 실패 시 다음 접속 때 재시도 (멱등)
  }

  // 0.5) 방학 독서 적립 — 하루 1회 선점과 무관하게 '매 접속마다' 돌린다 (멱등·저비용: 2문서 읽고
  //      델타 있을 때만 쓰기). 이렇게 해야 교사가 오늘 이미 접속한 뒤 학생이 감상문을 써도
  //      그 자리에서 개인 누적 점수에 +1/편이 반영된다 (예전엔 선점 게이트 안이라 다음날에야 반영).
  let vacationRead: Awaited<ReturnType<typeof payVacationReading>> = null;
  try {
    vacationRead = await payVacationReading();
  } catch {
    // 실패는 다음 접속 때 재시도 (마커 델타 방식이라 유실 없음)
  }

  // 0.6) 독서 일일점수 스윕 — 감상문 있는 날짜를 전부 재집계해 read(+2/편)를 채운다.
  //      readDailyMigrated 플래그로 1회만 실행. 베타 초기화가 이 플래그를 false로 되돌려
  //      다음 접속 때 자동 복원(점수 초기화 제외 규칙). 하루 1회 선점과 무관 — 밀리면 안 되는 치유.
  let readMigratedDates: string[] = [];
  try {
    const mSnap = await getDoc(markerRef);
    if (!(mSnap.exists() && mSnap.data().readDailyMigrated === true)) {
      await setDoc(markerRef, { readDailyMigrated: true }, { merge: true }); // 선(先)마킹 — 동시 탭 이중 실행 방지
      readMigratedDates = await reaggregateReadingDates(settings);
    }
  } catch {
    // 실패해도 aggregateDate가 멱등이라 다음 시도에 안전하게 재실행 가능
  }

  // 1) 오늘 몫 선점 — 다른 탭/기기가 이미 실행했으면 조용히 종료.
  //    redoDates(감상문 삭제 재집계 요청)는 회수하면서 비운다 — 이중 처리 방지.
  const claimed = await runTransaction(d, async (tx) => {
    const snap = await tx.get(markerRef);
    const m = snap.exists() ? snap.data() : {};
    const redoRaw = Array.isArray(m.redoDates) ? (m.redoDates as unknown[]) : [];
    const redoDates = [...new Set(redoRaw.filter((x): x is string => typeof x === "string" && DATE_RE.test(x)))]
      .filter((date) => date <= today)
      .sort();
    const freshRun = m.lastRunDay !== today;
    if (!freshRun && redoDates.length === 0) return null; // 오늘 이미 실행 + 재집계 요청 없음
    tx.set(markerRef, { lastRunDay: today, redoDates: [] }, { merge: true });
    return {
      freshRun,
      redoDates,
      coveredUntil: (m.coveredUntil as string | undefined) ?? shiftDate(today, -2),
      settledThrough: (m.settledThrough as number | undefined) ?? 0,
      cumCheckedOn: (m.cumCheckedOn as string | undefined) ?? "",
    };
  });
  if (!claimed)
    return groupCumMigrated || vacationRead || readMigratedDates.length
      ? {
          aggregatedDates: [],
          settledPeriods: [],
          settleResults: [],
          redoneDates: [],
          missedRankDates: [],
          groupCumMigrated,
          vacationRead: vacationRead ?? undefined,
          readMigratedDates: readMigratedDates.length ? readMigratedDates : undefined,
        }
      : null;

  const result: AutoRunResult = {
    aggregatedDates: [],
    settledPeriods: [],
    settleResults: [],
    redoneDates: [],
    missedRankDates: [],
    groupCumMigrated,
  };
  // 평가자는 있는데 순위가 비어 있으면 순위 점수가 통째로 0 — 조용히 넘어가지 않고 경고 수집
  const noteMissedRank = (date: string, r: { evaluatorCount: number; groupRanks: Record<number, number> }) => {
    if (r.evaluatorCount > 0 && Object.keys(r.groupRanks).length === 0)
      result.missedRankDates.push(date);
  };

  // 1.5) 🩺 독서 점수 자가 점검 (하루 1회) — 최근 3일 + 오늘의 read 점수를 실제 감상문 수와
  //      대조해 불일치 날짜를 재집계 큐에 합류시킨다. 삭제·수정 반영이 어떤 이유로든 누락돼도
  //      다음 교사 접속에서 스스로 복구된다 (실사례: 삭제된 중복 감상문의 +4 잔존).
  if (claimed.freshRun) {
    try {
      const checkDays = [shiftDate(today, -3), shiftDate(today, -2), yesterday, today];
      const stale = await findStaleReadDates(d, checkDays);
      const fresh = stale.filter((day) => !claimed.redoDates.includes(day));
      if (fresh.length) {
        claimed.redoDates.push(...fresh);
        claimed.redoDates.sort();
        result.healedDates = fresh;
      }
    } catch {
      // 점검 실패는 무시 — 내일 다시 검사 (점검은 보조 안전망)
    }
  }

  // 2) 재집계 요청을 '가장 먼저' 처리 — 선점에서 이미 큐를 비웠으므로, 뒤 단계(백필·정산)가
  //    던지면 요청이 영영 사라진다 (실사례: 감상문 삭제 후 read 점수가 계속 남음).
  //    날짜별로 실패를 잡아 큐에 되돌려, 어떤 실패에도 요청이 유실되지 않게 한다.
  const failedRedos: string[] = [];
  for (const date of claimed.redoDates) {
    try {
      const r = await aggregateDate(date, settings, { skipIfEmpty: true });
      if (r) {
        result.redoneDates.push(date);
        noteMissedRank(date, r);
      }
    } catch {
      failedRedos.push(date); // 잠금 경합 등 — 다음 접속 때 재시도
    }
  }
  if (failedRedos.length) {
    await setDoc(markerRef, { redoDates: arrayUnion(...failedRedos) }, { merge: true }).catch(
      () => {}
    );
  }
  const redone = new Set(result.redoneDates);

  if (claimed.freshRun) {
    // 3) 밀린 일일 집계 — coveredUntil 다음 날부터 어제까지 (기록 없는 날은 건너뜀)
    let from = shiftDate(claimed.coveredUntil, 1);
    const floor = shiftDate(today, -MAX_BACKFILL_DAYS);
    if (from < floor) {
      // 상한에 걸려 버려지는 구간은 결과에 남긴다 — "밀린 날이 그냥 사라지는" 조용한 실패 방지
      const skipTo = shiftDate(floor, -1);
      if (from <= skipTo) {
        let days = 0;
        for (let t = from; t <= skipTo; t = shiftDate(t, 1)) days++;
        result.skippedRange = { from, to: skipTo, days };
      }
      from = floor;
    }
    for (let date = from; date <= yesterday; date = shiftDate(date, 1)) {
      if (redone.has(date)) continue; // 위 재집계에서 방금 처리 — 같은 날 두 번 집계 불필요
      const r = await aggregateDate(date, settings, { skipIfEmpty: true });
      if (r) {
        result.aggregatedDates.push(date);
        noteMissedRank(date, r);
      }
    }

    // 4) 끝난 세션 정산 — 종료일(일요일)이 지난 기를 순서대로 (이미 정산된 기는 멱등 통과)
    let p = claimed.settledThrough + 1;
    while (p <= TOTAL_PERIODS && dateRangeOfPeriod(p)[1] < today) {
      const r = await settleSession(p);
      const granted =
        r.mvps.length > 0 ||
        r.bestGroupMembers.length > 0 ||
        r.readingTop.length > 0 ||
        r.readingTopGroupMembers.length > 0 ||
        r.missionTopMembers.length > 0 ||
        Object.keys(r.streakPoints).length > 0 ||
        Object.keys(r.interest).length > 0;
      if (!r.alreadySettled && granted) {
        result.settledPeriods.push(p);
        result.settleResults.push(r);
      }
      p++;
    }

    // 5) 진행 상황 저장 (다음 실행은 여기서 이어감)
    await setDoc(markerRef, { coveredUntil: yesterday, settledThrough: p - 1 }, { merge: true });
  }

  // 6) 거북이 응원 이벤트 — 목표 클릭 달성 시 학급 골드 +5, 1회성 깜짝 이벤트
  //    목표 횟수는 교사가 도구에서 저장(classData/turtleClicks.goal, 기본 10,000).
  //    지급 후 교사가 '다시 열기'로 재개설 가능 (이스터에그 반복 운영 — 사용자 요청).
  //    지급+마커를 한 트랜잭션으로 — 지급만 되고 마커가 안 남아 다음 날 또 주는 사고 차단.
  try {
    const clickRef = doc(d, "classData", "turtleClicks");
    const paid = await runTransaction(d, async (tx) => {
      const snap = await tx.get(clickRef);
      if (!snap.exists()) return 0;
      const data = snap.data();
      const goal = (data.goal as number) || CLICK_EVENT_GOAL;
      if (((data.count as number) ?? 0) < goal || data.eventGold) return 0;
      tx.set(
        doc(d, "s1Spends", "0_balances"),
        { classGoldEarned: increment(CLICK_EVENT_GOLD) },
        { merge: true }
      );
      tx.set(clickRef, { eventGold: CLICK_EVENT_GOLD }, { merge: true });
      return CLICK_EVENT_GOLD;
    });
    if (paid) result.clickGold = paid;
  } catch {
    // 지급 실패는 다음 접속 때 재시도 (트랜잭션이라 절반만 반영되는 일 없음)
  }

  // 6.5) 방학 마커 정리·독서 스윕은 위 0.5)~0.6)에서 이미 실행됨 — 결과만 옮겨 담는다.
  if (vacationRead) result.vacationRead = vacationRead;
  if (readMigratedDates.length) result.readMigratedDates = readMigratedDates;

  // 7) ⚖️ 누적 정합 점검 — 주 1회 (마지막 점검 후 7일 경과 시). 표류는 경고만, 보정은 교사가.
  if (claimed.freshRun && (!claimed.cumCheckedOn || shiftDate(claimed.cumCheckedOn, 7) <= today)) {
    try {
      const drift = await findCumDrift(d);
      if (drift.length) result.cumDrift = drift;
      await setDoc(markerRef, { cumCheckedOn: today }, { merge: true });
    } catch {
      // 점검 실패는 무시 — 다음 접속 때 재시도 (보조 안전망)
    }
  }

  // (재집계 요청 처리는 2)에서 선(先)수행 — 유실 방지)
  return result;
}
