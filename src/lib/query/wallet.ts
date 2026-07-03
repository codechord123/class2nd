"use client";
// 지갑/상점 — 두 지갑을 완전 격리 (요구사항 §D):
//   · 2학기 실버: coinTxns 원장 + coinTxns/0_balances 잔액 문서(교사만 갱신)
//   · 1학기 이월: 정적 JSON(불변) - s1Spends/0_balances 사용량 문서(교사만 갱신)
// 학생 구매는 "신청 → 교사 승인" 흐름 (1학기와 동일).
// 잔액 표시는 문서 1개 읽기, 신청 목록은 studentId/status 단일 조건 쿼리.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type WalletKind = "s2" | "s1"; // 2학기 실버 | 1학기 이월

export interface SpendRequest {
  id: string;
  studentId: number;
  amount: number;
  item: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  type?: string;
}

const COLL: Record<WalletKind, string> = { s2: "coinTxns", s1: "s1Spends" };

/** 잔액/사용량 문서 — 컬렉션당 1개 (교사만 갱신, 전원 조회 가능) */
export function useBalances(kind: WalletKind) {
  return useQuery({
    queryKey: ["balances", kind],
    queryFn: async (): Promise<Record<string, number>> => {
      const snap = await getDoc(doc(db(), COLL[kind], "0_balances"));
      return snap.exists() ? (snap.data() as Record<string, number>) : {};
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useMyRequests(kind: WalletKind, myId: number | null) {
  return useQuery({
    queryKey: ["spendRequests", kind, myId],
    enabled: myId != null,
    queryFn: async (): Promise<SpendRequest[]> => {
      const q = query(collection(db(), COLL[kind]), where("studentId", "==", myId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SpendRequest, "id">) }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSpendRequest(kind: WalletKind, myId: number | null) {
  const qc = useQueryClient();
  return async (amount: number, item: string, type: "spend" | "gold" = "spend") => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!item.trim()) throw new Error("사고 싶은 것을 적어주세요.");
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("개수를 확인해주세요.");
    await addDoc(collection(db(), COLL[kind]), {
      studentId: myId,
      amount,
      item: item.trim(),
      type,
      status: "pending",
      createdAt: Date.now(),
    });
    void qc.invalidateQueries({ queryKey: ["spendRequests", kind, myId] });
  };
}

// ── 교사 전용 ────────────────────────────────────────────────────
export function usePendingRequests(kind: WalletKind, enabled: boolean) {
  return useQuery({
    queryKey: ["pendingRequests", kind],
    enabled,
    queryFn: async (): Promise<SpendRequest[]> => {
      const q = query(collection(db(), COLL[kind]), where("status", "==", "pending"));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SpendRequest, "id">) }))
        .sort((a, b) => a.createdAt - b.createdAt); // 선착순
    },
    staleTime: 60 * 1000,
  });
}

/** 승인: 상태 갱신 + 잔액 문서 반영 (s2는 차감, s1은 사용량 가산) */
export function useDecideRequest(kind: WalletKind) {
  const qc = useQueryClient();
  return async (req: SpendRequest, approve: boolean) => {
    const d = db();
    await updateDoc(doc(d, COLL[kind], req.id), {
      status: approve ? "approved" : "rejected",
      decidedAt: Date.now(),
    });
    if (approve) {
      if (req.type === "gold") {
        // 학급 골드토큰(공용) 사용 — classGoldUsed에 가산
        await setDoc(
          doc(d, COLL[kind], "0_balances"),
          { classGoldUsed: increment(req.amount) },
          { merge: true }
        );
      } else {
        const delta = kind === "s2" ? -req.amount : req.amount; // s1은 "사용량"이라 +
        await setDoc(
          doc(d, COLL[kind], "0_balances"),
          { [req.studentId]: increment(delta) },
          { merge: true }
        );
      }
    }
    void qc.invalidateQueries({ queryKey: ["pendingRequests", kind] });
    void qc.invalidateQueries({ queryKey: ["balances", kind] });
  };
}

/** 교사 수동 지급(적립): 원장 기록 + 잔액 증가 (2학기 실버 전용) */
export function useGrantSilver() {
  const qc = useQueryClient();
  return async (studentId: number, amount: number, note: string) => {
    const d = db();
    await addDoc(collection(d, "coinTxns"), {
      studentId,
      amount,
      item: note || "교사 지급",
      type: "earn",
      status: "approved",
      createdAt: Date.now(),
    });
    await setDoc(
      doc(d, "coinTxns", "0_balances"),
      { [studentId]: increment(amount) },
      { merge: true }
    );
    void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
  };
}
