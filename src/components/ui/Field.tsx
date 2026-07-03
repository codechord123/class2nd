// 공용 입력 필드 — 라벨+입력 통일 스타일 (토스식 필드: ink-100 배경, 포커스 링).
import { forwardRef } from "react";

const base =
  "w-full rounded-btn bg-ink-100 px-3.5 text-sm text-ink-900 placeholder:text-ink-400 " +
  "outline-none transition focus:bg-white focus:ring-2 focus:ring-brand/40 border border-transparent focus:border-brand/30";

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-bold text-ink-600">{children}</span>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${base} h-11 ${className}`} {...rest} />;
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...rest }, ref) {
  return <textarea ref={ref} className={`${base} py-2.5 leading-relaxed ${className}`} {...rest} />;
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
