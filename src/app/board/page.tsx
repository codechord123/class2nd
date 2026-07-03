"use client";
// 건의 게시판 — 공지 고정 + 댓글·답글 (1학기 이식, 전체 실시간 구독 없이 캐시 기반).
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
  type Suggestion,
} from "@/lib/query/board";

function authorName(id: number | "teacher"): string {
  return id === "teacher" ? "선생님" : (studentById.get(id)?.name ?? "?");
}

function SuggestionCard({
  sug,
  pinned,
}: {
  sug: Suggestion;
  pinned?: boolean;
}) {
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
    <li
      className={`rounded-lg p-3 ${pinned ? "border border-amber-300 bg-amber-50" : "bg-slate-50"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-400">
          {pinned && <b className="mr-1 text-amber-600">📌 공지</b>}
          {sug.isAnonymous ? "익명" : authorName(sug.studentId)} ·{" "}
          {new Date(sug.createdAt).toLocaleDateString("ko-KR")}
        </span>
        {role === "teacher" && (
          <span className="flex gap-2 text-xs">
            <button
              onClick={() => void toggleAnnouncement(sug)}
              className="text-amber-500 hover:text-amber-700"
            >
              {sug.isAnnouncement ? "공지 내리기" : "공지 올리기"}
            </button>
            <button
              onClick={() => void removeSuggestion(sug.id)}
              className="text-rose-400 hover:text-rose-600"
            >
              삭제
            </button>
          </span>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{sug.content}</p>

      {/* 댓글 */}
      {parents.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
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
                        onClick={() => void deleteComment(sug, c.id)}
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
                        onClick={() => void deleteComment(sug, r.id)}
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
      )}

      {/* 댓글 입력 */}
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submitComment()}
          placeholder={
            replyTo != null
              ? `↳ ${authorName(comments.find((c) => c.id === replyTo)?.studentId ?? 0)}님에게 답글…`
              : "댓글 달기…"
          }
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <button
          onClick={() => void submitComment()}
          className="shrink-0 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white"
        >
          등록
        </button>
      </div>
      {msg && <p className="mt-1 text-xs">{msg}</p>}
    </li>
  );
}

export default function BoardPage() {
  const { role, studentId } = useSession();
  const [pages, setPages] = useState(1);
  const { data: posts } = useSuggestions(pages);
  const { data: announcements } = useAnnouncements();
  const post = usePostSuggestion(studentId);

  const [content, setContent] = useState("");
  const [anon, setAnon] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      await post(content, anon);
      setContent("");
      setMsg("✅ 건의가 등록되었어요!");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "등록 실패"}`);
    } finally {
      setBusy(false);
    }
  }

  const normalPosts = (posts ?? []).filter((p) => !p.isAnnouncement);

  return (
    <div className="space-y-4">
      {role === "student" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold">📬 건의하기</h3>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="우리 반을 위한 의견을 남겨주세요"
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-3">
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
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold">📋 건의 목록</h3>
        {!announcements?.length && !normalPosts.length && (
          <p className="mt-2 text-sm text-slate-400">아직 건의가 없어요.</p>
        )}
        <ul className="mt-3 space-y-2">
          {announcements?.map((p) => <SuggestionCard key={p.id} sug={p} pinned />)}
          {normalPosts.map((p) => (
            <SuggestionCard key={p.id} sug={p} />
          ))}
        </ul>
        {posts && posts.length >= pages * 10 && (
          <button
            onClick={() => setPages((p) => p + 1)}
            className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            더 보기
          </button>
        )}
      </section>
    </div>
  );
}
