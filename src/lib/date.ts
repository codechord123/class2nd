// 한국 시간 기준 날짜 유틸 — 평가/집계의 "오늘"은 항상 KST 기준.
export function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD"
}

/** 임의 날짜 문자열("YYYY-MM-DD")이 학기 몇 주차인지 (1~21 클램프) */
export function weekOfDate(date: string, semesterStart: string, totalWeeks: number): number {
  const d = new Date(date + "T00:00:00+09:00");
  const s = new Date(semesterStart + "T00:00:00+09:00");
  const week = Math.floor((d.getTime() - s.getTime()) / (7 * 86400000)) + 1;
  return Math.min(Math.max(week, 1), totalWeeks);
}
