"use client";
// 거북이 독서 — 하위탭 구조 리빌드:
//   상단 히어로(배너+경고+마라톤)는 항상, 나머지는 [쓰기|감상문|순위|1학기] 탭으로 분리.
//   감상문에는 친구 댓글(레드팀 만장일치 차용). 목표는 1학기와 이어서 진행.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import {
  useReadingStats,
  useRecentReports,
  useMyDrafts,
  useSaveReport,
  useDeleteReport,
  useDeleteDraft,
  useAddReportComment,
  useDeleteReportComment,
  reportBodyLength,
  BOOK_TAGS,
  type ReportForm,
  type ReadingReport2,
} from "@/lib/query/reading";
import { useSettings } from "@/lib/query/settings";
import ReadingAlert from "@/components/reading/ReadingAlert";
import RankCarousel from "@/components/reading/RankCarousel";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import S1Archive from "@/components/reading/S1Archive";
import SubTabs from "@/components/ui/SubTabs";
import Linkify from "@/components/ui/Linkify";
import { useFeedback } from "@/components/ui/Feedback";

const EMPTY_FORM: ReportForm = {
  title: "", author: "", publisher: "", summary: "", scene: "", quote: "", thoughts: "", tags: [],
  isPrivate: false,
};

type Tab = "write" | "list" | "rank" | "s1";

// ── 감상문 본문 + 댓글 ───────────────────────────────────────────
function ReportBody({
  r,
  onEdit,
  onDelete,
}: {
  r: ReadingReport2;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { role, studentId } = useSession();
  const { toast, confirm } = useFeedback();
  const addComment = useAddReportComment(role === "teacher" ? "teacher" : studentId);
  const deleteComment = useDeleteReportComment();
  const [text, setText] = useState("");

  const name = (id: number | "teacher") =>
    id === "teacher" ? "선생님" : (studentById.get(id)?.name ?? "?");

  return (
    <>
      {(r.author || r.publisher) && (
        <p className="text-xs text-slate-400">
          {r.author}
          {r.publisher && ` · ${r.publisher}`}
        </p>
      )}
      {r.summary && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
          <Linkify text={r.summary} />
        </p>
      )}
      {r.scene && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
          🎬 <Linkify text={r.scene} />
        </p>
      )}
      {r.quote && (
        <p className="mt-1 whitespace-pre-wrap text-sm italic text-slate-500">“{r.quote}”</p>
      )}
      {r.thoughts && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
          💭 <Linkify text={r.thoughts} />
        </p>
      )}
      {(onEdit || onDelete) && (
        <div className="mt-2 flex gap-2 text-xs">
          {onEdit && (
            <button onClick={onEdit} className="text-indigo-500 underline">
              ✏️ 수정
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="text-rose-400 underline">
              🗑️ 삭제
            </button>
          )}
        </div>
      )}

      {/* 친구 댓글 */}
      <div className="mt-2 border-t border-slate-200 pt-2">
        {(r.comments ?? []).map((c) => (
          <div key={c.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              <b className="text-xs text-slate-500">{name(c.studentId)}</b>{" "}
              <span className="text-slate-600">{c.text}</span>
            </span>
            {(role === "teacher" || c.studentId === studentId) && (
              <button
                onClick={() =>
                  void confirm({ title: "댓글을 삭제할까요?", confirmLabel: "삭제", danger: true }).then(
                    (ok) => ok && void deleteComment(r, c.id)
                  )
                }
                className="shrink-0 text-[10px] text-rose-300 hover:text-rose-500"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && text.trim()) {
                void addComment(r.id, text).then(() => setText(""), (err: Error) => toast(err.message, "error"));
              }
            }}
            placeholder="💬 응원 댓글 달기…"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
          />
          <button
            onClick={() =>
              void addComment(r.id, text).then(() => setText(""), (err: Error) => toast(err.message, "error"))
            }
            className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
          >
            등록
          </button>
        </div>
      </div>
    </>
  );
}

export default function ReadingPage() {
  const { role, studentId } = useSession();
  const { toast, confirm } = useFeedback();
  const week = weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);

  const { data: stats } = useReadingStats();
  const { data: settings } = useSettings();
  const [pages, setPages] = useState(1);
  const { data: reports } = useRecentReports(pages);
  const { data: myDrafts } = useMyDrafts(studentId);
  const saveReport = useSaveReport(studentId, week);
  const deleteReport = useDeleteReport();
  const deleteDraft = useDeleteDraft(studentId);

  const [tab, setTab] = useState<Tab>(role === "teacher" ? "list" : "write");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<ReportForm>(EMPTY_FORM);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [reportId, setReportId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const charLimit = settings?.readingCharLimit ?? 700;
  const bodyLen = reportBodyLength(form);
  const editing = draftId ? "draft" : reportId ? "report" : null;

  function toForm(r: ReadingReport2): ReportForm {
    return {
      title: r.title, author: r.author ?? "", publisher: r.publisher ?? "",
      summary: r.summary ?? "", scene: r.scene ?? "", quote: r.quote ?? "",
      thoughts: r.thoughts ?? "", tags: r.tags ?? [], isPrivate: r.isPrivate ?? false,
    };
  }
  function resetForm() {
    setForm(EMPTY_FORM);
    setDraftId(undefined);
    setReportId(undefined);
  }
  function editDraft(r: ReadingReport2) {
    setForm(toForm(r));
    setDraftId(r.id);
    setReportId(undefined);
    setTab("write");
  }
  function editReport(r: ReadingReport2) {
    setForm(toForm(r));
    setReportId(r.id);
    setDraftId(undefined);
    setTab("write");
  }

  async function submit(draft: boolean) {
    setBusy(true);
    try {
      if (!draft && bodyLen < charLimit)
        throw new Error(`본문은 ${charLimit}자 이상이어야 정식 등록할 수 있어요. (현재 ${bodyLen}자) 🐢`);
      const id = await saveReport(form, { draft, draftId, reportId });
      if (draft) {
        setDraftId(id);
        setReportId(undefined);
        toast("💾 임시저장 완료! 나중에 이어서 쓸 수 있어요.");
      } else {
        const wasEdit = editing === "report";
        resetForm();
        toast(wasEdit ? "✅ 감상문이 수정되었어요!" : "✅ 감상문이 정식 등록되었어요! +1권");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  // 🔒 비공개 글: 작성자 본인·교사만 내용 열람 가능
  const isLocked = (r: ReadingReport2) =>
    !!r.isPrivate && role !== "teacher" && r.studentId !== studentId;

  const visible = (reports ?? [])
    // 잠긴 글은 태그 필터 결과에서 제외 — 장르 메타데이터도 새지 않게
    .filter((r) => (tagFilter ? !isLocked(r) && (r.tags ?? []).includes(tagFilter) : true))
    .filter((r) => {
      const kw = search.trim().toLowerCase();
      if (!kw) return true;
      // 잠긴 글은 내용이 검색으로 새어나가지 않게 이름만 대상
      const hay = isLocked(r)
        ? (studentById.get(r.studentId)?.name ?? "").toLowerCase()
        : `${r.title} ${r.author} ${r.summary} ${r.thoughts} ${(r.tags ?? []).join(" ")} ${studentById.get(r.studentId)?.name ?? ""}`.toLowerCase();
      return hay.includes(kw);
    });

  const Tags = ({ r }: { r: ReadingReport2 }) =>
    (r.tags?.length ?? 0) > 0 ? (
      <span className="flex flex-wrap gap-1">
        {r.tags!.map((t) => (
          <span key={t} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
            {t}
          </span>
        ))}
      </span>
    ) : null;

  return (
    <div className="space-y-4">
      {/* 히어로: 목표 + 경고 + 마라톤 (항상 표시, 컴팩트) */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-white shadow">
        <p className="text-lg font-extrabold">🍜 짜파게티 파티까지 달린다!</p>
      </div>
      <ReadingAlert />
      <TurtleMarathon />

      <SubTabs<Tab>
        tabs={[
          { key: "write", label: "✍️ 쓰기" },
          { key: "list", label: `📖 감상문` },
          { key: "rank", label: "🏁 순위" },
          { key: "s1", label: "📚 1학기" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ✍️ 쓰기 */}
      {tab === "write" && studentId && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold">
            ✍️ 감상문 쓰기 ({week}주차)
            {editing === "draft" ? " — 임시저장 이어쓰기" : editing === "report" ? " — 등록본 수정 중" : ""}
          </h3>
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="책 제목 (필수)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                placeholder="지은이"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={form.publisher}
                onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                placeholder="출판사"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="📖 줄거리 — 어떤 이야기였나요?"
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={form.scene}
              onChange={(e) => setForm({ ...form, scene: e.target.value })}
              placeholder="🎬 인상 깊은 장면"
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={form.quote}
              onChange={(e) => setForm({ ...form, quote: e.target.value })}
              placeholder="💬 마음에 남는 문장 (인용)"
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={form.thoughts}
              onChange={(e) => setForm({ ...form, thoughts: e.target.value })}
              placeholder="💭 읽고 나서 든 생각과 느낌"
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400">책 종류:</span>
              {BOOK_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setForm({
                      ...form,
                      tags: form.tags.includes(t)
                        ? form.tags.filter((x) => x !== t)
                        : [...form.tags, t],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    form.tags.includes(t)
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-200 text-slate-500 hover:border-emerald-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={form.isPrivate ?? false}
                onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
                className="h-3.5 w-3.5 accent-slate-700"
              />
              🔒 선생님만 보기 (친구들에게는 내용이 보이지 않아요)
            </label>
            {/* 글자수: 3단계 색 진행 (레드팀 반영 — 처음부터 빨간 경고 X) */}
            {(() => {
              const pct = Math.min((bodyLen / charLimit) * 100, 100);
              const color =
                pct >= 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-500" : "text-slate-400";
              return (
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-slate-300"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className={`mt-0.5 text-right text-xs font-bold ${color}`}>
                    {bodyLen} / {charLimit}자 {pct >= 100 && "— 정식 등록 가능! ✅"}
                  </p>
                </div>
              );
            })()}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void submit(false)}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "저장 중…" : editing === "report" ? "수정 저장" : "정식 등록 (+1권)"}
              </button>
              <button
                onClick={() => void submit(true)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                💾 임시저장
              </button>
              {editing && (
                <button onClick={resetForm} className="text-xs text-slate-400 underline">
                  새로 쓰기
                </button>
              )}
            </div>
          </div>

          {/* 내 임시저장 */}
          {(myDrafts?.length ?? 0) > 0 && (
            <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3">
              <p className="text-xs font-bold text-amber-700">💾 내 임시저장 ({myDrafts!.length})</p>
              <ul className="mt-1 space-y-1 text-sm">
                {myDrafts!.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate">{r.title || "(제목 없음)"}</span>
                    <span className="flex shrink-0 gap-2">
                      <button onClick={() => editDraft(r)} className="text-xs text-amber-600 underline">
                        이어쓰기
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: "이 임시저장을 삭제할까요?",
                            body: r.title || "(제목 없음)",
                            confirmLabel: "삭제",
                            danger: true,
                          });
                          if (ok) void deleteDraft(r.id).catch((e: Error) => toast(e.message, "error"));
                        }}
                        className="text-xs text-rose-300 underline"
                      >
                        삭제
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {tab === "write" && !studentId && (
        <p className="text-sm text-slate-400">감상문 쓰기는 학생 로그인에서 가능해요.</p>
      )}

      {/* 📖 감상문 목록 (커뮤니티 게시판형) */}
      {tab === "list" && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <h3 className="font-bold">📖 친구들의 감상문</h3>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 제목·내용·이름 검색"
              className="w-44 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-3">
            <button
              onClick={() => setTagFilter(null)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                tagFilter === null ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              전체
            </button>
            {BOOK_TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  tagFilter === t ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {!visible.length && (
            <p className="p-4 text-sm text-slate-400">
              {search || tagFilter ? "조건에 맞는 감상문이 없어요." : "아직 감상문이 없어요. 첫 번째 주인공이 되어보세요!"}
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {visible.map((r) =>
              isLocked(r) ? (
                // 🔒 잠긴 행 — 제목·내용 비노출, 클릭해도 펼쳐지지 않음
                <li key={r.id}>
                  <div className="flex w-full items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-sm font-bold text-slate-400">🔒 비공개 글</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {studentById.get(r.studentId)?.name} · {r.week}주차
                    </span>
                  </div>
                </li>
              ) : (
                <li key={r.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {r.isPrivate && <span className="shrink-0 text-xs">🔒</span>}
                      <b className="truncate text-sm">{r.title}</b>
                      <Tags r={r} />
                      {(r.comments?.length ?? 0) > 0 && (
                        <span className="shrink-0 text-xs font-bold text-indigo-400">
                          💬{r.comments!.length}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {studentById.get(r.studentId)?.name} · {r.week}주차{" "}
                      {expandedId === r.id ? "▲" : "▼"}
                    </span>
                  </button>
                  {expandedId === r.id && (
                    <div className="bg-slate-50 px-4 py-3">
                      <ReportBody
                        r={r}
                        onEdit={r.studentId === studentId ? () => editReport(r) : undefined}
                        onDelete={
                          role === "teacher" || r.studentId === studentId
                            ? async () => {
                                const ok = await confirm({
                                  title: "이 감상문을 삭제할까요?",
                                  body: "권수 1권도 함께 줄어들어요.",
                                  confirmLabel: "삭제",
                                  danger: true,
                                });
                                if (ok) void deleteReport(r).catch((e: Error) => toast(e.message, "error"));
                              }
                            : undefined
                        }
                      />
                    </div>
                  )}
                </li>
              )
            )}
          </ul>
          {reports && reports.length >= pages * 10 && (
            <button
              onClick={() => setPages((p) => p + 1)}
              className="w-full border-t border-slate-100 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
            >
              더 보기
            </button>
          )}
        </section>
      )}

      {/* 🏁 순위 */}
      {tab === "rank" && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="text-sm font-bold text-amber-800">🏁 독서 순위 (1·2학기 합산)</h3>
          <div className="mt-2">
            <RankCarousel totals={stats?.total ?? {}} />
          </div>
        </section>
      )}

      {/* 📚 1학기 */}
      {tab === "s1" && <S1Archive />}
    </div>
  );
}
