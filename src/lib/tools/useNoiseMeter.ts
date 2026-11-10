"use client";
// 🔊 소음 측정 엔진 — 소음 화면과 떠 있는 소음 창이 같이 쓴다.
// · 소리는 이 기기 안에서만 계산한다 (녹음·전송·저장 없음).
// · 기준선을 넘으면 경고음 (사용자 2026-11: "넘어갈 때 경고음 나오게") — 기본 '삐삐'를 0.6초 넘으면.
//   박수 한 번 같은 순간 소리는 거르도록 '얼마나 넘으면'을 고를 수 있다. 경고 뒤 3초는 쉰다(연달아 울리지 않게).
import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { playNoiseAlarm, unlockAudio, type NoiseAlarm } from "@/lib/tools/chime";

const LS = "class2nd-noise";
const COOLDOWN_MS = 3000;
export const HOLD_OPTIONS = [
  { ms: 300, label: "바로" },
  { ms: 600, label: "0.6초 넘게" },
  { ms: 1200, label: "1.2초 넘게" },
  { ms: 2000, label: "2초 넘게" },
];
export const NOISE_HISTORY = 120; // 약 60초 (0.5초 간격)

export interface NoisePrefs {
  threshold: number; // 0~100
  gain: number; // 보정 −20~+20
  alarm: NoiseAlarm; // 경고음 종류
  holdMs: number; // 기준을 이만큼 넘게 이어지면 경고
  alarmVol: number; // 경고음 크기 0.2~1 (타이머 소리 크기와 따로)
}
const DEF: NoisePrefs = { threshold: 65, gain: 0, alarm: "beep", holdMs: 600, alarmVol: 1 };
const loadPrefs = (): NoisePrefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<NoisePrefs> & { sound?: boolean };
    // 옛 저장본: sound=false(소리 끔)만 그대로 존중, 나머지는 새 기본값(삐삐·0.6초)
    const { sound, ...rest } = raw;
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
    localStorage.setItem(LS, JSON.stringify(s.p));
  } catch {}
});

export function useNoiseMeter() {
  const prefs = useNoisePrefs((s) => s.p);
  const setPrefs = useCallback(
    (u: NoisePrefs | ((p: NoisePrefs) => NoisePrefs)) =>
      useNoisePrefs.setState((s) => ({ p: typeof u === "function" ? u(s.p) : u })),
    []
  );

  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [warning, setWarning] = useState(false);
  const [warns, setWarns] = useState(0);
  const [quietFrom, setQuietFrom] = useState(0);
  const [now, setNow] = useState(0);
  const [hist, setHist] = useState<number[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    setErr(null);
    unlockAudio();
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("이 브라우저(또는 http 주소)에서는 마이크를 쓸 수 없어요. 크롬·엣지 최신 버전에서 열어 주세요.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      const name = (e as { name?: string }).name;
      setErr(
        name === "NotAllowedError"
          ? "마이크가 막혀 있어요 — 주소창 왼쪽 자물쇠 → 마이크 '허용' 후 다시 눌러 주세요."
          : name === "NotFoundError"
            ? "연결된 마이크를 찾지 못했어요. 마이크(또는 웹캠)를 꽂고 다시 눌러 주세요."
            : "마이크를 켜지 못했어요. 다른 프로그램(줌 등)이 쓰고 있는지 확인해 주세요."
      );
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
    let overSince = 0;
    let lastWarn = 0;
    let lastPush = 0;
    let lastPaint = 0;
    let lastT = 0;
    setQuietFrom(Date.now());
    setWarns(0);
    setHist([]);

    proc.onaudioprocess = (ev) => {
      const buf = ev.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const db = 20 * Math.log10(Math.max(Math.sqrt(sum / buf.length), 1e-6));
      const { threshold, gain, alarm, holdMs, alarmVol } = useNoisePrefs.getState().p;
      // −70dBFS(아주 조용) ~ −10dBFS(고함)를 0~100으로. 오를 땐 빠르게, 내릴 땐 천천히 (60fps 기준 계수를 실제 간격에 맞춤)
      const raw = Math.max(0, Math.min(100, ((db + 70 + gain) / 60) * 100));
      const t = Date.now();
      const frames = lastT ? Math.min(10, ((t - lastT) / 1000) * 60) : 1;
      lastT = t;
      const a = 1 - Math.pow(raw > smooth ? 0.6 : 0.92, frames);
      smooth += (raw - smooth) * a;
      if (smooth >= threshold) {
        if (!overSince) overSince = t;
        if (t - overSince >= holdMs && t - lastWarn >= COOLDOWN_MS) {
          lastWarn = t;
          setWarns((n) => n + 1);
          setQuietFrom(t);
          setWarning(true);
          setTimeout(() => setWarning(false), 2500);
          playNoiseAlarm(alarm, alarmVol);
        }
      } else overSince = 0;
      if (t - lastPaint > 66) {
        lastPaint = t;
        setLevel(smooth);
        setNow(t);
      }
      if (t - lastPush > 500) {
        lastPush = t;
        setHist((h) => [...h.slice(-(NOISE_HISTORY - 1)), smooth]);
      }
    };
    stopRef.current = () => {
      proc.onaudioprocess = null;
      try {
        src.disconnect();
        proc.disconnect();
      } catch {}
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close().catch(() => {});
      stopRef.current = null;
    };
    setRunning(true);
  };

  const stop = () => {
    stopRef.current?.();
    setRunning(false);
    setLevel(0);
    setWarning(false);
  };

  return { prefs, setPrefs, running, err, level, warning, warns, quietMs: Math.max(0, now - quietFrom), hist, start, stop };
}
