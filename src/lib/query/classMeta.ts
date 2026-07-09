"use client";
// 오늘의 모둠(교사 선정) + 헌법/법률/역할 — 모두 classData의 단일 문서(읽기 1회씩).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
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

// ── 결석: classData/attendance = { [date]: number[] }(그날 결석한 학생 번호) ──
// 결석하면 그날 칭찬·평가를 못 하므로, 모둠 '전원 칭찬' 미션이 막히고 팀 보상 판정도
// 왜곡된다. 교사가 결석을 기록하면 집계가 그 학생을 그날 모둠 활동에서 제외한다
// (전출 inactive와 같은 취급이되 '그 날짜만'). bestGroups와 같은 단일 문서 패턴.
export interface Attendance {
  [date: string]: number[];
}

export function useAttendance() {
  return useQuery({
    queryKey: ["attendance"],
    queryFn: async (): Promise<Attendance> => {
      const snap = await getDoc(doc(db(), "classData", "attendance"));
      return snap.exists() ? (snap.data() as Attendance) : {};
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useSetAttendance() {
  const qc = useQueryClient();
  return async (date: string, absentIds: number[]) => {
    const ids = [...new Set(absentIds)].sort((a, b) => a - b);
    await setDoc(doc(db(), "classData", "attendance"), { [date]: ids }, { merge: true });
    qc.setQueryData(["attendance"], (prev: Attendance | undefined) => ({
      ...prev,
      [date]: ids,
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

// ── 메뉴 제안: menuRequests 컬렉션 — 학생이 "이런 메뉴 만들어주세요" 건의 ──
// 실버 차감 없음. 교사가 검토 후 메뉴판(shopMenu)에 추가하거나 반려한다.
export interface MenuRequest {
  id: string;
  studentId: number;
  name: string; // 원하는 메뉴 이름
  note?: string; // 왜 필요한지
  createdAt: number;
}

/** 교사용 — 전체 메뉴 제안 (최신순) */
export function useMenuRequests(enabled: boolean) {
  return useQuery({
    queryKey: ["menuRequests", "all"],
    enabled,
    queryFn: async (): Promise<MenuRequest[]> => {
      const q = query(collection(db(), "menuRequests"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuRequest, "id">) }));
    },
    staleTime: 3 * 60 * 1000,
  });
}

/** 학생용 — 내가 낸 제안만 */
export function useMyMenuRequests(myId: number | null) {
  return useQuery({
    queryKey: ["menuRequests", "mine", myId],
    enabled: myId != null,
    queryFn: async (): Promise<MenuRequest[]> => {
      const q = query(collection(db(), "menuRequests"), where("studentId", "==", myId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<MenuRequest, "id">) }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useCreateMenuRequest(myId: number | null) {
  const qc = useQueryClient();
  return async (name: string, note: string) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (!name.trim()) throw new Error("원하는 메뉴 이름을 적어주세요.");
    try {
      await addDoc(collection(db(), "menuRequests"), {
        studentId: myId,
        name: name.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
        createdAt: Date.now(),
      });
    } catch (e) {
      // menuRequests 규칙이 아직 콘솔에 게시되지 않으면 permission-denied가 난다
      if ((e as { code?: string })?.code === "permission-denied")
        throw new Error("아직 준비 중인 기능이에요 — 선생님께 알려주세요! 🙂");
      throw e;
    }
    void qc.invalidateQueries({ queryKey: ["menuRequests"] });
  };
}

export function useDeleteMenuRequest() {
  const qc = useQueryClient();
  return async (id: string) => {
    await deleteDoc(doc(db(), "menuRequests", id));
    void qc.invalidateQueries({ queryKey: ["menuRequests"] });
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
// laws는 하위호환용 배열(안건→법률 채택 시 미분류 잔재로 쌓임).
// 실제 표시·편집은 부서별로 나뉜 lawsByDept를 쓴다 — 아이들이 자기 부서 소속감을
// 갖고 학급 규칙을 만들 수 있게 (사용자 확정).
export interface Constitution {
  articles: string[]; // 헌법
  laws: string[]; // 미분류 법률 (건의 채택 잔재)
  lawsByDept?: Record<string, string[]>; // 부서명(ROLE_INFO.dept) → 법률 조항 목록
  roles: string[]; // 역할
}

const EMPTY: Constitution = { articles: [], laws: [], lawsByDept: {}, roles: [] };

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
