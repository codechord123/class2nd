// ⏱️ 교실 타이머 상태 — 칠판·뽑기 등 다른 화면으로 옮겨 가도, 떠 있는 창(위젯)에서도 같은 시계.
// 흐르는 중엔 '끝나는 시각(endAt)'만 저장한다 → 탭 전환·화면 꺼짐에도 밀리지 않고 새로고침해도 이어진다.
// 2026-11 사용자 요청: 시간 추가·직접 입력, 종료 전 알림(1분·30초·마지막 10초), 끝 소리 고르기,
//   스톱워치, '무엇을 하는 시간' 이름표, 내 프리셋 저장, 끝난 뒤 '지난 시간' 표시.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EndSound } from "@/lib/tools/chime";

export interface TimerPrefs {
  warn60: boolean; // 1분 전 알림
  warn30: boolean; // 30초 전 알림
  tick10: boolean; // 마지막 10초 똑딱
  sound: EndSound;
  volume: number; // 0~1
}

interface TimerState {
  mode: "timer" | "stopwatch";
  label: string;
  total: number; // 설정한 길이(ms) — 진행 링의 분모
  remaining: number; // 멈춰 있을 때 남은 ms
  endAt: number | null; // 흐르는 중이면 끝나는 시각
  doneAt: number | null; // 끝난 시각 (화면 깜빡임·지난 시간 표시)
  swStart: number | null; // 스톱워치 흐르기 시작한 시각
  swAcc: number; // 스톱워치 누적(ms)
  prefs: TimerPrefs;
  presets: number[]; // 내가 저장한 길이(ms)
  setMode: (m: "timer" | "stopwatch") => void;
  setLabel: (s: string) => void;
  setTotal: (ms: number) => void;
  add: (ms: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  finish: () => void;
  dismiss: () => void;
  setPrefs: (p: Partial<TimerPrefs>) => void;
  savePreset: (ms: number) => void;
  removePreset: (ms: number) => void;
}

const MAX = 99 * 60 * 1000 + 59 * 1000;
const clamp = (ms: number) => Math.max(0, Math.min(MAX, ms));

export const useTimer = create<TimerState>()(
  persist(
    (set, get) => ({
      mode: "timer",
      label: "",
      total: 5 * 60 * 1000,
      remaining: 5 * 60 * 1000,
      endAt: null,
      doneAt: null,
      swStart: null,
      swAcc: 0,
      prefs: { warn60: true, warn30: false, tick10: true, sound: "chime", volume: 0.8 },
      presets: [],
      setMode: (mode) => {
        get().pause();
        set({ mode });
      },
      setLabel: (label) => set({ label: label.slice(0, 30) }),
      setTotal: (ms) => set({ total: clamp(ms), remaining: clamp(ms), endAt: null, doneAt: null }),
      add: (ms) => {
        const { endAt, remaining, total, doneAt } = get();
        if (doneAt) {
          // 끝난 뒤 '+1분' — 바로 그만큼 다시 흐른다 (조금만 더!)
          if (ms > 0) set({ total: ms, remaining: ms, endAt: Date.now() + ms, doneAt: null });
          return;
        }
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
        const s = get();
        if (s.mode === "stopwatch") {
          if (!s.swStart) set({ swStart: Date.now() });
          return;
        }
        const r = s.remaining > 0 ? s.remaining : s.total;
        if (r <= 0) return;
        set({ endAt: Date.now() + r, remaining: r, doneAt: null });
      },
      pause: () => {
        const { endAt, swStart, swAcc } = get();
        if (swStart) set({ swStart: null, swAcc: swAcc + (Date.now() - swStart) });
        if (endAt) set({ endAt: null, remaining: Math.max(0, endAt - Date.now()) });
      },
      reset: () =>
        set((s) => (s.mode === "stopwatch" ? { swStart: null, swAcc: 0 } : { endAt: null, remaining: s.total, doneAt: null })),
      finish: () => set({ endAt: null, remaining: 0, doneAt: Date.now() }),
      dismiss: () => set((s) => ({ doneAt: null, remaining: s.total })),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      savePreset: (ms) =>
        set((s) => ({ presets: [...new Set([...s.presets, clamp(ms)])].filter((x) => x > 0).sort((a, b) => a - b).slice(0, 8) })),
      removePreset: (ms) => set((s) => ({ presets: s.presets.filter((x) => x !== ms) })),
    }),
    {
      name: "class2nd-timer",
      version: 2,
      // 옛 저장본(v1)에는 새 필드가 없다 — 기본값 위에 덮어 쓴다
      migrate: (old) => old as TimerState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TimerState>;
        return { ...current, ...p, prefs: { ...current.prefs, ...(p.prefs ?? {}) }, presets: p.presets ?? [] };
      },
    }
  )
);

export function leftMs(s: Pick<TimerState, "endAt" | "remaining">, now = Date.now()) {
  return s.endAt ? Math.max(0, s.endAt - now) : s.remaining;
}
export function swMs(s: Pick<TimerState, "swStart" | "swAcc">, now = Date.now()) {
  return s.swAcc + (s.swStart ? now - s.swStart : 0);
}

export function fmt(ms: number) {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
/** 스톱워치 — 0.1초까지 */
export function fmtSw(ms: number) {
  const t = Math.floor(ms / 100);
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${t % 10}`;
}
/** "5:30" "90" "1:00:00" 같은 입력 → ms (분:초 / 숫자만이면 분) */
export function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) * 60 * 1000;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
  return null;
}

/** 시간 더하기·빼기 버튼 — 타이머 화면과 떠 있는 창 공용 (흐르는 중에도 쓸 수 있다) */
export const TIME_STEPS: [string, number][] = [
  ["−5분", -300_000],
  ["−1분", -60_000],
  ["−10초", -10_000],
  ["+10초", 10_000],
  ["+30초", 30_000],
  ["+1분", 60_000],
  ["+5분", 300_000],
];
