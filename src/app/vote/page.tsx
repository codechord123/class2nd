"use client";
// 투표 게시판 — 만들기 + 투표 + 실시간 아닌 캐시 기반 결과 표시.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { usePolls, useCreatePoll, useVote, useDeletePoll } from "@/lib/query/board";

export default function VotePage() {
  const { role, studentId } = useSession();
  const [pages, setPages] = useState(1);
  const { data: polls } = usePolls(pages);
  const createPoll = useCreatePoll(role === "teacher" ? "teacher" : studentId);
  const vote = useVote(studentId);
  const removePoll = useDeletePoll();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [msg, setMsg] = useState("");

  async function submit() {
    setMsg("");
    try {
      await createPoll(title, optionsText.split("\n"));
      setTitle("");
      setOptionsText("");
      setShowForm(false);
      setMsg("✅ 투표가 만들어졌어요!");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "생성 실패"}`);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">🗳️ 투표 게시판</h3>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {showForm ? "닫기" : "+ 투표 만들기"}
          </button>
        </div>
        {showForm && (
          <div className="mt-3 space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="투표 제목"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={"선택지를 한 줄에 하나씩 적어주세요\n예)\n피구\n축구\n보드게임"}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void submit()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
            >
              만들기
            </button>
          </div>
        )}
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </section>

      {!polls?.length && (
        <p className="text-sm text-slate-400">아직 투표가 없어요. 첫 투표를 만들어보세요!</p>
      )}

      {polls?.map((p) => {
        const counts = p.options.map(
          (_, i) => Object.values(p.votes ?? {}).filter((v) => v === i).length
        );
        const total = counts.reduce((a, b) => a + b, 0);
        const myVote = studentId != null ? p.votes?.[String(studentId)] : undefined;
        return (
          <section key={p.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-bold">{p.title}</h4>
              <span className="text-xs text-slate-400">
                {p.createdBy === "teacher" ? "선생님" : (studentById.get(p.createdBy)?.name ?? "?")}{" "}
                · {total}표
                {role === "teacher" && (
                  <button
                    onClick={() => void removePoll(p.id)}
                    className="ml-2 text-rose-400 hover:text-rose-600"
                  >
                    삭제
                  </button>
                )}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {p.options.map((opt, i) => {
                const pct = total ? Math.round((counts[i] / total) * 100) : 0;
                const chosen = myVote === i;
                return (
                  <li key={i}>
                    <button
                      onClick={() => role === "student" && void vote(p.id, i)}
                      disabled={role !== "student"}
                      className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm ${
                        chosen ? "border-indigo-400 font-bold" : "border-slate-200"
                      }`}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 ${chosen ? "bg-indigo-100" : "bg-slate-100"}`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative flex justify-between">
                        <span>
                          {chosen && "✓ "}
                          {opt}
                        </span>
                        <span className="text-xs text-slate-400">
                          {counts[i]}표 ({pct}%)
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {polls && polls.length >= pages * 10 && (
        <button
          onClick={() => setPages((p) => p + 1)}
          className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-50"
        >
          더 보기
        </button>
      )}
    </div>
  );
}
