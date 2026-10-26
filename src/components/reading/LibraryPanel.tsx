"use client";
// 📚 학급문고 — 독서 탭 하위 화면. 보는 사람에 따라 다르게 보인다:
//   · 학생      : 내가 빌린 책(기한·연체 경고) + 돌려준 책 → ✍️ 감상문 쓰기(제목 자동 입력)
//   · 사서 학생 : + 🗂 대출 데스크 (빌려주기 · 반납 · 연장 1회 · 분실) + 최근 기록
//   · 선생님    : + ⚙️ 사서 지정 · 대출 규칙 · 연체 감점 방식
// 사서 활동 자체는 점수와 무관하다(사용자 확정). 연체만 집계가 개인 점수에서 뺀다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/stores/session";
import { useSettings, useSaveSettings } from "@/lib/query/settings";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import { friendlyWriteError } from "@/lib/auth";
import {
  AUTHOR_MAX,
  COND_NOTE_MAX,
  CONDITIONS,
  LOAN_EXT_MAX,
  TITLE_MAX,
  daysLeft,
  dueFrom,
  lateDays,
  libraryRules,
  condLabel,
  newDamage,
  bookKey,
  bookLabel,
  canFixLoan,
  FIX_WINDOW_MS,
  useFixLoan,
  migrateCatalog,
  useActiveLoans,
  useBookLoans,
  useCatalog,
  useDamageAlerts,
  useDeleteBook,
  useEditBook,
  useMergeBooks,
  useDeleteLoan,
  useLend,
  useLoanHistory,
  useMyLoans,
  useUpdateLoan,
  type Book,
  type Loan,
} from "@/lib/query/library";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Collapsible from "@/components/ui/Collapsible";
import { useFeedback } from "@/components/ui/Feedback";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 🔧 책 상태 고르기 — 아무것도 안 고르면 '깨끗해요'. 훼손은 여러 개 고를 수 있다 */
function CondPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const chip = (on: boolean, bad: boolean) =>
    `press min-h-9 rounded-full px-3 text-xs font-bold ring-1 ${
      on
        ? bad
          ? "bg-warn text-white ring-warn"
          : "bg-success text-white ring-success"
        : "bg-white text-ink-600 ring-ink-200"
    }`;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange([])}
        className={chip(value.length === 0, false)}
      >
        ✨ 깨끗해요
      </button>
      {CONDITIONS.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() =>
            onChange(
              value.includes(c) ? value.filter((x) => x !== c) : [...value, c],
            )
          }
          className={chip(value.includes(c), true)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** 기한 배지 — D-3 / 오늘까지 / 연체 n일 */
function DueBadge({
  l,
  today,
  holidays,
  penalty,
  mode,
}: {
  l: Loan;
  today: string;
  holidays: string[];
  penalty: number;
  mode: "daily" | "once";
}) {
  if (l.returned)
    return (
      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-500">
        {md(l.returned)} 반납
      </span>
    );
  if (l.lost)
    return (
      <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-bold text-white">
        분실
      </span>
    );
  const late = lateDays(l, today, holidays);
  if (late > 0)
    return (
      <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
        연체 {late}일 ·{" "}
        {mode === "daily" ? `하루 −${penalty}점` : `−${penalty}점`}
      </span>
    );
  const left = daysLeft(l.due, today);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
        left <= 1 ? "bg-warn-weak text-warn" : "bg-brand-weak text-brand-strong"
      }`}
    >
      {left <= 0 ? "오늘까지" : `D-${left}`} · {md(l.due)}까지
    </span>
  );
}

export default function LibraryPanel({
  onWrite,
}: {
  onWrite: (title: string, author: string) => void;
}) {
  const { role, studentId, preview } = useSession();
  const isTeacher = role === "teacher";
  const myId = role === "student" ? studentId : null;
  const today = todayKST();
  const { toast, confirm } = useFeedback();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const rules = libraryRules(settings);
  // 미리보기(교사가 학생 화면 보기)는 교사 인증이라 사서 데스크도 그대로 쓸 수 있게
  const isLibrarian = myId != null && rules.librarians.includes(myId);
  const canDesk = isTeacher || isLibrarian;
  const by: number | "teacher" | null =
    isTeacher || preview ? "teacher" : isLibrarian ? myId : null;

  const {
    data: active,
    isLoading: activeLoading,
    error: activeErr,
  } = useActiveLoans(canDesk);
  const { data: mine } = useMyLoans(myId);
  const qc = useQueryClient();
  const { data: catalog } = useCatalog(!!role);
  const books = useMemo(() => Object.values(catalog?.books ?? {}), [catalog]);
  // 🗂 목록이 생기기 전 기록을 한 번만 제목별로 묶어 올린다 (선생님 화면에서 자동)
  const migrateOnce = useRef(false);
  useEffect(() => {
    if (!isTeacher || !catalog || catalog.migratedAt || migrateOnce.current)
      return;
    migrateOnce.current = true;
    void migrateCatalog()
      .then(() => qc.invalidateQueries({ queryKey: ["library"] }))
      .catch(() => {});
  }, [isTeacher, catalog, qc]);
  // 📖 책 이력 팝업
  const [bookId, setBookId] = useState<string | null>(null);
  const openBook = catalog?.books[bookId ?? ""] ?? null;
  const { data: bookLoans } = useBookLoans(canDesk ? bookId : null);
  const [showHistory, setShowHistory] = useState(false);
  const { data: history } = useLoanHistory(canDesk && showHistory);
  const lend = useLend(by);
  const update = useUpdateLoan(by);
  const del = useDeleteLoan();
  const fix = useFixLoan(by);
  // ✏️ 정정 가능 시간(30분) 판단용 '지금' — 렌더마다 Date.now()를 부르지 않도록 1분마다 갱신
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(t);
  }, []);
  const [editOnOpen, setEditOnOpen] = useState(false);

  // 선생님이 처음 열면 사서 명단을 설정에 저장 — 규칙이 명단을 읽어 권한을 판단하므로 꼭 있어야 한다
  const initOnce = useRef(false);
  useEffect(() => {
    if (!isTeacher || !settings || settings.librarians || initOnce.current)
      return;
    initOnce.current = true;
    void saveSettings({ ...settings, librarians: rules.librarians }).catch(
      () => {},
    );
  }, [isTeacher, settings, saveSettings, rules.librarians]);

  // ── 대출 폼 ──
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [selBook, setSelBook] = useState<string | null>(null); // 목록에서 고른 책
  const [newCopy, setNewCopy] = useState(false); // 같은 제목이 다 대출 중일 때 한 권 더 등록
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [who, setWho] = useState<number | null>(null);
  const [due, setDue] = useState(() =>
    dueFrom(today, rules.days, rules.holidays),
  );
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  // 🔧 빌려줄 때 상태
  const [condOut, setCondOut] = useState<string[]>([]);
  const [noteOut, setNoteOut] = useState("");
  // 🔧 반납 확인 — 누른 책 한 권만 펼쳐서 돌려받을 때 상태를 고른다
  const [retId, setRetId] = useState<string | null>(null);
  const [retCond, setRetCond] = useState<string[]>([]);
  const [retNote, setRetNote] = useState("");
  const { data: damaged } = useDamageAlerts(canDesk);
  // 📋 대출 상세 팝업 — 지난 기록·대출 중·내 책 어디서든 눌러서 연다 (사용자 요청 2026-10-22)
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useMemo(
    () =>
      [
        ...(active ?? []),
        ...(history ?? []),
        ...(mine ?? []),
        ...(damaged ?? []),
        ...(bookLoans ?? []),
      ].find((l) => l.id === detailId) ?? null,
    [detailId, active, history, mine, damaged, bookLoans],
  );

  const activeByStudent = useMemo(() => {
    const m: Record<number, number> = {};
    for (const l of active ?? []) if (!l.lost) m[l.sid] = (m[l.sid] ?? 0) + 1;
    return m;
  }, [active]);
  const overdue = (active ?? []).filter(
    (l) => lateDays(l, today, rules.holidays) > 0,
  );
  const shown = (active ?? []).filter((l) => {
    const k = q.trim();
    return !k || l.title.includes(k) || nm(l.sid).includes(k);
  });

  async function doLend() {
    if (busy || who == null) return;
    if ((activeByStudent[who] ?? 0) >= rules.max)
      return toast(
        `${nm(who)}은(는) 이미 ${rules.max}권을 빌렸어요. 먼저 반납해야 해요.`,
        "warn",
      );
    setBusy(true);
    try {
      await lend({
        title,
        author,
        sid: who,
        out: today,
        due,
        condOut,
        noteOut,
        bookId: selBook,
        newCopy,
      });
      toast(
        `📕 ${nm(who)} · 《${title.trim()}》 대출 — ${md(due)}까지`,
        "success",
      );
      setTitle("");
      setAuthor("");
      setSelBook(null);
      setNewCopy(false);
      setWho(null);
      setCondOut([]);
      setNoteOut("");
      setDue(dueFrom(today, rules.days, rules.holidays)); // 설정이 늦게 읽혀도 다음 대출은 규칙대로
    } catch (e) {
      toast(
        friendlyWriteError(
          e,
          "기록하지 못했어요 — 사서로 지정됐는지 선생님께 확인해 주세요.",
        ),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function doReturn(l: Loan) {
    const fresh = newDamage(l.condOut, retCond);
    try {
      await update(l, {
        returned: today,
        condIn: retCond,
        noteIn: retNote.trim().slice(0, COND_NOTE_MAX),
        damageNew: fresh.length > 0,
      });
      setRetId(null);
      toast(
        fresh.length
          ? `📗 반납 — 🔧 새 훼손(${fresh.join(", ")})을 선생님께 알렸어요.`
          : `📗 《${l.title}》 반납 완료`,
        fresh.length ? "warn" : "success",
      );
    } catch (e) {
      toast(friendlyWriteError(e, "처리하지 못했어요."), "error");
    }
  }

  async function act(
    l: Loan,
    kind:
      | "return"
      | "extend"
      | "lost"
      | "undo"
      | "delete"
      | "checked"
      | "cancel",
  ) {
    try {
      if (kind === "return") {
        // 바로 반납하지 않고 상태 확인을 연다 — 빌릴 때 상태를 미리 골라 둔다
        setRetId(l.id);
        setRetCond(l.condOut);
        setRetNote("");
        return;
      } else if (kind === "extend") {
        if (l.ext >= LOAN_EXT_MAX)
          return toast("연장은 한 번만 할 수 있어요.", "warn");
        const next = dueFrom(l.due, rules.days, rules.holidays);
        await update(l, { due: next, ext: l.ext + 1 });
        toast(`⏳ ${md(next)}까지 연장했어요.`, "success");
      } else if (kind === "lost") {
        if (
          !(await confirm({
            title: `《${l.title}》을(를) 분실로 표시할까요?`,
            body: "분실로 표시하면 연체 감점이 멈춰요. 처리는 선생님과 의논해 주세요.",
            confirmLabel: "분실 표시",
            danger: true,
          }))
        )
          return;
        await update(l, { lost: true });
      } else if (kind === "cancel") {
        if (
          !(await confirm({
            title: `《${l.title}》 대출을 취소할까요?`,
            body: `${nm(l.sid)}에게 잘못 기록한 대출이면 취소하고 다시 빌려주세요. 목록의 빌린 횟수도 함께 돌아가요.`,
            confirmLabel: "대출 취소",
            danger: true,
          }))
        )
          return;
        await del(l, catalog);
        toast("대출 기록을 취소했어요.");
        return;
      } else if (kind === "checked") {
        await update(l, { damageNew: false });
        toast("🔧 훼손 확인 처리했어요.");
      } else if (kind === "undo") {
        await update(l, { returned: null });
        toast("반납을 취소했어요.");
      } else {
        if (
          !(await confirm({
            title: "이 기록을 지울까요?",
            body: "잘못 적은 기록만 지워 주세요. 되돌릴 수 없어요.",
            confirmLabel: "지우기",
            danger: true,
          }))
        )
          return;
        await del(l, catalog);
      }
    } catch (e) {
      toast(friendlyWriteError(e, "처리하지 못했어요."), "error");
    }
  }

  const myActive = (mine ?? []).filter((l) => !l.returned && !l.lost);
  const myReturned = (mine ?? []).filter((l) => l.returned).slice(0, 5);
  const libNames = rules.librarians.map(nm).join(", ");

  return (
    <div className="space-y-4">
      {/* ── 학생: 내가 빌린 책 ── */}
      {myId != null && (
        <Card
          title="📚 내가 빌린 책"
          desc={`사서 ${libNames}에게 빌리고 돌려줘요 · ${rules.days}일 · 한 사람 ${rules.max}권까지 · 연장 ${LOAN_EXT_MAX}번`}
        >
          {myActive.length === 0 ? (
            <EmptyState
              emoji="📖"
              title="지금 빌린 책이 없어요"
              desc="학급문고에서 읽고 싶은 책을 골라 사서에게 말해 보세요."
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {myActive.map((l) => {
                const late = lateDays(l, today, rules.holidays);
                return (
                  <li
                    key={l.id}
                    className={`rounded-btn p-3 ring-1 ${late ? "bg-danger-weak ring-danger/30" : "bg-ink-50 ring-ink-200"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-[15px] text-ink-900">《{l.title}》</b>
                      <DueBadge
                        l={l}
                        today={today}
                        holidays={rules.holidays}
                        penalty={rules.penalty}
                        mode={rules.mode}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-500">
                      빌릴 때 상태: <b>{condLabel(l.condOut)}</b> — 돌려줄 때
                      다시 확인해요. 소중히 읽어 주세요!
                    </p>
                    {late > 0 && (
                      <p className="mt-1 text-xs font-bold text-danger">
                        반납 기한이 지났어요! 돌려줄 때까지{" "}
                        {rules.mode === "daily"
                          ? `학교 오는 날마다 ${rules.penalty}점씩`
                          : `${rules.penalty}점이`}{" "}
                        깎여요.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {myReturned.length > 0 && (
            <div className="mt-4 border-t border-ink-100 pt-3">
              <p className="text-xs font-bold text-ink-500">
                돌려준 책 — 읽은 마음을 남겨 볼까요?
              </p>
              <ul className="mt-2 space-y-1.5">
                {myReturned.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailId(l.id)}
                      onKeyDown={(e) => e.key === "Enter" && setDetailId(l.id)}
                      className="min-w-0 cursor-pointer truncate text-ink-700 hover:text-brand-strong"
                    >
                      《{l.title}》{" "}
                      <span className="text-xs text-ink-400">
                        {md(l.returned!)} 반납
                      </span>
                    </span>
                    <button
                      onClick={() => onWrite(l.title, l.author)}
                      className="press shrink-0 rounded-btn bg-brand px-3 py-1.5 text-xs font-bold text-white"
                    >
                      ✍️ 감상문 쓰기
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* ── 사서·교사: 대출 데스크 ── */}
      {canDesk && (
        <Card
          title="🗂 대출 데스크"
          desc={
            isTeacher
              ? "사서가 없을 땐 선생님이 대신 기록해요."
              : "사서님, 빌려줄 때 제목과 빌리는 친구를 적어 주세요."
          }
        >
          {(damaged?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-card bg-warn-weak p-3 ring-1 ring-warn/30">
              <p className="text-[13px] font-bold text-warn">
                🔧 새 훼손으로 돌아온 책 {damaged!.length}권
                <span className="ml-1 font-normal text-ink-500">
                  —{" "}
                  {isTeacher
                    ? "눌러서 확인하고 처리해 주세요"
                    : "선생님이 확인할 거예요"}
                </span>
              </p>
              <ul className="mt-2 space-y-1">
                {damaged!.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setDetailId(l.id)}
                      className="press flex w-full flex-wrap items-center gap-2 rounded-btn bg-white px-2.5 py-1.5 text-left text-[13px]"
                    >
                      <b className="text-ink-700">{nm(l.sid)}</b>
                      <span className="min-w-0 flex-1 truncate">
                        《{l.title}》
                      </span>
                      <span className="text-[11px] font-bold text-warn">
                        {newDamage(l.condOut, l.condIn).join(" · ")}
                      </span>
                      <span className="text-ink-300">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 rounded-card bg-ink-50 p-3">
            <p className="text-[13px] font-bold text-ink-700">📕 빌려주기</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="relative min-w-40 flex-[2]">
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value.slice(0, TITLE_MAX));
                    setSelBook(null);
                    setNewCopy(false);
                    setSuggestOpen(true);
                  }}
                  onFocus={() => setSuggestOpen(true)}
                  onBlur={() =>
                    window.setTimeout(() => setSuggestOpen(false), 150)
                  }
                  placeholder="책 제목 (학급문고에서 찾기)"
                  className="min-h-11 w-full rounded-btn border border-ink-300 px-3 text-[15px]"
                />
                {suggestOpen && !selBook && title.trim() && (
                  <BookSuggest
                    books={books}
                    query={title}
                    onPick={(b) => {
                      setSelBook(b.id);
                      setTitle(b.t);
                      setAuthor(b.a);
                      setCondOut(b.c); // 지난번 반납 상태가 이번 '빌릴 때 상태'로
                      setNewCopy(false);
                      setSuggestOpen(false);
                    }}
                  />
                )}
              </div>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value.slice(0, AUTHOR_MAX))}
                placeholder="지은이 (선택)"
                className="min-h-11 min-w-28 flex-1 rounded-btn border border-ink-300 px-3 text-[15px]"
              />
            </div>
            <TitleHint
              books={books}
              title={title}
              selBook={selBook}
              newCopy={newCopy}
              onNewCopy={() => setNewCopy(true)}
              onOpenBook={setBookId}
            />
            <p className="mt-3 text-xs font-bold text-ink-500">빌리는 친구</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {students
                .filter((s) => !s.inactive)
                .map((s) => {
                  const n = activeByStudent[s.id] ?? 0;
                  const full = n >= rules.max;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setWho(who === s.id ? null : s.id)}
                      disabled={full}
                      title={
                        full
                          ? `이미 ${rules.max}권 빌림`
                          : n
                            ? `${n}권 빌리는 중`
                            : ""
                      }
                      className={`press min-h-9 rounded-full px-3 text-xs font-bold ring-1 disabled:opacity-35 ${
                        who === s.id
                          ? "bg-brand text-white ring-brand"
                          : "bg-white text-ink-700 ring-ink-200"
                      }`}
                    >
                      {s.name}
                      {n > 0 && <span className="ml-1 opacity-70">·{n}</span>}
                    </button>
                  );
                })}
            </div>
            <p className="mt-3 text-xs font-bold text-ink-500">
              책 상태{" "}
              <span className="font-normal text-ink-400">
                — 빌려주기 전에 한 번 넘겨 보고 골라요
              </span>
            </p>
            <div className="mt-1.5">
              <CondPicker value={condOut} onChange={setCondOut} />
            </div>
            {condOut.length > 0 && (
              <input
                value={noteOut}
                onChange={(e) =>
                  setNoteOut(e.target.value.slice(0, COND_NOTE_MAX))
                }
                placeholder="어디가 어떤지 (예: 12쪽 낙서)"
                className="mt-2 min-h-11 w-full rounded-btn border border-ink-300 px-3 text-sm"
              />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ink-500">반납 기한</span>
              <input
                type="date"
                value={due}
                min={today}
                onChange={(e) => e.target.value && setDue(e.target.value)}
                className="min-h-11 rounded-btn border border-ink-300 px-2 text-sm"
              />
              <button
                onClick={() => void doLend()}
                disabled={busy || !title.trim() || who == null}
                className="press min-h-11 flex-1 rounded-btn bg-brand px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy
                  ? "기록 중…"
                  : who != null && title.trim()
                    ? `${nm(who)}에게 빌려주기`
                    : "제목과 친구를 골라 주세요"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-ink-700">
              📗 지금 빌려 간 책{" "}
              <span className="tnum font-normal text-ink-400">
                {active?.length ?? 0}권
              </span>
              {overdue.length > 0 && (
                <span className="ml-2 rounded-full bg-danger px-2 py-0.5 text-[11px] text-white">
                  연체 {overdue.length}
                </span>
              )}
            </p>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목·이름 찾기"
              className="min-h-9 w-36 rounded-btn border border-ink-300 px-2 text-sm"
            />
          </div>
          {activeErr ? (
            <p className="mt-2 rounded-btn bg-danger-weak px-3 py-2 text-[13px] font-bold text-danger">
              ⚠️ 대출 기록을 불러오지 못했어요
              {isTeacher &&
                " — Firebase 콘솔에 최신 firestore.rules를 게시해 주세요."}
            </p>
          ) : activeLoading ? (
            <p className="mt-2 text-sm text-ink-400">불러오는 중…</p>
          ) : !shown.length ? (
            <EmptyState
              emoji="📚"
              title={q ? "찾는 책이 없어요" : "빌려 간 책이 없어요"}
            />
          ) : (
            <ul className="mt-2 divide-y divide-ink-100">
              {shown.map((l) => (
                <li key={l.id} className="py-2.5">
                  {/* 1줄: 누가·무슨 책 (제목은 줄바꿈 — 폰 폭에서 '《…'로 잘리던 문제) */}
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[12px] font-bold text-brand-strong">
                      {nm(l.sid)}
                    </span>
                    <b
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailId(l.id)}
                      onKeyDown={(e) => e.key === "Enter" && setDetailId(l.id)}
                      className="min-w-0 flex-1 cursor-pointer break-words text-[15px] text-ink-900 hover:text-brand-strong"
                    >
                      《{l.title}》
                      {l.author && (
                        <span className="ml-1 text-xs font-normal text-ink-400">
                          {l.author}
                        </span>
                      )}
                    </b>
                  </div>
                  {/* 2줄: 언제·기한 + 처리 버튼 */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-ink-400">
                      {md(l.out)} 대출{l.ext ? " · 연장" : ""}
                    </span>
                    {l.condOut.length > 0 && (
                      <span className="rounded-full bg-warn-weak px-2 py-0.5 text-[11px] font-bold text-warn">
                        빌릴 때 {condLabel(l.condOut)}
                      </span>
                    )}
                    <DueBadge
                      l={l}
                      today={today}
                      holidays={rules.holidays}
                      penalty={rules.penalty}
                      mode={rules.mode}
                    />
                    <span className="ml-auto flex gap-1">
                      {!l.lost && (
                        <button
                          onClick={() => void act(l, "return")}
                          className="press min-h-9 rounded-btn bg-success px-3 text-xs font-bold text-white"
                        >
                          반납
                        </button>
                      )}
                      {!l.lost && l.ext < LOAN_EXT_MAX && (
                        <button
                          onClick={() => void act(l, "extend")}
                          className="press min-h-9 rounded-btn bg-ink-100 px-2.5 text-xs font-bold text-ink-600"
                        >
                          연장
                        </button>
                      )}
                      {canFixLoan(l, isTeacher, now) && (
                        <button
                          onClick={() => {
                            setEditOnOpen(true);
                            setDetailId(l.id);
                          }}
                          className="press min-h-9 rounded-btn bg-brand-weak px-2.5 text-xs font-bold text-brand-strong"
                        >
                          고치기
                        </button>
                      )}
                      {!l.lost && (
                        <button
                          onClick={() => void act(l, "lost")}
                          className="press min-h-9 rounded-btn px-2 text-xs font-bold text-ink-400"
                        >
                          분실
                        </button>
                      )}
                      {isTeacher && (
                        <button
                          onClick={() => void act(l, "delete")}
                          className="press min-h-9 rounded-btn px-2 text-xs font-bold text-danger"
                        >
                          지우기
                        </button>
                      )}
                    </span>
                  </div>
                  {retId === l.id && (
                    <div className="mt-2 rounded-btn bg-success-weak/60 p-3 ring-1 ring-success/30">
                      <p className="text-[13px] font-bold text-ink-800">
                        🔧 돌려받는 책 상태 확인{" "}
                        <span className="font-normal text-ink-500">
                          — 빌릴 때: {condLabel(l.condOut)}
                        </span>
                      </p>
                      <div className="mt-2">
                        <CondPicker value={retCond} onChange={setRetCond} />
                      </div>
                      {retCond.length > 0 && (
                        <input
                          value={retNote}
                          onChange={(e) =>
                            setRetNote(e.target.value.slice(0, COND_NOTE_MAX))
                          }
                          placeholder="어디가 어떤지 (예: 표지가 찢어짐)"
                          className="mt-2 min-h-11 w-full rounded-btn border border-ink-300 px-3 text-sm"
                        />
                      )}
                      {newDamage(l.condOut, retCond).length > 0 && (
                        <p className="mt-2 text-xs font-bold text-warn">
                          ⚠️ 빌릴 때 없던 훼손:{" "}
                          {newDamage(l.condOut, retCond).join(", ")} — 반납하면
                          선생님께 알려져요
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void doReturn(l)}
                          className="press min-h-11 flex-1 rounded-btn bg-success px-3 text-sm font-bold text-white"
                        >
                          반납 완료
                        </button>
                        <button
                          onClick={() => setRetId(null)}
                          className="press min-h-11 rounded-btn bg-white px-3 text-sm font-bold text-ink-500 ring-1 ring-ink-200"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="press text-xs font-bold text-ink-500"
            >
              {showHistory ? "▲ 최근 기록 접기" : "▼ 최근 기록 40건 보기"}
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-1 text-[13px]">
                {(history ?? []).map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setDetailId(l.id)}
                      className="press flex w-full flex-wrap items-center gap-2 rounded-btn bg-ink-50 px-2.5 py-1.5 text-left hover:bg-ink-100"
                    >
                      <span className="tnum text-[11px] text-ink-400">
                        {md(l.out)}
                      </span>
                      <b className="text-ink-700">{nm(l.sid)}</b>
                      <span className="min-w-0 flex-1 truncate">
                        《{l.title}》
                      </span>
                      {newDamage(l.condOut, l.condIn).length > 0 && (
                        <span className="rounded-full bg-warn-weak px-2 py-0.5 text-[11px] font-bold text-warn">
                          🔧 훼손
                        </span>
                      )}
                      <DueBadge
                        l={l}
                        today={today}
                        holidays={rules.holidays}
                        penalty={rules.penalty}
                        mode={rules.mode}
                      />
                      <span className="text-ink-300">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {/* 📚 학급문고 목록 — 모두 볼 수 있다 (빌린 학생 이름은 사서·선생님만) */}
      {role && <CatalogCard books={books} today={today} onOpen={setBookId} />}

      {openBook && (
        <BookDetail
          b={openBook}
          all={books}
          loans={bookLoans}
          canDesk={canDesk}
          isTeacher={isTeacher}
          today={today}
          rules={rules}
          onClose={() => setBookId(null)}
          onOpenLoan={(id) => setDetailId(id)}
        />
      )}

      {detail && (
        <LoanDetail
          l={detail}
          today={today}
          rules={rules}
          canDesk={canDesk}
          isTeacher={isTeacher}
          books={books}
          myId={myId}
          canFix={canDesk && canFixLoan(detail, isTeacher, now)}
          startEditing={editOnOpen}
          onClose={() => {
            setDetailId(null);
            setEditOnOpen(false);
          }}
          onAct={async (kind) => {
            await act(detail, kind);
            if (kind === "delete" || kind === "cancel") setDetailId(null);
          }}
          onFix={async (p) => {
            await fix(detail, p);
            toast("✏️ 대출 기록을 고쳤어요.", "success");
          }}
        />
      )}

      {/* ── 선생님: 사서·규칙 ── */}
      {isTeacher && settings && <LibrarySettings />}

      {!canDesk && myId == null && (
        <Card title="📚 학급문고">
          <EmptyState
            emoji="🔒"
            title="로그인하면 내가 빌린 책을 볼 수 있어요"
          />
        </Card>
      )}
    </div>
  );
}

/** 책 상태 칩 — 학생에게도 보이므로 빌린 사람 이름은 넣지 않는다 */
function BookStatus({ b, today }: { b: Book; today: string }) {
  if (b.lost)
    return (
      <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-bold text-white">
        분실
      </span>
    );
  if (b.on)
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
          b.on.due < today
            ? "bg-danger-weak text-danger"
            : "bg-warn-weak text-warn"
        }`}
      >
        대출 중 · {md(b.on.due)} 반납 예정
      </span>
    );
  return (
    <span className="rounded-full bg-success-weak px-2 py-0.5 text-[11px] font-bold text-success">
      대출 가능
    </span>
  );
}

/** 제목 자동 완성 — 띄어쓰기 무시. 빌릴 수 있는 책이 위로 */
function BookSuggest({
  books,
  query,
  onPick,
}: {
  books: Book[];
  query: string;
  onPick: (b: Book) => void;
}) {
  const k = bookKey(query);
  const hits = books
    .filter((b) => k && (b.k.includes(k) || bookKey(b.a).includes(k)))
    .sort(
      (a, b) =>
        Number(!!a.on || a.lost) - Number(!!b.on || b.lost) || b.n - a.n,
    )
    .slice(0, 6);
  if (!hits.length) return null;
  return (
    <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-btn border border-ink-200 bg-white shadow-card">
      {hits.map((b) => {
        const busy = !!b.on || b.lost;
        return (
          <li key={b.id}>
            <button
              type="button"
              disabled={busy}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(b)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate">
                <b className="text-ink-900">{bookLabel(b)}</b>
                {b.a && (
                  <span className="ml-1 text-xs text-ink-400">{b.a}</span>
                )}
              </span>
              <span className="text-[11px] text-ink-400">{b.n}회</span>
              <span
                className={`text-[11px] font-bold ${busy ? "text-warn" : "text-success"}`}
              >
                {b.lost
                  ? "분실"
                  : b.on
                    ? `대출 중 ~${md(b.on.due)}`
                    : "빌릴 수 있어요"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 제목 아래 한 줄 — 목록의 책인지, 새 책인지, 다 대출 중인지 알려 준다 */
function TitleHint({
  books,
  title,
  selBook,
  newCopy,
  onNewCopy,
  onOpenBook,
}: {
  books: Book[];
  title: string;
  selBook: string | null;
  newCopy: boolean;
  onNewCopy: () => void;
  onOpenBook: (id: string) => void;
}) {
  const t = title.trim();
  if (!t) return null;
  const sel = books.find((b) => b.id === selBook);
  if (sel)
    return (
      <p className="mt-1.5 text-xs text-ink-600">
        📗 학급문고 책 · 지금까지 {sel.n}번 빌려 갔어요 · 지금 상태{" "}
        <b>{condLabel(sel.c)}</b>{" "}
        <button
          type="button"
          onClick={() => onOpenBook(sel.id)}
          className="font-bold text-brand-strong underline"
        >
          이력 보기
        </button>
      </p>
    );
  const same = books.filter((b) => b.k === bookKey(t));
  const free = same.find((b) => !b.on && !b.lost);
  if (newCopy)
    return (
      <p className="mt-1.5 text-xs font-bold text-brand-strong">
        ✨ 같은 책 한 권 더 — 새 권으로 학급문고에 등록돼요
      </p>
    );
  if (free)
    return (
      <p className="mt-1.5 text-xs text-ink-600">
        📗 학급문고의 《{bookLabel(free)}》로 빌려줘요 (지금 상태{" "}
        {condLabel(free.c)})
      </p>
    );
  if (same.length)
    return (
      <p className="mt-1.5 text-xs text-warn">
        ⚠️ 이 책은 지금 다 빌려 갔어요.{" "}
        <button
          type="button"
          onClick={onNewCopy}
          className="font-bold underline"
        >
          같은 책이 한 권 더 있어요 (새 권 등록)
        </button>
      </p>
    );
  return (
    <p className="mt-1.5 text-xs text-ink-500">
      ✨ 새 책 — 빌려주면 학급문고 목록에 자동으로 올라가요
    </p>
  );
}

/** 📚 학급문고 목록 — 찾기 · 대출 가능만 · 많이 빌린 순 */
function CatalogCard({
  books,
  today,
  onOpen,
}: {
  books: Book[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "free" | "out">("all");
  const [sort, setSort] = useState<"title" | "pop">("title");
  const k = bookKey(q);
  const list = books
    .filter((b) => !k || b.k.includes(k) || bookKey(b.a).includes(k))
    .filter((b) =>
      only === "free" ? !b.on && !b.lost : only === "out" ? !!b.on : true,
    )
    .sort(
      (a, b) =>
        (sort === "pop" ? b.n - a.n : a.t.localeCompare(b.t, "ko")) ||
        a.copy - b.copy,
    );
  const top = [...books]
    .filter((b) => b.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const free = books.filter((b) => !b.on && !b.lost).length;
  return (
    <Card
      title="📚 학급문고 목록"
      desc={`${books.length}권 · 지금 빌릴 수 있는 책 ${free}권 — 빌려줄 때마다 자동으로 늘어나요`}
    >
      {top.length > 0 && (
        <p className="mt-2 text-xs text-ink-600">
          🏆 인기:{" "}
          {top.map((b, i) => (
            <button
              key={b.id}
              onClick={() => onOpen(b.id)}
              className="mr-2 font-bold text-ink-800 hover:text-brand-strong"
            >
              {i + 1}. {bookLabel(b)}{" "}
              <span className="font-normal text-ink-400">{b.n}회</span>
            </button>
          ))}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목·지은이 찾기"
          className="min-h-11 min-w-40 flex-1 rounded-btn border border-ink-300 px-3 text-sm"
        />
        {(
          [
            ["all", "전체"],
            ["free", "빌릴 수 있는 책"],
            ["out", "대출 중"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setOnly(key)}
            className={`press min-h-9 rounded-full px-3 text-xs font-bold ring-1 ${
              only === key
                ? "bg-ink-800 text-white ring-ink-800"
                : "bg-white text-ink-600 ring-ink-200"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setSort((v) => (v === "title" ? "pop" : "title"))}
          className="press min-h-9 rounded-full px-3 text-xs font-bold text-ink-500"
        >
          {sort === "title" ? "가나다순 ▾" : "많이 빌린 순 ▾"}
        </button>
      </div>
      {!books.length ? (
        <EmptyState
          emoji="📚"
          title="아직 등록된 책이 없어요"
          desc="사서가 책을 빌려주면 여기에 하나씩 쌓여요."
        />
      ) : !list.length ? (
        <EmptyState emoji="🔍" title="찾는 책이 없어요" />
      ) : (
        <ul className="mt-2 divide-y divide-ink-100">
          {list.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => onOpen(b.id)}
                className="press flex w-full flex-wrap items-center gap-2 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <b className="break-words text-[15px] text-ink-900">
                    《{bookLabel(b)}》
                  </b>
                  {b.a && (
                    <span className="ml-1 text-xs text-ink-400">{b.a}</span>
                  )}
                </span>
                <span className="tnum text-[11px] text-ink-400">{b.n}회</span>
                <BookStatus b={b} today={today} />
                <span className="text-ink-300">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** 📖 책 한 권의 이력 — 누가 언제 빌렸고 상태가 어떻게 변했는지 (이름은 사서·선생님만) */
function BookDetail({
  b,
  all,
  loans,
  canDesk,
  isTeacher,
  today,
  rules,
  onClose,
  onOpenLoan,
}: {
  b: Book;
  all: Book[];
  loans: Loan[] | undefined;
  canDesk: boolean;
  isTeacher: boolean;
  today: string;
  rules: ReturnType<typeof libraryRules>;
  onClose: () => void;
  onOpenLoan: (loanId: string) => void;
}) {
  const { toast, confirm } = useFeedback();
  const edit = useEditBook();
  const merge = useMergeBooks();
  const remove = useDeleteBook();
  const [t, setT] = useState(b.t);
  const [a, setA] = useState(b.a);
  const [into, setInto] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast(ok, "success");
    } catch (e) {
      toast(friendlyWriteError(e, "처리하지 못했어요."), "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`《${bookLabel(b)}》 이력`}
    >
      <div
        className="rise max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-white p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-ink-900">
              《{bookLabel(b)}》
            </p>
            {b.a && <p className="text-sm text-ink-500">{b.a}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="press min-h-11 min-w-11 rounded-btn text-xl text-ink-400"
          >
            ×
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BookStatus b={b} today={today} />
          <span className="text-xs text-ink-500">
            지금까지 <b>{b.n}</b>번 빌려 갔어요 · 지금 상태{" "}
            <b>{condLabel(b.c)}</b>
          </span>
        </div>

        {canDesk ? (
          <>
            <p className="mt-4 text-[13px] font-bold text-ink-700">
              📜 대출 이력
            </p>
            {!loans ? (
              <p className="mt-2 text-sm text-ink-400">불러오는 중…</p>
            ) : !loans.length ? (
              <p className="mt-2 text-sm text-ink-400">아직 기록이 없어요.</p>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {loans.map((l) => {
                  const fresh = newDamage(l.condOut, l.condIn);
                  return (
                    <li key={l.id}>
                      <button
                        onClick={() => onOpenLoan(l.id)}
                        className="press flex w-full flex-wrap items-center gap-2 rounded-btn bg-ink-50 px-3 py-2 text-left text-[13px] hover:bg-ink-100"
                      >
                        <span className="tnum text-[11px] text-ink-400">
                          {md(l.out)} →{" "}
                          {l.returned
                            ? md(l.returned)
                            : l.lost
                              ? "분실"
                              : "대출 중"}
                        </span>
                        <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[12px] font-bold text-brand-strong">
                          {nm(l.sid)}
                        </span>
                        <span className="min-w-0 flex-1 text-[11px] text-ink-500">
                          {condLabel(l.condOut)}
                          {l.condIn && ` → ${condLabel(l.condIn)}`}
                        </span>
                        {fresh.length > 0 && (
                          <span className="rounded-full bg-warn-weak px-2 py-0.5 text-[11px] font-bold text-warn">
                            🔧 {fresh.join("·")}
                          </span>
                        )}
                        {lateDays(l, l.returned ?? today, rules.holidays) >
                          0 && (
                          <span className="rounded-full bg-danger-weak px-2 py-0.5 text-[11px] font-bold text-danger">
                            연체
                          </span>
                        )}
                        <span className="text-ink-300">›</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        ) : (
          <p className="mt-4 rounded-btn bg-ink-50 px-3 py-2.5 text-xs text-ink-500">
            빌리고 싶으면 사서({rules.librarians.map(nm).join(", ")})에게 말해
            주세요.
          </p>
        )}

        {isTeacher && (
          <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
            <p className="text-[13px] font-bold text-ink-700">
              ✏️ 책 정보 고치기 (선생님)
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={t}
                onChange={(e) => setT(e.target.value)}
                className="min-h-11 min-w-40 flex-[2] rounded-btn border border-ink-300 px-3 text-sm"
              />
              <input
                value={a}
                onChange={(e) => setA(e.target.value)}
                placeholder="지은이"
                className="min-h-11 min-w-28 flex-1 rounded-btn border border-ink-300 px-3 text-sm"
              />
              <button
                onClick={() =>
                  void run(() => edit(b, t, a), "책 정보를 고쳤어요.")
                }
                className="press min-h-11 rounded-btn bg-brand px-4 text-sm font-bold text-white"
              >
                저장
              </button>
            </div>
            <p className="text-[13px] font-bold text-ink-700">
              🔗 같은 책인데 따로 등록됐다면 합치기
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                value={into}
                onChange={(e) => setInto(e.target.value)}
                className="min-h-11 min-w-40 flex-1 rounded-btn border border-ink-300 px-2 text-sm"
              >
                <option value="">이 책을 합칠 대상…</option>
                {all
                  .filter((x) => x.id !== b.id)
                  .sort((x, y) => x.t.localeCompare(y.t, "ko"))
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {bookLabel(x)}
                    </option>
                  ))}
              </select>
              <button
                disabled={!into}
                onClick={async () => {
                  const dst = all.find((x) => x.id === into);
                  if (!dst) return;
                  if (
                    !(await confirm({
                      title: `《${bookLabel(b)}》을 《${bookLabel(dst)}》에 합칠까요?`,
                      body: "이 책의 대출 이력이 모두 옮겨지고, 이 책은 목록에서 사라져요.",
                      confirmLabel: "합치기",
                    }))
                  )
                    return;
                  await run(() => merge(b, dst), "합쳤어요.");
                  onClose();
                }}
                className="press min-h-11 rounded-btn bg-ink-800 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                합치기
              </button>
            </div>
            <button
              disabled={!!b.on}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: `《${bookLabel(b)}》을 목록에서 지울까요?`,
                    body: "지난 대출 기록은 남아요. (학급문고에서 빠진 책일 때)",
                    confirmLabel: "지우기",
                    danger: true,
                  }))
                )
                  return;
                await run(() => remove(b), "목록에서 지웠어요.");
                onClose();
              }}
              className="press text-xs font-bold text-danger disabled:opacity-40"
            >
              목록에서 지우기{b.on ? " (대출 중이라 지금은 안 돼요)" : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 팝업 안 한 줄: 이름표 + 내용 */
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-ink-100 py-2 text-sm last:border-0">
      <span className="w-24 shrink-0 text-ink-500">{k}</span>
      <span className="min-w-0 flex-1 break-words text-ink-800">
        {children}
      </span>
    </div>
  );
}

/** 📋 대출 1건 상세 — 누가·언제·기한·반납, 빌릴 때/돌려받을 때 상태, 새 훼손, 기록한 사람 */
function LoanDetail({
  l,
  today,
  rules,
  canDesk,
  isTeacher,
  books,
  myId,
  canFix,
  startEditing,
  onClose,
  onAct,
  onFix,
}: {
  l: Loan;
  today: string;
  rules: ReturnType<typeof libraryRules>;
  canDesk: boolean;
  isTeacher: boolean;
  books: Book[];
  myId: number | null;
  canFix: boolean;
  startEditing: boolean;
  onClose: () => void;
  onAct: (kind: "undo" | "delete" | "checked" | "cancel") => Promise<void>;
  onFix: (p: Parameters<ReturnType<typeof useFixLoan>>[1]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(startEditing && canFix);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const fresh = newDamage(l.condOut, l.condIn);
  const late = lateDays(l, l.returned ?? today, rules.holidays);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`《${l.title}》 대출 기록`}
    >
      <div
        className="rise max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card bg-white p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {editing ? (
          <LoanEditForm
            l={l}
            books={books}
            onCancel={() => setEditing(false)}
            onSave={async (p) => {
              await onFix(p);
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-extrabold text-ink-900">
                  《{l.title}》
                </p>
                {l.author && <p className="text-sm text-ink-500">{l.author}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="press min-h-11 min-w-11 rounded-btn text-xl text-ink-400"
              >
                ×
              </button>
            </div>
            <div className="mt-3">
              <DueBadge
                l={l}
                today={today}
                holidays={rules.holidays}
                penalty={rules.penalty}
                mode={rules.mode}
              />
            </div>
            <div className="mt-3">
              <Row k="빌린 학생">
                <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[12px] font-bold text-brand-strong">
                  {nm(l.sid)}
                </span>
              </Row>
              <Row k="빌린 날">{md(l.out)}</Row>
              <Row k="반납 기한">
                {md(l.due)}
                {l.ext ? " (연장 1회)" : ""}
              </Row>
              <Row k="반납한 날">
                {l.returned
                  ? md(l.returned)
                  : l.lost
                    ? "분실"
                    : "아직 빌려 가는 중"}
              </Row>
              {late > 0 && (
                <Row k="연체">
                  <b className="text-danger">학교 오는 날 기준 {late}일</b>
                </Row>
              )}
              <Row k="빌릴 때 상태">
                <b>{condLabel(l.condOut)}</b>
                {l.noteOut && (
                  <span className="block text-xs text-ink-500">
                    {l.noteOut}
                  </span>
                )}
              </Row>
              <Row k="돌려받을 때">
                {l.condIn ? (
                  <>
                    <b>{condLabel(l.condIn)}</b>
                    {l.noteIn && (
                      <span className="block text-xs text-ink-500">
                        {l.noteIn}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </Row>
              {fresh.length > 0 && (
                <Row k="새 훼손">
                  <b className="text-warn">🔧 {fresh.join(" · ")}</b>
                  <span className="block text-xs text-ink-500">
                    빌릴 때는 없었어요
                    {l.damageNew ? " · 선생님 확인 전" : " · 선생님 확인 완료"}
                  </span>
                </Row>
              )}
              <Row k="기록한 사람">
                {l.by === "teacher" ? "선생님" : `사서 ${nm(l.by)}`}
              </Row>
            </div>
            {canDesk && (
              <div className="mt-4 flex flex-wrap gap-2">
                {canFix && (
                  <button
                    onClick={() => setEditing(true)}
                    className="press min-h-11 rounded-btn bg-brand px-3 text-sm font-bold text-white"
                  >
                    ✏️ 고치기
                  </button>
                )}
                {/* 사서의 대출 취소: 직접 기록한 것·30분 안·반납 전 (선생님은 아래 '기록 지우기') */}
                {canFix && !isTeacher && !l.returned && l.by === myId && (
                  <button
                    onClick={() => void onAct("cancel")}
                    className="press min-h-11 rounded-btn bg-white px-3 text-sm font-bold text-danger ring-1 ring-danger/30"
                  >
                    대출 취소
                  </button>
                )}
                {isTeacher && l.damageNew && (
                  <button
                    onClick={() => void onAct("checked")}
                    className="press min-h-11 flex-1 rounded-btn bg-warn px-3 text-sm font-bold text-white"
                  >
                    🔧 훼손 확인했어요
                  </button>
                )}
                {l.returned && (
                  <button
                    onClick={() => void onAct("undo")}
                    className="press min-h-11 rounded-btn bg-ink-100 px-3 text-sm font-bold text-ink-600"
                  >
                    반납 취소
                  </button>
                )}
                {isTeacher && (
                  <button
                    onClick={() => void onAct("delete")}
                    className="press min-h-11 rounded-btn px-3 text-sm font-bold text-danger"
                  >
                    기록 지우기
                  </button>
                )}
              </div>
            )}
            {canDesk && !canFix && !isTeacher && !l.returned && (
              <p className="mt-2 text-[11px] text-ink-400">
                기록한 지 {Math.round(FIX_WINDOW_MS / 60000)}분이 지나 사서는
                고칠 수 없어요 — 잘못됐다면 선생님께 말해 주세요.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** ✏️ 대출 고치기 폼 — 잘못 누른 학생·책·기한·빌릴 때 상태를 바로잡는다 */
function LoanEditForm({
  l,
  books,
  onCancel,
  onSave,
}: {
  l: Loan;
  books: Book[];
  onCancel: () => void;
  onSave: (p: Parameters<ReturnType<typeof useFixLoan>>[1]) => Promise<void>;
}) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState(l.title);
  const [author, setAuthor] = useState(l.author);
  const [bookId, setBookId] = useState<string | null>(null);
  const [sid, setSid] = useState(l.sid);
  const [due, setDue] = useState(l.due);
  const [cond, setCond] = useState<string[]>(l.condOut);
  const [note, setNote] = useState(l.noteOut);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="text-lg font-extrabold text-ink-900">✏️ 대출 고치기</p>
      <p className="mt-1 text-xs text-ink-500">
        잘못 누른 부분만 바꾸고 저장하세요. 빌린 날({md(l.out)})은 그대로예요.
      </p>

      <p className="mt-4 text-xs font-bold text-ink-500">책</p>
      <div className="relative mt-1">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value.slice(0, TITLE_MAX));
            setBookId(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className="min-h-11 w-full rounded-btn border border-ink-300 px-3 text-[15px]"
        />
        {open &&
          !bookId &&
          title.trim() &&
          bookKey(title) !== bookKey(l.title) && (
            <BookSuggest
              books={books.filter((b) => b.id !== l.bookId)}
              query={title}
              onPick={(b) => {
                setBookId(b.id);
                setTitle(b.t);
                setAuthor(b.a);
                setOpen(false);
              }}
            />
          )}
      </div>
      <input
        value={author}
        onChange={(e) => setAuthor(e.target.value.slice(0, AUTHOR_MAX))}
        placeholder="지은이 (선택)"
        className="mt-2 min-h-11 w-full rounded-btn border border-ink-300 px-3 text-sm"
      />

      <p className="mt-3 text-xs font-bold text-ink-500">빌린 친구</p>
      <select
        value={sid}
        onChange={(e) => setSid(Number(e.target.value))}
        className="mt-1 min-h-11 w-full rounded-btn border border-ink-300 px-2 text-sm font-bold"
      >
        {students
          .filter((s) => !s.inactive)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
      </select>

      <p className="mt-3 text-xs font-bold text-ink-500">반납 기한</p>
      <input
        type="date"
        value={due}
        min={l.out}
        onChange={(e) => e.target.value && setDue(e.target.value)}
        className="mt-1 min-h-11 rounded-btn border border-ink-300 px-2 text-sm"
      />

      <p className="mt-3 text-xs font-bold text-ink-500">빌릴 때 책 상태</p>
      <div className="mt-1">
        <CondPicker value={cond} onChange={setCond} />
      </div>
      {cond.length > 0 && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, COND_NOTE_MAX))}
          placeholder="어디가 어떤지"
          className="mt-2 min-h-11 w-full rounded-btn border border-ink-300 px-3 text-sm"
        />
      )}

      <div className="mt-5 flex gap-2">
        <button
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                title,
                author,
                sid,
                due,
                condOut: cond,
                noteOut: note,
                bookId,
              });
            } catch (e) {
              toast(
                friendlyWriteError(
                  e,
                  "고치지 못했어요 — 기록한 지 30분이 지났다면 선생님께 말해 주세요.",
                ),
                "error",
              );
            } finally {
              setBusy(false);
            }
          }}
          className="press min-h-11 flex-1 rounded-btn bg-brand px-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy ? "저장 중…" : "고친 내용 저장"}
        </button>
        <button
          onClick={onCancel}
          className="press min-h-11 rounded-btn bg-ink-100 px-4 text-sm font-bold text-ink-600"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function LibrarySettings() {
  const { data: settings } = useSettings();
  const save = useSaveSettings();
  const { toast } = useFeedback();
  const rules = libraryRules(settings);
  const [libs, setLibs] = useState<number[]>(rules.librarians);
  const [days, setDays] = useState(String(rules.days));
  const [max, setMax] = useState(String(rules.max));
  const [penalty, setPenalty] = useState(String(rules.penalty));
  const [mode, setMode] = useState(rules.mode);
  const [busy, setBusy] = useState(false);

  async function doSave() {
    if (!settings || busy) return;
    setBusy(true);
    try {
      await save({
        ...settings,
        librarians: libs,
        loanDays: Math.max(1, Math.min(60, Number(days) || 7)),
        loanMax: Math.max(1, Math.min(10, Number(max) || 2)),
        latePenalty: Math.max(0, Math.min(50, Number(penalty) || 0)),
        lateMode: mode,
      });
      toast("📚 학급문고 설정을 저장했어요.", "success");
    } catch (e) {
      toast(friendlyWriteError(e, "저장 실패"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Collapsible title="⚙️ 사서 · 대출 규칙 (선생님)">
      <p className="text-xs font-bold text-ink-500">
        사서 학생 — 대출·반납을 기록할 수 있어요
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {students
          .filter((s) => !s.inactive)
          .map((s) => (
            <button
              key={s.id}
              onClick={() =>
                setLibs((p) =>
                  p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id],
                )
              }
              className={`press min-h-9 rounded-full px-3 text-xs font-bold ring-1 ${
                libs.includes(s.id)
                  ? "bg-brand text-white ring-brand"
                  : "bg-white text-ink-600 ring-ink-200"
              }`}
            >
              {s.name}
            </button>
          ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-bold text-ink-500">
          대출 기간(일)
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-btn border border-ink-300 px-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-ink-500">
          한 사람 최대 권수
          <input
            type="number"
            min={1}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-btn border border-ink-300 px-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-ink-500">
          연체 감점(점)
          <input
            type="number"
            min={0}
            value={penalty}
            onChange={(e) => setPenalty(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-btn border border-ink-300 px-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["daily", "연체한 날마다 감점", "돌려줄 때까지 학교 오는 날마다"],
            ["once", "책마다 1번만 감점", "기한 다음 학교 오는 날 한 번"],
          ] as const
        ).map(([k, label, sub]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`press flex-1 rounded-btn p-2.5 text-left ring-1 ${mode === k ? "bg-brand-weak ring-brand" : "bg-white ring-ink-200"}`}
          >
            <b className="block text-sm text-ink-900">{label}</b>
            <span className="text-[11px] text-ink-500">{sub}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        감점은 학사일에만, 개인 점수에서만 빠져요(모둠 점수·MVP 판정엔 영향
        없음). 분실로 표시한 책은 감점이 멈춰요. 사서 활동 자체는 점수와
        상관없어요.
      </p>
      <button
        onClick={() => void doSave()}
        disabled={busy}
        className="press mt-3 min-h-11 w-full rounded-btn bg-brand text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? "저장 중…" : "저장"}
      </button>
    </Collapsible>
  );
}
