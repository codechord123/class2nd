"use client";
// 📔 담임 일지 — 쓰기 + 모아보기(태그·학생·기간·검색) + 상담용 인쇄.
// 기록 도구는 마찰이 조금만 있어도 안 쓰게 된다 → 탭을 열면 바로 쓰기 칸이 보이고,
// 태그·학생은 '선택'이라 본문만 적어도 저장된다.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Field";
import Pager from "@/components/ui/Pager";
import { useFeedback } from "@/components/ui/Feedback";
import { openPrintWindow, preOpenPrintWindow } from "@/lib/exportDoc";
import {
  LOG_PAGE,
  filterLogs,
  tagCounts,
  useAddTeacherLog,
  useDeleteTeacherLog,
  useLogTags,
  useSaveLogTags,
  useTeacherLogs,
  useUpdateTeacherLog,
  type TeacherLog,
} from "@/lib/query/teacherLog";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (at: string) =>
  at ? `${Number(at.slice(5, 7))}월 ${Number(at.slice(8, 10))}일` : "";
const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
/** 일지엔 제목 칸이 없다 — 게시판 titleOf와 같은 방식으로 본문 첫 줄을 제목처럼 쓴다 */
const titleOf = (l: TeacherLog) => {
  const first = l.text.split("\n").find((x) => x.trim()) ?? "";
  return first.trim().slice(0, 32) + (first.trim().length > 32 ? "…" : "");
};

export default function TeacherLogPanel() {
  const { toast, confirm } = useFeedback();
  const [take, setTake] = useState(LOG_PAGE);
  const { data: logs, isLoading, error } = useTeacherLogs(true, take);
  const { data: tags } = useLogTags(true);
  const saveTags = useSaveLogTags();
  const addLog = useAddTeacherLog();
  const updateLog = useUpdateTeacherLog();
  const delLog = useDeleteTeacherLog();

  // ── 쓰기 ──
  const [at, setAt] = useState(todayKST());
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [who, setWho] = useState<number[]>([]);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);

  // ── 보기 ──
  const [fTag, setFTag] = useState("");
  const [fWho, setFWho] = useState<number | null>(null);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [kw, setKw] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  // 게시판 규격 — 10/20개 페이지네이션 + 목록 위 모달 상세
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 상세 모달 Escape 닫기 — 게시판과 같은 조작감
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const counts = useMemo(() => tagCounts(logs), [logs]);
  const shown = useMemo(
    () => filterLogs(logs, { tag: fTag, studentId: fWho, from: fFrom, to: fTo, keyword: kw }),
    [logs, fTag, fWho, fFrom, fTo, kw]
  );
  const filtering = !!(fTag || fWho != null || fFrom || fTo || kw);
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  // 필터를 좁히면 보던 페이지가 범위를 벗어나 빈 화면이 된다 → effect로 되돌리지 않고
  // 렌더에서 clamp (렌더 중 setState를 피하면서 같은 결과)
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => shown.slice((safePage - 1) * pageSize, safePage * pageSize),
    [shown, safePage, pageSize]
  );
  const selected = shown.find((l) => l.id === selectedId) ?? null;
  const active = students.filter((s) => !s.inactive);

  const toggle = <T,>(arr: T[], v: T) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await addLog({ at, text, tags: picked, studentIds: who });
      setText("");
      setPicked([]);
      setWho([]);
      setAt(todayKST());
      toast("📔 일지를 저장했어요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addNewTag() {
    const t = newTag.trim();
    if (!t) return;
    await saveTags([...(tags ?? []), t]).catch((e) =>
      toast(e instanceof Error ? e.message : "태그 저장 실패", "error")
    );
    setPicked((p) => (p.includes(t) ? p : [...p, t]));
    setNewTag("");
  }

  function print() {
    const win = preOpenPrintWindow(); // iOS 팝업 차단 — 클릭과 같은 호출에서 먼저 연다
    const title = fWho != null ? `담임 일지 — ${nm(fWho)}` : "담임 일지";
    const sub = [
      fTag && `태그 #${fTag}`,
      fFrom && `${fFrom} 이후`,
      fTo && `${fTo} 이전`,
      kw && `"${kw}" 검색`,
    ]
      .filter(Boolean)
      .join(" · ");
    const rows = shown
      .map(
        (l) =>
          `<div style="border:1px solid #e5e8eb;border-radius:8px;padding:10px 12px;margin:8px 0;page-break-inside:avoid">
<div style="font-size:12px;color:#6b7684;margin-bottom:4px"><b style="color:#111">${esc(fmt(l.at))}</b>${
            l.studentIds.length ? ` · ${esc(l.studentIds.map(nm).join(", "))}` : ""
          }${l.tags.length ? ` · ${esc(l.tags.map((t) => `#${t}`).join(" "))}` : ""}</div>
<div style="font-size:13.5px;line-height:1.7;white-space:pre-wrap">${esc(l.text)}</div></div>`
      )
      .join("");
    openPrintWindow(
      title,
      `<h1 style="font-size:20px;margin:0 0 4px">${esc(title)}</h1>` +
        (sub ? `<p style="font-size:12px;color:#6b7684;margin:0 0 10px">${esc(sub)}</p>` : "") +
        `<p style="font-size:12px;color:#6b7684;margin:0 0 10px">${shown.length}건</p>` +
        (rows || `<p style="color:#6b7684">기록이 없어요.</p>`),
      win
    );
  }

  return (
    <>
      <Card
        title="📔 일지 쓰기"
        desc="오늘 있었던 일을 남겨요. 태그와 학생은 선택이에요 — 본문만 적어도 저장돼요."
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={at}
            max={todayKST()}
            onChange={(e) => setAt(e.target.value)}
            className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          {at !== todayKST() && (
            <span className="text-xs font-bold text-warn">지난 날짜로 기록 중</span>
          )}
        </div>
        <div className="mt-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="예) 쉬는 시간에 ○○와 △△가 다툼. 양쪽 이야기를 따로 듣고 사과로 마무리. 내일 한 번 더 확인할 것."
          />
        </div>

        <p className="mt-3 text-[13px] font-bold text-ink-700">🏷 태그</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(tags ?? []).map((t) => (
            <button
              key={t}
              onClick={() => setPicked((p) => toggle(p, t))}
              className={`press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                picked.includes(t)
                  ? "bg-brand text-white ring-brand"
                  : "bg-white text-ink-700 ring-ink-200"
              }`}
            >
              #{t}
            </button>
          ))}
          <span className="flex items-center gap-1">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void addNewTag();
              }}
              placeholder="새 태그"
              className="w-24 rounded-full border border-dashed border-ink-300 px-3 py-1.5 text-xs"
            />
            {newTag.trim() && (
              <button
                onClick={() => void addNewTag()}
                className="press rounded-full bg-ink-100 px-2.5 py-1.5 text-xs font-bold text-ink-600"
              >
                추가
              </button>
            )}
          </span>
        </div>

        <p className="mt-3 text-[13px] font-bold text-ink-700">🙋 관련 학생</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {active.map((s) => (
            <button
              key={s.id}
              onClick={() => setWho((w) => toggle(w, s.id))}
              className={`press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                who.includes(s.id)
                  ? "bg-violet-500 text-white ring-violet-500"
                  : "bg-white text-ink-700 ring-ink-200"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => void save()}
          disabled={busy || !text.trim()}
          className="press mt-3 rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy ? "저장 중…" : "📔 일지 저장"}
        </button>
      </Card>

      <Card
        title="🔎 일지 모아보기"
        desc="태그·학생·기간·검색어로 거를 수 있어요. 고른 결과를 그대로 인쇄해 상담에 쓰세요."
        action={
          <button
            onClick={print}
            disabled={!shown.length}
            className="press rounded-btn bg-ink-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            🖨 인쇄
          </button>
        }
      >
        {error ? (
          <p className="mt-3 rounded-btn bg-rose-50 px-3 py-2.5 text-[13px] font-bold text-rose-700">
            ⚠️ 일지를 읽지 못했어요 — Firebase 콘솔에 최신 firestore.rules를 게시해 주세요.
          </p>
        ) : null}

        {/* 거르기 칩은 '쓰기' 칩과 같은 화면에 있어 헷갈리기 쉽다 →
            활성 색을 파랑(고르는 중) 대신 먹색(보는 중)으로 분리하고 라벨도 붙인다. */}
        <p className="mt-3 text-[13px] font-bold text-ink-700">🏷 태그로 거르기</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => (
              <button
                key={t}
                onClick={() => setFTag(fTag === t ? "" : t)}
                className={`press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                  fTag === t
                    ? "bg-ink-700 text-white ring-ink-700"
                    : "bg-white text-ink-700 ring-ink-200"
                }`}
              >
                #{t} <span className="tnum opacity-70">{n}</span>
              </button>
            ))}
          {!Object.keys(counts).length && (
            <span className="text-xs text-ink-400">아직 태그가 붙은 기록이 없어요</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={fWho ?? ""}
            onChange={(e) => setFWho(e.target.value ? Number(e.target.value) : null)}
            className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
          >
            <option value="">학생 전체</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.inactive ? " (전출)" : ""}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fFrom}
            onChange={(e) => setFFrom(e.target.value)}
            className="rounded-btn border border-ink-300 px-2 py-2 text-sm"
          />
          <span className="text-xs text-ink-400">~</span>
          <input
            type="date"
            value={fTo}
            onChange={(e) => setFTo(e.target.value)}
            className="rounded-btn border border-ink-300 px-2 py-2 text-sm"
          />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="본문 검색"
            className="min-w-28 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          {filtering && (
            <button
              onClick={() => {
                setFTag(""); setFWho(null); setFFrom(""); setFTo(""); setKw("");
              }}
              className="press rounded-btn bg-ink-100 px-3 py-2 text-xs font-bold text-ink-600"
            >
              필터 해제
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-ink-500">
          {isLoading ? "불러오는 중…" : `${shown.length}건`}
          {filtering && logs ? ` (전체 ${logs.length}건 중)` : ""}
        </p>

        {!isLoading && shown.length === 0 ? (
          <EmptyState
            emoji="📔"
            title={filtering ? "조건에 맞는 기록이 없어요" : "첫 일지를 써보세요"}
            desc={
              filtering
                ? "필터를 풀면 전체 기록이 보여요."
                : "위에 오늘 있었던 일을 적으면 여기에 쌓여요. 선생님만 볼 수 있어요."
            }
          />
        ) : (
          <>
            {/* 게시판 규격 — 한 줄 요약(날짜·제목·칩) 목록, 누르면 모달로 전문 */}
            <ul className="mt-2 divide-y divide-ink-100 border-y border-ink-100">
              {pageItems.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => setSelectedId(l.id)}
                    className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-ink-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {l.tags.map((t) => (
                          <span
                            key={t}
                            className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[10px] font-bold text-brand-strong"
                          >
                            #{t}
                          </span>
                        ))}
                        <b className="truncate text-[15px] text-ink-900">{titleOf(l)}</b>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-600">
                        <span className="tnum shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-700">
                          {fmt(l.at)}
                        </span>
                        {l.studentIds.slice(0, 4).map((id) => (
                          <span
                            key={id}
                            className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700"
                          >
                            {nm(id)}
                          </span>
                        ))}
                        {l.studentIds.length > 4 && (
                          <span className="shrink-0 text-[11px]">외 {l.studentIds.length - 4}명</span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-ink-300">›</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {[10, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPageSize(n)}
                    className={`press rounded-btn px-3 py-1 text-xs font-bold ${
                      pageSize === n ? "bg-ink-700 text-white" : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {n}개
                  </button>
                ))}
              </div>
              <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>
            {logs && logs.length >= take && (
              <button
                onClick={() => setTake((t) => t + LOG_PAGE)}
                className="press mt-3 w-full rounded-btn bg-ink-100 px-4 py-2 text-sm font-bold text-ink-600"
              >
                예전 기록 더 불러오기 (지금 {take}건까지 받았어요)
              </button>
            )}
          </>
        )}

        <p className="mt-2 text-[11px] text-ink-400">
          🔒 일지는 <b>선생님만</b> 볼 수 있어요 — 학생 계정에는 이 기록이 보이지 않습니다.
        </p>
      </Card>

      {/* 상세 — 게시판처럼 목록 위 모달로 (목록 스크롤·페이지 상태 유지) */}
      {selected &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-2 sm:p-6"
            onClick={() => setSelectedId(null)}
          >
            <div
              className="rise flex max-h-[94vh] w-full max-w-3xl flex-col overflow-y-auto rounded-card bg-white p-4 shadow-card sm:max-h-[92vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="tnum rounded bg-ink-100 px-1.5 py-0.5 text-xs font-bold text-ink-700">
                    {fmt(selected.at)}
                  </span>
                  {selected.studentIds.map((id) => (
                    <span
                      key={id}
                      className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-700"
                    >
                      {nm(id)}
                    </span>
                  ))}
                  {selected.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-brand-weak px-1.5 py-0.5 text-xs font-bold text-brand-strong"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="press shrink-0 rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600"
                >
                  ✕ 닫기
                </button>
              </div>

              {editing === selected.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={8} />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await updateLog(selected.id, { text: editText });
                          setEditing(null);
                          toast("수정했어요.", "success");
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "수정 실패", "error");
                        }
                      }}
                      className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="press rounded-btn border border-ink-200 px-4 py-2 text-sm text-ink-500"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 whitespace-pre-wrap break-words text-base leading-8 text-ink-800">
                    {selected.text}
                  </p>
                  <div className="mt-4 flex gap-2 border-t border-ink-100 pt-3 text-xs">
                    <button
                      onClick={() => {
                        setEditing(selected.id);
                        setEditText(selected.text);
                      }}
                      className="text-brand hover:opacity-80"
                    >
                      ✏️ 수정
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: "이 일지를 삭제할까요?",
                          body: "되돌릴 수 없어요.",
                          confirmLabel: "삭제",
                          danger: true,
                        });
                        if (!ok) return;
                        await delLog(selected.id)
                          .then(() => {
                            setSelectedId(null);
                            toast("삭제했어요.");
                          })
                          .catch((e) =>
                            toast(e instanceof Error ? e.message : "삭제 실패", "error")
                          );
                      }}
                      className="text-danger hover:opacity-80"
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
