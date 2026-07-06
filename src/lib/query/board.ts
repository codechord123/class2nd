"use client";
// 건의 게시판(댓글·답글·공지) + 투표 게시판 (1학기 전체 실시간 구독 → 1회 로드로 교정).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
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

// 안건 상태 — 아이들이 안건을 내고 토론 → 교사가 결정 표시
export type AgendaStatus = "논의중" | "채택" | "보류";
export const AGENDA_STATUS: AgendaStatus[] = ["논의중", "채택", "보류"];

export interface Suggestion {
  id: string;
  studentId: number | "teacher"; // 교사가 쓴 글은 "teacher"
  title?: string; // 커뮤니티 게시판형 제목 (구버전 글은 없음)
  content: string;
  isAnonymous: boolean; // (구버전 글 표시 호환용 — 새 글에서는 항상 false)
  teacherOnly?: boolean; // 🔒 선생님만 보기 — 작성자 본인과 교사에게만 노출
  isAnnouncement?: boolean; // 공지 고정 (교사)
  status?: AgendaStatus; // 안건 상태 (기본 논의중)
  kind?: "law"; // "law" = 법률 제안 (없으면 일반 안건)
  lawDept?: string; // 법률 제안의 담당 부서 (ROLE_INFO.dept) — 채택 시 기본 선택
  enactedAsLaw?: boolean; // 채택 후 학급 법률로 등록됨
  agree?: Record<string, boolean>; // studentId → 찬성
  disagree?: Record<string, boolean>; // studentId → 반대
  comments?: BoardComment[];
  createdAt: number;
}

/** 찬성/반대 집계 */
export function reactionCounts(s: Suggestion): { up: number; down: number } {
  return {
    up: Object.values(s.agree ?? {}).filter(Boolean).length,
    down: Object.values(s.disagree ?? {}).filter(Boolean).length,
  };
}

const PAGE = 10;

function toSuggestion(d: { id: string; data: () => unknown }): Suggestion {
  return { id: d.id, ...(d.data() as Omit<Suggestion, "id">) };
}

export function useSuggestions(count: number) {
  return useQuery({
    queryKey: ["suggestions", count],
    queryFn: async (): Promise<Suggestion[]> => {
      const q = query(
        collection(db(), "suggestions"),
        orderBy("createdAt", "desc"),
        limit(count)
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

export function usePostSuggestion(myId: number | "teacher" | null) {
  const qc = useQueryClient();
  return async (
    title: string,
    content: string,
    teacherOnly: boolean, // 🔒 선생님만 보기 (익명 기능 대체 — 사용자 확정)
    isAnnouncement = false, // 교사 전용 — 쓰면서 바로 공지로 고정
    law?: { dept: string } // 법률 제안 — 담당 부서 지정 (채택 시 그 부서로 등록)
  ) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!title.trim()) throw new Error("제목을 입력해주세요.");
    if (!content.trim()) throw new Error("내용을 입력해주세요.");
    await addDoc(collection(db(), "suggestions"), {
      studentId: myId,
      title: title.trim(),
      content: content.trim(),
      isAnonymous: false,
      teacherOnly,
      ...(isAnnouncement ? { isAnnouncement: true } : {}),
      ...(law ? { kind: "law", lawDept: law.dept } : {}),
      comments: [],
      createdAt: Date.now(),
    });
    void qc.invalidateQueries({ queryKey: ["suggestions"] });
    if (isAnnouncement) void qc.invalidateQueries({ queryKey: ["announcements"] });
  };
}

/** 제목 표시용 — 구버전(제목 없는) 글은 본문 앞부분으로 대체 */
export function titleOf(s: Suggestion): string {
  return s.title?.trim() || s.content.slice(0, 30) + (s.content.length > 30 ? "…" : "");
}

export function useAddComment(author: number | "teacher" | null) {
  const qc = useQueryClient();
  return async (sugId: string, text: string, replyTo?: number) => {
    if (author == null) throw new Error("로그인이 필요해요.");
    if (!text.trim()) throw new Error("내용을 입력해주세요.");
    const comment: BoardComment = {
      // 같은 밀리초에 두 명이 달면 id가 겹쳐 삭제·답글이 꼬인다 — 무작위 하위 자릿수로 유일화
      id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
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

/**
 * 댓글 삭제 — 교사 또는 본인. arrayRemove(원자적)로 해당 댓글+답글만 제거:
 * 배열 전체 재기록이면 낡은 캐시로 남의 새 댓글을 지워버리는 동시성 꼬임이 생긴다.
 */
export function useDeleteComment() {
  const qc = useQueryClient();
  return async (sug: Suggestion, commentId: number) => {
    const toRemove = (sug.comments ?? []).filter(
      (c) => c.id === commentId || c.replyTo === commentId // 답글도 함께 삭제
    );
    if (!toRemove.length) return;
    await updateDoc(doc(db(), "suggestions", sug.id), { comments: arrayRemove(...toRemove) });
    const removed = new Set(toRemove.map((c) => c.id));
    const patch = (prev: Suggestion[] | undefined) =>
      prev?.map((s) =>
        s.id === sug.id
          ? { ...s, comments: (s.comments ?? []).filter((c) => !removed.has(c.id)) }
          : s
      );
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

/** 본인 글 수정 (제목·내용) */
export function useUpdateSuggestion() {
  const qc = useQueryClient();
  return async (id: string, title: string, content: string) => {
    if (!title.trim()) throw new Error("제목을 입력해주세요.");
    if (!content.trim()) throw new Error("내용을 입력해주세요.");
    await updateDoc(doc(db(), "suggestions", id), {
      title: title.trim(),
      content: content.trim(),
    });
    const patch = (prev: Suggestion[] | undefined) =>
      prev?.map((s) =>
        s.id === id ? { ...s, title: title.trim(), content: content.trim() } : s
      );
    qc.setQueriesData({ queryKey: ["suggestions"] }, patch);
    qc.setQueriesData({ queryKey: ["announcements"] }, patch);
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

/** 찬성/반대 토글 — 같은 것 다시 누르면 취소, 반대편은 해제 (상호배타) */
export function useReactSuggestion(myId: number | null) {
  const qc = useQueryClient();
  return async (sug: Suggestion, kind: "agree" | "disagree") => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    const sid = String(myId);
    const other = kind === "agree" ? "disagree" : "agree";
    const mine = Boolean((sug[kind] ?? {})[sid]);
    await updateDoc(doc(db(), "suggestions", sug.id), {
      [`${kind}.${sid}`]: mine ? deleteField() : true,
      [`${other}.${sid}`]: deleteField(),
    });
    const patch = (prev: Suggestion[] | undefined) =>
      prev?.map((s) => {
        if (s.id !== sug.id) return s;
        const agree = { ...(s.agree ?? {}) };
        const disagree = { ...(s.disagree ?? {}) };
        const mymap = kind === "agree" ? agree : disagree;
        const othermap = kind === "agree" ? disagree : agree;
        if (mine) delete mymap[sid];
        else mymap[sid] = true;
        delete othermap[sid];
        return { ...s, agree, disagree };
      });
    qc.setQueriesData({ queryKey: ["suggestions"] }, patch);
    qc.setQueriesData({ queryKey: ["announcements"] }, patch);
  };
}

/**
 * 교사: 채택된 안건을 학급 법률로 등록 — 자치 루프의 마지막 고리
 * (안건 제안 → 토론·찬반 → 채택 → 법률). 헌법 문서 laws 배열에 추가하고
 * 안건에 enactedAsLaw 표시. 반환값은 새 법률의 조 번호.
 */
export function useEnactLaw() {
  const qc = useQueryClient();
  // dept: 담당 부서(ROLE_INFO.dept) — 법률은 부서별로 관리한다 (사용자 확정)
  return async (sug: Suggestion, dept: string): Promise<number> => {
    const ref = doc(db(), "classData", "constitution");
    const snap = await getDoc(ref);
    const c = (snap.exists() ? snap.data() : {}) as {
      lawsByDept?: Record<string, string[]>;
    };
    const laws = [...(c.lawsByDept?.[dept] ?? []), titleOf(sug)];
    // merge: lawsByDept의 해당 부서 키만 깊은 병합 — 다른 부서·미분류(laws)는 보존
    await setDoc(ref, { lawsByDept: { [dept]: laws } }, { merge: true });
    await updateDoc(doc(db(), "suggestions", sug.id), { enactedAsLaw: true });
    const patch = (prev: Suggestion[] | undefined) =>
      prev?.map((s) => (s.id === sug.id ? { ...s, enactedAsLaw: true } : s));
    qc.setQueriesData({ queryKey: ["suggestions"] }, patch);
    qc.setQueriesData({ queryKey: ["announcements"] }, patch);
    void qc.invalidateQueries({ queryKey: ["constitution"] });
    return laws.length;
  };
}

/** 교사: 안건 상태 변경 (논의중/채택/보류) */
export function useSetAgendaStatus() {
  const qc = useQueryClient();
  return async (sug: Suggestion, status: AgendaStatus) => {
    await updateDoc(doc(db(), "suggestions", sug.id), { status });
    const patch = (prev: Suggestion[] | undefined) =>
      prev?.map((s) => (s.id === sug.id ? { ...s, status } : s));
    qc.setQueriesData({ queryKey: ["suggestions"] }, patch);
    qc.setQueriesData({ queryKey: ["announcements"] }, patch);
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

/** 작성자: 투표 제목·설명 수정 (선택지·표는 그대로 — 공정성 유지) */
export function useUpdatePoll() {
  const qc = useQueryClient();
  return async (id: string, title: string, desc: string) => {
    if (!title.trim()) throw new Error("제목을 입력해주세요.");
    await updateDoc(doc(db(), "polls", id), { title: title.trim(), desc: desc.trim() });
    qc.setQueriesData({ queryKey: ["polls"] }, (prev: Poll[] | undefined) =>
      prev?.map((p) => (p.id === id ? { ...p, title: title.trim(), desc: desc.trim() } : p))
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
