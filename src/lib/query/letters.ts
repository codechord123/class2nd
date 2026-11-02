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
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { pingInbox } from "@/lib/query/inbox";
import { students } from "@/lib/roster";
import { todayKST } from "@/lib/date";

/** 보낸 사람 — 선생님이거나 그 우체통 주인 학생 (학생끼리는 없다) */
export type LetterFrom = number | "teacher";

export interface Letter {
  id: string;
  from: LetterFrom;
  text: string;
  createdAt: number;
  readAt?: number; // 교사가 편지함에서 읽은 시각 (학생 편지만)
  tags?: string[]; // 교사가 붙인 태그 (모아보기용)
}

/** 편지함(전체 모아보기)의 한 줄 — 어느 학생 우체통의 편지인지 함께 */
export interface BoardLetter extends Letter {
  owner: number;
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

// permission-denied는 그대로 던진다 — 호출부의 withReauth가 '기기 연결 풀림'을 비밀번호 한 번으로
// 고치고 다시 시도한다. (예전엔 여기서 "우체통이 안 열렸어요"로 바꿔 던져, 진짜 원인이 가려졌다)
function friendly(e: unknown, fallback: string): unknown {
  if ((e as { code?: string })?.code === "permission-denied") return e;
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
      pingInbox(myId, "letter"); // 📬 교사 종
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
    // 받은 아이들의 대화·배지만 — ["letters"] 통째로 무효화하면 편지함(최대 500통)까지 다시 읽는다
    for (const to of toIds) {
      void qc.invalidateQueries({ queryKey: ["letters", "items", to] });
      void qc.invalidateQueries({ queryKey: ["letters", "meta", to] });
    }
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

// ── 📬 교사 편지함: 모든 학생 편지를 게시판처럼 한 번에 ─────────────────────
// 학생을 하나씩 눌러야만 보이던 문제(2026-11 사용자) → 컬렉션 그룹(items) 하나로 모은다.
//   기본: 최근 N일을 최신순으로 (컬렉션 그룹 단일 필드 색인 필요 — 콘솔 링크로 1회 생성)
//   색인이 아직 없으면 failed-precondition → 전체를 한 번 읽어 화면에서 거른다(편지 수가 적어 감당 가능)
//   규칙: match /{path=**}/items/{id} 교사 읽기 (게시 전엔 permission-denied)
export const DEFAULT_LETTER_TAGS = ["고민", "친구관계", "가정", "학습", "건의", "감사", "상담 필요", "확인 완료"];

export function useAllLetters(enabled: boolean, days: number) {
  return useQuery({
    queryKey: ["letters", "board", days],
    enabled,
    queryFn: async (): Promise<{ letters: BoardLetter[]; indexUrl: string | null }> => {
      const since = days > 0 ? Date.now() - days * 86400000 : 0;
      const toRow = (d: { id: string; ref: { parent: { parent: { id: string } | null } }; data: () => unknown }) => {
        const raw = d.data() as Omit<Letter, "id">;
        return { id: d.id, owner: Number(d.ref.parent.parent?.id), ...raw } as BoardLetter;
      };
      let indexUrl: string | null = null;
      let rows: BoardLetter[];
      try {
        const snap = await getDocs(
          query(
            collectionGroup(db(), "items"),
            where("createdAt", ">=", since),
            orderBy("createdAt", "desc"),
            limit(500)
          )
        );
        rows = snap.docs.map(toRow);
      } catch (e) {
        if ((e as { code?: string })?.code !== "failed-precondition") throw e;
        indexUrl = /https:\/\/console\.firebase\.google\.com\S+/.exec(String((e as Error).message))?.[0] ?? null;
        const snap = await getDocs(collectionGroup(db(), "items"));
        rows = snap.docs.map(toRow).filter((l) => l.createdAt >= since);
      }
      return {
        letters: rows.filter((l) => Number.isFinite(l.owner)).sort((a, b) => b.createdAt - a.createdAt),
        indexUrl,
      };
    },
    staleTime: 60 * 1000,
  });
}

function patchBoard(qc: ReturnType<typeof useQueryClient>, owner: number, id: string, patch: Partial<Letter>) {
  qc.setQueriesData<{ letters: BoardLetter[]; indexUrl: string | null }>(
    { queryKey: ["letters", "board"] },
    (o) => o && { ...o, letters: o.letters.map((l) => (l.owner === owner && l.id === id ? { ...l, ...patch } : l)) }
  );
}

/** 교사가 편지를 열었다 — 그 편지 읽음 + 그 학생 '답장 기다림' 배지도 내린다 */
export function useMarkLetterRead() {
  const qc = useQueryClient();
  return async (l: BoardLetter) => {
    if (l.readAt || l.from === "teacher") return;
    const at = Date.now();
    patchBoard(qc, l.owner, l.id, { readAt: at });
    await updateDoc(doc(db(), "letters", String(l.owner), "items", l.id), { readAt: at }).catch(() => {});
    await setDoc(doc(db(), "letters", String(l.owner)), { teacherSeenAt: at }, { merge: true }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ["letters", "waiting"] });
  };
}

export function useSetLetterTags() {
  const qc = useQueryClient();
  return async (l: BoardLetter, tags: string[]) => {
    patchBoard(qc, l.owner, l.id, { tags });
    await updateDoc(doc(db(), "letters", String(l.owner), "items", l.id), { tags });
  };
}

/** 편지 태그 목록 — 교사가 관리 (없으면 기본값) */
export function useLetterTags(enabled: boolean) {
  return useQuery({
    queryKey: ["letterTags"],
    enabled,
    queryFn: async (): Promise<string[]> => {
      const snap = await getDoc(doc(db(), "classData", "letterTags"));
      const list = snap.exists() ? (snap.data().tags as unknown) : null;
      return Array.isArray(list) && list.length ? (list as string[]) : DEFAULT_LETTER_TAGS;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveLetterTags() {
  const qc = useQueryClient();
  return async (tags: string[]) => {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    await setDoc(doc(db(), "classData", "letterTags"), { tags: clean }, { merge: true });
    qc.setQueryData(["letterTags"], clean);
  };
}

/** 학생별 부모 문서(읽음 시각) — 편지함을 열 때 1회 25개. 예전 편지의 '읽음' 판정 재료 */
export function useAllMailMeta(enabled: boolean) {
  return useQuery({
    queryKey: ["letters", "allMeta"],
    enabled,
    queryFn: async (): Promise<Record<number, MailMeta>> => {
      const d = db();
      const active = students.filter((s) => !s.inactive);
      const snaps = await Promise.all(active.map((s) => getDoc(doc(d, "letters", String(s.id)))));
      const out: Record<number, MailMeta> = {};
      active.forEach((s, i) => {
        out[s.id] = snaps[i].exists() ? normalizeMeta(snaps[i].data()) : EMPTY_META;
      });
      return out;
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 안 읽은 학생 편지 — readAt이 없고, 그 학생 대화를 마지막으로 연 시각보다 나중에 온 것 */
export function isUnreadLetter(l: BoardLetter, metas: Record<number, MailMeta> | undefined): boolean {
  if (l.from === "teacher" || l.readAt) return false;
  return l.createdAt > (metas?.[l.owner]?.teacherSeenAt ?? 0);
}
