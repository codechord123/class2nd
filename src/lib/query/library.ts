"use client";
// 📚 학급문고 대출 — 사서 학생(교사 지정)이 빌릴 때마다 책 제목·빌린 학생·반납 기한을 적는다.
// (사용자 확정 2026-10-22: 책 목록 미리 등록 없음 · 7일 · 2권 · 연장 1회 · 사서 활동 점수 없음 ·
//  연체만 감점 — 하루마다 5점이 기본, 교사가 '1회 5점'으로 바꿀 수 있다)
//
// 데이터: libraryLoans/{자동 id} — 대출 1건 = 문서 1개
//   { title, author, sid, out, due, ext(0|1), returned(null|"YYYY-MM-DD"), lost, by, createdAt }
//   by = 기록한 사서 학생 번호(규칙이 사서인지 대조) | "teacher"
// 읽기 예산: 사서·교사 데스크는 '대출 중'(returned==null)만, 학생은 '내 것'(sid==나)만 읽는다.
//   둘 다 단일 등호 조건이라 색인 추가 불필요. 연체 감점은 집계(aggregateDate)가 같은 방식으로 계산.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isWeekend, shiftDate } from "@/lib/date";
import type { ClassSettings } from "@/types";

export interface Loan {
  id: string;
  title: string;
  author: string;
  sid: number;
  out: string;
  due: string;
  ext: number;
  returned: string | null;
  lost: boolean;
  by: number | "teacher";
  createdAt: number;
  /** 🔧 책 상태 — 빌려줄 때(condOut)·돌려받을 때(condIn). 빈 배열 = 깨끗 (사용자 요청 2026-10-22) */
  condOut: string[];
  noteOut: string;
  condIn: string[] | null; // 반납 전엔 null
  noteIn: string;
  /** 돌려받을 때 '빌릴 때 없던' 훼손이 생겼다 → 선생님 확인 전까지 true (개요 알림) */
  damageNew: boolean;
  /** 📚 학급문고 목록의 책 id — 같은 책의 대출 이력을 잇는 고리 (옛 기록은 자동 이관) */
  bookId: string | null;
}

// ── 📚 학급문고 목록 (빌려줄 때 자동으로 쌓인다 — 사용자 확정 2026-10-22) ─────────────
// library/catalog 문서 하나에 모든 책 — 목록을 열 때 읽기 1번. 300권이어도 수십 KB.
// 빌린 학생 이름은 목록에 두지 않는다(학생 화면엔 '대출 중 · 반납 예정일'까지만 — 망신 방지).
export interface Book {
  id: string;
  t: string; // 제목
  a: string; // 지은이
  k: string; // 찾기 키 (띄어쓰기·문장부호 무시) — '어린왕자' = '어린 왕자'
  copy: number; // 같은 책 몇 번째 권 (1 = 첫 권)
  c: string[]; // 지금 상태 (마지막 반납 상태가 다음 대출의 '빌릴 때 상태'로 이어진다)
  n: number; // 빌려 간 횟수
  on: { loan: string; due: string } | null; // 대출 중이면 그 대출
  lost: boolean;
  at: number;
}
export interface Catalog {
  books: Record<string, Book>;
  migratedAt?: number;
}
export const bookKey = (t: string) =>
  t.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
const CIRCLED = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
export const bookLabel = (b: Pick<Book, "t" | "copy">) =>
  b.copy > 1 ? `${b.t} ${CIRCLED[b.copy] ?? `(${b.copy})`}` : b.t;
const catalogRef = () => doc(db(), "library", "catalog");

function toBook(id: string, x: Record<string, unknown>): Book {
  const on = x.on as { loan?: string; due?: string } | null | undefined;
  return {
    id,
    t: String(x.t ?? ""),
    a: String(x.a ?? ""),
    k: String(x.k ?? bookKey(String(x.t ?? ""))),
    copy: Number(x.copy ?? 1) || 1,
    c: Array.isArray(x.c) ? (x.c as string[]) : [],
    n: Number(x.n ?? 0) || 0,
    on:
      on && on.loan
        ? { loan: String(on.loan), due: String(on.due ?? "") }
        : null,
    lost: x.lost === true,
    at: Number(x.at ?? 0),
  };
}
function parseCatalog(data: Record<string, unknown> | undefined): Catalog {
  const raw = (data?.books ?? {}) as Record<string, Record<string, unknown>>;
  const books: Record<string, Book> = {};
  for (const [id, x] of Object.entries(raw))
    if (x && typeof x === "object") books[id] = toBook(id, x);
  return {
    books,
    migratedAt:
      typeof data?.migratedAt === "number" ? data.migratedAt : undefined,
  };
}

export function useCatalog(enabled = true) {
  return useQuery({
    queryKey: ["library", "catalog"],
    enabled,
    queryFn: async () => {
      const snap = await getDoc(catalogRef());
      return snap.exists() ? parseCatalog(snap.data()) : { books: {} };
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 한 책의 대출 이력 — 책 팝업을 열 때만 */
export function useBookLoans(bookId: string | null) {
  return useQuery({
    queryKey: ["library", "book", bookId],
    enabled: bookId != null,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db(), "libraryLoans"), where("bookId", "==", bookId)),
      );
      return snap.docs.map(toLoan).sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 60 * 1000,
  });
}

/** 훼손 종류 — 사서가 눌러 고른다 (아무것도 안 고르면 '깨끗해요') */
export const CONDITIONS = [
  "낙서",
  "찢어짐",
  "젖음",
  "접힘·구김",
  "표지 손상",
  "낱장 빠짐",
] as const;
export const COND_NOTE_MAX = 80;
export const condLabel = (c: string[] | null | undefined) =>
  !c || !c.length ? "깨끗해요" : c.join(" · ");
/** 빌릴 때 없던 훼손만 — 이게 있으면 '그 대출 기간에 생긴' 훼손 */
export const newDamage = (out: string[], inn: string[] | null) =>
  (inn ?? []).filter((x) => !out.includes(x));

// ── 규칙 기본값 (교사 설정이 비어 있으면) ─────────────────────────────────────
export const DEFAULT_LIBRARIANS = [15, 18]; // 이다인 · 이채연 (사용자 지정 2026-10-22)
export const DEFAULT_LOAN_DAYS = 7;
export const DEFAULT_LOAN_MAX = 2;
export const LOAN_EXT_MAX = 1;
export const DEFAULT_LATE_PENALTY = 5;
export const TITLE_MAX = 60;
export const AUTHOR_MAX = 40;

export function libraryRules(s: ClassSettings | undefined) {
  return {
    librarians: s?.librarians ?? DEFAULT_LIBRARIANS,
    days: s?.loanDays ?? DEFAULT_LOAN_DAYS,
    max: s?.loanMax ?? DEFAULT_LOAN_MAX,
    penalty: s?.latePenalty ?? DEFAULT_LATE_PENALTY,
    mode: (s?.lateMode ?? "daily") as "daily" | "once",
    holidays: s?.holidays ?? [],
  };
}

// ── 날짜 계산 ─────────────────────────────────────────────────────────────
const isOff = (d: string, holidays: string[]) =>
  isWeekend(d) || holidays.includes(d);

/** 기한이 주말·공휴일이면 다음 학사일로 (반납할 수 없는 날이 기한이 되지 않게) */
export function dueFrom(
  out: string,
  days: number,
  holidays: string[] = [],
): string {
  let d = shiftDate(out, days);
  while (isOff(d, holidays)) d = shiftDate(d, 1);
  return d;
}

/** 기한 다음 첫 학사일 — '1회 감점' 방식에서 감점하는 날 */
export function firstLateDay(due: string, holidays: string[] = []): string {
  let d = shiftDate(due, 1);
  while (isOff(d, holidays)) d = shiftDate(d, 1);
  return d;
}

/** 오늘 기준 연체 학사일 수 (기한 다음 날부터 오늘까지, 주말·공휴일 제외) — 0이면 연체 아님 */
export function lateDays(
  l: Pick<Loan, "due" | "returned" | "lost">,
  today: string,
  holidays: string[] = [],
): number {
  if (l.returned || l.lost || today <= l.due) return 0;
  let n = 0;
  for (let d = shiftDate(l.due, 1); d <= today; d = shiftDate(d, 1))
    if (!isOff(d, holidays)) n++;
  return n;
}

/** 남은 일수 (달력 기준) — 음수면 지남 */
export function daysLeft(due: string, today: string): number {
  return Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  );
}

/**
 * 📚 그날(date)의 연체 감점 — 집계가 쓴다. 학생 번호 → 감점(양수).
 *  · daily: 그날 기한이 지난 책을 안 돌려준 학생은 그날 −penalty (여러 권이어도 하루 1번)
 *  · once : 책마다 '기한 다음 첫 학사일'에 한 번 −penalty
 *  그날 반납했으면 그날은 감점하지 않는다(돌려주면 바로 멈춤). 분실 처리된 책은 제외(교사가 따로 정리).
 */
export function latePenaltyOn(
  loans: Pick<Loan, "sid" | "due" | "out" | "returned" | "lost">[],
  date: string,
  rules: { penalty: number; mode: "daily" | "once"; holidays: string[] },
): Record<number, number> {
  const out: Record<number, number> = {};
  if (rules.penalty <= 0) return out;
  for (const l of loans) {
    if (l.lost || l.out > date || l.due >= date) continue;
    if (l.returned && l.returned <= date) continue; // 그날까지 돌려줬다
    if (rules.mode === "daily") out[l.sid] = rules.penalty;
    else if (firstLateDay(l.due, rules.holidays) === date)
      out[l.sid] = (out[l.sid] ?? 0) + rules.penalty;
  }
  return out;
}

/** 집계용: 그날 연체 판단에 필요한 대출만 (대출 중 + 그날 이후 반납) — 색인 추가 없는 두 질의 */
export async function loansForDate(date: string): Promise<Loan[]> {
  const col = collection(db(), "libraryLoans");
  const [act, later] = await Promise.all([
    getDocs(query(col, where("returned", "==", null))),
    getDocs(query(col, where("returned", ">", date))),
  ]);
  return [...act.docs, ...later.docs].map(toLoan);
}

function toLoan(d: { id: string; data: () => Record<string, unknown> }): Loan {
  const x = d.data();
  return {
    id: d.id,
    title: String(x.title ?? ""),
    author: String(x.author ?? ""),
    sid: Number(x.sid),
    out: String(x.out ?? ""),
    due: String(x.due ?? ""),
    ext: Number(x.ext ?? 0),
    returned: typeof x.returned === "string" ? x.returned : null,
    lost: x.lost === true,
    by: x.by === "teacher" ? "teacher" : Number(x.by),
    createdAt: Number(x.createdAt ?? 0),
    condOut: Array.isArray(x.condOut) ? (x.condOut as string[]) : [],
    noteOut: String(x.noteOut ?? ""),
    condIn: Array.isArray(x.condIn) ? (x.condIn as string[]) : null,
    noteIn: String(x.noteIn ?? ""),
    damageNew: x.damageNew === true,
    bookId: typeof x.bookId === "string" ? x.bookId : null,
  };
}

// ── 조회 ───────────────────────────────────────────────────────────────────
const ACTIVE = ["library", "active"];

/** 지금 대출 중인 책 전부 (사서·교사 데스크, 교사 개요 연체 알림) */
export function useActiveLoans(enabled: boolean) {
  return useQuery({
    queryKey: ACTIVE,
    enabled,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db(), "libraryLoans"), where("returned", "==", null)),
      );
      return snap.docs.map(toLoan).sort((a, b) => a.due.localeCompare(b.due));
    },
    staleTime: 60 * 1000,
  });
}

/** 내 대출 기록 (빌린 것 + 돌려준 것) — 학생 화면 */
export function useMyLoans(sid: number | null) {
  return useQuery({
    queryKey: ["library", "mine", sid],
    enabled: sid != null,
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db(), "libraryLoans"),
          where("sid", "==", sid),
          limit(50),
        ),
      );
      return snap.docs.map(toLoan).sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 🔧 새 훼손으로 돌아온 책 (선생님 확인 전) — 교사 개요·데스크 알림 */
export function useDamageAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["library", "damage"],
    enabled,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db(), "libraryLoans"), where("damageNew", "==", true)),
      );
      return snap.docs
        .map(toLoan)
        .sort((a, b) => (b.returned ?? "").localeCompare(a.returned ?? ""));
    },
    staleTime: 60 * 1000,
  });
}

/** 최근 기록 — 사서·교사가 펼칠 때만 */
export function useLoanHistory(enabled: boolean, n = 40) {
  return useQuery({
    queryKey: ["library", "history", n],
    enabled,
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db(), "libraryLoans"),
          orderBy("createdAt", "desc"),
          limit(n),
        ),
      );
      return snap.docs.map(toLoan);
    },
    staleTime: 60 * 1000,
  });
}

// ── 쓰기 (사서·교사) ─────────────────────────────────────────────────────────
function useRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["library"] });
}

/** by: 사서 학생 번호 또는 "teacher" — 규칙이 사서 명단과 기기 소유를 대조한다.
 *  bookId가 있으면 그 책을, 없으면 같은 제목의 '빌릴 수 있는 권'을 찾고, 그것도 없으면
 *  학급문고에 새 책으로 등록하며 빌려준다. 한 트랜잭션이라 두 사서가 같은 책을 동시에
 *  빌려줘도 한 명만 성공한다. */
export function useLend(by: number | "teacher" | null) {
  const refresh = useRefresh();
  return async (p: {
    title: string;
    author: string;
    sid: number;
    out: string;
    due: string;
    condOut: string[];
    noteOut: string;
    bookId?: string | null;
    newCopy?: boolean; // 같은 제목이 다 대출 중일 때 '한 권 더' 등록
  }) => {
    if (by == null) throw new Error("사서만 기록할 수 있어요.");
    const title = p.title.trim();
    if (!title) throw new Error("책 제목을 적어 주세요.");
    if (title.length > TITLE_MAX)
      throw new Error(`제목은 ${TITLE_MAX}자까지예요.`);
    const author = p.author.trim().slice(0, AUTHOR_MAX);
    const d = db();
    const loanRef = doc(collection(d, "libraryLoans"));
    await runTransaction(d, async (tx) => {
      const snap = await tx.get(catalogRef());
      const cat = snap.exists()
        ? parseCatalog(snap.data())
        : { books: {} as Record<string, Book> };
      const key = bookKey(title);
      const same = Object.values(cat.books).filter((b) => b.k === key);
      let book: Book | undefined = p.bookId ? cat.books[p.bookId] : undefined;
      if (book && (book.on || book.lost))
        throw new Error(
          `《${bookLabel(book)}》은(는) 지금 빌려줄 수 없어요 (대출 중이거나 분실).`,
        );
      if (!book && !p.newCopy) {
        book = same.find((b) => !b.on && !b.lost);
        if (!book && same.length)
          throw new Error(
            `《${title}》은(는) 이미 빌려 갔어요. 같은 책이 한 권 더 있으면 '한 권 더 등록'을 눌러 주세요.`,
          );
      }
      const isNew = !book;
      const b: Book = book ?? {
        id: `b${Date.now().toString(36)}`,
        t: title,
        a: author,
        k: key,
        copy: same.length ? Math.max(...same.map((x) => x.copy)) + 1 : 1,
        c: [],
        n: 0,
        on: null,
        lost: false,
        at: Date.now(),
      };
      const next = {
        ...b,
        a: b.a || author,
        n: b.n + 1,
        on: { loan: loanRef.id, due: p.due },
        c: p.condOut,
      };
      const { id: _omit, ...stored } = next;
      void _omit;
      if (!snap.exists())
        tx.set(catalogRef(), { books: { [b.id]: stored }, by, at: Date.now() });
      else
        tx.update(catalogRef(), {
          [`books.${b.id}`]: stored,
          by,
          at: Date.now(),
        });
      tx.set(loanRef, {
        title: b.t,
        author: next.a,
        sid: p.sid,
        out: p.out,
        due: p.due,
        ext: 0,
        returned: null,
        lost: false,
        by,
        createdAt: Date.now(),
        condOut: p.condOut,
        noteOut: p.noteOut.trim().slice(0, COND_NOTE_MAX),
        bookId: b.id,
      });
      void isNew;
    });
    refresh();
  };
}

export function useUpdateLoan(by: number | "teacher" | null) {
  const refresh = useRefresh();
  return async (
    l: Loan,
    patch: Partial<
      Pick<
        Loan,
        "due" | "ext" | "returned" | "lost" | "condIn" | "noteIn" | "damageNew"
      >
    >,
  ) => {
    if (by == null) throw new Error("사서만 기록할 수 있어요.");
    const d = db();
    const batch = writeBatch(d);
    batch.update(doc(d, "libraryLoans", l.id), { ...patch, by });
    // 📚 목록의 그 책 상태도 같이 — 반납하면 '대출 가능'+지금 상태, 연장하면 반납 예정일, 분실 표시
    if (l.bookId) {
      const f = `books.${l.bookId}`;
      const cat: Record<string, unknown> = {};
      if ("returned" in patch) {
        if (patch.returned) {
          cat[`${f}.on`] = null;
          if (patch.condIn) cat[`${f}.c`] = patch.condIn;
        } else cat[`${f}.on`] = { loan: l.id, due: patch.due ?? l.due }; // 반납 취소
      }
      if (patch.due && !("returned" in patch)) cat[`${f}.on.due`] = patch.due;
      if (patch.lost !== undefined) {
        cat[`${f}.lost`] = patch.lost;
        if (patch.lost) cat[`${f}.on`] = null;
      }
      if (Object.keys(cat).length)
        batch.update(catalogRef(), { ...cat, by, at: Date.now() });
    }
    await batch.commit();
    refresh();
  };
}

/** ✏️ 잘못 누른 대출 바로잡기 — 사서는 기록 후 30분 안·반납 전만, 선생님은 언제든 (규칙도 같은 기준) */
export const FIX_WINDOW_MS = 30 * 60 * 1000;
export const canFixLoan = (l: Loan, isTeacher: boolean, now = Date.now()) =>
  isTeacher || (!l.returned && !l.lost && now - l.createdAt < FIX_WINDOW_MS);

/** 학생·책·기한·빌릴 때 상태 고치기. 책이 바뀌면 목록의 '대출 중'·빌린 횟수도 새 책으로 옮긴다 */
export function useFixLoan(by: number | "teacher" | null) {
  const refresh = useRefresh();
  return async (
    l: Loan,
    p: {
      title: string;
      author: string;
      sid: number;
      due: string;
      condOut: string[];
      noteOut: string;
      bookId?: string | null;
    },
  ) => {
    if (by == null) throw new Error("사서만 고칠 수 있어요.");
    const title = p.title.trim();
    if (!title) throw new Error("책 제목을 적어 주세요.");
    if (title.length > TITLE_MAX)
      throw new Error(`제목은 ${TITLE_MAX}자까지예요.`);
    if (p.due < l.out)
      throw new Error("반납 기한은 빌린 날보다 앞일 수 없어요.");
    const author = p.author.trim().slice(0, AUTHOR_MAX);
    const live = !l.returned && !l.lost; // 아직 빌려 간 책일 때만 목록의 '대출 중'을 건드린다
    const d = db();
    await runTransaction(d, async (tx) => {
      const snap = await tx.get(catalogRef());
      const cat = snap.exists()
        ? parseCatalog(snap.data())
        : { books: {} as Record<string, Book> };
      const cur = l.bookId ? cat.books[l.bookId] : undefined;
      const key = bookKey(title);
      let target: Book | undefined;
      if (p.bookId && p.bookId !== cur?.id) {
        target = cat.books[p.bookId];
        if (!target) throw new Error("고른 책을 목록에서 찾지 못했어요.");
        if (live && (target.on || target.lost))
          throw new Error(
            `《${bookLabel(target)}》은(는) 지금 다른 친구가 빌려 갔어요.`,
          );
      } else if (cur && cur.k === key) {
        target = cur; // 같은 책 — 학생·기한·상태만 바뀜
      } else {
        const same = Object.values(cat.books).filter(
          (b) => b.k === key && b.id !== cur?.id,
        );
        target = live ? same.find((b) => !b.on && !b.lost) : same[0];
        if (!target && live && same.length)
          throw new Error(
            `《${title}》은(는) 지금 다 빌려 갔어요. 같은 책 한 권 더라면 새로 빌려주기에서 '한 권 더 등록'을 써 주세요.`,
          );
        if (!target) {
          const copies = Object.values(cat.books).filter((b) => b.k === key);
          target = {
            id: `b${Date.now().toString(36)}`,
            t: title,
            a: author,
            k: key,
            copy: copies.length
              ? Math.max(...copies.map((x) => x.copy)) + 1
              : 1,
            c: [],
            n: 0,
            on: null,
            lost: false,
            at: Date.now(),
          };
        }
      }
      const patch: Record<string, unknown> = { by, at: Date.now() };
      if (target.id === cur?.id) {
        if (live) {
          patch[`books.${cur.id}.on`] = { loan: l.id, due: p.due };
          patch[`books.${cur.id}.c`] = p.condOut;
        }
      } else {
        if (cur) {
          patch[`books.${cur.id}.n`] = increment(-1);
          if (cur.on?.loan === l.id) patch[`books.${cur.id}.on`] = null;
        }
        const { id: _omit, ...stored } = {
          ...target,
          a: target.a || author,
          n: target.n + 1,
          ...(live ? { on: { loan: l.id, due: p.due }, c: p.condOut } : {}),
        };
        void _omit;
        patch[`books.${target.id}`] = stored;
      }
      if (!snap.exists()) {
        // 목록 문서가 아직 없다면(이관 전) 새 책 하나로 시작
        const { id: _i, ...stored } = {
          ...target,
          n: 1,
          ...(live ? { on: { loan: l.id, due: p.due }, c: p.condOut } : {}),
        };
        void _i;
        tx.set(catalogRef(), {
          books: { [target.id]: stored },
          by,
          at: Date.now(),
        });
      } else tx.update(catalogRef(), patch);
      tx.update(doc(d, "libraryLoans", l.id), {
        title: target.t,
        author: author || target.a,
        sid: p.sid,
        due: p.due,
        condOut: p.condOut,
        noteOut: p.noteOut.trim().slice(0, COND_NOTE_MAX),
        bookId: target.id,
        by,
      });
    });
    refresh();
  };
}

export function useDeleteLoan() {
  const refresh = useRefresh();
  return async (l: Loan, cat?: Catalog) => {
    const d = db();
    const batch = writeBatch(d);
    batch.delete(doc(d, "libraryLoans", l.id));
    const b = l.bookId ? cat?.books[l.bookId] : undefined;
    if (b) {
      const f = `books.${b.id}`;
      batch.update(catalogRef(), {
        [`${f}.n`]: increment(-1),
        ...(b.on?.loan === l.id ? { [`${f}.on`]: null } : {}),
        at: Date.now(),
      });
    }
    await batch.commit();
    refresh();
  };
}

// ── 책 관리 (선생님) ─────────────────────────────────────────────────────────
/** 제목·지은이 고치기 — 지난 대출 기록의 제목은 그때 모습 그대로 둔다(기록은 불변) */
export function useEditBook() {
  const refresh = useRefresh();
  return async (b: Book, t: string, a: string) => {
    const title = t.trim();
    if (!title) throw new Error("제목을 적어 주세요.");
    await updateDoc(catalogRef(), {
      [`books.${b.id}.t`]: title.slice(0, TITLE_MAX),
      [`books.${b.id}.k`]: bookKey(title),
      [`books.${b.id}.a`]: a.trim().slice(0, AUTHOR_MAX),
      at: Date.now(),
    });
    refresh();
  };
}

/** 오타로 따로 생긴 책 합치기 — src의 대출 기록을 dst로 옮기고 src를 지운다 */
export function useMergeBooks() {
  const refresh = useRefresh();
  return async (src: Book, dst: Book) => {
    if (src.id === dst.id) return;
    if (src.on && dst.on)
      throw new Error(
        "두 책이 모두 대출 중이에요. 하나가 반납된 뒤 합쳐 주세요.",
      );
    const d = db();
    const loans = await getDocs(
      query(collection(d, "libraryLoans"), where("bookId", "==", src.id)),
    );
    const batch = writeBatch(d);
    loans.forEach((x) => batch.update(x.ref, { bookId: dst.id }));
    batch.update(catalogRef(), {
      [`books.${dst.id}.n`]: increment(src.n),
      ...(src.on && !dst.on ? { [`books.${dst.id}.on`]: src.on } : {}),
      [`books.${src.id}`]: deleteField(),
      at: Date.now(),
    });
    await batch.commit();
    refresh();
  };
}

/** 목록에서 지우기 — 대출 중이면 안 된다 (지난 기록은 남는다) */
export function useDeleteBook() {
  const refresh = useRefresh();
  return async (b: Book) => {
    if (b.on)
      throw new Error("대출 중인 책은 지울 수 없어요. 먼저 반납해 주세요.");
    await updateDoc(catalogRef(), {
      [`books.${b.id}`]: deleteField(),
      at: Date.now(),
    });
    refresh();
  };
}

/** 🗂 1회 이관 — 목록이 생기기 전의 대출 기록을 제목별로 묶어 학급문고에 올린다(선생님 화면에서 자동).
 *  migratedAt 표시가 있으면 다시 하지 않는다. 대출 기록이 수백 건이어도 한 번만 읽는다. */
export async function migrateCatalog(): Promise<number> {
  const d = db();
  const snap = await getDoc(catalogRef());
  const cat = snap.exists()
    ? parseCatalog(snap.data())
    : { books: {} as Record<string, Book> };
  if (cat.migratedAt) return 0;
  const all = (await getDocs(collection(d, "libraryLoans"))).docs
    .map(toLoan)
    .sort((a, b) => a.createdAt - b.createdAt);
  const books = { ...cat.books };
  const batch = writeBatch(d);
  let moved = 0;
  for (const l of all) {
    if (l.bookId && books[l.bookId]) continue;
    const key = bookKey(l.title);
    let b = Object.values(books).find((x) => x.k === key && x.copy === 1);
    if (!b) {
      b = {
        id: `b${l.createdAt.toString(36)}`,
        t: l.title,
        a: l.author,
        k: key,
        copy: 1,
        c: [],
        n: 0,
        on: null,
        lost: false,
        at: l.createdAt,
      };
      books[b.id] = b;
    }
    b.n += 1;
    if (l.returned) b.c = l.condIn ?? b.c;
    else if (l.lost) b.lost = true;
    else b.on = { loan: l.id, due: l.due };
    batch.update(doc(d, "libraryLoans", l.id), { bookId: b.id });
    moved++;
  }
  const stored = Object.fromEntries(
    Object.values(books).map(({ id, ...rest }) => [id, rest]),
  );
  batch.set(catalogRef(), {
    books: stored,
    migratedAt: Date.now(),
    at: Date.now(),
  });
  await batch.commit();
  return moved;
}
