// 1학기 정적 데이터 접근 계층.
// 빌드 시 번들에 포함되므로 Firebase 읽기 0회 — 절대 DB로 옮기지 말 것 (설계안 §5 원칙 4).
import s1WalletJson from "../../data/static/s1-silver-wallet.json";
import type { S1Wallet, S1WalletStudent } from "@/types";

export const s1Wallet = s1WalletJson as S1Wallet;

export function getS1WalletOf(studentId: number): S1WalletStudent | undefined {
  return s1Wallet.students.find((s) => s.id === studentId);
}

export const s1ClassGoldRemaining = s1Wallet.classGold.remaining;

/** 1학기 학급 전체 읽은 권수 (마라톤 목표는 1학기와 이어서 진행) */
export const s1TotalBooks = s1Wallet.students.reduce((a, s) => a + s.booksReadS1, 0);

/** 학생별 1학기 권수 (합산 순위 표시용) */
export const s1BooksByStudent: Record<string, number> = Object.fromEntries(
  s1Wallet.students.map((s) => [String(s.id), s.booksReadS1])
);

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
