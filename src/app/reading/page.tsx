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
  useDeleteReport,
  useDeleteDraft,
  useAddReportComment,
  useDeleteReportComment,
  BOOK_TAGS,
  type ReportForm,
  type ReadingReport2,
} from "@/lib/query/reading";
import ReadingAlert from "@/components/reading/ReadingAlert";
import RankCarousel from "@/components/reading/RankCarousel";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import S1Archive from "@/components/reading/S1Archive";
import WriteSheet, { type WriteInitial } from "@/components/reading/WriteSheet";
import ClassBanner from "@/components/ClassBanner";
import SubTabs from "@/components/ui/SubTabs";
import EmptyState from "@/components/ui/EmptyState";
import Linkify from "@/components/ui/Linkify";
import { useFeedback } from "@/components/ui/Feedback";

type Tab = "write" | "list" | "s1";

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
        <p className="text-xs text-ink-400">
          {r.author}
          {r.publisher && ` · ${r.publisher}`}
        </p>
      )}
      {r.summary && <ReportSection label="📖 줄거리" text={r.summary} />}
      {r.scene && <ReportSection label="🎬 인상 깊은 장면" text={r.scene} />}
      {r.quote && (
        <div className="mt-2 rounded-btn bg-emerald-50/70 p-3">
          <p className="text-xs font-bold text-emerald-700">💬 마음에 남는 문장</p>
          <p className="mt-1 whitespace-pre-wrap border-l-2 border-emerald-300 pl-2.5 text-[15px] italic leading-7 text-ink-600">
            “{r.quote}”
          </p>
        </div>
      )}
      {r.thoughts && <ReportSection label="💭 읽고 난 생각" text={r.thoughts} />}
      {(onEdit || onDelete) && (
        <div className="mt-2 flex gap-2 text-xs">
          {onEdit && (
            <button onClick={onEdit} className="text-brand underline">
              ✏️ 수정
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="text-danger underline">
              🗑️ 삭제
            </button>
          )}
        </div>
      )}

      {/* 친구 댓글 */}
      <div className="mt-2 border-t border-ink-200 pt-2">
        {(r.comments ?? []).map((c) => (
          <div key={c.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              <b className="text-xs text-ink-500">{name(c.studentId)}</b>{" "}
              <span className="text-ink-600">{c.text}</span>
            </span>
            {(role === "teacher" || c.studentId === studentId) && (
              <button
                onClick={() =>
                  void confirm({ title: "댓글을 삭제할까요?", confirmLabel: "삭제", danger: true }).then(
                    (ok) => ok && void deleteComment(r, c.id)
                  )
                }
                className="shrink-0 text-[10px] text-ink-400 hover:text-danger"
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
            className="min-w-0 flex-1 rounded-btn border border-ink-200 px-2.5 py-1 text-xs"
          />
          <button
            onClick={() => {
              if (!text.trim()) return;
              void addComment(r.id, text).then(() => setText(""), (err: Error) => toast(err.message, "error"));
            }}
            disabled={!text.trim()}
            className="press shrink-0 rounded-btn bg-success px-2.5 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            등록
          </button>
        </div>
      </div>
    </>
  );
}

// 작성일 라벨 (월.일)
function dateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// 감상문 본문 섹션 — 라벨 달린 박스로 긴 글을 덩어리째 분리 (벽글 방지)
function ReportSection({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-2 rounded-btn bg-ink-50 p-3">
      <p className="text-xs font-bold text-ink-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-7 text-ink-700">
        <Linkify text={text} />
      </p>
    </div>
  );
}

// 책 종류 태그 칩
function Tags({ r }: { r: ReadingReport2 }) {
  if (!(r.tags?.length ?? 0)) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {r.tags!.map((t) => (
        <span key={t} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
          {t}
        </span>
      ))}
    </span>
  );
}

export default function ReadingPage() {
  const { role, studentId } = useSession();
  const { toast, confirm } = useFeedback();
  const week = weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);

  const { data: stats } = useReadingStats();
  const [pages, setPages] = useState(1);
  const { data: reports } = useRecentReports(pages);
  const { data: myDrafts } = useMyDrafts(studentId);
  const deleteReport = useDeleteReport();
  const deleteDraft = useDeleteDraft(studentId);

  const [tab, setTab] = useState<Tab>(role === "teacher" ? "list" : "write");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 전체화면 쓰기 시트
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitial, setSheetInitial] = useState<WriteInitial | null>(null);

  function toForm(r: ReadingReport2): ReportForm {
    return {
      title: r.title, author: r.author ?? "", publisher: r.publisher ?? "",
      summary: r.summary ?? "", scene: r.scene ?? "", quote: r.quote ?? "",
      thoughts: r.thoughts ?? "", tags: r.tags ?? [], isPrivate: r.isPrivate ?? false,
    };
  }
  const openSheet = (initial: WriteInitial | null) => {
    setSheetInitial(initial);
    setSheetOpen(true);
  };
  const openNew = () => openSheet(null);
  const editDraft = (r: ReadingReport2) => openSheet({ form: toForm(r), draftId: r.id });
  const editReport = (r: ReadingReport2) => openSheet({ form: toForm(r), reportId: r.id });

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

  // ── 상세 화면 (제목 클릭 진입) — 잠긴 글은 진입 불가 ──────────────
  const selectedReport = (reports ?? []).find((r) => r.id === selectedId && !isLocked(r));
  if (selectedId && selectedReport) {
    const r = selectedReport;
    return (
      <div className="space-y-3">
        <button
          onClick={() => setSelectedId(null)}
          className="text-sm text-ink-400 hover:text-ink-600"
        >
          ← 목록으로
        </button>
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <div className="border-b border-ink-100 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(r.tags?.length ?? 0) > 0 ? (
                r.tags!.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-400">
                  미분류
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              {r.isPrivate && <span className="shrink-0 text-sm">🔒</span>}
              <h3 className="text-lg font-bold">{r.title}</h3>
            </div>
            <p className="mt-1 text-xs text-ink-400">
              {studentById.get(r.studentId)?.name} · {r.week}주차 · {dateLabel(r.createdAt)}
            </p>
          </div>
          <div className="mt-3">
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
                      if (ok)
                        void deleteReport(r)
                          .then(() => setSelectedId(null))
                          .catch((e: Error) => toast(e.message, "error"));
                    }
                  : undefined
              }
            />
          </div>
        </section>
        {/* 전체화면 쓰기 시트 — 상세에서 수정 눌러도 열리도록 유지 */}
        {sheetOpen && studentId && (
          <WriteSheet
            studentId={studentId}
            week={week}
            initial={sheetInitial}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 히어로: 학급 목표(교사 편집) + 경고 + 마라톤 (항상 표시, 컴팩트) */}
      <ClassBanner compact />
      <ReadingAlert />
      <TurtleMarathon />

      {/* 🏁 독서 순위 — 목표 블록 바로 아래 상시 노출 (탭 아님) */}
      <section className="rounded-card border border-amber-200 bg-amber-50/60 px-4 py-3">
        <h3 className="text-sm font-bold text-amber-800">🏁 독서 순위 (1·2학기 합산)</h3>
        <div className="mt-1">
          <RankCarousel totals={stats?.total ?? {}} />
        </div>
      </section>

      <SubTabs<Tab>
        tabs={[
          { key: "write", label: "✍️ 쓰기" },
          { key: "list", label: `📖 감상문` },
          { key: "s1", label: "📚 1학기" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ✍️ 쓰기 — 런처(버튼) + 내 임시저장. 실제 작성은 전체화면 시트 */}
      {tab === "write" && studentId && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <button
            onClick={openNew}
            className="press flex w-full items-center justify-center gap-2 rounded-card bg-success py-6 text-base font-extrabold text-white shadow-card"
          >
            ✍️ 감상문 쓰기 ({week}주차)
          </button>
          <p className="mt-2 text-center text-xs text-ink-400">
            버튼을 누르면 넓은 쓰기 화면이 열려요. 길게 써도 편해요!
          </p>

          {/* 내 임시저장 */}
          {(myDrafts?.length ?? 0) > 0 && (
            <div className="mt-4 rounded-card border border-dashed border-amber-300 bg-amber-50/50 p-3">
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
                        className="text-xs text-danger underline"
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
        <p className="text-sm text-ink-400">감상문 쓰기는 학생 로그인에서 가능해요.</p>
      )}

      {/* 📖 감상문 목록 (커뮤니티 게시판형) */}
      {tab === "list" && (
        <section className="rounded-card border border-ink-200 bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 p-4">
            <h3 className="font-bold">📖 친구들의 감상문</h3>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 제목·내용·이름 검색"
              className="w-44 rounded-btn border border-ink-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-ink-100 p-3">
            <button
              onClick={() => setTagFilter(null)}
              className={`press rounded-full px-2.5 py-1 text-xs font-medium ${
                tagFilter === null ? "bg-brand text-white" : "bg-ink-100 text-ink-500"
              }`}
            >
              전체
            </button>
            {BOOK_TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`press rounded-full px-2.5 py-1 text-xs font-medium ${
                  tagFilter === t ? "bg-brand text-white" : "bg-ink-100 text-ink-500"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {!reports ? (
            <p className="px-4 py-8 text-center text-sm text-ink-400">불러오는 중…</p>
          ) : (
            !visible.length &&
            (search || tagFilter ? (
              <EmptyState emoji="🔍" title="조건에 맞는 감상문이 없어요" />
            ) : (
              <EmptyState emoji="🐢" title="아직 감상문이 없어요" desc="첫 번째 주인공이 되어보세요!" />
            ))
          )}
          <ul className="divide-y divide-ink-100">
            {visible.map((r) =>
              isLocked(r) ? (
                // 🔒 잠긴 행 — 제목·내용 비노출, 클릭해도 펼쳐지지 않음
                <li key={r.id}>
                  <div className="flex w-full items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-sm font-bold text-ink-400">🔒 비공개 글</span>
                    <span className="shrink-0 text-xs text-ink-400">
                      {studentById.get(r.studentId)?.name} · {dateLabel(r.createdAt)}
                    </span>
                  </div>
                </li>
              ) : (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-ink-50"
                  >
                    <span className="min-w-0 flex-1">
                      {/* 1줄: 책 제목 + 태그 + 댓글수 */}
                      <span className="flex items-center gap-1.5">
                        {r.isPrivate && <span className="shrink-0 text-xs">🔒</span>}
                        <b className="truncate text-sm text-ink-800">{r.title}</b>
                        <Tags r={r} />
                        {(r.comments?.length ?? 0) > 0 && (
                          <span className="shrink-0 text-xs font-bold text-brand">
                            💬{r.comments!.length}
                          </span>
                        )}
                      </span>
                      {/* 2줄: 작가 · 작성자 · 작성일 */}
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
                        {r.author && <span className="max-w-[8rem] truncate">✍️ {r.author}</span>}
                        <span className="truncate">{studentById.get(r.studentId)?.name}</span>
                        <span>·</span>
                        <span className="shrink-0 tnum">{dateLabel(r.createdAt)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 self-center text-sm text-ink-300">›</span>
                  </button>
                </li>
              )
            )}
          </ul>
          {reports && reports.length >= pages * 10 && (
            <button
              onClick={() => setPages((p) => p + 1)}
              className="w-full border-t border-ink-100 py-2.5 text-sm text-ink-500 hover:bg-ink-50"
            >
              더 보기
            </button>
          )}
        </section>
      )}

      {/* 📚 1학기 */}
      {tab === "s1" && <S1Archive />}

      {/* 전체화면 쓰기 시트 */}
      {sheetOpen && studentId && (
        <WriteSheet
          studentId={studentId}
          week={week}
          initial={sheetInitial}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
