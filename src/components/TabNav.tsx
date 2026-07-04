"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/stores/session";

// 학생 화면 탭 구성 (요구사항 §2): 개요·Team·독서·건의·투표·자리·상점·헌법
// 모바일 가로 스크롤을 줄이기 위해 라벨은 짧게 유지 (레드팀 결론)
// 내비게이션은 텍스트만 — 이모지는 콘텐츠 영역에만 써서 정식 프로그램의 인상을 만든다
// 탭별 시그니처 컬러 — "지금 어디에 있는지"를 색으로 인지 (독서=에메랄드, 투표=보라…)
const TABS = [
  { href: "/", label: "개요", accent: "bg-brand" },
  { href: "/team", label: "Team", accent: "bg-orange-500" },
  { href: "/reading", label: "독서", accent: "bg-emerald-500" },
  { href: "/board", label: "건의", accent: "bg-sky-500" },
  { href: "/vote", label: "투표", accent: "bg-violet-500" },
  { href: "/seats", label: "자리", accent: "bg-amber-500" },
  { href: "/shop", label: "상점", accent: "bg-pink-500" },
  { href: "/rules", label: "헌법", accent: "bg-slate-600" },
] as const;

export default function TabNav() {
  const pathname = usePathname();
  const { role } = useSession();
  // persist 하이드레이션 전 SSR 불일치 방지
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  // 우측 페이드 힌트: 오른쪽에 더 스크롤할 내용이 있을 때만 표시
  const [showFade, setShowFade] = useState(false);

  const updateFade = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setShowFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const tabs =
    mounted && role === "teacher"
      ? [...TABS, { href: "/teacher", label: "교사", accent: "bg-ink-800" } as const]
      : TABS;
  const tabCount = tabs.length;

  // 페이지 로드·탭 변경 시 활성 탭이 화면 밖이면 보이도록 스크롤
  useEffect(() => {
    const el = activeRef.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const tabRect = el.getBoundingClientRect();
    const navRect = scroller.getBoundingClientRect();
    if (tabRect.left < navRect.left || tabRect.right > navRect.right) {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [pathname, tabCount]);

  // 최초 렌더·탭 수 변화·창 크기 변화 시 페이드 표시 여부 갱신
  useEffect(() => {
    updateFade();
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, [updateFade, tabCount]);

  // 로그인 전에는 탭 숨김 — 이동 가능한 곳이 없어 인지부하만 됨
  if (!mounted || !role) return null;

  return (
    <nav className="relative -mx-4">
      <div
        ref={scrollerRef}
        onScroll={updateFade}
        className="overflow-x-auto px-4"
      >
        <ul className="flex gap-1.5 pb-2 text-sm whitespace-nowrap">
          {tabs.map((t) => {
            const active =
              t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  ref={active ? activeRef : undefined}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`press inline-flex min-h-11 items-center rounded-full px-3.5 py-2.5 font-bold transition-colors ${
                    active
                      ? `${t.accent} text-white shadow-card`
                      : "bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-800"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {/* 우측 페이드: 뒤에 탭이 더 있음을 암시 (스크롤 끝에서 숨김) */}
      {showFade && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-white to-transparent"
        />
      )}
    </nav>
  );
}
