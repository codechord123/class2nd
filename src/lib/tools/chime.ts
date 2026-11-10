// 🔔 교실 도구 소리 — 파일 없이 WebAudio로 만든다 (오래된 데스크탑·태블릿 모두 재생, 다운로드 0).
// 브라우저는 '사용자가 한 번 누른 뒤'에만 소리를 허락하므로 시작 버튼에서 unlockAudio()를 부른다.
let ctx: AudioContext | null = null;
let volume = 0.8; // 0~1 — 타이머 설정의 '소리 크기'

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

function ac(): AudioContext | null {
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

/** 시작·뽑기 버튼에서 호출 — 이후 타이머 종료 소리가 막히지 않게 */
export function unlockAudio() {
  ac();
}

function tone(freq: number, at: number, dur: number, vol = 0.25, type: OscillatorType = "sine") {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + at;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * volume * 1.25), t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** 타이머 끝 — 맑은 3화음 두 번 (실로폰 느낌) */
export function chimeEnd() {
  [0, 0.9].forEach((base) => {
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
export function bell() {
  [0, 1.1].forEach((b) => {
    tone(659, b, 1.4, 0.22, "sine");
    tone(1318, b, 1.0, 0.08, "sine");
    tone(523, b + 0.45, 1.4, 0.2, "sine");
  });
}

/** 알람 — 또렷한 삑삑 n번 (교실이 시끄러울 때) */
export function alarm(times = 4) {
  for (let i = 0; i < times; i++) {
    tone(1760, i * 0.5, 0.12, 0.2, "square");
    tone(1760, i * 0.5 + 0.18, 0.12, 0.2, "square");
  }
}

/** 종료 전 알림 — 부드러운 한 음 */
export function warnSoft() {
  tone(880, 0, 0.5, 0.18, "sine");
  tone(1175, 0.18, 0.6, 0.14, "sine");
}

/** 마지막 10초 카운트 — 짧은 똑딱 (마지막은 조금 높게) */
export function countTick(last = false) {
  tone(last ? 1320 : 990, 0, 0.09, 0.14, "triangle");
}

export type EndSound = "chime" | "bell" | "alarm" | "none";
export const END_SOUNDS: { key: EndSound; label: string }[] = [
  { key: "chime", label: "실로폰" },
  { key: "bell", label: "종" },
  { key: "alarm", label: "알람" },
  { key: "none", label: "소리 없음" },
];
export function playEnd(kind: EndSound) {
  if (kind === "chime") chimeEnd();
  else if (kind === "bell") bell();
  else if (kind === "alarm") alarm();
}
