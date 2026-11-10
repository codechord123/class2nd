// 🧭 메뉴 구조 — 2026-11 재설계 (사용자: "자주 쓰는 메뉴는 위로, 위계 확실하게, 중복 정리",
//   "우리 반 → 법전, 맨 앞에").
// 화면 뼈대는 shell/Sidebar(태블릿·PC 왼쪽 세로 목록) + shell/MobileBar(휴대폰 아래 탭).
//   1단: 법전 · 오늘 · 모둠 · 독서 · 상점 · 생활 (+ 선생님)
//   2단: 묶음 안 화면 (법전 › 헌법·법률 / 투표·건의, 생활 › 마음 나누기 / 우체통 / 자리 / 안내, 선생님 › …)
//   3단: 각 화면 안 세그먼트
// 이름은 교사 '메뉴 이름·순서'에서 바꿀 수 있다 (nav.label.{경로}), 1단 순서는 nav.order3.
export interface NavItem {
  href: string; // "?t=" 쿼리를 붙이면 같은 화면의 다른 부분 (선생님 › 학생·점수 등)
  label: string;
  /** 이 경로들에서도 활성 (예: 투표·건의는 /board·/laws·/hidden에서도) */
  alt?: readonly string[];
  teacherOnly?: boolean;
  studentOnly?: boolean;
}
export interface NavGroup extends NavItem {
  icon: string; // shell/Icon 이름
  children?: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    href: "/law",
    label: "법전",
    icon: "law",
    children: [
      { href: "/rules", label: "헌법·법률" },
      { href: "/vote", label: "투표·건의", alt: ["/board", "/laws", "/hidden"] },
    ],
  },
  // 학생의 첫 화면 — 오늘 할 일을 이 한 화면에서 끝낸다 (교사는 '선생님 › 오늘 운영'이 첫 화면)
  { href: "/", label: "오늘", icon: "today", studentOnly: true },
  {
    href: "/staff",
    label: "선생님",
    icon: "teacher",
    teacherOnly: true,
    children: [
      { href: "/inbox", label: "할 일" },
      { href: "/teacher", label: "오늘 운영" },
      { href: "/teacher?t=students", label: "학생·점수" },
      { href: "/teacher?t=log", label: "일지·감정" },
      { href: "/tools", label: "교실 도구" },
      { href: "/teacher?t=settings", label: "설정" },
    ],
  },
  { href: "/team", label: "모둠", icon: "team" },
  { href: "/reading", label: "독서", icon: "read" },
  { href: "/shop", label: "상점", icon: "shop" },
  {
    href: "/life",
    label: "생활",
    icon: "life",
    children: [
      { href: "/us", label: "마음 나누기" },
      { href: "/letters", label: "우체통", studentOnly: true },
      { href: "/seats", label: "자리" },
      { href: "/guide", label: "안내" },
    ],
  },
];

/** 탭 이름 설정 화면의 '기본 이름' 표시용 (경로 → 기본 이름) */
export const TABS = NAV.flatMap((g) => [g, ...(g.children ?? [])]).map((t) => ({ href: t.href, label: t.label }));

/** 현재 위치(경로 + ?t=)가 이 메뉴인가 */
export function matches(item: NavItem, path: string, t: string | null): boolean {
  const [base, q] = item.href.split("?");
  const wantT = q ? new URLSearchParams(q).get("t") : null;
  if (base === "/") return path === "/";
  const pathHit =
    path === base || path.startsWith(base + "/") || (item.alt ?? []).some((a) => path === a || path.startsWith(a + "/"));
  if (!pathHit) return false;
  // 같은 경로를 쿼리로 나눈 메뉴(선생님 › 오늘 운영 / 학생·점수 …)는 t까지 맞아야
  if (base === "/teacher") return (wantT ?? null) === (t || null);
  return true;
}

export function groupMatches(g: NavGroup, path: string, t: string | null) {
  return matches(g, path, t) || !!g.children?.some((c) => matches(c, path, t));
}

/** 역할에 맞는 메뉴만 + 교사 오버라이드(nav.order3 / nav.label.*) 적용 */
export function applyTabConfig(
  uiText: Record<string, string> | undefined,
  role?: "student" | "teacher" | null
): NavGroup[] {
  const label = (t: NavItem) => uiText?.[`nav.label.${t.href}`]?.trim() || t.label;
  const visible = (t: NavItem) =>
    !role || ((!t.teacherOnly || role === "teacher") && (!t.studentOnly || role === "student"));
  const groups = NAV.filter(visible).map((g) => ({
    ...g,
    label: label(g),
    children: g.children?.filter(visible).map((c) => ({ ...c, label: label(c) })),
  }));
  const order = (uiText?.["nav.order3"] ?? "")
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

/** 메뉴를 눌렀을 때 가는 곳 — 묶음은 첫 하위 화면 */
export const groupHref = (g: NavGroup) => g.children?.[0]?.href ?? g.href;
