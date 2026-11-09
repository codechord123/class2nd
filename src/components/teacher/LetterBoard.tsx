"use client";
// 💌 편지함 — 모든 학생 편지를 게시판처럼 한 번에 (2026-11 사용자: "아이를 눌러야만 보이는 게 불편,
// 게시판처럼 일괄로 + 태그로 모아보기"). 학생별 1:1 대화(LetterPanel)는 그대로 두고 그 위의 '받은편지함'.
//   · 안 읽음/전체 · 기간 · 학생 · 태그 · 검색 → 10/20개 페이지 (게시판 규격)
//   · 누르면 모달: 편지 전문 + 태그 붙이기 + 바로 답장 + 그 아이와의 최근 대화
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { students, studentById } from "@/lib/roster";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Pager from "@/components/ui/Pager";
import { useFeedback } from "@/components/ui/Feedback";
import {
  LETTER_MAX,
  isUnreadLetter,
  useAllLetters,
  useAllMailMeta,
  useLetterTags,
  useLetters,
  useMarkLetterRead,
  useSaveLetterTags,
  useSetLetterTags,
  useTeacherSendLetter,
  type BoardLetter,
} from "@/lib/query/letters";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const when = (ts: number) => {
  const d = new Date(ts + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const firstLine = (t: string) => {
  const f = (t.split("\n").find((x) => x.trim()) ?? "").trim();
  return f.length > 40 ? f.slice(0, 40) + "…" : f;
};
const PERIODS = [
  { days: 7, label: "1주" },
  { days: 30, label: "1달" },
  { days: 0, label: "전체" },
];

export default function LetterBoard() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useAllLetters(true, days);
  const { data: metas } = useAllMailMeta(true);
  const { data: tags } = useLetterTags(true);
  const [view, setView] = useState<"unread" | "all">("unread");
  const [who, setWho] = useState<number | null>(null);
  const [tag, setTag] = useState("");
  const [kw, setKw] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const studentLetters = useMemo(
    () => (data?.letters ?? []).filter((l) => l.from !== "teacher"),
    [data]
  );
  const unreadCount = studentLetters.filter((l) => isUnreadLetter(l, metas)).length;
  const tagCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of studentLetters) for (const t of l.tags ?? []) out[t] = (out[t] ?? 0) + 1;
    return out;
  }, [studentLetters]);
  const shown = useMemo(() => {
    const k = kw.trim();
    return studentLetters.filter(
      (l) =>
        (view === "all" || isUnreadLetter(l, metas)) &&
        (who == null || l.owner === who) &&
        (!tag || (l.tags ?? []).includes(tag)) &&
        (!k || l.text.includes(k) || nm(l.owner).includes(k))
    );
  }, [studentLetters, view, who, tag, kw, metas]);
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const items = shown.slice((safePage - 1) * pageSize, safePage * pageSize);
  const keyOf = (l: BoardLetter) => `${l.owner}/${l.id}`;
  const opened = studentLetters.find((l) => keyOf(l) === openKey) ?? null;
  const allTags = [...new Set([...(tags ?? []), ...Object.keys(tagCount)])];
  const denied = (error as { code?: string } | null)?.code === "permission-denied";

  const chip = (on: boolean) =>
    `press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
      on ? "bg-brand text-white ring-brand" : "bg-white text-ink-700 ring-ink-200"
    }`;

  return (
    <Card
      title="💌 편지함"
      desc="아이들이 보낸 편지를 게시판처럼 한 번에 봐요. 열면 읽음 처리되고, 태그를 붙여 모아볼 수 있어요."
    >
      {/* 보기 · 기간 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => (setView("unread"), setPage(1))} className={chip(view === "unread")}>
          안 읽음 {unreadCount > 0 && <b>{unreadCount}</b>}
        </button>
        <button onClick={() => (setView("all"), setPage(1))} className={chip(view === "all")}>
          전체 {studentLetters.length}
        </button>
        <span className="mx-1 h-4 w-px bg-ink-200" />
        {PERIODS.map((p) => (
          <button key={p.days} onClick={() => (setDays(p.days), setPage(1))} className={chip(days === p.days)}>
            {p.label}
          </button>
        ))}
      </div>
      {/* 학생 · 검색 */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={who ?? ""}
          onChange={(e) => (setWho(e.target.value ? Number(e.target.value) : null), setPage(1))}
          className="rounded-btn border border-ink-300 px-2.5 py-2 text-sm"
          aria-label="학생 고르기"
        >
          <option value="">모든 학생</option>
          {students
            .filter((s) => !s.inactive)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}번 {s.name}
              </option>
            ))}
        </select>
        <input
          value={kw}
          onChange={(e) => (setKw(e.target.value), setPage(1))}
          placeholder="🔎 내용·이름 검색"
          className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
        />
      </div>
      {/* 태그 */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => (setTag(""), setPage(1))} className={chip(!tag)}>
          🏷 모든 태그
        </button>
        {allTags.map((t) => (
          <button key={t} onClick={() => (setTag(tag === t ? "" : t), setPage(1))} className={chip(tag === t)}>
            #{t}
            {tagCount[t] ? <span className="ml-1 opacity-70">{tagCount[t]}</span> : null}
          </button>
        ))}
      </div>

      {data?.indexUrl && (
        <p className="mt-2 rounded-btn bg-ink-50 px-3 py-2 text-xs text-ink-500">
          💡 편지가 많아져도 빠르게 보려면{" "}
          <a href={data.indexUrl} target="_blank" rel="noreferrer" className="font-bold text-brand underline">
            색인 만들기
          </a>
          를 한 번 눌러 주세요 (Firebase 콘솔, 몇 분 걸려요). 지금도 모두 잘 보여요.
        </p>
      )}

      {/* 목록 */}
      <div className="mt-3">
        {denied ? (
          <EmptyState
            emoji="🔒"
            title="편지함 규칙이 아직 게시되지 않았어요"
            desc="Firebase 콘솔에 최신 firestore.rules를 게시하면 열려요."
          />
        ) : isLoading ? (
          <p className="py-6 text-center text-sm text-ink-400">편지를 모으는 중…</p>
        ) : !items.length ? (
          <EmptyState
            emoji={view === "unread" ? "✨" : "📭"}
            title={view === "unread" ? "안 읽은 편지가 없어요" : "조건에 맞는 편지가 없어요"}
            desc={view === "unread" ? "'전체'를 누르면 지난 편지도 볼 수 있어요." : undefined}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((l) => {
              const unread = isUnreadLetter(l, metas);
              return (
                <li key={keyOf(l)}>
                  <button
                    onClick={() => setOpenKey(keyOf(l))}
                    className="flex w-full items-start gap-2.5 px-1 py-3 text-left hover:bg-ink-50"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-danger" : "bg-transparent"}`}
                      aria-label={unread ? "안 읽음" : undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-brand-weak px-1.5 py-0.5 text-xs font-bold text-brand-strong">
                          {nm(l.owner)}
                        </span>
                        <span className={`text-[15px] ${unread ? "font-extrabold text-ink-900" : "font-bold text-ink-700"}`}>
                          {firstLine(l.text)}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
                        {when(l.createdAt)}
                        {(l.tags ?? []).map((t) => (
                          <span key={t} className="rounded bg-ink-100 px-1.5 py-0.5 font-bold text-ink-600">
                            #{t}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
        <select
          value={pageSize}
          onChange={(e) => (setPageSize(Number(e.target.value)), setPage(1))}
          className="rounded-btn border border-ink-300 px-2 py-1.5 text-xs"
          aria-label="한 쪽에 보일 개수"
        >
          <option value={10}>10개씩</option>
          <option value={20}>20개씩</option>
        </select>
      </div>

      {opened && <LetterModal letter={opened} allTags={allTags} onClose={() => setOpenKey(null)} />}
    </Card>
  );
}

export function LetterModal({
  letter,
  allTags,
  onClose,
}: {
  letter: BoardLetter;
  allTags: string[];
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const markRead = useMarkLetterRead();
  const setTags = useSetLetterTags();
  const saveTagList = useSaveLetterTags();
  const send = useTeacherSendLetter();
  const { data: thread } = useLetters(letter.owner);
  const [reply, setReply] = useState("");
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = letter.tags ?? [];

  // 연 순간 읽음 (쓰기 1~2회)
  useEffect(() => {
    void markRead(letter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter.owner, letter.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleTag(t: string) {
    const next = mine.includes(t) ? mine.filter((x) => x !== t) : [...mine, t];
    await setTags(letter, next).catch((e) =>
      toast(e instanceof Error ? e.message : "태그 저장 실패", "error")
    );
  }
  async function addTag() {
    const t = newTag.trim().replace(/^#/, "");
    if (!t) return;
    if (!allTags.includes(t)) await saveTagList([...allTags, t]).catch(() => {});
    if (!mine.includes(t)) await toggleTag(t);
    setNewTag("");
  }
  async function doReply() {
    if (busy || !reply.trim()) return;
    setBusy(true);
    try {
      await send([letter.owner], reply);
      setReply("");
      toast(`💌 ${nm(letter.owner)}에게 답장을 보냈어요.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  // 최근 대화 — 오래된 것부터, 이 편지 앞뒤 맥락이 보이게
  const convo = [...(thread ?? [])].sort((a, b) => a.createdAt - b.createdAt).slice(-12);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${nm(letter.owner)}의 편지`}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-card bg-white p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="rounded bg-brand-weak px-1.5 py-0.5 text-xs font-bold text-brand-strong">
              {nm(letter.owner)}
            </span>
            <span className="ml-2 text-xs text-ink-400">{when(letter.createdAt)}</span>
          </div>
          <button
            onClick={onClose}
            className="press shrink-0 rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600"
          >
            ✕ 닫기
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-base leading-8 text-ink-800">{letter.text}</p>

        {/* 태그 */}
        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="text-[13px] font-bold text-ink-700">🏷 태그</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => void toggleTag(t)}
                className={`press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                  mine.includes(t) ? "bg-brand text-white ring-brand" : "bg-white text-ink-700 ring-ink-200"
                }`}
              >
                #{t}
              </button>
            ))}
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void addTag();
              }}
              placeholder="새 태그"
              className="w-24 rounded-full border border-dashed border-ink-300 px-3 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* 답장 */}
        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="text-[13px] font-bold text-ink-700">✉️ {nm(letter.owner)}에게 답장</p>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, LETTER_MAX))}
            rows={3}
            placeholder="답장은 이 아이 우체통에만 가요."
            className="mt-1.5 w-full rounded-btn border border-ink-300 px-3 py-2 text-[15px]"
          />
          <div className="mt-1.5 flex justify-end">
            <button
              onClick={() => void doReply()}
              disabled={busy || !reply.trim()}
              className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? "보내는 중…" : "💌 답장 보내기"}
            </button>
          </div>
        </div>

        {/* 최근 대화 */}
        {convo.length > 1 && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="text-[13px] font-bold text-ink-700">💬 {nm(letter.owner)}와(과)의 최근 대화</p>
            <ul className="mt-2 space-y-2">
              {convo.map((m) => (
                <li
                  key={m.id}
                  className={`max-w-[85%] rounded-btn px-3 py-2 text-sm leading-relaxed ${
                    m.from === "teacher" ? "ml-auto bg-brand-weak text-ink-800" : "bg-ink-50 text-ink-800"
                  } ${m.id === letter.id ? "ring-2 ring-brand/40" : ""}`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {m.from === "teacher" ? "선생님" : nm(letter.owner)} · {when(m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
