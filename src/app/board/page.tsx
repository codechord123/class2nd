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
  useUpdateSuggestion,
  useAddComment,
  useDeleteComment,
  useToggleAnnouncement,
  useReactSuggestion,
  useSetAgendaStatus,
  useEnactLaw,
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
  const updateSuggestion = useUpdateSuggestion();
  const react = useReactSuggestion(studentId);
  const setStatus = useSetAgendaStatus();
  const enactLaw = useEnactLaw();
  const { toast, confirm } = useFeedback();
  const isMine = role === "student" && sug.studentId === studentId;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

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
  const [showAllComments, setShowAllComments] = useState(false);

  const comments = sug.comments ?? [];
  const parents = comments.filter((c) => c.replyTo == null);
  // 토론이 길어지면 최근 8개만 — 이전 것은 버튼으로 펼치기
  const VISIBLE = 8;
  const hiddenCount = showAllComments ? 0 : Math.max(0, parents.length - VISIBLE);
  const visibleParents = showAllComments ? parents : parents.slice(-VISIBLE);

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
    // 상세는 읽기용 — 데스크탑에서 글줄이 너무 길어지지 않게 폭 제한
    <section className="mx-auto w-full max-w-3xl rounded-card border border-ink-200 bg-white p-4 shadow-card sm:p-5">
      <button
        onClick={onBack}
        className="press rounded-btn bg-ink-100 px-3 py-1.5 text-sm font-bold text-ink-600 hover:bg-ink-200"
      >
        ← 목록으로
      </button>

      <div className="mt-3 border-b border-ink-100 pb-3">
        <div className="flex items-start gap-2">
          <StatusBadge sug={sug} />
          <h3 className="text-xl font-bold leading-snug [overflow-wrap:anywhere]">
            {sug.isAnnouncement && <span className="mr-1 text-amber-500">📌</span>}
            {titleOf(sug)}
          </h3>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
              {sug.isAnonymous
                ? role === "teacher"
                  ? `익명(${authorName(sug.studentId)})`
                  : "익명"
                : authorName(sug.studentId)}
            </span>
            <span className="tnum">
              {new Date(sug.createdAt).toLocaleString("ko-KR", {
                month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
            <span>· 💬 {comments.length}</span>
          </span>
          {isMine && (
            <span className="flex gap-2">
              <button
                onClick={() => {
                  setEditTitle(sug.title ?? ""); // 표시용 fallback(잘린 본문)이 아닌 원본 제목
                  setEditContent(sug.content);
                  setEditing(true);
                }}
                className="text-brand hover:opacity-80"
              >
                ✏️ 수정
              </button>
              <button
                onClick={() =>
                  void confirmDelete("내 안건을 삭제할까요? (댓글도 함께 지워져요)", async () => {
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

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] font-bold focus:border-brand focus:outline-none"
          />
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] focus:border-brand focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await updateSuggestion(sug.id, editTitle, editContent);
                  setEditing(false);
                  toast("✏️ 수정됐어요!", "success");
                } catch (e) {
                  toast(`⚠️ ${e instanceof Error ? e.message : "수정 실패"}`, "error");
                }
              }}
              className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
            >
              저장
            </button>
            <button
              onClick={() => setEditing(false)}
              className="press rounded-btn border border-ink-200 px-4 py-2 text-sm text-ink-500"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-ink-800 [overflow-wrap:anywhere]">
          <Linkify text={sug.content} />
        </p>
      )}

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

      {/* 교사: 안건 상태 결정 + 채택 → 법률 등록 (자치 루프 완결) */}
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
          {sug.status === "채택" &&
            (sug.enactedAsLaw ? (
              <span className="rounded-full bg-success-weak px-3 py-1 text-xs font-bold text-success">
                📜 법률 등록됨
              </span>
            ) : (
              <button
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: "이 안건을 학급 법률로 올릴까요?",
                      body: `"${titleOf(sug)}" 이(가) 헌법 탭의 법률 목록에 추가돼요.`,
                      confirmLabel: "법률로 등록",
                    }))
                  )
                    return;
                  try {
                    const n = await enactLaw(sug);
                    toast(`📜 법률 제${n}조로 등록됐어요!`, "success");
                  } catch (e) {
                    toast(`⚠️ ${e instanceof Error ? e.message : "등록 실패"}`, "error");
                  }
                }}
                className="press rounded-full bg-ink-800 px-3 py-1 text-xs font-bold text-white"
              >
                📜 법률로 올리기
              </button>
            ))}
        </div>
      )}

      {/* 댓글 스레드 */}
      <div className="mt-4">
        <p className="text-xs font-bold text-ink-500">💬 댓글 {comments.length}</p>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAllComments(true)}
            className="mt-2 w-full rounded-btn bg-ink-100 py-2 text-xs font-medium text-ink-500 hover:bg-ink-200"
          >
            ↑ 이전 댓글 {hiddenCount}개 보기
          </button>
        )}
        <ul className="mt-2 space-y-3">
          {visibleParents.map((c) => {
            const replies = comments.filter((r) => r.replyTo === c.id);
            const canDelete =
              role === "teacher" || (role === "student" && c.studentId === studentId);
            return (
              <li key={c.id} className="text-sm">
                {/* 아바타 + 말풍선 — 감상문 댓글과 동일 문법 (앱 전체 일관성) */}
                <div className="flex items-start gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-weak text-xs font-extrabold text-brand-strong">
                    {authorName(c.studentId).charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-ink-100 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-xs font-bold text-ink-500">{authorName(c.studentId)}</b>
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
                    <p className="mt-0.5 leading-6 text-ink-800 [overflow-wrap:anywhere]">
                      <Linkify text={c.text} />
                    </p>
                  </div>
                </div>
                {/* 답글 — 왼쪽 레일로 중첩 표현 */}
                {replies.length > 0 && (
                  <div className="mt-1.5 ml-11 space-y-1.5 border-l-2 border-ink-200 pl-3">
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
  // 게시판형 페이지네이션 — n개씩 보기 + 페이지 번호 (+1은 다음 페이지 존재 탐지)
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const { data: posts } = useSuggestions(page * pageSize + 1);
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
  // 검색 중에는 결과 전체, 평소엔 현재 페이지 분량만
  const pageItems = kw ? normal : normal.slice((page - 1) * pageSize, page * pageSize);
  const knownPages = Math.max(1, Math.ceil((posts?.length ?? 0) / pageSize));

  const Row = ({ p, pin }: { p: Suggestion; pin?: boolean }) => {
    const { up, down } = reactionCounts(p);
    const author = p.isAnonymous
      ? role === "teacher"
        ? `익명(${authorName(p.studentId)})`
        : "익명"
      : authorName(p.studentId);
    return (
      <button
        onClick={() => setSelectedId(p.id)}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-ink-50 ${
          pin ? "bg-amber-50/60" : ""
        }`}
      >
        <span className="min-w-0 flex-1">
          {/* 1줄: 상태 + 제목 */}
          <span className="flex items-center gap-1.5">
            {pin && <span className="shrink-0 text-xs text-amber-500">📌</span>}
            <StatusBadge sug={p} />
            <b className="truncate text-[15px] text-ink-900">{titleOf(p)}</b>
            {p.enactedAsLaw && <span className="shrink-0 text-xs">📜</span>}
          </span>
          {/* 2줄: 작성자 칩 · 날짜 · 찬반 */}
          <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
            <span className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
              {author}
            </span>
            <span className="tnum shrink-0">{dateLabel(p.createdAt)}</span>
            {up + down > 0 && (
              <span className="shrink-0">
                👍{up} 👎{down}
              </span>
            )}
          </span>
        </span>
        {(p.comments?.length ?? 0) > 0 && (
          <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-600">
            💬 {p.comments!.length}
          </span>
        )}
        <span className="shrink-0 text-sm text-ink-300">›</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-ink-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 p-4">
          <h3 className="text-lg font-bold">📬 안건·토론</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색"
              className="w-32 rounded-btn border border-ink-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
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
              className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] font-medium focus:border-brand focus:outline-none"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="어떤 점을 바꾸면 좋을지, 왜 그런지 적어주세요. 친구들이 댓글로 토론하고 👍👎로 의견을 모아요."
              rows={4}
              className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] focus:border-brand focus:outline-none"
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
            {pageItems.map((p) => (
              <li key={p.id}>
                <Row p={p} />
              </li>
            ))}
          </ul>
        )}

        {/* 게시판식 하단: n개씩 보기 + 페이지 번호 (검색 중엔 숨김) */}
        {!kw && (posts?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5">
            <div className="flex items-center gap-1">
              {[10, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setPageSize(n);
                    setPage(1);
                  }}
                  className={`press rounded-btn px-2.5 py-1 text-xs font-bold ${
                    pageSize === n ? "bg-ink-700 text-white" : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {n}개
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: knownPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`press tnum min-w-8 rounded-btn px-2 py-1 text-sm font-bold ${
                    p === page ? "bg-brand text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
