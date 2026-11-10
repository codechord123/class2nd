"use client";
// 🪟 따로 띄우기 — 도구를 브라우저 밖의 작은 창으로 (사용자 2026-11: "소음 측정기도 창분리로 따로 둘 수 있으면").
// · 크롬·엣지(116+)는 '항상 위' PIP 창 — PPT를 크게 띄워도 그 위에 떠 있다.
// · 안 되는 브라우저는 작은 팝업 창 — 다른 모니터(프로젝터)로 끌어 놓을 수 있다.
// 새 페이지를 여는 게 아니라 이 화면의 React를 그 창에 그린다(createPortal, FloatingWidgets의 PopOutHost)
// → 로그인·설정이 그대로이고 DB 읽기 0. 원래 탭을 닫거나 새로고침하면 같이 닫힌다.
import { create } from "zustand";
import { unlockAudio } from "@/lib/tools/chime";

export type PopKind = "noise";
const SIZE: Record<PopKind, { w: number; h: number; title: string }> = {
  noise: { w: 380, h: 340, title: "소음" },
};

interface PopState {
  kind: PopKind | null;
  win: Window | null;
  pip: boolean; // 항상 위 창인가
}
export const usePopOut = create<PopState>(() => ({ kind: null, win: null, pip: false }));

export function closePopOut() {
  const { win } = usePopOut.getState();
  usePopOut.setState({ kind: null, win: null, pip: false });
  try {
    win?.close();
  } catch {}
}

type DocPip = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };

/** 버튼을 누른 그 순간에 불러야 한다 — 브라우저가 그때만 새 창을 허락한다. 막히면 false. */
export async function openPopOut(kind: PopKind): Promise<boolean> {
  closePopOut();
  unlockAudio(); // 경고음은 이 탭의 소리로 낸다 — 누른 김에 풀어 둔다
  const { w, h, title } = SIZE[kind];
  let win: Window | null = null;
  let pip = false;
  const dpip = (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture;
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
    if (usePopOut.getState().win === opened) usePopOut.setState({ kind: null, win: null, pip: false });
  });
  usePopOut.setState({ kind, win: opened, pip });
  return true;
}
