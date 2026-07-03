"use client";
// 거북이 독서 — 주 3권(설정값) 의무, 미달 경고, 순위 캐러셀, 감상문 작성.
// 1학기 기록은 정적 JSON(합산 검증 완료), 2학기 기록은 Firestore.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import {
  useReadingStats,
  useRecentReports,
  useSaveReport,
  reportBodyLength,
  type ReportForm,
} from "@/lib/query/reading";
import { useSettings } from "@/lib/query/settings";
import ReadingAlert from "@/components/reading/ReadingAlert";
import RankCarousel from "@/components/reading/RankCarousel";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import S1Archive from "@/components/reading/S1Archive";

export default function ReadingPage() {
  const { studentId } = useSession();
  const week = weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);

  const { data: stats } = useReadingStats();
  const { data: settings } = useSettings();
  const [pages, setPages] = useState(1);
  const { data: reports } = useRecentReports(pages);
  const saveReport = useSaveReport(studentId, week);

  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ReportForm>({ title: "", author: "", publisher: "", summary: "", scene: "", quote: "", thoughts: "" });
  const [editId, setEditId] = useState<string | undefined>();
  const [wasDraft, setWasDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const charLimit = settings?.readingCharLimit ?? 700;
  const bodyLen = reportBodyLength(form);

  function resetForm() {
    setForm({ title: "", author: "", publisher: "", summary: "", scene: "", quote: "", thoughts: "" });
    setEditId(undefined);
    setWasDraft(false);
  }

  async function submit(draft: boolean) {
    setBusy(true);
    setMsg("");
    try {
      if (!draft && bodyLen < charLimit)
        throw new Error(`본문은 ${charLimit}자 이상이어야 정식 등록할 수 있어요. (현재 ${bodyLen}자) 🐢`);
      const id = await saveReport(form, { draft, editId, wasDraft });
      if (draft) {
        setEditId(id);
        setWasDraft(true);
        setMsg("💾 임시저장 완료! 나중에 이어서 쓸 수 있어요.");
      } else {
        resetForm();
        setMsg("✅ 감상문이 정식 등록되었어요! +1권");
      }
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "저장에 실패했어요."}`);
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

      <TurtleMarathon />

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
          <h3 className="font-bold">
            ✍️ 감상문 쓰기 ({week}주차){editId && wasDraft && " — 임시저장 이어쓰기"}
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
            <p
              className={`text-right text-xs font-bold ${bodyLen >= charLimit ? "text-emerald-600" : "text-red-500"}`}
            >
              본문 {bodyLen} / {charLimit}자 {bodyLen >= charLimit ? "— 정식 등록 가능! ✅" : "(줄거리+장면+인용+느낀점 합산)"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void submit(false)}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "저장 중…" : "정식 등록 (+1권)"}
              </button>
              <button
                onClick={() => void submit(true)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                💾 임시저장
              </button>
              {editId && (
                <button onClick={resetForm} className="text-xs text-slate-400 underline">
                  새로 쓰기
                </button>
              )}
            </div>
            {msg && <p className="text-sm">{msg}</p>}
          </div>
        </section>
      )}

      {/* 최근 감상문 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">📖 친구들의 감상문</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 제목·내용·이름 검색"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
        {!reports?.length && (
          <p className="mt-2 text-sm text-slate-400">아직 감상문이 없어요. 첫 번째 주인공이 되어보세요!</p>
        )}
        {/* 내 임시저장 (본인에게만) */}
        {(reports ?? []).some((r) => r.isDraft && r.studentId === studentId) && (
          <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3">
            <p className="text-xs font-bold text-amber-700">💾 내 임시저장</p>
            <ul className="mt-1 space-y-1 text-sm">
              {(reports ?? [])
                .filter((r) => r.isDraft && r.studentId === studentId)
                .map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.title}</span>
                    <button
                      onClick={() => {
                        setForm({
                          title: r.title,
                          author: r.author ?? "",
                          publisher: r.publisher ?? "",
                          summary: r.summary ?? "",
                          scene: r.scene ?? "",
                          quote: r.quote ?? "",
                          thoughts: r.thoughts ?? "",
                        });
                        setEditId(r.id);
                        setWasDraft(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-xs text-amber-600 underline"
                    >
                      이어쓰기
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
        <ul className="mt-3 space-y-3">
          {reports
            ?.filter((r) => !r.isDraft)
            .filter((r) => {
              const kw = search.trim().toLowerCase();
              if (!kw) return true;
              const hay = `${r.title} ${r.author} ${r.summary} ${r.thoughts} ${studentById.get(r.studentId)?.name ?? ""}`.toLowerCase();
              return hay.includes(kw);
            })
            .map((r) => (
              <li key={r.id} className="rounded-lg bg-slate-50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <b className="text-sm">{r.title}</b>
                  <span className="text-xs text-slate-400">
                    {studentById.get(r.studentId)?.name} · {r.week}주차
                  </span>
                </div>
                {(r.author || r.publisher) && (
                  <p className="text-xs text-slate-400">
                    {r.author}
                    {r.publisher && ` · ${r.publisher}`}
                  </p>
                )}
                {r.summary && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{r.summary}</p>
                )}
                {r.scene && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">🎬 {r.scene}</p>
                )}
                {r.quote && (
                  <p className="mt-1 whitespace-pre-wrap text-sm italic text-slate-500">
                    “{r.quote}”
                  </p>
                )}
                {r.thoughts && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">💭 {r.thoughts}</p>
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

      <S1Archive />

    </div>
  );
}
