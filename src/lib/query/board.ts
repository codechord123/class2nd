"use client";
// 건의 게시판 + 투표 게시판 (1학기 실시간 전체구독 → 최근 N개 1회 로드로 교정).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── 건의 게시판 ─────────────────────────────────────────────────
export interface Suggestion {
  id: string;
  studentId: number;
  content: string;
  isAnonymous: boolean;
  createdAt: number;
}

const PAGE = 10;

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
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Suggestion, "id">) }));
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
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
      createdAt: Date.now(),
    });
    void qc.invalidateQueries({ queryKey: ["suggestions"] });
  };
}

export function useDeleteSuggestion() {
  const qc = useQueryClient();
  return async (id: string) => {
    await deleteDoc(doc(db(), "suggestions", id));
    void qc.invalidateQueries({ queryKey: ["suggestions"] });
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
    // 캐시 내 해당 투표만 갱신 (재조회 없음)
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
