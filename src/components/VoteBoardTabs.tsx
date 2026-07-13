"use client";
// 투표·건의·법률 스위처 — 한 상단 탭 안에서 세 화면(/vote·/board·/laws)을 오간다.
// 법률은 건의에서 독립 (사용자 요청 — 법률 제안이 많아져 일반 안건이 묻히는 문제)
import Link from "next/link";

export default function VoteBoardTabs({ current }: { current: "vote" | "board" | "laws" }) {
  const items = [
    { key: "vote", href: "/vote", label: "🗳️ 투표" },
    { key: "board", href: "/board", label: "🙋 건의" },
    { key: "laws", href: "/laws", label: "📜 법률" },
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
