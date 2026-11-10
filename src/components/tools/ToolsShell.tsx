"use client";
// 🧰 교실 도구 공용 틀 — 3단 위계의 마지막 단(도구 사이 이동) + 전체 화면 + 어디서나 흐르는 타이머.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTimer, leftMs, fmt } from "@/stores/timer";
import { audioRunning, cancelTimerSounds, onAudioState, scheduleTimerSounds, setVolume, unlockAudio } from "@/lib/tools/chime";
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
  const [audioRev, setAudioRev] = useState(0); // 소리 잠김↔풀림이 바뀔 때마다 +1 → 예약 다시
  const [audioOn, setAudioOn] = useState(true);

  // 소리 잠금 풀기 — 새로고침 뒤엔 브라우저가 소리를 막는다. 화면 어디든 한 번 누르면 풀린다.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    const off = onAudioState(() => {
      setAudioOn(audioRunning());
      setAudioRev((r) => r + 1);
    });
    const id = setTimeout(() => setAudioOn(audioRunning()), 0);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      off();
      clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (!t.endAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [t.endAt]);
  useEffect(() => {
    setVolume(t.prefs.volume);
  }, [t.prefs.volume]);

  // ⏰ 소리 예약 — 시작·시간 더하기·설정 변경·소리 풀림 때마다 끝나는 시각에 맞춰 다시 건다.
  //    끝나서 멈춘 경우(doneAt)엔 울리고 있는 끝 소리를 끊지 않는다.
  const { sound, warn60, warn30, tick10, tickAll, volume } = t.prefs;
  // 매초 틱톡은 앞 3분만 예약 → 흐르는 동안 1분마다 다시 걸어 끊기지 않게
  const [tickRev, setTickRev] = useState(0);
  useEffect(() => {
    if (!t.endAt || !tickAll) return;
    const id = setInterval(() => setTickRev((r) => r + 1), 60_000);
    return () => clearInterval(id);
  }, [t.endAt, tickAll]);
  useEffect(() => {
    if (t.endAt) scheduleTimerSounds(t.endAt, { sound, warn60, warn30, tick10, tickAll });
    else if (!t.doneAt) cancelTimerSounds();
  }, [t.endAt, t.doneAt, sound, warn60, warn30, tick10, tickAll, volume, audioRev, tickRev]);

  // 끝난 상태로 바꾸기(화면 깜빡임·'시간 끝!') — 소리는 위 예약이 이미 그 시각에 냈다
  useEffect(() => {
    if (t.endAt && now >= t.endAt) t.finish();
  }, [now, t]);

  const lockedNotice =
    !audioOn && (t.endAt || t.doneAt) && t.prefs.sound !== "none" ? (
      <button
        onClick={() => unlockAudio()}
        className="press fixed left-1/2 top-3 z-[90] -translate-x-1/2 rounded-full bg-warn px-4 py-2 text-[13px] font-bold text-white shadow-pop"
      >
        🔇 타이머 소리가 꺼져 있어요 — 여기를 한 번 눌러 주세요
      </button>
    ) : null;

  if (path.startsWith("/tools/timer") || timerOpen) return lockedNotice;
  const left = leftMs(t, now);
  if (!t.endAt && !t.doneAt) return lockedNotice;
  return (
    <>
      {lockedNotice}
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
    </>
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
