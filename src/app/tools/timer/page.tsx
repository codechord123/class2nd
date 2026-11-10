"use client";
// ⏱️ 타이머 — 화면 가득 큰 숫자 + 줄어드는 링. (2026-11 사용자 요청으로 확장)
//   · 타이머 / 스톱워치 · '무엇을 하는 시간' 이름표 · 숫자를 눌러 직접 입력(5:30, 90=90분)
//   · 시간 더하기·빼기(흐르는 중에도) · 내 프리셋 저장 · 끝난 뒤 '지난 시간'
//   · 종료 전 알림(1분·30초) · 마지막 10초 똑딱 · 끝 소리 고르기·크기 (소리는 셸의 TimerWatcher가 낸다)
//   · '창으로 띄우기' — 칠판 위 등 어디서든 끌어 옮기고 크기 조절
import { useEffect, useState } from "react";
import { useTimer, leftMs, swMs, fmt, fmtSw, parseTime, TIME_STEPS } from "@/stores/timer";
import { END_SOUNDS, playEnd, setVolume, unlockAudio, warnSoft } from "@/lib/tools/chime";
import { FocusButton, useFocusMode } from "@/components/tools/ToolsShell";
import { useWidgets } from "@/stores/widgets";
import SegmentedControl from "@/components/ui/SegmentedControl";

const PRESETS = [1, 3, 5, 10, 15, 20];
const MIN = 60 * 1000;

export default function TimerPage() {
  const t = useTimer();
  const { on: focus, toggle } = useFocusMode();
  const toggleWidget = useWidgets((w) => w.toggle);
  const widgetOpen = useWidgets((w) => w.open.some((x) => x.kind === "timer"));
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const sw = t.mode === "stopwatch";
  const running = sw ? !!t.swStart : !!t.endAt;
  const done = !sw && !!t.doneAt;
  useEffect(() => {
    if (!running) return; // 끝나면 시계를 멈춘다 (사용자 2026-11: "끝나면 계속 흐르는 게 아니라 멈추게")
    const id = setInterval(() => setNow(Date.now()), sw ? 50 : 100);
    return () => clearInterval(id);
  }, [running, sw]);

  const left = done ? 0 : leftMs(t, now);
  const frac = sw ? 1 : t.total > 0 ? left / t.total : 0;
  const urgent = !sw && running && left <= Math.max(10_000, t.total * 0.1);
  const R = 46;
  const C = 2 * Math.PI * R;
  const ringColor = done ? "var(--color-danger)" : urgent ? "var(--color-warn)" : "var(--color-ink-900)";
  const digits = sw ? fmtSw(swMs(t, now)) : done ? "끝!" : fmt(left);

  const commitDraft = () => {
    const ms = parseTime(draft);
    if (ms != null && ms > 0) t.setTotal(ms);
    setEditing(false);
  };

  const dark = focus;
  const sub = dark ? "text-white/60" : "text-ink-500";
  const shell = focus
    ? `fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 p-6 ${done ? "timer-flash bg-danger" : "bg-ink-900"} text-white`
    : `flex flex-col items-center gap-5 rounded-card border border-ink-200 p-6 sm:p-8 ${done ? "timer-flash bg-danger-weak" : "bg-white"}`;

  // 시간 더하기·빼기 — 흐르는 중에도 (크게 보기에선 시계 아래, 보통 화면에선 오른쪽 칸)
  const stepsEl = !sw && !done ? (
    <div className={`flex flex-wrap items-center gap-1 ${focus ? "justify-center text-base" : "text-sm"}`}>
              {[...TIME_STEPS, ["+10분", 10 * MIN] as [string, number]].map(([label, d]) => (
                <button
                  key={label}
                  onClick={() => t.add(d)}
                  className={`press rounded-full font-bold ${focus ? "h-11 px-4" : "h-9 px-3"} ${
                    focus
                      ? d < 0
                        ? "bg-white/5 text-white/60 hover:bg-white/15"
                        : "bg-white/10 text-white hover:bg-white/20"
                      : d < 0
                        ? "bg-ink-50 text-ink-500 hover:bg-ink-200"
                        : "bg-ink-100 text-ink-800 hover:bg-ink-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
  ) : null;
  // 길이 고르기 — 기본 + 내가 저장한 것 (멈춰 있을 때)
  const presetsEl = (
    <div className="flex flex-wrap gap-2">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => t.setTotal(m * MIN)}
                  className={`press h-10 rounded-full px-4 text-sm font-bold ${
                    t.total === m * MIN ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                  }`}
                >
                  {m}분
                </button>
              ))}
              {t.presets
                .filter((ms) => !PRESETS.some((m) => m * MIN === ms))
                .map((ms) => (
                  <span key={ms} className="inline-flex">
                    <button
                      onClick={() => t.setTotal(ms)}
                      className={`press h-10 rounded-l-full pl-4 pr-2 text-sm font-bold ${
                        t.total === ms ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                      }`}
                    >
                      {fmt(ms)}
                    </button>
                    <button
                      onClick={() => t.removePreset(ms)}
                      aria-label={`${fmt(ms)} 프리셋 지우기`}
                      className={`press h-10 rounded-r-full pl-1 pr-3 text-xs ${t.total === ms ? "bg-ink-900 text-white/60" : "bg-ink-100 text-ink-400 hover:bg-ink-200"}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              {!PRESETS.some((m) => m * MIN === t.total) && !t.presets.includes(t.total) && t.total > 0 && (
                <button
                  onClick={() => t.savePreset(t.total)}
                  className="press h-10 rounded-full border border-dashed border-ink-300 px-4 text-sm font-bold text-ink-600 hover:bg-ink-50"
                >
                  + {fmt(t.total)} 저장
                </button>
              )}
            </div>
  );

  return (
    // 보통 화면: 왼쪽 시계 | 오른쪽 조절·길이·알림 (사용자 2026-11: "아래 메뉴는 시계 옆에") — 스크롤 없이 한 화면
    <div className={focus ? "" : "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"}>
      <section className={shell}>
        <div className={`flex w-full flex-wrap items-center justify-between gap-2 ${focus ? "absolute left-0 top-0 p-5" : ""}`}>
          {!focus ? (
            <div className="w-56">
              <SegmentedControl
                tabs={[
                  { key: "timer", label: "타이머" },
                  { key: "stopwatch", label: "스톱워치" },
                ]}
                active={t.mode}
                onChange={t.setMode}
              />
            </div>
          ) : (
            <p className={`text-[13px] font-bold ${sub}`}>{sw ? "스톱워치" : done ? "시간이 다 됐어요" : running ? "흐르는 중" : "준비"}</p>
          )}
          <div className="flex items-center gap-2">
            {!focus && (
              <button
                onClick={() => toggleWidget("timer")}
                className={`press h-9 rounded-full px-3.5 text-[13px] font-bold ${widgetOpen ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-800 hover:bg-ink-200"}`}
              >
                {widgetOpen ? "창 닫기" : "창으로 띄우기"}
              </button>
            )}
            {focus && !sw && (
              <button
                onClick={() => {
                  unlockAudio();
                  t.setPrefs({ tickAll: !t.prefs.tickAll });
                }}
                aria-pressed={t.prefs.tickAll}
                className={`press inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-bold ${t.prefs.tickAll ? "bg-white text-ink-900" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                틱톡 {t.prefs.tickAll ? "켬" : "끔"}
              </button>
            )}
            <FocusButton on={focus} toggle={toggle} dark={dark} />
          </div>
        </div>

        {/* 이름표 — '모둠 토의', '정리 시간'처럼 무엇을 하는 시간인지 */}
        {focus ? (
          // 크게 보기에서도 바로 고친다 — 글자처럼 보이다가 누르면 입력 (사용자 2026-11)
          <input
            value={t.label}
            onChange={(e) => t.setLabel(e.target.value)}
            placeholder="제목 쓰기"
            aria-label="타이머 제목"
            className="w-[min(90vw,900px)] rounded-[14px] bg-transparent text-center text-[min(6vh,5vw)] font-bold text-white/90 outline-none placeholder:text-white/25 hover:bg-white/5 focus:bg-white/10"
          />
        ) : (
          <label className="flex w-full max-w-md flex-col items-center gap-1">
            <span className="text-[12px] font-bold text-ink-500">제목</span>
            <input
              value={t.label}
              onChange={(e) => t.setLabel(e.target.value)}
              placeholder="예: 모둠 토의 · 정리 시간 · 쪽지 시험"
              className="h-12 w-full rounded-[12px] border border-ink-200 bg-ink-50 px-4 text-center text-[20px] font-bold text-ink-900 outline-none placeholder:text-[15px] placeholder:font-normal placeholder:text-ink-400 focus:border-ink-400 focus:bg-white"
            />
          </label>
        )}

        {/* 링 + 숫자 */}
        <div className={`relative ${focus ? "h-[min(52vh,72vw)] w-[min(52vh,72vw)]" : "h-64 w-64 sm:h-80 sm:w-80"}`}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke={dark ? "rgba(255,255,255,0.12)" : "var(--color-ink-100)"} strokeWidth="5" />
            {!sw && (
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={dark && !done && !urgent ? "#fff" : ringColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                style={{ transition: running ? "stroke-dashoffset 0.1s linear" : "stroke-dashoffset 0.3s ease" }}
              />
            )}
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^\d:]/g, ""))}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDraft();
                  if (e.key === "Escape") setEditing(false);
                }}
                inputMode="numeric"
                placeholder="5:30"
                className={`w-[70%] bg-transparent text-center font-bold tabular-nums outline-none ${focus ? "text-[min(14vh,17vw)] text-white placeholder:text-white/30" : "text-6xl text-ink-900 sm:text-7xl"}`}
              />
            ) : (
              <button
                onClick={() => {
                  if (sw || running || done) return;
                  setDraft("");
                  setEditing(true);
                }}
                title={!sw && !running && !done ? "눌러서 직접 입력 (5:30 · 숫자만 쓰면 분)" : undefined}
                className={`text-center font-bold tabular-nums tracking-tight ${focus ? "text-[min(14vh,17vw)]" : sw ? "text-5xl sm:text-6xl" : "text-6xl sm:text-7xl"} ${
                  focus ? "" : done ? "text-danger" : "text-ink-900"
                } ${!sw && !running && !done ? `cursor-text rounded-[12px] px-2 ${focus ? "hover:bg-white/5" : "hover:bg-ink-50"}` : "cursor-default"}`}
              >
                {digits}
              </button>
            )}
          </div>
        </div>

        {/* 주 조작 — 시작/멈춤 하나가 가장 크다 */}
        <div className="flex flex-col items-center gap-4">
          {done ? (
            <div className="flex gap-3">
              <button
                onClick={() => t.add(MIN)}
                className={`press h-14 rounded-full px-6 text-lg font-bold ${focus ? "bg-white/15 text-white" : "bg-ink-100 text-ink-800"}`}
              >
                +1분 더
              </button>
              <button
                onClick={t.dismiss}
                className={`press h-14 rounded-full px-10 text-lg font-bold ${focus ? "bg-white text-danger" : "bg-ink-900 text-white"}`}
              >
                확인
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={t.reset}
                className={`press h-14 w-14 rounded-full text-[13px] font-bold ${dark ? "bg-white/10 text-white" : "bg-ink-100 text-ink-700"}`}
              >
                처음
              </button>
              <button
                onClick={() => {
                  unlockAudio();
                  if (running) t.pause();
                  else t.start();
                }}
                disabled={!sw && left <= 0}
                className={`press h-14 min-w-36 rounded-full px-8 text-lg font-bold disabled:opacity-30 ${
                  running ? (dark ? "bg-white/15 text-white" : "bg-warn-weak text-warn") : dark ? "bg-white text-ink-900" : "bg-ink-900 text-white"
                }`}
              >
                {running ? "멈춤" : sw ? (swMs(t, now) > 0 ? "이어서" : "시작") : left < t.total && left > 0 ? "이어서" : "시작"}
              </button>
              {!sw && (
                <button
                  onClick={() => t.add(MIN)}
                  className={`press h-14 w-14 rounded-full text-[13px] font-bold ${dark ? "bg-white/10 text-white" : "bg-ink-100 text-ink-700"}`}
                >
                  +1분
                </button>
              )}
            </div>
          )}

          {focus && stepsEl}

          {/* 크게 보기: 길이 고르기 (멈춰 있을 때) */}
          {!sw && !running && !done && focus && (
            <div className="flex flex-wrap justify-center gap-2">
              {[...PRESETS.map((m) => m * MIN), ...t.presets.filter((ms) => !PRESETS.some((m) => m * MIN === ms))].map((ms) => (
                <button
                  key={ms}
                  onClick={() => t.setTotal(ms)}
                  className={`press h-11 rounded-full px-5 text-base font-bold ${t.total === ms ? "bg-white text-ink-900" : "border border-white/25 text-white/80 hover:bg-white/10"}`}
                >
                  {ms % MIN === 0 ? `${ms / MIN}분` : fmt(ms)}
                </button>
              ))}
            </div>
          )}

        </div>
      </section>

      {!focus && !sw && (
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="space-y-3 rounded-card border border-ink-200 bg-white p-4">
            <p className="text-[13px] font-bold text-ink-500">시간 조절 {running ? "· 흐르는 중에도 돼요" : ""}</p>
            {stepsEl ?? <p className="text-[13px] text-ink-400">끝난 뒤엔 ‘+1분 더’를 눌러요</p>}
            <p className="pt-1 text-[13px] font-bold text-ink-500">길이 고르기</p>
            {!running && !done ? presetsEl : <p className="text-[13px] text-ink-400">멈추면 길이를 고를 수 있어요</p>}
          </section>
          <AlertSettings />
        </aside>
      )}
    </div>
  );
}

function AlertSettings() {
  const { prefs, setPrefs } = useTimer();
  const row = "flex min-h-12 items-center justify-between gap-4 px-4 text-[15px]";
  const check = (k: "warn60" | "warn30" | "tick10" | "tickAll", label: string, desc: string) => (
    <label className={`${row} cursor-pointer`}>
      <span>
        <span className="font-bold text-ink-800">{label}</span>
        <span className="ml-2 text-[13px] text-ink-500">{desc}</span>
      </span>
      <input
        type="checkbox"
        checked={prefs[k]}
        onChange={(e) => setPrefs({ [k]: e.target.checked })}
        className="h-5 w-5 accent-[var(--color-ink-900)]"
      />
    </label>
  );
  return (
    <section className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200 bg-white">
      <p className="px-4 pb-2 pt-3.5 text-[13px] font-bold text-ink-500">알림과 소리</p>
      {check("warn60", "1분 전 알림", "부드러운 소리 한 번")}
      {check("warn30", "30초 전 알림", "부드러운 소리 한 번")}
      {check("tickAll", "매초 틱톡", "흐르는 내내 1초마다 틱·톡")}
      {check("tick10", "마지막 10초", "1초마다 똑딱 (조금 더 또렷하게)")}
      <div className={row}>
        <span className="font-bold text-ink-800">끝 소리</span>
        <span className="flex items-center gap-2">
          <select
            value={prefs.sound}
            onChange={(e) => setPrefs({ sound: e.target.value as typeof prefs.sound })}
            className="h-9 rounded-[8px] bg-ink-100 px-2 text-[14px] font-bold text-ink-800"
          >
            {END_SOUNDS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              unlockAudio();
              setVolume(prefs.volume);
              playEnd(prefs.sound);
            }}
            className="press h-9 rounded-full bg-ink-100 px-3 text-[13px] font-bold text-ink-700 hover:bg-ink-200"
          >
            들어 보기
          </button>
        </span>
      </div>
      <label className={row}>
        <span className="w-20 shrink-0 font-bold text-ink-800">소리 크기</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(prefs.volume * 100)}
          onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100 })}
          onPointerUp={() => {
            unlockAudio();
            setVolume(prefs.volume);
            warnSoft();
          }}
          className="flex-1 accent-[var(--color-ink-900)]"
        />
        <span className="w-10 text-right font-bold tabular-nums text-ink-600">{Math.round(prefs.volume * 100)}</span>
      </label>
    </section>
  );
}
