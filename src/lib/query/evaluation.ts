"use client";
// 평가 데이터 접근 — 읽기 예산 설계:
//   학생 1명·1일: 본인 평가 문서 2개 읽기(모둠 내 + 모둠 간) + 저장 시 쓰기만.
//   저장 후에는 캐시만 갱신(재조회 금지). 남의 평가는 절대 읽지 않는다(집계가 대신함).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PeerEvaluation } from "@/types";

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

// ── 오늘의 모둠 MVP 투표 + 칭찬 (같은 평가 문서의 "_" 필드에 저장 — 추가 읽기 0) ──
export function useSaveMvp(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (mvpId: number) => {
    if (myId == null) return;
    await setDoc(doc(db(), "evaluations", date, "entries", String(myId)), { _mvp: mvpId }, {
      merge: true,
    });
    qc.setQueryData(["evaluation", date, myId], (prev: PeerEvaluation | undefined) => ({
      ...prev,
      _mvp: mvpId,
    }));
  };
}

export function useSaveCompliment(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (to: number, text: string) => {
    if (myId == null) return;
    if (!text.trim()) throw new Error("칭찬 내용을 적어주세요.");
    const compliment = { to, text: text.trim() };
    await setDoc(
      doc(db(), "evaluations", date, "entries", String(myId)),
      { _compliment: compliment },
      { merge: true }
    );
    qc.setQueryData(["evaluation", date, myId], (prev: PeerEvaluation | undefined) => ({
      ...prev,
      _compliment: compliment,
    }));
  };
}

/** 선생님에게 바라는 점 — 같은 평가 문서의 _toTeacher 필드 (추가 읽기 0) */
export function useSaveToTeacher(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (text: string) => {
    if (myId == null) return;
    if (!text.trim()) throw new Error("내용을 적어주세요.");
    await setDoc(
      doc(db(), "evaluations", date, "entries", String(myId)),
      { _toTeacher: text.trim() },
      { merge: true }
    );
    qc.setQueryData(["evaluation", date, myId], (prev: PeerEvaluation | undefined) => ({
      ...prev,
      _toTeacher: text.trim(),
    }));
  };
}

// (모둠 간 평가 폐지 — 순위 점수는 교사 '오늘의 모둠'으로 대체. 관련 훅 제거)

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
