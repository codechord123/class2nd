"use client";
// 오늘의 모둠(교사 선정) + 헌법/법률/역할 — 모두 classData의 단일 문서(읽기 1회씩).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── 오늘의 모둠 순위: classData/bestGroups = { [date]: { groupId(1위), chairId, ranking } } ──
// ranking = [1위 모둠, 2위 모둠, …] — 집계에서 rankPoints(기본 5·4·3·2·1점) 배분.
// groupId는 1위 모둠(하위호환 + 세션 '최고 모둠' 통계는 1위만 집계).
export interface BestGroups {
  [date: string]: { groupId: number; chairId: number; ranking?: number[] };
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
  return async (date: string, ranking: number[], chairId: number) => {
    const entry = { groupId: ranking[0], chairId, ranking };
    await setDoc(doc(db(), "classData", "bestGroups"), { [date]: entry }, { merge: true });
    qc.setQueryData(["bestGroups"], (prev: BestGroups | undefined) => ({
      ...prev,
      [date]: entry,
    }));
  };
}

// ── 오늘의 칭찬 커버리지: complimentCoverage/{date} = { 칭찬한사람: 대상 } ──
// 학생이 남의 평가를 읽지 않고도 '아직 칭찬 못 받은 친구'를 알 수 있게 하는 최소 문서.
// (관계는 UI에 노출하지 않고 '받은 사람 집합'만 사용)
export function useComplimentCoverage(date: string, enabled = true) {
  return useQuery({
    queryKey: ["complimentCoverage", date],
    enabled,
    queryFn: async (): Promise<Record<string, number>> => {
      const snap = await getDoc(doc(db(), "complimentCoverage", date));
      return snap.exists() ? (snap.data() as Record<string, number>) : {};
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useSetComplimentCoverage(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (targetId: number | null) => {
    if (myId == null) return;
    // 낙관적 갱신 먼저 — 서버 쓰기가 실패해도(규칙 미게시 등) 내 화면 새싹은 즉시 갱신
    qc.setQueryData(["complimentCoverage", date], (prev: Record<string, number> | undefined) => ({
      ...prev,
      [myId]: targetId ?? 0,
    }));
    // 내 키에 내 대상 기록 → 대상을 바꿔도 항상 정확. 대상 없으면 0(=미기록).
    await setDoc(doc(db(), "complimentCoverage", date), { [myId]: targetId ?? 0 }, { merge: true });
  };
}

// ── 학급 목표 배너: classData/banner — 교사가 자유롭게 수정/숨김 ──
export interface ClassBanner {
  title: string;
  sub?: string;
  active: boolean;
  /** 이벤트 주간 — 예: "이번 주 칭찬 점수 2배!" (배너 문서에 같이 저장 — 추가 읽기 0) */
  eventText?: string;
  eventActive?: boolean;
}
const DEFAULT_BANNER: ClassBanner = {
  title: "🍜 짜파게티 파티까지 달린다!",
  sub: "🐢 거북이 독서 최종 미션",
  active: true,
};

export function useClassBanner() {
  return useQuery({
    queryKey: ["classBanner"],
    queryFn: async (): Promise<ClassBanner> => {
      const snap = await getDoc(doc(db(), "classData", "banner"));
      return snap.exists() ? { ...DEFAULT_BANNER, ...(snap.data() as Partial<ClassBanner>) } : DEFAULT_BANNER;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveClassBanner() {
  const qc = useQueryClient();
  return async (banner: ClassBanner) => {
    await setDoc(doc(db(), "classData", "banner"), banner);
    qc.setQueryData(["classBanner"], banner);
  };
}

// ── 상점 메뉴판: classData/shopMenu (아이들과 토의 후 그때그때 추가) ──
export interface ShopMenuItem {
  id: number;
  name: string;
  price: number;
  wallet: "silver" | "gold"; // 실버(개인) / 골드(학급 공용)
  note?: string;
}

export function useShopMenu() {
  return useQuery({
    queryKey: ["shopMenu"],
    queryFn: async (): Promise<ShopMenuItem[]> => {
      const snap = await getDoc(doc(db(), "classData", "shopMenu"));
      return snap.exists() ? ((snap.data().items as ShopMenuItem[]) ?? []) : [];
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveShopMenu() {
  const qc = useQueryClient();
  return async (items: ShopMenuItem[]) => {
    await setDoc(doc(db(), "classData", "shopMenu"), { items });
    qc.setQueryData(["shopMenu"], items);
  };
}

// ── 커스텀 링크: classData/customLinks ──────────────────────────
export interface CustomLink {
  id: number;
  emoji: string;
  title: string;
  desc?: string;
  url: string;
  teacherOnly?: boolean; // 선생님에게만 표시
}

export function useCustomLinks() {
  return useQuery({
    queryKey: ["customLinks"],
    queryFn: async (): Promise<CustomLink[]> => {
      const snap = await getDoc(doc(db(), "classData", "customLinks"));
      return snap.exists() ? ((snap.data().links as CustomLink[]) ?? []) : [];
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveCustomLinks() {
  const qc = useQueryClient();
  return async (links: CustomLink[]) => {
    await setDoc(doc(db(), "classData", "customLinks"), { links });
    qc.setQueryData(["customLinks"], links);
  };
}

// ── 선생님 메모장: classData/teacherMemo ────────────────────────
export function useTeacherMemo(enabled: boolean) {
  return useQuery({
    queryKey: ["teacherMemo"],
    enabled,
    queryFn: async (): Promise<{ text: string; fontSize: number }> => {
      const snap = await getDoc(doc(db(), "classData", "teacherMemo"));
      return snap.exists()
        ? (snap.data() as { text: string; fontSize: number })
        : { text: "", fontSize: 14 };
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveTeacherMemo() {
  const qc = useQueryClient();
  return async (memo: { text: string; fontSize: number }) => {
    await setDoc(doc(db(), "classData", "teacherMemo"), memo);
    qc.setQueryData(["teacherMemo"], memo);
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
