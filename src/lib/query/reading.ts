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
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { kstDateOf, todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";

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
  authorIntent?: string; // 작가는 왜 이 글을 썼을까? (생각 유도 — 복붙 방지)
  connect?: string; // 이 책을 나와 연결하면? (개인 연결 — 복붙 방지)
  isDraft: boolean;
  isPrivate?: boolean; // 🔒 선생님만 보기 (작성자 본인·교사에게만 내용 공개)
  tags?: string[]; // 책 종류 태그 (장르 분류)
  comments?: ReportComment[]; // 친구 댓글 (문서 내 배열 — 추가 읽기 0)
  week: number;
  createdAt: number;
}

export interface ReportComment {
  id: number;
  studentId: number | "teacher";
  text: string;
  createdAt: number;
}

/** 책 종류 태그 후보 (폼에서 선택) */
export const BOOK_TAGS = [
  "그림책", "동화", "소설", "과학", "역사", "인물", "시", "만화", "지식·정보", "기타",
] as const;

export type ReportForm = Pick<
  ReadingReport2,
  "title" | "author" | "publisher" | "summary" | "scene" | "quote" | "thoughts"
> & { tags: string[]; isPrivate?: boolean; authorIntent?: string; connect?: string };

/** 정식 등록 최소 글자수 검사 대상 — 장면+인용+줄거리+느낀점 + 작가의도·나와 연결(생각 유도) */
export function reportBodyLength(f: ReportForm): number {
  return (f.scene + f.quote + f.summary + f.thoughts + (f.authorIntent ?? "") + (f.connect ?? ""))
    .length;
}

/** { total: {sid: n}, byWeek: { [week]: {sid: n} } } — 권수는 쓴 만큼 그대로 (교사 ± 보정 포함)
 *  s1Adj: 1학기 권수 교사 보정(±). 1학기 기본값은 정적 감상문 수 — staticData.s1BooksOf에서 합산 */
export interface ReadingStats {
  total?: Record<string, number>;
  byWeek?: Record<string, Record<string, number>>;
  s1Adj?: Record<string, number>;
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

export function useRecentReports(count: number) {
  return useQuery({
    queryKey: ["readingReports", count],
    queryFn: async (): Promise<ReadingReport2[]> => {
      // 정식 등록본만 있는 컬렉션 — 초안은 readingDrafts에 따로 있어 노출되지 않음
      const q = query(
        collection(db(), "readingReports"),
        orderBy("createdAt", "desc"),
        limit(count)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReadingReport2, "id">) }));
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** 내 임시저장 — 본인 것만 소량 조회(항상 전부 표시, 최근 N건 창에 밀리지 않음) */
export function useMyDrafts(myId: number | null) {
  return useQuery({
    queryKey: ["readingDrafts", myId],
    enabled: myId != null,
    queryFn: async (): Promise<ReadingReport2[]> => {
      const q = query(collection(db(), "readingDrafts"), where("studentId", "==", myId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ReadingReport2, "id">) }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** 감상문 댓글 — board와 동일한 arrayUnion 패턴 (추가 읽기 0) */
export function useAddReportComment(author: number | "teacher" | null) {
  const qc = useQueryClient();
  return async (reportId: string, text: string) => {
    if (author == null) throw new Error("로그인이 필요해요.");
    if (!text.trim()) throw new Error("내용을 입력해주세요.");
    const comment: ReportComment = {
      // 같은 밀리초 동시 작성 시 id 충돌 방지 (board와 동일)
      id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
      studentId: author,
      text: text.trim(),
      createdAt: Date.now(),
    };
    const { arrayUnion, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(db(), "readingReports", reportId), { comments: arrayUnion(comment) });
    qc.setQueriesData({ queryKey: ["readingReports"] }, (prev: ReadingReport2[] | undefined) =>
      prev?.map((r) =>
        r.id === reportId ? { ...r, comments: [...(r.comments ?? []), comment] } : r
      )
    );
  };
}

export function useDeleteReportComment() {
  const qc = useQueryClient();
  return async (report: ReadingReport2, commentId: number) => {
    // arrayRemove(원자적) — 배열 재기록이면 낡은 캐시로 남의 새 댓글이 지워지는 꼬임 발생
    const target = (report.comments ?? []).find((c) => c.id === commentId);
    if (!target) return;
    const { updateDoc, arrayRemove } = await import("firebase/firestore");
    await updateDoc(doc(db(), "readingReports", report.id), { comments: arrayRemove(target) });
    qc.setQueriesData({ queryKey: ["readingReports"] }, (prev: ReadingReport2[] | undefined) =>
      prev?.map((r) =>
        r.id === report.id
          ? { ...r, comments: (r.comments ?? []).filter((c) => c.id !== commentId) }
          : r
      )
    );
  };
}

/** 정식 감상문 삭제 — 권수 1권 차감 (본인/교사).
 *  트랜잭션: 서버 값을 읽고 0 밑으로 내려가지 않게 클램프 (증감 꼬임으로 음수 권수 방지) */
export function useDeleteReport() {
  const qc = useQueryClient();
  return async (report: ReadingReport2) => {
    const d = db();
    const { runTransaction, arrayUnion } = await import("firebase/firestore");
    const key = String(report.studentId);
    const week = String(report.week);
    await runTransaction(d, async (tx) => {
      const statsRef = doc(d, "readingStats", "main");
      const snap = await tx.get(statsRef);
      const data = (snap.exists() ? snap.data() : {}) as ReadingStats;
      tx.delete(doc(d, "readingReports", report.id));
      tx.set(
        statsRef,
        {
          total: { [key]: Math.max((data.total?.[key] ?? 0) - 1, 0) },
          byWeek: { [week]: { [key]: Math.max((data.byWeek?.[week]?.[key] ?? 0) - 1, 0) } },
        },
        { merge: true }
      );
    });
    // 이미 집계된 날의 글이었다면 read 점수가 남아 있으므로 재집계 요청을 남긴다
    // (다음 교사 접속 때 autoRun이 그 날짜만 다시 집계 — 규칙상 redoDates 필드만 쓰기 허용).
    // 실패해도 삭제 자체는 완료된 것이므로 조용히 넘어간다 (교사 수동 재집계로 복구 가능).
    await setDoc(
      doc(d, "classData", "autoRun"),
      { redoDates: arrayUnion(kstDateOf(report.createdAt)) },
      { merge: true }
    ).catch(() => {});
    void qc.invalidateQueries({ queryKey: STATS_KEY });
    void qc.invalidateQueries({ queryKey: ["readingReports"] });
  };
}

/** 임시저장 삭제 — 권수 변화 없음 */
export function useDeleteDraft(myId: number | null) {
  const qc = useQueryClient();
  return async (draftId: string) => {
    await deleteDoc(doc(db(), "readingDrafts", draftId));
    void qc.invalidateQueries({ queryKey: ["readingDrafts", myId] });
  };
}

/**
 * 감상문 저장. 초안과 정식본을 컬렉션으로 분리:
 *  - draft=true  → readingDrafts에 저장(권수 미변동). 반환 id는 초안 id.
 *  - draft=false → readingReports에 정식 등록(신규/승격 시 +1). draftId가 있으면 그 초안 삭제.
 *                  reportId가 있으면 기존 정식본 수정(+1 없음).
 */
export function useSaveReport(myId: number | null) {
  const qc = useQueryClient();
  return async (
    form: ReportForm,
    opts: {
      draft: boolean;
      draftId?: string; // 이어쓰던 초안
      reportId?: string; // 수정 중인 정식본
      origWeek?: number; // 정식본 수정 시 원래 주차
    }
  ): Promise<string> => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!form.title.trim()) throw new Error("책 제목을 입력해주세요.");
    const d = db();
    // 주차는 '저장하는 순간' 기준으로 재계산 — 페이지를 일요일 밤에 열어두고
    // 월요일에 등록하면 화면에 들고 있던 주차가 한 주 늦어 통계가 어긋난다.
    // 개학 전(방학)은 0주차 버킷 — 총권수·마라톤에는 포함되지만 주간 통계(스트릭·
    // 모둠 대항·주간 보상, 전부 1주차부터)를 오염시키지 않는다 (사용자 확정).
    const week =
      todayKST() < SEMESTER_START ? 0 : weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);
    // Firestore는 undefined 값을 거부하므로 isPrivate는 항상 boolean으로 정규화
    const base = { ...form, title: form.title.trim(), isPrivate: form.isPrivate ?? false };

    // ── 임시저장 ──
    if (opts.draft) {
      if (opts.draftId) {
        await setDoc(doc(d, "readingDrafts", opts.draftId), base, { merge: true });
        void qc.invalidateQueries({ queryKey: ["readingDrafts", myId] });
        return opts.draftId;
      }
      const ref = await addDoc(collection(d, "readingDrafts"), {
        studentId: myId,
        week,
        isDraft: true,
        createdAt: Date.now(),
        ...base,
      });
      void qc.invalidateQueries({ queryKey: ["readingDrafts", myId] });
      return ref.id;
    }

    // ── 정식본 수정 (권수 변화 없음, 주차 유지) ──
    if (opts.reportId) {
      await setDoc(doc(d, "readingReports", opts.reportId), base, { merge: true });
      void qc.invalidateQueries({ queryKey: ["readingReports"] });
      return opts.reportId;
    }

    // ── 정식 등록 (신규 또는 초안 승격) → +1 ──
    const ref = await addDoc(collection(d, "readingReports"), {
      studentId: myId,
      week,
      isDraft: false,
      createdAt: Date.now(),
      ...base,
    });
    if (opts.draftId) await deleteDoc(doc(d, "readingDrafts", opts.draftId));

    await setDoc(
      doc(d, "readingStats", "main"),
      { total: { [myId]: increment(1) }, byWeek: { [week]: { [myId]: increment(1) } } },
      { merge: true }
    );
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
    void qc.invalidateQueries({ queryKey: ["readingDrafts", myId] });
    void qc.invalidateQueries({ queryKey: ["readingReports"] });
    return ref.id;
  };
}
