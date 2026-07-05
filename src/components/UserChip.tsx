"use client";
// 헤더 우측: 로그인한 사용자 표시 + 비밀번호 관리(학생) + 로그아웃.
// 교사는 '학생 화면' 미리보기로 로그아웃 없이 학생 뷰를 오갈 수 있다 (사용자 요청).
import { useEffect, useState } from "react";
import { useSession } from "@/stores/session";
import { students, studentById } from "@/lib/roster";
import { logout as fbLogout } from "@/lib/auth";
import PasswordSheet from "@/components/PasswordSheet";

export default function UserChip() {
  const { role, studentId, preview, logout, enterPreview, exitPreview } = useSession();
  const [mounted, setMounted] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !role) return null;

  const label =
    role === "teacher" ? "선생님" : (studentById.get(studentId ?? 0)?.name ?? "학생");

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-weak text-[11px] font-extrabold text-brand-strong">
        {label.charAt(0)}
      </span>
      <span className="font-bold text-ink-700">
        {label}
        {preview && <span className="ml-1 text-[10px] font-bold text-warn">미리보기</span>}
      </span>
      {role === "teacher" && (
        <button
          onClick={() => {
            const first = students.find((s) => !s.inactive)?.id ?? 1;
            enterPreview(first);
          }}
          className="press rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-600 hover:bg-ink-100"
        >
          👀 학생 화면
        </button>
      )}
      {preview ? (
        <button
          onClick={exitPreview}
          className="press rounded-full bg-warn px-2.5 py-1 text-xs font-bold text-white"
        >
          ↩ 선생님으로
        </button>
      ) : (
        <>
          {role === "student" && (
            <button
              onClick={() => setPwOpen(true)}
              className="press rounded-full border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:bg-ink-100"
              aria-label="비밀번호 관리"
            >
              🔑
            </button>
          )}
          <button
            onClick={() => {
              void fbLogout();
              logout();
            }}
            className="press rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-600 hover:bg-ink-100"
          >
            로그아웃
          </button>
        </>
      )}
      {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
    </div>
  );
}
