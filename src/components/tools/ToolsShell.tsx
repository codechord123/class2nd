"use client";
// 🧰 교실 도구 공용 틀 — 3단 위계의 마지막 단(도구 사이 이동) + 전체 화면 + 어디서나 흐르는 타이머.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTimer, leftMs, fmt } from "@/stores/timer";
import { countTick, playEnd, setVolume, warnSoft } from "@/lib/tools/chime";
import { useWidgets, WIDGET_META } from "@/stores/widgets";

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
 * ⏱️ 타이머 엔진 — 선생님 화면 어디에 있든(셸에 한 번) 돌아간다.
 * 끝 소리·종료 전 알림(1분·30초)·마지막 10초 똑딱을 여기서 낸다 → 타이머 화면·떠 있는 창·다른 화면 모두 같은 소리.
 * 타이머 화면도 아니고 타이머 창도 안 떠 있으면 오른쪽 아래 작은 알약으로 남은 시간을 보여 준다.
 */
export function TimerWatcher() {
  const path = usePathname();
  const t = useTimer();
  const timerOpen = useWidgets((w) => w.open.some((x) => x.kind === "timer"));
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<{ endAt: number | null; w60: boolean; w30: boolean; tick: number }>({ endAt: null, w60: false, w30: false, tick: 99 });
  useEffect(() => {
    if (!t.endAt) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [t.endAt]);
  useEffect(() => {
    setVolume(t.prefs.volume);
  }, [t.prefs.volume]);
  useEffect(() => {
    if (!t.endAt) return;
    const f = fired.current;
    if (f.endAt !== t.endAt) {
      // 새로 시작했거나 시간을 더한 경우 — 이미 지난 경계는 다시 울리지 않게 지금 남은 시간으로 맞춘다
      const left0 = t.endAt - Date.now();
      fired.current = { endAt: t.endAt, w60: left0 <= 60_000, w30: left0 <= 30_000, tick: Math.ceil(left0 / 1000) };
      return;
    }
    const left = t.endAt - now;
    if (left <= 0) {
      t.finish();
      playEnd(t.prefs.sound);
      return;
    }
    if (t.prefs.warn60 && !f.w60 && left <= 60_000) {
      f.w60 = true;
      warnSoft();
    }
    if (t.prefs.warn30 && !f.w30 && left <= 30_000) {
      f.w30 = true;
      warnSoft();
    }
    const sec = Math.ceil(left / 1000);
    if (t.prefs.tick10 && sec <= 10 && sec < f.tick) {
      f.tick = sec;
      countTick(sec === 1);
    }
  }, [now, t]);

  if (path.startsWith("/tools/timer") || timerOpen) return null;
  const left = leftMs(t, now);
  if (!t.endAt && !t.doneAt) return null;
  return (
    <Link
      href="/tools/timer"
      className={`press fixed bottom-20 right-4 z-[70] flex items-center gap-2 rounded-full px-4 py-2.5 text-lg font-bold tabular-nums shadow-pop md:bottom-5 md:right-5 ${
        t.doneAt ? "animate-pulse bg-danger text-white" : "bg-ink-900 text-white"
      }`}
    >
      <span aria-hidden>⏱️</span>
      {t.label && <span className="max-w-32 truncate text-[13px] font-bold opacity-70">{t.label}</span>}
      {t.doneAt ? "시간 끝!" : fmt(left)}
    </Link>
  );
}

/** 떠 있는 창 켜기/끄기 버튼 줄 — 도구 탭 옆·칠판 도구 막대에 */
export function FloatLaunchers({ compact = false }: { compact?: boolean }) {
  const open = useWidgets((w) => w.open);
  const toggle = useWidgets((w) => w.toggle);
  return (
    <div className="flex items-center gap-1">
      {!compact && <span className="mr-1 text-[12px] font-bold text-ink-500">창 띄우기</span>}
      {(["timer", "pick", "noise"] as const).map((k) => {
        const on = open.some((x) => x.kind === k);
        return (
          <button
            key={k}
            onClick={() => toggle(k)}
            aria-pressed={on}
            title={`${WIDGET_META[k].label} 창 ${on ? "닫기" : "띄우기"}`}
            className={`press h-8 rounded-full px-3 text-[12.5px] font-bold transition-colors ${
              on ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
            }`}
          >
            {WIDGET_META[k].label}
          </button>
        );
      })}
    </div>
  );
}
