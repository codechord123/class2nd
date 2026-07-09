// 부서장 평가 O/X 정량 기준 (사용자 확정) — 각 부서장은 '자기 부서 기준'으로 모둠원을 평가한다.
// 주관적 척도(-1/0/+1) 대신 관찰 가능한 O/X 2개로 바꿔, 편 가르기(카르텔)를 막고
// 실명 공개·이의제기로 검증 가능하게 한다. 교사가 classData/peerCriteria에서 편집 가능(출발값).
import type { RoleKey } from "@/types";

export const DEFAULT_PEER_CRITERIA: Record<RoleKey, string[]> = {
  소통: [
    "갈등을 행감바·인사약으로 해결했다 (또는 갈등 없이 잘 지냈다)",
    "수업 중 손 들고 발표했다",
  ],
  질서: ["수업 전 자리에 앉아 준비했다", "이동시간(급식실·교과실 등) 줄을 잘 섰다"],
  학습: ["학습플래너 숙제를 했다", "매시간 학습지를 아코디언 파일에 정리했다"],
  건강: ["우유를 마셨다", "잔반 없이 환경지킴이 점수를 받았다"],
  행정: ["아침에 스마트기기 전원을 껐다", "디벗으로 게임 등 딴짓을 하지 않았다"],
};

// O/X 체크 → 평가자 1명이 주는 점수 (사용자 확정): 전부 O = +1 · 일부 = 0 · 전부 X = −1.
// checks 길이 = 그 부서 기준 개수. 기준이 없거나(미평가) 빈 배열이면 0(무효).
export function peerScoreFromChecks(checks: boolean[] | undefined): number {
  if (!checks || checks.length === 0) return 0;
  const o = checks.filter(Boolean).length;
  if (o === checks.length) return 1;
  if (o === 0) return -1;
  return 0;
}
