// 거북이 독서 스트릭(주간 목표 연속 달성) — readingStats 문서 하나로 계산 (추가 읽기 0).
// 성공 주 = 그 주 권수 ≥ 주간 목표(quota). 스트릭 = 연속 성공 주 수.
// 권수는 '쓴 만큼 그대로' 인정 (캡 없음) — 성의 없는 글은 교사가 삭제로 회수.
import type { ReadingStats } from "@/lib/query/reading";

/** 주 w의 권수 (교사 ± 보정 포함 — byWeek에 함께 기록됨) */
export function weekBooks(stats: ReadingStats | undefined, sid: number, w: number): number {
  return stats?.byWeek?.[String(w)]?.[String(sid)] ?? 0;
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
    if (weekBooks(stats, sid, k) >= quota) streak++;
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

  const metThisWeek = weekBooks(stats, sid, currentWeek) >= quota;
  const current = metThisWeek
    ? streakAtWeek(stats, sid, quota, currentWeek)
    : streakAtWeek(stats, sid, quota, currentWeek - 1);

  let best = 0;
  for (let w = 1; w <= currentWeek; w++) {
    best = Math.max(best, streakAtWeek(stats, sid, quota, w));
  }
  return { current, best };
}
