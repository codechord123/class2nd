// UI/세션 상태만 담당 (서버 데이터는 React Query가 담당 — 섞지 말 것).
// localStorage에 유지되어 새로고침해도 로그인 상태가 남는다.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "student" | "teacher" | null;

interface SessionState {
  role: UserRole;
  studentId: number | null; // role === "student"일 때
  preview: boolean; // 교사가 학생 화면 미리보기 중 (Firebase 인증은 교사 유지)
  login: (role: Exclude<UserRole, null>, studentId?: number) => void;
  logout: () => void;
  enterPreview: (studentId: number) => void; // 교사 → 학생 화면
  exitPreview: () => void; // 학생 화면 → 교사 (재로그인 불필요)
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      role: null,
      studentId: null,
      preview: false,
      login: (role, studentId) => set({ role, studentId: studentId ?? null, preview: false }),
      logout: () => set({ role: null, studentId: null, preview: false }),
      enterPreview: (studentId) => set({ role: "student", studentId, preview: true }),
      exitPreview: () => set({ role: "teacher", studentId: null, preview: false }),
    }),
    { name: "class2nd-session" }
  )
);
