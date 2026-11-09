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
    // 3단계(페이지 안) 메뉴 — 위 하위 메뉴(우리 반 › 투표·건의)와 구분되게 세그먼트 모양으로
    <div className="mb-4 -mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-0.5 rounded-[10px] bg-ink-200/70 p-[3px] text-[13px] font-bold">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            aria-current={current === it.key ? "page" : undefined}
            className={`press shrink-0 rounded-[8px] px-4 py-1.5 transition-colors ${
              current === it.key
                ? "bg-white text-ink-900 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            {it.label.replace(/^\S+\s/, "")}
          </Link>
        ))}
      </div>
    </div>
  );
}
