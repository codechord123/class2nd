"use client";
// 교사 설정(classData/settings) — 소량 단일 문서. 짧게 캐시하고 행동 직전엔 서버 값을 다시 본다.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_SETTINGS, type ClassSettings } from "@/types";

const KEY = ["settings"];

// ⚠️ 2026-11 실사례: 1시간 캐시라 교사가 상점 잠금·우체통을 바꿔도 학생 화면은 최대 1시간 옛 상태
//    — 서버 규칙은 즉시 새 값으로 막으니 "열림이라는데 안 돼요/닫혔다는데 돼요"가 됐다.
//    그래서 ① 캐시를 3분으로 줄이고 창으로 돌아올 때 다시 읽고 ② 신청·발송 직전엔
//    fetchFreshSettings로 서버 값을 한 번 더 확인한다 (문서 1개 — 읽기 부담 작음).
async function readSettings(): Promise<ClassSettings> {
  const snap = await getDoc(doc(db(), "classData", "settings"));
  return snap.exists()
    ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<ClassSettings>) }
    : DEFAULT_SETTINGS;
}

export function useSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: readSettings,
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/** 지금 서버 값 — 신청·발송·토글 직전 판정용 (캐시도 같이 갱신) */
export function fetchFreshSettings(qc: QueryClient): Promise<ClassSettings> {
  return qc.fetchQuery({ queryKey: KEY, queryFn: readSettings, staleTime: 0 });
}

/**
 * 일부 필드만 저장 — 토글·스위치용. 전체 객체를 다시 쓰면 다른 기기(교사 폰↔PC)에서
 * 바꾼 값을 이 기기의 낡은 캐시로 되돌려 버린다(실사례). 바꾼 키만 merge한다.
 */
export function usePatchSettings() {
  const qc = useQueryClient();
  return async (patch: Partial<ClassSettings>) => {
    await setDoc(doc(db(), "classData", "settings"), patch, { merge: true });
    qc.setQueryData<ClassSettings>(KEY, (old) => ({ ...(old ?? DEFAULT_SETTINGS), ...patch }));
  };
}

/** 전체 설정 객체를 받아도 '바뀐 키만' 저장한다 — 낡은 캐시로 다른 기기의 변경을 되돌리지 않게 */
export function useSaveSettings() {
  const qc = useQueryClient();
  return async (settings: ClassSettings) => {
    const old = (qc.getQueryData<ClassSettings>(KEY) ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(settings))
      if (v !== undefined && JSON.stringify(v) !== JSON.stringify(old[k])) patch[k] = v;
    if (Object.keys(patch).length)
      await setDoc(doc(db(), "classData", "settings"), patch, { merge: true });
    qc.setQueryData<ClassSettings>(KEY, (o) => ({ ...(o ?? DEFAULT_SETTINGS), ...patch }));
  };
}
