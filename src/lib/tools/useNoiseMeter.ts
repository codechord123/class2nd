"use client";
// 🔊 소음 측정 엔진 — 소음 화면과 떠 있는 소음 창이 같이 쓴다.
// · 소리는 이 기기 안에서만 계산한다 (녹음·전송·저장 없음).
// · 순간 소리(박수 한 번)로 울리지 않게 기준을 1.2초 넘게 계속 넘을 때만 경고, 경고 뒤 5초 쉼.
import { useEffect, useRef, useState } from "react";
import { chimeQuiet, unlockAudio } from "@/lib/tools/chime";

const LS = "class2nd-noise";
const HOLD_MS = 1200;
const COOLDOWN_MS = 5000;
export const NOISE_HISTORY = 120; // 약 60초 (0.5초 간격)

export interface NoisePrefs {
  threshold: number; // 0~100
  gain: number; // 보정 −20~+20
  sound: boolean;
}
const DEF: NoisePrefs = { threshold: 65, gain: 0, sound: true };
const loadPrefs = (): NoisePrefs => {
  try {
    return { ...DEF, ...(JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<NoisePrefs>) };
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

export function useNoiseMeter() {
  const [prefs, setPrefs] = useState<NoisePrefs>(() => (typeof window === "undefined" ? DEF : loadPrefs()));
  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

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
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let smooth = 0;
    let overSince = 0;
    let lastWarn = 0;
    let lastPush = 0;
    let lastPaint = 0;
    let raf = 0;
    setQuietFrom(Date.now());
    setWarns(0);
    setHist([]);

    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const db = 20 * Math.log10(Math.max(Math.sqrt(sum / buf.length), 1e-6));
      const { threshold, gain, sound } = prefsRef.current;
      // −70dBFS(아주 조용) ~ −10dBFS(고함)를 0~100으로. 오를 땐 빠르게, 내릴 땐 천천히
      const raw = Math.max(0, Math.min(100, ((db + 70 + gain) / 60) * 100));
      smooth = raw > smooth ? smooth * 0.6 + raw * 0.4 : smooth * 0.92 + raw * 0.08;
      const t = Date.now();
      if (smooth >= threshold) {
        if (!overSince) overSince = t;
        if (t - overSince >= HOLD_MS && t - lastWarn >= COOLDOWN_MS) {
          lastWarn = t;
          setWarns((n) => n + 1);
          setQuietFrom(t);
          setWarning(true);
          setTimeout(() => setWarning(false), 2500);
          if (sound) chimeQuiet();
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
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    stopRef.current = () => {
      cancelAnimationFrame(raf);
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
