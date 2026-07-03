"use client";
// 평가 데이터 접근 — 읽기 예산 설계:
//   학생 1명·1일: 본인 평가 문서 2개 읽기(모둠 내 + 모둠 간) + 저장 시 쓰기만.
//   저장 후에는 캐시만 갱신(재조회 금지). 남의 평가는 절대 읽지 않는다(집계가 대신함).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PeerEvaluation, GroupVote } from "@/types";

// ── 모둠 내 평가: evaluations/{date}/entries/{evaluatorId} ──────
export function useMyEvaluation(date: string, myId: number | null) {
  return useQuery({
    queryKey: ["evaluation", date, myId],
    enabled: myId != null,
    queryFn: async (): Promise<PeerEvaluation> => {
      const snap = await getDoc(doc(db(), "evaluations", date, "entries", String(myId)));
      return snap.exists() ? (snap.data() as PeerEvaluation) : {};
    },
    staleTime: Infinity, // 본인이 쓴 데이터 — 캐시로만 갱신
  });
}

export function useSaveEvaluation(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (scores: PeerEvaluation) => {
    if (myId == null) return;
    await setDoc(doc(db(), "evaluations", date, "entries", String(myId)), scores, {
      merge: true,
    });
    qc.setQueryData(["evaluation", date, myId], (prev: PeerEvaluation | undefined) => ({
      ...prev,
      ...scores,
    }));
  };
}

// ── 모둠 간 평가: groupVotes/{date}/entries/{evaluatorId} ───────
export function useMyGroupVotes(date: string, myId: number | null) {
  return useQuery({
    queryKey: ["groupVotes", date, myId],
    enabled: myId != null,
    queryFn: async (): Promise<GroupVote> => {
      const snap = await getDoc(doc(db(), "groupVotes", date, "entries", String(myId)));
      return snap.exists() ? (snap.data() as GroupVote) : {};
    },
    staleTime: Infinity,
  });
}

export function useSaveGroupVotes(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (votes: GroupVote) => {
    if (myId == null) return;
    await setDoc(doc(db(), "groupVotes", date, "entries", String(myId)), votes, {
      merge: true,
    });
    qc.setQueryData(["groupVotes", date, myId], (prev: GroupVote | undefined) => ({
      ...prev,
      ...votes,
    }));
  };
}

// ── 집계 결과 조회 (학생·교사 공용) ─────────────────────────────
// dailyScores/{date} 문서 하나에 전원 점수 — 1일 1문서 읽기.
export function useDailyScores(date: string) {
  return useQuery({
    queryKey: ["dailyScores", date],
    queryFn: async () => {
      const snap = await getDoc(doc(db(), "dailyScores", date));
      return snap.exists() ? snap.data() : null;
    },
    staleTime: 10 * 60 * 1000,
  });
}

// 누적 점수: dailyScores/_cumulative 문서 하나 (집계 시 함께 갱신)
export function useCumulativeScores() {
  return useQuery({
    queryKey: ["cumulativeScores"],
    queryFn: async () => {
      const snap = await getDoc(doc(db(), "dailyScores", "_cumulative"));
      return snap.exists() ? snap.data() : null;
    },
    staleTime: 10 * 60 * 1000,
  });
}
