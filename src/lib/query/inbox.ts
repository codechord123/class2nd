"use client";
// 📬 교사 알림함 — 학생이 무언가를 '보내거나 신청'하면 선생님이 놓치지 않게.
//
// 문제(2026-11 사용자): 우체통·상점 신청 등이 각 탭에 흩어져 있고, 교사 '오늘' 탭을 열어야만
//   보였다. 교사 화면을 다른 탭에 둔 채로는 알림이 '안 온' 것처럼 느껴졌다.
//
// 구조 — 읽기 예산 때문에 '신호'와 '내용'을 나눈다:
//   inbox/main  (문서 1개) = 신호. 학생이 보낼 때 자기 칸 s_{번호}.{종류} 에 시각만 찍는다.
//                 교사 종(🔔)은 이 문서 하나만 1분마다 읽는다 → 하루 수백 읽기로 끝난다.
//                 (편지 '답장 기다림'을 알려고 학생 25명 부모 문서를 매번 읽던 방식 대체)
//     teacherSeenAt  교사가 알림함을 마지막으로 연 시각 (기기 간 공유 — PC에서 보면 폰 종도 꺼진다)
//   내용 = 각 기능의 원래 데이터(상점 대기·메뉴 건의·이의제기·자리·편지…) — 알림함을 열 때만 읽는다.
//
// 🔒 규칙: 학생은 '자기 칸 하나'만 쓸 수 있고(ownsStudent) 읽지는 못한다. 교사만 읽는다.
//    규칙 게시 전엔 학생 쪽 신호 쓰기가 조용히 실패할 뿐 원래 기능은 그대로 동작한다.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type InboxKind = "letter" | "shop" | "menu" | "appeal" | "seat" | "board" | "hidden" | "shopFail";

export const KIND_LABEL: Record<InboxKind, { emoji: string; label: string; verb: string }> = {
  letter: { emoji: "💌", label: "편지", verb: "편지를 보냈어요" },
  shop: { emoji: "🛒", label: "상점 신청", verb: "상점 신청을 했어요" },
  menu: { emoji: "💡", label: "메뉴 건의", verb: "메뉴를 건의했어요" },
  appeal: { emoji: "🙋", label: "이의 제기", verb: "점수 이의를 냈어요" },
  seat: { emoji: "💺", label: "자리 신청", verb: "자리 변경을 신청했어요" },
  board: { emoji: "📝", label: "건의 게시판", verb: "게시판에 글을 썼어요" },
  hidden: { emoji: "🌟", label: "숨은 기여", verb: "숨은 기여를 추천했어요" },
  // 신청이 '실패'했을 때 — 시간 밖·잠금처럼 아이 화면에서 안내로 끝나는 건 보내지 않고, 저장이 막힌 것만
  shopFail: { emoji: "⚠️", label: "상점 신청 실패", verb: "상점 신청에 실패했어요 — 다시 로그인을 도와주세요" },
};

const REF = () => doc(db(), "inbox", "main");

/** 학생 쪽 — 보낸 직후 부른다. 실패해도 본 기능엔 영향 없게 삼킨다 */
export function pingInbox(studentId: number | null | undefined, kind: InboxKind): void {
  if (studentId == null) return;
  // by = 보낸 학생 번호 — 규칙이 'by 칸과 s_{by} 칸만 바뀌었는지 + 본인인지'를 대조한다
  void setDoc(
    REF(),
    { by: studentId, [`s_${studentId}`]: { [kind]: Date.now() } },
    { merge: true }
  ).catch(() => {});
}

export interface InboxEvent {
  sid: number;
  kind: InboxKind;
  at: number;
}
export interface InboxState {
  events: InboxEvent[]; // 최신순
  teacherSeenAt: number;
}

function parse(raw: Record<string, unknown> | undefined): InboxState {
  const events: InboxEvent[] = [];
  for (const [k, v] of Object.entries(raw ?? {})) {
    const m = /^s_(\d+)$/.exec(k);
    if (!m || !v || typeof v !== "object") continue;
    for (const [kind, at] of Object.entries(v as Record<string, unknown>))
      if (kind in KIND_LABEL && typeof at === "number")
        events.push({ sid: Number(m[1]), kind: kind as InboxKind, at });
  }
  events.sort((a, b) => b.at - a.at);
  const seen = raw?.teacherSeenAt;
  return { events, teacherSeenAt: typeof seen === "number" ? seen : 0 };
}

/** 교사 종 — 문서 1개를 1분마다 (다른 탭에 있어도 계속: 알림이 '오게' 하는 게 목적) */
export function useInbox(enabled: boolean) {
  return useQuery({
    queryKey: ["inbox"],
    enabled,
    queryFn: async (): Promise<InboxState> => {
      const snap = await getDoc(REF());
      return parse(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: false, // 규칙 미게시(permission-denied)면 조용히 — 종이 안 뜰 뿐
  });
}

export function unseen(state: InboxState | undefined): InboxEvent[] {
  if (!state) return [];
  return state.events.filter((e) => e.at > state.teacherSeenAt);
}

/** 알림함을 열었다 — 모든 기기의 종이 꺼진다 */
export function useMarkInboxSeen() {
  const qc = useQueryClient();
  return async () => {
    const at = Date.now();
    qc.setQueryData<InboxState>(["inbox"], (o) => (o ? { ...o, teacherSeenAt: at } : o));
    await setDoc(REF(), { teacherSeenAt: at }, { merge: true }).catch(() => {});
  };
}

/** 종류별로 다시 읽을 목록 — 새 신호가 오거나 알림 게시판을 열 때 (캐시가 몇 분 묵어 '안 보이던' 문제) */
export const INBOX_SOURCE_KEYS: Record<InboxKind, unknown[][]> = {
  shop: [["pendingRequests"], ["shopDecidedRecent"]],
  shopFail: [],
  letter: [["letters", "board"], ["letters", "allMeta"], ["letters", "waiting"]],
  menu: [["menuRequests"]],
  appeal: [["appeals"]],
  seat: [["pendingSeatRequests"]],
  board: [["suggestions"]],
  hidden: [["hiddenNominations"], ["suggestions"]],
};
export function refreshInboxSources(qc: ReturnType<typeof useQueryClient>, kinds?: InboxKind[]) {
  const ks = kinds ?? (Object.keys(INBOX_SOURCE_KEYS) as InboxKind[]);
  for (const k of ks) for (const key of INBOX_SOURCE_KEYS[k]) void qc.invalidateQueries({ queryKey: key });
}
