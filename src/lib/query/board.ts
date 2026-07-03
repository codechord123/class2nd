"use client";
// 건의 게시판(댓글·답글·공지) + 투표 게시판 (1학기 전체 실시간 구독 → 1회 로드로 교정).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── 건의 게시판 ─────────────────────────────────────────────────
export interface BoardComment {
  id: number; // Date.now()
  studentId: number | "teacher";
  text: string;
  replyTo?: number; // 부모 댓글 id (답글)
  createdAt: number;
}

export interface Suggestion {
  id: string;
  studentId: number;
  content: string;
  isAnonymous: boolean;
  isAnnouncement?: boolean; // 공지 고정 (교사)
  comments?: BoardComment[];
  createdAt: number;
}

const PAGE = 10;

function toSuggestion(d: { id: string; data: () => unknown }): Suggestion {
  return { id: d.id, ...(d.data() as Omit<Suggestion, "id">) };
}

export function useSuggestions(pages: number) {
  return useQuery({
    queryKey: ["suggestions", pages],
    queryFn: async (): Promise<Suggestion[]> => {
      const q = query(
        collection(db(), "suggestions"),
        orderBy("createdAt", "desc"),
        limit(PAGE * pages)
      );
      const snap = await getDocs(q);
      return snap.docs.map(toSuggestion);
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** 공지는 별도 소량 쿼리 — 오래된 공지가 페이지 밖으로 밀려도 항상 상단 고정 */
export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async (): Promise<Suggestion[]> => {
      const q = query(collection(db(), "suggestions"), where("isAnnouncement", "==", true));
      const snap = await getDocs(q);
      return snap.docs.map(toSuggestion).sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function usePostSuggestion(myId: number | null) {
  const qc = useQueryClient();
  return async (content: string, isAnonymous: boolean) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!content.trim()) throw new Error("내용을 입력해주세요.");
    await addDoc(collection(db(), "suggestions"), {
      studentId: myId,
      content: content.trim(),
      isAnonymous,
      comments: [],
      createdAt: Date.now(),
    });
    void qc.invalidateQueries({ queryKey: ["suggestions"] });
  };
}

export function useAddComment(author: number | "teacher" | null) {
  const qc = useQueryClient();
  return async (sugId: string, text: string, replyTo?: number) => {
    if (author == null) throw new Error("로그인이 필요해요.");
    if (!text.trim()) throw new Error("내용을 입력해주세요.");
    const comment: BoardComment = {
      id: Date.now(),
      studentId: author,
      text: text.trim(),
      ...(replyTo != null ? { replyTo } : {}),
      createdAt: Date.now(),
    };
    await updateDoc(doc(db(), "suggestions", sugId), { comments: arrayUnion(comment) });
    // 캐시 직접 갱신 — 재조회 없음
    const patch = (prev: Suggestion[] | undefined) =>
      prev?.map((s) =>
        s.id === sugId ? { ...s, comments: [...(s.comments ?? []), comment] } : s
      );
    qc.setQueriesData({ queryKey: ["suggestions"] }, patch);
    qc.setQueriesData({ queryKey: ["announcements"] }, patch);
  };
}

/** 댓글 삭제 — 교사 또는 본인 (배열 재기록) */
export function useDeleteComment() {
  const qc = useQueryClient();
  return async (sug: Suggestion, commentId: number) => {
    const next = (sug.comments ?? []).filter(
      (c) => c.id !== commentId && c.replyTo !== commentId // 답글도 함께 삭제
    );
    await updateDoc(doc(db(), "suggestions", sug.id), { comments: next });
    const patch = (prev: Suggestion[] | undefined) =>
      prev?.map((s) => (s.id === sug.id ? { ...s, comments: next } : s));
    qc.setQueriesData({ queryKey: ["suggestions"] }, patch);
    qc.setQueriesData({ queryKey: ["announcements"] }, patch);
  };
}

/** 공지 등록/내리기 (교사) */
export function useToggleAnnouncement() {
  const qc = useQueryClient();
  return async (sug: Suggestion) => {
    await updateDoc(doc(db(), "suggestions", sug.id), { isAnnouncement: !sug.isAnnouncement });
    void qc.invalidateQueries({ queryKey: ["suggestions"] });
    void qc.invalidateQueries({ queryKey: ["announcements"] });
  };
}

export function useDeleteSuggestion() {
  const qc = useQueryClient();
  return async (id: string) => {
    await deleteDoc(doc(db(), "suggestions", id));
    void qc.invalidateQueries({ queryKey: ["suggestions"] });
    void qc.invalidateQueries({ queryKey: ["announcements"] });
  };
}

// ── 투표 게시판 (v2: 설명·복수선택·익명·마감) ───────────────────
export interface Poll {
  id: string;
  title: string;
  desc?: string;
  options: string[];
  /** studentId → 선택 index 배열 (구버전 number도 호환) */
  votes: Record<string, number[] | number>;
  multi?: boolean; // 복수 선택 허용
  anonymous?: boolean; // 익명 투표 (투표자 이름 숨김)
  deadline?: number; // 마감 시각(ms) — 지나면 투표 불가
  closed?: boolean; // 교사 수동 마감
  createdBy: number | "teacher";
  createdAt: number;
}

/** 구버전(number) 투표값 호환 정규화 */
export function votesOf(p: Poll, sid: string): number[] {
  const v = p.votes?.[sid];
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function isPollClosed(p: Poll): boolean {
  return Boolean(p.closed) || (p.deadline != null && Date.now() > p.deadline);
}

export function usePolls(pages: number) {
  return useQuery({
    queryKey: ["polls", pages],
    queryFn: async (): Promise<Poll[]> => {
      const q = query(
        collection(db(), "polls"),
        orderBy("createdAt", "desc"),
        limit(PAGE * pages)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Poll, "id">) }));
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useCreatePoll(creator: number | "teacher" | null) {
  const qc = useQueryClient();
  return async (input: {
    title: string;
    desc?: string;
    options: string[];
    multi: boolean;
    anonymous: boolean;
    deadline?: number;
  }) => {
    if (creator == null) throw new Error("로그인이 필요해요.");
    const opts = input.options.map((o) => o.trim()).filter(Boolean);
    if (!input.title.trim() || opts.length < 2) throw new Error("제목과 선택지 2개 이상이 필요해요.");
    await addDoc(collection(db(), "polls"), {
      title: input.title.trim(),
      ...(input.desc?.trim() ? { desc: input.desc.trim() } : {}),
      options: opts,
      votes: {},
      multi: input.multi,
      anonymous: input.anonymous,
      ...(input.deadline ? { deadline: input.deadline } : {}),
      createdBy: creator,
      createdAt: Date.now(),
    });
    void qc.invalidateQueries({ queryKey: ["polls"] });
  };
}

/** 투표/토글: 단일 선택은 교체, 복수 선택은 켜고 끄기 */
export function useVote(myId: number | null) {
  const qc = useQueryClient();
  return async (poll: Poll, optionIdx: number) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (isPollClosed(poll)) throw new Error("마감된 투표예요.");
    const cur = votesOf(poll, String(myId));
    let next: number[];
    if (poll.multi) {
      next = cur.includes(optionIdx) ? cur.filter((i) => i !== optionIdx) : [...cur, optionIdx];
    } else {
      next = cur.includes(optionIdx) ? [] : [optionIdx]; // 같은 것 다시 누르면 취소
    }
    await setDoc(doc(db(), "polls", poll.id), { votes: { [myId]: next } }, { merge: true });
    qc.setQueriesData({ queryKey: ["polls"] }, (prev: Poll[] | undefined) =>
      prev?.map((p) =>
        p.id === poll.id ? { ...p, votes: { ...p.votes, [myId]: next } } : p
      )
    );
  };
}

/** 교사: 투표 마감/재개 */
export function useClosePoll() {
  const qc = useQueryClient();
  return async (poll: Poll) => {
    await setDoc(doc(db(), "polls", poll.id), { closed: !poll.closed }, { merge: true });
    qc.setQueriesData({ queryKey: ["polls"] }, (prev: Poll[] | undefined) =>
      prev?.map((p) => (p.id === poll.id ? { ...p, closed: !poll.closed } : p))
    );
  };
}

export function useDeletePoll() {
  const qc = useQueryClient();
  return async (id: string) => {
    await deleteDoc(doc(db(), "polls", id));
    void qc.invalidateQueries({ queryKey: ["polls"] });
  };
}
