"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/stores/session";
import { useUiText } from "@/lib/uiText";

// 학생 화면 탭 구성 — 기본 순서(B안, 레이아웃 감사 반영): 헌법은 맨 앞(상징 — 사용자
// 확정 유지), 그다음은 사용 빈도순(개요·모둠·독서·상점 매일 → 투표·건의·자리 가끔),
// 참조 문서인 안내는 맨 뒤. 이름·순서는 교사 '탭 이름·순서'에서 수정 가능(nav.* 키).
// 모바일 가로 스크롤을 줄이기 위해 라벨은 짧게 유지 (레드팀 결론)
// 탭별 시그니처 컬러 — "지금 어디에 있는지"를 색으로 인지
export const TABS = [
  { href: "/rules", label: "헌법", accent: "bg-slate-600" },
  { href: "/", label: "개요", accent: "bg-brand" },
  { href: "/team", label: "모둠", accent: "bg-orange-500" },
  { href: "/reading", label: "독서", accent: "bg-brand" },
  { href: "/shop", label: "상점", accent: "bg-pink-500" },
  // 투표·건의를 한 탭으로 — 페이지 상단 스위처로 오간다. alt: 이 경로에서도 탭이 활성화됨.
  { href: "/vote", label: "투표·건의", accent: "bg-violet-500", alt: ["/board", "/laws"] },
  { href: "/seats", label: "자리", accent: "bg-amber-500" },
  { href: "/guide", label: "안내", accent: "bg-teal-600" },
] as const;

/** 교사 오버라이드(nav.order / nav.label.*) 적용한 탭 목록 */
export function applyTabConfig(
  uiText: Record<string, string> | undefined
): { href: string; label: string; accent: string; alt?: string | readonly string[] }[] {
  const base = TABS.map((t) => ({
    ...t,
    label: uiText?.[`nav.label.${t.href}`]?.trim() || t.label,
  }));
  const orderStr = uiText?.["nav.order"]?.trim();
  if (!orderStr) return base;
  const order = orderStr.split(",").map((s) => s.trim());
  // 저장된 순서에 있는 탭은 그 순서대로
  const result = base
    .filter((t) => order.includes(t.href))
    .sort((a, b) => order.indexOf(a.href) - order.indexOf(b.href));
  // 순서 저장 '이후에' 새로 생긴 탭은 끝으로 밀지 않고 기본 위치(TABS 순서)에
  // 끼워 넣는다 — 끝으로 밀리면 좁은 화면에서 새 탭이 아예 안 보인다
  for (const t of base) {
    if (order.includes(t.href)) continue;
    const defIdx = TABS.findIndex((x) => x.href === t.href);
    result.splice(Math.min(defIdx, result.length), 0, t);
  }
  return result;
}

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

  const { data: uiText } = useUiText();
  const baseTabs = applyTabConfig(uiText);
  const tabs =
    mounted && role === "teacher"
      ? [...baseTabs, { href: "/teacher", label: "교사", accent: "bg-ink-800" }]
      : baseTabs;
  const tabCount = tabs.length;

  // 페이지 로드·탭 변경 시 활성 탭이 화면 밖이면 보이도록 스크롤.
  // mounted·role 의존성 필수: 하이드레이션 전엔 nav가 null(ref 없음)이라
  // 이들 없이 실행된 effect가 다시 돌지 않아 스크롤·페이드가 무효화된다.
  useEffect(() => {
    const el = activeRef.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const tabRect = el.getBoundingClientRect();
    const navRect = scroller.getBoundingClientRect();
    if (tabRect.left < navRect.left || tabRect.right > navRect.right) {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [pathname, tabCount, mounted, role]);

  // 최초 렌더·탭 수 변화·창 크기 변화 시 페이드 표시 여부 갱신
  useEffect(() => {
    updateFade();
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, [updateFade, tabCount, mounted, role]);

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
            const alt = (t as { alt?: string | readonly string[] }).alt;
            const alts = alt == null ? [] : Array.isArray(alt) ? alt : [alt as string];
            const active =
              t.href === "/"
                ? pathname === "/"
                : pathname.startsWith(t.href) || alts.some((a) => pathname.startsWith(a));
            return (
              <li key={t.href}>
                <Link
                  // 활성 탭이 바뀌면 리마운트 → 색 알약이 통통 (juice)
                  key={`${t.href}-${active}`}
                  ref={active ? activeRef : undefined}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`press inline-flex min-h-11 items-center rounded-full px-3.5 py-2.5 font-bold transition-colors ${
                    active
                      ? `badge-pop ${t.accent} text-white shadow-card`
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
