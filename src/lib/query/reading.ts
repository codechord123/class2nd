"use client";
// 2학기 거북이 독서 — 읽기 예산 설계:
//   권수/랭킹은 readingStats/main 문서 하나(전원 통계)만 읽는다.
//   감상문 목록은 최근 N개 limit 쿼리 + 더보기(페이지네이션).
//   정식 등록 시에만 통계 increment — 임시저장(draft)은 권수에 미포함.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ReadingReport2 {
  id: string;
  studentId: number;
  title: string;
  author: string;
  publisher: string;
  summary: string; // 줄거리
  scene: string; // 인상 깊은 장면
  quote: string; // 인용
  thoughts: string; // 느낀 점
  isDraft: boolean;
  tags?: string[]; // 책 종류 태그 (장르 분류)
  week: number;
  createdAt: number;
}

/** 책 종류 태그 후보 (폼에서 선택) */
export const BOOK_TAGS = [
  "그림책", "동화", "소설", "과학", "역사", "인물", "시", "만화", "지식·정보", "기타",
] as const;

export type ReportForm = Pick<
  ReadingReport2,
  "title" | "author" | "publisher" | "summary" | "scene" | "quote" | "thoughts"
> & { tags: string[] };

/** 정식 등록 최소 글자수 검사 대상 (1학기와 동일: 장면+인용+줄거리+느낀점) */
export function reportBodyLength(f: ReportForm): number {
  return (f.scene + f.quote + f.summary + f.thoughts).length;
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
      const q = query(
        collection(db(), "readingReports"),
        orderBy("createdAt", "desc"),
        limit(PAGE * pages)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReadingReport2, "id">) }));
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** 감상문 삭제 — 정식 등록본이면 권수도 차감 (1학기와 동일 규칙) */
export function useDeleteReport() {
  const qc = useQueryClient();
  return async (report: ReadingReport2) => {
    const d = db();
    await deleteDoc(doc(d, "readingReports", report.id));
    if (!report.isDraft) {
      await setDoc(
        doc(d, "readingStats", "main"),
        {
          total: { [report.studentId]: increment(-1) },
          byWeek: { [report.week]: { [report.studentId]: increment(-1) } },
        },
        { merge: true }
      );
      void qc.invalidateQueries({ queryKey: STATS_KEY });
    }
    void qc.invalidateQueries({ queryKey: ["readingReports"] });
  };
}

/**
 * 감상문 저장 (신규/이어쓰기/수정 겸용).
 * - draft=true: 임시저장 — 권수 미증가
 * - draft=false: 정식 등록 — (신규 또는 임시→정식 승격 시) 권수 +1
 */
export function useSaveReport(myId: number | null, week: number) {
  const qc = useQueryClient();
  return async (
    form: ReportForm,
    opts: { draft: boolean; editId?: string; wasDraft?: boolean; origWeek?: number }
  ): Promise<string> => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!form.title.trim()) throw new Error("책 제목을 입력해주세요.");
    const d = db();
    const payload = {
      studentId: myId,
      week,
      isDraft: opts.draft,
      ...form,
      title: form.title.trim(),
    };

    let id = opts.editId;
    if (id) {
      // 수정: 원래 주차/작성자 유지 (권수 귀속 주차가 바뀌면 안 됨)
      const { week: _w, studentId: _s, ...editable } = payload;
      await setDoc(doc(d, "readingReports", id), editable, { merge: true });
    } else {
      const ref = await addDoc(collection(d, "readingReports"), {
        ...payload,
        createdAt: Date.now(),
      });
      id = ref.id;
    }

    // 권수 +1: 신규 정식 등록 또는 임시→정식 승격일 때만 (승격은 원래 주차에 귀속)
    const promoted = !opts.draft && (opts.editId == null || opts.wasDraft === true);
    const statWeek = opts.editId ? (opts.origWeek ?? week) : week;
    if (promoted) {
      await setDoc(
        doc(d, "readingStats", "main"),
        { total: { [myId]: increment(1) }, byWeek: { [statWeek]: { [myId]: increment(1) } } },
        { merge: true }
      );
      qc.setQueryData(STATS_KEY, (prev: ReadingStats | undefined) => {
        const p = prev ?? {};
        return {
          ...p,
          total: { ...p.total, [myId]: (p.total?.[myId] ?? 0) + 1 },
          byWeek: {
            ...p.byWeek,
            [statWeek]: {
              ...p.byWeek?.[statWeek],
              [myId]: (p.byWeek?.[statWeek]?.[myId] ?? 0) + 1,
            },
          },
        };
      });
    }
    void qc.invalidateQueries({ queryKey: ["readingReports"] });
    return id;
  };
}
