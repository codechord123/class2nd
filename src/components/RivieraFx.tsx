"use client";
// 🌊 바닷마을 테마의 움직임 — ① 버튼을 누르면 그 자리에서 물이 첨벙(물결 고리 + 물방울),
// 가끔은 물고기가 튀어 오른다 ② 머리 장식 바다에서 물고기가 이따금 뛰어올랐다 사라진다.
// 테마가 켜져 있을 때만(<html data-theme="riviera">) 동작 — 상태·읽기 없이 DOM 조각만 잠깐 붙였다 지운다.
// '움직임 줄이기'를 켠 기기에선 아무것도 하지 않는다.
import { useEffect } from "react";

const on = () =>
  document.documentElement.dataset.theme === "riviera" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FISH_SVG =
  '<svg viewBox="0 0 22 12" width="22" height="12" aria-hidden="true">' +
  '<path d="M2 6 Q8 0 15 6 Q8 12 2 6 Z" fill="#F08A4B"/>' +
  '<path d="M14 6 L21 1.5 L19.5 6 L21 10.5 Z" fill="#F6BD94"/>' +
  '<path d="M7 3.2 Q9 6 7 8.8" stroke="#FFF3E6" stroke-width="1" fill="none"/>' +
  '<circle cx="4.6" cy="5.2" r="0.9" fill="#3B2A20"/></svg>';

let layer: HTMLDivElement | null = null;
function getLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.className = "riv-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  return layer;
}

function spawn(cls: string, x: number, y: number, ms: number, html = "", vars: Record<string, string> = {}) {
  const el = document.createElement("span");
  el.className = cls;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.innerHTML = html;
  getLayer().appendChild(el);
  window.setTimeout(() => el.remove(), ms);
}

/** 그 자리에서 첨벙 — 물결 고리 2개 + 위로 튀는 물방울 */
function splash(x: number, y: number, size = 1) {
  spawn("riv-ring", x, y, 650);
  spawn("riv-ring riv-ring-late", x, y, 750);
  const n = 6;
  for (let i = 0; i < n; i++) {
    // 위쪽 부채꼴(-160° ~ -20°)로 흩어진다
    const a = ((-160 + (140 * i) / (n - 1) + (Math.random() * 16 - 8)) * Math.PI) / 180;
    const d = (16 + Math.random() * 14) * size;
    spawn("riv-drop", x, y, 700, "", {
      "--dx": `${Math.cos(a) * d}px`,
      "--dy": `${Math.sin(a) * d}px`,
    });
  }
}

/** 물고기 한 마리가 포물선을 그리며 뛰었다가 퐁당 */
function fishJump(x: number, y: number, scale = 1) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  spawn("riv-fish", x, y, 1300, `<span>${FISH_SVG}</span>`, {
    "--dir": String(-dir), // 그림은 왼쪽을 본다 → 오른쪽으로 갈 땐 뒤집기
    "--s": String(scale),
  });
  // 착지 지점에서 작은 첨벙
  window.setTimeout(() => on() && splash(x + dir * 52 * scale, y, 0.6), 1050);
}

export default function RivieraFx() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!on()) return;
      const t = (e.target as Element | null)?.closest?.('button, a, [role="button"], summary');
      if (!t || (t as HTMLButtonElement).disabled) return;
      splash(e.clientX, e.clientY);
      if (Math.random() < 0.08) fishJump(e.clientX - 26, e.clientY, 0.9); // 가끔 깜짝 물고기
    };
    document.addEventListener("pointerdown", onDown, { passive: true });

    // 머리 장식 바다의 물고기 — 처음엔 8~15초 뒤, 이후 20~45초마다
    let timer = 0;
    const loop = (first = false) => {
      timer = window.setTimeout(
        () => {
          const sea = document.querySelector(".coast-decor");
          if (on() && document.visibilityState === "visible" && sea) {
            const r = sea.getBoundingClientRect();
            if (r.bottom > 0 && r.width > 0) {
              const x = r.left + r.width * (0.15 + Math.random() * 0.7);
              fishJump(x, r.bottom - r.height * 0.14);
            }
          }
          loop();
        },
        first ? 8000 + Math.random() * 7000 : 20000 + Math.random() * 25000,
      );
    };
    loop(true);

    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
