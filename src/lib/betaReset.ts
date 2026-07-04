"use client";
// 베타 테스트 초기화 — 학생 활동 기록을 전부 삭제 (교사 전용).
// 유지: 교사 설정(settings)·상점 메뉴·바로가기·헌법·메모·학생 비밀번호(studentAuth).
// 삭제: 평가·점수·칭찬 커버리지·실버 원장·이월 사용·자리신청·독서(감상문/초안/통계)·
//       건의·투표·세션 정산·오늘의모둠·비번 재설정 요청.
import { collection, deleteDoc, doc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

const SIMPLE_COLLECTIONS = [
  "dailyScores", // _cumulative 포함
  "biweeklyScores",
  "coinTxns", // 0_balances 포함
  "s1Spends",
  "seatChangeRequests",
  "readingReports",
  "readingDrafts",
  "readingStats",
  "suggestions",
  "polls",
  "resetRequests",
];

/** 베타 기간 날짜 목록 (evaluations/{date}/entries 하위컬렉션 열거용) */
function betaDates(from = "2026-06-20", to?: string): string[] {
  const end = to ?? new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  while (d.toISOString().slice(0, 10) <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

export interface ResetResult {
  deleted: number;
  failed: string[]; // 실패한 컬렉션 이름 (대개 콘솔 규칙 미게시가 원인)
}

/**
 * 전체 초기화 — 컬렉션별로 격리 실행: 하나가 권한 오류로 실패해도
 * 나머지는 계속 지우고, 실패 목록을 모아 보고한다.
 */
export async function resetAllRecords(onProgress?: (msg: string) => void): Promise<ResetResult> {
  const d = db();
  let deleted = 0;
  const failed: string[] = [];

  // 1) 단순 컬렉션 전부 삭제 (컬렉션 단위 격리)
  for (const coll of SIMPLE_COLLECTIONS) {
    onProgress?.(`${coll} 삭제 중…`);
    try {
      const snap = await getDocs(collection(d, coll));
      for (const docu of snap.docs) {
        await deleteDoc(docu.ref);
        deleted++;
      }
    } catch {
      failed.push(coll);
    }
  }

  // 2) 평가(evaluations/{date}/entries)·칭찬 커버리지 — 베타 날짜 순회
  onProgress?.("평가 기록 삭제 중…");
  let evalFailed = false;
  for (const date of betaDates()) {
    try {
      const entries = await getDocs(collection(d, "evaluations", date, "entries"));
      for (const e of entries.docs) {
        await deleteDoc(e.ref);
        deleted++;
      }
    } catch {
      evalFailed = true;
    }
    // 커버리지 문서는 존재 여부와 무관하게 삭제 시도 (없으면 no-op)
    await deleteDoc(doc(d, "complimentCoverage", date)).catch(() => {
      // 규칙 미게시 시 실패 가능 — 아래에서 한 번만 보고
    });
  }
  if (evalFailed) failed.push("evaluations");

  // 3) 오늘의 모둠 순위 기록 삭제 (설정·메뉴 등 다른 classData 문서는 유지)
  onProgress?.("모둠 순위 기록 삭제 중…");
  await deleteDoc(doc(d, "classData", "bestGroups")).catch(() => failed.push("bestGroups"));

  return { deleted, failed: [...new Set(failed)] };
}
