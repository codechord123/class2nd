// 거북이 독서 스트릭(주간 목표 연속 달성) — readingStats 문서 하나로 계산 (추가 읽기 0).
// 성공 주 = 그 주 '인정 권수' ≥ 주간 목표(quota). 스트릭 = 연속 성공 주 수.
// 파밍 방지: 하루에 몰아 쓴 감상문은 하루 최대 DAILY_READ_CAP권까지만 목표로 인정
//   (byDay 제출일별 권수 기준 — byDay가 없는 옛 주는 byWeek 총권수로 판정해 호환).
import type { ReadingStats } from "@/lib/query/reading";

/** 하루에 주간 목표로 인정되는 최대 권수 (몰아쓰기 차단) */
export const DAILY_READ_CAP = 2;

/**
 * 주 w의 '인정 권수' — 하루 최대 2권 캡 적용 (byDay 없으면 byWeek 총권수로 호환 판정).
 * 교사 ± 보정분(byWeekAdj)은 캡 없이 그대로 더한다 (종이 감상문 인정 등).
 */
export function countedWeekBooks(
  stats: ReadingStats | undefined,
  sid: number,
  w: number
): number {
  const days = stats?.byDay?.[String(w)]?.[String(sid)];
  if (!days) return stats?.byWeek?.[String(w)]?.[String(sid)] ?? 0; // byWeek에는 보정분 포함
  const capped = Object.values(days).reduce(
    (a, n) => a + Math.min(Math.max(n, 0), DAILY_READ_CAP),
    0
  );
  const adj = stats?.byWeekAdj?.[String(w)]?.[String(sid)] ?? 0;
  return Math.max(capped + adj, 0);
}

/** 특정 주(w)까지의 연속 성공 스트릭 — w가 성공이 아니면 0 */
export function streakAtWeek(
  stats: ReadingStats | undefined,
  sid: number,
  quota: number,
  w: number
): number {
  let streak = 0;
  for (let k = w; k >= 1; k--) {
    if (countedWeekBooks(stats, sid, k) >= quota) streak++;
    else break;
  }
  return streak;
}

/**
 * 학생의 현재/최고 스트릭.
 * 현재 스트릭: 진행 중인 주(currentWeek)는 아직 안 끝났으므로 실패로 치지 않는다 —
 *   이번 주를 이미 달성했으면 이번 주까지, 아니면 지난주까지의 연속.
 */
export function readingStreaks(
  stats: ReadingStats | undefined,
  sid: number,
  quota: number,
  currentWeek: number
): { current: number; best: number } {
  if (quota <= 0) return { current: 0, best: 0 };

  const metThisWeek = countedWeekBooks(stats, sid, currentWeek) >= quota;
  const current = metThisWeek
    ? streakAtWeek(stats, sid, quota, currentWeek)
    : streakAtWeek(stats, sid, quota, currentWeek - 1);

  let best = 0;
  for (let w = 1; w <= currentWeek; w++) {
    best = Math.max(best, streakAtWeek(stats, sid, quota, w));
  }
  return { current, best };
}
