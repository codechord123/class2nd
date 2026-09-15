"use client";
// 💌 비밀 우체통 — 선생님과 학생 '둘 사이'만 오가는 편지 (사용자 확정 2026-09-15).
//   학생끼리는 보낼 수 없다. 그래서 우체통 하나가 곧 그 학생과 선생님의 1:1 대화다.
//
//   letters/{학생번호}            부모 — 배지·읽음 시각만
//     lastAt        선생님이 마지막으로 보낸 시각  (학생 홈 배지)
//     seenAt        학생이 마지막으로 연 시각
//     studentLastAt 학생이 마지막으로 보낸 시각    (교사 '답장 기다리는 중' 배지)
//     teacherSeenAt 선생님이 그 학생 대화를 마지막으로 연 시각
//   letters/{학생번호}/items/{id} 편지 1통 = 문서 1개, from = "teacher" | 그 학생 번호
//
// 편지를 배열이 아니라 문서로 둔 이유(보안): create 규칙에서 '자기 우체통에 자기
// 이름으로'만 쓰게 대조할 수 있다 → 학생이 남의 우체통에 쓰는 길 자체가 없다.
// 받은 편지의 update·delete는 교사 전용이라 위조·증거 인멸도 불가능하다.
//
// 읽기 예산: 학생 홈 배지 = 부모 문서 1회(시각 비교만) · 우체통 열기 = 부모 1 + 최근 50통
//   교사 '답장 기다리는 학생' 배지 = 부모 문서 25개(교사가 오늘 탭을 열 때만)
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

/** 보낸 사람 — 선생님이거나 그 우체통 주인 학생 (학생끼리는 없다) */
export type LetterFrom = number | "teacher";

export interface Letter {
  id: string;
  from: LetterFrom;
  text: string;
  createdAt: number;
}

export interface MailMeta {
  lastAt: number; // 선생님 → 학생 (학생 배지)
  seenAt: number; // 학생이 연 시각
  studentLastAt: number; // 학생 → 선생님 (교사 배지)
  teacherSeenAt: number; // 선생님이 그 대화를 연 시각
}

export const LETTER_MIN = 10;
export const LETTER_MAX = 500;
export const DAILY_SEND_LIMIT = 5; // 학생이 선생님께 하루에 보낼 수 있는 통수
export const LETTER_PAGE = 50;

const EMPTY_META: MailMeta = { lastAt: 0, seenAt: 0, studentLastAt: 0, teacherSeenAt: 0 };

function normalizeMeta(raw: unknown): MailMeta {
  const d = (raw ?? {}) as Partial<MailMeta>;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    lastAt: n(d.lastAt),
    seenAt: n(d.seenAt),
    studentLastAt: n(d.studentLastAt),
    teacherSeenAt: n(d.teacherSeenAt),
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

// ── 부모 문서 (배지·읽음 시각) — 문서 1개 ──────────────────────────────────
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

/** 학생 홈 배지 — 선생님 편지가 내가 연 뒤에 왔는가 (본문을 읽지 않고 시각 비교만) */
export function hasUnread(meta: MailMeta | undefined): boolean {
  return !!meta && meta.lastAt > meta.seenAt;
}

/** 교사 배지 — 그 학생이 보낸 편지를 아직 안 읽었는가 */
export function waitingForTeacher(meta: MailMeta | undefined): boolean {
  return !!meta && meta.studentLastAt > meta.teacherSeenAt;
}

// ── 편지(대화) — 우체통을 열 때만 읽는다 ───────────────────────────────────
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

/** 오늘 내가 선생님께 보낸 통수 — 이미 읽어둔 대화에서 세므로 추가 읽기 0 */
export function sentTodayCount(letters: Letter[] | undefined, myId: number | null): number {
  if (myId == null) return 0;
  const t = todayKST();
  return (letters ?? []).filter((l) => l.from === myId && dayOf(l.createdAt) === t).length;
}

// ── 학생 → 선생님 ─────────────────────────────────────────────────────────
export function useSendToTeacher(myId: number | null) {
  const qc = useQueryClient();
  return async (text: string) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    const body = text.trim();
    if (body.length < LETTER_MIN) throw new Error(`편지는 ${LETTER_MIN}글자 이상 써주세요.`);
    if (body.length > LETTER_MAX) throw new Error(`편지는 ${LETTER_MAX}글자까지 쓸 수 있어요.`);
    const at = Date.now();
    const d = db();
    try {
      // 내 우체통에 내 이름으로 — 규칙이 이 조합만 허용한다 (남의 우체통엔 못 쓴다)
      await addDoc(collection(d, "letters", String(myId), "items"), {
        from: myId,
        text: body,
        createdAt: at,
      });
      // 선생님 쪽 '답장 기다리는 중' 배지
      await setDoc(doc(d, "letters", String(myId)), { studentLastAt: at }, { merge: true });
    } catch (e) {
      throw friendly(e, "편지를 보내지 못했어요.");
    }
    void qc.invalidateQueries({ queryKey: ["letters", "items", myId] });
    qc.setQueryData(["letters", "meta", myId], (prev: MailMeta | undefined) => ({
      ...(prev ?? EMPTY_META),
      studentLastAt: at,
    }));
  };
}

/** 학생이 우체통을 연 순간 — 홈 배지가 사라진다 */
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

// ── 교사용 ────────────────────────────────────────────────────────────────
/** 선생님 → 학생 (여러 명에게 한 번에도 가능) */
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

/** 선생님이 그 학생 대화를 열었다고 표시 — '답장 기다리는 중' 배지가 내려간다 */
export function useMarkTeacherSeen() {
  const qc = useQueryClient();
  return async (sid: number) => {
    const at = Date.now();
    qc.setQueryData(["letters", "meta", sid], (prev: MailMeta | undefined) => ({
      ...(prev ?? EMPTY_META),
      teacherSeenAt: at,
    }));
    await setDoc(doc(db(), "letters", String(sid)), { teacherSeenAt: at }, { merge: true }).catch(
      () => {}
    );
  };
}

/** 답장을 기다리는 학생들 — 교사가 '오늘' 탭을 열 때만 부모 문서 25개를 읽는다 */
export function useWaitingStudents(enabled: boolean) {
  return useQuery({
    queryKey: ["letters", "waiting"],
    enabled,
    queryFn: async (): Promise<number[]> => {
      const d = db();
      const active = students.filter((s) => !s.inactive);
      const snaps = await Promise.all(
        active.map((s) => getDoc(doc(d, "letters", String(s.id))))
      );
      return active
        .filter((_, i) => waitingForTeacher(snaps[i].exists() ? normalizeMeta(snaps[i].data()) : undefined))
        .map((s) => s.id);
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 교사 삭제 — 학생은 편지를 지울 수 없다 (기록 보존) */
export function useDeleteLetter() {
  const qc = useQueryClient();
  return async (ownerId: number, letterId: string) => {
    await deleteDoc(doc(db(), "letters", String(ownerId), "items", letterId));
    void qc.invalidateQueries({ queryKey: ["letters", "items", ownerId] });
  };
}
