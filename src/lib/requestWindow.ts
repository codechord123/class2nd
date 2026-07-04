// 토큰 사용 신청 가능 시간대(KST) 판정 — 아침 등교 직후 신청 러시를 막기 위함.
// 교사 설정(requestOpenHour/CloseHour)으로 조정. 저녁에 신청 → 다음 날 아침 일괄 승인 흐름.

/** 현재 시각을 Asia/Seoul 기준 '시(0~23)'로. 기기 시간대와 무관하게 KST로 판정. */
export function kstHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(now);
  // "24" (자정)은 0으로 정규화
  return Number(h) % 24;
}

/**
 * 신청 창 열림 여부. close=24는 자정을 뜻함.
 * open<close : 같은 날 구간 [open, close)
 * open>close : 자정을 걸친 구간 (예: 22~2시)
 */
export function isRequestOpen(open: number, close: number, hour = kstHour()): boolean {
  const c = close % 24; // 24 → 0 (자정)
  if (open === c) return true; // 24시간 개방
  if (open < close && c !== 0) return hour >= open && hour < close;
  // 자정 걸침(또는 close=24=자정 마감): [open, 24) ∪ [0, c)
  if (close === 24) return hour >= open;
  return hour >= open || hour < c;
}

/** "오후 4시" 같은 한글 라벨. 24는 "밤 12시". */
export function hourLabel(h: number): string {
  const hh = h % 24;
  if (hh === 0) return "밤 12시";
  if (hh === 12) return "낮 12시";
  if (h === 24) return "밤 12시";
  return hh < 12 ? `오전 ${hh}시` : `오후 ${hh - 12}시`;
}

/** "오후 4시~밤 12시" */
export function requestWindowLabel(open: number, close: number): string {
  return `${hourLabel(open)}~${hourLabel(close)}`;
}
