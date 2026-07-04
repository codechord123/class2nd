"use client";
// 접을 수 있는 섹션 — 길어지는 화면을 줄이는 공용 컴포넌트.
import { useState } from "react";

export default function Collapsible({
  title,
  defaultOpen = false,
  children,
  className = "",
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-card border border-ink-200 bg-white p-4 shadow-card ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-bold"
      >
        <span>{title}</span>
        <span className="text-sm text-ink-400">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
