"use client";
// 💌 비밀 우체통
//   letters/{학생번호}            부모 문서 — lastAt(마지막 수신 시각) · seenAt(읽음) ·
//                                 flags(숨김·신고 표시) · sent(내가 보낸 사본)
//   letters/{학생번호}/items/{id} 편지 본문 1통 = 문서 1개
//
// 왜 편지를 배열이 아니라 서브컬렉션 문서로 두는가 (보안):
//   배열(arrayUnion)로 두면 보안 규칙이 '누가 무엇을 넣었는지'를 검증할 수 없다.
//   문서 1통 = 1문서로 두면 create 규칙에서 from이 진짜 보낸 사람인지(ownsStudent)
//   대조할 수 있어 '남의 이름을 사칭한 편지'가 원천 차단되고, update·delete를 교사
//   전용으로 막아 받은 편지를 학생이 고치거나 지우는 것도 막힌다(기록 보존).
//
// 읽기 예산:
//   홈 배지   = 부모 문서 1회 (lastAt > seenAt 비교만 — 편지 본문은 안 읽는다)
//   우체통 열기 = 부모 1 + 최근 편지 50통 (하루 한두 번)
//   교사       = 고른 학생 1명분만 (전원 일괄 조회 금지 — 읽기 폭발 방지)
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students } from "@/lib/roster";
import { todayKST } from "@/lib/date";

export type LetterFrom = number | "teacher";

export interface Letter {
  id: string;
  from: LetterFrom;
  text: string;
  createdAt: number;
}

export interface SentLetter {
  id: string;
  to: number;
  text: string;
  createdAt: number;
}

/** 받는 사람이 붙이는 표시 — 편지 문서가 아니라 부모 문서에 따로 둔다(편지는 불변) */
export interface LetterFlag {
  hidden?: boolean;
  reported?: boolean;
}

export interface MailMeta {
  lastAt: number; // 마지막으로 편지가 도착한 시각
  seenAt: number; // 우체통을 연 시각
  flags: Record<string, LetterFlag>;
  sent: SentLetter[];
}

export const LETTER_MIN = 10;
export const LETTER_MAX = 500;
export const DAILY_SEND_LIMIT = 5;
export const LETTER_PAGE = 50;

const EMPTY_META: MailMeta = { lastAt: 0, seenAt: 0, flags: {}, sent: [] };

function normalizeMeta(raw: unknown): MailMeta {
  const d = (raw ?? {}) as Partial<MailMeta>;
  return {
    lastAt: typeof d.lastAt === "number" ? d.lastAt : 0,
    seenAt: typeof d.seenAt === "number" ? d.seenAt : 0,
    flags: d.flags && typeof d.flags === "object" ? d.flags : {},
    sent: Array.isArray(d.sent) ? d.sent : [],
  };
}

function friendly(e: unknown, fallback: string): Error {
  if ((e as { code?: string })?.code === "permission-denied")
    return new Error("아직 우체통이 열리지 않았어요 — 선생님께 알려주세요! 🙂");
  return e instanceof Error ? e : new Error(fallback);
}

/** KST 기준 날짜 (todayKST와 같은 기준) — 하루 발송 상한 판정용 */
function dayOf(ts: number): string {
  return new Date(ts + 9 * 3600000).toISOString().slice(0, 10);
}

// ── 부모 문서 (배지·표시·보낸 사본) — 문서 1개 ──────────────────────────────
export function useMailMeta(sid: number | null) {
  return useQuery({
    queryKey: ["letters", "meta", sid],
    enabled: sid != null,
    queryFn: async (): Promise<MailMeta> => {
      const snap = await getDoc(doc(db(), "letters", String(sid)));
      return snap.exists() ? normalizeMeta(snap.data()) : EMPTY_META;
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 안 읽은 편지가 있는가 — 본문을 읽지 않고 시각 비교만 (홈 배지, 추가 읽기 0) */
export function hasUnread(meta: MailMeta | undefined): boolean {
  return !!meta && meta.lastAt > meta.seenAt;
}

export function sentTodayCount(meta: MailMeta | undefined): number {
  const t = todayKST();
  return (meta?.sent ?? []).filter((s) => dayOf(s.createdAt) === t).length;
}

// ── 편지 본문 — 우체통을 열 때만 읽는다 ────────────────────────────────────
export function useLetters(sid: number | null, enabled = true) {
  return useQuery({
    queryKey: ["letters", "items", sid],
    enabled: enabled && sid != null,
    queryFn: async (): Promise<Letter[]> => {
      const q = query(
        collection(db(), "letters", String(sid), "items"),
        orderBy("createdAt", "desc"),
        limit(LETTER_PAGE)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Letter, "id">) }));
    },
    staleTime: 60 * 1000,
  });
}

// ── 보내기 ────────────────────────────────────────────────────────────────
export function useSendLetter(myId: number | null) {
  const qc = useQueryClient();
  return async (to: number, text: string) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    const body = text.trim();
    if (body.length < LETTER_MIN) throw new Error(`편지는 ${LETTER_MIN}글자 이상 써주세요.`);
    if (body.length > LETTER_MAX) throw new Error(`편지는 ${LETTER_MAX}글자까지 쓸 수 있어요.`);
    if (to === myId) throw new Error("나에게는 편지를 보낼 수 없어요.");
    if (students.find((s) => s.id === to)?.inactive)
      throw new Error("전학 간 친구에게는 보낼 수 없어요.");

    const at = Date.now();
    const d = db();
    let newId: string;
    try {
      // ① 편지 본문 — 받는 사람 우체통에 문서 1개 (규칙이 from = 나인지 대조한다)
      const ref = await addDoc(collection(d, "letters", String(to), "items"), {
        from: myId,
        text: body,
        createdAt: at,
      });
      newId = ref.id;
      // ② 도착 표시 — 받는 사람 홈 배지가 본문을 읽지 않고도 뜰 수 있게
      await setDoc(doc(d, "letters", String(to)), { lastAt: at }, { merge: true });
    } catch (e) {
      throw friendly(e, "편지를 보내지 못했어요.");
    }
    // ③ 내 보낸 사본 — 비밀 우체통이라 상대 문서를 읽을 수 없어서, 이게 없으면
    //    내가 무엇을 보냈는지조차 볼 수 없다. 실패해도 편지 전달엔 영향 없음.
    const copy: SentLetter = { id: newId, to, text: body, createdAt: at };
    const mineRef = doc(d, "letters", String(myId));
    const mine = qc.getQueryData<MailMeta>(["letters", "meta", myId]) ?? EMPTY_META;
    const nextSent = [...mine.sent, copy];
    await setDoc(mineRef, { sent: nextSent }, { merge: true }).catch(() => {});
    qc.setQueryData(["letters", "meta", myId], { ...mine, sent: nextSent });
  };
}

/** 읽음 표시 — 우체통을 연 순간 배지가 사라진다 */
export function useMarkMailSeen(myId: number | null) {
  const qc = useQueryClient();
  return async () => {
    if (myId == null) return;
    const at = Date.now();
    qc.setQueryData(["letters", "meta", myId], (prev: MailMeta | undefined) => ({
      ...(prev ?? EMPTY_META),
      seenAt: at,
    }));
    await setDoc(doc(db(), "letters", String(myId)), { seenAt: at }, { merge: true }).catch(
      () => {}
    );
  };
}

/** 숨김·신고 — 편지 문서는 불변이라 표시는 부모 문서 flags에 남긴다 */
export function useFlagLetter(myId: number | null) {
  const qc = useQueryClient();
  return async (letterId: string, patch: LetterFlag) => {
    if (myId == null) return;
    const prev = qc.getQueryData<MailMeta>(["letters", "meta", myId]) ?? EMPTY_META;
    const nextFlag = { ...(prev.flags[letterId] ?? {}), ...patch };
    const flags = { ...prev.flags, [letterId]: nextFlag };
    qc.setQueryData(["letters", "meta", myId], { ...prev, flags });
    try {
      await setDoc(doc(db(), "letters", String(myId)), { flags }, { merge: true });
    } catch (e) {
      qc.setQueryData(["letters", "meta", myId], prev); // 롤백
      throw friendly(e, "처리하지 못했어요.");
    }
  };
}

// ── 교사용 ────────────────────────────────────────────────────────────────
/** 선생님이 편지 보내기 — 여러 명에게 한 번에 (반 전체 편지도 한 번에) */
export function useTeacherSendLetter() {
  const qc = useQueryClient();
  return async (toIds: number[], text: string) => {
    const body = text.trim();
    if (!body) throw new Error("편지 내용을 적어주세요.");
    if (body.length > LETTER_MAX) throw new Error(`편지는 ${LETTER_MAX}글자까지 쓸 수 있어요.`);
    if (!toIds.length) throw new Error("받는 학생을 골라주세요.");
    const d = db();
    const at = Date.now();
    await Promise.all(
      toIds.map(async (to) => {
        await addDoc(collection(d, "letters", String(to), "items"), {
          from: "teacher",
          text: body,
          createdAt: at,
        });
        await setDoc(doc(d, "letters", String(to)), { lastAt: at }, { merge: true });
      })
    );
    void qc.invalidateQueries({ queryKey: ["letters"] });
  };
}

/** 교사 삭제 — 학생은 숨김만 가능하고 실제 삭제는 교사 권한 */
export function useDeleteLetter() {
  const qc = useQueryClient();
  return async (ownerId: number, letterId: string) => {
    await deleteDoc(doc(db(), "letters", String(ownerId), "items", letterId));
    void qc.invalidateQueries({ queryKey: ["letters", "items", ownerId] });
  };
}
