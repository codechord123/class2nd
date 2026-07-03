"use client";
// 1학기 거북이 독서 기록 보관함 — 감상문 125건 전체 열람 + 검색 + 학생 필터.
// 313KB 백업은 펼칠 때만 동적 로드 (첫 화면 무부담).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadS1TurtleReading, s1BooksReadOf } from "@/lib/staticData";
import { students, studentById } from "@/lib/roster";
import type { S1ReadingReport } from "@/types";

function ReportCard({ r }: { r: S1ReadingReport }) {
  return (
    <article className="rounded-lg bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <b className="text-sm">
          {r.title}
          {(r as S1ReadingReport & { isDraft?: boolean }).isDraft && (
            <span className="ml-1.5 text-[10px] font-normal text-amber-500">임시저장</span>
          )}
        </b>
        <span className="text-xs text-ink-400">
          {studentById.get(r.studentId)?.name ?? r.studentName} · {r.date}
        </span>
      </div>
      {(r.author || r.publisher) && (
        <p className="text-xs text-ink-400">
          {r.author}
          {r.publisher && ` · ${r.publisher}`}
        </p>
      )}
      {r.summary && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">
          <b className="text-xs text-emerald-600">줄거리</b>
          <br />
          {r.summary}
        </p>
      )}
      {r.thoughts && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">
          <b className="text-xs text-emerald-600">느낀 점</b>
          <br />
          {r.thoughts}
        </p>
      )}
      {r.scene && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">
          <b className="text-xs text-emerald-600">인상 깊은 장면</b>
          <br />
          {r.scene}
        </p>
      )}
      {r.quote && (
        <p className="mt-2 whitespace-pre-wrap text-sm italic text-ink-500">“{r.quote}”</p>
      )}
    </article>
  );
}

export default function S1Archive() {
  const [open, setOpen] = useState(false);
  const [filterId, setFilterId] = useState<number | 0>(0); // 0 = 전체
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(10);

  const { data: turtle } = useQuery({
    queryKey: ["s1-turtle"],
    queryFn: loadS1TurtleReading,
    staleTime: Infinity,
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!turtle) return [];
    const kw = search.trim().toLowerCase();
    return turtle.readingReports
      .filter((r) => (filterId === 0 ? true : r.studentId === filterId))
      .filter((r) => {
        if (!kw) return true;
        const hay =
          `${r.title} ${r.author} ${r.publisher} ${r.summary} ${r.thoughts} ${r.scene} ${r.quote} ${studentById.get(r.studentId)?.name ?? ""}`.toLowerCase();
        return hay.includes(kw);
      })
      .sort((a, b) => b.id - a.id);
  }, [turtle, filterId, search]);

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-bold"
      >
        <span>📚 1학기 거북이 독서 기록 (권수 + 감상문 전체)</span>
        <span className="text-sm text-ink-400">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>

      {open && !turtle && <p className="mt-2 text-sm text-ink-400">불러오는 중…</p>}
      {open && turtle && (
        <>
          {/* 권수 표 */}
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {students.map((s) => {
              const n = s1BooksReadOf(turtle, s.id);
              return (
                <li key={s.id} className="flex justify-between border-b border-emerald-100 py-1">
                  <button
                    onClick={() => {
                      setFilterId(filterId === s.id ? 0 : s.id);
                      setShown(10);
                    }}
                    className={`hover:underline ${filterId === s.id ? "font-bold text-emerald-700" : ""}`}
                  >
                    {s.name}
                  </button>
                  <b className={n > 0 ? "text-emerald-700" : "text-ink-300"}>{n}권</b>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-ink-400">
            ※ 권수에는 선생님이 수동으로 인정해준 책도 포함되어 감상문 수와 다를 수 있어요.
          </p>

          {/* 감상문 전체 열람 + 검색 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              value={filterId}
              onChange={(e) => {
                setFilterId(Number(e.target.value));
                setShown(10);
              }}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
            >
              <option value={0}>전체 학생</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(10);
              }}
              placeholder="🔍 제목·지은이·내용·이름 검색"
              className="min-w-40 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
            />
            <span className="text-xs text-ink-500">{filtered.length}건</span>
          </div>
          {filterId !== 0 &&
            (() => {
              const reportCount = turtle.readingReports.filter(
                (r) => r.studentId === filterId
              ).length;
              const total = s1BooksReadOf(turtle, filterId);
              const manual = total - reportCount;
              return (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-ink-500">
                  📖 {studentById.get(filterId)?.name}: 총 <b>{total}권</b> = 감상문{" "}
                  <b>{reportCount}건</b>
                  {manual > 0 && (
                    <>
                      {" "}
                      + 감상문 없이 선생님이 인정해준 <b>{manual}권</b> (종이 제출 등 —
                      시스템에 감상문 원문이 없어요)
                    </>
                  )}
                </p>
              );
            })()}

          <div className="mt-3 space-y-3">
            {filtered.slice(0, shown).map((r) => (
              <ReportCard key={r.docId} r={r} />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-ink-400">조건에 맞는 감상문이 없어요.</p>
            )}
          </div>
          {filtered.length > shown && (
            <button
              onClick={() => setShown((n) => n + 10)}
              className="mt-3 w-full rounded-lg border border-emerald-200 bg-white py-2 text-sm text-ink-500 hover:bg-emerald-50"
            >
              더 보기 ({shown}/{filtered.length})
            </button>
          )}
        </>
      )}
    </section>
  );
}
