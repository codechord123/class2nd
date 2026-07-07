// 학급 골드토큰 잔량 계산 — 단일 출처.
// 잔량 = 1학기 이월분(정적) − 사용 + 자동 적립 + 교사 보너스(수동 ±).
// 자동 적립(classGoldEarned): 점수 마일스톤·거북이 이벤트가 increment.
// 교사 보너스(classGoldBonus): 학급 현황판에서 +/− 로 즉석 보정 (사용자 확정).
import { s1ClassGoldRemaining } from "@/lib/staticData";

export function classGoldLeft(s1Used: Record<string, number> | undefined): number {
  const u = s1Used ?? {};
  return (
    s1ClassGoldRemaining -
    ((u.classGoldUsed as number) ?? 0) +
    ((u.classGoldEarned as number) ?? 0) +
    ((u.classGoldBonus as number) ?? 0)
  );
}
