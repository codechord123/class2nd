"use client";
// 📚 학급문고 — 독서 탭 하위 화면. 보는 사람에 따라 다르게 보인다:
//   · 학생      : 내가 빌린 책(기한·연체 경고) + 돌려준 책 → ✍️ 감상문 쓰기(제목 자동 입력)
//   · 사서 학생 : + 🗂 대출 데스크 (빌려주기 · 반납 · 연장 1회 · 분실) + 최근 기록
//   · 선생님    : + ⚙️ 사서 지정 · 대출 규칙 · 연체 감점 방식
// 사서 활동 자체는 점수와 무관하다(사용자 확정). 연체만 집계가 개인 점수에서 뺀다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/stores/session";
import { useSettings, useSaveSettings } from "@/lib/query/settings";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import { friendlyWriteError } from "@/lib/auth";
import {
  AUTHOR_MAX,
  LOAN_EXT_MAX,
  TITLE_MAX,
  daysLeft,
  dueFrom,
  lateDays,
  libraryRules,
  useActiveLoans,
  useDeleteLoan,
  useLend,
  useLoanHistory,
  useMyLoans,
  useUpdateLoan,
  type Loan,
} from "@/lib/query/library";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Collapsible from "@/components/ui/Collapsible";
import { useFeedback } from "@/components/ui/Feedback";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

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
  const [showHistory, setShowHistory] = useState(false);
  const { data: history } = useLoanHistory(canDesk && showHistory);
  const lend = useLend(by);
  const update = useUpdateLoan(by);
  const del = useDeleteLoan();

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
  const [who, setWho] = useState<number | null>(null);
  const [due, setDue] = useState(() =>
    dueFrom(today, rules.days, rules.holidays),
  );
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

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
      await lend({ title, author, sid: who, out: today, due });
      toast(
        `📕 ${nm(who)} · 《${title.trim()}》 대출 — ${md(due)}까지`,
        "success",
      );
      setTitle("");
      setAuthor("");
      setWho(null);
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

  async function act(
    l: Loan,
    kind: "return" | "extend" | "lost" | "undo" | "delete",
  ) {
    try {
      if (kind === "return") {
        await update(l, { returned: today });
        toast(`📗 《${l.title}》 반납 완료`, "success");
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
        await del(l);
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
                    <span className="min-w-0 truncate text-ink-700">
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
          <div className="mt-3 rounded-card bg-ink-50 p-3">
            <p className="text-[13px] font-bold text-ink-700">📕 빌려주기</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                placeholder="책 제목"
                className="min-h-11 min-w-40 flex-[2] rounded-btn border border-ink-300 px-3 text-[15px]"
              />
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value.slice(0, AUTHOR_MAX))}
                placeholder="지은이 (선택)"
                className="min-h-11 min-w-28 flex-1 rounded-btn border border-ink-300 px-3 text-[15px]"
              />
            </div>
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
                    <b className="min-w-0 flex-1 break-words text-[15px] text-ink-900">
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
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center gap-2 rounded-btn bg-ink-50 px-2.5 py-1.5"
                  >
                    <span className="tnum text-[11px] text-ink-400">
                      {md(l.out)}
                    </span>
                    <b className="text-ink-700">{nm(l.sid)}</b>
                    <span className="min-w-0 flex-1 truncate">
                      《{l.title}》
                    </span>
                    <DueBadge
                      l={l}
                      today={today}
                      holidays={rules.holidays}
                      penalty={rules.penalty}
                      mode={rules.mode}
                    />
                    <span className="text-[11px] text-ink-400">
                      기록 {l.by === "teacher" ? "선생님" : nm(l.by)}
                    </span>
                    {l.returned && (
                      <button
                        onClick={() => void act(l, "undo")}
                        className="press text-[11px] font-bold text-ink-400 underline"
                      >
                        반납 취소
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
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
