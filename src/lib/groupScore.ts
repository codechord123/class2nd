// 모둠 대항전 일일 모둠 점수 — 단일 출처 (사용자 확정 규칙):
//  · 모둠 내부에서 서로 발행하는 점수(부서장 평가 peer·부서장 득표 boss)와 MVP는
//    개인 점수 전용 — 모둠 점수에 넣으면 "우리끼리 다 +1" 담합 유인이 생긴다
//  · 선생님 순위(groupRank)·칭찬 미션(mission)은 모둠 단위 사건 — 모둠당 1회만
//  · 독서(read)·교사 보너스(bonus)는 외부 검증되는 개인 실적 — 인원 합산
// 개인 점수(rows의 total)는 이 규칙과 무관하게 전 항목이 각자 그대로다.
import type { DailyScoreRow } from "@/types";

export interface GroupDayScore {
  total: number;
  rankOnce: number; // 선생님 순위 점수 (모둠당 1회)
  missionOnce: number; // 칭찬 미션 (달성 시 +1, 인원 합산 금지)
  read: number; // 독서 합
  bonus: number; // 교사 보너스 합
  // 참고용 — 개인 점수에만 들어가는 항목의 모둠 합 (화면 안내 표시)
  peer: number;
  comp: number; // 칭찬하기 개인 점수 (몰아주기 무관 — 개인 전용)
  boss: number;
  mvp: number;
}

export function groupDayScore(
  rows: Record<string, unknown>,
  memberIds: number[]
): GroupDayScore {
  const s: GroupDayScore = {
    total: 0,
    rankOnce: 0,
    missionOnce: 0,
    read: 0,
    bonus: 0,
    peer: 0,
    comp: 0,
    boss: 0,
    mvp: 0,
  };
  for (const id of memberIds) {
    const r = rows[String(id)] as DailyScoreRow | undefined;
    if (!r) continue;
    if (!s.rankOnce && r.groupRank) s.rankOnce = r.groupRank;
    if (!s.missionOnce && r.mission) s.missionOnce = r.mission;
    s.read += r.read ?? 0;
    s.bonus += r.bonus ?? 0;
    s.peer += r.peer ?? 0;
    s.comp += r.comp ?? 0;
    s.boss += r.boss ?? 0;
    s.mvp += r.mvp ?? 0;
  }
  s.total = s.rankOnce + s.missionOnce + s.read + s.bonus;
  return s;
}
