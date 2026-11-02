"use client";
// 🔑 저장이 '권한 없음'으로 막혔을 때 그 자리에서 비밀번호만 다시 받아 이 기기를 다시 연결하고,
// 하던 일(상점 신청·편지 등)을 자동으로 한 번 더 시도한다.
// 예전엔 "로그아웃했다가 다시 로그인하세요" 토스트만 떠서, 아이들은 '신청이 안 된다'로만 느꼈다.
// (원인: 다른 기기에서 로그인하면 이 기기의 쓰기 권한이 넘어가던 구조 — auth.ts devices 참고)
import { useState } from "react";
import { create } from "zustand";
import { codeOf, studentLogin } from "@/lib/auth";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";

interface ReauthState {
  resolve: ((ok: boolean) => void) | null;
  open: (resolve: (ok: boolean) => void) => void;
  close: () => void;
}
const useReauthStore = create<ReauthState>((set) => ({
  resolve: null,
  open: (resolve) => set({ resolve }),
  close: () => set({ resolve: null }),
}));

/** 비밀번호를 다시 받아 이 기기를 연결 — 성공하면 true */
export function requestReauth(): Promise<boolean> {
  const { role, studentId, preview } = useSession.getState();
  if (role !== "student" || studentId == null || preview) return Promise.resolve(false);
  const prev = useReauthStore.getState().resolve;
  if (prev) prev(false); // 이미 떠 있던 요청은 정리
  return new Promise((resolve) => useReauthStore.getState().open(resolve));
}

/**
 * 학생 쓰기를 감싼다 — permission-denied면 비밀번호 확인 후 한 번만 다시 시도.
 * 다시 해도 막히면 원래 오류를 그대로 던진다(잠금·시간 같은 다른 이유일 수 있으니 호출부가 판단).
 */
export async function withReauth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (codeOf(e) !== "permission-denied") throw e;
    if (!(await requestReauth())) throw e;
    return await fn();
  }
}

export default function ReauthDialog() {
  const resolve = useReauthStore((s) => s.resolve);
  if (!resolve) return null;
  return <Dialog resolve={resolve} />;
}

function Dialog({ resolve }: { resolve: (ok: boolean) => void }) {
  const { studentId } = useSession();
  const close = useReauthStore((s) => s.close);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const name = studentId != null ? (studentById.get(studentId)?.name ?? `${studentId}번`) : "";

  const done = (ok: boolean) => {
    close();
    resolve(ok);
  };
  async function submit() {
    if (busy || studentId == null) return;
    setBusy(true);
    setErr("");
    try {
      await studentLogin(studentId, pw);
      done(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onClick={() => done(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-title"
        className="w-full max-w-sm rounded-card bg-white p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reauth-title" className="text-lg font-extrabold text-ink-900">
          🔑 이 기기를 다시 연결할게요
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
          다른 기기에서 로그인해서 이 기기의 연결이 풀렸어요. <b>{name}</b> 비밀번호를 한 번만 입력하면
          하던 걸 바로 이어서 할게요.
        </p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
          }}
          placeholder="비밀번호"
          className="mt-3 w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px]"
        />
        {err && <p className="mt-2 text-sm font-bold text-danger">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => done(false)}
            className="press rounded-btn bg-ink-100 px-4 py-2 text-sm font-bold text-ink-600"
          >
            취소
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || !pw.trim()}
            className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "확인 중…" : "연결하고 계속하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
