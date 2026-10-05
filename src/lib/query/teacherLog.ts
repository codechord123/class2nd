"use client";
// 📔 담임 일지 — 교사 전용 기록.
//
// 🔒 민감도가 앱의 다른 데이터와 격이 다르다. 생활지도·가정사·상담 내용이 들어가므로
//    firestore.rules에서 읽기·쓰기 모두 isTeacher()로만 연다. 학생 계정은 이 컬렉션의
//    존재조차 모른다. (규칙 게시 전에는 permission-denied로 조용히 막힌다)
//
// 왜 메모장(classData/teacherMemo) 한 덩어리로 부족한가: 쌓이면 '찾을 수가 없다'.
//   학기 말 생활기록부나 상담 직전에 "이 아이 기록만", "다툼만" 모아보는 게 핵심 요구다.
//
// 읽기 예산: 교사 1명만 읽으므로 25명 문제가 아니다. 최근 PAGE건을 한 번에 받아
//   태그·학생·기간·검색은 전부 화면에서 거른다 → 복합 인덱스가 필요 없고 읽기도 한 번.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface TeacherLog {
  id: string;
  at: string; // "YYYY-MM-DD" — 일지 날짜 (오늘이 기본, 과거로도 기록 가능)
  text: string;
  tags: string[];
  studentIds: number[];
  createdAt: number;
  updatedAt?: number;
}

export const LOG_PAGE = 200; // 한 번에 받는 건수 — 넘으면 '더 보기'
export const DEFAULT_LOG_TAGS = ["상담", "학부모", "다툼", "칭찬", "건강", "학습", "기타"];

function normalize(id: string, raw: Record<string, unknown>): TeacherLog {
  return {
    id,
    at: typeof raw.at === "string" ? raw.at : "",
    text: typeof raw.text === "string" ? raw.text : "",
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    studentIds: Array.isArray(raw.studentIds) ? (raw.studentIds as number[]).map(Number) : [],
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : undefined,
  };
}

/** 최근 일지 — 날짜 역순. enabled로 교사 화면에서만 읽는다 */
export function useTeacherLogs(enabled: boolean, take = LOG_PAGE) {
  return useQuery({
    queryKey: ["teacherLogs", take],
    enabled,
    queryFn: async (): Promise<TeacherLog[]> => {
      const q = query(collection(db(), "teacherLogs"), orderBy("at", "desc"), limit(take));
      const snap = await getDocs(q);
      return snap.docs.map((x) => normalize(x.id, x.data()));
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 자주 쓰는 태그 — 교사가 직접 관리 (없으면 기본값) */
export function useLogTags(enabled: boolean) {
  return useQuery({
    queryKey: ["logTags"],
    enabled,
    queryFn: async (): Promise<string[]> => {
      const snap = await getDoc(doc(db(), "classData", "logTags"));
      const list = snap.exists() ? (snap.data().tags as unknown) : null;
      return Array.isArray(list) && list.length ? (list as string[]) : DEFAULT_LOG_TAGS;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveLogTags() {
  const qc = useQueryClient();
  return async (tags: string[]) => {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    await setDoc(doc(db(), "classData", "logTags"), { tags: clean }, { merge: true });
    qc.setQueryData(["logTags"], clean);
  };
}

function friendly(e: unknown, fallback: string): Error {
  if ((e as { code?: string })?.code === "permission-denied")
    return new Error(
      "일지 보안 규칙이 아직 게시되지 않았어요 — Firebase 콘솔에 firestore.rules를 게시해 주세요."
    );
  return e instanceof Error ? e : new Error(fallback);
}

export function useAddTeacherLog() {
  const qc = useQueryClient();
  return async (log: Omit<TeacherLog, "id" | "createdAt">) => {
    if (!log.text.trim()) throw new Error("일지 내용을 적어주세요.");
    try {
      await addDoc(collection(db(), "teacherLogs"), {
        at: log.at,
        text: log.text.trim(),
        tags: log.tags,
        studentIds: log.studentIds,
        createdAt: Date.now(),
      });
    } catch (e) {
      throw friendly(e, "일지를 저장하지 못했어요.");
    }
    void qc.invalidateQueries({ queryKey: ["teacherLogs"] });
  };
}

export function useUpdateTeacherLog() {
  const qc = useQueryClient();
  return async (id: string, patch: Partial<Omit<TeacherLog, "id" | "createdAt">>) => {
    if (patch.text !== undefined && !patch.text.trim())
      throw new Error("일지 내용을 적어주세요.");
    try {
      await updateDoc(doc(db(), "teacherLogs", id), {
        ...patch,
        ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
        updatedAt: Date.now(),
      });
    } catch (e) {
      throw friendly(e, "수정하지 못했어요.");
    }
    void qc.invalidateQueries({ queryKey: ["teacherLogs"] });
  };
}

export function useDeleteTeacherLog() {
  const qc = useQueryClient();
  return async (id: string) => {
    await deleteDoc(doc(db(), "teacherLogs", id));
    void qc.invalidateQueries({ queryKey: ["teacherLogs"] });
  };
}

/** 화면에서 거르는 필터 — 쿼리를 늘리지 않으려고 전부 클라이언트에서 한다 */
export function filterLogs(
  logs: TeacherLog[] | undefined,
  f: { tag?: string; studentId?: number | null; from?: string; to?: string; keyword?: string }
): TeacherLog[] {
  const kw = (f.keyword ?? "").trim().toLowerCase();
  return (logs ?? []).filter((l) => {
    if (f.tag && !l.tags.includes(f.tag)) return false;
    if (f.studentId != null && !l.studentIds.includes(f.studentId)) return false;
    if (f.from && l.at < f.from) return false;
    if (f.to && l.at > f.to) return false;
    if (kw && !l.text.toLowerCase().includes(kw) && !l.tags.some((t) => t.toLowerCase().includes(kw)))
      return false;
    return true;
  });
}

/** 태그별 건수 — 자주 쓰는 순서로 보여주기 위한 재료 */
export function tagCounts(logs: TeacherLog[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of logs ?? []) for (const t of l.tags) out[t] = (out[t] ?? 0) + 1;
  return out;
}
