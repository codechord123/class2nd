"use client";
// 투표·건의·법률·숨은기여 스위처 — 한 상단 탭 안에서 네 화면(/vote·/board·/laws·/hidden)을 오간다.
// 법률·숨은기여는 건의에서 독립 (사용자 요청 — 제안·추천이 많아져 일반 안건이 묻히는 문제)
import Link from "next/link";

export default function VoteBoardTabs({
  current,
}: {
  current: "vote" | "board" | "laws" | "hidden";
}) {
  const items = [
    { key: "vote", href: "/vote", label: "🗳️ 투표" },
    { key: "board", href: "/board", label: "🙋 건의" },
    { key: "laws", href: "/laws", label: "📜 법률" },
    { key: "hidden", href: "/hidden", label: "🕵️ 숨은기여" },
  ] as const;
  return (
    // 네 개라 좁은 화면에서 넘칠 수 있어 가로 스크롤 허용 (탭이 잘리지 않게)
    <div className="mb-4 -mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-1.5">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            aria-current={current === it.key ? "page" : undefined}
            className={`press shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              current === it.key
                ? "bg-violet-500 text-white shadow-card"
                : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {it.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
