"use client";
// 🔊 소음 측정 엔진 — 기기에 하나만 돈다. 소음 화면·떠 있는 창·따로 띄운 창은 모두 같은 측정을 보여 줄 뿐이라
//   (사용자 2026-11: "따로 띄우면 경고가 몇 번인지 안 나오고, 끄면 본 화면과 이어지지 않아") 창을 닫거나 화면을
//   옮겨도 경고 횟수·조용한 시간이 그대로 이어진다. 멈추기를 눌러야 멈춘다(듣는 중엔 셸에 작은 알약이 보인다).
// · 소리는 이 기기 안에서만 계산한다 (녹음·전송·저장 없음).
// · 기준선을 넘으면 경고음 (사용자 2026-11: "넘어갈 때 경고음 나오게") — 기본 '삐삐'를 0.6초 넘으면.
//   박수 한 번 같은 순간 소리는 거르도록 '얼마나 넘으면'을 고를 수 있다. 경고 뒤 3초는 쉰다(연달아 울리지 않게).
import { useCallback } from "react";
import { create } from "zustand";
import { playNoiseAlarm, playCheer, unlockAudio, type NoiseAlarm } from "@/lib/tools/chime";

const LS = "class2nd-noise";
const COOLDOWN_MS = 2000; // 경고음(약 1초)이 끝나고 잠깐 쉰 뒤 — 계속 시끄러우면 2초마다 다시
// 사용자 2026-11 "기준을 넘었는데 바로 소리가 안 나와": 기본을 '바로'(넘는 순간)로. 길게 고르면 그 시간만큼 넘어야
// 하는데, 잠깐 기준 아래로 내려가도 처음부터 다시 세지 않는다(넘은 시간을 모으고 아래일 땐 천천히 덜어 냄).
export const HOLD_OPTIONS = [
  { ms: 0, label: "바로" },
  { ms: 500, label: "0.5초 넘게" },
  { ms: 1000, label: "1초 넘게" },
  { ms: 2000, label: "2초 넘게" },
];
export const NOISE_HISTORY = 120; // 약 60초 (0.5초 간격)

export interface NoisePrefs {
  threshold: number; // 0~100
  gain: number; // 보정 −20~+20
  alarm: NoiseAlarm; // 경고음 종류
  holdMs: number; // 기준을 이만큼 넘게 이어지면 경고
  alarmVol: number; // 경고음 크기 0.2~1 (타이머 소리 크기와 따로)
  warnGoal: number; // 🎯 경고 목표 'N번 이하' (0 = 끔)
  quietGoalMin: number; // 🎯 조용한 시간 목표(분) — 경고 없이 이만큼 이어지면 달성 (0 = 끔)
}
const DEF: NoisePrefs = { threshold: 65, gain: 0, alarm: "beep", holdMs: 0, alarmVol: 1, warnGoal: 0, quietGoalMin: 0 };
export const WARN_GOALS = [0, 1, 2, 3, 4, 5, 7, 10];
export const QUIET_GOALS = [0, 1, 2, 3, 5, 10, 15, 20];
const loadPrefs = (): NoisePrefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<NoisePrefs> & { sound?: boolean };
    // 옛 저장본: sound=false(소리 끔)만 그대로 존중, 나머지는 새 기본값(삐삐·0.6초)
    const { sound, v, ...rest } = raw as typeof raw & { v?: number };
    // v2 이전 저장본의 대기 시간(옛 기본 0.6초 포함)은 새 기본 '바로'로, 1.2초는 1초로
    if (v !== 2 && rest.holdMs != null) rest.holdMs = rest.holdMs >= 2000 ? 2000 : rest.holdMs >= 1200 ? 1000 : 0;
    return { ...DEF, ...rest, ...(sound === false && !rest.alarm ? { alarm: "none" as const } : {}) };
  } catch {
    return DEF;
  }
};

export function noiseFace(level: number, th: number, warning: boolean) {
  if (warning) return { e: "🙉", t: "너무 시끄러워요!" };
  if (level >= th) return { e: "😣", t: "조금 시끄러워요" };
  if (level >= th * 0.8) return { e: "😐", t: "조금만 더 작게" };
  if (level >= th * 0.5) return { e: "🙂", t: "좋아요" };
  return { e: "😌", t: "아주 조용해요" };
}
export const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// 설정은 화면·떠 있는 창·따로 띄운 창이 함께 쓴다 — 소음 화면에서 기준선을 옮기면 듣고 있는 창에도 바로
const useNoisePrefs = create<{ p: NoisePrefs }>(() => ({ p: typeof window === "undefined" ? DEF : loadPrefs() }));
useNoisePrefs.subscribe((s) => {
  try {
    localStorage.setItem(LS, JSON.stringify({ ...s.p, v: 2 }));
  } catch {}
});

interface Live {
  running: boolean;
  err: string | null;
  level: number;
  warning: boolean;
  warns: number;
  quietFrom: number; // 조용한 시간을 세기 시작한 시각 (경고가 나면 다시)
  now: number;
  hist: number[];
  quietWins: number; // 조용한 시간 목표를 채운 횟수
  quietHit: boolean; // 이번 조용한 구간에서 목표를 채웠나
  cheerAt: number; // 방금 달성한 시각 (화면 축하 표시)
}
const IDLE = { level: 0, warning: false };
export const useNoiseLive = create<Live>(() => ({
  running: false,
  err: null,
  level: 0,
  warning: false,
  warns: 0,
  quietFrom: 0,
  now: 0,
  hist: [],
  quietWins: 0,
  quietHit: false,
  cheerAt: 0,
}));
const set = useNoiseLive.setState;
let stopFn: (() => void) | null = null;
let starting = false;

export async function startNoise() {
  if (stopFn || starting) return;
  starting = true;
  set({ err: null });
  unlockAudio();
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      set({ err: "이 브라우저(또는 http 주소)에서는 마이크를 쓸 수 없어요. 크롬·엣지 최신 버전에서 열어 주세요." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      const name = (e as { name?: string }).name;
      set({
        err:
          name === "NotAllowedError"
            ? "마이크가 막혀 있어요 — 주소창 왼쪽 자물쇠 → 마이크 '허용' 후 다시 눌러 주세요."
            : name === "NotFoundError"
              ? "연결된 마이크를 찾지 못했어요. 마이크(또는 웹캠)를 꽂고 다시 눌러 주세요."
              : "마이크를 켜지 못했어요. 다른 프로그램(줌 등)이 쓰고 있는지 확인해 주세요.",
      });
      return;
    }
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new C();
    void ctx.resume().catch(() => {});
    // 소리 계산은 오디오 처리 콜백에서 — 화면 그리기(requestAnimationFrame)는 브라우저가 뒤로 가거나
    // PPT를 띄우면 멈추지만(따로 띄운 창에서도), 오디오 콜백은 계속 돈다 → 경고음이 빠지지 않는다.
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    src.connect(proc);
    proc.connect(ctx.destination); // 출력은 0(무음) — 연결해야 콜백이 돈다
    let smooth = 0;
    let overAcc = 0; // 기준을 넘은 시간(ms)을 모은다
    let lastWarn = 0;
    let lastPush = 0;
    let lastPaint = 0;
    let lastT = 0;
    const t0 = Date.now();
    set({ running: true, warns: 0, quietFrom: t0, now: t0, hist: [], quietWins: 0, quietHit: false, cheerAt: 0 });

    proc.onaudioprocess = (ev) => {
      const buf = ev.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const db = 20 * Math.log10(Math.max(Math.sqrt(sum / buf.length), 1e-6));
      const { threshold, gain, alarm, holdMs, alarmVol, quietGoalMin } = useNoisePrefs.getState().p;
      // −70dBFS(아주 조용) ~ −10dBFS(고함)를 0~100으로. 오를 땐 빠르게, 내릴 땐 천천히 (60fps 기준 계수를 실제 간격에 맞춤)
      const raw = Math.max(0, Math.min(100, ((db + 70 + gain) / 60) * 100));
      const t = Date.now();
      const frames = lastT ? Math.min(10, ((t - lastT) / 1000) * 60) : 1;
      lastT = t;
      const a = 1 - Math.pow(raw > smooth ? 0.6 : 0.92, frames);
      smooth += (raw - smooth) * a;
      const dt = Math.min(200, (frames / 60) * 1000);
      if (smooth >= threshold) {
        overAcc += dt;
        if (overAcc >= holdMs && t - lastWarn >= COOLDOWN_MS) {
          lastWarn = t;
          overAcc = 0;
          set((s) => ({ warns: s.warns + 1, quietFrom: t, quietHit: false, warning: true }));
          setTimeout(() => set({ warning: false }), 2500);
          playNoiseAlarm(alarm, alarmVol, ctx); // 마이크와 같은 오디오 — 이미 켜져 있어 잠김 없이 바로 울린다
        }
      } else overAcc = Math.max(0, overAcc - dt * 0.5);
      // 🎯 조용한 시간 목표 — 경고 없이 이어진 시간이 목표에 닿는 순간 한 번 축하
      const st = useNoiseLive.getState();
      if (quietGoalMin > 0 && !st.quietHit && t - st.quietFrom >= quietGoalMin * 60_000) {
        set((s) => ({ quietHit: true, quietWins: s.quietWins + 1, cheerAt: t }));
        playCheer(alarmVol, ctx);
      }
      if (t - lastPaint > 66) {
        lastPaint = t;
        set({ level: smooth, now: t });
      }
      if (t - lastPush > 500) {
        lastPush = t;
        set((s) => ({ hist: [...s.hist.slice(-(NOISE_HISTORY - 1)), smooth] }));
      }
    };
    stopFn = () => {
      proc.onaudioprocess = null;
      try {
        src.disconnect();
        proc.disconnect();
      } catch {}
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close().catch(() => {});
    };
  } finally {
    starting = false;
  }
}

export function stopNoise() {
  stopFn?.();
  stopFn = null;
  set({ running: false, ...IDLE });
}

export function useNoiseMeter() {
  const prefs = useNoisePrefs((s) => s.p);
  const setPrefs = useCallback(
    (u: NoisePrefs | ((p: NoisePrefs) => NoisePrefs)) =>
      useNoisePrefs.setState((s) => ({ p: typeof u === "function" ? u(s.p) : u })),
    []
  );
  const live = useNoiseLive();
  const quietMs = live.running ? Math.max(0, live.now - live.quietFrom) : 0;
  const goalMs = prefs.quietGoalMin * 60_000;
  return {
    prefs,
    setPrefs,
    ...live,
    quietMs,
    /** 조용한 시간 목표까지 0~1 (목표 없으면 null) */
    quietProgress: goalMs > 0 ? Math.min(1, quietMs / goalMs) : null,
    /** 경고 목표를 넘었나 */
    overWarnGoal: prefs.warnGoal > 0 && live.warns > prefs.warnGoal,
    cheering: live.cheerAt > 0 && live.now - live.cheerAt < 4000,
    start: startNoise,
    stop: stopNoise,
  };
}
