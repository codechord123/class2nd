"use client";
// 🧰 교실 도구 공용 틀 — 3단 위계의 마지막 단(도구 사이 이동) + 전체 화면 + 어디서나 흐르는 타이머.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTimer, leftMs, fmt } from "@/stores/timer";
import { chimeEnd } from "@/lib/tools/chime";

export const TOOLS = [
  { href: "/tools/board", label: "칠판", emoji: "🖊️", desc: "색 글씨 줄·손글씨, 쓰는 대로 저장되고 목록에서 다시 열어요" },
  { href: "/tools/timer", label: "타이머", emoji: "⏱️", desc: "큰 숫자와 링, 끝나면 소리로 알려요" },
  { href: "/tools/pick", label: "뽑기", emoji: "🎲", desc: "우리 반 이름·번호·직접 입력에서 공정하게" },
  { href: "/tools/check", label: "체크리스트", emoji: "✅", desc: "숙제 제출 확인·오늘 할 일" },
  { href: "/tools/noise", label: "소음", emoji: "🔊", desc: "마이크로 교실 소리를 재고 기준을 넘으면 알려요" },
] as const;

/** 도구 사이 이동 — 세그먼트 컨트롤 모양의 링크 (Apple 3단: 페이지 안 전환) */
export function ToolsTabs() {
  const path = usePathname();
  const items = [{ href: "/tools", label: "모두" }, ...TOOLS];
  return (
    <nav aria-label="교실 도구" className="flex gap-0.5 overflow-x-auto rounded-[10px] bg-ink-200/70 p-[3px] text-[13px] font-bold">
      {items.map((t) => {
        const on = t.href === "/tools" ? path === "/tools" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`press flex-1 whitespace-nowrap rounded-[8px] px-3 py-1.5 text-center transition-colors ${
              on
                ? "bg-white text-ink-900 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 집중 모드(전체 화면) — 화면을 덮는 고정 레이어 + 가능하면 브라우저 전체 화면.
 * 아이패드 등 전체 화면 API가 막힌 곳에서도 고정 레이어만으로 '프로젝터용 화면'이 된다.
 */
export function useFocusMode() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setOn(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOn(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const toggle = useCallback(() => {
    const next = !on;
    try {
      if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {}
    setOn(next);
  }, [on]);
  return { on, toggle };
}

export function FocusButton({ on, toggle, dark = false }: { on: boolean; toggle: () => void; dark?: boolean }) {
  return (
    <button
      onClick={toggle}
      className={`press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${
        dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-ink-100 text-ink-800 hover:bg-ink-200"
      }`}
    >
      {on ? "↙ 작게" : "↗ 크게 보기"}
    </button>
  );
}

/**
 * ⏱️ 타이머 감시 — 도구 화면 어디에 있든 끝나는 순간 소리를 낸다.
 * 타이머 화면이 아닐 땐 오른쪽 아래에 작은 알약으로 남은 시간을 띄운다 (칠판에 쓰면서 시간 보기).
 */
export function TimerWatcher() {
  const path = usePathname();
  const t = useTimer();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!t.endAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [t.endAt]);
  useEffect(() => {
    if (t.endAt && now >= t.endAt) {
      t.finish();
      chimeEnd();
    }
  }, [now, t]);

  if (path.startsWith("/tools/timer")) return null;
  const left = leftMs(t, now);
  if (!t.endAt && !t.doneAt) return null;
  return (
    <Link
      href="/tools/timer"
      className={`press fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full px-4 py-2.5 text-lg font-bold tabular-nums shadow-pop ${
        t.doneAt ? "animate-pulse bg-danger text-white" : "bg-ink-900 text-white"
      }`}
    >
      <span aria-hidden>⏱️</span>
      {t.doneAt ? "시간 끝!" : fmt(left)}
    </Link>
  );
}
