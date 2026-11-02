"use client";
// 💾 자동 저장 훅 — 입력이 멈추고 delay(기본 1.5초) 뒤에 저장한다.
// 실사례(2026-11): 교사 일지·메모를 쓰다가 저장 버튼을 안 누르고 화면을 옮기거나 새로고침해서
// 여러 번 사라졌다. 그래서 '버튼을 눌러야 저장'이 아니라 '쓰면 저장'으로 바꾼다:
//   · 타이핑이 멈추면 저장, 화면을 숨기거나(탭 전환·앱 전환) 떠날 때도 즉시 저장
//   · 저장은 한 줄로 세운다(chain) — 빠르게 연달아 바뀌어도 순서가 뒤집히거나 문서가 두 번 생기지 않는다
//   · 실패하면 dirty를 되살려 다음 입력·다음 숨김 때 다시 시도
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useAutosave<T>(
  value: T,
  opts: {
    enabled: boolean; // false면 예약하지 않는다 (예: 본문이 비었을 때)
    save: (v: T) => Promise<void>;
    delay?: number;
    initiallyDirty?: boolean; // 복원한 임시본처럼 아직 서버에 없을 수 있는 값으로 시작할 때
  }
) {
  const { enabled, delay = 1500, initiallyDirty = false } = opts;
  const sig = JSON.stringify(value);
  const latest = useRef(value);
  const saveRef = useRef(opts.save);
  const dirty = useRef(false);
  const first = useRef(true);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    latest.current = value;
    saveRef.current = opts.save;
  });

  const flush = useCallback((): Promise<void> => {
    if (!dirty.current) return chain.current;
    dirty.current = false;
    const v = latest.current;
    setState("saving");
    chain.current = chain.current
      .then(() => saveRef.current(v))
      .then(
        () => {
          setState("saved");
          setSavedAt(Date.now());
        },
        () => {
          dirty.current = true; // 다음 기회에 다시
          setState("error");
        }
      );
    return chain.current;
  }, []);

  // 값이 바뀌면 예약 — 입력이 이어지는 동안은 계속 미뤄진다
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!initiallyDirty) return;
    }
    if (!enabled) return;
    dirty.current = true;
    const t = setTimeout(() => void flush(), delay);
    return () => clearTimeout(t);
    // sig가 값의 내용 — 객체 참조가 바뀌어도 내용이 같으면 다시 저장하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled]);

  // 화면을 숨기거나 떠날 때·컴포넌트가 사라질 때 즉시 저장
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onLeave = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      void flush();
    };
  }, [flush]);

  return { state, savedAt, flush };
}

/** "☁️ 자동 저장됨 · 14:03" 같은 상태 문구 */
export function saveLabel(state: SaveState, savedAt: number): string {
  if (state === "saving") return "☁️ 저장 중…";
  if (state === "error") return "⚠️ 저장 실패 — 이 기기에 보관 중, 곧 다시 시도해요";
  if (state === "saved" && savedAt) {
    const d = new Date(savedAt);
    return `☁️ 자동 저장됨 · ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return "☁️ 쓰는 대로 자동 저장돼요";
}
