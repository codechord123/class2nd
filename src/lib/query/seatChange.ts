"use client";
// 토큰(실버) 자리 변경 신청 (요구사항 §B):
//   · 기한: 자리 바꿈 주(週) 시작 전주 수요일 자정(KST)
//   · 동일 자리 신청 몰림 → 선착순 (createdAt 오름차순)
//   · 승인 시 교사가 classData/seatSwaps-{week} 문서에 swap 기록 + 실버 차감
// 자리표 원본은 정적 JSON 불변 — swap만 DB에 쌓고 렌더 시 합성한다.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { scheduleOfWeek } from "@/lib/schedule";
import type { RoleKey, WeekSchedule, GroupAssignment } from "@/types";

export interface SeatChangeRequest {
  id: string;
  studentId: number;
  week: number;
  targetGroup: number;
  targetRole: RoleKey | "소통";
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface SeatSwap {
  a: number; // 신청 학생
  b: number; // 원래 그 자리 학생 (서로 자리 교환)
  at: number;
}

/** 신청 마감: 해당 주(월요일 시작) 전주 수요일 23:59:59 KST */
export function seatChangeDeadline(weekStart: string): Date {
  const d = new Date(weekStart + "T23:59:59+09:00");
  d.setDate(d.getDate() - 5); // 월요일 - 5일 = 전주 수요일
  return d;
}

export function useWeekRequests(week: number) {
  return useQuery({
    queryKey: ["seatRequests", week],
    queryFn: async (): Promise<SeatChangeRequest[]> => {
      const q = query(collection(db(), "seatChangeRequests"), where("week", "==", week));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SeatChangeRequest, "id">) }))
        .sort((a, b) => a.createdAt - b.createdAt); // 선착순
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateSeatRequest(myId: number | null) {
  const qc = useQueryClient();
  return async (req: {
    week: number;
    weekStart: string;
    targetGroup: number;
    targetRole: RoleKey | "소통";
    existing: SeatChangeRequest[];
  }) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (new Date() > seatChangeDeadline(req.weekStart))
      throw new Error("신청 기한(전주 수요일 자정)이 지났어요.");
    // 선착순: 같은 자리에 먼저 대기 중인 신청이 있으면 안내
    const taken = req.existing.find(
      (r) =>
        r.status !== "rejected" &&
        r.targetGroup === req.targetGroup &&
        r.targetRole === req.targetRole
    );
    if (taken) throw new Error("이미 먼저 신청한 친구가 있어요. (선착순)");
    if (req.existing.some((r) => r.studentId === myId && r.status === "pending"))
      throw new Error("이 주차에 이미 신청했어요.");
    await addDoc(collection(db(), "seatChangeRequests"), {
      studentId: myId,
      week: req.week,
      targetGroup: req.targetGroup,
      targetRole: req.targetRole,
      status: "pending",
      createdAt: Date.now(),
    });
    void qc.invalidateQueries({ queryKey: ["seatRequests", req.week] });
  };
}

// ── swap 합성: 정적 자리표 + DB overrides ───────────────────────
export function useWeekSwaps(week: number) {
  return useQuery({
    queryKey: ["seatSwaps", week],
    queryFn: async (): Promise<SeatSwap[]> => {
      const snap = await getDoc(doc(db(), "classData", `seatSwaps-${week}`));
      return snap.exists() ? ((snap.data().swaps as SeatSwap[] | undefined) ?? []) : [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** 정적 자리표에 swap 목록을 순서대로 적용한 사본을 돌려준다 */
export function applySwaps(schedule: WeekSchedule, swaps: SeatSwap[]): WeekSchedule {
  if (!swaps.length) return schedule;
  const groups: GroupAssignment[] = structuredClone(schedule.groups);
  const swap = (x: number, y: number) => {
    for (const g of groups) {
      if (g.chair === x) g.chair = y;
      else if (g.chair === y) g.chair = x;
      for (const m of g.members) {
        if (m.studentId === x) m.studentId = y;
        else if (m.studentId === y) m.studentId = x;
      }
    }
  };
  for (const s of swaps) swap(s.a, s.b);
  return { ...schedule, groups };
}

/** 해당 주차·자리의 현재 점유자 (기존 swap까지 반영해 조회 — 승인 시 사용) */
export async function findOccupant(
  week: number,
  group: number,
  role: RoleKey | "소통"
): Promise<number | null> {
  const snap = await getDoc(doc(db(), "classData", `seatSwaps-${week}`));
  const swaps = snap.exists() ? ((snap.data().swaps as SeatSwap[] | undefined) ?? []) : [];
  const sched = applySwaps(scheduleOfWeek(week), swaps);
  const g = sched.groups.find((x) => x.groupId === group);
  if (!g) return null;
  if (role === "소통") return g.chair;
  return g.members.find((m) => m.role === role)?.studentId ?? null;
}

// ── 교사: 승인 → swap 기록 + 실버 차감 신청 흐름과 연결 ─────────
export function usePendingSeatRequests(enabled: boolean) {
  return useQuery({
    queryKey: ["pendingSeatRequests"],
    enabled,
    queryFn: async (): Promise<SeatChangeRequest[]> => {
      const q = query(collection(db(), "seatChangeRequests"), where("status", "==", "pending"));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SeatChangeRequest, "id">) }))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    staleTime: 60 * 1000,
  });
}

export function useDecideSeatRequest() {
  const qc = useQueryClient();
  // cost: 승인 시 신청 학생에게서 자동 차감할 2학기 실버 (0이면 차감 없음)
  return async (
    req: SeatChangeRequest,
    approve: boolean,
    occupantId?: number,
    cost = 0
  ) => {
    const d = db();

    // 승인 + 비용 있으면: 잔액 검증 후 차감을 원자 처리 (부족하면 승인 자체를 막음)
    if (approve && cost > 0) {
      const balRef = doc(d, "coinTxns", "0_balances");
      await runTransaction(d, async (tx) => {
        const balSnap = await tx.get(balRef);
        const cur = (balSnap.exists() ? (balSnap.data()[String(req.studentId)] as number) : 0) ?? 0;
        if (cur < cost) throw new Error(`실버 부족으로 승인할 수 없어요 (현재 ${cur}개, 필요 ${cost}개).`);
        tx.set(balRef, { [req.studentId]: increment(-cost) }, { merge: true });
        tx.update(doc(d, "seatChangeRequests", req.id), { status: "approved", decidedAt: Date.now() });
      });
      await addDoc(collection(d, "coinTxns"), {
        studentId: req.studentId,
        amount: cost,
        item: `자리 변경 (${req.week}주차 ${req.targetGroup}모둠 ${req.targetRole})`,
        type: "spend",
        status: "approved",
        createdAt: Date.now(),
      });
    } else {
      await updateDoc(doc(d, "seatChangeRequests", req.id), {
        status: approve ? "approved" : "rejected",
        decidedAt: Date.now(),
      });
    }

    if (approve && occupantId != null && occupantId !== req.studentId) {
      await setDoc(
        doc(d, "classData", `seatSwaps-${req.week}`),
        { swaps: arrayUnion({ a: req.studentId, b: occupantId, at: Date.now() }) },
        { merge: true }
      );
    }
    void qc.invalidateQueries({ queryKey: ["pendingSeatRequests"] });
    void qc.invalidateQueries({ queryKey: ["seatSwaps", req.week] });
    void qc.invalidateQueries({ queryKey: ["seatRequests", req.week] });
    void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
  };
}
