"use client";
// 거북이 독서 — 주 3권(설정값) 의무, 미달 경고, 순위 캐러셀, 감상문 작성.
// 1학기 기록은 정적 JSON(합산 검증 완료), 2학기 기록은 Firestore.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/stores/session";
import { students, studentById } from "@/lib/roster";
import { loadS1TurtleReading, s1BooksReadOf } from "@/lib/staticData";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import {
  useReadingStats,
  useRecentReports,
  usePostReport,
} from "@/lib/query/reading";
import ReadingAlert from "@/components/reading/ReadingAlert";
import RankCarousel from "@/components/reading/RankCarousel";

export default function ReadingPage() {
  const { studentId } = useSession();
  const week = weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);

  const { data: stats } = useReadingStats();
  const [pages, setPages] = useState(1);
  const { data: reports } = useRecentReports(pages);
  const postReport = usePostReport(studentId, week);

  const [showS1, setShowS1] = useState(false);
  const [s1Student, setS1Student] = useState<number | null>(null);
  const { data: turtle } = useQuery({
    queryKey: ["s1-turtle"],
    queryFn: loadS1TurtleReading,
    staleTime: Infinity,
    enabled: showS1, // 1학기 백업(313KB)은 펼칠 때만 로드
  });

  const [form, setForm] = useState({ title: "", author: "", thoughts: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      await postReport(form);
      setForm({ title: "", author: "", thoughts: "" });
      setMsg("✅ 감상문이 등록되었어요! +1권");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "등록에 실패했어요."}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 짜파게티 배너 + 미달 경고 — 항상 상단 */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-5 text-white shadow">
        <p className="text-sm font-medium opacity-90">🐢 거북이 독서 최종 미션</p>
        <p className="mt-1 text-2xl font-extrabold">🍜 짜파게티 파티까지 달린다!</p>
      </div>
      <ReadingAlert />

      {/* 움직이는 순위 캐러셀 */}
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h3 className="text-sm font-bold text-amber-800">🏁 2학기 독서 순위</h3>
        <div className="mt-2">
          <RankCarousel totals={stats?.total ?? {}} />
        </div>
      </section>

      {/* 감상문 작성 */}
      {studentId && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold">✍️ 감상문 쓰기 ({week}주차)</h3>
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
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
            </div>
            <textarea
              value={form.thoughts}
              onChange={(e) => setForm({ ...form, thoughts: e.target.value })}
              placeholder="읽고 나서 든 생각과 느낌을 적어보세요"
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "등록 중…" : "등록하기 (+1권)"}
              </button>
              {msg && <span className="text-sm">{msg}</span>}
            </div>
          </div>
        </section>
      )}

      {/* 최근 감상문 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold">📖 친구들의 감상문</h3>
        {!reports?.length && (
          <p className="mt-2 text-sm text-slate-400">아직 감상문이 없어요. 첫 번째 주인공이 되어보세요!</p>
        )}
        <ul className="mt-3 space-y-3">
          {reports?.map((r) => (
            <li key={r.id} className="rounded-lg bg-slate-50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <b className="text-sm">{r.title}</b>
                <span className="text-xs text-slate-400">
                  {studentById.get(r.studentId)?.name} · {r.week}주차
                </span>
              </div>
              {r.author && <p className="text-xs text-slate-400">{r.author}</p>}
              {r.thoughts && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{r.thoughts}</p>
              )}
            </li>
          ))}
        </ul>
        {reports && reports.length >= pages * 10 && (
          <button
            onClick={() => setPages((p) => p + 1)}
            className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            더 보기
          </button>
        )}
      </section>

      {/* 1학기 기록 (정적, 접기) */}
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
        <button
          onClick={() => setShowS1((v) => !v)}
          className="flex w-full items-center justify-between font-bold"
        >
          <span>📚 1학기 읽은 책 (최종)</span>
          <span className="text-sm text-slate-400">{showS1 ? "접기 ▲" : "펼치기 ▼"}</span>
        </button>
        {showS1 && !turtle && <p className="mt-2 text-sm text-slate-400">불러오는 중…</p>}
        {showS1 && turtle && (
          <>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {students.map((s) => {
                const n = s1BooksReadOf(turtle, s.id);
                return (
                  <li
                    key={s.id}
                    className="flex justify-between border-b border-emerald-100 py-1"
                  >
                    <button
                      onClick={() => setS1Student(s1Student === s.id ? null : s.id)}
                      className={`hover:underline ${s1Student === s.id ? "font-bold text-emerald-700" : ""}`}
                    >
                      {s.name}
                    </button>
                    <b className={n > 0 ? "text-emerald-700" : "text-slate-300"}>{n}권</b>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-slate-400">
              이름을 누르면 그 친구의 1학기 감상문 전문을 볼 수 있어요. (감상문{" "}
              {turtle.readingReports.length}건 보관 중)
            </p>
            {s1Student != null && (
              <div className="mt-3 space-y-3">
                <h4 className="text-sm font-bold text-emerald-800">
                  ✍️ {studentById.get(s1Student)?.name}의 1학기 감상문
                </h4>
                {turtle.readingReports.filter((r) => r.studentId === s1Student).length === 0 && (
                  <p className="text-sm text-slate-400">
                    보관된 감상문이 없어요. (권수는 선생님 수동 기록 포함이라 감상문 수와 다를
                    수 있어요)
                  </p>
                )}
                {turtle.readingReports
                  .filter((r) => r.studentId === s1Student)
                  .map((r) => (
                    <article key={r.docId} className="rounded-lg bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-1">
                        <b className="text-sm">{r.title}</b>
                        <span className="text-xs text-slate-400">{r.date}</span>
                      </div>
                      {(r.author || r.publisher) && (
                        <p className="text-xs text-slate-400">
                          {r.author}
                          {r.publisher && ` · ${r.publisher}`}
                        </p>
                      )}
                      {r.summary && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                          <b className="text-xs text-emerald-600">줄거리</b>
                          <br />
                          {r.summary}
                        </p>
                      )}
                      {r.thoughts && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                          <b className="text-xs text-emerald-600">느낀 점</b>
                          <br />
                          {r.thoughts}
                        </p>
                      )}
                      {r.scene && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                          <b className="text-xs text-emerald-600">인상 깊은 장면</b>
                          <br />
                          {r.scene}
                        </p>
                      )}
                      {r.quote && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500 italic">
                          “{r.quote}”
                        </p>
                      )}
                    </article>
                  ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
