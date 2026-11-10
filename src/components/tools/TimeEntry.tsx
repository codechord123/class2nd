"use client";
// ⌨️ 타이머 직접 입력 — 분·초 칸 두 개 (사용자 2026-11: "초 단위로도 수기 입력").
// 예전 한 칸은 '숫자만 쓰면 분'이라 30초·1분 30초를 넣는 법이 안 보였다. 지금 시간이 미리 들어 있어
// 초만 고치면 되고, 분 칸에 두 자리를 쓰면 초 칸으로 넘어간다. Enter·바깥 누르기 = 적용, Esc = 취소.
import { useRef, useState } from "react";

export default function TimeEntry({
  initialMs,
  onSubmit,
  onCancel,
  className = "",
  style,
  dark = false,
}: {
  initialMs: number;
  onSubmit: (ms: number) => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
  dark?: boolean;
}) {
  const sec0 = Math.max(0, Math.round(initialMs / 1000));
  const [m, setM] = useState(String(Math.floor(sec0 / 60)));
  const [s, setS] = useState(String(sec0 % 60).padStart(2, "0"));
  const sRef = useRef<HTMLInputElement>(null);
  const closed = useRef(false);
  const commit = () => {
    if (closed.current) return;
    closed.current = true;
    const ms = ((Number(m) || 0) * 60 + (Number(s) || 0)) * 1000; // 초에 90을 써도 1분 30초
    if (ms > 0) onSubmit(ms);
    else onCancel();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
    if (e.key === "Escape") {
      closed.current = true;
      onCancel();
    }
  };
  const box = `w-[2.2ch] rounded-[0.1em] text-center outline-none ${
    dark ? "bg-white/10 focus:bg-white/20" : "bg-ink-100 focus:bg-ink-200"
  }`;
  const lab = `mt-1 block text-center text-[12px] font-bold leading-tight ${dark ? "text-white/50" : "text-ink-400"}`;
  return (
    <div
      className={`flex items-start justify-center gap-[0.08em] font-bold tabular-nums ${className}`}
      style={style}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
    >
      <label>
        <input
          autoFocus
          aria-label="분"
          value={m}
          inputMode="numeric"
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setM(v);
            if (v.length === 2) sRef.current?.focus();
          }}
          onKeyDown={onKey}
          className={box}
        />
        <span className={lab}>분</span>
      </label>
      <span className="opacity-50">:</span>
      <label>
        <input
          ref={sRef}
          aria-label="초"
          value={s}
          inputMode="numeric"
          onFocus={(e) => e.target.select()}
          onChange={(e) => setS(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onKeyDown={onKey}
          className={box}
        />
        <span className={lab}>초</span>
      </label>
    </div>
  );
}
