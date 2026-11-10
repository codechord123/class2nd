"use client";
// 🪟 떠 있는 도구 창 — 제목 줄을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꾼다.
// 창 안 글자는 창 크기에 맞춰 커진다 (CSS 컨테이너 단위 cqw·cqh) — 크게 늘리면 프로젝터에서도 보인다.
// 선생님 화면 어디서든 셸에 한 번 그려진다 (칠판 '크게 보기' 위에도 뜬다: z-index 80+).
import { useEffect, useMemo, useRef, useState } from "react";
import { useWidgets, WIDGET_META, type WidgetBox, type WidgetKind } from "@/stores/widgets";
import { useTimer, leftMs, swMs, fmt, fmtSw, parseTime, TIME_STEPS } from "@/stores/timer";
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
          {w.kind === "timer" ? <TimerW box={w} /> : w.kind === "pick" ? <PickW /> : <NoiseW />}
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

// ── 타이머 창 ── 제목 쓰기 · 숫자 눌러 직접 입력 · 시간 더하기/빼기 · 프리셋 (창이 크면 더 보인다)
const W_PRESETS = [1, 3, 5, 10, 15];
function TimerW({ box }: { box: WidgetBox }) {
  const t = useTimer();
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const running = t.mode === "stopwatch" ? !!t.swStart : !!t.endAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), t.mode === "stopwatch" ? 100 : 250);
    return () => clearInterval(id);
  }, [running, t.mode]);
  const sw = t.mode === "stopwatch";
  const done = !sw && !!t.doneAt;
  const left = leftMs(t, now);
  const frac = t.total ? left / t.total : 0;
  const text = sw ? fmtSw(swMs(t, now)) : done ? "끝!" : fmt(left);
  // 창 크기에 따라 보이는 줄 — 작게 줄이면 시간·시작만, 키우면 더하기/빼기·프리셋까지
  const showSteps = !sw && !done && box.h >= 250;
  const showPresets = !sw && !done && !running && box.h >= 330;
  const commit = () => {
    const ms = parseTime(draft);
    if (ms != null && ms > 0) t.setTotal(ms);
    setEditing(false);
  };
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-[2.5cqh] px-3 py-2 ${done ? "timer-flash bg-danger-weak" : ""}`}>
      {/* 제목 — 바로 써서 고친다 */}
      <input
        value={t.label}
        onChange={(e) => t.setLabel(e.target.value)}
        placeholder="제목 쓰기 (예: 모둠 토의)"
        aria-label="타이머 제목"
        className="w-[92%] truncate rounded-[8px] bg-transparent text-center font-bold text-ink-700 outline-none placeholder:font-normal placeholder:text-ink-300 hover:bg-ink-50 focus:bg-ink-50"
        style={{ fontSize: "max(13px, min(6.5cqw, 8cqh))" }}
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d:]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          inputMode="numeric"
          placeholder="5:30"
          className="w-[80%] bg-transparent text-center font-bold tabular-nums text-ink-900 outline-none"
          style={{ fontSize: "min(20cqw, 28cqh)" }}
        />
      ) : (
        <button
          onClick={() => {
            if (sw || running || done) return;
            setDraft("");
            setEditing(true);
          }}
          title={!sw && !running && !done ? "눌러서 시간 직접 입력 (5:30 · 숫자만 쓰면 분)" : undefined}
          className={`rounded-[10px] px-2 font-bold leading-none tabular-nums tracking-tight ${done ? "text-danger" : "text-ink-900"} ${
            !sw && !running && !done ? "cursor-text hover:bg-ink-50" : "cursor-default"
          }`}
          style={{ fontSize: `min(${sw ? 18 : 24}cqw, ${showPresets ? 22 : showSteps ? 28 : 36}cqh)` }}
        >
          {text}
        </button>
      )}
      {!sw && (
        <div className="h-[max(4px,1.4cqh)] w-[80%] overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full ${left <= Math.max(10_000, t.total * 0.1) && !done && running ? "bg-warn" : "bg-ink-900"}`}
            style={{ width: `${(done ? 0 : frac) * 100}%`, transition: "width .25s linear" }}
          />
        </div>
      )}
      <div className="flex items-center gap-[3cqw]">
        {done ? (
          <>
            <button onClick={() => t.add(60_000)} className={`${btn} h-[max(32px,11cqh)] bg-ink-100 px-4 text-[max(13px,4.4cqw)] text-ink-800`}>
              +1분 더
            </button>
            <button onClick={t.dismiss} className={`${btn} h-[max(32px,11cqh)] bg-ink-900 px-5 text-[max(13px,4.6cqw)] text-white`}>
              확인
            </button>
          </>
        ) : (
          <>
            <button
              onClick={t.reset}
              aria-label="처음으로"
              className={`${btn} h-[max(30px,11cqh)] w-[max(30px,11cqh)] bg-ink-100 text-[max(13px,4.6cqw)] text-ink-700`}
            >
              ↺
            </button>
            {!sw && (
              <button
                onClick={() => {
                  unlockAudio();
                  t.setPrefs({ tickAll: !t.prefs.tickAll });
                }}
                aria-pressed={t.prefs.tickAll}
                title={t.prefs.tickAll ? "매초 틱톡 끄기" : "매초 틱톡 켜기"}
                className={`${btn} h-[max(30px,11cqh)] px-[max(9px,2.6cqw)] text-[max(11.5px,3.6cqw)] ${t.prefs.tickAll ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600"}`}
              >
                틱톡
              </button>
            )}
            <button
              onClick={() => {
                unlockAudio();
                if (running) t.pause();
                else t.start();
              }}
              disabled={!sw && left <= 0}
              className={`${btn} h-[max(34px,12.5cqh)] px-[max(16px,7cqw)] text-[max(14px,5cqw)] disabled:opacity-30 ${running ? "bg-warn-weak text-warn" : "bg-ink-900 text-white"}`}
            >
              {running ? "멈춤" : "시작"}
            </button>
          </>
        )}
      </div>
      {/* 시간 더하기·빼기 — 흐르는 중에도 */}
      {showSteps && (
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {TIME_STEPS.map(([label, d]) => (
            <button
              key={label}
              onClick={() => t.add(d)}
              className={`${btn} h-[max(26px,8cqh)] px-[max(7px,2cqw)] text-[max(11.5px,3.5cqw)] ${d < 0 ? "text-ink-500" : "text-ink-800"} bg-ink-100 hover:bg-ink-200`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {/* 길이 고르기 — 멈춰 있을 때만 */}
      {showPresets && (
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {[...W_PRESETS.map((m) => m * 60_000), ...t.presets.filter((ms) => !W_PRESETS.some((m) => m * 60_000 === ms))].map((ms) => (
            <button
              key={ms}
              onClick={() => t.setTotal(ms)}
              className={`${btn} h-[max(26px,8cqh)] px-[max(8px,2.4cqw)] text-[max(11.5px,3.5cqw)] ${t.total === ms ? "bg-ink-900 text-white" : "border border-ink-200 text-ink-700 hover:bg-ink-50"}`}
            >
              {ms % 60_000 === 0 ? `${ms / 60_000}분` : fmt(ms)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 뽑기 창 — 뽑기 화면과 같은 기록(이 기기·오늘)을 함께 쓴다 ──
const PICK_LS = "class2nd-pick";
function PickW() {
  const today = todayKST();
  const { data: att } = useAttendance();
  const absent = useMemo(() => new Set((att?.[today] ?? []).map(String)), [att, today]);
  const [shown, setShown] = useState<string[]>([]);
  const [cnt, setCnt] = useState(1);
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
  const n = Math.max(1, Math.min(cnt, pool.length || 1));

  const shuffle = (arr: string[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const roll = () => {
    if (!pool.length || rolling) return;
    unlockAudio();
    const win = shuffle(pool).slice(0, n);
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
        cur.picked = { ...cur.picked, class: [...(cur.picked?.class ?? []), ...win] };
        try {
          localStorage.setItem(PICK_LS, JSON.stringify(cur));
        } catch {}
        setRev((r) => r + 1);
        return;
      }
      setShown(shuffle(pool).slice(0, n));
      tick();
      timer.current = setTimeout(spin, 40 + Math.pow(step / steps, 2.2) * 200);
    };
    spin();
  };

  // 여러 명이면 글자를 줄여 창 안에 다 들어오게
  const k = shown.length;
  const nameSize = k <= 1 ? "min(24cqw, 36cqh)" : `min(${(30 / Math.sqrt(k + 1)).toFixed(1)}cqw, ${(40 / (k * 0.55 + 0.9)).toFixed(1)}cqh)`;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3cqh] px-3">
      {k ? (
        <div className={`flex max-w-full flex-wrap items-center justify-center ${k > 1 ? "gap-x-[3cqw] gap-y-[1.5cqh]" : ""}`}>
          {shown.map((name, i) => (
            <span
              key={rolling ? `r${i}` : `${name}-${i}`}
              className={`font-bold leading-tight tracking-tight text-ink-900 ${rolling ? "opacity-60" : "badge-pop"}`}
              style={{ fontSize: nameSize }}
            >
              {k > 1 && <span className="mr-[0.25em] text-[0.55em] tabular-nums text-ink-400">{i + 1}</span>}
              {name}
            </span>
          ))}
        </div>
      ) : (
        <p className="font-bold text-ink-400" style={{ fontSize: "max(13px, min(6cqw, 9cqh))" }}>
          {pool.length ? `${pool.length}명 중에서` : "모두 뽑았어요"}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-[2.5cqw]">
        {/* 몇 명 */}
        <span className="flex items-center rounded-full bg-ink-100 p-0.5 text-[max(12px,4cqw)] font-bold">
          <button
            onClick={() => setCnt(Math.max(1, n - 1))}
            disabled={n <= 1}
            aria-label="한 명 줄이기"
            className="grid h-[max(26px,11cqh)] w-[max(26px,11cqh)] place-items-center rounded-full text-ink-600 hover:bg-white disabled:opacity-30"
          >
            −
          </button>
          <span className="min-w-[3.2em] text-center tabular-nums text-ink-900">{n}명</span>
          <button
            onClick={() => setCnt(Math.min(pool.length || 1, n + 1))}
            disabled={n >= pool.length}
            aria-label="한 명 늘리기"
            className="grid h-[max(26px,11cqh)] w-[max(26px,11cqh)] place-items-center rounded-full text-ink-600 hover:bg-white disabled:opacity-30"
          >
            +
          </button>
        </span>
        {/* 뽑기 방식 — 매번 전체에서 / 뽑힌 사람 빼고 (뽑기 화면과 같은 설정) */}
        <button
          onClick={() => {
            const cur = read();
            cur.noRepeat = !saved.noRepeat;
            try {
              localStorage.setItem(PICK_LS, JSON.stringify(cur));
            } catch {}
            setRev((r) => r + 1);
          }}
          title={saved.noRepeat ? "지금: 뽑힌 사람 빼고 — 누르면 매번 전체에서" : "지금: 매번 전체에서 — 누르면 뽑힌 사람 빼고"}
          className={`${btn} h-[max(26px,11cqh)] px-[max(9px,2.6cqw)] text-[max(11px,3.4cqw)] ${saved.noRepeat ? "bg-ink-100 text-ink-700" : "bg-warn-weak text-warn"}`}
        >
          {saved.noRepeat ? "뽑힌 사람 빼고" : "매번 전체"}
        </button>
        <button
          onClick={roll}
          disabled={!pool.length || rolling}
          className={`${btn} h-[max(34px,14cqh)] bg-ink-900 px-[max(16px,7cqw)] text-[max(14px,5cqw)] text-white disabled:opacity-30`}
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
            setShown([]);
            setRev((r) => r + 1);
          }}
          className={`${btn} h-[max(30px,12cqh)] bg-ink-100 px-[max(10px,3cqw)] text-[max(12px,3.8cqw)] text-ink-700`}
        >
          처음부터
        </button>
      </div>
      <p className="text-[max(11px,3.2cqw)] text-ink-400">
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
