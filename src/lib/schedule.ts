// 21주 자리표 조회 — 정적 JSON(사전계산 결과)에서 읽는다. DB 읽기 0회.
// 재생성: node scripts/generate-schedules.mjs
import schedulesJson from "../../data/static/schedules-21w.json";
import type { WeekSchedule, GroupAssignment } from "@/types";

interface SchedulesFile {
  meta: {
    semesterStart: string;
    totalWeeks: number;
    rotationWeeks: number;
    periods: number;
    quality: Record<string, number>;
  };
  weeks: (WeekSchedule & { period: number })[];
}

export const schedules = schedulesJson as unknown as SchedulesFile;

export const SEMESTER_START = schedules.meta.semesterStart;
export const TOTAL_WEEKS = schedules.meta.totalWeeks;

/** 오늘 날짜 기준 현재 주차 (1~21로 클램프). 개학 전이면 1. */
export function currentWeekNum(now: Date = new Date()): number {
  const start = new Date(SEMESTER_START + "T00:00:00+09:00");
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(week, 1), TOTAL_WEEKS);
}

export function scheduleOfWeek(week: number): WeekSchedule & { period: number } {
  return schedules.weeks[Math.min(Math.max(week, 1), TOTAL_WEEKS) - 1];
}

/** 해당 주차에서 학생이 속한 모둠 (의장 포함 조회) */
export function groupOf(week: number, studentId: number): GroupAssignment | undefined {
  const s = scheduleOfWeek(week);
  return s.groups.find(
    (g) => g.chair === studentId || g.members.some((m) => m.studentId === studentId)
  );
}

/** 해당 주차에서 학생의 역할 ("소통"=의장) */
export function roleOf(week: number, studentId: number): string | undefined {
  const g = groupOf(week, studentId);
  if (!g) return undefined;
  if (g.chair === studentId) return "소통";
  return g.members.find((m) => m.studentId === studentId)?.role;
}
