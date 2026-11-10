"use client";
// 🖊️ 전자칠판 — 목록 ↔ 칠판 (주소 #아이디로 열린 칠판을 기억: 새로고침해도 그대로).
// 두 층: ① 글 층(줄마다 색·굵게 — 선생님이 쓰던 '검은 칠판 + 색 글씨 줄' 그대로) ② 펜 층(손글씨·형광·지우개).
// 저장: 쓰는 대로 자동 저장(useAutosave) + 이 기기에도 임시본 — 저장 버튼이 없다.
// 좌표·글자 크기는 1600×900 논리 판 기준이라 노트북·프로젝터·태블릿 어디서 열어도 같은 배치.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BOARD_H,
  BOARD_MAX_H,
  BOARD_MAX_BYTES,
  BOARD_W,
  boardBytes,
  decodePoints,
  encodePoints,
  sanitizeBoardHtml,
  useBoardData,
  useBoardIndex,
  useBoardOps,
  type BoardBg,
  type BoardData,
  type Stroke,
  type StrokeTool,
} from "@/lib/query/tools";
import { useAutosave, saveLabel } from "@/lib/useAutosave";
import { useFeedback } from "@/components/ui/Feedback";
import EmptyState from "@/components/ui/EmptyState";
import { FloatLaunchers, FocusButton, useFocusMode } from "@/components/tools/ToolsShell";

// ── 주소 #아이디 ──
const subHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const getHash = () => decodeURIComponent(window.location.hash.slice(1));
function go(id: string | null) {
  if (id) window.location.hash = id;
  else {
    history.pushState(null, "", window.location.pathname);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}

const BG: Record<BoardBg, { label: string; fill: string; ink: string; css: React.CSSProperties }> = {
  dark: { label: "검정", fill: "#1d1b18", ink: "#f6f1e7", css: { background: "#1d1b18" } },
  green: { label: "초록", fill: "#23382e", ink: "#f3f0e4", css: { background: "#23382e" } },
  plain: { label: "흰색", fill: "#fffdf9", ink: "#26211b", css: { background: "#fffdf9" } },
  grid: {
    label: "모눈",
    fill: "#fffdf9",
    ink: "#26211b",
    css: {
      background: "#fffdf9",
      backgroundImage:
        "linear-gradient(#e9e2d6 1px, transparent 1px), linear-gradient(90deg, #e9e2d6 1px, transparent 1px)",
      backgroundSize: "50px 50px",
    },
  },
};
const isDark = (bg: BoardBg) => bg === "dark" || bg === "green";
// 칠판색 — 어두운 판은 분필처럼 밝게, 밝은 판은 진하게 (사용자 칠판의 빨·주·노·초·파)
const COLORS_DARK = ["#f6f1e7", "#ff6b6b", "#ffa94d", "#ffd43b", "#8ce99a", "#74c0fc", "#da77f2"];
const COLORS_LIGHT = ["#26211b", "#d6336c", "#e8590c", "#c08a00", "#2b8a3e", "#1c7ed6", "#7048e8"];
// 글자 크기 — 블록(선택)한 글자에만 적용 (사용자 2026-11: "크기를 바꾸면 모든 글씨가 바뀐다, 부분 변경·다양한 크기")
const SIZES = [20, 24, 28, 32, 36, 40, 48, 56, 60, 64, 72, 80, 96, 120, 150];
// 칠판 전체의 기본 크기 (아무 크기도 정하지 않은 글자)
const BASE_SIZES = [36, 48, 60, 75, 90];
const PEN_W = [3, 6, 10];

const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function BoardPage() {
  const id = useSyncExternalStore(subHash, getHash, () => "");
  return id ? <BoardLoader key={id} id={id} /> : <BoardList />;
}

// ───────────────────────── 목록 ─────────────────────────
function BoardList() {
  const { data: index, isLoading } = useBoardIndex(true);
  const ops = useBoardOps();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const list = useMemo(() => Object.entries(index ?? {}).sort((a, b) => b[1].updatedAt - a[1].updatedAt), [index]);

  const create = async () => {
    setBusy(true);
    try {
      const d = new Date();
      const days = "일월화수목금토";
      const nid = await ops.create(`${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) 칠판`);
      go(nid);
    } catch {
      toast("칠판을 만들지 못했어요. 인터넷 연결을 확인해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight text-ink-900">칠판</h2>
          <p className="text-[13px] text-ink-500">쓰는 대로 저장돼요 · {list.length}개</p>
        </div>
        <button
          onClick={() => void create()}
          disabled={busy}
          className="press h-10 rounded-full bg-ink-900 px-5 text-sm font-bold text-white disabled:opacity-40"
        >
          + 새 칠판
        </button>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-ink-400">불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-ink-200 bg-white p-8">
          <EmptyState emoji="🖊️" title="아직 칠판이 없어요" desc="‘새 칠판’을 누르면 바로 쓸 수 있어요. 다 쓴 칠판은 여기 모여요." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
          {list.map(([bid, m]) => (
            <div key={bid} className="group min-w-0">
              <button onClick={() => go(bid)} className="press block w-full">
                <div className="aspect-video overflow-hidden rounded-[10px] border border-ink-200 bg-[#1d1b18]">
                  {m.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumb} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
              </button>
              {renaming === bid ? (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => {
                    if (name.trim() && name !== m.title) void ops.rename(bid, name.trim()).catch(() => toast("이름을 바꾸지 못했어요.", "error"));
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="mt-2 h-8 w-full rounded-btn bg-white px-2 text-[14px] font-bold outline-none ring-2 ring-ink-300"
                />
              ) : (
                <div className="mt-2 flex items-start justify-between gap-1">
                  <button onClick={() => go(bid)} className="min-w-0 text-left">
                    <p className="truncate text-[14px] font-bold text-ink-900">{m.title || "제목 없는 칠판"}</p>
                    <p className="text-[12px] text-ink-500">{fmtDate(m.updatedAt)}</p>
                  </button>
                  <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
                    <IconBtn
                      label="이름 바꾸기"
                      onClick={() => {
                        setName(m.title);
                        setRenaming(bid);
                      }}
                    >
                      ✎
                    </IconBtn>
                    <IconBtn
                      label="복사본 만들기"
                      onClick={() =>
                        void ops
                          .duplicate(bid)
                          .then(() => toast("복사본을 만들었어요.", "success"))
                          .catch(() => toast("복사하지 못했어요.", "error"))
                      }
                    >
                      ⧉
                    </IconBtn>
                    <IconBtn
                      label="지우기"
                      danger
                      onClick={async () => {
                        if (!(await confirm({ title: `'${m.title}'을(를) 지울까요?`, body: "지운 칠판은 되돌릴 수 없어요.", danger: true, confirmLabel: "지우기" })))
                          return;
                        void ops.remove(bid).catch(() => toast("지우지 못했어요.", "error"));
                      }}
                    >
                      ✕
                    </IconBtn>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`press grid h-7 w-7 place-items-center rounded-full text-[13px] text-ink-500 hover:bg-ink-200 ${danger ? "hover:text-danger" : "hover:text-ink-900"}`}
    >
      {children}
    </button>
  );
}

// ───────────────────────── 칠판 열기 ─────────────────────────
function BoardLoader({ id }: { id: string }) {
  const { data, isLoading, error } = useBoardData(id);
  const initial = useMemo(() => {
    if (isLoading || error) return null;
    // 이 기기 임시본이 서버보다 새것이면(저장 전에 창이 닫힘 등) 그것으로 이어 쓴다
    let local: (BoardData & { at?: number }) | null = null;
    try {
      local = JSON.parse(localStorage.getItem(`class2nd-board-${id}`) ?? "null");
    } catch {}
    if (local && (!data || (local.at ?? 0) > data.updatedAt + 1000)) return { data: { ...local }, dirty: true };
    return data ? { data, dirty: false } : null;
  }, [data, isLoading, error, id]);

  if (isLoading) return <p className="py-16 text-center text-sm text-ink-400">칠판을 여는 중…</p>;
  if (error || !initial)
    return (
      <div className="rounded-card border border-ink-200 bg-white p-8">
        <EmptyState emoji="🧭" title={error ? "칠판을 열지 못했어요" : "지워졌거나 없는 칠판이에요"} />
        <div className="mt-4 text-center">
          <button onClick={() => go(null)} className="press h-10 rounded-full bg-ink-900 px-5 text-sm font-bold text-white">
            목록으로
          </button>
        </div>
      </div>
    );
  return <Editor id={id} initial={initial.data} dirty={initial.dirty} />;
}

// ───────────────────────── 편집기 ─────────────────────────
type Mode = "text" | StrokeTool;

function Editor({ id, initial, dirty }: { id: string; initial: BoardData; dirty: boolean }) {
  const ops = useBoardOps();
  const { toast, confirm } = useFeedback();
  const { on: focus, toggle } = useFocusMode();

  const [title, setTitle] = useState(initial.title);
  const [bg, setBg] = useState<BoardBg>(initial.bg);
  const [fs, setFs] = useState(initial.fs);
  // ↕ 칠판 높이(논리 px) — 글이 넘치거나 아래쪽에 쓰면 반 화면씩 늘어난다 → 판 안에서 위아래로 스크롤
  const [h, setH] = useState(() => Math.min(Math.max(initial.h ?? BOARD_H, BOARD_H), BOARD_MAX_H));
  const HALF = BOARD_H / 2;
  const grow = useCallback((need: number) => {
    setH((cur) => (need > cur - 80 ? Math.min(BOARD_MAX_H, Math.ceil((need + HALF) / HALF) * HALF) : cur));
  }, [HALF]);
  const [html, setHtml] = useState(() => sanitizeBoardHtml(initial.html));
  const [strokes, setStrokes] = useState<Stroke[]>(initial.strokes);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [mode, setMode] = useState<Mode>("text");
  const [penColor, setPenColor] = useState<string | null>(null); // null = 판 기본색
  const [penW, setPenW] = useState(PEN_W[1]);

  const palette = isDark(bg) ? COLORS_DARK : COLORS_LIGHT;
  const ink = BG[bg].ink;

  const editorRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // 글 층 — React가 아닌 contentEditable이 주인 (커서가 튀지 않게 붙을 때 한 번만 넣는다).
  // '크게 보기'로 바꾸면 노드가 새로 붙으므로 그때도 최신 내용을 다시 넣는다.
  const htmlRef = useRef(html);
  useEffect(() => {
    htmlRef.current = html;
  }, [html]);
  const setEditor = useCallback((el: HTMLDivElement | null) => {
    editorRef.current = el;
    if (el) el.innerHTML = htmlRef.current;
  }, []);

  // 판 크기 — 들어갈 자리에 16:9로 꽉 맞춘다
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / BOARD_W, el.clientHeight ? el.clientHeight / BOARD_H : Infinity));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [focus]);

  // ── 펜 층 그리기 ──
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // 캔버스 해상도 배율 (선명함 vs 메모리) — 길어진 칠판은 메모리를 아끼려고 조금 낮춘다
  const k = Math.min(h > BOARD_H * 3 ? 1.25 : 2, Math.max(1, scale * dpr));
  const drawStroke = useCallback(
    (ctx: CanvasRenderingContext2D, s: Stroke, pts = decodePoints(s.p)) => {
      if (pts.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = s.w;
      if (s.t === "er") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "#000";
      } else {
        ctx.strokeStyle = s.c || ink;
        if (s.t === "hl") ctx.globalAlpha = 0.35;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      if (pts.length === 2) ctx.lineTo(pts[0] + 0.1, pts[1]);
      // 점 사이 중점을 잇는 2차 곡선 — 손글씨가 각지지 않게
      for (let i = 2; i < pts.length - 2; i += 2) {
        const mx = (pts[i] + pts[i + 2]) / 2;
        const my = (pts[i + 1] + pts[i + 3]) / 2;
        ctx.quadraticCurveTo(pts[i], pts[i + 1], mx, my);
      }
      if (pts.length >= 4) ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
      ctx.stroke();
      ctx.restore();
    },
    [ink]
  );
  const redraw = useCallback(() => {
    const c = baseRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    for (const s of strokes) drawStroke(ctx, s);
  }, [strokes, drawStroke, k]);
  useEffect(() => {
    redraw();
  }, [redraw, focus, h]); // 크게 보기 전환·높이 변화 시 캔버스가 새로 그려져야 한다 // 크게 보기 전환 시 캔버스가 새로 붙는다

  const cur = useRef<{ t: StrokeTool; c: string; w: number; pts: number[]; pid: number } | null>(null);
  const penSeen = useRef(false);
  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = liveRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOARD_W, ((e.clientY - r.top) / r.height) * h] as const;
  };
  const tooBig = boardBytes({ strokes, html }) > BOARD_MAX_BYTES;

  const onDown = (e: React.PointerEvent) => {
    if (mode === "text") return;
    if (e.pointerType === "pen") penSeen.current = true;
    if (e.pointerType === "touch" && penSeen.current) return; // 펜을 쓰는 중엔 손바닥 터치 무시
    if (tooBig) {
      toast("칠판이 가득 찼어요 — 새 칠판에 이어서 써 주세요.", "warn");
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    const [x, y] = toLogical(e);
    const t = mode;
    const w = t === "er" ? 44 : t === "hl" ? 26 : penW;
    const c = t === "er" ? "" : t === "hl" ? (penColor ?? "#ffd43b") : (penColor ?? "");
    cur.current = { t, c, w, pts: [x, y], pid: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = cur.current;
    if (!s || e.pointerId !== s.pid) return;
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evs) {
      const [x, y] = toLogical(ev);
      const lx = s.pts[s.pts.length - 2];
      const ly = s.pts[s.pts.length - 1];
      if (Math.hypot(x - lx, y - ly) < 1.5) continue;
      s.pts.push(x, y);
    }
    if (s.t === "er") {
      // 지우개는 바로 밑판에서 지운다 (미리보기 층에선 '지우는' 모습을 보일 수 없음)
      const ctx = baseRef.current?.getContext("2d");
      if (ctx) {
        ctx.setTransform(k, 0, 0, k, 0, 0);
        drawStroke(ctx, { t: "er", c: "", w: s.w, p: "" }, s.pts.slice(-6));
      }
      return;
    }
    const lc = liveRef.current;
    const ctx = lc?.getContext("2d");
    if (!lc || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, lc.width, lc.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawStroke(ctx, { t: s.t, c: s.c, w: s.w, p: "" }, s.pts);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = cur.current;
    if (!s || e.pointerId !== s.pid) return;
    cur.current = null;
    const lc = liveRef.current;
    lc?.getContext("2d")?.clearRect(0, 0, lc.width, lc.height);
    const stroke: Stroke = { t: s.t, c: s.c, w: s.w, p: encodePoints(s.pts) };
    setStrokes((arr) => [...arr, stroke]);
    setRedo([]);
    // 아래쪽 끝까지 쓰면 칠판을 늘려 계속 쓸 수 있게
    let maxY = 0;
    for (let i = 1; i < s.pts.length; i += 2) maxY = Math.max(maxY, s.pts[i]);
    if (s.t !== "er") grow(maxY);
  };

  // ── 글 층 서식 ── (버튼은 onMouseDown에서 기본 동작을 막아 선택 영역을 잃지 않는다)
  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, val);
    } catch {}
    setHtml(editorRef.current?.innerHTML ?? "");
  };
  const keep = (e: React.MouseEvent) => e.preventDefault();

  // ── 부분 글자 크기 ──
  // 크기 고르기 칸을 누르면 편집 칸의 선택(블록)이 풀리므로, 마지막 선택을 기억해 두었다가 되살린 뒤 적용한다.
  const savedRange = useRef<Range | null>(null);
  const [selSize, setSelSize] = useState<number | null>(null); // 지금 커서·블록 글자의 크기(논리 px)
  useEffect(() => {
    const onSel = () => {
      const ed = editorRef.current;
      const sel = document.getSelection();
      if (!ed || !sel || !sel.rangeCount || !ed.contains(sel.anchorNode)) return;
      savedRange.current = sel.getRangeAt(0).cloneRange();
      const el = sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : (sel.anchorNode as HTMLElement | null);
      if (el && ed.contains(el)) setSelSize(Math.round(parseFloat(getComputedStyle(el).fontSize)));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  // 선택 영역을 직접 감싼다 (execCommand fontSize는 브라우저마다 결과가 달라 커서·글자 순서가 꼬였다)
  const applySize = (px: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const sel = document.getSelection();
    const saved = savedRange.current;
    const range = saved && ed.contains(saved.commonAncestorContainer) ? saved.cloneRange() : null;
    if (!sel || !range) return;
    const stripSizes = (root: ParentNode) =>
      root.querySelectorAll<HTMLElement>("[style]").forEach((n) => n.style.removeProperty("font-size"));
    if (range.collapsed) {
      // 블록 없이 커서만 — 그 자리에 크기를 가진 빈 칸을 두고 커서를 안에 넣는다 → 이어서 쓰는 글자가 그 크기
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      const zw = document.createTextNode("\u200b");
      span.appendChild(zw);
      range.insertNode(span);
      const r2 = document.createRange();
      r2.setStart(zw, 1);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);
      savedRange.current = r2.cloneRange();
    } else {
      const frag = range.extractContents();
      stripSizes(frag);
      const out = document.createDocumentFragment();
      let inline: HTMLSpanElement | null = null;
      for (const node of [...frag.childNodes]) {
        const isBlock = node.nodeType === 1 && /^(DIV|P)$/.test((node as HTMLElement).tagName);
        if (isBlock) {
          // 여러 줄을 골랐으면 줄(칸)마다 크기를 준다 — 줄을 span으로 감싸면 줄바꿈이 깨진다
          (node as HTMLElement).style.fontSize = `${px}px`;
          inline = null;
          out.appendChild(node);
        } else {
          if (!inline) {
            inline = document.createElement("span");
            inline.style.fontSize = `${px}px`;
            out.appendChild(inline);
          }
          inline.appendChild(node);
        }
      }
      const first = out.firstChild;
      const last = out.lastChild;
      range.insertNode(out);
      if (first && last) {
        const r2 = document.createRange();
        r2.setStartBefore(first);
        r2.setEndAfter(last);
        sel.removeAllRanges();
        sel.addRange(r2);
        savedRange.current = r2.cloneRange();
      }
    }
    setSelSize(px);
    setHtml(ed.innerHTML);
  };
  const stepSize = (dir: 1 | -1) => {
    const cur = selSize ?? fs;
    const next = dir > 0 ? SIZES.find((n) => n > cur) : [...SIZES].reverse().find((n) => n < cur);
    if (next) applySize(next);
  };

  const undo = () => {
    if (mode === "text") return exec("undo");
    if (!strokes.length) return;
    setRedo((r) => [...r, strokes[strokes.length - 1]]);
    setStrokes(strokes.slice(0, -1));
  };
  const redoFn = () => {
    if (mode === "text") return exec("redo");
    if (!redo.length) return;
    setStrokes((arr) => [...arr, redo[redo.length - 1]]);
    setRedo(redo.slice(0, -1));
  };

  // ── 저장 ── 미리보기(160×90)는 저장할 때 같이 만든다
  const makeThumb = useCallback((): string | undefined => {
    try {
      const W = 160;
      const H = 90;
      const s = W / BOARD_W;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = BG[bg].fill;
      ctx.fillRect(0, 0, W, H);
      // 글: 화면에 놓인 자리 그대로 작게
      const ed = editorRef.current;
      if (ed) {
        const er = ed.getBoundingClientRect();
        const sc = er.width / BOARD_W || 1;
        const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent ?? "";
          if (!text.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          const rect = r.getClientRects()[0];
          if (!rect) continue;
          const cs = getComputedStyle(n.parentElement!);
          ctx.fillStyle = cs.color;
          ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * s}px sans-serif`;
          ctx.textBaseline = "top";
          ctx.fillText(text, ((rect.left - er.left) / sc) * s, ((rect.top - er.top) / sc) * s);
        }
      }
      const pc = document.createElement("canvas");
      pc.width = W;
      pc.height = H;
      const pctx = pc.getContext("2d")!;
      pctx.setTransform(s, 0, 0, s, 0, 0);
      for (const st of strokes) drawStroke(pctx, st);
      ctx.drawImage(pc, 0, 0);
      return c.toDataURL("image/jpeg", 0.7);
    } catch {
      return undefined;
    }
  }, [bg, strokes, drawStroke]);

  const value = useMemo(() => ({ title, bg, fs, html, strokes, h }), [title, bg, fs, html, strokes, h]);
  useEffect(() => {
    try {
      localStorage.setItem(`class2nd-board-${id}`, JSON.stringify({ ...value, updatedAt: Date.now(), at: Date.now() }));
    } catch {}
  }, [value, id]);
  const { state, savedAt, flush } = useAutosave(value, {
    enabled: !tooBig,
    initiallyDirty: dirty,
    delay: 1200,
    save: async (v) => {
      await ops.save(id, { ...v, html: sanitizeBoardHtml(v.html), updatedAt: Date.now() }, makeThumb());
    },
  });

  const clearAll = async () => {
    if (!(await confirm({ title: "칠판을 모두 지울까요?", body: "글과 펜 글씨가 모두 지워져요.", danger: true, confirmLabel: "모두 지우기" }))) return;
    setStrokes([]);
    setH(BOARD_H);
    scrollRef.current?.scrollTo({ top: 0 });
    setRedo([]);
    if (editorRef.current) editorRef.current.innerHTML = "";
    setHtml("");
  };

  const back = async () => {
    await flush();
    go(null);
  };

  // ── 도구 막대 ──
  const seg = (on: boolean) =>
    `press h-9 rounded-[8px] px-3 text-[13px] font-bold transition-colors ${on ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-200/70"}`;
  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-0.5 rounded-[10px] bg-ink-100 p-0.5">
        {(
          [
            ["text", "글"],
            ["pen", "펜"],
            ["hl", "형광"],
            ["er", "지우개"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} className={seg(mode === m)}>
            {label}
          </button>
        ))}
      </div>

      {mode === "text" ? (
        <div className="flex items-center gap-0.5">
          {(
            [
              ["bold", "B", "font-bold"],
              ["italic", "I", "italic"],
              ["underline", "U", "underline"],
              ["strikeThrough", "S", "line-through"],
            ] as const
          ).map(([cmd, label, cls]) => (
            <button key={cmd} onMouseDown={keep} onClick={() => exec(cmd)} aria-label={cmd} className={`press h-9 w-9 rounded-[8px] text-[15px] text-ink-700 hover:bg-ink-200/70 ${cls}`}>
              {label}
            </button>
          ))}
          {/* 글자 크기 — 블록으로 고른 글자만 (블록이 없으면 이어서 쓰는 글자부터) */}
          <span className="ml-1 flex items-center rounded-[8px] bg-ink-100">
            <button onMouseDown={keep} onClick={() => stepSize(-1)} aria-label="글자 작게" title="글자 작게" className="press h-9 w-8 rounded-l-[8px] text-[13px] font-bold text-ink-700 hover:bg-ink-200">
              가−
            </button>
            <select
              value={SIZES.includes(selSize ?? -1) ? String(selSize) : ""}
              onChange={(e) => e.target.value && applySize(Number(e.target.value))}
              className="h-9 bg-transparent px-1 text-[13px] font-bold text-ink-700"
              aria-label="고른 글자 크기"
              title="블록으로 고른 글자의 크기"
            >
              <option value="">{selSize ? `${selSize}px` : "크기"}</option>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}px
                </option>
              ))}
            </select>
            <button onMouseDown={keep} onClick={() => stepSize(1)} aria-label="글자 크게" title="글자 크게" className="press h-9 w-8 rounded-r-[8px] text-[15px] font-bold text-ink-700 hover:bg-ink-200">
              가+
            </button>
          </span>
        </div>
      ) : mode !== "er" ? (
        <div className="flex items-center gap-0.5">
          {mode === "pen" &&
            PEN_W.map((w) => (
              <button key={w} onClick={() => setPenW(w)} aria-label={`굵기 ${w}`} className={`grid h-9 w-9 place-items-center rounded-[8px] ${penW === w ? "bg-ink-200" : "hover:bg-ink-100"}`}>
                <span className="rounded-full bg-ink-800" style={{ width: w + 3, height: w + 3 }} />
              </button>
            ))}
        </div>
      ) : (
        <span className="text-[12px] text-ink-500">펜·형광 글씨를 지워요 (글은 글 모드에서)</span>
      )}

      {mode !== "er" && (
        <div className="flex items-center gap-1">
          {palette.map((c, i) => {
            const val = i === 0 && mode !== "hl" ? null : c;
            const on = mode === "text" ? false : (penColor ?? (mode === "hl" ? "#ffd43b" : null)) === val;
            return (
              <button
                key={c}
                onMouseDown={keep}
                onClick={() => (mode === "text" ? exec("foreColor", c) : setPenColor(val))}
                aria-label={`색 ${c}`}
                className={`press h-7 w-7 rounded-full border ${on ? "ring-2 ring-ink-900 ring-offset-2 ring-offset-white" : ""}`}
                style={{ background: c, borderColor: "rgba(0,0,0,0.12)" }}
              />
            );
          })}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button onMouseDown={keep} onClick={undo} className="press h-9 w-9 rounded-[8px] text-[18px] text-ink-600 hover:bg-ink-200/70" aria-label="되돌리기" title="되돌리기">
          ↶
        </button>
        <button onMouseDown={keep} onClick={redoFn} className="press h-9 w-9 rounded-[8px] text-[18px] text-ink-600 hover:bg-ink-200/70" aria-label="다시 하기" title="다시 하기">
          ↷
        </button>
        {/* 칠판 전체 기본 크기 — 크기를 따로 정하지 않은 글자에만 */}
        <select
          value={fs}
          onChange={(e) => setFs(Number(e.target.value))}
          className="h-9 rounded-[8px] bg-ink-100 px-2 text-[13px] font-bold text-ink-700"
          aria-label="기본 글자 크기"
          title="크기를 따로 정하지 않은 글자 전체"
        >
          {BASE_SIZES.map((n) => (
            <option key={n} value={n}>
              기본 {n}
            </option>
          ))}
        </select>
        <select
          value={bg}
          onChange={(e) => setBg(e.target.value as BoardBg)}
          className="h-9 rounded-[8px] bg-ink-100 px-2 text-[13px] font-bold text-ink-700"
          aria-label="바탕"
        >
          {(Object.keys(BG) as BoardBg[]).map((b) => (
            <option key={b} value={b}>
              {BG[b].label} 바탕
            </option>
          ))}
        </select>
        <button onClick={() => void clearAll()} className="press h-9 rounded-[8px] px-2.5 text-[13px] font-bold text-danger hover:bg-danger-weak">
          모두 지우기
        </button>
      </div>
    </div>
  );

  // 글이 실제로 끝나는 위치(논리 px) — 편집 칸 높이(=칠판 높이)가 아니라 글자의 아래 끝을 잰다
  const textBottom = (ed: HTMLElement) => {
    const r = document.createRange();
    r.selectNodeContents(ed);
    const rect = r.getBoundingClientRect();
    const er = ed.getBoundingClientRect();
    if (!rect.height) return 0;
    return (rect.bottom - er.top) / (er.width / BOARD_W || 1) + 40;
  };
  const frameH = BOARD_H * scale;
  const pages = Math.ceil(h / BOARD_H - 0.01);
  const scrollBy = (dir: 1 | -1) => scrollRef.current?.scrollBy({ top: dir * frameH * 0.8, behavior: "smooth" });
  const stage = (
    <div ref={boxRef} className={`relative min-h-0 w-full ${focus ? "flex-1" : "aspect-video"}`}>
      <div
        className="absolute left-1/2 top-1/2 rounded-[10px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
        style={{ width: BOARD_W * scale, height: frameH, transform: "translate(-50%,-50%)", ...BG[bg].css }}
      >
        {/* ↕ 판 안에서 위아래로 — 마우스 휠·터치(글 모드)·오른쪽 아래 버튼 */}
        <div
          ref={scrollRef}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          className="board-scroll h-full w-full overflow-y-auto overflow-x-hidden rounded-[10px]"
        >
          <div className="relative" style={{ width: BOARD_W * scale, height: h * scale }}>
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ width: BOARD_W, height: h, transform: `scale(${scale})`, ...BG[bg].css }}
            >
              <div
                ref={setEditor}
                contentEditable={mode === "text"}
                suppressContentEditableWarning
                spellCheck={false}
                onInput={() => {
                  const ed = editorRef.current;
                  setHtml(ed?.innerHTML ?? "");
                  if (ed) grow(textBottom(ed)); // 글이 아래로 넘치면 칠판을 늘린다
                }}
                onKeyUp={() => {
                  const sel = document.getSelection();
                  if (sel?.rangeCount && editorRef.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
                }}
                onMouseUp={() => {
                  const sel = document.getSelection();
                  if (sel?.rangeCount && editorRef.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
                }}
                onPaste={(e) => {
                  // 붙여넣기는 글자만 — 웹 문서의 이상한 서식·이미지가 섞이지 않게
                  e.preventDefault();
                  document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
                }}
                data-placeholder="여기에 써요 — 줄마다 색을 바꿀 수 있어요"
                className="board-text absolute inset-0 overflow-hidden px-12 py-10 outline-none"
                style={{ color: ink, fontSize: fs, lineHeight: 1.38, fontWeight: 500, letterSpacing: "-0.01em" }}
              />
              <canvas
                ref={baseRef}
                width={BOARD_W * k}
                height={h * k}
                className="pointer-events-none absolute inset-0"
                style={{ width: BOARD_W, height: h }}
              />
              <canvas
                ref={liveRef}
                width={BOARD_W * k}
                height={h * k}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className={`absolute inset-0 touch-none ${mode === "text" ? "pointer-events-none" : mode === "er" ? "cursor-cell" : "cursor-crosshair"}`}
                style={{ width: BOARD_W, height: h }}
              />
            </div>
          </div>
        </div>
        {/* 위아래 이동 + 아래로 늘리기 */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/90 p-1 shadow-pop backdrop-blur">
          <button onClick={() => scrollBy(-1)} disabled={scrollTop <= 1} aria-label="위로" className="press grid h-8 w-8 place-items-center rounded-full text-ink-700 hover:bg-ink-100 disabled:opacity-30">
            ▲
          </button>
          <span className="min-w-[3.6em] text-center text-[12px] font-bold tabular-nums text-ink-600">
            {Math.min(pages, Math.floor(scrollTop / Math.max(1, frameH) + 0.5) + 1)} / {pages}
          </span>
          <button
            onClick={() => scrollBy(1)}
            disabled={scrollTop + frameH >= h * scale - 1}
            aria-label="아래로"
            className="press grid h-8 w-8 place-items-center rounded-full text-ink-700 hover:bg-ink-100 disabled:opacity-30"
          >
            ▼
          </button>
          <button
            onClick={() => {
              setH((cur) => Math.min(BOARD_MAX_H, cur + BOARD_H));
              setTimeout(() => scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }), 50);
            }}
            disabled={h >= BOARD_MAX_H}
            className="press h-8 rounded-full px-3 text-[12px] font-bold text-ink-700 hover:bg-ink-100 disabled:opacity-30"
          >
            + 한 화면 더
          </button>
        </div>
      </div>
    </div>
  );

  const status = (
    <span className={`text-[12px] ${state === "error" || tooBig ? "font-bold text-danger" : "text-ink-500"}`}>
      {tooBig ? "⚠️ 칠판이 가득 찼어요 — 새 칠판에 이어서 써 주세요" : saveLabel(state, savedAt)}
    </span>
  );

  if (focus)
    return (
      <section className="fixed inset-0 z-[60] flex flex-col gap-2 bg-ink-100 p-3">
        <div className="flex items-center gap-3 rounded-[12px] border border-ink-200 bg-white px-3 py-1.5">
          {toolbar}
          <FloatLaunchers compact />
          <FocusButton on={focus} toggle={toggle} />
        </div>
        {stage}
      </section>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void back()} className="press h-9 rounded-full px-3 text-[13px] font-bold text-ink-600 hover:bg-ink-200/70">
          ‹ 목록
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[20px] font-bold tracking-tight text-ink-900 outline-none"
          aria-label="칠판 이름"
        />
        {status}
        <FocusButton on={focus} toggle={toggle} />
      </div>
      <div className="rounded-[12px] border border-ink-200 bg-white px-3 py-2">{toolbar}</div>
      {stage}
    </div>
  );
}
