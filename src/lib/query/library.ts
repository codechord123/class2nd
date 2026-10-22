"use client";
// 📚 학급문고 대출 — 사서 학생(교사 지정)이 빌릴 때마다 책 제목·빌린 학생·반납 기한을 적는다.
// (사용자 확정 2026-10-22: 책 목록 미리 등록 없음 · 7일 · 2권 · 연장 1회 · 사서 활동 점수 없음 ·
//  연체만 감점 — 하루마다 5점이 기본, 교사가 '1회 5점'으로 바꿀 수 있다)
//
// 데이터: libraryLoans/{자동 id} — 대출 1건 = 문서 1개
//   { title, author, sid, out, due, ext(0|1), returned(null|"YYYY-MM-DD"), lost, by, createdAt }
//   by = 기록한 사서 학생 번호(규칙이 사서인지 대조) | "teacher"
// 읽기 예산: 사서·교사 데스크는 '대출 중'(returned==null)만, 학생은 '내 것'(sid==나)만 읽는다.
//   둘 다 단일 등호 조건이라 색인 추가 불필요. 연체 감점은 집계(aggregateDate)가 같은 방식으로 계산.
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
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isWeekend, shiftDate } from "@/lib/date";
import type { ClassSettings } from "@/types";

export interface Loan {
  id: string;
  title: string;
  author: string;
  sid: number;
  out: string;
  due: string;
  ext: number;
  returned: string | null;
  lost: boolean;
  by: number | "teacher";
  createdAt: number;
}

// ── 규칙 기본값 (교사 설정이 비어 있으면) ─────────────────────────────────────
export const DEFAULT_LIBRARIANS = [15, 18]; // 이다인 · 이채연 (사용자 지정 2026-10-22)
export const DEFAULT_LOAN_DAYS = 7;
export const DEFAULT_LOAN_MAX = 2;
export const LOAN_EXT_MAX = 1;
export const DEFAULT_LATE_PENALTY = 5;
export const TITLE_MAX = 60;
export const AUTHOR_MAX = 40;

export function libraryRules(s: ClassSettings | undefined) {
  return {
    librarians: s?.librarians ?? DEFAULT_LIBRARIANS,
    days: s?.loanDays ?? DEFAULT_LOAN_DAYS,
    max: s?.loanMax ?? DEFAULT_LOAN_MAX,
    penalty: s?.latePenalty ?? DEFAULT_LATE_PENALTY,
    mode: (s?.lateMode ?? "daily") as "daily" | "once",
    holidays: s?.holidays ?? [],
  };
}

// ── 날짜 계산 ─────────────────────────────────────────────────────────────
const isOff = (d: string, holidays: string[]) => isWeekend(d) || holidays.includes(d);

/** 기한이 주말·공휴일이면 다음 학사일로 (반납할 수 없는 날이 기한이 되지 않게) */
export function dueFrom(out: string, days: number, holidays: string[] = []): string {
  let d = shiftDate(out, days);
  while (isOff(d, holidays)) d = shiftDate(d, 1);
  return d;
}

/** 기한 다음 첫 학사일 — '1회 감점' 방식에서 감점하는 날 */
export function firstLateDay(due: string, holidays: string[] = []): string {
  let d = shiftDate(due, 1);
  while (isOff(d, holidays)) d = shiftDate(d, 1);
  return d;
}

/** 오늘 기준 연체 학사일 수 (기한 다음 날부터 오늘까지, 주말·공휴일 제외) — 0이면 연체 아님 */
export function lateDays(l: Pick<Loan, "due" | "returned" | "lost">, today: string, holidays: string[] = []): number {
  if (l.returned || l.lost || today <= l.due) return 0;
  let n = 0;
  for (let d = shiftDate(l.due, 1); d <= today; d = shiftDate(d, 1)) if (!isOff(d, holidays)) n++;
  return n;
}

/** 남은 일수 (달력 기준) — 음수면 지남 */
export function daysLeft(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/**
 * 📚 그날(date)의 연체 감점 — 집계가 쓴다. 학생 번호 → 감점(양수).
 *  · daily: 그날 기한이 지난 책을 안 돌려준 학생은 그날 −penalty (여러 권이어도 하루 1번)
 *  · once : 책마다 '기한 다음 첫 학사일'에 한 번 −penalty
 *  그날 반납했으면 그날은 감점하지 않는다(돌려주면 바로 멈춤). 분실 처리된 책은 제외(교사가 따로 정리).
 */
export function latePenaltyOn(
  loans: Pick<Loan, "sid" | "due" | "out" | "returned" | "lost">[],
  date: string,
  rules: { penalty: number; mode: "daily" | "once"; holidays: string[] }
): Record<number, number> {
  const out: Record<number, number> = {};
  if (rules.penalty <= 0) return out;
  for (const l of loans) {
    if (l.lost || l.out > date || l.due >= date) continue;
    if (l.returned && l.returned <= date) continue; // 그날까지 돌려줬다
    if (rules.mode === "daily") out[l.sid] = rules.penalty;
    else if (firstLateDay(l.due, rules.holidays) === date) out[l.sid] = (out[l.sid] ?? 0) + rules.penalty;
  }
  return out;
}

/** 집계용: 그날 연체 판단에 필요한 대출만 (대출 중 + 그날 이후 반납) — 색인 추가 없는 두 질의 */
export async function loansForDate(date: string): Promise<Loan[]> {
  const col = collection(db(), "libraryLoans");
  const [act, later] = await Promise.all([
    getDocs(query(col, where("returned", "==", null))),
    getDocs(query(col, where("returned", ">", date))),
  ]);
  return [...act.docs, ...later.docs].map(toLoan);
}

function toLoan(d: { id: string; data: () => Record<string, unknown> }): Loan {
  const x = d.data();
  return {
    id: d.id,
    title: String(x.title ?? ""),
    author: String(x.author ?? ""),
    sid: Number(x.sid),
    out: String(x.out ?? ""),
    due: String(x.due ?? ""),
    ext: Number(x.ext ?? 0),
    returned: typeof x.returned === "string" ? x.returned : null,
    lost: x.lost === true,
    by: x.by === "teacher" ? "teacher" : Number(x.by),
    createdAt: Number(x.createdAt ?? 0),
  };
}

// ── 조회 ───────────────────────────────────────────────────────────────────
const ACTIVE = ["library", "active"];

/** 지금 대출 중인 책 전부 (사서·교사 데스크, 교사 개요 연체 알림) */
export function useActiveLoans(enabled: boolean) {
  return useQuery({
    queryKey: ACTIVE,
    enabled,
    queryFn: async () => {
      const snap = await getDocs(query(collection(db(), "libraryLoans"), where("returned", "==", null)));
      return snap.docs.map(toLoan).sort((a, b) => a.due.localeCompare(b.due));
    },
    staleTime: 60 * 1000,
  });
}

/** 내 대출 기록 (빌린 것 + 돌려준 것) — 학생 화면 */
export function useMyLoans(sid: number | null) {
  return useQuery({
    queryKey: ["library", "mine", sid],
    enabled: sid != null,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db(), "libraryLoans"), where("sid", "==", sid), limit(50))
      );
      return snap.docs.map(toLoan).sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 최근 기록 — 사서·교사가 펼칠 때만 */
export function useLoanHistory(enabled: boolean, n = 40) {
  return useQuery({
    queryKey: ["library", "history", n],
    enabled,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db(), "libraryLoans"), orderBy("createdAt", "desc"), limit(n))
      );
      return snap.docs.map(toLoan);
    },
    staleTime: 60 * 1000,
  });
}

// ── 쓰기 (사서·교사) ─────────────────────────────────────────────────────────
function useRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["library"] });
}

/** by: 사서 학생 번호 또는 "teacher" — 규칙이 사서 명단과 기기 소유를 대조한다 */
export function useLend(by: number | "teacher" | null) {
  const refresh = useRefresh();
  return async (p: { title: string; author: string; sid: number; out: string; due: string }) => {
    if (by == null) throw new Error("사서만 기록할 수 있어요.");
    const title = p.title.trim();
    if (!title) throw new Error("책 제목을 적어 주세요.");
    if (title.length > TITLE_MAX) throw new Error(`제목은 ${TITLE_MAX}자까지예요.`);
    await addDoc(collection(db(), "libraryLoans"), {
      title,
      author: p.author.trim().slice(0, AUTHOR_MAX),
      sid: p.sid,
      out: p.out,
      due: p.due,
      ext: 0,
      returned: null,
      lost: false,
      by,
      createdAt: Date.now(),
    });
    refresh();
  };
}

export function useUpdateLoan(by: number | "teacher" | null) {
  const refresh = useRefresh();
  return async (l: Loan, patch: Partial<Pick<Loan, "due" | "ext" | "returned" | "lost">>) => {
    if (by == null) throw new Error("사서만 기록할 수 있어요.");
    await updateDoc(doc(db(), "libraryLoans", l.id), { ...patch, by });
    refresh();
  };
}

export function useDeleteLoan() {
  const refresh = useRefresh();
  return async (l: Loan) => {
    await deleteDoc(doc(db(), "libraryLoans", l.id));
    refresh();
  };
}
