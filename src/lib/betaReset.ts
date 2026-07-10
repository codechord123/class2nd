"use client";
// 베타 테스트 초기화 — 학생 활동 기록을 삭제 (교사 전용).
// 유지: 교사 설정(settings)·상점 메뉴·바로가기·헌법·메모·학생 비밀번호(studentAuth)·
//       🐢 독서 기록(감상문·초안·통계 — 방학 상시 누적, 사용자 확정. 단 아래 참고).
// 삭제: 평가·점수·칭찬 커버리지·실버 원장·이월 사용·자리신청·건의·투표·세션 정산·
//       오늘의모둠·비번 재설정 요청·거북이 응원 클릭(이벤트 마커 포함).
// 독서 특례: 진짜 누적 시작일(READING_KEEP_FROM) 이전의 '연습' 감상문만 지우고,
//       남은 감상문으로 통계(total·byWeek)를 재구축한다 — 방학 글은 0주차 버킷으로
//       재배치되므로 개학 후 주간 통계(스트릭·모둠 대항)를 오염시키지 않는다.
//       독서 '점수'는 일일 집계(+2/편)로 들어가므로, 초기화 마지막에 autoRun의
//       readDailyMigrated 플래그를 되돌려(false) 다음 교사 접속 때 감상문 있는 날짜
//       전체가 자동 재집계되게 한다 → 독서 점수가 누적에 자동 복원(초기화 제외 규칙).
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { kstDateOf, todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";

/** 거북이 독서 '진짜 누적' 시작일 — 이 날짜 전 감상문은 베타 연습으로 보고 지운다 */
export const READING_KEEP_FROM = "2026-07-05";

const SIMPLE_COLLECTIONS = [
  "dailyScores", // _cumulative 포함 (독서 점수는 아래 readDailyMigrated 재예약으로 자동 복원)
  "biweeklyScores",
  "coinTxns", // 0_balances 포함
  "s1Spends",
  "seatChangeRequests",
  "suggestions",
  "polls",
  "resetRequests",
  "menuRequests",
];

/** 베타 기간 날짜 목록 (evaluations/{date}/entries 하위컬렉션 열거용).
 *  종료일은 반드시 KST 오늘 — UTC(toISOString)를 쓰면 한국 시간과 날짜가 어긋나는
 *  시간대(KST 00~09시 등)에 '오늘' 평가가 안 지워진다 (개학 리허설에서 발견된 버그). */
function betaDates(from = "2026-06-20", to?: string): string[] {
  const end = to ?? todayKST();
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
  // 거북이 응원 클릭 — 카운트·이벤트 지급 마커까지 리셋 (개학 후 깜짝 이벤트를 처음부터)
  await deleteDoc(doc(d, "classData", "turtleClicks")).catch(() => failed.push("turtleClicks"));

  // 4) 독서 정리 — 연습 감상문(READING_KEEP_FROM 이전)만 삭제 + 통계 재구축.
  //    남는 감상문은 week 필드도 재배치(방학=0주차) — 삭제 시 차감 버킷이 어긋나지 않게.
  onProgress?.("독서 기록 정리 중…");
  try {
    const [reports, statsSnap] = await Promise.all([
      getDocs(collection(d, "readingReports")),
      getDoc(doc(d, "readingStats", "main")),
    ]);
    const total: Record<string, number> = {};
    const byWeek: Record<string, Record<string, number>> = {};
    for (const r of reports.docs) {
      const v = r.data();
      const date = kstDateOf(Number(v.createdAt) || 0);
      if (date < READING_KEEP_FROM) {
        await deleteDoc(r.ref); // 베타 연습분
        deleted++;
        continue;
      }
      if (v.isDraft) continue; // 잔존 초안 문서는 권수로 세지 않는다
      const sid = String(v.studentId);
      const week = date < SEMESTER_START ? 0 : weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
      total[sid] = (total[sid] ?? 0) + 1;
      (byWeek[String(week)] ??= {})[sid] = (byWeek[String(week)]?.[sid] ?? 0) + 1;
      if (v.week !== week) await setDoc(r.ref, { week }, { merge: true });
    }
    // s1Adj(1학기 권수 교사 보정)는 실기록 — 재구축에서도 보존
    const s1Adj = statsSnap.exists()
      ? ((statsSnap.data().s1Adj as Record<string, number> | undefined) ?? {})
      : {};
    await setDoc(doc(d, "readingStats", "main"), { total, byWeek, s1Adj });
  } catch {
    failed.push("readingStats");
  }

  // 5) 독서 점수 복원 예약 — autoRun의 독서 스윕 플래그를 되돌려, 다음 교사 접속 때
  //    남은 감상문 날짜 전체를 자동 재집계(+2/편)하게 한다. coveredUntil도 함께 되돌려야
  //    지워진 dailyScores의 다른 날들도 백필로 다시 채워진다.
  onProgress?.("독서 점수 복원 예약 중…");
  await setDoc(
    doc(d, "classData", "autoRun"),
    { readDailyMigrated: false, coveredUntil: READING_KEEP_FROM },
    { merge: true }
  ).catch(() => failed.push("autoRun"));

  return { deleted, failed: [...new Set(failed)] };
}
