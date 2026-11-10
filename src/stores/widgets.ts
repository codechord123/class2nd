// 🪟 떠 있는 도구 창 — 사용자 요청(2026-11): "도구들은 드래그로 이동하면서 화면 안에서 움직이고 크기 조절도 하고 자유롭게".
// 어느 선생님 화면 위에든(칠판 위·오늘 운영 위) 타이머·뽑기·소음 창을 띄워 두고 끌고 늘린다.
// 위치·크기는 이 기기에 기억한다 (교실 컴퓨터 화면에 맞춰 한 번 놓으면 다음에도 그 자리).
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WidgetKind = "timer" | "pick" | "noise";
export interface WidgetBox {
  kind: WidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export const WIDGET_META: Record<WidgetKind, { label: string; w: number; h: number; minW: number; minH: number }> = {
  timer: { label: "타이머", w: 300, h: 300, minW: 200, minH: 190 },
  pick: { label: "뽑기", w: 340, h: 260, minW: 240, minH: 190 },
  noise: { label: "소음", w: 300, h: 260, minW: 200, minH: 180 },
};

interface WidgetState {
  open: WidgetBox[];
  toggle: (k: WidgetKind) => void;
  close: (k: WidgetKind) => void;
  update: (k: WidgetKind, patch: Partial<WidgetBox>) => void;
  focus: (k: WidgetKind) => void;
}

export const useWidgets = create<WidgetState>()(
  persist(
    (set, get) => ({
      open: [],
      toggle: (k) => {
        if (get().open.some((w) => w.kind === k)) return get().close(k);
        const m = WIDGET_META[k];
        const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
        const vh = typeof window === "undefined" ? 800 : window.innerHeight;
        // 새 창은 오른쪽 가장자리에 세로로 줄 세운다 (겹치지 않게) — 자리가 없으면 왼쪽 열로
        let x = vw - m.w - 20;
        let y = 72;
        for (const o of [...get().open].sort((a, b) => a.y - b.y)) {
          const overlap = !(x + m.w <= o.x || o.x + o.w <= x || y + m.h <= o.y || o.y + o.h <= y);
          if (overlap) y = o.y + o.h + 12;
          if (y + m.h > vh - 8) {
            x -= m.w + 12;
            y = 72;
          }
        }
        const z = Math.max(0, ...get().open.map((w) => w.z)) + 1;
        set({ open: [...get().open, { kind: k, w: m.w, h: m.h, x: Math.max(8, x), y, z }] });
      },
      close: (k) => set({ open: get().open.filter((w) => w.kind !== k) }),
      update: (k, patch) => set({ open: get().open.map((w) => (w.kind === k ? { ...w, ...patch } : w)) }),
      focus: (k) => {
        const z = Math.max(0, ...get().open.map((w) => w.z)) + 1;
        if (get().open.find((w) => w.kind === k)?.z === z - 1) return;
        set({ open: get().open.map((w) => (w.kind === k ? { ...w, z } : w)) });
      },
    }),
    { name: "class2nd-widgets" }
  )
);
