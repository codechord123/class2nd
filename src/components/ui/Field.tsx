// 공용 입력 필드 — 라벨+입력 통일 스타일.
// 흰 배경 + 또렷한 테두리: 회색 배경·투명 테두리는 "입력하는 곳"이라는 인지가 약했다(시인성).
// Textarea는 쓴 만큼 자란다(AutoTextarea) — rows는 '최소 높이'로 쓰인다.
// 감상문은 700자 이상 쓰는 칸이라 고정 높이면 칸 안에서 스크롤이 생겨 특히 불편했다.
"use client";
import { forwardRef } from "react";
import AutoTextarea from "@/components/ui/AutoTextarea";

const base =
  "w-full rounded-btn bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-400 " +
  "outline-none transition border border-ink-300 focus:border-brand focus:ring-2 focus:ring-brand/25";

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[13px] font-bold text-ink-700">{children}</span>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${base} h-11 ${className}`} {...rest} />;
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
    value: string;
    /** 최소 줄 수 (기존 rows와 같은 의미) — 내용이 길어지면 여기서부터 자란다 */
    rows?: number;
    maxRows?: number;
  }
>(function Textarea({ className = "", rows = 4, maxRows, ...rest }, ref) {
  return (
    <AutoTextarea
      ref={ref}
      minRows={rows}
      maxRows={maxRows}
      className={`${base} py-2.5 leading-relaxed ${className}`}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${base} h-11 ${className}`} {...rest}>
        {children}
      </select>
    );
  }
);

export function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
