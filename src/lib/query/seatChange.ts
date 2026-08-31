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
    const docBody = {
      studentId: myId,
      week: req.week,
      targetGroup: req.targetGroup,
      targetRole: req.targetRole,
      status: "pending" as const,
      createdAt: Date.now(),
    };
    const ref = await addDoc(collection(db(), "seatChangeRequests"), docBody);
    // 낙관적 캐시 반영 — 재조회 공백 동안의 연속 신청도 홀드·중복 검사에 바로 잡히게
    qc.setQueryData<SeatChangeRequest[]>(["seatRequests", req.week], (old) =>
      old ? [...old, { id: ref.id, ...docBody }] : old
    );
    void qc.invalidateQueries({ queryKey: ["seatRequests", req.week] });
  };
}

// ── swap 합성: 정적 자리표 + DB overrides ───────────────────────
/** 자리는 2주(기) 단위로 유지되므로 스왑도 '기의 첫 주' 문서 하나에 모은다.
 *  (예전엔 보고 있는 주차 문서를 읽어, 3주차에 바꾼 자리가 4주차엔 원위치로 보였다 —
 *   학생 신청은 이미 기 첫 주에 저장하고 있었다. 2026-08-28 수정) */
export const swapWeekOf = (week: number) => Math.max(1, (Math.ceil(week / 2) - 1) * 2 + 1);

export function useWeekSwaps(week: number) {
  const key = swapWeekOf(week);
  return useQuery({
    queryKey: ["seatSwaps", key],
    queryFn: async (): Promise<SeatSwap[]> => {
      const snap = await getDoc(doc(db(), "classData", `seatSwaps-${key}`));
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
  const snap = await getDoc(doc(db(), "classData", `seatSwaps-${swapWeekOf(week)}`));
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
    const reqRef = doc(d, "seatChangeRequests", req.id);
    const balRef = doc(d, "coinTxns", "0_balances");

    // 승인/반려 상태 전환을 '신청 문서'를 트랜잭션 안에서 읽고 검사해 원자 처리.
    // 이전에는 잔액 문서만 읽어(신청 문서는 읽지 않고 update만) 더블클릭·이중 실행 시
    // 충돌 검출이 안 돼 실버가 두 번 빠지고, 스왑도 두 번 쌓여(arrayUnion at 값이 달라
    // 중복 제거 안 됨) 같은 교환을 두 번 적용 → 원위치로 되돌아가는 사고가 있었다.
    // 이제 pending이 아닌 신청은 트랜잭션이 무처리(false)로 끝내 side-effect도 안 돈다.
    const didApprove = await runTransaction(d, async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists() || reqSnap.data().status !== "pending") return false; // 이미 처리됨
      if (approve && cost > 0) {
        const balSnap = await tx.get(balRef);
        const cur = (balSnap.exists() ? (balSnap.data()[String(req.studentId)] as number) : 0) ?? 0;
        if (cur < cost) throw new Error(`실버 부족으로 승인할 수 없어요 (현재 ${cur}개, 필요 ${cost}개).`);
        tx.set(balRef, { [req.studentId]: increment(-cost) }, { merge: true });
      }
      tx.update(reqRef, { status: approve ? "approved" : "rejected", decidedAt: Date.now() });
      return approve; // 이 호출이 pending→승인 전환에 성공했을 때만 true
    });

    // 아래는 이 호출이 실제로 '승인 전환'에 성공했을 때만 1회 실행 (이중 차감·이중 스왑 원천 차단)
    if (didApprove) {
      if (cost > 0) {
        await addDoc(collection(d, "coinTxns"), {
          studentId: req.studentId,
          amount: cost,
          item: `자리 변경 (${req.week}주차 ${req.targetGroup}모둠 ${req.targetRole})`,
          type: "spend",
          status: "approved",
          createdAt: Date.now(),
        });
      }
      if (occupantId != null && occupantId !== req.studentId) {
        await setDoc(
          doc(d, "classData", `seatSwaps-${swapWeekOf(req.week)}`),
          { swaps: arrayUnion({ a: req.studentId, b: occupantId, at: Date.now() }) },
          { merge: true }
        );
      }
    }
    void qc.invalidateQueries({ queryKey: ["pendingSeatRequests"] });
    void qc.invalidateQueries({ queryKey: ["seatSwaps", swapWeekOf(req.week)] });
    void qc.invalidateQueries({ queryKey: ["seatRequests", req.week] });
    void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
    // 이 호출이 실제로 승인 전환에 성공했는지 — UI가 이미 처리된 신청에 가짜 성공 토스트를 안 띄우게
    return didApprove;
  };
}

// ── 📅 하루짜리 자리 교환 (교사 전용) ────────────────────────────
// 사용자 요청 2026-08-28: "싸웠을 때" 같은 상황에 그날만 떼어놓을 수 있어야 한다.
// 기(2주) 스왑과 별개 문서(classData/seatSwapsDay-{YYYY-MM-DD})에 쌓고,
// 적용 순서는 [정적 자리표] → [기 스왑] → [그날 스왑] — 그날 것이 가장 마지막에 덮는다.
export function useDaySwaps(date: string) {
  return useQuery({
    enabled: !!date, // 날짜가 없으면 조회하지 않는다 (useSchedule의 기 단위 모드)
    queryKey: ["seatSwapsDay", date],
    queryFn: async (): Promise<SeatSwap[]> => {
      const snap = await getDoc(doc(db(), "classData", `seatSwapsDay-${date}`));
      return snap.exists() ? ((snap.data().swaps as SeatSwap[] | undefined) ?? []) : [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** 교사: 두 학생의 자리를 맞바꾼다. scope="session"이면 그 기 내내, "day"면 그날 하루만. */
export function useTeacherSwapSeats() {
  const qc = useQueryClient();
  return async (opts: { a: number; b: number; scope: "session" | "day"; week: number; date: string }) => {
    const { a, b, scope, week, date } = opts;
    if (a === b) throw new Error("서로 다른 두 학생을 골라주세요.");
    const key = scope === "day" ? `seatSwapsDay-${date}` : `seatSwaps-${swapWeekOf(week)}`;
    await setDoc(
      doc(db(), "classData", key),
      { swaps: arrayUnion({ a, b, at: Date.now() }) },
      { merge: true }
    );
    if (scope === "day") void qc.invalidateQueries({ queryKey: ["seatSwapsDay", date] });
    else void qc.invalidateQueries({ queryKey: ["seatSwaps", swapWeekOf(week)] });
  };
}

/** 교사: 그날/그 기의 자리 교환을 모두 되돌린다 (원래 자리표로 복귀) */
export function useClearSwaps() {
  const qc = useQueryClient();
  return async (opts: { scope: "session" | "day"; week: number; date: string }) => {
    const { scope, week, date } = opts;
    const key = scope === "day" ? `seatSwapsDay-${date}` : `seatSwaps-${swapWeekOf(week)}`;
    await setDoc(doc(db(), "classData", key), { swaps: [] }, { merge: true });
    if (scope === "day") void qc.invalidateQueries({ queryKey: ["seatSwapsDay", date] });
    else void qc.invalidateQueries({ queryKey: ["seatSwaps", swapWeekOf(week)] });
  };
}

/** 🪑 그 주(그리고 그날)의 '실제' 자리표 — 정적 자리표에 승인된 교환을 합성해 돌려준다.
 *  화면마다 scheduleOfWeek()를 직접 부르면 자리 탭만 교환을 반영하고 모둠 평가·통계·
 *  교사 화면은 옛 모둠을 보여줘 서로 어긋난다 (2026-08-31 사용자 지적). 자리표를 읽는
 *  화면은 모두 이 훅을 쓴다 — 스왑 문서는 쿼리 캐시를 공유해 화면당 추가 읽기는 사실상 0.
 *  date를 주면 그날 하루 교환까지 반영(오늘 화면), 생략하면 기 단위 교환만 반영. */
export function useSchedule(week: number, date?: string) {
  const { data: weekSwaps } = useWeekSwaps(week);
  const { data: daySwaps } = useDaySwaps(date ?? "");
  return applySwaps(scheduleOfWeek(week), [
    ...(weekSwaps ?? []),
    ...(date ? (daySwaps ?? []) : []),
  ]);
}
