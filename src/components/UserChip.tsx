"use client";
// 헤더 우측: 로그인한 사용자 표시 + 로그아웃.
import { useEffect, useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { logout as fbLogout } from "@/lib/auth";

export default function UserChip() {
  const { role, studentId, logout } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !role) return null;

  const label =
    role === "teacher" ? "🧑‍🏫 선생님" : `🎒 ${studentById.get(studentId ?? 0)?.name ?? "학생"}`;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium text-ink-600">{label}</span>
      <button
        onClick={() => {
          void fbLogout();
          logout();
        }}
        className="rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-500 hover:bg-ink-100"
      >
        로그아웃
      </button>
    </div>
  );
}
