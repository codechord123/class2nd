// ⏱️ 교실 타이머 상태 — 칠판·뽑기 등 다른 도구로 옮겨 가도 계속 흐르게 전역(zustand)에 둔다.
// 흐르는 중엔 '끝나는 시각(endAt)'만 저장한다 → 탭 전환·화면 꺼짐에도 시간이 밀리지 않고,
// 새로고침해도 이어진다(localStorage).
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TimerState {
  total: number; // 설정한 길이(ms) — 진행 링의 분모
  remaining: number; // 멈춰 있을 때 남은 ms
  endAt: number | null; // 흐르는 중이면 끝나는 시각
  doneAt: number | null; // 막 끝난 시각 (화면 깜빡임·알림용)
  setTotal: (ms: number) => void;
  add: (ms: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  finish: () => void;
  dismiss: () => void;
}

const MAX = 99 * 60 * 1000 + 59 * 1000;
const clamp = (ms: number) => Math.max(0, Math.min(MAX, ms));

export const useTimer = create<TimerState>()(
  persist(
    (set, get) => ({
      total: 5 * 60 * 1000,
      remaining: 5 * 60 * 1000,
      endAt: null,
      doneAt: null,
      setTotal: (ms) => set({ total: clamp(ms), remaining: clamp(ms), endAt: null, doneAt: null }),
      add: (ms) => {
        const { endAt, remaining, total } = get();
        if (endAt) {
          const left = clamp(endAt - Date.now() + ms);
          set({ endAt: Date.now() + left, total: Math.max(total + ms, left) });
        } else {
          // 아직 시작 전(남은 = 전체)이면 '길이 설정', 일시정지 중이면 남은 시간만 조정
          const r = clamp(remaining + ms);
          set({ remaining: r, total: remaining === total ? r : Math.max(total, r), doneAt: null });
        }
      },
      start: () => {
        const { remaining, total } = get();
        const r = remaining > 0 ? remaining : total;
        if (r <= 0) return;
        set({ endAt: Date.now() + r, remaining: r, doneAt: null });
      },
      pause: () => {
        const { endAt } = get();
        if (!endAt) return;
        set({ endAt: null, remaining: Math.max(0, endAt - Date.now()) });
      },
      reset: () => set((s) => ({ endAt: null, remaining: s.total, doneAt: null })),
      finish: () => set({ endAt: null, remaining: 0, doneAt: Date.now() }),
      dismiss: () => set((s) => ({ doneAt: null, remaining: s.total })),
    }),
    { name: "class2nd-timer" }
  )
);

export function leftMs(s: Pick<TimerState, "endAt" | "remaining">, now = Date.now()) {
  return s.endAt ? Math.max(0, s.endAt - now) : s.remaining;
}

export function fmt(ms: number) {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
