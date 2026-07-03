"use client";
// 건의 게시판 — 커뮤니티 게시판형 리빌드:
//   목록(번호·제목·작성자·날짜·💬댓글수) → 클릭하면 상세 화면(본문+댓글 스레드).
//   공지 상단 고정 · 검색 · 글쓰기 접기 · 더보기 페이지네이션.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import {
  useSuggestions,
  useAnnouncements,
  usePostSuggestion,
  useDeleteSuggestion,
  useAddComment,
  useDeleteComment,
  useToggleAnnouncement,
  titleOf,
  type Suggestion,
} from "@/lib/query/board";

function authorName(id: number | "teacher"): string {
  return id === "teacher" ? "선생님" : (studentById.get(id)?.name ?? "?");
}

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

// ── 상세 화면 (본문 + 댓글 스레드) ────────────────────────────────
function PostDetail({ sug, onBack }: { sug: Suggestion; onBack: () => void }) {
  const { role, studentId } = useSession();
  const addComment = useAddComment(role === "teacher" ? "teacher" : studentId);
  const deleteComment = useDeleteComment();
  const toggleAnnouncement = useToggleAnnouncement();
  const removeSuggestion = useDeleteSuggestion();

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const comments = sug.comments ?? [];
  const parents = comments.filter((c) => c.replyTo == null);

  async function submitComment() {
    setMsg("");
    try {
      await addComment(sug.id, text, replyTo ?? undefined);
      setText("");
      setReplyTo(null);
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "실패"}`);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-600">
        ← 목록으로
      </button>

      <div className="mt-3 border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold">
          {sug.isAnnouncement && <span className="mr-1 text-amber-500">📌</span>}
          {titleOf(sug)}
        </h3>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
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
                onClick={() => void toggleAnnouncement(sug)}
                className="text-amber-500 hover:text-amber-700"
              >
                {sug.isAnnouncement ? "공지 내리기" : "공지 올리기"}
              </button>
              <button
                onClick={() => {
                  if (confirm("이 글과 댓글을 모두 삭제할까요?")) {
                    void removeSuggestion(sug.id).then(onBack);
                  }
                }}
                className="text-rose-400 hover:text-rose-600"
              >
                삭제
              </button>
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {sug.content}
      </p>

      {/* 댓글 스레드 */}
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <p className="text-xs font-bold text-slate-500">💬 댓글 {comments.length}</p>
        <ul className="mt-2 space-y-2">
          {parents.map((c) => {
            const replies = comments.filter((r) => r.replyTo === c.id);
            const canDelete =
              role === "teacher" || (role === "student" && c.studentId === studentId);
            return (
              <li key={c.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span>
                    <b className="text-xs text-slate-500">{authorName(c.studentId)}</b>{" "}
                    <span className="text-slate-700">{c.text}</span>
                  </span>
                  <span className="flex shrink-0 gap-1.5 text-[10px]">
                    <button
                      onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                      className="text-indigo-400 hover:text-indigo-600"
                    >
                      답글
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => confirm("댓글을 삭제할까요?") && void deleteComment(sug, c.id)}
                        className="text-rose-300 hover:text-rose-500"
                      >
                        삭제
                      </button>
                    )}
                  </span>
                </div>
                {replies.map((r) => (
                  <div key={r.id} className="mt-1 flex items-baseline justify-between gap-2 pl-4">
                    <span>
                      <span className="text-slate-300">↳</span>{" "}
                      <b className="text-xs text-slate-500">{authorName(r.studentId)}</b>{" "}
                      <span className="text-slate-600">{r.text}</span>
                    </span>
                    {(role === "teacher" || (role === "student" && r.studentId === studentId)) && (
                      <button
                        onClick={() => confirm("답글을 삭제할까요?") && void deleteComment(sug, r.id)}
                        className="shrink-0 text-[10px] text-rose-300 hover:text-rose-500"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>

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
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          />
          <button
            onClick={() => void submitComment()}
            className="shrink-0 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white"
          >
            등록
          </button>
        </div>
        {msg && <p className="mt-1 text-xs">{msg}</p>}
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [anon, setAnon] = useState(false);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const all = [...(announcements ?? []), ...(posts ?? []).filter((p) => !p.isAnnouncement)];
  const selected = all.find((p) => p.id === selectedId);

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      await post(title, content, anon);
      setTitle("");
      setContent("");
      setWriting(false);
      setMsg("✅ 등록되었어요!");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "등록 실패"}`);
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

  const Row = ({ p, pin }: { p: Suggestion; pin?: boolean }) => (
    <button
      onClick={() => setSelectedId(p.id)}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${
        pin ? "bg-amber-50/60" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {pin && <span className="shrink-0 text-xs text-amber-500">📌</span>}
        <span className="truncate text-sm font-medium text-slate-700">{titleOf(p)}</span>
        {(p.comments?.length ?? 0) > 0 && (
          <span className="shrink-0 text-xs font-bold text-indigo-400">
            💬{p.comments!.length}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-slate-400">
        {p.isAnonymous ? "익명" : authorName(p.studentId)} · {dateLabel(p.createdAt)}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
          <h3 className="font-bold">📬 건의 게시판</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 검색"
              className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            />
            {role === "student" && (
              <button
                onClick={() => setWriting((v) => !v)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white"
              >
                {writing ? "닫기" : "✏️ 글쓰기"}
              </button>
            )}
          </div>
        </div>

        {writing && (
          <div className="space-y-2 border-b border-slate-100 bg-slate-50/50 p-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="우리 반을 위한 의견을 남겨주세요"
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-slate-500">
                <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
                익명으로
              </label>
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                등록
              </button>
              {msg && <span className="text-sm">{msg}</span>}
            </div>
          </div>
        )}

        {/* 목록 */}
        {!pinned.length && !normal.length ? (
          <p className="p-4 text-sm text-slate-400">
            {search ? "검색 결과가 없어요." : "아직 글이 없어요. 첫 글을 남겨보세요!"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
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
            className="w-full border-t border-slate-100 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
          >
            더 보기
          </button>
        )}
      </section>
    </div>
  );
}
