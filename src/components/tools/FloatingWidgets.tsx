"use client";
// 🪟 떠 있는 도구 창 — 제목 줄을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꾼다.
// 창 안 글자는 창 크기에 맞춰 커진다 (CSS 컨테이너 단위 cqw·cqh) — 크게 늘리면 프로젝터에서도 보인다.
// 선생님 화면 어디서든 셸에 한 번 그려진다 (칠판 '크게 보기' 위에도 뜬다: z-index 80+).
import { useEffect, useMemo, useRef, useState } from "react";
import { useWidgets, WIDGET_META, type WidgetBox, type WidgetKind } from "@/stores/widgets";
import { useTimer, leftMs, swMs, fmt, fmtSw } from "@/stores/timer";
import { chimePick, tick, unlockAudio } from "@/lib/tools/chime";
import { useNoiseMeter, noiseFace, mmss } from "@/lib/tools/useNoiseMeter";
import { students } from "@/lib/roster";
import { useAttendance } from "@/lib/query/classMeta";
import { todayKST } from "@/lib/date";

export default function FloatingWidgets() {
  const open = useWidgets((s) => s.open);
  return (
    <>
      {open.map((w) => (
        <Win key={w.kind} box={w}>
          {w.kind === "timer" ? <TimerW /> : w.kind === "pick" ? <PickW /> : <NoiseW />}
        </Win>
      ))}
    </>
  );
}

function Win({ box, children }: { box: WidgetBox; children: React.ReactNode }) {
  const { update, close, focus } = useWidgets();
  const meta = WIDGET_META[box.kind];
  const drag = useRef<{ mode: "move" | "size"; sx: number; sy: number; b: WidgetBox } | null>(null);

  // 화면 크기가 줄면 창이 밖으로 나가지 않게
  useEffect(() => {
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(box.w, vw - 16);
      const h = Math.min(box.h, vh - 16);
      const x = Math.min(Math.max(8, box.x), vw - w - 8);
      const y = Math.min(Math.max(8, box.y), vh - h - 8);
      if (x !== box.x || y !== box.y || w !== box.w || h !== box.h) update(box.kind, { x, y, w, h });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [box, update]);

  const startDrag = (mode: "move" | "size", e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button") && mode === "move") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    focus(box.kind);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, b: box };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (d.mode === "move") {
      update(box.kind, {
        x: Math.min(Math.max(0, d.b.x + dx), vw - d.b.w),
        y: Math.min(Math.max(0, d.b.y + dy), vh - 40),
      });
    } else {
      update(box.kind, {
        w: Math.min(Math.max(meta.minW, d.b.w + dx), vw - d.b.x - 4),
        h: Math.min(Math.max(meta.minH, d.b.h + dy), vh - d.b.y - 4),
      });
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <section
      role="dialog"
      aria-label={`${meta.label} 창`}
      onPointerDown={() => focus(box.kind)}
      className="fixed flex flex-col overflow-hidden rounded-[14px] border border-ink-300 bg-white shadow-[0_18px_50px_rgba(38,33,27,0.22)]"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 80 + box.z }}
    >
      <header
        onPointerDown={(e) => startDrag("move", e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="flex h-9 shrink-0 cursor-grab touch-none select-none items-center justify-between border-b border-ink-200 bg-ink-50 pl-3 pr-1 active:cursor-grabbing"
      >
        <span className="text-[12.5px] font-bold text-ink-600">{meta.label}</span>
        <button
          onClick={() => close(box.kind)}
          aria-label={`${meta.label} 창 닫기`}
          className="grid h-7 w-7 place-items-center rounded-full text-[14px] text-ink-500 hover:bg-ink-200 hover:text-ink-900"
        >
          ✕
        </button>
      </header>
      <div className="relative min-h-0 flex-1" style={{ containerType: "size" }}>
        {children}
      </div>
      {/* 크기 손잡이 */}
      <div
        onPointerDown={(e) => startDrag("size", e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-hidden
        className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none"
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, var(--color-ink-300) 50%, var(--color-ink-300) 58%, transparent 58%, transparent 70%, var(--color-ink-300) 70%, var(--color-ink-300) 78%, transparent 78%)",
        }}
      />
    </section>
  );
}

const btn = "press grid place-items-center rounded-full font-bold";

// ── 타이머 창 ──
function TimerW() {
  const t = useTimer();
  const [now, setNow] = useState(() => Date.now());
  const running = t.mode === "stopwatch" ? !!t.swStart : !!t.endAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), t.mode === "stopwatch" ? 100 : 250);
    return () => clearInterval(id);
  }, [running, t.mode]);
  const done = t.mode === "timer" && !!t.doneAt;
  const left = leftMs(t, now);
  const frac = t.total ? left / t.total : 0;
  const text = t.mode === "stopwatch" ? fmtSw(swMs(t, now)) : done ? "끝!" : fmt(left);
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-[3cqh] px-3 ${done ? "timer-flash bg-danger-weak" : ""}`}>
      {t.label && <p className="max-w-full truncate font-bold text-ink-500" style={{ fontSize: "max(12px, min(6cqw, 8cqh))" }}>{t.label}</p>}
      <p
        className={`font-bold leading-none tabular-nums tracking-tight ${done ? "text-danger" : "text-ink-900"}`}
        style={{ fontSize: `min(${t.mode === "stopwatch" ? 20 : 27}cqw, 38cqh)` }}
      >
        {text}
      </p>
      {t.mode === "timer" && (
        <div className="h-[max(4px,1.6cqh)] w-[80%] overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full ${left <= Math.max(10_000, t.total * 0.1) && !done ? "bg-warn" : "bg-ink-900"}`}
            style={{ width: `${(done ? 0 : frac) * 100}%`, transition: "width .25s linear" }}
          />
        </div>
      )}
      <div className="flex items-center gap-[3cqw]">
        {done ? (
          <button onClick={t.dismiss} className={`${btn} h-[max(34px,14cqh)] bg-ink-900 px-5 text-[max(13px,5cqw)] text-white`}>
            확인
          </button>
        ) : (
          <>
            <button
              onClick={t.reset}
              aria-label="처음으로"
              className={`${btn} h-[max(32px,13cqh)] w-[max(32px,13cqh)] bg-ink-100 text-[max(13px,5cqw)] text-ink-700`}
            >
              ↺
            </button>
            <button
              onClick={() => {
                unlockAudio();
                if (running) t.pause();
                else t.start();
              }}
              className={`${btn} h-[max(36px,15cqh)] px-[max(16px,7cqw)] text-[max(14px,5.5cqw)] ${running ? "bg-warn-weak text-warn" : "bg-ink-900 text-white"}`}
            >
              {running ? "멈춤" : "시작"}
            </button>
            {t.mode === "timer" && (
              <button
                onClick={() => t.add(60_000)}
                className={`${btn} h-[max(32px,13cqh)] px-[max(10px,3cqw)] bg-ink-100 text-[max(12px,4.2cqw)] text-ink-700`}
              >
                +1분
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── 뽑기 창 — 뽑기 화면과 같은 기록(이 기기·오늘)을 함께 쓴다 ──
const PICK_LS = "class2nd-pick";
function PickW() {
  const today = todayKST();
  const { data: att } = useAttendance();
  const absent = useMemo(() => new Set((att?.[today] ?? []).map(String)), [att, today]);
  const [shown, setShown] = useState<string>("");
  const [rolling, setRolling] = useState(false);
  const [rev, setRev] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const read = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(PICK_LS) ?? "null");
      if (raw && raw.date === today) return raw;
    } catch {}
    return { date: today, picked: { class: [], range: [], custom: [] }, excluded: [], custom: "", rangeTo: 25, noRepeat: true };
  };
  // rev가 바뀌면(뽑은 뒤) 이 기기 기록을 다시 읽는다
  const saved = useMemo(() => read(), [today, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = students.filter((x) => !x.inactive && !absent.has(String(x.id))).map((x) => x.name);
  const excluded = new Set<string>(saved.excluded ?? []);
  const picked = new Set<string>(saved.picked?.class ?? []);
  const pool = all.filter((n) => !excluded.has(n) && (!saved.noRepeat || !picked.has(n)));

  const roll = () => {
    if (!pool.length || rolling) return;
    unlockAudio();
    const win = pool[Math.floor(Math.random() * pool.length)];
    setRolling(true);
    let step = 0;
    const steps = 16;
    const spin = () => {
      step++;
      if (step >= steps) {
        setShown(win);
        setRolling(false);
        chimePick();
        const cur = read();
        cur.picked = { ...cur.picked, class: [...(cur.picked?.class ?? []), win] };
        try {
          localStorage.setItem(PICK_LS, JSON.stringify(cur));
        } catch {}
        setRev((r) => r + 1);
        return;
      }
      setShown(pool[Math.floor(Math.random() * pool.length)]);
      tick();
      timer.current = setTimeout(spin, 40 + Math.pow(step / steps, 2.2) * 200);
    };
    spin();
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[4cqh] px-3">
      <p
        className={`max-w-full truncate font-bold leading-none tracking-tight text-ink-900 ${rolling ? "opacity-60" : shown ? "badge-pop" : ""}`}
        style={{ fontSize: shown ? "min(24cqw, 36cqh)" : "max(13px, min(6cqw, 9cqh))" }}
        key={rolling ? undefined : shown}
      >
        {shown || (pool.length ? `${pool.length}명 중에서` : "모두 뽑았어요")}
      </p>
      <div className="flex items-center gap-[3cqw]">
        <button
          onClick={roll}
          disabled={!pool.length || rolling}
          className={`${btn} h-[max(36px,16cqh)] bg-ink-900 px-[max(18px,8cqw)] text-[max(14px,5.5cqw)] text-white disabled:opacity-30`}
        >
          {rolling ? "…" : "뽑기"}
        </button>
        <button
          onClick={() => {
            const cur = read();
            cur.picked = { ...cur.picked, class: [] };
            try {
              localStorage.setItem(PICK_LS, JSON.stringify(cur));
            } catch {}
            setShown("");
            setRev((r) => r + 1);
          }}
          className={`${btn} h-[max(32px,13cqh)] bg-ink-100 px-[max(10px,3cqw)] text-[max(12px,4cqw)] text-ink-700`}
        >
          처음부터
        </button>
      </div>
      <p className="text-[max(11px,3.4cqw)] text-ink-400">
        남은 {pool.length}명{absent.size ? ` · 결석 ${absent.size}명 제외` : ""}
      </p>
    </div>
  );
}

// ── 소음 창 ──
function NoiseW() {
  const m = useNoiseMeter();
  const th = m.prefs.threshold;
  const f = noiseFace(m.level, th, m.warning);
  const over = m.level >= th;
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-[3cqh] px-4 transition-colors ${m.warning ? "bg-danger-weak" : ""}`}>
      <span aria-hidden className="leading-none" style={{ fontSize: "min(26cqw, 34cqh)" }}>
        {m.running ? f.e : "🤫"}
      </span>
      {m.err ? (
        <p className="text-center text-[12px] font-bold text-danger">{m.err}</p>
      ) : (
        <div className="relative h-[max(8px,4cqh)] w-[86%] overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${m.warning || over ? "bg-danger" : m.level >= th * 0.8 ? "bg-warn" : "bg-ink-900"}`}
            style={{ width: `${m.level}%` }}
          />
          <div className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: `${th}%` }} />
        </div>
      )}
      <div className="flex items-center gap-[4cqw]">
        {m.running && (
          <p className="font-bold tabular-nums text-ink-900" style={{ fontSize: "max(14px, min(8cqw, 11cqh))" }}>
            {mmss(m.quietMs)}
            <span className="ml-1 text-[max(11px,3cqw)] font-bold text-ink-400">조용</span>
          </p>
        )}
        <button
          onClick={m.running ? m.stop : () => void m.start()}
          className={`${btn} h-[max(32px,13cqh)] px-[max(14px,5cqw)] text-[max(13px,4.5cqw)] ${m.running ? "bg-ink-100 text-ink-800" : "bg-ink-900 text-white"}`}
        >
          {m.running ? "멈추기" : "시작"}
        </button>
      </div>
    </div>
  );
}

export type { WidgetKind };
