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
  reason?: string; // 이 책을 고른 이유
  characters?: string; // 등장인물 소개
  recommend?: string; // 누구에게 추천할까?
  freeText?: string; // 자유롭게 쓰기 (자유 작성 모드)
  // 복붙·AI 의심 신호 (작성 순간에만 기록 — 소급 불가). 선생님만 참고.
  pastedChars?: number; // 외부에서 붙여넣은 총 글자 수 (자기 글 복사 제외 — 인용 칸도 제외)
  pasteCount?: number; // 외부 붙여넣기 횟수
  selfPastedChars?: number; // 자기 글에서 복사해 붙인 글자 수 (분량 채우기 — 표절과 구분)
  selfPasteCount?: number; // 자기 글 복사 횟수
  writeMs?: number; // 시트를 연 뒤 정식 등록까지 걸린 시간(ms)
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
> & {
  tags: string[];
  isPrivate?: boolean;
  authorIntent?: string;
  connect?: string;
  reason?: string;
  characters?: string;
  recommend?: string;
  freeText?: string;
};

/** 감상 본문 항목 키 — 폼 체크리스트·글자수·표시가 모두 이 목록을 공유한다 */
export const BODY_KEYS = [
  "reason", "summary", "characters", "scene", "quote", "thoughts", "authorIntent", "connect", "recommend", "freeText",
] as const;
export type BodyKey = (typeof BODY_KEYS)[number];

/** 정식 등록 최소 글자수 검사 대상 — 모든 감상 항목의 합 (자유 작성 포함) */
export function reportBodyLength(f: ReportForm): number {
  return BODY_KEYS.reduce((a, k) => a + ((f as unknown as Record<string, string | undefined>)[k] ?? "").length, 0);
}

/** 복붙·속성 작성 의심 신호 (선생님만 참고) — 붙여넣기 비율·작성 속도.
 *  paste/fast 신호 계산은 이 함수 하나에 모아 임계값을 한곳에서 관리한다. */
export function reportSuspicion(r: ReadingReport2): { paste: boolean; fast: boolean; measured: boolean } {
  const bodyLen = BODY_KEYS.reduce(
    (a, k) => a + ((r as unknown as Record<string, string | undefined>)[k] ?? "").length,
    0
  );
  const measured = r.pastedChars != null || r.writeMs != null; // 배포 후 작성분만 신호 있음
  const pasted = r.pastedChars ?? 0;
  // 붙여넣기: 감상 본문의 40% 이상을 붙였고, 그 양이 30자 이상
  const paste = pasted >= 30 && bodyLen > 0 && pasted >= bodyLen * 0.4;
  // 속성 작성: 200자 이상을 글자당 0.12초보다 빠르게 (700자면 84초 미만 — 타이핑으로 불가)
  const fast = bodyLen >= 200 && (r.writeMs ?? Infinity) < bodyLen * 120;
  return { paste, fast, measured };
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

/** 오늘 내가 정식 등록한 감상문 수 — 홈 '오늘 할 일' 완주 판정용 (집계 전에도 라이브).
 *  createdAt 단일 범위 쿼리(집계와 동일 패턴 — 복합 인덱스 불요), 오늘의 반 글은 소량.
 *  내 것·정식본만 클라이언트 필터. 완주 보너스(aggregate readCount>0)와 정확히 같은 기준. */
export function useMyTodayReadCount(myId: number | null) {
  return useQuery({
    queryKey: ["myTodayReadCount", myId, todayKST()],
    enabled: myId != null,
    queryFn: async (): Promise<number> => {
      const start = new Date(todayKST() + "T00:00:00+09:00").getTime();
      const q = query(
        collection(db(), "readingReports"),
        where("createdAt", ">=", start),
        where("createdAt", "<", start + 86400000)
      );
      const snap = await getDocs(q);
      let n = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.studentId === myId && !d.isDraft) n++;
      });
      return n;
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 검색·태그 필터용 전체 감상문 — 최근 N건 창(페이지)만으로는 옛 글이 검색에서 새는 버그가
 *  있었다(실사례: 같은 날 두 번째 글이 검색에 안 잡힘). 필터를 쓰는 순간에만 넓게 1회 로드
 *  (limit 1000·10분 캐시) — 평소 목록은 여전히 최근 N건만 읽는다 (읽기 예산). */
export function useSearchReports(enabled: boolean) {
  return useQuery({
    queryKey: ["readingReports", "searchAll"],
    enabled,
    queryFn: async (): Promise<ReadingReport2[]> => {
      const q = query(collection(db(), "readingReports"), orderBy("createdAt", "desc"), limit(1000));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReadingReport2, "id">) }));
    },
    staleTime: 10 * 60 * 1000,
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
    void qc.invalidateQueries({ queryKey: ["myTodayReadCount"] }); // 홈 완주 카운트 라이브 반영
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
      // 복붙·속성 작성 신호 — 선생님 참고용. writeMs는 '전체 작성 시간'이 의미 있을 때만 기록
      // (감지 기능 적용 전 정식본을 잠깐 수정하는 경우 짧은 수정 시간을 넣으면 오탐되므로 생략).
      detect?: {
        pastedChars: number;
        pasteCount: number;
        selfPastedChars: number;
        selfPasteCount: number;
        writeMs?: number;
      };
    }
  ): Promise<string> => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!form.title.trim()) throw new Error("책 제목을 입력해주세요.");
    const d = db();
    // Firestore는 undefined를 거부하므로 writeMs는 값이 있을 때만 포함한다.
    const detect = opts.detect
      ? {
          pastedChars: opts.detect.pastedChars,
          pasteCount: opts.detect.pasteCount,
          selfPastedChars: opts.detect.selfPastedChars,
          selfPasteCount: opts.detect.selfPasteCount,
          ...(opts.detect.writeMs != null ? { writeMs: opts.detect.writeMs } : {}),
        }
      : {};
    // 주차는 '저장하는 순간' 기준으로 재계산 — 페이지를 일요일 밤에 열어두고
    // 월요일에 등록하면 화면에 들고 있던 주차가 한 주 늦어 통계가 어긋난다.
    // 개학 전(방학)은 0주차 버킷 — 총권수·마라톤에는 포함되지만 주간 통계(스트릭·
    // 모둠 대항·주간 보상, 전부 1주차부터)를 오염시키지 않는다 (사용자 확정).
    const week =
      todayKST() < SEMESTER_START ? 0 : weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);
    // Firestore는 undefined 값을 거부하므로 isPrivate는 항상 boolean으로 정규화
    const base = { ...form, title: form.title.trim(), isPrivate: form.isPrivate ?? false };

    // ── 임시저장 ── (복붙·작성 신호도 함께 저장 → 다음 세션이 이어받아 누적)
    if (opts.draft) {
      if (opts.draftId) {
        await setDoc(doc(d, "readingDrafts", opts.draftId), { ...base, ...detect }, { merge: true });
        void qc.invalidateQueries({ queryKey: ["readingDrafts", myId] });
        return opts.draftId;
      }
      const ref = await addDoc(collection(d, "readingDrafts"), {
        studentId: myId,
        week,
        isDraft: true,
        createdAt: Date.now(),
        ...base,
        ...detect,
      });
      void qc.invalidateQueries({ queryKey: ["readingDrafts", myId] });
      return ref.id;
    }

    // ── 정식본 수정 (권수 변화 없음, 주차 유지) ──
    if (opts.reportId) {
      await setDoc(doc(d, "readingReports", opts.reportId), { ...base, ...detect }, { merge: true });
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
      ...detect,
    });
    if (opts.draftId) await deleteDoc(doc(d, "readingDrafts", opts.draftId));

    // 교사 저자(id 0)의 글은 학생 권수·마라톤 통계에 넣지 않는다 (예시·모델용)
    if (myId > 0) {
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
    }
    void qc.invalidateQueries({ queryKey: ["readingDrafts", myId] });
    void qc.invalidateQueries({ queryKey: ["readingReports"] });
    void qc.invalidateQueries({ queryKey: ["myTodayReadCount"] }); // 홈 '오늘 할 일' 독서 완주 라이브 반영
    return ref.id;
  };
}
