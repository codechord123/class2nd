"use client";
// 투표 게시판 v2 — 설명·복수선택·익명·마감일·투표자 보기·검색.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import Linkify from "@/components/ui/Linkify";
import EmptyState from "@/components/ui/EmptyState";
import { useFeedback } from "@/components/ui/Feedback";
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
  const { toast, confirm } = useFeedback();
  const [showVoters, setShowVoters] = useState(false);

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
      className={`rounded-card border bg-white p-5 shadow-card ${closed ? "border-ink-300 opacity-90" : "border-brand/30"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-bold">
            {poll.title}{" "}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                closed ? "bg-ink-200 text-ink-500" : "bg-emerald-100 text-emerald-700"
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
              <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">
                익명
              </span>
            )}
          </h4>
          {poll.desc && (
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-500">
              <Linkify text={poll.desc} />
            </p>
          )}
        </div>
        <span className="shrink-0 text-right text-xs text-ink-400">
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
                  void vote(poll, i).catch((e: Error) => toast(`⚠️ ${e.message}`, "error"))
                }
                disabled={role !== "student" || closed}
                className={`relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  chosen
                    ? "border-indigo-400 font-bold"
                    : winner
                      ? "border-amber-400 font-bold"
                      : "border-ink-200"
                } ${!closed && role === "student" ? "hover:border-indigo-300" : ""}`}
              >
                <span
                  className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                    winner ? "bg-amber-100" : chosen ? "bg-indigo-100" : "bg-ink-100"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span>
                    {winner && "🏆 "}
                    {chosen && "✓ "}
                    {opt}
                  </span>
                  <span className="shrink-0 text-xs text-ink-400">
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
              className="text-ink-400 underline hover:text-ink-600"
            >
              {showVoters ? "투표자 숨기기" : "누가 투표했는지 보기"}
            </button>
          )}
        </span>
        {role === "teacher" && (
          <span className="flex gap-2">
            <button
              onClick={async () => {
                if (
                  await confirm({
                    title: poll.closed ? "투표를 다시 진행할까요?" : "투표를 마감할까요?",
                    confirmLabel: poll.closed ? "재개" : "마감",
                  })
                )
                  void closePoll(poll).catch((e: Error) => toast(`⚠️ ${e.message}`, "error"));
              }}
              className="text-amber-500 hover:text-amber-700"
            >
              {poll.closed ? "재개" : "마감하기"}
            </button>
            <button
              onClick={async () => {
                if (await confirm({ title: "이 투표를 삭제할까요?", danger: true }))
                  void removePoll(poll.id).catch((e: Error) => toast(`⚠️ ${e.message}`, "error"));
              }}
              className="text-rose-400 hover:text-rose-600"
            >
              삭제
            </button>
          </span>
        )}
      </div>

      {showVoters && !poll.anonymous && (
        <div className="mt-2 space-y-1 rounded-lg bg-ink-50 p-2 text-xs text-ink-500">
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
  const { toast } = useFeedback();

  async function submit() {
    try {
      await createPoll({
        title,
        desc,
        options,
        multi,
        anonymous,
        deadline: deadline ? new Date(deadline + "T23:59:59+09:00").getTime() : undefined,
      });
      toast("✅ 투표가 만들어졌어요!");
      onDone();
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "생성 실패"}`, "error");
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="투표 제목 (예: 학급 파티 날 뭐 할까?)"
        className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="설명 (선택)"
        className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
      />
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={opt}
            onChange={(e) =>
              setOptions(options.map((o, j) => (j === i ? e.target.value : o)))
            }
            placeholder={`선택지 ${i + 1}`}
            className="min-w-0 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm"
          />
          {options.length > 2 && (
            <button
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
              className="shrink-0 text-ink-300 hover:text-rose-400"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => setOptions([...options, ""])}
        className="rounded-lg border border-dashed border-ink-300 px-3 py-1.5 text-xs text-ink-500 hover:border-ink-400"
      >
        + 선택지 추가
      </button>
      <div className="flex flex-wrap items-center gap-4 text-sm text-ink-600">
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
            className="rounded-lg border border-ink-300 px-2 py-1 text-xs"
          />
        </label>
      </div>
      <button
        onClick={() => void submit()}
        className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
      >
        투표 만들기
      </button>
    </div>
  );
}

// ── 목록 Row (제목 클릭 → 상세) ──────────────────────────────────
function PollRow({ p, onOpen }: { p: Poll; onOpen: () => void }) {
  const closed = isPollClosed(p);
  const voters = Object.keys(p.votes ?? {}).filter((sid) => votesOf(p, sid).length).length;
  const author =
    p.createdBy === "teacher" ? "선생님" : (studentById.get(p.createdBy as number)?.name ?? "?");
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-ink-50"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            closed ? "bg-ink-200 text-ink-500" : "bg-success-weak text-success"
          }`}
        >
          {closed ? "마감" : "진행"}
        </span>
        <span className="truncate text-sm font-medium text-ink-700">{p.title}</span>
        {p.multi && <span className="shrink-0 text-[10px] text-ink-400">복수</span>}
        {p.anonymous && <span className="shrink-0 text-[10px] text-ink-400">익명</span>}
      </span>
      <span className="shrink-0 text-xs text-ink-400">
        {author} · 👥{voters}
      </span>
    </button>
  );
}

export default function VotePage() {
  const [pages, setPages] = useState(1);
  const { data: polls } = usePolls(pages);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const kw = search.trim().toLowerCase();
  const filtered = (polls ?? []).filter((p) => {
    if (!kw) return true;
    return `${p.title} ${p.desc ?? ""} ${p.options.join(" ")}`.toLowerCase().includes(kw);
  });

  // 상세 화면 — 삭제되어 목록에서 사라지면 자동으로 목록 복귀
  const selected = (polls ?? []).find((p) => p.id === selectedId);
  if (selectedId && selected) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setSelectedId(null)}
          className="text-sm text-ink-400 hover:text-ink-600"
        >
          ← 목록으로
        </button>
        <PollCard poll={selected} />
      </div>
    );
  }

  // 진행 중 우선, 그 안에서 최신순
  const sorted = [...filtered].sort((a, b) => {
    const diff = Number(isPollClosed(a)) - Number(isPollClosed(b));
    return diff !== 0 ? diff : b.createdAt - a.createdAt;
  });

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-ink-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 p-4">
          <h3 className="font-bold">🗳️ 투표 게시판</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 검색"
              className="w-32 rounded-btn border border-ink-200 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => setShowForm((v) => !v)}
              className="press rounded-btn bg-brand px-3 py-1.5 text-sm font-bold text-white"
            >
              {showForm ? "닫기" : "✏️ 투표 만들기"}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="border-b border-ink-100 bg-ink-50/50 p-4">
            <CreatePollForm onDone={() => setShowForm(false)} />
          </div>
        )}

        {/* 목록 */}
        {!sorted.length ? (
          search ? (
            <EmptyState emoji="🔍" title="검색 결과가 없어요" />
          ) : (
            <EmptyState emoji="🗳️" title="아직 투표가 없어요" desc="첫 투표를 만들어보세요!" />
          )
        ) : (
          <ul className="divide-y divide-ink-100">
            {sorted.map((p) => (
              <li key={p.id}>
                <PollRow p={p} onOpen={() => setSelectedId(p.id)} />
              </li>
            ))}
          </ul>
        )}

        {polls && polls.length >= pages * 10 && (
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
