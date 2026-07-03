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

// ── 투표 게시판 ─────────────────────────────────────────────────
export interface Poll {
  id: string;
  title: string;
  options: string[];
  votes: Record<string, number>; // studentId → 선택지 index
  createdBy: number | "teacher";
  createdAt: number;
  closed?: boolean;
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
  return async (title: string, options: string[]) => {
    if (creator == null) throw new Error("로그인이 필요해요.");
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!title.trim() || opts.length < 2) throw new Error("제목과 선택지 2개 이상이 필요해요.");
    await addDoc(collection(db(), "polls"), {
      title: title.trim(),
      options: opts,
      votes: {},
      createdBy: creator,
      createdAt: Date.now(),
    });
    void qc.invalidateQueries({ queryKey: ["polls"] });
  };
}

export function useVote(myId: number | null) {
  const qc = useQueryClient();
  return async (pollId: string, optionIdx: number) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    await setDoc(
      doc(db(), "polls", pollId),
      { votes: { [myId]: optionIdx } },
      { merge: true }
    );
    qc.setQueriesData({ queryKey: ["polls"] }, (prev: Poll[] | undefined) =>
      prev?.map((p) =>
        p.id === pollId ? { ...p, votes: { ...p.votes, [myId]: optionIdx } } : p
      )
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
