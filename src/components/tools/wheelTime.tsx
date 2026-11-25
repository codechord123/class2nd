"use client";
// 🖱️ 시계 위에서 휠로 시간 조절 (사용자 2026-11: "시계를 휠로 시간 조정할 수도 있으면", "휠 돌리는 건 아직 안 되는데?").
// 시계(링·창) 어디서나 휠 = 1분씩, 초 숫자 위에서는 10초씩(Shift를 누르면 1초씩). 위로 = 늘리기. 흐르는 중에도 된다.
// · React의 onWheel은 '수동(passive)'이라 페이지 스크롤을 막지 못해 직접 붙인다.
// · 요소에 붙이는 ref 콜백이라 숫자가 다시 그려져도(끝!→처음, 크게 보기 등) 새 요소에 다시 붙는다
//   (처음엔 effect로 한 번만 붙여, 요소가 바뀌면 휠이 안 먹었다).
// · 트랙패드는 조금씩 모아서 한 칸.
import { useCallback, useEffect, useRef } from "react";

export function useWheelTime(enabled: boolean, add: (ms: number) => void) {
  const live = useRef({ enabled, add });
  useEffect(() => {
    live.current = { enabled, add };
  });
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    let acc = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!live.current.enabled) return; // 끝났거나 입력 중이면 페이지 스크롤 그대로
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
      live.current.add(dir * step);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
}

/** "5:30" → 분·초를 따로 감싼다 (휠이 초 쪽 위에 있으면 10초씩) */
export function Digits({ text }: { text: string }) {
  const i = text.lastIndexOf(":");
  if (i < 0) return <>{text}</>;
  return (
    <>
      <span data-unit="m">{text.slice(0, i)}</span>:<span data-unit="s">{text.slice(i + 1)}</span>
    </>
  );
}
