"use client";
// 공용 피드백 시스템 (레드팀: 페이지마다 제각각인 인라인 msg·OS confirm 통일):
//   useToast()   — 하단 고정 토스트, 성공=emerald / 경고=amber / 실패=rose, 자동 소멸
//   useConfirm() — 스타일드 확인 다이얼로그 (async boolean)
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "warn" | "error";
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}
interface ConfirmState {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface FeedbackApi {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (opts: { title: string; body?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("FeedbackProvider가 필요합니다.");
  return ctx;
}

const TONE: Record<ToastKind, string> = {
  success: "border-success/30 bg-success-weak text-success",
  warn: "border-warn/30 bg-warn-weak text-warn",
  error: "border-danger/30 bg-danger-weak text-danger",
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = ++seq.current;
    setToasts((prev) => [...prev.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const confirm = useCallback(
    (opts: { title: string; body?: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) =>
        setConfirmState((prev) => {
          // 재진입 방지: 이미 열린 확인창이 있으면 이전 요청을 취소로 정리(promise 유실 방지)
          prev?.resolve(false);
          return { ...opts, resolve };
        })
      ),
    []
  );

  function closeConfirm(ok: boolean) {
    confirmState?.resolve(ok);
    setConfirmState(null);
  }

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      {/* 토스트 스택 — 헤더 바로 아래 우측 (시선이 머무는 콘텐츠 상단 근처, 하단 고립 방지) */}
      <div className="pointer-events-none fixed inset-x-0 top-28 z-50 mx-auto flex max-w-3xl flex-col items-end gap-1.5 px-4 lg:max-w-5xl">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md rounded-btn border px-4 py-2 text-sm font-medium shadow-lg ${TONE[t.kind]}`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* 확인 다이얼로그 */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-card bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-ink-900">{confirmState.title}</p>
            {confirmState.body && (
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-600">{confirmState.body}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => closeConfirm(false)}
                className="press rounded-btn border border-ink-200 px-4 py-2 text-sm font-bold text-ink-600 hover:bg-ink-50"
              >
                취소
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`press rounded-btn px-4 py-2 text-sm font-bold text-white ${
                  confirmState.danger ? "bg-danger hover:opacity-90" : "bg-ink-800 hover:opacity-90"
                }`}
              >
                {confirmState.confirmLabel ?? "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
