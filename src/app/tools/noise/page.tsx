"use client";
// 🔊 소음 관리 — 마이크로 교실 소리 크기를 재서 기준선을 넘으면 알린다.
// · 소리는 이 기기 안에서만 계산한다 (녹음·전송·저장 없음) — 아이들에게도 그렇게 안내할 수 있다.
// · '순간 소리(박수 한 번)'로 울리지 않게 기준을 1.2초 넘게 계속 넘을 때만 경고.
// · 경고 소리는 낮고 부드럽게 + 5초 쉬었다가 다시 (계속 울리면 그게 더 시끄럽다).
// · '조용한 시간'이 쌓이는 게 보상 — 경고 횟수보다 앞에 크게 둔다.
import { useNoiseMeter, noiseFace as face, mmss, NOISE_HISTORY as HISTORY } from "@/lib/tools/useNoiseMeter";
import { FocusButton, useFocusMode } from "@/components/tools/ToolsShell";

export default function NoisePage() {
  const { prefs, setPrefs, running, err, level, warning, warns, quietMs, hist, start, stop } = useNoiseMeter();
  const { on: focus, toggle } = useFocusMode();


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
        <FocusButton on={focus} toggle={toggle} dark={dark} />
      </div>

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

        {/* 조용한 시간이 주인공 */}
        {running && (
          <div className="flex items-end gap-8">
            <div className="text-center">
              <p className={`text-[13px] font-bold ${sub}`}>조용한 시간</p>
              <p className={`font-bold tabular-nums ${focus ? "text-7xl" : "text-4xl"}`}>{mmss(quietMs)}</p>
            </div>
            <div className="text-center">
              <p className={`text-[13px] font-bold ${sub}`}>경고</p>
              <p className={`font-bold tabular-nums ${focus ? "text-5xl" : "text-3xl"} ${warns ? "text-danger" : ""}`}>{warns}번</p>
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
          <label className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-[15px]">
            <span className="font-bold text-ink-800">경고 소리</span>
            <input
              type="checkbox"
              checked={prefs.sound}
              onChange={(e) => setPrefs((p) => ({ ...p, sound: e.target.checked }))}
              className="h-5 w-5 accent-[var(--color-ink-900)]"
            />
          </label>
          <p className="px-4 py-3 text-[13px] leading-relaxed text-ink-500">
            팁: 평소 수업 소리일 때 막대가 기준선의 절반쯤 오도록 ‘마이크 감도’를 맞춰 두세요. 노트북 내장 마이크는 감도를 조금 올리는 게 좋아요.
          </p>
        </div>
      )}
    </section>
  );
}
