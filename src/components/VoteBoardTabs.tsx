"use client";
// 투표·건의 스위처 — 한 상단 탭 안에서 두 화면(/vote·/board)을 오간다.
import Link from "next/link";

export default function VoteBoardTabs({ current }: { current: "vote" | "board" }) {
  const items = [
    { key: "vote", href: "/vote", label: "🗳️ 투표" },
    { key: "board", href: "/board", label: "🙋 건의" },
  ] as const;
  return (
    <div className="mb-4 flex gap-1.5">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={current === it.key ? "page" : undefined}
          className={`press rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            current === it.key
              ? "bg-violet-500 text-white shadow-card"
              : "bg-ink-100 text-ink-600 hover:bg-ink-200"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
