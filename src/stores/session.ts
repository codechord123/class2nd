// UI/세션 상태만 담당 (서버 데이터는 React Query가 담당 — 섞지 말 것).
import { create } from "zustand";

export type UserRole = "student" | "teacher" | null;

interface SessionState {
  role: UserRole;
  studentId: number | null; // role === "student"일 때
  login: (role: Exclude<UserRole, null>, studentId?: number) => void;
  logout: () => void;
}

export const useSession = create<SessionState>((set) => ({
  role: null,
  studentId: null,
  login: (role, studentId) => set({ role, studentId: studentId ?? null }),
  logout: () => set({ role: null, studentId: null }),
}));
