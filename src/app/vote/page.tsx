"use client";
// 투표 게시판 v2 — 설명·복수선택·익명·마감일·투표자 보기·검색.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import {
  usePolls,
  useCreatePoll,
  useVote,
  useClosePoll,
  useDeletePoll,
  votesOf,
  isPollClosed,
  type Poll,
} from "@/lib/query/board";

function PollCard({ poll }: { poll: Poll }) {
  const { role, studentId } = useSession();
  const vote = useVote(studentId);
  const closePoll = useClosePoll();
  const removePoll = useDeletePoll();
  const [showVoters, setShowVoters] = useState(false);
  const [msg, setMsg] = useState("");

  const closed = isPollClosed(poll);
  const allVoterIds = Object.keys(poll.votes ?? {}).filter((sid) => votesOf(poll, sid).length);
  const counts = poll.options.map(
    (_, i) => allVoterIds.filter((sid) => votesOf(poll, sid).includes(i)).length
  );
  const totalMarks = counts.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...counts, 0);
  const myVotes = studentId != null ? votesOf(poll, String(studentId)) : [];

  return (
    <section
      className={`rounded-xl border bg-white p-5 shadow-sm ${closed ? "border-slate-300 opacity-90" : "border-indigo-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-bold">
            {poll.title}{" "}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                closed ? "bg-slate-200 text-slate-500" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {closed ? "마감" : "진행 중"}
            </span>
            {poll.multi && (
              <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                복수선택
              </span>
            )}
            {poll.anonymous && (
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                익명
              </span>
            )}
          </h4>
          {poll.desc && <p className="mt-0.5 text-sm text-slate-500">{poll.desc}</p>}
        </div>
        <span className="shrink-0 text-right text-xs text-slate-400">
          {poll.createdBy === "teacher"
            ? "선생님"
            : (studentById.get(poll.createdBy as number)?.name ?? "?")}
          <br />
          참여 {allVoterIds.length}명
          {poll.deadline && (
            <>
              <br />
              마감{" "}
              {new Date(poll.deadline).toLocaleDateString("ko-KR", {
                month: "numeric",
                day: "numeric",
              })}
            </>
          )}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {poll.options.map((opt, i) => {
          const pct = totalMarks ? Math.round((counts[i] / totalMarks) * 100) : 0;
          const chosen = myVotes.includes(i);
          const winner = closed && counts[i] === maxCount && maxCount > 0;
          return (
            <li key={i}>
              <button
                onClick={() =>
                  role === "student" &&
                  void vote(poll, i).catch((e: Error) => setMsg(`⚠️ ${e.message}`))
                }
                disabled={role !== "student" || closed}
                className={`relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  chosen
                    ? "border-indigo-400 font-bold"
                    : winner
                      ? "border-amber-400 font-bold"
                      : "border-slate-200"
                } ${!closed && role === "student" ? "hover:border-indigo-300" : ""}`}
              >
                <span
                  className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                    winner ? "bg-amber-100" : chosen ? "bg-indigo-100" : "bg-slate-100"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span>
                    {winner && "🏆 "}
                    {chosen && "✓ "}
                    {opt}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {counts[i]}표 ({pct}%)
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {!poll.anonymous && allVoterIds.length > 0 && (
            <button
              onClick={() => setShowVoters((v) => !v)}
              className="text-slate-400 underline hover:text-slate-600"
            >
              {showVoters ? "투표자 숨기기" : "누가 투표했는지 보기"}
            </button>
          )}
        </span>
        {role === "teacher" && (
          <span className="flex gap-2">
            <button
              onClick={() => void closePoll(poll)}
              className="text-amber-500 hover:text-amber-700"
            >
              {poll.closed ? "재개" : "마감하기"}
            </button>
            <button
              onClick={() => void removePoll(poll.id)}
              className="text-rose-400 hover:text-rose-600"
            >
              삭제
            </button>
          </span>
        )}
      </div>

      {showVoters && !poll.anonymous && (
        <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
          {poll.options.map((opt, i) => {
            const names = allVoterIds
              .filter((sid) => votesOf(poll, sid).includes(i))
              .map((sid) => studentById.get(Number(sid))?.name ?? sid);
            return names.length ? (
              <p key={i}>
                <b>{opt}</b>: {names.join(", ")}
              </p>
            ) : null;
          })}
        </div>
      )}
      {msg && <p className="mt-1 text-xs">{msg}</p>}
    </section>
  );
}

function CreatePollForm({ onDone }: { onDone: () => void }) {
  const { role, studentId } = useSession();
  const createPoll = useCreatePoll(role === "teacher" ? "teacher" : studentId);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [msg, setMsg] = useState("");

  async function submit() {
    setMsg("");
    try {
      await createPoll({
        title,
        desc,
        options,
        multi,
        anonymous,
        deadline: deadline ? new Date(deadline + "T23:59:59+09:00").getTime() : undefined,
      });
      onDone();
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "생성 실패"}`);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="투표 제목 (예: 학급 파티 날 뭐 할까?)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="설명 (선택)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={opt}
            onChange={(e) =>
              setOptions(options.map((o, j) => (j === i ? e.target.value : o)))
            }
            placeholder={`선택지 ${i + 1}`}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {options.length > 2 && (
            <button
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
              className="shrink-0 text-slate-300 hover:text-rose-400"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => setOptions([...options, ""])}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-400"
      >
        + 선택지 추가
      </button>
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          복수 선택 허용
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          익명 투표
        </label>
        <label className="flex items-center gap-1.5">
          마감일
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
      </div>
      <button
        onClick={() => void submit()}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white"
      >
        투표 만들기
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

export default function VotePage() {
  const [pages, setPages] = useState(1);
  const { data: polls } = usePolls(pages);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = (polls ?? []).filter((p) => {
    const kw = search.trim().toLowerCase();
    if (!kw) return true;
    return `${p.title} ${p.desc ?? ""} ${p.options.join(" ")}`.toLowerCase().includes(kw);
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">🗳️ 투표 게시판</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 검색"
              className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white"
            >
              {showForm ? "닫기" : "+ 투표 만들기"}
            </button>
          </div>
        </div>
        {showForm && <CreatePollForm onDone={() => setShowForm(false)} />}
      </section>

      {!filtered.length && (
        <p className="text-sm text-slate-400">
          {search ? "검색 결과가 없어요." : "아직 투표가 없어요. 첫 투표를 만들어보세요!"}
        </p>
      )}
      {filtered.map((p) => (
        <PollCard key={p.id} poll={p} />
      ))}

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
