"use client";
// 공용 버튼 — Toss식 물리적 반응(press) 내장, 토큰 기반 변형.
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-card",
  secondary: "bg-ink-100 text-ink-800 hover:bg-ink-200",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100",
  danger: "bg-danger text-white hover:brightness-95 shadow-card",
  success: "bg-success text-white hover:brightness-95 shadow-card",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-btn",
  md: "h-11 px-4 text-sm rounded-btn", // 44px 터치 타깃
  lg: "h-13 px-5 text-base rounded-btn",
};

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", block, className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`press inline-flex items-center justify-center gap-1.5 font-bold disabled:pointer-events-none disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
