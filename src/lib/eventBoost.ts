// 이벤트 점수 배수 (교사 설정) — 이벤트 기간 동안 특정 점수를 배수로 올린다.
// classData/eventBoost 단일 문서. 집계는 '집계하는 날짜가 기간 안'일 때만 배수를 적용하므로
// 재집계해도 값이 흔들리지 않는다(멱등). 이벤트가 없으면 전부 ×1 → 기존과 동일.
export interface EventBoost {
  active: boolean;
  name: string;
  from: string; // "YYYY-MM-DD"
  to: string;
  comp: number; // 칭찬 개인 점수 배수
  mission: number; // 칭찬 미션(팀) 배수
  mvp: number; // MVP 배수
  read: number; // 독서 배수
}

export const DEFAULT_EVENT_BOOST: EventBoost = {
  active: false,
  name: "",
  from: "",
  to: "",
  comp: 1,
  mission: 1,
  mvp: 1,
  read: 1,
};

export interface EventMult {
  comp: number;
  mission: number;
  mvp: number;
  read: number;
}
export const NO_BOOST: EventMult = { comp: 1, mission: 1, mvp: 1, read: 1 };

/** 그 날짜에 적용할 배수 — 이벤트가 활성·기간 안일 때만, 아니면 전부 ×1. */
export function eventMultipliers(b: EventBoost | undefined, date: string): EventMult {
  if (!b || !b.active || !b.from || !b.to) return NO_BOOST;
  if (date < b.from || date > b.to) return NO_BOOST;
  return {
    comp: b.comp || 1,
    mission: b.mission || 1,
    mvp: b.mvp || 1,
    read: b.read || 1,
  };
}
