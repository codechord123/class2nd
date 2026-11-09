"use client";
// ⏱️ 타이머 — 화면 가득 큰 숫자 + 줄어드는 링. 프리셋 한 번, 시작 한 번이면 끝.
// 상태는 전역 store(stores/timer) — 칠판으로 옮겨 가도 흐르고, 끝나면 어느 도구 화면에서든 소리.
import { useEffect, useState } from "react";
import { useTimer, leftMs, fmt } from "@/stores/timer";
import { unlockAudio } from "@/lib/tools/chime";
import { FocusButton, useFocusMode } from "@/components/tools/ToolsShell";

const PRESETS = [1, 3, 5, 10, 15, 20];
const MIN = 60 * 1000;

export default function TimerPage() {
  const t = useTimer();
  const { on: focus, toggle } = useFocusMode();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!t.endAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [t.endAt]);

  const running = !!t.endAt;
  const done = !!t.doneAt;
  const left = done ? 0 : leftMs(t, now);
  const frac = t.total > 0 ? left / t.total : 0;
  const urgent = running && left <= Math.max(10_000, t.total * 0.1);
  const R = 46;
  const C = 2 * Math.PI * R;
  const ringColor = done ? "var(--color-danger)" : urgent ? "var(--color-warn)" : "var(--color-brand)";

  const shell = focus
    ? `fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 p-6 ${done ? "timer-flash bg-danger" : "bg-ink-900"} text-white`
    : `flex flex-col items-center gap-6 rounded-card border border-ink-200 p-6 shadow-card sm:p-10 ${
        done ? "timer-flash bg-danger-weak" : "bg-white"
      }`;

  return (
    <section className={shell}>
      <div className={`flex w-full items-center justify-between ${focus ? "absolute left-0 top-0 p-5" : ""}`}>
        <p className={`text-[13px] font-bold ${focus ? "text-white/60" : "text-ink-500"}`}>
          {done ? "시간이 다 됐어요" : running ? "흐르는 중" : "준비"}
        </p>
        <FocusButton on={focus} toggle={toggle} dark={focus} />
      </div>

      {/* 링 + 숫자 — 크기는 화면에 맞춰 (집중 모드는 화면 높이의 70%) */}
      <div className={`relative ${focus ? "h-[min(70vh,80vw)] w-[min(70vh,80vw)]" : "h-64 w-64 sm:h-80 sm:w-80"}`}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke={focus ? "rgba(255,255,255,0.12)" : "var(--color-ink-100)"} strokeWidth="5" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            style={{ transition: running ? "stroke-dashoffset 0.1s linear" : "stroke-dashoffset 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span
            className={`font-bold tabular-nums tracking-tight ${focus ? "text-[min(18vh,20vw)]" : "text-6xl sm:text-7xl"} ${
              focus ? "" : done ? "text-danger" : "text-ink-900"
            }`}
          >
            {done ? "끝!" : fmt(left)}
          </span>
        </div>
      </div>

      {/* 조작 — 시작/멈춤이 가장 크고 검다 (주 행동 하나) */}
      <div className="flex flex-col items-center gap-4">
        {done ? (
          <button
            onClick={t.dismiss}
            className={`press h-14 rounded-full px-10 text-lg font-bold ${focus ? "bg-white text-danger" : "bg-ink-900 text-white"}`}
          >
            확인
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={t.reset}
              disabled={!running && left === t.total}
              className={`press h-14 w-14 rounded-full text-[13px] font-bold disabled:opacity-30 ${
                focus ? "bg-white/10 text-white" : "bg-ink-100 text-ink-700"
              }`}
            >
              처음
            </button>
            <button
              onClick={() => {
                unlockAudio();
                if (running) t.pause();
                else t.start();
              }}
              disabled={left <= 0}
              className={`press h-14 min-w-36 rounded-full px-8 text-lg font-bold disabled:opacity-30 ${
                running ? (focus ? "bg-white/15 text-white" : "bg-warn-weak text-warn") : focus ? "bg-white text-ink-900" : "bg-ink-900 text-white"
              }`}
            >
              {running ? "멈춤" : left < t.total && left > 0 ? "이어서" : "시작"}
            </button>
            <button
              onClick={() => t.add(MIN)}
              className={`press h-14 w-14 rounded-full text-[13px] font-bold ${focus ? "bg-white/10 text-white" : "bg-ink-100 text-ink-700"}`}
            >
              +1분
            </button>
          </div>
        )}
        {!running && !done && !focus && (
          <>
            <div className="flex flex-wrap justify-center gap-2">
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
            </div>
            <div className="flex items-center gap-2 text-sm">
              {[
                ["−1분", -MIN],
                ["−10초", -10_000],
                ["+10초", 10_000],
                ["+5분", 5 * MIN],
              ].map(([label, d]) => (
                <button
                  key={label}
                  onClick={() => t.add(d as number)}
                  className="press h-9 rounded-full px-3 font-bold text-ink-600 hover:bg-ink-100"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
