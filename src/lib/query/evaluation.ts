"use client";
// 평가 데이터 접근 — 읽기 예산 설계:
//   학생 1명·1일: 본인 평가 문서 2개 읽기(모둠 내 + 모둠 간) + 저장 시 쓰기만.
//   저장 후에는 캐시만 갱신(재조회 금지). 남의 평가는 절대 읽지 않는다(집계가 대신함).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, doc, documentId, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students } from "@/lib/roster";
import type { PeerEvaluation, DailyScoreRow } from "@/types";

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

/**
 * 모둠원 칭찬 & 건의 — 친구별로(모두가 받을 수 있게) 저장.
 *   _compliments: { targetId: 칭찬글 }  ·  _peerSuggestions: { targetId: 건의글 }
 * 빈 문자열은 집계·리포트에서 '없음'으로 처리(지우기 가능). 추가 읽기 0.
 */
export function useSavePeerNotes(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (
    compliments: Record<string, string>,
    suggestions: Record<string, string>
  ) => {
    if (myId == null) return;
    await setDoc(
      doc(db(), "evaluations", date, "entries", String(myId)),
      { _compliments: compliments, _peerSuggestions: suggestions },
      { merge: true }
    );
    qc.setQueryData(["evaluation", date, myId], (prev: PeerEvaluation | undefined) => {
      const p = (prev ?? {}) as Record<string, unknown>;
      return {
        ...p,
        _compliments: { ...((p._compliments as Record<string, string>) ?? {}), ...compliments },
        _peerSuggestions: {
          ...((p._peerSuggestions as Record<string, string>) ?? {}),
          ...suggestions,
        },
      } as unknown as PeerEvaluation;
    });
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

// 주간/기간 리포트 — 기간 내 일일 집계 문서(최대 7개)를 합산 (교사 전용, 필요할 때만)
export interface RangeReport {
  totals: Record<string, number>; // studentId → 기간 총점
  compliments: number;
  suggestions: number;
  missionAchievements: number; // 모둠 미션 달성 횟수(모둠×일)
  mvpCount: Record<string, number>; // studentId → MVP 횟수
  days: number;
}
export function useRangeReport(start: string, end: string, enabled: boolean) {
  return useQuery({
    queryKey: ["rangeReport", start, end],
    enabled,
    queryFn: async (): Promise<RangeReport> => {
      const snap = await getDocs(
        query(
          collection(db(), "dailyScores"),
          where(documentId(), ">=", start),
          where(documentId(), "<=", end)
        )
      );
      const totals: Record<string, number> = {};
      const mvpCount: Record<string, number> = {};
      let compliments = 0,
        suggestions = 0,
        missionAchievements = 0,
        days = 0;
      snap.forEach((day) => {
        days++;
        const data = day.data();
        for (const s of students) {
          const row = data[String(s.id)] as DailyScoreRow | undefined;
          if (row?.total != null) totals[String(s.id)] = (totals[String(s.id)] ?? 0) + row.total;
        }
        const meta = (data._meta ?? {}) as {
          compliments?: unknown[];
          peerSuggestions?: unknown[];
          missionGroups?: unknown[];
          mvpWinners?: number[];
        };
        compliments += (meta.compliments ?? []).length;
        suggestions += (meta.peerSuggestions ?? []).length;
        missionAchievements += (meta.missionGroups ?? []).length;
        for (const w of meta.mvpWinners ?? []) mvpCount[String(w)] = (mvpCount[String(w)] ?? 0) + 1;
      });
      return { totals, compliments, suggestions, missionAchievements, mvpCount, days };
    },
    staleTime: 5 * 60 * 1000,
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
