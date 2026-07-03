"use client";
// 오늘의 모둠(교사 선정) + 헌법/법률/역할 — 모두 classData의 단일 문서(읽기 1회씩).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── 오늘의 모둠: classData/bestGroups = { [date]: { groupId, chairId } } ──
export interface BestGroups {
  [date: string]: { groupId: number; chairId: number };
}

export function useBestGroups() {
  return useQuery({
    queryKey: ["bestGroups"],
    queryFn: async (): Promise<BestGroups> => {
      const snap = await getDoc(doc(db(), "classData", "bestGroups"));
      return snap.exists() ? (snap.data() as BestGroups) : {};
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useSetBestGroup() {
  const qc = useQueryClient();
  return async (date: string, groupId: number, chairId: number) => {
    await setDoc(
      doc(db(), "classData", "bestGroups"),
      { [date]: { groupId, chairId } },
      { merge: true }
    );
    qc.setQueryData(["bestGroups"], (prev: BestGroups | undefined) => ({
      ...prev,
      [date]: { groupId, chairId },
    }));
  };
}

// ── 헌법/법률/역할: classData/constitution ──────────────────────
export interface Constitution {
  articles: string[]; // 헌법
  laws: string[]; // 법률
  roles: string[]; // 역할
}

const EMPTY: Constitution = { articles: [], laws: [], roles: [] };

export function useConstitution() {
  return useQuery({
    queryKey: ["constitution"],
    queryFn: async (): Promise<Constitution> => {
      const snap = await getDoc(doc(db(), "classData", "constitution"));
      return snap.exists() ? { ...EMPTY, ...(snap.data() as Partial<Constitution>) } : EMPTY;
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useSaveConstitution() {
  const qc = useQueryClient();
  return async (c: Constitution) => {
    await setDoc(doc(db(), "classData", "constitution"), c);
    qc.setQueryData(["constitution"], c);
  };
}
