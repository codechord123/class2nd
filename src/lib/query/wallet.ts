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
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getS1WalletOf } from "@/lib/staticData";
import { classGoldLeft } from "@/lib/gold";

export type WalletKind = "s2" | "s1"; // 2학기 실버 | 1학기 이월

export interface SpendRequest {
  id: string;
  studentId: number;
  amount: number;
  item: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  type?: string;
  reserved?: boolean; // 신청 시간창 밖 '예약 담기'로 접수됨 (승인 흐름은 동일)
}

/** 받은 것(+)/쓴 것(−)은 금액 부호가 아니라 기록 종류로 판단 — 지급 유형만 양수 */
const EARN_TYPES = new Set(["earn", "mvp", "milestone"]);
export function signedAmount(type: string | undefined, amount: number): number {
  return EARN_TYPES.has(type ?? "") ? Math.abs(amount) : -Math.abs(amount);
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
      // 최근 15건만 (읽기 한도 보호 — 21주간 무한 성장 방지)
      const q = query(
        collection(db(), COLL[kind]),
        where("studentId", "==", myId),
        orderBy("createdAt", "desc"),
        limit(15)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SpendRequest, "id">) }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSpendRequest(kind: WalletKind, myId: number | null) {
  const qc = useQueryClient();
  return async (
    amount: number,
    item: string,
    type: "spend" | "gold" = "spend",
    opts?: { reserved?: boolean } // 시간창 밖 예약 담기 — 승인 흐름은 동일, 표시만 구분
  ) => {
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
      reserved: opts?.reserved ?? false,
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

/**
 * 승인/반려 — runTransaction으로 원자 처리 (이중차감·음수잔액 방지):
 *   ① 요청 문서를 다시 읽어 아직 pending일 때만 진행 (더블클릭·낡은 목록 재승인 차단)
 *   ② 승인이면 잔액 문서를 읽어 부족하지 않을 때만 상태 갱신 + 잔액 반영
 * s1 이월·골드도 정적 JSON(silverRemaining·classGold)이 클라이언트에 있으므로
 * 트랜잭션 안에서 상한을 검증한다 — 대기 신청 2건 연속 승인으로 음수가 되는 것 방지.
 */
export function useDecideRequest(kind: WalletKind) {
  const qc = useQueryClient();
  return async (req: SpendRequest, approve: boolean) => {
    const d = db();
    const reqRef = doc(d, COLL[kind], req.id);
    const balRef = doc(d, COLL[kind], "0_balances");

    await runTransaction(d, async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error("신청을 찾을 수 없어요.");
      if (reqSnap.data().status !== "pending") throw new Error("이미 처리된 신청이에요.");

      if (!approve) {
        tx.update(reqRef, { status: "rejected", decidedAt: Date.now() });
        return;
      }

      if (req.type === "gold") {
        const balSnap = await tx.get(balRef);
        const bal = (balSnap.exists() ? balSnap.data() : {}) as Record<string, number>;
        const left = classGoldLeft(bal);
        if (left < req.amount)
          throw new Error(`학급 골드 부족으로 승인할 수 없어요 (남은 ${left}개).`);
        tx.set(balRef, { classGoldUsed: increment(req.amount) }, { merge: true });
      } else if (kind === "s2") {
        const balSnap = await tx.get(balRef);
        const cur = (balSnap.exists() ? (balSnap.data()[String(req.studentId)] as number) : 0) ?? 0;
        if (cur < req.amount) throw new Error(`잔액 부족 (현재 ${cur}개).`);
        tx.set(balRef, { [req.studentId]: increment(-req.amount) }, { merge: true });
      } else {
        // s1 이월: 잔여 = 정적 이월분 − 사용량 — 넘으면 승인 불가
        const balSnap = await tx.get(balRef);
        const used =
          (balSnap.exists() ? (balSnap.data()[String(req.studentId)] as number) : 0) ?? 0;
        const remaining = (getS1WalletOf(req.studentId)?.silverRemaining ?? 0) - used;
        if (remaining < req.amount)
          throw new Error(`이월 실버 부족으로 승인할 수 없어요 (남은 ${remaining}개).`);
        tx.set(balRef, { [req.studentId]: increment(req.amount) }, { merge: true });
      }
      tx.update(reqRef, { status: "approved", decidedAt: Date.now() });
    });

    void qc.invalidateQueries({ queryKey: ["pendingRequests", kind] });
    void qc.invalidateQueries({ queryKey: ["balances", kind] });
  };
}

/** 교사 수동 지급(적립): 여러 명 동시 지급 — 원장 기록(인당 1건) + 잔액 일괄 증가 (2학기 실버) */
export function useGrantSilver() {
  const qc = useQueryClient();
  return async (studentIds: number[], amount: number, note: string) => {
    if (!studentIds.length) throw new Error("지급할 학생을 골라주세요.");
    const d = db();
    await Promise.all(
      studentIds.map((studentId) =>
        addDoc(collection(d, "coinTxns"), {
          studentId,
          amount,
          item: note || "교사 지급",
          type: "earn",
          status: "approved",
          createdAt: Date.now(),
        })
      )
    );
    await setDoc(
      doc(d, "coinTxns", "0_balances"),
      Object.fromEntries(studentIds.map((sid) => [sid, increment(amount)])),
      { merge: true }
    );
    // 교사 수동 지급도 '학급 실버 25개 → 골드 1개' 적립 재료에 포함 (사용자 확정).
    // silverEarned에 누적해 두면 다음 자동 집계·정산의 grantMilestones가 골드로 환산한다.
    await setDoc(
      doc(d, "dailyScores", "_cumulative"),
      {
        silverEarned: Object.fromEntries(
          studentIds.map((sid) => [String(sid), increment(amount)])
        ),
      },
      { merge: true }
    );
    void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
  };
}

/** 교사 실버 차감(−) — 잘못 지급 회수·규칙 위반 차감용.
 *  트랜잭션으로 잔액을 읽어 음수를 막고, 원장(type "adjust" = 차감 표시)과
 *  silverEarned(골드 적립 재료)도 함께 델타 반영해 지급의 완전한 역연산이 되게 한다. */
export function useDeductSilver() {
  const qc = useQueryClient();
  return async (studentId: number, amount: number, note: string) => {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("개수를 확인해주세요.");
    const d = db();
    const balRef = doc(d, "coinTxns", "0_balances");
    await runTransaction(d, async (tx) => {
      const snap = await tx.get(balRef);
      const cur = (snap.exists() ? (snap.data()[String(studentId)] as number) : 0) ?? 0;
      if (cur < amount) throw new Error(`잔액 부족 (현재 ${cur}개) — 차감할 수 없어요.`);
      tx.set(balRef, { [studentId]: increment(-amount) }, { merge: true });
      tx.set(doc(collection(d, "coinTxns")), {
        studentId,
        amount,
        item: note || "교사 차감",
        type: "adjust",
        status: "approved",
        createdAt: Date.now(),
      });
      tx.set(
        doc(d, "dailyScores", "_cumulative"),
        { silverEarned: { [String(studentId)]: increment(-amount) } },
        { merge: true }
      );
    });
    void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
  };
}

/** 교사 학급 골드 수동 조정(±) — 자동 적립과 별개로 classGoldBonus에 누적.
 *  트랜잭션으로 잔량을 읽어 음수(과다 감점)를 막는다. */
export function useAdjustClassGold() {
  const qc = useQueryClient();
  return async (delta: number) => {
    const d = db();
    const balRef = doc(d, "s1Spends", "0_balances");
    await runTransaction(d, async (tx) => {
      const snap = await tx.get(balRef);
      const u = (snap.exists() ? snap.data() : {}) as Record<string, number>;
      if (classGoldLeft(u) + delta < 0)
        throw new Error(`학급 골드가 부족해요 (현재 ${classGoldLeft(u)}개).`);
      tx.set(balRef, { classGoldBonus: increment(delta) }, { merge: true });
    });
    void qc.invalidateQueries({ queryKey: ["balances", "s1"] });
  };
}
