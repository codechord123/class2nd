"use client";
// 2학기 거북이 독서 — 읽기 예산 설계:
//   권수/랭킹은 readingStats/main 문서 하나(전원 통계)만 읽는다.
//   감상문 목록은 최근 N개 limit 쿼리 + 더보기(페이지네이션).
//   감상문 등록 시 통계 문서를 increment로 함께 갱신 → 재조회 없음.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ReadingReport2 {
  id: string;
  studentId: number;
  title: string;
  author: string;
  thoughts: string;
  week: number;
  createdAt: number;
}

/** { total: {sid: n}, byWeek: { [week]: {sid: n} } } */
export interface ReadingStats {
  total?: Record<string, number>;
  byWeek?: Record<string, Record<string, number>>;
}

const STATS_KEY = ["readingStats"];

export function useReadingStats() {
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: async (): Promise<ReadingStats> => {
      const snap = await getDoc(doc(db(), "readingStats", "main"));
      return snap.exists() ? (snap.data() as ReadingStats) : {};
    },
    staleTime: 10 * 60 * 1000,
  });
}

const PAGE = 10;

export function useRecentReports(pages: number) {
  return useQuery({
    queryKey: ["readingReports", pages],
    queryFn: async (): Promise<ReadingReport2[]> => {
      // 더보기 시 마지막 문서 이후부터 이어 읽기 위해 페이지 수만큼 limit
      const q = query(
        collection(db(), "readingReports"),
        orderBy("createdAt", "desc"),
        limit(PAGE * pages)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReadingReport2, "id">) }));
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev, // 더보기 중 깜빡임 방지
  });
}

export function usePostReport(myId: number | null, week: number) {
  const qc = useQueryClient();
  return async (report: { title: string; author: string; thoughts: string }) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!report.title.trim()) throw new Error("책 제목을 입력해주세요.");
    const createdAt = Date.now();
    await addDoc(collection(db(), "readingReports"), {
      studentId: myId,
      week,
      createdAt,
      ...report,
    });
    // 통계 문서 increment — 전체 재집계 불필요
    await setDoc(
      doc(db(), "readingStats", "main"),
      {
        total: { [myId]: increment(1) },
        byWeek: { [week]: { [myId]: increment(1) } },
      },
      { merge: true }
    );
    // 캐시 낙관적 갱신 (재조회 없음)
    qc.setQueryData(STATS_KEY, (prev: ReadingStats | undefined) => {
      const p = prev ?? {};
      return {
        ...p,
        total: { ...p.total, [myId]: (p.total?.[myId] ?? 0) + 1 },
        byWeek: {
          ...p.byWeek,
          [week]: { ...p.byWeek?.[week], [myId]: (p.byWeek?.[week]?.[myId] ?? 0) + 1 },
        },
      };
    });
    void qc.invalidateQueries({ queryKey: ["readingReports"] });
  };
}
