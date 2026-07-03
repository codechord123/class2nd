"use client";
// 교사 설정(classData/settings) — 소량 단일 문서. 세션당 1회만 읽고 캐시.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_SETTINGS, type ClassSettings } from "@/types";

const KEY = ["settings"];

export function useSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ClassSettings> => {
      const snap = await getDoc(doc(db(), "classData", "settings"));
      return snap.exists()
        ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<ClassSettings>) }
        : DEFAULT_SETTINGS;
    },
    staleTime: 60 * 60 * 1000, // 1시간 — 설정은 거의 안 바뀜
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return async (settings: ClassSettings) => {
    await setDoc(doc(db(), "classData", "settings"), settings, { merge: true });
    qc.setQueryData(KEY, settings); // 낙관적 갱신 — 재조회 없음
  };
}
