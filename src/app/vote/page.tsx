"use client";
// 투표 게시판 v2 — 설명·복수선택·익명·마감일·투표자 보기·검색.
import { useRef, useState } from "react";
import { useSession } from "@/stores/session";
import { studentById, students } from "@/lib/roster";
import Linkify from "@/components/ui/Linkify";
import VoteBoardTabs from "@/components/VoteBoardTabs";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useFeedback } from "@/components/ui/Feedback";
import {
  usePolls,
  useCreatePoll,
  useVote,
  useClosePoll,
  useDeletePoll,
  useUpdatePoll,
  votesOf,
  isPollClosed,
  type Poll,
} from "@/lib/query/board";

function PollCard({ poll, onDone }: { poll: Poll; onDone?: () => void }) {
  const { role, studentId } = useSession();
  const vote = useVote(studentId);
  const closePoll = useClosePoll();
  const removePoll = useDeletePoll();
  const updatePoll = useUpdatePoll();
  const { toast, confirm } = useFeedback();
  const [showVoters, setShowVoters] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const isMine = role === "student" && poll.createdBy === studentId;

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
      className={`rounded-card border bg-white p-4 shadow-card ${closed ? "border-ink-300 opacity-90" : "border-brand/30"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-bold">
            {poll.title}{" "}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                closed ? "bg-ink-200 text-ink-500" : "bg-success-weak text-success"
              }`}
            >
              {closed ? "마감" : "진행 중"}
            </span>
            {poll.multi && (
              <span className="ml-1 rounded-full bg-brand-weak px-2 py-0.5 text-[10px] font-bold text-brand-strong">
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
                timeZone: "Asia/Seoul",
                month: "numeric",
                day: "numeric",
              })}
            </>
          )}
        </span>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 rounded-btn bg-ink-50 p-3">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded-btn border border-ink-300 px-3 py-2 text-sm font-bold"
          />
          <input
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="설명 (선택)"
            className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] focus:border-brand focus:outline-none"
          />
          <p className="text-[11px] text-ink-400">선택지와 표는 공정성을 위해 수정할 수 없어요.</p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await updatePoll(poll.id, editTitle, editDesc);
                  setEditing(false);
                  toast("✏️ 수정됐어요!", "success");
                } catch (e) {
                  toast(`⚠️ ${e instanceof Error ? e.message : "수정 실패"}`, "error");
                }
              }}
              className="press rounded-btn bg-brand px-3 py-1.5 text-xs font-bold text-white"
            >
              저장
            </button>
            <button
              onClick={() => setEditing(false)}
              className="press rounded-btn border border-ink-200 px-3 py-1.5 text-xs text-ink-600"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {poll.options.map((opt, i) => {
          const pct = totalMarks ? Math.round((counts[i] / totalMarks) * 100) : 0;
          const chosen = myVotes.includes(i);
          const winner = closed && counts[i] === maxCount && maxCount > 0;
          return (
            <li key={i}>
              <button
                // 선택 전환 시 리마운트 → 살짝 통통 (juice)
                key={`${i}-${chosen}`}
                onClick={() =>
                  role === "student" &&
                  void vote(poll, i).catch((e: Error) => toast(`⚠️ ${e.message}`, "error"))
                }
                disabled={role !== "student" || closed}
                className={`relative w-full overflow-hidden rounded-btn border px-3 py-2.5 text-left text-sm transition-colors ${
                  chosen
                    ? "badge-pop border-brand font-bold"
                    : winner
                      ? "border-warn font-bold"
                      : "border-ink-200"
                } ${!closed && role === "student" ? "hover:border-brand/50" : ""}`}
              >
                <span
                  className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                    winner ? "bg-warn-weak" : chosen ? "bg-brand-weak" : "bg-ink-100"
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

      {/* 투표 후 완료 — 선택하면 활성화, 누르면 목록으로 */}
      {onDone && role === "student" && !closed && (
        <button
          key={`done-${myVotes.length > 0}`}
          onClick={onDone}
          disabled={myVotes.length === 0}
          className={`press mt-3 w-full rounded-btn bg-success py-2.5 text-sm font-bold text-white disabled:opacity-40 ${
            myVotes.length > 0 ? "badge-pop" : ""
          }`}
        >
          {myVotes.length > 0 ? "✓ 투표 완료" : "먼저 선택지를 골라주세요"}
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {(!poll.anonymous || role === "teacher") && allVoterIds.length > 0 && (
            <button
              onClick={() => setShowVoters((v) => !v)}
              className="text-ink-400 underline hover:text-ink-600"
            >
              {showVoters
                ? "투표자 숨기기"
                : poll.anonymous
                  ? "🔍 투표자 보기 (선생님만)"
                  : "누가 투표했는지 보기"}
            </button>
          )}
        </span>
        {isMine && (
          <span className="flex gap-2">
            <button
              onClick={() => {
                setEditTitle(poll.title);
                setEditDesc(poll.desc ?? "");
                setEditing(true);
              }}
              className="text-brand hover:opacity-80"
            >
              ✏️ 수정
            </button>
            <button
              onClick={async () => {
                if (await confirm({ title: "내 투표를 삭제할까요?", danger: true }))
                  void removePoll(poll.id).catch((e: Error) => toast(`⚠️ ${e.message}`, "error"));
              }}
              className="text-danger hover:opacity-80"
            >
              삭제
            </button>
          </span>
        )}
        {role === "teacher" && (
          <span className="flex gap-2">
            <button
              onClick={() => {
                setEditTitle(poll.title);
                setEditDesc(poll.desc ?? "");
                setEditing(true);
              }}
              className="text-brand hover:opacity-80"
            >
              수정
            </button>
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
              className="text-warn hover:opacity-80"
            >
              {poll.closed ? "재개" : "마감하기"}
            </button>
            <button
              onClick={async () => {
                if (await confirm({ title: "이 투표를 삭제할까요?", danger: true }))
                  void removePoll(poll.id).catch((e: Error) => toast(`⚠️ ${e.message}`, "error"));
              }}
              className="text-danger hover:opacity-80"
            >
              삭제
            </button>
          </span>
        )}
      </div>

      {showVoters && (!poll.anonymous || role === "teacher") && (
        <div className="mt-2 space-y-1 rounded-btn bg-ink-50 p-2 text-xs text-ink-600">
          {poll.anonymous && (
            <p className="font-bold text-warn">🔒 익명 투표 — 이 목록은 선생님에게만 보여요</p>
          )}
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
          {/* 교사: 아직 투표 안 한 친구 — 참여 독려용 */}
          {role === "teacher" &&
            (() => {
              const voted = new Set(allVoterIds.map(Number));
              const notVoted = students.filter((s) => !voted.has(s.id));
              return notVoted.length ? (
                <p className="border-t border-ink-200 pt-1 text-ink-400">
                  ⏳ 미참여({notVoted.length}): {notVoted.map((s) => s.name).join(", ")}
                </p>
              ) : (
                <p className="border-t border-ink-200 pt-1 font-bold text-success">
                  🎉 전원 참여 완료!
                </p>
              );
            })()}
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
  const [busy, setBusy] = useState(false);
  const submitRef = useRef(false); // 같은 틱 더블클릭 이중 투표 생성 차단
  const { toast } = useFeedback();

  async function submit() {
    if (busy || submitRef.current) return;
    submitRef.current = true;
    setBusy(true);
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
    } finally {
      submitRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="투표 제목 (예: 학급 파티 날 뭐 할까?)"
        className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] focus:border-brand focus:outline-none"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="설명 (선택)"
        className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] focus:border-brand focus:outline-none"
      />
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={opt}
            onChange={(e) =>
              setOptions(options.map((o, j) => (j === i ? e.target.value : o)))
            }
            placeholder={`선택지 ${i + 1}`}
            className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] focus:border-brand focus:outline-none"
          />
          {options.length > 2 && (
            <button
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
              className="shrink-0 text-ink-300 hover:text-danger"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => setOptions([...options, ""])}
        className="press rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600 hover:bg-ink-200"
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
            className="rounded-btn border border-ink-300 px-2 py-1 text-xs"
          />
        </label>
      </div>
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "만드는 중…" : "투표 만들기"}
      </button>
    </div>
  );
}

// ── 목록 Row — 1학기 차용: 결과(선두 옵션+미니 막대)가 목록에서 바로 보이게 ──
function PollRow({ p, myId, onOpen }: { p: Poll; myId: number | null; onOpen: () => void }) {
  const closed = isPollClosed(p);
  const voterIds = Object.keys(p.votes ?? {}).filter((sid) => votesOf(p, sid).length);
  const counts = p.options.map(
    (_, i) => voterIds.filter((sid) => votesOf(p, sid).includes(i)).length
  );
  const total = counts.reduce((a, b) => a + b, 0);
  const topIdx = counts.indexOf(Math.max(...counts));
  const topPct = total ? Math.round((counts[topIdx] / total) * 100) : 0;
  const iVoted = myId != null && votesOf(p, String(myId)).length > 0;
  const author =
    p.createdBy === "teacher" ? "선생님" : (studentById.get(p.createdBy as number)?.name ?? "?");
  return (
    <button onClick={onOpen} className="w-full px-3.5 py-3 text-left hover:bg-ink-50">
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              closed ? "bg-ink-200 text-ink-500" : "bg-success-weak text-success"
            }`}
          >
            {closed ? "마감" : "진행"}
          </span>
          {/* 긴 제목이 잘리지 않게 2줄까지 표시 (모바일 폭 대응) */}
          <b className="line-clamp-2 min-w-0 text-[15px] text-ink-900">{p.title}</b>
          {p.multi && <span className="shrink-0 text-[10px] text-ink-400">복수</span>}
          {p.anonymous && <span className="shrink-0 text-[10px] text-ink-400">익명</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-600">
          {iVoted && <span className="font-bold text-success">✓내 투표</span>}
          <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
            {author}
          </span>
          <span className="tnum">👥{voterIds.length}</span>
        </span>
      </span>
      {/* 선두 옵션 미리보기 — 열지 않아도 판세가 보임 */}
      {total > 0 && (
        <span className="mt-1.5 block">
          <span className="flex items-center justify-between text-[11px] text-ink-500">
            <span className="truncate">
              {closed && "🏆 "}1위 · {p.options[topIdx]}
            </span>
            <span className="tnum shrink-0">{topPct}%</span>
          </span>
          <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-ink-100">
            <span
              className={`block h-full rounded-full ${closed ? "bg-warn" : "bg-brand"}`}
              style={{ width: `${topPct}%` }}
            />
          </span>
        </span>
      )}
    </button>
  );
}

export default function VotePage() {
  const { studentId } = useSession();
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

  // 상세 — 1학기 차용: 목록 위 모달 오버레이 (맥락 유지, 삭제되면 자동 닫힘)
  const selected = (polls ?? []).find((p) => p.id === selectedId);

  // 진행 중 우선, 그 안에서 최신순
  const sorted = [...filtered].sort((a, b) => {
    const diff = Number(isPollClosed(a)) - Number(isPollClosed(b));
    return diff !== 0 ? diff : b.createdAt - a.createdAt;
  });

  return (
    <div className="space-y-4">
      <VoteBoardTabs current="vote" />
      <section className="rounded-card border border-ink-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 p-4">
          <h3 className="text-lg font-bold">🗳️ 투표 게시판</h3>
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
        {!polls ? (
          <SkeletonList rows={4} />
        ) : !sorted.length ? (
          search ? (
            <EmptyState emoji="🔍" title="검색 결과가 없어요" />
          ) : (
            <EmptyState emoji="🗳️" title="아직 투표가 없어요" desc="첫 투표를 만들어보세요!" />
          )
        ) : (
          <ul className="divide-y divide-ink-100">
            {sorted.map((p) => (
              <li key={p.id}>
                <PollRow p={p} myId={studentId} onOpen={() => setSelectedId(p.id)} />
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

      {/* 투표 상세 모달 — 1학기 차용: 목록 위 오버레이, 모바일은 바텀시트 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-ink-100 bg-white px-4 py-2.5">
              <span className="text-sm font-bold text-ink-900">🗳️ 투표</span>
              <button
                onClick={() => setSelectedId(null)}
                className="press rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-500"
              >
                ✕ 닫기
              </button>
            </div>
            <PollCard poll={selected} onDone={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
