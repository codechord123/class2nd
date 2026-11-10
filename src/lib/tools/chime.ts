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

let collect: OscillatorNode[] | null = null; // 예약 중이면 만든 소리를 모아 둔다(취소용)

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
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * volume * 1.25), t0 + 0.02);
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

/** 마지막 10초 카운트 — 짧은 똑딱 (마지막은 조금 높게) */
export function countTick(last = false, off = 0) {
  tone(last ? 1320 : 990, off, 0.09, 0.16, "triangle");
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

// ── 타이머 소리 예약 ──
let timerNodes: OscillatorNode[] = [];
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
 * endAt(끝나는 시각)에 맞춰 끝 소리·종료 전 알림을 오디오 시계에 예약한다. 이전 예약은 지운다.
 * 소리가 잠겨 있으면(누르기 전) 아무것도 예약하지 않고 false — 풀리면 다시 부른다.
 */
/** 매초 틱·톡 — 나무 블록처럼 짧고 낮게 번갈아 (오래 들어도 거슬리지 않게) */
function tickTock(k: number, off: number) {
  tone(k % 2 ? 740 : 980, off, 0.045, 0.1, "triangle");
}
/** 매초 틱톡은 앞으로 이만큼(초)만 예약하고, 엔진이 1분마다 다시 건다 — 20분 타이머에 1,200개를 한꺼번에 만들지 않게 */
export const TICK_HORIZON = 180;

export function scheduleTimerSounds(
  endAt: number,
  p: { sound: EndSound; warn60: boolean; warn30: boolean; tick10: boolean; tickAll?: boolean }
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
    if (p.tick10) for (let k = 10; k >= 1; k--) if (d - k > 0.05) countTick(k === 1, d - k);
    if (p.tickAll) {
      // 남은 시간이 k초가 되는 순간마다 (마지막 10초 똑딱이 켜져 있으면 그 구간은 그쪽 소리로)
      const lower = p.tick10 ? 11 : 1;
      for (let k = Math.floor(d - 0.05); k >= lower; k--) {
        const off = d - k;
        if (off > TICK_HORIZON) break;
        tickTock(k, off);
      }
    }
    playEnd(p.sound, d);
    timerNodes = collect;
  } finally {
    collect = null;
  }
  return true;
}

/** 소음 경고음 — 또렷한 '삐-삐' 두 번 (교실 소음 위로 들리게, 타이머 소리 크기와 무관하게 조금 크게) */
export function warnBeep() {
  [0, 0.32].forEach((b) => {
    tone(1046, b, 0.2, 0.32, "square");
    tone(784, b + 0.12, 0.16, 0.22, "square");
  });
}

export type NoiseAlarm = "beep" | "soft" | "bell" | "none";
export const NOISE_ALARMS: { key: NoiseAlarm; label: string }[] = [
  { key: "beep", label: "삐삐 경고음" },
  { key: "soft", label: "부드러운 소리" },
  { key: "bell", label: "종" },
  { key: "none", label: "소리 없음" },
];
export function playNoiseAlarm(kind: NoiseAlarm) {
  // 타이머 '소리 크기'를 작게 해 둬도 소음 경고는 들려야 한다 — 이 순간만 최소 85%
  const v = volume;
  volume = Math.max(v, 0.85);
  if (kind === "beep") warnBeep();
  else if (kind === "soft") chimeQuiet();
  else if (kind === "bell") bell();
  volume = v;
}
