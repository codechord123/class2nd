"use client";
// 건의 게시판 — 커뮤니티 게시판형 리빌드:
//   목록(번호·제목·작성자·날짜·💬댓글수) → 클릭하면 상세 화면(본문+댓글 스레드).
//   공지 상단 고정 · 검색 · 글쓰기 접기 · 더보기 페이지네이션.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import Linkify from "@/components/ui/Linkify";
import EmptyState from "@/components/ui/EmptyState";
import { useFeedback } from "@/components/ui/Feedback";
import {
  useSuggestions,
  useAnnouncements,
  usePostSuggestion,
  useDeleteSuggestion,
  useAddComment,
  useDeleteComment,
  useToggleAnnouncement,
  useReactSuggestion,
  useSetAgendaStatus,
  reactionCounts,
  titleOf,
  AGENDA_STATUS,
  type AgendaStatus,
  type Suggestion,
} from "@/lib/query/board";

function authorName(id: number | "teacher"): string {
  return id === "teacher" ? "선생님" : (studentById.get(id)?.name ?? "?");
}

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

const STATUS_STYLE: Record<AgendaStatus, string> = {
  논의중: "bg-brand-weak text-brand-strong",
  채택: "bg-success-weak text-success",
  보류: "bg-ink-100 text-ink-500",
};

function StatusBadge({ sug }: { sug: Suggestion }) {
  const st = sug.status ?? "논의중";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[st]}`}>
      {st}
    </span>
  );
}

// ── 상세 화면 (본문 + 댓글 스레드) ────────────────────────────────
function PostDetail({ sug, onBack }: { sug: Suggestion; onBack: () => void }) {
  const { role, studentId } = useSession();
  const addComment = useAddComment(role === "teacher" ? "teacher" : studentId);
  const deleteComment = useDeleteComment();
  const toggleAnnouncement = useToggleAnnouncement();
  const removeSuggestion = useDeleteSuggestion();
  const react = useReactSuggestion(studentId);
  const setStatus = useSetAgendaStatus();
  const { toast, confirm } = useFeedback();

  const { up, down } = reactionCounts(sug);
  const myReaction =
    studentId == null
      ? null
      : sug.agree?.[studentId]
        ? "agree"
        : sug.disagree?.[studentId]
          ? "disagree"
          : null;

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);

  const comments = sug.comments ?? [];
  const parents = comments.filter((c) => c.replyTo == null);

  async function submitComment() {
    if (posting || !text.trim()) return;
    setPosting(true);
    try {
      await addComment(sug.id, text, replyTo ?? undefined);
      setText("");
      setReplyTo(null);
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "실패"}`, "error");
    } finally {
      setPosting(false);
    }
  }

  // 확인 다이얼로그 → 삭제 실행 → 실패 시 토스트 (3곳 공통)
  async function confirmDelete(title: string, run: () => Promise<void>) {
    if (!(await confirm({ title, danger: true }))) return;
    try {
      await run();
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "삭제 실패"}`, "error");
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <button onClick={onBack} className="text-sm text-ink-400 hover:text-ink-600">
        ← 목록으로
      </button>

      <div className="mt-3 border-b border-ink-100 pb-3">
        <div className="flex items-start gap-2">
          <StatusBadge sug={sug} />
          <h3 className="text-lg font-bold leading-snug">
            {sug.isAnnouncement && <span className="mr-1 text-amber-500">📌</span>}
            {titleOf(sug)}
          </h3>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
          <span>
            {sug.isAnonymous ? "익명" : authorName(sug.studentId)} ·{" "}
            {new Date(sug.createdAt).toLocaleString("ko-KR", {
              month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
            })}{" "}
            · 💬 {comments.length}
          </span>
          {role === "teacher" && (
            <span className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await toggleAnnouncement(sug);
                    toast(sug.isAnnouncement ? "공지를 내렸어요." : "📌 공지로 올렸어요.");
                  } catch (e) {
                    toast(`⚠️ ${e instanceof Error ? e.message : "실패"}`, "error");
                  }
                }}
                className="text-warn hover:opacity-80"
              >
                {sug.isAnnouncement ? "공지 내리기" : "공지 올리기"}
              </button>
              <button
                onClick={() =>
                  void confirmDelete("이 글과 댓글을 모두 삭제할까요?", async () => {
                    await removeSuggestion(sug.id);
                    onBack();
                  })
                }
                className="text-danger hover:opacity-80"
              >
                삭제
              </button>
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
        <Linkify text={sug.content} />
      </p>

      {/* 찬성/반대 — 안건에 대한 의사 표시 */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() =>
            role === "student" &&
            void react(sug, "agree").catch((e: Error) => toast(`⚠️ ${e.message}`, "error"))
          }
          disabled={role !== "student"}
          className={`press flex items-center gap-1.5 rounded-btn border px-4 py-2 text-sm font-bold transition-colors ${
            myReaction === "agree"
              ? "border-success bg-success text-white"
              : "border-ink-200 bg-white text-ink-600"
          }`}
        >
          👍 찬성 <span className="tnum">{up}</span>
        </button>
        <button
          onClick={() =>
            role === "student" &&
            void react(sug, "disagree").catch((e: Error) => toast(`⚠️ ${e.message}`, "error"))
          }
          disabled={role !== "student"}
          className={`press flex items-center gap-1.5 rounded-btn border px-4 py-2 text-sm font-bold transition-colors ${
            myReaction === "disagree"
              ? "border-danger bg-danger text-white"
              : "border-ink-200 bg-white text-ink-600"
          }`}
        >
          👎 반대 <span className="tnum">{down}</span>
        </button>
      </div>

      {/* 교사: 안건 상태 결정 */}
      {role === "teacher" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3">
          <span className="text-xs text-ink-400">안건 상태:</span>
          {AGENDA_STATUS.map((st) => {
            const active = (sug.status ?? "논의중") === st;
            return (
              <button
                key={st}
                onClick={() =>
                  void setStatus(sug, st).then(
                    () => toast(`상태를 '${st}'(으)로 바꿨어요.`),
                    (e: Error) => toast(`⚠️ ${e.message}`, "error")
                  )
                }
                className={`press rounded-full px-3 py-1 text-xs font-bold ${
                  active ? STATUS_STYLE[st] : "bg-ink-100 text-ink-400"
                }`}
              >
                {st}
              </button>
            );
          })}
        </div>
      )}

      {/* 댓글 스레드 */}
      <div className="mt-4">
        <p className="text-xs font-bold text-ink-500">💬 댓글 {comments.length}</p>
        <ul className="mt-2 space-y-3">
          {parents.map((c) => {
            const replies = comments.filter((r) => r.replyTo === c.id);
            const canDelete =
              role === "teacher" || (role === "student" && c.studentId === studentId);
            return (
              <li key={c.id} className="text-sm">
                <div className="rounded-card bg-ink-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-xs font-bold text-ink-600">{authorName(c.studentId)}</b>
                    <span className="flex shrink-0 gap-2 text-xs">
                      <button
                        onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                        className="font-medium text-brand hover:text-brand-strong"
                      >
                        답글
                      </button>
                      {canDelete && (
                        <button
                          onClick={() =>
                            void confirmDelete("댓글을 삭제할까요?", () => deleteComment(sug, c.id))
                          }
                          className="text-ink-400 hover:text-danger"
                        >
                          삭제
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-ink-800">
                    <Linkify text={c.text} />
                  </p>
                </div>
                {/* 답글 — 왼쪽 레일로 중첩 표현 */}
                {replies.length > 0 && (
                  <div className="mt-1.5 ml-3 space-y-1.5 border-l-2 border-ink-200 pl-3">
                    {replies.map((r) => (
                      <div key={r.id} className="flex items-start justify-between gap-2">
                        <p className="text-ink-700">
                          <b className="mr-1 text-xs font-bold text-ink-500">
                            {authorName(r.studentId)}
                          </b>
                          <Linkify text={r.text} />
                        </p>
                        {(role === "teacher" ||
                          (role === "student" && r.studentId === studentId)) && (
                          <button
                            onClick={() =>
                              void confirmDelete("답글을 삭제할까요?", () => deleteComment(sug, r.id))
                            }
                            className="shrink-0 text-xs text-ink-400 hover:text-danger"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* 댓글 입력 — 하단 고정감 */}
        <div className="mt-3 flex items-center gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void submitComment();
            }}
            placeholder={
              replyTo != null
                ? `↳ ${authorName(comments.find((c) => c.id === replyTo)?.studentId ?? 0)}님에게 답글…`
                : "댓글 달기…"
            }
            className="min-w-0 flex-1 rounded-btn bg-ink-100 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-brand/40"
          />
          <button
            onClick={() => void submitComment()}
            className="press shrink-0 rounded-btn bg-brand px-4 py-2.5 text-sm font-bold text-white"
          >
            등록
          </button>
        </div>
      </div>
    </section>
  );
}

// ── 목록 화면 ────────────────────────────────────────────────────
export default function BoardPage() {
  const { role, studentId } = useSession();
  const [pages, setPages] = useState(1);
  const { data: posts } = useSuggestions(pages);
  const { data: announcements } = useAnnouncements();
  const post = usePostSuggestion(studentId);
  const { toast } = useFeedback();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [anon, setAnon] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const all = [...(announcements ?? []), ...(posts ?? []).filter((p) => !p.isAnnouncement)];
  const selected = all.find((p) => p.id === selectedId);

  async function submit() {
    setBusy(true);
    try {
      await post(title, content, anon);
      setTitle("");
      setContent("");
      setWriting(false);
      toast("✅ 등록되었어요!");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "등록 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  // 상세 화면
  if (selected) {
    return <PostDetail sug={selected} onBack={() => setSelectedId(null)} />;
  }

  const kw = search.trim().toLowerCase();
  const matches = (p: Suggestion) => {
    if (!kw) return true;
    const author = p.isAnonymous ? "익명" : authorName(p.studentId);
    const commentText = (p.comments ?? []).map((c) => c.text).join(" ");
    return `${titleOf(p)} ${p.content} ${author} ${commentText}`.toLowerCase().includes(kw);
  };
  const pinned = (announcements ?? []).filter(matches);
  const normal = (posts ?? []).filter((p) => !p.isAnnouncement).filter(matches);

  const Row = ({ p, pin }: { p: Suggestion; pin?: boolean }) => {
    const { up, down } = reactionCounts(p);
    return (
      <button
        onClick={() => setSelectedId(p.id)}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-ink-50 ${
          pin ? "bg-amber-50/60" : ""
        }`}
      >
        <StatusBadge sug={p} />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {pin && <span className="shrink-0 text-xs text-amber-500">📌</span>}
          <span className="truncate text-sm font-medium text-ink-700">{titleOf(p)}</span>
          {up + down > 0 && (
            <span className="shrink-0 text-[11px] text-ink-400">
              👍{up} 👎{down}
            </span>
          )}
          {(p.comments?.length ?? 0) > 0 && (
            <span className="shrink-0 text-xs font-bold text-brand">💬{p.comments!.length}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-ink-400">
          {p.isAnonymous ? "익명" : authorName(p.studentId)} · {dateLabel(p.createdAt)}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-ink-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 p-4">
          <h3 className="font-bold">📬 안건·토론</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 검색"
              className="w-32 rounded-btn border border-ink-200 px-3 py-1.5 text-sm"
            />
            {role === "student" && (
              <button
                onClick={() => setWriting((v) => !v)}
                className="press rounded-btn bg-brand px-3 py-1.5 text-sm font-bold text-white"
              >
                {writing ? "닫기" : "✏️ 안건 올리기"}
              </button>
            )}
          </div>
        </div>

        {writing && (
          <div className="space-y-2 border-b border-ink-100 bg-ink-50/50 p-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="안건 제목 (예: 사물함 정리 규칙을 정하자)"
              className="w-full rounded-btn border border-ink-300 px-3 py-2 text-sm"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="어떤 점을 바꾸면 좋을지, 왜 그런지 적어주세요. 친구들이 댓글로 토론하고 👍👎로 의견을 모아요."
              rows={4}
              className="w-full rounded-btn border border-ink-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-ink-500">
                <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
                익명으로
              </label>
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                등록
              </button>
            </div>
          </div>
        )}

        {/* 목록 */}
        {!posts && !announcements ? (
          <p className="px-4 py-8 text-center text-sm text-ink-400">불러오는 중…</p>
        ) : !pinned.length && !normal.length ? (
          search ? (
            <EmptyState emoji="🔍" title="검색 결과가 없어요" />
          ) : (
            <EmptyState emoji="📭" title="아직 안건이 없어요" desc="첫 안건을 올려보세요!" />
          )
        ) : (
          <ul className="divide-y divide-ink-100">
            {pinned.map((p) => (
              <li key={p.id}>
                <Row p={p} pin />
              </li>
            ))}
            {normal.map((p) => (
              <li key={p.id}>
                <Row p={p} />
              </li>
            ))}
          </ul>
        )}

        {posts && posts.length >= pages * 10 && (
          <button
            onClick={() => setPages((p) => p + 1)}
            className="w-full border-t border-ink-100 py-2.5 text-sm text-ink-500 hover:bg-ink-50"
          >
            더 보기
          </button>
        )}
      </section>
    </div>
  );
}
