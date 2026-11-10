"use client";
// 🔊 소음 관리 — 마이크로 교실 소리 크기를 재서 기준선을 넘으면 알린다.
// · 소리는 이 기기 안에서만 계산한다 (녹음·전송·저장 없음) — 아이들에게도 그렇게 안내할 수 있다.
// · '순간 소리(박수 한 번)'로 울리지 않게 기준을 1.2초 넘게 계속 넘을 때만 경고.
// · 경고 소리는 낮고 부드럽게 + 5초 쉬었다가 다시 (계속 울리면 그게 더 시끄럽다).
// · '조용한 시간'이 쌓이는 게 보상 — 경고 횟수보다 앞에 크게 둔다.
import { useNoiseMeter, noiseFace as face, mmss, NOISE_HISTORY as HISTORY, HOLD_OPTIONS, QUIET_GOALS } from "@/lib/tools/useNoiseMeter";
import { NOISE_ALARMS, playNoiseAlarm, unlockAudio, type NoiseAlarm } from "@/lib/tools/chime";
import { FocusButton, useFocusMode } from "@/components/tools/ToolsShell";
import { closePopOut, openPopOut, usePopOut } from "@/lib/tools/popout";

export default function NoisePage() {
  const { prefs, setPrefs, running, err, level, warning, warns, quietMs, hist, start, stop, quietProgress, quietWins, quietHit, overWarnGoal, cheering } = useNoiseMeter();
  const { on: focus, toggle } = useFocusMode();
  const popped = usePopOut((s) => s.kind === "noise");
  const popPip = usePopOut((s) => s.pip);
  const popOut = () => {
    // 측정은 하나라 그대로 이어진다 — 안 듣고 있었으면 따로 띄운 창이 열리면서 시작
    void openPopOut("noise").then((ok) => {
      if (!ok) alert("새 창이 막혀 있어요 — 주소창 오른쪽의 '팝업 차단' 표시를 눌러 허용해 주세요.");
    });
  };


  const th = prefs.threshold;
  const f = face(level, th, warning);
  const over = level >= th;
  const barColor = warning || over ? "bg-danger" : level >= th * 0.8 ? "bg-warn" : focus ? "bg-white" : "bg-ink-900";
  const dark = focus;
  const sub = dark ? "text-white/60" : "text-ink-500";

  const points = hist.map((v, i) => `${(i / (HISTORY - 1)) * 100},${40 - (v / 100) * 40}`).join(" ");

  return (
    <section
      className={
        focus
          ? `fixed inset-0 z-[60] flex flex-col gap-6 p-6 text-white transition-colors duration-300 ${warning ? "bg-danger" : "bg-ink-900"}`
          : `space-y-5 rounded-card border border-ink-200 p-5 transition-colors duration-300 sm:p-8 ${warning ? "bg-danger-weak" : "bg-white"}`
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[13px] font-bold ${sub}`}>{running ? "듣는 중 · 소리는 이 기기에서만 계산하고 저장하지 않아요" : "마이크로 교실 소리를 재요"}</p>
        <span className="flex items-center gap-1.5">
          {!focus && (
            <button
              onClick={popOut}
              title="브라우저 밖 작은 창으로 — 크롬·엣지는 PPT를 띄워도 그 위에 떠 있어요"
              className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-100 px-3.5 text-[13px] font-bold text-ink-800 hover:bg-ink-200"
            >
              ⧉ 따로 띄우기
            </button>
          )}
          <FocusButton on={focus} toggle={toggle} dark={dark} />
        </span>
      </div>

      {popped && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-btn bg-ink-100 px-4 py-3 text-[14px]">
          <span className="font-bold text-ink-800">
            ⧉ 소음 측정기가 따로 띄운 창에서 듣고 있어요{popPip ? " (항상 위)" : ""}
          </span>
          <button onClick={closePopOut} className="press h-8 rounded-full bg-white px-3 text-[13px] font-bold text-ink-700">
            그 창 닫기
          </button>
        </div>
      )}

      {err && <p className="rounded-btn bg-danger-weak px-4 py-3 text-sm font-bold text-danger">{err}</p>}

      <div className={`flex flex-col items-center ${focus ? "flex-1 justify-center gap-6" : "gap-4 py-2"}`}>
        <span aria-hidden className={`leading-none transition-transform duration-200 ${focus ? "text-[min(28vh,30vw)]" : "text-8xl"} ${warning ? "scale-110" : ""}`}>
          {running ? f.e : "🤫"}
        </span>
        <p className={`font-bold ${focus ? "text-5xl" : "text-2xl"}`}>{running ? f.t : "시작을 누르면 소리를 재요"}</p>

        {/* 막대 + 기준선 */}
        <div className={`relative w-full ${focus ? "max-w-5xl" : "max-w-2xl"}`}>
          <div className={`h-6 overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-ink-100"}`}>
            <div className={`h-full rounded-full transition-[width] duration-75 ${barColor}`} style={{ width: `${level}%` }} />
          </div>
          <div className="absolute -top-2 bottom-[-8px] w-0.5 bg-danger" style={{ left: `${th}%` }} aria-hidden />
          <span className="absolute -top-6 -translate-x-1/2 text-[11px] font-bold text-danger" style={{ left: `${th}%` }}>
            기준
          </span>
        </div>

        {/* 조용한 시간이 주인공 — 🎯 목표가 있으면 '지금 / 목표'와 채워지는 막대 */}
        {running && (
          <div className="flex items-end gap-8">
            <div className="text-center">
              <p className={`text-[13px] font-bold ${sub}`}>
                조용한 시간{prefs.quietGoalMin > 0 ? ` · 목표 ${prefs.quietGoalMin}분` : ""}
              </p>
              <p className={`font-bold tabular-nums ${focus ? "text-7xl" : "text-4xl"} ${quietHit ? "text-success" : ""}`}>
                {cheering ? "🎉 달성!" : mmss(quietMs)}
              </p>
              {quietProgress != null && (
                <div className={`mx-auto mt-2 h-2 overflow-hidden rounded-full ${focus ? "w-72 bg-white/10" : "w-40 bg-ink-100"}`}>
                  <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${quietProgress * 100}%` }} />
                </div>
              )}
              {quietWins > 0 && <p className={`mt-1 text-[13px] font-bold ${focus ? "text-white/70" : "text-success"}`}>목표 달성 {quietWins}번</p>}
            </div>
            <div className="text-center">
              <p className={`text-[13px] font-bold ${sub}`}>경고{prefs.warnGoal > 0 ? ` · 목표 ${prefs.warnGoal}번 이하` : ""}</p>
              <p
                className={`font-bold tabular-nums ${focus ? "text-5xl" : "text-3xl"} ${
                  overWarnGoal || (prefs.warnGoal === 0 && warns) ? "text-danger" : prefs.warnGoal > 0 && warns === prefs.warnGoal ? "text-warn" : ""
                }`}
              >
                {warns}
                {prefs.warnGoal > 0 && <span className="opacity-50"> / {prefs.warnGoal}</span>}번
              </p>
              {overWarnGoal && <p className="mt-1 text-[13px] font-bold text-danger">목표를 넘었어요</p>}
            </div>
          </div>
        )}

        {hist.length > 1 && !focus && (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-16 w-full max-w-2xl" aria-label="최근 1분 소리 크기">
            <line x1="0" x2="100" y1={40 - (th / 100) * 40} y2={40 - (th / 100) * 40} stroke="var(--color-danger)" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
            <polyline points={points} fill="none" stroke="var(--color-ink-900)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={running ? stop : () => void start()}
          className={`press h-14 min-w-44 rounded-full px-8 text-lg font-bold ${
            running ? (dark ? "bg-white/15 text-white" : "bg-ink-100 text-ink-800") : dark ? "bg-white text-ink-900" : "bg-ink-900 text-white"
          }`}
        >
          {running ? "멈추기" : "시작"}
        </button>
      </div>

      {!focus && (
        <div className="divide-y divide-ink-100 overflow-hidden rounded-[12px] border border-ink-200">
          <label className="flex min-h-12 items-center gap-4 px-4 text-[15px]">
            <span className="w-20 shrink-0 font-bold text-ink-800">기준선</span>
            <input
              type="range"
              min={20}
              max={95}
              value={th}
              onChange={(e) => setPrefs((p) => ({ ...p, threshold: Number(e.target.value) }))}
              className="flex-1 accent-[var(--color-ink-900)]"
            />
            <span className="w-10 text-right font-bold tabular-nums text-ink-600">{th}</span>
          </label>
          <label className="flex min-h-12 items-center gap-4 px-4 text-[15px]">
            <span className="w-20 shrink-0 font-bold text-ink-800">마이크 감도</span>
            <input
              type="range"
              min={-20}
              max={20}
              value={prefs.gain}
              onChange={(e) => setPrefs((p) => ({ ...p, gain: Number(e.target.value) }))}
              className="flex-1 accent-[var(--color-ink-900)]"
            />
            <span className="w-10 text-right font-bold tabular-nums text-ink-600">
              {prefs.gain > 0 ? `+${prefs.gain}` : prefs.gain}
            </span>
          </label>
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 text-[15px]">
            <span className="font-bold text-ink-800">경고음</span>
            <span className="flex items-center gap-2">
              <select
                value={prefs.alarm}
                onChange={(e) => setPrefs((p) => ({ ...p, alarm: e.target.value as NoiseAlarm }))}
                className="h-9 rounded-[8px] bg-ink-100 px-2 text-[14px] font-bold text-ink-800"
                aria-label="경고음 종류"
              >
                {NOISE_ALARMS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  unlockAudio();
                  playNoiseAlarm(prefs.alarm, prefs.alarmVol);
                }}
                disabled={prefs.alarm === "none"}
                className="press h-9 rounded-full bg-ink-100 px-3 text-[13px] font-bold text-ink-700 hover:bg-ink-200 disabled:opacity-30"
              >
                들어 보기
              </button>
            </span>
          </div>
          <label className="flex min-h-12 items-center gap-4 px-4 text-[15px]">
            <span className="w-20 shrink-0 font-bold text-ink-800">경고음 크기</span>
            <input
              type="range"
              min={20}
              max={100}
              value={Math.round(prefs.alarmVol * 100)}
              onChange={(e) => setPrefs((p) => ({ ...p, alarmVol: Number(e.target.value) / 100 }))}
              onPointerUp={(e) => {
                unlockAudio();
                playNoiseAlarm(prefs.alarm, Number((e.target as HTMLInputElement).value) / 100);
              }}
              className="flex-1 accent-[var(--color-ink-900)]"
            />
            <span className="w-10 text-right font-bold tabular-nums text-ink-600">{Math.round(prefs.alarmVol * 100)}</span>
          </label>
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-2 text-[15px]">
            <span className="font-bold text-ink-800">
              🎯 목표
              <span className="ml-2 text-[13px] font-normal text-ink-500">시작할 때마다 새로 세요</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink-700">
              조용한 시간
              <select
                value={prefs.quietGoalMin}
                onChange={(e) => setPrefs((p) => ({ ...p, quietGoalMin: Number(e.target.value) }))}
                className="h-9 rounded-[8px] bg-ink-100 px-2 text-[14px] font-bold text-ink-800"
                aria-label="조용한 시간 목표"
              >
                {QUIET_GOALS.map((m) => (
                  <option key={m} value={m}>
                    {m ? `${m}분` : "없음"}
                  </option>
                ))}
              </select>
              <span className="ml-2">경고</span>
              {/* 경고 목표는 직접 — −/+ 또는 숫자 입력 (사용자 2026-11: "경고 횟수는 내가 고를 수 있게"), 0 = 없음 */}
              <span className="flex items-center rounded-[8px] bg-ink-100 p-0.5">
                <button
                  onClick={() => setPrefs((p) => ({ ...p, warnGoal: Math.max(0, p.warnGoal - 1) }))}
                  disabled={prefs.warnGoal <= 0}
                  aria-label="경고 목표 줄이기"
                  className="press grid h-8 w-8 place-items-center rounded-[6px] text-ink-600 hover:bg-white disabled:opacity-30"
                >
                  −
                </button>
                <input
                  value={prefs.warnGoal || ""}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
                    setPrefs((p) => ({ ...p, warnGoal: Math.min(99, n || 0) }));
                  }}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  placeholder="없음"
                  aria-label="경고 횟수 목표"
                  className="h-8 w-12 bg-transparent text-center font-bold tabular-nums text-ink-900 outline-none placeholder:text-[13px] placeholder:text-ink-400"
                />
                <button
                  onClick={() => setPrefs((p) => ({ ...p, warnGoal: Math.min(99, p.warnGoal + 1) }))}
                  aria-label="경고 목표 늘리기"
                  className="press grid h-8 w-8 place-items-center rounded-[6px] text-ink-600 hover:bg-white"
                >
                  +
                </button>
              </span>
              {prefs.warnGoal > 0 && <span>번 이하</span>}
            </span>
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 text-[15px]">
            <span className="font-bold text-ink-800">
              기준을 넘으면
              <span className="ml-2 text-[13px] font-normal text-ink-500">박수 한 번에도 울린다면 길게</span>
            </span>
            <span className="flex gap-1">
              {HOLD_OPTIONS.map((o) => (
                <button
                  key={o.ms}
                  onClick={() => setPrefs((p) => ({ ...p, holdMs: o.ms }))}
                  className={`press h-9 rounded-full px-3 text-[13px] font-bold ${
                    prefs.holdMs === o.ms ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </span>
          </div>
          <p className="px-4 py-3 text-[13px] leading-relaxed text-ink-500">
            팁: 평소 수업 소리일 때 막대가 기준선의 절반쯤 오도록 ‘마이크 감도’를 맞춰 두세요. 노트북 내장 마이크는 감도를 조금 올리는 게 좋아요.
          </p>
        </div>
      )}
    </section>
  );
}
