"use client";
// 건의 게시판 — 최근 10개 + 더보기 (1학기의 전체 실시간 구독 제거).
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { useSuggestions, usePostSuggestion, useDeleteSuggestion } from "@/lib/query/board";

export default function BoardPage() {
  const { role, studentId } = useSession();
  const [pages, setPages] = useState(1);
  const { data: posts } = useSuggestions(pages);
  const post = usePostSuggestion(studentId);
  const remove = useDeleteSuggestion();

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
        {!posts?.length && <p className="mt-2 text-sm text-slate-400">아직 건의가 없어요.</p>}
        <ul className="mt-3 space-y-2">
          {posts?.map((p) => (
            <li key={p.id} className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {p.isAnonymous ? "익명" : (studentById.get(p.studentId)?.name ?? "?")} ·{" "}
                  {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                </span>
                {role === "teacher" && (
                  <button
                    onClick={() => void remove(p.id)}
                    className="text-xs text-rose-400 hover:text-rose-600"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{p.content}</p>
            </li>
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
