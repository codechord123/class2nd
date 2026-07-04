"use client";
// 자동 집계·정산 — 교사 화면이 열릴 때 밀린 작업을 스스로 처리한다 (서버·크론 불필요).
//   · 일일 집계: 자정이 지나 '확정된' 날(어제까지)을 하루 단위로 자동 집계.
//     오늘 것은 자동으로 하지 않는다 — 아직 기록이 쌓이는 중이라 수동 실행(순위 저장 후)이 기준.
//   · 세션 정산: 일요일 자정 기준 — 세션이 끝난 다음 날부터 자동 실행 (주말 독서까지 포함).
// 하루 1회만 (classData/autoRun 마커를 트랜잭션으로 선점 → 탭 2개여도 이중 정산 없음).
// 모든 작업이 멱등이라 수동 실행과 겹쳐도 점수가 어긋나지 않는다.
import { doc, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { shiftDate, todayKST } from "@/lib/date";
import {
  aggregateDate,
  dateRangeOfPeriod,
  settleSession,
  type SessionSettleResult,
} from "@/lib/aggregate";
import type { ClassSettings } from "@/types";

const MAX_BACKFILL_DAYS = 14; // 오래 접속 안 했을 때 소급 집계 상한 (읽기 예산 보호)
const TOTAL_PERIODS = 11;

export interface AutoRunResult {
  aggregatedDates: string[];
  settledPeriods: number[];
  settleResults: SessionSettleResult[];
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

async function doRun(settings: ClassSettings): Promise<AutoRunResult | null> {
  const d = db();
  const today = todayKST();
  const yesterday = shiftDate(today, -1);
  const markerRef = doc(d, "classData", "autoRun");

  // 1) 오늘 몫 선점 — 다른 탭/기기가 이미 실행했으면 조용히 종료
  const claimed = await runTransaction(d, async (tx) => {
    const snap = await tx.get(markerRef);
    const m = snap.exists() ? snap.data() : {};
    if (m.lastRunDay === today) return null;
    tx.set(markerRef, { lastRunDay: today }, { merge: true });
    return {
      coveredUntil: (m.coveredUntil as string | undefined) ?? shiftDate(today, -2),
      settledThrough: (m.settledThrough as number | undefined) ?? 0,
    };
  });
  if (!claimed) return null;

  const result: AutoRunResult = { aggregatedDates: [], settledPeriods: [], settleResults: [] };

  // 2) 밀린 일일 집계 — coveredUntil 다음 날부터 어제까지 (기록 없는 날은 건너뜀)
  let from = shiftDate(claimed.coveredUntil, 1);
  const floor = shiftDate(today, -MAX_BACKFILL_DAYS);
  if (from < floor) from = floor;
  for (let date = from; date <= yesterday; date = shiftDate(date, 1)) {
    const r = await aggregateDate(date, settings, { skipIfEmpty: true });
    if (r) result.aggregatedDates.push(date);
  }

  // 3) 끝난 세션 정산 — 종료일(일요일)이 지난 기를 순서대로 (이미 정산된 기는 멱등 통과)
  let p = claimed.settledThrough + 1;
  while (p <= TOTAL_PERIODS && dateRangeOfPeriod(p)[1] < today) {
    const r = await settleSession(p);
    const granted =
      r.mvps.length > 0 ||
      r.bestGroupMembers.length > 0 ||
      r.readingTop.length > 0 ||
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
  return result;
}
