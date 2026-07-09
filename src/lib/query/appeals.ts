"use client";
// 점수 이의제기 — scoreAppeals/{id}. 학생이 받은 부서장 평가가 부당하면 사유를 적어 제출하고,
// 교사가 검토해 조정(addBonus)하거나 반려한다. 실명·기준이 함께 보이므로 근거 없는 깎기는 걸린다.
// 읽기 예산: 학생은 본인 것만(where studentId==me), 교사는 pending 전체(옵트인 조회).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ScoreAppeal {
  id: string;
  studentId: number;
  date: string; // 이의제기 대상 집계일
  from?: number; // 문제 삼는 평가자 (부서장 평가일 때)
  dept?: string; // 그 평가자의 부서
  reason: string;
  status: "pending" | "resolved" | "rejected";
  teacherNote?: string;
  delta?: number; // 조정한 점수 (resolved 시)
  createdAt: number;
}

export function useCreateAppeal(myId: number | null) {
  const qc = useQueryClient();
  return async (input: { date: string; from?: number; dept?: string; reason: string }) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!input.reason.trim()) throw new Error("이의제기 사유를 적어주세요.");
    try {
      await addDoc(collection(db(), "scoreAppeals"), {
        studentId: myId,
        date: input.date,
        ...(input.from != null ? { from: input.from } : {}),
        ...(input.dept ? { dept: input.dept } : {}),
        reason: input.reason.trim(),
        status: "pending",
        createdAt: Date.now(),
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "permission-denied")
        throw new Error("아직 준비 중인 기능이에요 — 선생님께 알려주세요! 🙂");
      throw e;
    }
    void qc.invalidateQueries({ queryKey: ["appeals"] });
  };
}

/** 학생용 — 내가 낸 이의제기 */
export function useMyAppeals(myId: number | null) {
  return useQuery({
    queryKey: ["appeals", "mine", myId],
    enabled: myId != null,
    queryFn: async (): Promise<ScoreAppeal[]> => {
      const snap = await getDocs(
        query(collection(db(), "scoreAppeals"), where("studentId", "==", myId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ScoreAppeal, "id">) }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 3 * 60 * 1000,
  });
}

/** 교사용 — 전체 이의제기 (최신순) */
export function useAllAppeals(enabled: boolean) {
  return useQuery({
    queryKey: ["appeals", "all"],
    enabled,
    queryFn: async (): Promise<ScoreAppeal[]> => {
      const snap = await getDocs(
        query(collection(db(), "scoreAppeals"), orderBy("createdAt", "desc"))
      );
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScoreAppeal, "id">) }));
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useResolveAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: "resolved" | "rejected";
      teacherNote: string;
      delta?: number;
    }) => {
      await updateDoc(doc(db(), "scoreAppeals", input.id), {
        status: input.status,
        teacherNote: input.teacherNote.trim(),
        ...(input.delta != null ? { delta: input.delta } : {}),
        resolvedAt: Date.now(),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["appeals"] }),
  });
}
