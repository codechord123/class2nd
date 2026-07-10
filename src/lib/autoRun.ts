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
import { doc, getDoc, increment, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { shiftDate, todayKST } from "@/lib/date";
import {
  aggregateDate,
  dateRangeOfPeriod,
  payVacationReading,
  settleSession,
  type SessionSettleResult,
  type VacationReadResult,
} from "@/lib/aggregate";
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
  /** 방학 감상문 적립 결과 (0주차 버킷 → 누적 점수 반영) */
  vacationRead?: VacationReadResult;
  /** 누적 모둠 점수(groupCum) 자동 마이그레이션 실행됨 — 화면 캐시 무효화 필요 */
  groupCumMigrated?: boolean;
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
    };
  });
  if (!claimed)
    return groupCumMigrated || vacationRead
      ? {
          aggregatedDates: [],
          settledPeriods: [],
          settleResults: [],
          redoneDates: [],
          missedRankDates: [],
          groupCumMigrated,
          vacationRead: vacationRead ?? undefined,
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

  if (claimed.freshRun) {
    // 2) 밀린 일일 집계 — coveredUntil 다음 날부터 어제까지 (기록 없는 날은 건너뜀)
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
      const r = await aggregateDate(date, settings, { skipIfEmpty: true });
      if (r) {
        result.aggregatedDates.push(date);
        noteMissedRank(date, r);
      }
    }

    // 3) 끝난 세션 정산 — 종료일(일요일)이 지난 기를 순서대로 (이미 정산된 기는 멱등 통과)
    let p = claimed.settledThrough + 1;
    while (p <= TOTAL_PERIODS && dateRangeOfPeriod(p)[1] < today) {
      const r = await settleSession(p);
      const granted =
        r.mvps.length > 0 ||
        r.bestGroupMembers.length > 0 ||
        r.readingTop.length > 0 ||
        r.readingTopGroupMembers.length > 0 ||
        r.missionTopMembers.length > 0 ||
        Object.keys(r.streakPoints).length > 0;
      if (!r.alreadySettled && granted) {
        result.settledPeriods.push(p);
        result.settleResults.push(r);
      }
      p++;
    }

    // 4) 진행 상황 저장 (다음 실행은 여기서 이어감)
    await setDoc(markerRef, { coveredUntil: yesterday, settledThrough: p - 1 }, { merge: true });
  }

  // 5) 거북이 응원 이벤트 — 목표 클릭 달성 시 학급 골드 +5, 1회성 깜짝 이벤트
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

  // 5.5) 방학 독서 적립은 위 0.5)에서 선점과 무관하게 이미 반영됨 — 결과만 옮겨 담는다.
  if (vacationRead) result.vacationRead = vacationRead;

  // 6) 재집계 요청 처리 — 백필에서 방금 집계한 날짜는 제외 (같은 날 두 번 집계 불필요)
  const already = new Set(result.aggregatedDates);
  for (const date of claimed.redoDates) {
    if (already.has(date)) {
      result.redoneDates.push(date);
      continue;
    }
    const r = await aggregateDate(date, settings, { skipIfEmpty: true });
    if (r) {
      result.redoneDates.push(date);
      noteMissedRank(date, r);
    }
  }

  return result;
}
