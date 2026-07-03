"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/stores/session";

// 학생 화면 탭 구성 (요구사항 §2): 개요·Team·거북이 독서·건의·투표·자리·상점
const TABS = [
  { href: "/", label: "개요", emoji: "🏠" },
  { href: "/team", label: "Team", emoji: "🤝" },
  { href: "/reading", label: "거북이 독서", emoji: "🐢" },
  { href: "/board", label: "건의", emoji: "📬" },
  { href: "/vote", label: "투표", emoji: "🗳️" },
  { href: "/seats", label: "자리 배치", emoji: "🪑" },
  { href: "/shop", label: "상점", emoji: "🛍️" },
  { href: "/rules", label: "헌법", emoji: "📜" },
] as const;

export default function TabNav() {
  const pathname = usePathname();
  const { role } = useSession();
  // persist 하이드레이션 전 SSR 불일치 방지
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tabs =
    mounted && role === "teacher"
      ? [...TABS, { href: "/teacher", label: "교사", emoji: "🧑‍🏫" } as const]
      : TABS;

  return (
    <nav className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 pb-2 text-sm whitespace-nowrap">
        {tabs.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="mr-1">{t.emoji}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
