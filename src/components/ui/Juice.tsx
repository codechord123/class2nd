"use client";
// 공용 juice — 성공·선택 순간의 입자 버스트 (마라톤과 같은 CSS 문법 재사용).
// 부모 요소는 relative여야 하고, fireKey를 올릴 때마다 한 번 터진다.
// 사용: const [j, setJ] = useState(0); ... onSuccess: setJ(k=>k+1); <JuiceBurst fireKey={j} emojis={["💌","✨","💛"]} />
import type { CSSProperties } from "react";

const DIRS = [
  { dx: "-18px", dy: "-26px", rot: "-25deg" },
  { dx: "2px", dy: "-32px", rot: "0deg" },
  { dx: "20px", dy: "-22px", rot: "25deg" },
];

export default function JuiceBurst({
  fireKey,
  emojis = ["✨", "🎉", "💛"],
  className = "left-1/2 top-1/2",
}: {
  fireKey: number;
  emojis?: string[]; // 최대 3개 — DIRS 방향에 하나씩
  className?: string; // 터지는 위치 (부모 relative 기준)
}) {
  if (fireKey <= 0) return null;
  return (
    <>
      {emojis.slice(0, 3).map((e, i) => (
        <span
          key={`${fireKey}-${i}`}
          aria-hidden
          className={`juice-burst pointer-events-none absolute z-30 text-sm ${className}`}
          style={
            {
              "--dx": DIRS[i].dx,
              "--dy": DIRS[i].dy,
              "--rot": DIRS[i].rot,
            } as CSSProperties
          }
        >
          {e}
        </span>
      ))}
    </>
  );
}
