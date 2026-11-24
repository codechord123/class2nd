"use client";
// 🖱️ 시계 숫자 위에서 휠로 시간 조절 (사용자 2026-11: "시계를 휠로 시간 조정할 수도 있으면").
// 분 숫자 위 = 1분씩, 초 숫자 위 = 10초씩(Shift를 누르면 1초씩). 휠을 위로 = 늘리기. 흐르는 중에도 된다.
// React의 onWheel은 '수동(passive)'이라 페이지 스크롤을 막지 못해 직접 붙인다. 트랙패드는 조금씩 모아서 한 칸.
import { useEffect, useRef, type RefObject } from "react";

export function useWheelTime(ref: RefObject<HTMLElement | null>, enabled: boolean, add: (ms: number) => void) {
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let acc = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY; // 줄 단위(일부 마우스) → 픽셀
      if (Date.now() - last > 400) acc = 0;
      last = Date.now();
      acc += dy;
      if (Math.abs(acc) < 40) return;
      const dir = acc < 0 ? 1 : -1;
      acc = 0;
      const unit = (e.target as HTMLElement | null)?.closest?.("[data-unit]")?.getAttribute("data-unit");
      const step = unit === "s" ? (e.shiftKey ? 1000 : 10_000) : 60_000;
      addRef.current(dir * step);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, enabled]);
}

/** "5:30" → 분·초를 따로 감싼다 (휠이 어느 쪽 위에 있는지 알게) */
export function Digits({ text }: { text: string }) {
  const i = text.lastIndexOf(":");
  if (i < 0) return <>{text}</>;
  return (
    <>
      <span data-unit="m">{text.slice(0, i)}</span>:<span data-unit="s">{text.slice(i + 1)}</span>
    </>
  );
}
