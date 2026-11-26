"use client";
// 🪟 따로 띄우기 — 도구를 브라우저 밖의 진짜 창으로 (사용자 2026-11: "소음 측정기도 창분리로 따로",
//    "시계 새 창은 창 안에서만 돌아다니는데, 창 밖으로 뺄 수 있게 완전 새 창이면").
// · 크롬·엣지(116+)는 '항상 위' PIP 창 — PPT를 크게 띄워도 그 위에 떠 있고, 화면 어디로든 옮긴다.
//   PIP 창은 한 탭에 하나뿐이라 두 번째 도구는 **같은 PIP 창에 함께** 넣는다 (사용자 2026-11: "타이머만 새 창으로
//   열리고 소음·뽑기는 안 열려" — 예전엔 두 번째부터 팝업 창을 열었는데, 교실 크롬에서 팝업이 막히거나 뒤로 숨었다).
// · PIP가 없는 브라우저는 도구마다 작은 팝업 창(다른 모니터로도 끌어 놓을 수 있음).
// · 새 페이지를 여는 게 아니라 이 탭의 React를 그 창에 그린다(createPortal, FloatingWidgets의 PopOutHost)
//   → 로그인·설정이 그대로이고 DB 읽기 0. 원래 탭을 닫거나 새로고침하면 같이 닫힌다.
import { create } from "zustand";
import { unlockAudio } from "@/lib/tools/chime";

export type PopKind = "timer" | "pick" | "noise";
const SIZE: Record<PopKind, { w: number; h: number; title: string }> = {
  timer: { w: 380, h: 420, title: "타이머" },
  pick: { w: 400, h: 300, title: "뽑기" },
  noise: { w: 380, h: 340, title: "소음" },
};

export interface PopWin {
  win: Window;
  pip: boolean; // 항상 위 창인가
}
export const usePopOut = create<{ wins: Partial<Record<PopKind, PopWin>> }>(() => ({ wins: {} }));
/** 이 도구가 따로 띄운 창에 떠 있나 */
export const usePopped = (kind: PopKind) => usePopOut((s) => s.wins[kind]);

const drop = (kind: PopKind) =>
  usePopOut.setState((s) => {
    const wins = { ...s.wins };
    delete wins[kind];
    return { wins };
  });

export function closePopOut(kind?: PopKind) {
  const { wins } = usePopOut.getState();
  for (const k of kind ? [kind] : (Object.keys(wins) as PopKind[])) {
    const w = wins[k];
    drop(k);
    // 같은 창에 다른 도구가 남아 있으면 창은 두고 그 도구만 뺀다
    const shared = Object.values(usePopOut.getState().wins).some((x) => x?.win === w?.win);
    if (!shared)
      try {
        w?.win.close();
      } catch {}
  }
}

type DocPip = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };

/** 버튼을 누른 그 순간에 불러야 한다 — 브라우저가 그때만 새 창을 허락한다. 막히면 false. */
export async function openPopOut(kind: PopKind): Promise<boolean> {
  closePopOut(kind);
  unlockAudio(); // 타이머·경고음은 이 탭의 소리로 낸다 — 누른 김에 풀어 둔다
  const { w, h, title } = SIZE[kind];
  let win: Window | null = null;
  let pip = false;
  const dpip = (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture;
  // 이미 떠 있는 '항상 위' 창이 있으면 그 창에 이 도구를 함께 넣는다 (창을 조금 넓혀 본다)
  const pipOpen = Object.values(usePopOut.getState().wins).find((x) => x?.pip && !x.win.closed);
  if (pipOpen) {
    try {
      const wide = pipOpen.win.innerWidth >= pipOpen.win.innerHeight;
      pipOpen.win.resizeBy(wide ? w : 0, wide ? 0 : h);
    } catch {}
    try {
      pipOpen.win.focus();
    } catch {}
    usePopOut.setState((s) => ({ wins: { ...s.wins, [kind]: pipOpen } }));
    return true;
  }
  if (dpip) {
    try {
      win = await dpip.requestWindow({ width: w, height: h });
      pip = true;
    } catch {
      win = null;
    }
  }
  if (!win) win = window.open("", `class2nd-pop-${kind}`, `popup=yes,width=${w},height=${h}`);
  if (!win) return false;

  const doc = win.document;
  doc.title = `${title} — 학급 자치`;
  doc.head.querySelectorAll("link[rel=stylesheet], style").forEach((n) => n.remove());
  // 이 화면의 스타일(테마 색·글꼴)을 그대로 — 주소는 절대 경로로
  document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style').forEach((n) => {
    const c = n.cloneNode(true) as HTMLElement;
    if (n instanceof HTMLLinkElement) (c as HTMLLinkElement).href = n.href;
    doc.head.appendChild(c);
  });
  doc.documentElement.className = document.documentElement.className;
  doc.documentElement.lang = "ko";
  doc.body.className = document.body.className;
  doc.body.style.margin = "0";
  doc.body.replaceChildren();
  const root = doc.createElement("div");
  root.id = "pop-root";
  doc.body.appendChild(root);
  const opened = win;
  opened.addEventListener("pagehide", () => {
    // 창을 닫으면 그 창에 있던 도구 모두
    for (const [k, v] of Object.entries(usePopOut.getState().wins)) if (v?.win === opened) drop(k as PopKind);
  });
  usePopOut.setState((s) => ({ wins: { ...s.wins, [kind]: { win: opened, pip } } }));
  return true;
}
