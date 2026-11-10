// 🔔 교실 도구 소리 — 파일 없이 WebAudio로 만든다 (오래된 데스크탑·태블릿 모두 재생, 다운로드 0).
// 브라우저는 '사용자가 한 번 누른 뒤'에만 소리를 허락하므로 시작 버튼·화면 아무 곳 누르기에서 unlockAudio()를 부른다.
// ⏱️ 타이머 소리는 '미리 예약'한다 (2026-11 실사례 "타이머 소리가 안 들려요"): 브라우저가 뒤로 가면(PPT를 띄우면)
//    화면 타이머 검사가 1초~1분에 한 번으로 느려져 끝 소리가 늦거나 빠졌다. 오디오 시계는 느려지지 않으므로
//    시작 순간에 끝 소리·1분 전·30초 전·마지막 10초를 그 시각에 울리도록 예약하고, 멈추면 취소한다.
let ctx: AudioContext | null = null;
let volume = 0.8; // 0~1 — 타이머 설정의 '소리 크기'

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

let forced: AudioContext | null = null; // 소음 경고는 마이크 측정용 오디오로 낸다 (playNoiseAlarm)
function ac(): AudioContext | null {
  if (forced && forced.state !== "closed") return forced;
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 시작·뽑기 버튼·화면 누르기에서 호출 — 이후 타이머 종료 소리가 막히지 않게 */
export function unlockAudio() {
  ac();
}

/** 지금 소리를 낼 수 있나 (한 번도 누르지 않았거나 새로고침 직후면 false) */
export function audioRunning(): boolean {
  return ctx?.state === "running";
}
/** 소리 상태가 바뀌면(잠김 → 풀림) 알림 — 타이머 예약을 다시 걸 때 쓴다 */
export function onAudioState(cb: () => void): () => void {
  const c = ac(); // 없으면 만든다(누르기 전이면 '잠김' 상태로 생김)
  if (!c) return () => {};
  c.addEventListener("statechange", cb);
  return () => c.removeEventListener("statechange", cb);
}

let collect: AudioScheduledSourceNode[] | null = null; // 예약 중이면 만든 소리를 모아 둔다(취소용)

function tone(freq: number, at: number, dur: number, vol = 0.25, type: OscillatorType = "sine") {
  const c = ac();
  if (!c) return;
  if (collect && c.state !== "running") return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + at;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * volume * 1.25), t0 + Math.min(0.02, dur * 0.3)); // 짧은 소리는 더 빨리 솟게(또렷한 '딱')
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  collect?.push(o);
}

/** 타이머 끝 — 맑은 3화음 두 번 (실로폰 느낌) */
export function chimeEnd(off = 0) {
  [off, off + 0.9].forEach((base) => {
    tone(784, base, 0.6, 0.22, "triangle");
    tone(988, base + 0.15, 0.6, 0.22, "triangle");
    tone(1319, base + 0.3, 0.9, 0.22, "triangle");
  });
}

/** 뽑기 공개 — 짧은 '띵' */
export function chimePick() {
  tone(1047, 0, 0.35, 0.2, "triangle");
  tone(1568, 0.08, 0.5, 0.16, "sine");
}

/** 뽑기 굴러가는 틱 */
export function tick() {
  tone(1800, 0, 0.04, 0.05, "square");
}

/** 소음 경고 — 낮고 부드러운 두 음 (놀라지 않게) */
export function chimeQuiet() {
  tone(523, 0, 0.5, 0.2, "sine");
  tone(392, 0.35, 0.7, 0.2, "sine");
}

/** 종 — 학교 종처럼 낮고 길게 두 번 */
export function bell(off = 0) {
  [off, off + 1.1].forEach((b) => {
    tone(659, b, 1.4, 0.22, "sine");
    tone(1318, b, 1.0, 0.08, "sine");
    tone(523, b + 0.45, 1.4, 0.2, "sine");
  });
}

/** 알람 — 또렷한 삑삑 n번 (교실이 시끄러울 때) */
export function alarm(times = 4, off = 0) {
  for (let i = 0; i < times; i++) {
    tone(1760, off + i * 0.5, 0.12, 0.2, "square");
    tone(1760, off + i * 0.5 + 0.18, 0.12, 0.2, "square");
  }
}

/** 종료 전 알림 — 부드러운 한 음 */
export function warnSoft(off = 0) {
  tone(880, off, 0.5, 0.18, "sine");
  tone(1175, off + 0.18, 0.6, 0.14, "sine");
}

export type EndSound = "chime" | "bell" | "alarm" | "none";
export const END_SOUNDS: { key: EndSound; label: string }[] = [
  { key: "chime", label: "실로폰" },
  { key: "bell", label: "종" },
  { key: "alarm", label: "알람" },
  { key: "none", label: "소리 없음" },
];
export function playEnd(kind: EndSound, off = 0) {
  if (kind === "chime") chimeEnd(off);
  else if (kind === "bell") bell(off);
  else if (kind === "alarm") alarm(4, off);
}

// ── 진짜 시계 같은 틱 소리 ──
// 사용자 2026-11: "삑 하는 음원보다 실제 틱톡 소리에 가깝게 — 티티티티틱(1초)". 기계식 시계의 '틱'은 탈진기가 맞물리며
// 몇 ms 간격으로 나는 작은 금속 충돌음 2~3개다 → 금방 사라지는 고음 공명 여러 개 + 아주 짧은 잡음을 겹쳐 만든다.
// 1~2초짜리 소리를 한 번 만들어 반복 재생(loop)하므로 20분 타이머도 소리 하나로 끝까지 박자가 맞는다.
export type TickStyle = "fast" | "clock";
export const TICK_STYLES: { key: TickStyle; label: string }[] = [
  { key: "fast", label: "티티티티틱 (초침)" },
  { key: "clock", label: "틱·톡 (벽시계)" },
];
type Res = [number, number][]; // [주파수, 사라지는 시간(초)]
const BRIGHT: Res = [[3300, 0.0045], [5100, 0.003], [7400, 0.002], [1250, 0.006]];
const DARK: Res = [[1900, 0.006], [3000, 0.004], [4600, 0.0025], [850, 0.009]];

function strike(d: Float32Array, sr: number, t0: number, amp: number, res: Res) {
  // 탈진기: 0 · 7 · 16ms에 잇달아 맞물림 (점점 약하게)
  for (const [dt, a] of [[0, 1], [0.007, 0.5], [0.016, 0.28]]) {
    const i0 = Math.round((t0 + dt) * sr);
    const n = Math.round(0.05 * sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = (Math.random() * 2 - 1) * Math.exp(-t / 0.0007) * 0.7;
      for (const [f, tau] of res) v += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau);
      d[(i0 + i) % d.length] += amp * a * v; // 끝을 넘으면 앞으로 감아 반복 이음새가 없게
    }
  }
}
const tickBufs = new Map<string, AudioBuffer>();
/** fast = 틱(0초) + 티 네 번(0.2·0.4·0.6·0.8초) / clock = 틱(0초)·톡(1초) / single = 1초마다 틱 하나 */
function tickBuffer(c: AudioContext, kind: TickStyle | "single"): AudioBuffer {
  const key = `${kind}-${c.sampleRate}`;
  const hit = tickBufs.get(key);
  if (hit) return hit;
  const sr = c.sampleRate;
  const buf = c.createBuffer(1, sr * (kind === "clock" ? 2 : 1), sr);
  const d = buf.getChannelData(0);
  const accent = (t: number) => {
    strike(d, sr, t, 1, DARK);
    strike(d, sr, t, 0.6, BRIGHT);
  };
  if (kind === "clock") {
    strike(d, sr, 0, 1, BRIGHT);
    strike(d, sr, 1, 1, DARK);
  } else {
    accent(0);
    if (kind === "fast") for (const t of [0.2, 0.4, 0.6, 0.8]) strike(d, sr, t, 0.42, BRIGHT);
  }
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.95 / peak;
  tickBufs.set(key, buf);
  return buf;
}
/** 틱톡 크기(0~1) × 전체 '소리 크기' → 실제 음량 (기본 0.5 → 0.65, 끝까지 → 1) */
const clickGain = (tickVol: number) => (0.3 + 0.7 * Math.max(0, Math.min(1, tickVol))) * Math.min(1, volume * 1.25);

/** 남은 시간 from초 → to초 구간에 틱 소리를 반복 재생. 소리의 0초(틱)가 숫자가 바뀌는 순간에 오도록 맞춘다. */
function loopSeg(c: AudioContext, buf: AudioBuffer, d: number, from: number, to: number, gain: number) {
  const L = Math.round(buf.duration);
  const startOff = Math.max(0.03, d - from);
  const stopOff = d - to - 0.03;
  if (stopOff <= startOff) return;
  const r = d - startOff; // 재생을 시작하는 순간의 남은 초
  const n = Math.floor(r);
  const pos = ((((n % L) - (r - n)) % L) + L) % L;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  const t = c.currentTime;
  src.start(t + startOff, pos);
  src.stop(t + stopOff);
  collect?.push(src);
}

/** 틱톡 미리 듣기 — 2초 */
export function previewTick(tickVol: number, style: TickStyle) {
  const c = ac();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = tickBuffer(c, style);
  src.loop = true;
  const g = c.createGain();
  g.gain.value = clickGain(tickVol);
  src.connect(g).connect(c.destination);
  src.start(c.currentTime + 0.03, 0);
  src.stop(c.currentTime + 2.03);
}

// ── 타이머 소리 예약 ──
let timerNodes: AudioScheduledSourceNode[] = [];
export function cancelTimerSounds() {
  for (const o of timerNodes) {
    try {
      o.stop();
      o.disconnect();
    } catch {}
  }
  timerNodes = [];
}

/**
 * endAt(끝나는 시각)에 맞춰 끝 소리·종료 전 알림·틱 소리를 오디오 시계에 예약한다. 이전 예약은 지운다.
 * 소리가 잠겨 있으면(누르기 전) 아무것도 예약하지 않고 false — 풀리면 다시 부른다.
 */
export function scheduleTimerSounds(
  endAt: number,
  p: { sound: EndSound; warn60: boolean; warn30: boolean; tick10: boolean; tickAll?: boolean; tickVol?: number; tickStyle?: TickStyle }
): boolean {
  cancelTimerSounds();
  const c = ac();
  if (!c || c.state !== "running") return false;
  const d = (endAt - Date.now()) / 1000;
  if (d <= 0) return true;
  collect = [];
  try {
    if (p.warn60 && d > 60.5) warnSoft(d - 60);
    if (p.warn30 && d > 30.5) warnSoft(d - 30);
    const style = p.tickStyle ?? "fast";
    const g = clickGain(p.tickVol ?? 0.5);
    // 흐르는 내내 (마지막 10초가 켜져 있으면 그 구간은 아래에서 더 크게)
    if (p.tickAll) loopSeg(c, tickBuffer(c, style), d, d + 1, p.tick10 ? 10 : 0, g);
    // 마지막 10초 — 1.5배 또렷하게 (매초 틱톡이 꺼져 있으면 1초마다 '틱' 하나)
    if (p.tick10) loopSeg(c, tickBuffer(c, p.tickAll ? style : "single"), d, 10, 0, Math.min(1, g * 1.5));
    playEnd(p.sound, d);
    timerNodes = collect;
  } finally {
    collect = null;
  }
  return true;
}

/**
 * 끝까지 같은 크기로 '유지'되는 소리 (경고음용). tone()은 치자마자 사그라드는 소리라 실제로 크게 들리는 건
 * 앞의 20~30ms뿐이었다 → 사용자 2026-11 "경고음이 여전히 작아". 소리 크기 설정(volume)과 무관한 절대 크기.
 */
function toneHold(freq: number, at: number, dur: number, peak: number, type: OscillatorType = "square") {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + at;
  const p = Math.max(0.0002, Math.min(0.95, peak));
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(p, t0 + 0.005);
  g.gain.setValueAtTime(p, t0 + dur - 0.025);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** 소음 경고음 — 또렷한 '삐-삐-삐-삐' (귀가 가장 잘 듣는 2kHz 근처, 소리를 끝까지 유지) */
export function warnBeep(loud = 1) {
  for (let i = 0; i < 4; i++) toneHold(i % 2 ? 1760 : 2093, i * 0.27, 0.2, 0.9 * loud, "square");
}

export type NoiseAlarm = "beep" | "soft" | "bell" | "none";
export const NOISE_ALARMS: { key: NoiseAlarm; label: string }[] = [
  { key: "beep", label: "삐삐 경고음" },
  { key: "soft", label: "부드러운 소리" },
  { key: "bell", label: "종" },
  { key: "none", label: "소리 없음" },
];
/**
 * 소음 경고는 타이머 '소리 크기'와 무관하게 크게 (사용자 2026-11: "소음 측정기도 소리가 더 컸으면", "여전히 작아") —
 * 거의 최대 음량을 소리 길이 내내 유지(toneHold) — 사그라드는 소리보다 소리 에너지가 약 15배.
 * loud(0.2~1)는 소음 화면의 '경고음 크기'.
 */
export function playNoiseAlarm(kind: NoiseAlarm, loud = 1, via?: AudioContext) {
  forced = via ?? null;
  try {
    playNoiseAlarmIn(kind, loud);
  } finally {
    forced = null;
  }
}
function playNoiseAlarmIn(kind: NoiseAlarm, loud: number) {
  const k = Math.max(0.2, Math.min(1, loud));
  if (kind === "beep") return warnBeep(k);
  if (kind === "soft") {
    // 부드러워도 작지 않게 — 낮은 두 음을 끝까지 유지
    toneHold(523, 0, 0.45, 0.9 * k, "triangle");
    toneHold(392, 0.5, 0.6, 0.9 * k, "triangle");
    return;
  }
  if (kind === "bell") {
    const v = volume;
    volume = k * 1.5;
    bell();
    volume = v;
  }
}

/** 🎯 조용한 시간 목표 달성 — 밝게 올라가는 네 음 (소음 경고음 크기를 따른다) */
export function playCheer(loud = 1, via?: AudioContext) {
  forced = via ?? null;
  const v = volume;
  volume = Math.max(0.2, Math.min(1, loud)) * 1.6;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 3 ? 0.7 : 0.25, 0.22, "triangle"));
  volume = v;
  forced = null;
}
