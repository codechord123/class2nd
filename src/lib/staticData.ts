// 1학기 정적 데이터 접근 계층.
// 빌드 시 번들에 포함되므로 Firebase 읽기 0회 — 절대 DB로 옮기지 말 것 (설계안 §5 원칙 4).
import s1WalletJson from "../../data/static/s1-silver-wallet.json";
import s1CountsJson from "../../data/static/s1-report-counts.json";
import type { S1Wallet, S1WalletStudent } from "@/types";
import type { ReadingStats } from "@/lib/query/reading";

export const s1Wallet = s1WalletJson as S1Wallet;

export function getS1WalletOf(studentId: number): S1WalletStudent | undefined {
  return s1Wallet.students.find((s) => s.id === studentId);
}

export const s1ClassGoldRemaining = s1Wallet.classGold.remaining;

/** 학생별 1학기 권수 기본값 = 실제 작성한 감상문 수 (초안 제외 — 지갑 명부 수치 대신 실기록 기준).
 *  선생님 보정(종이 감상문 인정 등)은 readingStats/main.s1Adj에 저장 → s1BooksOf에서 합산. */
export const s1BooksByStudent: Record<string, number> = s1CountsJson.counts;

/** 1학기 학급 전체 읽은 권수 기본값 (마라톤 목표는 1학기와 이어서 진행) */
export const s1TotalBooks: number = s1CountsJson.total;

/** 1학기 권수 (감상문 수 + 교사 보정) — stats는 이미 캐시된 readingStats/main 문서 */
export function s1BooksOf(stats: ReadingStats | undefined, studentId: number | string): number {
  const key = String(studentId);
  return (s1BooksByStudent[key] ?? 0) + (stats?.s1Adj?.[key] ?? 0);
}

/** 1학기 학급 전체 권수 (보정 포함) */
export function s1TotalOf(stats: ReadingStats | undefined): number {
  const adj = Object.values(stats?.s1Adj ?? {}).reduce((a, b) => a + (b || 0), 0);
  return s1TotalBooks + adj;
}

// 거북이 독서 백업(313KB)은 첫 페인트에 필요 없으므로 정적 import 대신
// 동적 import로 코드 스플리팅 — 거북이 탭 진입 시에만 로드된다.
export async function loadS1TurtleReading() {
  const mod = await import("../../data/static/s1-turtle-reading.json");
  return mod.default as unknown as import("@/types").S1TurtleReading;
}

/** 1학기 최종 읽은 권수 = mainState + sharedRecords 합산 (엑셀 자료와 일치 검증됨) */
export function s1BooksReadOf(
  turtle: import("@/types").S1TurtleReading,
  studentId: number
): number {
  const key = String(studentId);
  return (
    (turtle.booksRead.mainState[key] ?? 0) + (turtle.booksRead.sharedRecords[key] ?? 0)
  );
}
