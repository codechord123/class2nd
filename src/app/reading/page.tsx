"use client";
// 거북이 독서 — 하위탭 구조 리빌드:
//   상단 히어로(배너+경고+마라톤)는 항상, 나머지는 [쓰기|감상문|순위|1학기] 탭으로 분리.
//   감상문에는 친구 댓글(레드팀 만장일치 차용). 목표는 1학기와 이어서 진행.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { loadS1TurtleReading } from "@/lib/staticData";
import { kstDateOf, todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import {
  useReadingStats,
  useRecentReports,
  useMyDrafts,
  useDeleteReport,
  useDeleteDraft,
  useAddReportComment,
  useDeleteReportComment,
  reportSuspicion,
  BOOK_TAGS,
  type ReportForm,
  type ReadingReport2,
} from "@/lib/query/reading";
import ReadingAlert from "@/components/reading/ReadingAlert";
import RankCarousel from "@/components/reading/RankCarousel";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import WriteSheet, { type WriteInitial } from "@/components/reading/WriteSheet";
import ClassBanner from "@/components/ClassBanner";
import SubTabs from "@/components/ui/SubTabs";
import Pager from "@/components/ui/Pager";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import Linkify from "@/components/ui/Linkify";
import { useFeedback } from "@/components/ui/Feedback";

type Tab = "write" | "list";

// 게시판 통합용 — 1학기 정적 감상문을 2학기 형태에 얹은 것 (s1=true면 수정·삭제·댓글 없음)
type ListReport = ReadingReport2 & { s1?: boolean; s1Date?: string };

// ── 감상문 본문 + 댓글 ───────────────────────────────────────────
function ReportBody({
  r,
  onEdit,
  onDelete,
  noComments,
}: {
  r: ReadingReport2;
  onEdit?: () => void;
  onDelete?: () => void;
  noComments?: boolean; // 1학기 기록은 보관용 — 댓글 없음
}) {
  const { role, studentId } = useSession();
  const { toast, confirm } = useFeedback();
  const addComment = useAddReportComment(role === "teacher" ? "teacher" : studentId);
  const deleteComment = useDeleteReportComment();
  const [text, setText] = useState("");

  const name = (id: number | "teacher") =>
    id === "teacher" ? "선생님" : (studentById.get(id)?.name ?? "?");

  // 복붙·속성 작성 신호 — 선생님에게만 (학생 화면엔 안 보임)
  const suspicion = role === "teacher" ? reportSuspicion(r) : null;
  const pasteCount = r.pasteCount ?? 0;

  return (
    <>
      {suspicion &&
        (suspicion.paste || suspicion.fast ? (
          // 강한 의심 — 붙여넣기 비율 큼 또는 속성 작성
          <div className="mb-3 rounded-btn bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            🚩 <b>확인이 필요한 글일 수 있어요</b> —{" "}
            {[
              (pasteCount > 0 || (r.pastedChars ?? 0) > 0) &&
                `붙여넣기 ${pasteCount}회 · ${r.pastedChars ?? 0}자`,
              suspicion.fast && `빠른 작성 (${Math.round((r.writeMs ?? 0) / 1000)}초)`,
            ]
              .filter(Boolean)
              .join(" · ")}
            <span className="ml-1 text-ink-400">— 복붙·AI 작성 의심 신호예요.</span>
          </div>
        ) : pasteCount > 0 ? (
          // 약한 신호도 그대로 — 글자 수와 관계없이 '붙여넣기 행위'를 선생님이 바로 보게
          <div className="mb-3 rounded-btn bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
            📋 붙여넣기 <b>{pasteCount}회 · {r.pastedChars ?? 0}자</b>
            <span className="ml-1 text-ink-400">— 선생님만 보여요. 직접 쓴 글인지 확인해보세요.</span>
          </div>
        ) : suspicion.measured ? null : (
          // 배포 전 작성분 — 신호 자체가 없음
          <div className="mb-3 rounded-btn bg-ink-50 px-3 py-1.5 text-[12px] text-ink-400">
            ℹ️ 복붙·작성 기록이 없는 글이에요 (감지 기능 적용 전 작성).
          </div>
        ))}
      {r.summary && <ReportSection label="줄거리" text={r.summary} />}
      {r.scene && <ReportSection label="인상 깊은 장면" text={r.scene} />}
      {r.quote && (
        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-bold text-emerald-700">마음에 남은 문장 (인용)</p>
          <div className="rounded-btn border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <p className="whitespace-pre-wrap text-[15px] italic leading-[1.9] text-emerald-900 [overflow-wrap:anywhere]">
              ❝ {r.quote}
            </p>
          </div>
        </div>
      )}
      {r.thoughts && <ReportSection label="읽고 난 생각" text={r.thoughts} />}
      {r.authorIntent && <ReportSection label="작가는 왜 이 글을 썼을까?" text={r.authorIntent} />}
      {r.connect && <ReportSection label="이 책을 나와 연결하면?" text={r.connect} />}
      {(onEdit || onDelete) && (
        <div className="mt-5 flex gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="press rounded-btn bg-brand-weak px-3.5 py-1.5 text-[13px] font-bold text-brand-strong"
            >
              수정
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="press rounded-btn bg-danger-weak px-3.5 py-1.5 text-[13px] font-bold text-danger"
            >
              삭제
            </button>
          )}
        </div>
      )}

      {/* 친구 댓글 — 말풍선 */}
      {!noComments && (
      <div className="mt-5 border-t border-ink-100 pt-3">
        <p className="text-[13px] font-bold text-ink-500">
          응원 댓글 {(r.comments?.length ?? 0) > 0 && `${r.comments!.length}개`}
        </p>
        {(r.comments ?? []).map((c) => (
          <div key={c.id} className="mt-2 flex items-start gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-extrabold text-emerald-700">
              {name(c.studentId).charAt(0)}
            </span>
            <div className="min-w-0 rounded-2xl rounded-tl-sm bg-ink-100 px-3 py-2">
              <span className="text-xs font-bold text-ink-500">{name(c.studentId)}</span>
              <p className="text-sm leading-6 text-ink-800 [overflow-wrap:anywhere]">{c.text}</p>
            </div>
            {(role === "teacher" || c.studentId === studentId) && (
              <button
                onClick={() =>
                  void confirm({ title: "댓글을 삭제할까요?", confirmLabel: "삭제", danger: true }).then(
                    (ok) => ok && void deleteComment(r, c.id)
                  )
                }
                className="shrink-0 self-center text-[11px] text-ink-400 hover:text-danger"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && text.trim()) {
                void addComment(r.id, text).then(() => setText(""), (err: Error) => toast(err.message, "error"));
              }
            }}
            placeholder="응원 댓글 달기…"
            className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <button
            onClick={() => {
              if (!text.trim()) return;
              void addComment(r.id, text).then(() => setText(""), (err: Error) => toast(err.message, "error"));
            }}
            disabled={!text.trim()}
            className="press shrink-0 rounded-btn bg-brand px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            등록
          </button>
        </div>
      </div>
      )}
    </>
  );
}

// 작성일 라벨 — "7.4"는 평점처럼 읽혀서 "7월 4일"로 (실화면 검수에서 발견)
function dateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 감상문 본문 섹션 — 쓰기 화면과 같은 문법: 진한 라벨 + 테두리 상자 (읽기 전용판)
// [overflow-wrap:anywhere]: 띄어쓰기 없는 긴 글이 카드 밖으로 넘치지 않게
function ReportSection({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="mb-1.5 text-[13px] font-bold text-ink-700">{label}</p>
      <div className="rounded-btn border border-ink-200 bg-ink-50/40 px-3.5 py-3">
        <p className="whitespace-pre-wrap text-[15px] leading-[1.9] text-ink-800 [overflow-wrap:anywhere]">
          <Linkify text={text} />
        </p>
      </div>
    </div>
  );
}

// 장르별 표지 색·아이콘 — 실제 독서 앱(밀리의서재 등)처럼 '표지'가 책의 첫인상을 만든다.
// 표지 이미지가 없으니 장르 색 + 아이콘 + 책등(왼쪽 어두운 줄)으로 표지를 생성.
const COVER_STYLE: Record<string, { grad: string; emoji: string }> = {
  그림책: { grad: "from-amber-400 to-orange-500", emoji: "🎨" },
  동화: { grad: "from-rose-400 to-pink-500", emoji: "🏰" },
  소설: { grad: "from-violet-500 to-purple-600", emoji: "📖" },
  과학: { grad: "from-sky-400 to-blue-600", emoji: "🔬" },
  역사: { grad: "from-yellow-600 to-amber-700", emoji: "🏛️" },
  인물: { grad: "from-red-400 to-rose-600", emoji: "👤" },
  시: { grad: "from-fuchsia-400 to-pink-600", emoji: "🌙" },
  만화: { grad: "from-orange-400 to-amber-500", emoji: "💥" },
  "지식·정보": { grad: "from-cyan-500 to-teal-600", emoji: "💡" },
  기타: { grad: "from-emerald-400 to-teal-600", emoji: "📚" },
};

function BookCover({ r, size, locked }: { r: ReadingReport2; size: "sm" | "lg"; locked?: boolean }) {
  const c = locked
    ? { grad: "from-slate-300 to-slate-400", emoji: "🔒" }
    : (COVER_STYLE[r.tags?.[0] ?? "기타"] ?? COVER_STYLE.기타);
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-r-md rounded-l-[3px] border-l-4 border-black/20 bg-gradient-to-br shadow-card ${c.grad} ${
        size === "lg" ? "h-24 w-[4.5rem] text-3xl" : "h-12 w-9 text-lg"
      }`}
    >
      {c.emoji}
    </span>
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
  // 게시판형 페이지네이션 — n개씩 보기 + 페이지 번호 (fetch는 현재 페이지까지 +1로 다음 페이지 존재 탐지)
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const { data: reports } = useRecentReports(page * pageSize + 1);
  const { data: myDrafts } = useMyDrafts(studentId);
  const deleteReport = useDeleteReport();
  const deleteDraft = useDeleteDraft(studentId);

  const [tab, setTab] = useState<Tab>(role === "teacher" ? "list" : "write");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [onlyS2, setOnlyS2] = useState(false); // 2학기 글만 보기 (1학기 112건 스킵)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 전체화면 쓰기 시트
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitial, setSheetInitial] = useState<WriteInitial | null>(null);

  function toForm(r: ReadingReport2): ReportForm {
    return {
      title: r.title, author: r.author ?? "", publisher: r.publisher ?? "",
      summary: r.summary ?? "", scene: r.scene ?? "", quote: r.quote ?? "",
      thoughts: r.thoughts ?? "", authorIntent: r.authorIntent ?? "", connect: r.connect ?? "",
      tags: r.tags ?? [], isPrivate: r.isPrivate ?? false,
    };
  }
  const openSheet = (initial: WriteInitial | null) => {
    setSheetInitial(initial);
    setSheetOpen(true);
  };
  const openNew = () => openSheet(null);
  const editDraft = (r: ReadingReport2) => openSheet({ form: toForm(r), draftId: r.id });
  const editReport = (r: ReadingReport2) => openSheet({ form: toForm(r), reportId: r.id });

  // 📚 1·2학기 통합 게시판 (사용자 결정: 별도 '1학기' 탭 없이 여기서 함께) —
  // 1학기 정적 백업(313KB)은 감상문 탭을 열 때만 동적 로드 (Firestore 읽기 0회)
  const { data: s1Data } = useQuery({
    queryKey: ["s1-turtle"],
    queryFn: loadS1TurtleReading,
    staleTime: Infinity,
    enabled: tab === "list",
  });
  const s1Items: ListReport[] = useMemo(
    () =>
      (s1Data?.readingReports ?? [])
        .filter((r) => !(r as { isDraft?: boolean }).isDraft)
        .map((r) => ({
          id: `s1-${r.docId}`,
          studentId: r.studentId,
          title: r.title,
          author: r.author ?? "",
          publisher: r.publisher ?? "",
          summary: r.summary ?? "",
          scene: r.scene ?? "",
          quote: r.quote ?? "",
          thoughts: r.thoughts ?? "",
          isDraft: false,
          week: 0,
          createdAt: Number(r.docId.split("_")[0]) || 0,
          s1: true,
          s1Date: r.date.split(" ").slice(0, 2).join(" "), // "6월 11일 오후 10:13" → "6월 11일"
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
    [s1Data]
  );
  // 2학기(최신)가 앞, 1학기가 뒤 — 최신순 게시판이 자연히 학기 역순이 된다
  const allReports: ListReport[] = useMemo(
    () => [...(reports ?? []), ...s1Items],
    [reports, s1Items]
  );

  // 🔒 비공개 글: 작성자 본인·교사만 내용 열람 가능
  const isLocked = (r: ListReport) =>
    !!r.isPrivate && role !== "teacher" && r.studentId !== studentId;

  const visible = allReports
    .filter((r) => (onlyS2 ? !r.s1 : true))
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

  // 페이지네이션: 검색·태그 필터 중에는 결과 전체를 그대로 (페이지 개념이 헷갈리지 않게)
  const filtering = Boolean(search.trim() || tagFilter);
  const knownPages = Math.max(
    1,
    Math.ceil(((reports?.length ?? 0) + (onlyS2 ? 0 : s1Items.length)) / pageSize)
  );
  const pageItems = filtering ? visible : visible.slice((page - 1) * pageSize, page * pageSize);

  // ── 상세 화면 (제목 클릭 진입) — 잠긴 글은 진입 불가 ──────────────
  const selectedReport = allReports.find((r) => r.id === selectedId && !isLocked(r));
  if (selectedId && selectedReport) {
    const r = selectedReport;
    return (
      // 긴 글 대응 — 데스크탑 2단: 왼쪽 책 카드가 고정(sticky)되어 아무리 긴 글을
      // 스크롤해도 "무슨 책, 누구 글"이라는 맥락이 화면에서 사라지지 않는다
      <div className="mx-auto w-full max-w-3xl space-y-3 lg:grid lg:max-w-none lg:grid-cols-[300px_1fr] lg:items-start lg:gap-4 lg:space-y-0">
        <div className="space-y-3 lg:sticky lg:top-32">
        <button
          onClick={() => setSelectedId(null)}
          className="press rounded-btn bg-ink-100 px-3 py-1.5 text-sm font-bold text-ink-600 hover:bg-ink-200"
        >
          ← 목록으로
        </button>
        {/* 책 정보 카드 — 독서 앱 문법: 표지가 왼쪽 앵커, 제목·저자가 그 옆 */}
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card sm:p-5">
          {/* lg(2단)에서는 사이드 카드답게 표지를 위로 세로 배치 */}
          <div className="flex gap-4 lg:flex-col lg:items-center lg:gap-3 lg:text-center">
            <BookCover r={r} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 lg:justify-center">
                {r.s1 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    📚 1학기 기록
                  </span>
                ) : (r.tags?.length ?? 0) > 0 ? (
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
                {r.isPrivate && (
                  <span className="rounded-full bg-warn-weak px-2 py-0.5 text-[11px] font-bold text-warn">
                    🔒 선생님만 보기
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-2xl font-extrabold leading-snug text-ink-900 [overflow-wrap:anywhere]">
                {r.title}
              </h3>
              {(r.author || r.publisher) && (
                <p className="mt-1 text-[15px] text-ink-600 [overflow-wrap:anywhere]">
                  {r.author && (
                    <>
                      지은이 <b>{r.author}</b>
                    </>
                  )}
                  {r.author && r.publisher && " · "}
                  {r.publisher && (
                    <>
                      출판사 <b>{r.publisher}</b>
                    </>
                  )}
                </p>
              )}
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-600 lg:justify-center">
                <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
                  {studentById.get(r.studentId)?.name}
                </span>
                {r.s1 ? (
                  <span className="tnum">1학기 · {r.s1Date}</span>
                ) : (
                  <>
                    <span>{r.week}주차</span>
                    <span>·</span>
                    <span className="tnum">{dateLabel(r.createdAt)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </section>
        </div>

        {/* 감상 카드 — 쓰기 화면 '2. 감상을 남겨요'와 같은 라벨+상자 구조 */}
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card sm:p-5">
          <div>
            <ReportBody
              r={r}
              noComments={!!r.s1}
              onEdit={!r.s1 && r.studentId === studentId ? () => editReport(r) : undefined}
              onDelete={
                // 1학기 기록은 보관용(수정·삭제 불가). 본인 글은 언제든 삭제 가능 —
                // 당일 제한은 "내 글을 못 지운다"는 혼란만 낳아 해제 (사용자 결정)
                !r.s1 && (role === "teacher" || r.studentId === studentId)
                  ? async () => {
                      const ok = await confirm({
                        title: "이 감상문을 삭제할까요?",
                        body:
                          kstDateOf(r.createdAt) === todayKST()
                            ? "권수 1권도 함께 줄어들어요."
                            : "지난 글이에요 — 그 주의 권수 1권도 함께 줄어들어요.",
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
      {/* 히어로: 학급 목표(교사 편집) + 경고 + [마라톤·순위 한 카드] — 상단 다이어트 */}
      <ClassBanner compact />
      <ReadingAlert />
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <TurtleMarathon bare />
        <div className="mt-3 border-t border-ink-100 pt-2.5">
          <h3 className="text-sm font-bold text-emerald-900">🏁 독서 순위 (1·2학기 합산)</h3>
          <div className="mt-1">
            <RankCarousel stats={stats} />
          </div>
        </div>
      </section>

      <SubTabs<Tab>
        tabs={[
          { key: "write", label: "✍️ 쓰기" },
          { key: "list", label: `📖 감상문 (1·2학기)` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ✍️ 쓰기 — 런처(버튼) + 내 임시저장. 실제 작성은 전체화면 시트 */}
      {tab === "write" && studentId && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <button
            onClick={openNew}
            className="press flex w-full items-center justify-center gap-2 rounded-card bg-brand py-6 text-base font-extrabold text-white shadow-card"
          >
            ✍️ 감상문 쓰기 ({todayKST() < SEMESTER_START ? "🏖️ 방학 — 쓴 만큼 누적!" : `${week}주차`})
          </button>
          <p className="mt-2 text-center text-xs text-ink-400">
            버튼을 누르면 넓은 쓰기 화면이 열려요. 길게 써도 편해요!
          </p>

          {/* 내 임시저장 */}
          {(myDrafts?.length ?? 0) > 0 && (
            <div className="mt-4 rounded-card border border-ink-200 bg-ink-50/60 p-3">
              <p className="text-xs font-bold text-ink-600">💾 내 임시저장 ({myDrafts!.length})</p>
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
            <h3 className="text-lg font-bold">📖 친구들의 감상문</h3>
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
            <button
              onClick={() => {
                setOnlyS2((v) => !v);
                setPage(1);
              }}
              className={`press rounded-full px-2.5 py-1 text-xs font-medium ${
                onlyS2 ? "bg-brand text-white" : "bg-ink-100 text-ink-500"
              }`}
            >
              2학기만
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
            <SkeletonList rows={5} />
          ) : (
            !visible.length &&
            (search || tagFilter ? (
              <EmptyState emoji="🔍" title="조건에 맞는 감상문이 없어요" />
            ) : (
              <EmptyState emoji="🐢" title="아직 감상문이 없어요" desc="첫 번째 주인공이 되어보세요!" />
            ))
          )}
          {/* 2칼럼 목록 — 한 화면에 더 많은 감상문이 보이게 (사용자 요청). 모바일은 1칼럼 */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-2 [&>li]:border-b [&>li]:border-ink-100">
            {pageItems.map((r) =>
              isLocked(r) ? (
                // 🔒 잠긴 행 — 제목·내용 비노출, 클릭해도 펼쳐지지 않음
                <li key={r.id}>
                  <div className="flex w-full items-center gap-3 px-4 py-2.5">
                    <BookCover r={r} size="sm" locked />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-500">
                        {studentById.get(r.studentId)?.name}
                      </span>
                      <span className="text-sm font-bold text-ink-400">🔒 비공개 글</span>
                    </span>
                    <span className="shrink-0 tnum text-xs text-ink-400">{dateLabel(r.createdAt)}</span>
                  </div>
                </li>
              ) : (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50"
                  >
                    {/* 미니 표지 — 장르 색으로 목록이 '서재'처럼 스캔되게 */}
                    <BookCover r={r} size="sm" />
                    <span className="min-w-0 flex-1">
                      {/* 1줄: 책 제목 + 잠금 */}
                      <span className="flex items-center gap-1.5">
                        {r.isPrivate && <span className="shrink-0 text-xs">🔒</span>}
                        {/* 선생님만 — 복붙 행위 표시. 강한 의심은 🚩, 작은 붙여넣기도 📋로 */}
                        {role === "teacher" &&
                          (() => {
                            const sp = reportSuspicion(r);
                            if (sp.paste || sp.fast)
                              return (
                                <span className="shrink-0 text-xs" title="복붙·AI 작성 의심">
                                  🚩
                                </span>
                              );
                            if ((r.pasteCount ?? 0) > 0)
                              return (
                                <span
                                  className="shrink-0 text-xs"
                                  title={`붙여넣기 ${r.pasteCount}회 · ${r.pastedChars ?? 0}자`}
                                >
                                  📋
                                </span>
                              );
                            return null;
                          })()}
                        <b className="truncate text-[15px] text-ink-900">{r.title}</b>
                      </span>
                      {/* 2줄: 작가 · 작성자 칩 · 작성일 (1학기 기록은 학기 배지) */}
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-600">
                        {r.author && <span className="max-w-[9rem] truncate">{r.author}</span>}
                        {r.author && <span>·</span>}
                        <span className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
                          {studentById.get(r.studentId)?.name}
                        </span>
                        {r.s1 ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
                            1학기
                          </span>
                        ) : (
                          <span className="shrink-0 tnum">{dateLabel(r.createdAt)}</span>
                        )}
                      </span>
                    </span>
                    {(r.comments?.length ?? 0) > 0 && (
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-600">
                        💬 {r.comments!.length}
                      </span>
                    )}
                    <span className="shrink-0 self-center text-sm text-ink-300">›</span>
                  </button>
                </li>
              )
            )}
          </ul>

          {/* 게시판식 하단: n개씩 보기 + 페이지 번호 (검색·필터 중에는 숨김) */}
          {!filtering && allReports.length > 0 && (
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
      )}

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
