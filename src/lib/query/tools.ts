"use client";
// 🧰 교실 도구 데이터 — 체크리스트·전자칠판. 둘 다 교사만 쓰는 classData 문서라 규칙 게시가 필요 없다
// (classData/{docId}: 읽기 isAuthed · 쓰기 isTeacher).
//
// 읽기 예산: 교사 한 명만 읽는다.
//   · 체크리스트 = classData/checklists 문서 1개 (모든 목록이 map 하나에)
//   · 칠판 목록  = classData/boards 문서 1개 (제목·작은 미리보기)
//   · 칠판 내용  = classData/board-{id} — 열 때만 1회
// 쓰기는 필드 경로(lists.{id}.done.{key})로 한 칸씩 → 다른 기기에서 바꾼 칸을 덮어쓰지 않는다.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useCallback } from "react";
import { db } from "@/lib/firebase";

// ───────────────────────── ✅ 체크리스트 ─────────────────────────
export type ChecklistKind = "roster" | "todo";
export interface ChecklistItem {
  text: string;
  at: number;
}
export interface Checklist {
  title: string;
  kind: ChecklistKind; // roster = 학생 25명 제출 확인, todo = 직접 적는 할 일
  createdAt: number;
  items?: Record<string, ChecklistItem>;
  done?: Record<string, boolean>;
}
export type Checklists = Record<string, Checklist>;

const CL_KEY = ["checklists"];
const clRef = () => doc(db(), "classData", "checklists");

export function useChecklists(enabled: boolean) {
  return useQuery({
    queryKey: CL_KEY,
    enabled,
    queryFn: async (): Promise<Checklists> => {
      const snap = await getDoc(clRef());
      const lists = snap.exists() ? (snap.data().lists as Checklists | undefined) : undefined;
      return lists ?? {};
    },
    staleTime: 5 * 60 * 1000,
  });
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** 낙관적 갱신 + 서버 쓰기. 실패하면 서버 값으로 되돌린다 */
export function useChecklistOps() {
  const qc = useQueryClient();
  const run = useCallback(
    async (local: (all: Checklists) => Checklists, remote: () => Promise<unknown>) => {
      qc.setQueryData<Checklists>(CL_KEY, (old) => local(structuredClone(old ?? {})));
      try {
        await remote();
      } catch (e) {
        void qc.invalidateQueries({ queryKey: CL_KEY });
        throw e;
      }
    },
    [qc]
  );

  return {
    create: async (title: string, kind: ChecklistKind) => {
      const id = newId();
      const list: Checklist = { title, kind, createdAt: Date.now(), items: {}, done: {} };
      await run(
        (all) => ({ ...all, [id]: list }),
        () => setDoc(clRef(), { lists: { [id]: list } }, { merge: true })
      );
      return id;
    },
    rename: (id: string, title: string) =>
      run(
        (all) => (all[id] ? { ...all, [id]: { ...all[id], title } } : all),
        () => updateDoc(clRef(), { [`lists.${id}.title`]: title })
      ),
    remove: (id: string) =>
      run(
        (all) => {
          delete all[id];
          return all;
        },
        () => updateDoc(clRef(), { [`lists.${id}`]: deleteField() })
      ),
    toggle: (id: string, key: string, on: boolean) =>
      run(
        (all) => {
          const l = all[id];
          if (!l) return all;
          const done = { ...(l.done ?? {}) };
          if (on) done[key] = true;
          else delete done[key];
          return { ...all, [id]: { ...l, done } };
        },
        () => updateDoc(clRef(), { [`lists.${id}.done.${key}`]: on ? true : deleteField() })
      ),
    addItem: (id: string, text: string) => {
      const itemId = newId();
      const item = { text, at: Date.now() };
      return run(
        (all) => {
          const l = all[id];
          if (!l) return all;
          return { ...all, [id]: { ...l, items: { ...(l.items ?? {}), [itemId]: item } } };
        },
        () => updateDoc(clRef(), { [`lists.${id}.items.${itemId}`]: item })
      );
    },
    removeItem: (id: string, itemId: string) =>
      run(
        (all) => {
          const l = all[id];
          if (!l) return all;
          const items = { ...(l.items ?? {}) };
          const done = { ...(l.done ?? {}) };
          delete items[itemId];
          delete done[itemId];
          return { ...all, [id]: { ...l, items, done } };
        },
        () =>
          updateDoc(clRef(), {
            [`lists.${id}.items.${itemId}`]: deleteField(),
            [`lists.${id}.done.${itemId}`]: deleteField(),
          })
      ),
    resetChecks: (id: string) =>
      run(
        (all) => (all[id] ? { ...all, [id]: { ...all[id], done: {} } } : all),
        () => updateDoc(clRef(), { [`lists.${id}.done`]: {} })
      ),
  };
}

// ───────────────────────── 🖊️ 전자칠판 ─────────────────────────
// 좌표는 논리 캔버스(BOARD_W×BOARD_H, 16:9) 기준 — 어떤 화면·프로젝터에서 열어도 같은 그림.
export const BOARD_W = 1600;
export const BOARD_H = 900;
/** 칠판은 아래로 이어 쓸 수 있다 (사용자 2026-11: "칠판은 스크롤 기능이 필요해") — 화면 6장까지 */
export const BOARD_MAX_H = BOARD_H * 6;
/** Firestore 문서 한도(1MB) 전에 멈추는 선 — 넘으면 '새 칠판'을 권한다 */
export const BOARD_MAX_BYTES = 900_000;

export type StrokeTool = "pen" | "hl" | "er";
export interface Stroke {
  t: StrokeTool;
  c: string; // 색
  w: number; // 굵기(논리 px)
  p: string; // 점 좌표 — encodePoints 참고
}
// 칠판 바탕 — 기본은 검정 칠판 (선생님이 쓰던 도구처럼 '검은 바탕 + 색 글씨 줄'이 아침 안내의 기본형)
export type BoardBg = "dark" | "green" | "plain" | "grid";
export interface BoardData {
  title: string;
  bg: BoardBg;
  fs: number; // 기본 글자 크기(논리 px)
  html: string; // 글 층 — 줄마다 색·굵게 (허용 태그만, sanitizeBoardHtml)
  strokes: Stroke[]; // 펜 층
  h?: number; // 논리 높이 — 아래로 이어 쓰면 늘어난다 (기본 BOARD_H, 최대 BOARD_MAX_H). 없으면 옛 칠판 = 900
  updatedAt: number;
}
export interface BoardMeta {
  title: string;
  createdAt: number;
  updatedAt: number;
  thumb?: string; // 160×90 JPEG data URL (~3KB)
}

/** 점 [x0,y0,x1,y1,…] → "x0,y0,dx,dy,…" 36진 차분 — 손글씨는 이웃 점이 가까워 한두 글자로 줄어든다 */
export function encodePoints(pts: number[]): string {
  const out: string[] = [];
  let px = 0;
  let py = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const x = Math.round(pts[i]);
    const y = Math.round(pts[i + 1]);
    out.push((x - px).toString(36), (y - py).toString(36));
    px = x;
    py = y;
  }
  return out.join(",");
}
export function decodePoints(s: string): number[] {
  if (!s) return [];
  const parts = s.split(",");
  const pts: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < parts.length; i += 2) {
    x += parseInt(parts[i], 36) || 0;
    y += parseInt(parts[i + 1], 36) || 0;
    pts.push(x, y);
  }
  return pts;
}

export function boardBytes(d: Pick<BoardData, "strokes" | "html">): number {
  let n = 200 + d.html.length * 2;
  for (const s of d.strokes) n += s.p.length + 40;
  return n;
}

export const DEFAULT_FS = 60;

/** 글 층 HTML을 허용 목록으로 다시 쓴다 — 붙여넣기 등으로 섞여 들어온 스크립트·이미지·외부 스타일 차단 */
export function sanitizeBoardHtml(html: string): string {
  if (typeof DOMParser === "undefined" || !html) return html ?? "";
  const docu = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const ALLOWED = new Set(["DIV", "P", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "SPAN", "FONT"]);
  const STYLE_OK = /^(color|background-color|font-weight|font-style|text-decoration(-line)?|font-size)$/;
  const walk = (el: Element): string =>
    [...el.childNodes]
      .map((n) => {
        if (n.nodeType === 3) return (n.textContent ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (n.nodeType !== 1) return "";
        const e = n as HTMLElement;
        const inner = walk(e);
        if (!ALLOWED.has(e.tagName)) return inner;
        const tag = e.tagName === "FONT" ? "span" : e.tagName.toLowerCase();
        if (tag === "br") return "<br>";
        const styles: string[] = [];
        const fontColor = e.tagName === "FONT" ? e.getAttribute("color") : null;
        if (fontColor && /^#?[\w(),.\s%]+$/.test(fontColor)) styles.push(`color:${fontColor}`);
        for (let i = 0; i < e.style.length; i++) {
          const k = e.style[i];
          const v = e.style.getPropertyValue(k);
          if (STYLE_OK.test(k) && !/url\(|expression/i.test(v)) styles.push(`${k}:${v}`);
        }
        const st = styles.length ? ` style="${styles.join(";").replace(/"/g, "'")}"` : "";
        return `<${tag}${st}>${inner}</${tag}>`;
      })
      .join("");
  return walk(docu.body.firstElementChild as Element);
}

const BI_KEY = ["boards"];
const indexRef = () => doc(db(), "classData", "boards");
const boardRef = (id: string) => doc(db(), "classData", `board-${id}`);

export function useBoardIndex(enabled: boolean) {
  return useQuery({
    queryKey: BI_KEY,
    enabled,
    queryFn: async (): Promise<Record<string, BoardMeta>> => {
      const snap = await getDoc(indexRef());
      return (snap.exists() ? (snap.data().items as Record<string, BoardMeta> | undefined) : undefined) ?? {};
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useBoardData(id: string | null) {
  return useQuery({
    queryKey: ["board", id],
    enabled: !!id,
    queryFn: async (): Promise<BoardData | null> => {
      const snap = await getDoc(boardRef(id!));
      if (!snap.exists()) return null;
      const d = snap.data();
      return {
        title: typeof d.title === "string" ? d.title : "",
        bg: (d.bg as BoardBg) ?? "dark",
        fs: typeof d.fs === "number" ? d.fs : DEFAULT_FS,
        html: typeof d.html === "string" ? d.html : "",
        strokes: Array.isArray(d.strokes) ? (d.strokes as Stroke[]) : [],
        h: typeof d.h === "number" ? Math.min(Math.max(d.h, BOARD_H), BOARD_MAX_H) : BOARD_H,
        updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : 0,
      };
    },
    staleTime: Infinity, // 열려 있는 동안은 화면의 그림이 기준 (자동 저장이 서버를 따라오게 한다)
    gcTime: 60 * 1000,
  });
}

export function useBoardOps() {
  const qc = useQueryClient();
  const setMeta = (id: string, patch: Partial<BoardMeta> | null) =>
    qc.setQueryData<Record<string, BoardMeta>>(BI_KEY, (old) => {
      const next = { ...(old ?? {}) };
      if (patch === null) delete next[id];
      else next[id] = { ...(next[id] ?? { title: "", createdAt: Date.now(), updatedAt: Date.now() }), ...patch };
      return next;
    });

  return {
    create: async (title: string): Promise<string> => {
      const id = newId();
      const now = Date.now();
      const data: BoardData = { title, bg: "dark", fs: DEFAULT_FS, html: "", strokes: [], h: BOARD_H, updatedAt: now };
      await setDoc(boardRef(id), data);
      const meta: BoardMeta = { title, createdAt: now, updatedAt: now };
      await setDoc(indexRef(), { items: { [id]: meta } }, { merge: true });
      setMeta(id, meta);
      qc.setQueryData(["board", id], data);
      return id;
    },
    /** 자동 저장 — 내용 문서 전체 + 목록의 제목·시각·미리보기 */
    save: async (id: string, data: BoardData, thumb?: string) => {
      await setDoc(boardRef(id), data);
      const meta: Partial<BoardMeta> = { title: data.title, updatedAt: data.updatedAt, ...(thumb ? { thumb } : {}) };
      await setDoc(indexRef(), { items: { [id]: meta } }, { merge: true });
      setMeta(id, meta);
    },
    rename: async (id: string, title: string) => {
      setMeta(id, { title });
      await updateDoc(indexRef(), { [`items.${id}.title`]: title });
      await setDoc(boardRef(id), { title }, { merge: true });
    },
    duplicate: async (id: string): Promise<string | null> => {
      const snap = await getDoc(boardRef(id));
      if (!snap.exists()) return null;
      const src = snap.data() as BoardData;
      const nid = newId();
      const now = Date.now();
      const title = `${src.title || "칠판"} 사본`;
      await setDoc(boardRef(nid), { ...src, title, updatedAt: now });
      const old = qc.getQueryData<Record<string, BoardMeta>>(BI_KEY)?.[id];
      const meta: BoardMeta = { title, createdAt: now, updatedAt: now, ...(old?.thumb ? { thumb: old.thumb } : {}) };
      await setDoc(indexRef(), { items: { [nid]: meta } }, { merge: true });
      setMeta(nid, meta);
      return nid;
    },
    remove: async (id: string) => {
      setMeta(id, null);
      await deleteDoc(boardRef(id));
      await updateDoc(indexRef(), { [`items.${id}`]: deleteField() });
      try {
        localStorage.removeItem(`class2nd-board-${id}`);
      } catch {}
    },
  };
}
