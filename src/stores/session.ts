// UI/세션 상태만 담당 (서버 데이터는 React Query가 담당 — 섞지 말 것).
// localStorage에 유지되어 새로고침해도 로그인 상태가 남는다.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "student" | "teacher" | null;

interface SessionState {
  role: UserRole;
  studentId: number | null; // role === "student"일 때
  login: (role: Exclude<UserRole, null>, studentId?: number) => void;
  logout: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      role: null,
      studentId: null,
      login: (role, studentId) => set({ role, studentId: studentId ?? null }),
      logout: () => set({ role: null, studentId: null }),
    }),
    { name: "class2nd-session" }
  )
);
