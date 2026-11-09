"use client";
// 🧭 내비게이션 — 2단 위계 (2026-11 개편, 사용자: "메뉴 간 위계 정리, 지금 너무 산만해")
//   1단(주 메뉴): 홈 · 모둠 · 독서 · 나와 우리 · 상점 · 우리 반 (+ 선생님)  — 매일 쓰는 곳만 앞에
//   2단(하위 메뉴): 묶음이 있는 주 메뉴를 고르면 그 아래에 작은 글씨 줄로
//     우리 반 › 헌법 · 투표·건의 · 자리 · 안내        선생님 › 관리 · 알림함 · 교실 도구
//   3단(페이지 안): 각 화면의 세그먼트 컨트롤 (예: 투표·건의·법률·숨은기여)
// 예전엔 9~11개 탭이 탭마다 다른 색 알약으로 한 줄에 늘어서 '어디가 중요한지'가 안 보였다.
// 이제 색은 하나(활성 = 검정 캡슐)만 쓰고, 위계는 크기·굵기·위치로 만든다 (Apple 레퍼런스).
// 이름은 교사 '탭 이름·순서'에서 바꿀 수 있다 (nav.label.{경로}), 주 메뉴 순서는 nav.order2.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/stores/session";
import { useUiText } from "@/lib/uiText";

export interface NavItem {
  href: string;
  label: string;
  /** 이 경로들에서도 활성 (예: 투표·건의는 /board·/laws·/hidden에서도) */
  alt?: readonly string[];
}
export interface NavGroup extends NavItem {
  /** 하위 메뉴 — 있으면 주 메뉴를 누를 때 첫 하위 화면으로 간다 */
  children?: NavItem[];
  teacherOnly?: boolean;
}

export const NAV: NavGroup[] = [
  { href: "/", label: "홈" },
  { href: "/team", label: "모둠" },
  { href: "/reading", label: "독서" },
  // 🌈 사회정서학습 — 모둠에서 기분을 고른 뒤 바로 옆에서 마음을 나누도록
  { href: "/us", label: "나와 우리" },
  { href: "/shop", label: "상점" },
  {
    href: "/class",
    label: "우리 반",
    children: [
      // 헌법은 묶음 맨 앞 — 학급의 상징 (사용자 확정 유지)
      { href: "/rules", label: "헌법" },
      { href: "/vote", label: "투표·건의", alt: ["/board", "/laws", "/hidden"] },
      { href: "/seats", label: "자리" },
      { href: "/guide", label: "안내" },
    ],
  },
  {
    href: "/staff",
    label: "선생님",
    teacherOnly: true,
    children: [
      { href: "/teacher", label: "관리" },
      { href: "/inbox", label: "알림함" },
      { href: "/tools", label: "교실 도구" },
    ],
  },
];

/** 예전 1단 탭 목록 — 탭 이름 설정 화면의 '기본 이름' 표시용 (경로 → 기본 이름) */
export const TABS = NAV.flatMap((g) => [g, ...(g.children ?? [])]).map((t) => ({ href: t.href, label: t.label }));

const matches = (item: NavItem, path: string) =>
  item.href === "/"
    ? path === "/"
    : path === item.href ||
      path.startsWith(item.href + "/") ||
      (item.alt ?? []).some((a) => path === a || path.startsWith(a + "/"));

/** 교사 오버라이드(nav.order2 / nav.label.*) 적용 */
export function applyTabConfig(uiText: Record<string, string> | undefined): NavGroup[] {
  const label = (t: NavItem) => uiText?.[`nav.label.${t.href}`]?.trim() || t.label;
  const groups = NAV.map((g) => ({
    ...g,
    label: label(g),
    children: g.children?.map((c) => ({ ...c, label: label(c) })),
  }));
  const order = (uiText?.["nav.order2"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!order.length) return groups;
  // 저장된 순서에 없는(새로 생긴) 메뉴는 기본 위치에 끼워 넣는다
  const rank = (g: NavGroup) => {
    const i = order.indexOf(g.href);
    return i >= 0 ? i : NAV.findIndex((x) => x.href === g.href) - 0.5;
  };
  return [...groups].sort((a, b) => rank(a) - rank(b));
}

export default function TabNav() {
  const pathname = usePathname();
  const { role } = useSession();
  // persist 하이드레이션 전 SSR 불일치 방지
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [showFade, setShowFade] = useState(false);
  const updateFade = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setShowFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const { data: uiText } = useUiText();
  const groups = applyTabConfig(uiText).filter((g) => !g.teacherOnly || (mounted && role === "teacher"));
  const activeGroup = groups.find((g) => matches(g, pathname) || g.children?.some((c) => matches(c, pathname)));

  // 활성 탭이 화면 밖이면 보이도록 스크롤
  useEffect(() => {
    const el = activeRef.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const tabRect = el.getBoundingClientRect();
    const navRect = scroller.getBoundingClientRect();
    if (tabRect.left < navRect.left || tabRect.right > navRect.right)
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [pathname, groups.length, mounted, role]);

  useEffect(() => {
    updateFade();
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, [updateFade, groups.length, mounted, role]);

  // 로그인 전에는 탭 숨김 — 이동 가능한 곳이 없어 인지부하만 됨
  if (!mounted || !role) return null;

  return (
    <>
      <nav className="relative -mx-4" aria-label="주 메뉴">
        <div ref={scrollerRef} onScroll={updateFade} className="overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2 text-[15px] whitespace-nowrap">
            {groups.map((g) => {
              const active = g === activeGroup;
              const href = g.children?.[0]?.href ?? g.href;
              return (
                <li key={g.href}>
                  <Link
                    ref={active ? activeRef : undefined}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    data-tab={href}
                    className={`press inline-flex min-h-10 items-center rounded-full px-4 py-2 font-bold transition-colors ${
                      active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                    }`}
                  >
                    {g.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        {/* 우측 페이드: 뒤에 메뉴가 더 있음을 암시 (스크롤 끝에서 숨김) */}
        {showFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-white to-transparent"
          />
        )}
      </nav>
      {/* 2단 — 묶음 안의 화면들. 1단보다 작고 가볍게: 글씨 + 밑줄 (색 알약 없음) */}
      {activeGroup?.children && (
        <div className="-mx-4 overflow-x-auto border-t border-ink-200/70 px-4" aria-label={`${activeGroup.label} 하위 메뉴`}>
          <ul className="flex gap-5 text-[14px] whitespace-nowrap">
            {activeGroup.children.map((c) => {
              const on = matches(c, pathname);
              return (
                <li key={c.href}>
                  <Link
                    href={c.href}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex min-h-10 items-center border-b-2 font-bold transition-colors ${
                      on ? "border-ink-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800"
                    }`}
                  >
                    {c.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
