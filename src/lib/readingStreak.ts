// 거북이 독서 스트릭(주간 목표 연속 달성) — readingStats.byWeek만으로 계산 (추가 읽기 0).
// 성공 주 = 그 주 권수 ≥ 주간 목표(quota). 스트릭 = 연속 성공 주 수.
import type { ReadingStats } from "@/lib/query/reading";

/** 특정 주(w)까지의 연속 성공 스트릭 — w가 성공이 아니면 0 */
export function streakAtWeek(
  byWeek: NonNullable<ReadingStats["byWeek"]>,
  sid: number,
  quota: number,
  w: number
): number {
  let streak = 0;
  for (let k = w; k >= 1; k--) {
    if ((byWeek[String(k)]?.[String(sid)] ?? 0) >= quota) streak++;
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
  const byWeek = stats?.byWeek ?? {};
  if (quota <= 0) return { current: 0, best: 0 };

  const metThisWeek = (byWeek[String(currentWeek)]?.[String(sid)] ?? 0) >= quota;
  const current = metThisWeek
    ? streakAtWeek(byWeek, sid, quota, currentWeek)
    : streakAtWeek(byWeek, sid, quota, currentWeek - 1);

  let best = 0;
  for (let w = 1; w <= currentWeek; w++) {
    best = Math.max(best, streakAtWeek(byWeek, sid, quota, w));
  }
  return { current, best };
}
