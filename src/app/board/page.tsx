"use client";
// 건의 게시판 — 커뮤니티 게시판형 리빌드:
//   목록(번호·제목·작성자·날짜·💬댓글수) → 클릭하면 상세 화면(본문+댓글 스레드).
//   공지 상단 고정 · 검색 · 글쓰기 접기 · 더보기 페이지네이션.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/stores/session";
import { ROLE_INFO, students, studentById } from "@/lib/roster";
import { CIRCLED_NUMS, serializeClauses } from "@/lib/lawText";
import Linkify from "@/components/ui/Linkify";
import VoteBoardTabs from "@/components/VoteBoardTabs";
import LawClause from "@/components/ui/LawClause";
import Pager from "@/components/ui/Pager";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useFeedback } from "@/components/ui/Feedback";
import JuiceBurst from "@/components/ui/Juice";
import {
  useSuggestions,
  useAnnouncements,
  usePostSuggestion,
  useDeleteSuggestion,
  useDeleteSuggestions,
  useUpdateSuggestion,
  useAddComment,
  useDeleteComment,
  useToggleAnnouncement,
  useReactSuggestion,
  useSetAgendaStatus,
  useEnactLaw,
  useNominateHidden,
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
  return new Date(ms).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
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
  const isMine =
    role === "teacher" ? sug.studentId === "teacher" : sug.studentId === studentId;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [pickingDept, setPickingDept] = useState(false); // 법률 채택 시 부서 선택 중

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
  const postingRef = useRef(false); // 같은 틱 더블클릭 이중 댓글 차단
  const [showAllComments, setShowAllComments] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 답글 시작 — 답글의 답글은 같은 스레드에 @이름 멘션으로 (깊이 1 유지, 대화는 이어짐)
  function startReply(parentId: number, mentionSid?: number | "teacher") {
    setReplyTo(parentId);
    if (mentionSid != null) {
      const name = authorName(mentionSid);
      setText((t) => (t.startsWith("@") ? t : `@${name} ${t}`));
    }
    inputRef.current?.focus();
  }

  const comments = sug.comments ?? [];
  const parents = comments.filter((c) => c.replyTo == null);
  // 토론이 길어지면 최근 8개만 — 이전 것은 버튼으로 펼치기
  const VISIBLE = 8;
  const hiddenCount = showAllComments ? 0 : Math.max(0, parents.length - VISIBLE);
  const visibleParents = showAllComments ? parents : parents.slice(-VISIBLE);

  async function submitComment() {
    if (posting || postingRef.current || !text.trim()) return;
    postingRef.current = true;
    setPosting(true);
    try {
      await addComment(sug.id, text, replyTo ?? undefined);
      setText("");
      setReplyTo(null);
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "실패"}`, "error");
    } finally {
      postingRef.current = false;
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
    // 큰 팝업 패널 — 위(닫기 바)·아래(댓글 입력)는 고정, 가운데 본문·댓글만 스크롤
    <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-card border border-ink-200 bg-white shadow-card">
      <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-4 py-2.5 sm:px-5">
        <p className="text-xs font-bold text-ink-400">📣 안건 · 💬 댓글 {comments.length}</p>
        <button
          onClick={onBack}
          className="press rounded-btn bg-ink-100 px-3 py-1.5 text-sm font-bold text-ink-600 hover:bg-ink-200"
        >
          ✕ 닫기
        </button>
      </div>

      {/* ── 스크롤 영역 (본문 + 댓글) ── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
      <div className="border-b border-ink-100 pb-3">
        <div className="flex items-start gap-2">
          <StatusBadge sug={sug} />
          <h3 className="text-xl font-bold leading-snug [overflow-wrap:anywhere]">
            {sug.isAnnouncement && <span className="mr-1 text-amber-500">📌</span>}
            {titleOf(sug)}
          </h3>
        </div>
        {sug.kind === "law" && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
            📜 법률 제안
            {sug.lawDept && (
              <span className="font-medium">
                · {ROLE_INFO.find((r) => r.dept === sug.lawDept)?.emoji} {sug.lawDept} 담당
              </span>
            )}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
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
                timeZone: "Asia/Seoul",
                month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
            <span>· 💬 {comments.length}</span>
          </span>
          {isMine && role === "student" && (
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
              {isMine && (
                <button
                  onClick={() => {
                    setEditTitle(sug.title ?? "");
                    setEditContent(sug.content);
                    setEditing(true);
                  }}
                  className="text-brand hover:opacity-80"
                >
                  ✏️ 수정
                </button>
              )}
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
      ) : sug.kind === "law" ? (
        // 법률 제안 — 항(①②③) 구조로 렌더 (제목은 위 h3에 이미 표시)
        <div className="mt-3 rounded-card bg-violet-50/50 px-4 py-3">
          <LawClause text={sug.content} />
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
                onClick={() => setPickingDept((v) => !v)}
                className="press rounded-full bg-ink-800 px-3 py-1 text-xs font-bold text-white"
              >
                📜 법률로 올리기{pickingDept ? " ▲" : ""}
              </button>
            ))}
        </div>
      )}

      {/* 법률 채택: 담당 부서 선택 — 법률은 부서별 관리 (헌법 탭 법률 그리드와 연결) */}
      {role === "teacher" && pickingDept && sug.status === "채택" && !sug.enactedAsLaw && (
        <div className="mt-2 rounded-btn bg-ink-50 px-3 py-2.5">
          <p className="text-xs font-bold text-ink-600">
            어느 부서의 법으로 등록할까요?
            {sug.lawDept && <span className="ml-1 text-violet-600">(제안 부서: {sug.lawDept})</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ROLE_INFO.map((r) => (
              <button
                key={r.dept}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: `${r.dept}의 법으로 올릴까요?`,
                      body: `"${titleOf(sug)}" 이(가) 헌법 탭 → 법률 → ${r.emoji} ${r.dept}에 추가돼요.`,
                      confirmLabel: "법률로 등록",
                    }))
                  )
                    return;
                  try {
                    const n = await enactLaw(sug, r.dept);
                    setPickingDept(false);
                    toast(`📜 ${r.emoji} ${r.dept} · ${r.key}법 제${n}조로 등록됐어요!`, "success");
                  } catch (e) {
                    toast(`⚠️ ${e instanceof Error ? e.message : "등록 실패"}`, "error");
                  }
                }}
                className={`press rounded-full px-3 py-1.5 text-xs font-bold ${
                  sug.lawDept === r.dept
                    ? "bg-violet-600 text-white ring-2 ring-violet-300" // 학생이 제안한 부서 — 기본 추천
                    : "border border-ink-200 bg-white text-ink-700 hover:border-brand hover:bg-brand-weak/40"
                }`}
              >
                {r.emoji} {r.dept}
                {sug.lawDept === r.dept && " ✓"}
              </button>
            ))}
            <button
              onClick={() => setPickingDept(false)}
              className="press rounded-full px-2 py-1.5 text-xs font-bold text-ink-400 hover:text-danger"
            >
              ✕ 취소
            </button>
          </div>
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
                          onClick={() =>
                            replyTo === c.id ? setReplyTo(null) : startReply(c.id)
                          }
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
                        <span className="flex shrink-0 gap-2 text-xs">
                          {/* 답글의 답글 — 같은 스레드에 @이름 멘션으로 이어진다 */}
                          <button
                            onClick={() => startReply(c.id, r.studentId)}
                            className="font-medium text-brand hover:text-brand-strong"
                          >
                            답글
                          </button>
                          {(role === "teacher" ||
                            (role === "student" && r.studentId === studentId)) && (
                            <button
                              onClick={() =>
                                void confirmDelete("답글을 삭제할까요?", () =>
                                  deleteComment(sug, r.id)
                                )
                              }
                              className="text-ink-400 hover:text-danger"
                            >
                              삭제
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

      </div>
      </div>
      {/* ── 스크롤 영역 끝 ── */}

      {/* 댓글 입력 — 팝업 하단 고정 (긴 토론을 읽다가도 바로 참여) */}
      <div className="shrink-0 border-t border-ink-100 px-4 py-3 sm:px-5">
        {replyTo != null && (
          <div className="mb-1.5 flex items-center gap-2 text-xs text-ink-500">
            <span>
              ↳ <b>{authorName(comments.find((c) => c.id === replyTo)?.studentId ?? 0)}</b>
              님에게 답글 다는 중
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className="font-bold text-ink-400 hover:text-danger"
            >
              ✕ 취소
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void submitComment();
            }}
            placeholder={replyTo != null ? "답글 달기…" : "댓글 달기…"}
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
  const post = usePostSuggestion(role === "teacher" ? "teacher" : studentId);
  const nominateHidden = useNominateHidden(studentId);
  const { toast, confirm } = useFeedback();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [teacherOnly, setTeacherOnly] = useState(false); // 🔒 선생님만 보기 (익명 대체)
  const [announce, setAnnounce] = useState(false); // 교사: 쓰면서 바로 공지로
  const [postKind, setPostKind] = useState<"general" | "law" | "hidden">("general"); // 일반 | 법률 | 숨은 기여
  const [postDept, setPostDept] = useState<string | null>(null); // 법률 제안의 담당 부서
  const [lawTitle, setLawTitle] = useState(""); // 법률 제안: 조 제목
  const [lawClauses, setLawClauses] = useState<string[]>([""]); // 법률 제안: 항별 내용
  const [hiddenTarget, setHiddenTarget] = useState<number | null>(null); // 숨은 기여 추천 대상
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const submitRef = useRef(false); // 같은 틱 더블클릭 이중 등록 차단 (busy state는 리렌더 전 두 번째 클릭을 못 막음)
  const [postBurst, setPostBurst] = useState(0); // 등록 성공 juice
  // 교사 정리 모드 — 체크박스로 여러 안건 선택 후 일괄 삭제
  const [manage, setManage] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const deleteMany = useDeleteSuggestions();

  // ✍️ 쓰다 만 글 보존 — 디벗이 꺼지거나 새로고침돼도 제목·내용이 남는다.
  // 공용 기기 대비 학생별 키. 등록 성공 시 제목·내용이 비워지며 자동 삭제된다.
  const draftKey = `board-draft-${role === "teacher" ? "t" : (studentId ?? 0)}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { title?: string; content?: string };
        if (d.title) setTitle((v) => v || d.title!);
        if (d.content) setContent((v) => v || d.content!);
      }
    } catch {
      // 파싱 실패 등 — 초안 없이 진행
    }
    // 마운트 시 1회 복원 (키는 세션 로그인 후 고정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    try {
      if (title.trim() || content.trim())
        localStorage.setItem(draftKey, JSON.stringify({ title, content }));
      else localStorage.removeItem(draftKey);
    } catch {
      // 저장 공간 부족 등 — 보존은 best-effort
    }
  }, [title, content, draftKey]);

  // 🔒 선생님만 보기 글: 작성자 본인과 교사 외에는 목록에서 완전히 숨긴다
  const canSee = (p: Suggestion) =>
    !p.teacherOnly || role === "teacher" || (role === "student" && p.studentId === studentId);

  const all = [...(announcements ?? []), ...(posts ?? []).filter((p) => !p.isAnnouncement)];
  const selected = all.find((p) => p.id === selectedId && canSee(p));

  async function submit() {
    // 오프라인이면 쓰기가 조용히 큐잉돼 버튼이 멈춘다 — 먼저 알림 (초안은 자동 보존되어 있음)
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast("📡 인터넷이 끊겨 있어요 — 연결 후 다시 눌러주세요. 쓴 글은 저장돼 있어요!", "warn");
      return;
    }
    // 🕵️ 숨은 기여 추천 — 대상+이유(10자↑)로 공개 글 등록 → 친구들이 👍👎로 결정
    if (postKind === "hidden") {
      if (hiddenTarget == null) {
        toast("추천할 친구를 골라주세요.", "warn");
        return;
      }
      if (content.trim().length < 10) {
        toast("무엇을 했는지 10글자 이상 적어주세요 — 이유가 공정함을 지켜요.", "warn");
        return;
      }
      if (submitRef.current) return;
      submitRef.current = true;
      setBusy(true);
      try {
        await nominateHidden(hiddenTarget, studentById.get(hiddenTarget)?.name ?? "?", content);
        setContent("");
        setHiddenTarget(null);
        setPostKind("general");
        setWriting(false);
        setPostBurst((k) => k + 1);
        toast("🕵️ 추천했어요! 친구들의 👍 투표를 거쳐 선생님이 금요일에 지급해요.", "success");
      } catch (e) {
        toast(`⚠️ ${e instanceof Error ? e.message : "등록 실패"}`, "error");
      } finally {
        submitRef.current = false;
        setBusy(false);
      }
      return;
    }
    // 법률 제안: 부서 필수 + 조 제목 + 최소 1개 항. 제목/항을 title/content로 담는다.
    let submitTitle = title;
    let submitContent = content;
    if (postKind === "law") {
      if (!postDept) {
        toast("어느 부서의 법인지 골라주세요! (제안이 채택되면 그 부서 법이 돼요)", "warn");
        return;
      }
      if (!lawTitle.trim()) {
        toast("조 제목을 적어주세요. (예: 복도 통행)", "warn");
        return;
      }
      const body = serializeClauses(lawClauses);
      if (!body) {
        toast("항 내용을 하나 이상 적어주세요.", "warn");
        return;
      }
      submitTitle = lawTitle.trim();
      submitContent = body; // "① … ② …"
    }
    if (submitRef.current) return;
    submitRef.current = true;
    setBusy(true);
    try {
      await post(
        submitTitle,
        submitContent,
        role === "student" && teacherOnly,
        role === "teacher" && announce,
        postKind === "law" && postDept ? { dept: postDept } : undefined
      );
      setTitle("");
      setContent("");
      setLawTitle("");
      setLawClauses([""]);
      setTeacherOnly(false);
      setAnnounce(false);
      setPostKind("general");
      setPostDept(null);
      setWriting(false);
      setPostBurst((k) => k + 1);
      toast("✅ 등록되었어요!");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "등록 실패"}`, "error");
    } finally {
      submitRef.current = false;
      setBusy(false);
    }
  }

  const kw = search.trim().toLowerCase();
  const matches = (p: Suggestion) => {
    if (!kw) return true;
    const author = p.isAnonymous ? "익명" : authorName(p.studentId);
    const commentText = (p.comments ?? []).map((c) => c.text).join(" ");
    return `${titleOf(p)} ${p.content} ${author} ${commentText}`.toLowerCase().includes(kw);
  };
  const pinned = (announcements ?? []).filter(matches);
  const normal = (posts ?? []).filter((p) => !p.isAnnouncement).filter(canSee).filter(matches);
  // 검색 중에는 결과 전체, 평소엔 현재 페이지 분량만
  const pageItems = kw ? normal : normal.slice((page - 1) * pageSize, page * pageSize);
  const knownPages = Math.max(1, Math.ceil((posts?.length ?? 0) / pageSize));

  // 정리 모드: 현재 화면에 보이는 글(공지 + 현재 페이지) 대상 선택·삭제
  const manageTargets = [...pinned, ...pageItems];
  const allPicked = manageTargets.length > 0 && manageTargets.every((p) => picked.has(p.id));
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setPicked(allPicked ? new Set() : new Set(manageTargets.map((p) => p.id)));
  const exitManage = () => {
    setManage(false);
    setPicked(new Set());
  };
  async function deletePicked() {
    if (picked.size === 0) {
      toast("삭제할 안건을 골라주세요.", "warn");
      return;
    }
    if (
      !(await confirm({
        title: `선택한 ${picked.size}개 안건을 삭제할까요?`,
        body: "댓글도 함께 지워지고 되돌릴 수 없어요.",
        danger: true,
        confirmLabel: `${picked.size}개 삭제`,
      }))
    )
      return;
    try {
      await deleteMany([...picked]);
      toast(`🗑️ ${picked.size}개 안건을 삭제했어요.`);
      exitManage();
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "삭제 실패"}`, "error");
    }
  }

  const Row = ({ p, pin }: { p: Suggestion; pin?: boolean }) => {
    const { up, down } = reactionCounts(p);
    const author = p.isAnonymous
      ? role === "teacher"
        ? `익명(${authorName(p.studentId)})`
        : "익명"
      : authorName(p.studentId);
    const checked = picked.has(p.id);
    return (
      <button
        onClick={() => (manage ? togglePick(p.id) : setSelectedId(p.id))}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-ink-50 ${
          manage && checked ? "bg-brand-weak/40" : pin ? "bg-amber-50/60" : ""
        }`}
      >
        {manage && (
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-xs font-bold ${
              checked ? "border-brand bg-brand text-white" : "border-ink-300 bg-white"
            }`}
          >
            {checked && "✓"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          {/* 1줄: 상태 + 제목 */}
          <span className="flex items-center gap-1.5">
            {/* 공지 배지 — 빨강은 '오류/위험' 문법과 겹쳐서 브랜드 파랑으로 (디자이너 감사) */}
            {pin && (
              <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                공지
              </span>
            )}
            {!pin && <StatusBadge sug={p} />}
            {p.teacherOnly && (
              <span className="shrink-0 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                🔒 선생님만
              </span>
            )}
            {p.kind === "law" && (
              <span className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                📜 법률
              </span>
            )}
            <b className="truncate text-[15px] text-ink-900">{titleOf(p)}</b>
            {p.enactedAsLaw && <span className="shrink-0 text-xs">📜</span>}
          </span>
          {/* 2줄: 작성자 칩 · 날짜 · 찬반 */}
          <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-600">
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
        {!manage && <span className="shrink-0 text-sm text-ink-300">›</span>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <VoteBoardTabs current="board" />
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
            {role === "teacher" &&
              (manage ? (
                <button
                  onClick={exitManage}
                  className="press rounded-btn border border-ink-300 bg-white px-3 py-1.5 text-sm font-bold text-ink-600"
                >
                  정리 끝
                </button>
              ) : (
                <button
                  onClick={() => {
                    setManage(true);
                    setWriting(false);
                  }}
                  className="press rounded-btn border border-ink-300 bg-white px-3 py-1.5 text-sm font-bold text-ink-600"
                >
                  🗑️ 정리
                </button>
              ))}
            {role != null && !manage && (
              <span className="relative">
                <button
                  onClick={() => setWriting((v) => !v)}
                  className="press rounded-btn bg-brand px-3 py-1.5 text-sm font-bold text-white"
                >
                  {writing ? "닫기" : role === "teacher" ? "✏️ 글 올리기" : "✏️ 안건 올리기"}
                </button>
                <JuiceBurst fireKey={postBurst} emojis={["📬", "✨", "💙"]} className="left-1/2 top-0" />
              </span>
            )}
          </div>
        </div>

        {/* 정리 모드 액션 바 — 전체 선택 + 선택 삭제 */}
        {manage && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50 px-4 py-2.5">
            <button
              onClick={toggleAll}
              className="press flex items-center gap-1.5 text-sm font-bold text-ink-600"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded border-2 text-xs ${
                  allPicked ? "border-brand bg-brand text-white" : "border-ink-300 bg-white"
                }`}
              >
                {allPicked && "✓"}
              </span>
              전체 선택
            </button>
            <button
              onClick={() => void deletePicked()}
              disabled={picked.size === 0}
              className="press rounded-btn bg-danger px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              선택한 {picked.size}개 삭제
            </button>
          </div>
        )}

        {writing && (
          <div className="space-y-2 border-b border-ink-100 bg-ink-50/50 p-4">
            {/* 종류 선택 — 일반 안건 / 법률 제안 / 숨은 기여 추천 (건의→투표→지급, 사용자 확정) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: "general", label: "💬 일반 안건" },
                  { key: "law", label: "📜 법률 제안" },
                  { key: "hidden", label: "🕵️ 숨은 기여 추천" },
                ] as const
              ).map((k) => (
                <button
                  key={k.key}
                  onClick={() => setPostKind(k.key)}
                  className={`press rounded-full px-3 py-1.5 text-xs font-bold ${
                    postKind === k.key
                      ? "bg-ink-800 text-white"
                      : "bg-white text-ink-500 border border-ink-200"
                  }`}
                >
                  {k.label}
                </button>
              ))}
              {postKind === "law" && (
                <span className="text-[11px] text-ink-400">
                  채택되면 그 부서의 법이 돼요 → 부서를 골라주세요
                </span>
              )}
              {postKind === "hidden" && (
                <span className="text-[11px] text-ink-400">
                  친구들의 👍 투표를 거쳐 선생님이 금요일에 실버 1개를 지급해요
                </span>
              )}
            </div>
            {postKind === "hidden" ? (
              /* 🕵️ 숨은 기여 추천 — 대상 선택(자기 제외) + 이유(10자↑). 👍👎로 학급이 결정 */
              <>
                <div className="flex flex-wrap gap-1.5">
                  {students
                    .filter((s) => !s.inactive && s.id !== studentId)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setHiddenTarget(hiddenTarget === s.id ? null : s.id)}
                        className={`press rounded-full border px-3 py-1.5 text-xs font-bold ${
                          hiddenTarget === s.id
                            ? "border-violet-400 bg-violet-500 text-white"
                            : "border-ink-200 bg-white text-ink-600 hover:border-violet-300"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    hiddenTarget != null
                      ? `${studentById.get(hiddenTarget)?.name}이(가) 학급을 위해 드러나지 않게 무엇을 했나요? (예: 아무도 안 볼 때 우유갑을 정리했어요)`
                      : "먼저 위에서 추천할 친구를 골라주세요 (자기 자신은 추천할 수 없어요)"
                  }
                  rows={3}
                  className="w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px] focus:border-brand focus:outline-none"
                />
                {hiddenTarget != null && (
                  <p className={`text-[11px] ${content.trim().length >= 10 ? "text-emerald-600" : "text-ink-400"}`}>
                    {content.trim().length >= 10
                      ? `✓ 좋아요! (${content.trim().length}글자)`
                      : `10글자 이상 — ${10 - content.trim().length}글자 더 써주세요`}
                  </p>
                )}
              </>
            ) : postKind === "law" ? (
              /* 법률 제안 — 부서 + 조 제목 + 항별 내용 (헌법 탭과 같은 구조) */
              <>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_INFO.map((r) => (
                    <button
                      key={r.dept}
                      onClick={() => setPostDept(postDept === r.dept ? null : r.dept)}
                      className={`press rounded-full px-3 py-1.5 text-xs font-bold ${
                        postDept === r.dept
                          ? "bg-brand text-white"
                          : "border border-ink-200 bg-white text-ink-600 hover:border-brand"
                      }`}
                    >
                      {r.emoji} {r.dept}
                    </button>
                  ))}
                </div>
                <div className="rounded-card border border-violet-200 bg-violet-50/40 p-3">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-violet-200 px-2 py-1 text-xs font-bold text-violet-800">
                      제○조
                    </span>
                    <input
                      value={lawTitle}
                      onChange={(e) => setLawTitle(e.target.value)}
                      placeholder="조 제목 (예: 복도 통행)"
                      className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm font-medium focus:border-brand focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 pl-1 text-[11px] text-ink-400">
                    조 번호는 채택될 때 자동으로 매겨져요.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {lawClauses.map((cl, hi) => (
                      <div key={hi} className="flex items-start gap-2">
                        <span className="mt-2 shrink-0 text-base font-bold text-brand">
                          {CIRCLED_NUMS[hi] ?? "·"}
                        </span>
                        <textarea
                          value={cl}
                          onChange={(e) =>
                            setLawClauses(lawClauses.map((x, j) => (j === hi ? e.target.value : x)))
                          }
                          placeholder="항 내용을 적어주세요"
                          rows={2}
                          className="w-full rounded-btn border border-ink-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                        {lawClauses.length > 1 && (
                          <button
                            onClick={() => setLawClauses(lawClauses.filter((_, j) => j !== hi))}
                            className="press mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-danger-weak hover:text-danger"
                            aria-label="항 삭제"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setLawClauses([...lawClauses, ""])}
                      className="press ml-6 text-xs font-bold text-brand hover:text-brand-strong"
                    >
                      + 항 추가 ({CIRCLED_NUMS[lawClauses.length] ?? ""})
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
            <div className="flex items-center gap-3">
              {role === "student" ? (
                <label className="flex items-center gap-1.5 text-sm text-ink-500">
                  <input
                    type="checkbox"
                    checked={teacherOnly}
                    onChange={(e) => setTeacherOnly(e.target.checked)}
                  />
                  🔒 선생님만 보기 (몰래 전할 말)
                </label>
              ) : (
                <label className="flex items-center gap-1.5 text-sm text-ink-500">
                  <input
                    type="checkbox"
                    checked={announce}
                    onChange={(e) => setAnnounce(e.target.checked)}
                  />
                  📌 공지로 고정
                </label>
              )}
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
          <SkeletonList rows={5} />
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
            <Pager page={page} totalPages={knownPages} onChange={setPage} />
          </div>
        )}
      </section>

      {/* 상세 — 1학기 게시판처럼 목록 위 모달로 (목록 스크롤·페이지 상태 유지) */}
      {selected &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-2 sm:p-6"
            onClick={() => setSelectedId(null)}
          >
            {/* 큰 팝업 — 화면의 대부분을 쓰고, 내용이 길면 패널 안에서만 스크롤 */}
            <div
              className="rise flex max-h-[94vh] w-full max-w-4xl flex-col sm:max-h-[92vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <PostDetail sug={selected} onBack={() => setSelectedId(null)} />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
