"use client";
// 🏛️ 앱 뼈대 — 2026-11 재설계 (사용자: "왼쪽 사이드바", "자주 쓰는 메뉴는 위로, 위계 확실하게").
//   태블릿·PC(md 이상): 왼쪽 세로 메뉴 — 1단(아이콘+이름) 아래에 2단(들여쓴 작은 글씨)을 항상 펼쳐 둔다.
//                      위에 머리·탭줄이 없어 본문이 첫 화면에 다 들어간다.
//   휴대폰: 위 얇은 머리 + 아래 탭 막대(1단) + 본문 위 2단 줄.
//   모든 화면 머리(PageHeader)는 메뉴에서 자동으로 — '어디에 있는지'가 화면마다 같은 자리·같은 크기로 보인다.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import { useSession } from "@/stores/session";
import { useUiText } from "@/lib/uiText";
import { applyTabConfig, groupHref, groupMatches, matches, type NavGroup } from "@/components/TabNav";
import { nameInitial, students, studentById } from "@/lib/roster";
import { logout as fbLogout } from "@/lib/auth";
import { TeacherInboxWatcher, useUnseenCount } from "@/components/TeacherBell";
import PasswordSheet from "@/components/PasswordSheet";
import Icon from "@/components/shell/Icon";
import { TimerWatcher } from "@/components/tools/ToolsShell";
import FloatingWidgets from "@/components/tools/FloatingWidgets";

const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

function useNav() {
  const { role } = useSession();
  const { data: uiText } = useUiText();
  const pathname = usePathname();
  const t = useSearchParams().get("t");
  const groups = applyTabConfig(uiText, role);
  const active = groups.find((g) => groupMatches(g, pathname, t));
  const child = active?.children?.find((c) => matches(c, pathname, t));
  return { groups, active, child, pathname, t, role };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const { role } = useSession();
  // 로그인 전: 메뉴 없이 로그인 화면만 (이동할 곳이 없어 인지부하만 된다)
  if (!mounted || !role)
    return <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>;
  return (
    <div className="flex min-h-screen w-full">
      {role === "teacher" && (
        <>
          <TeacherInboxWatcher />
          {/* 타이머 엔진·떠 있는 도구 창 — 선생님 화면 어디서든 (칠판 위·오늘 운영 위) */}
          <Suspense fallback={null}>
            <TimerWatcher />
          </Suspense>
          <FloatingWidgets />
        </>
      )}
      <Suspense fallback={<aside className="hidden w-60 shrink-0 md:block" />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <MobileTop />
        </Suspense>
        {/* 본문은 메뉴 바로 옆에서 시작 (사용자 2026-11: 넓은 화면에서 가운데 정렬이라 메뉴와 내용 사이가 비었다) */}
        <main className="w-full max-w-[1320px] flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-7">
          <Suspense fallback={null}>
            <PageHeader />
          </Suspense>
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <MobileBar />
      </Suspense>
    </div>
  );
}

// ───────────────────────── 사이드바 (md+) ─────────────────────────
function Sidebar() {
  const { groups, active, pathname, t, role } = useNav();
  const unseen = useUnseenCount(role === "teacher");
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-200 bg-ink-50/60 md:flex">
      <Link href={role === "teacher" ? "/teacher" : "/"} className="flex items-center gap-2.5 px-5 pb-4 pt-6">
        <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-ink-900 text-[14px] font-bold text-white">학</span>
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-ink-900">학급 자치</span>
          <span className="block text-[11.5px] text-ink-500">5학년 2학기</span>
        </span>
      </Link>
      <nav aria-label="주 메뉴" className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {groups.map((g, i) => {
            const on = g === active;
            const divider = i > 0 && (g.children || groups[i - 1].children); // 묶음 앞뒤로 가는 선 — 덩어리가 보이게
            return (
              <li key={g.href} className={divider ? "mt-2 border-t border-ink-200/70 pt-2" : ""}>
                <Link
                  href={groupHref(g)}
                  aria-current={on && !g.children ? "page" : undefined}
                  className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px] transition-colors ${
                    on
                      ? g.children
                        ? "font-bold text-ink-900"
                        : "bg-white font-bold text-ink-900 shadow-[0_0_0_1px_var(--color-ink-200)]"
                      : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                  }`}
                >
                  <Icon name={g.icon} className={`h-[19px] w-[19px] ${on ? "text-ink-900" : "text-ink-400"}`} />
                  <span className="flex-1">{g.label}</span>
                  {g.teacherOnly && unseen > 0 && <Badge n={unseen} />}
                </Link>
                {g.children && (
                  <ul className="mb-1 ml-[22px] border-l border-ink-200 pl-3">
                    {g.children.map((c) => {
                      const cOn = matches(c, pathname, t);
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            aria-current={cOn ? "page" : undefined}
                            className={`-ml-[13px] flex h-8 items-center gap-2 border-l-2 pl-3 text-[13.5px] transition-colors ${
                              cOn
                                ? "border-ink-900 font-bold text-ink-900"
                                : "border-transparent text-ink-500 hover:text-ink-900"
                            }`}
                          >
                            <span className="flex-1">{c.label}</span>
                            {c.href === "/inbox" && unseen > 0 && <Badge n={unseen} />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <UserPanel />
    </aside>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

// 사용자 칸 — 이름 · (학생) 비밀번호 · (교사) 학생 화면 미리보기 · 로그아웃
function UserPanel({ compact = false }: { compact?: boolean }) {
  const { role, studentId, preview, logout, enterPreview, exitPreview } = useSession();
  const [pwOpen, setPwOpen] = useState(false);
  const label = role === "teacher" ? "선생님" : (studentById.get(studentId ?? 0)?.name ?? "학생");
  const btn = "press flex h-9 items-center gap-2 rounded-[8px] px-2.5 text-[13px] text-ink-600 hover:bg-ink-100 hover:text-ink-900";
  return (
    <div className={compact ? "space-y-1" : "space-y-1 border-t border-ink-200 px-3 py-3"}>
      <div className="flex items-center gap-2.5 px-2 py-1">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-200 text-[12px] font-bold text-ink-800">
          {nameInitial(label)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900">
          {label}
          {preview && <span className="ml-1.5 text-[11px] font-bold text-warn">미리보기</span>}
        </span>
      </div>
      {preview ? (
        <div className="space-y-1 px-1">
          <select
            value={studentId ?? ""}
            onChange={(e) => e.target.value && enterPreview(Number(e.target.value))}
            className="h-9 w-full rounded-[8px] border border-ink-200 bg-white px-2 text-[13px] font-bold text-ink-800"
            aria-label="미리보기 학생 선택"
          >
            {students
              .filter((s) => !s.inactive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}번 {s.name}
                </option>
              ))}
          </select>
          <button onClick={exitPreview} className="press h-9 w-full rounded-[8px] bg-ink-900 text-[13px] font-bold text-white">
            선생님 화면으로
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-0.5">
          {role === "teacher" && (
            <button
              className={btn}
              onClick={() => enterPreview(students.find((s) => !s.inactive)?.id ?? 1)}
              aria-label="학생 화면 미리보기"
            >
              <Icon name="eye" className="h-4 w-4" />
              학생 화면
            </button>
          )}
          {role === "student" && (
            <button className={btn} onClick={() => setPwOpen(true)}>
              <Icon name="key" className="h-4 w-4" />
              비밀번호
            </button>
          )}
          <button
            className={btn}
            onClick={() => {
              void fbLogout();
              logout();
            }}
          >
            <Icon name="logout" className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      )}
      {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
    </div>
  );
}

// ───────────────────────── 화면 머리 ─────────────────────────
const DAYS = "일월화수목금토";
function PageHeader() {
  const { active, child, pathname } = useNav();
  if (!active || pathname.startsWith("/tools/board")) return null; // 칠판은 판이 주인공
  const title = child?.label ?? active.label;
  const d = new Date();
  const eyebrow = child ? active.label : pathname === "/" ? `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일` : null;
  return (
    <header className="mb-5 md:mb-6">
      {eyebrow && <p className="mb-0.5 text-[13px] font-bold text-ink-500">{eyebrow}</p>}
      <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em] text-ink-900 md:text-[30px]">{title}</h1>
      {/* 휴대폰: 묶음 안 다른 화면으로 가는 2단 줄 (PC는 사이드바에 늘 보인다) */}
      {active.children && <MobileSubnav g={active} />}
    </header>
  );
}

function MobileSubnav({ g }: { g: NavGroup }) {
  const { pathname, t } = useNav();
  return (
    <nav aria-label={`${g.label} 하위 메뉴`} className="-mx-4 mt-3 overflow-x-auto px-4 md:hidden">
      <ul className="flex gap-1.5 whitespace-nowrap">
        {g.children!.map((c) => {
          const on = matches(c, pathname, t);
          return (
            <li key={c.href}>
              <Link
                href={c.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13.5px] font-bold ${
                  on ? "bg-ink-900 text-white" : "bg-white text-ink-600 shadow-[0_0_0_1px_var(--color-ink-200)]"
                }`}
              >
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ───────────────────────── 휴대폰 ─────────────────────────
function MyInitial() {
  const { role, studentId } = useSession();
  return <>{nameInitial(role === "teacher" ? "선생님" : (studentById.get(studentId ?? 0)?.name ?? "학생"))}</>;
}

function MobileTop() {
  const { role } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-ink-200 bg-ink-100/90 px-4 backdrop-blur-xl md:hidden">
      <Link href={role === "teacher" ? "/teacher" : "/"} className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-ink-900 text-[12px] font-bold text-white">학</span>
        <span className="text-[15px] font-bold tracking-tight text-ink-900">학급 자치</span>
      </Link>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="내 계정" className="press grid h-9 w-9 place-items-center rounded-full hover:bg-ink-200">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-200 text-[11px] font-bold text-ink-800">
          <MyInitial />
        </span>
      </button>
      {open && (
        <>
          <button aria-label="닫기" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-3 top-12 z-40 w-60 rounded-[12px] border border-ink-200 bg-white p-2 shadow-pop">
            <UserPanel compact />
          </div>
        </>
      )}
    </div>
  );
}

function MobileBar() {
  const { groups, active, role } = useNav();
  const unseen = useUnseenCount(role === "teacher");
  return (
    <nav
      aria-label="주 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="flex">
        {groups.map((g) => {
          const on = g === active;
          return (
            <li key={g.href} className="flex-1">
              <Link
                href={groupHref(g)}
                aria-current={on ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${on ? "text-ink-900" : "text-ink-400"}`}
              >
                <Icon name={g.icon} className="h-[22px] w-[22px]" />
                {g.label}
                {g.teacherOnly && unseen > 0 && (
                  <span className="absolute right-[calc(50%-20px)] top-1.5 h-2 w-2 rounded-full bg-danger" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
