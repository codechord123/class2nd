"use client";
// 숫자 스텝퍼 — 쉼표 텍스트 입력을 대체하는 모듈형 컨트롤 (− [n] +).
export default function NumberStepper({
  value,
  onChange,
  min = -99,
  max = 99,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn =
    "press flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-lg font-bold text-ink-700 hover:bg-ink-200 disabled:opacity-30";
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        aria-label="감소"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className={btn}
      >
        −
      </button>
      <span className="tnum w-9 text-center text-base font-bold text-ink-900">
        {value > 0 ? `+${value}` : value}
      </span>
      <button
        type="button"
        aria-label="증가"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className={btn}
      >
        +
      </button>
    </div>
  );
}
