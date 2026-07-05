"use client";
// 📕 감상문 모음집(출판용) — 학생 한 명의 1·2학기 감상문 전체를 책 레이아웃으로.
// 30권 넘은 아이들 감상문을 모아 실제 책으로 출판하려는 계획 대비 기능.
// 읽기 예산: 버튼을 누른 학생 것만 그때 쿼리 1회 + 1학기 정적 백업(동적 import).
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import { s1BooksOf, loadS1TurtleReading } from "@/lib/staticData";
import { useReadingStats } from "@/lib/query/reading";
import {
  fetchStudentReports,
  openBooklet,
  s2ReportToEntry,
  type BookletEntry,
} from "@/lib/booklet";
import { useFeedback } from "@/components/ui/Feedback";

export default function BookletExportPanel() {
  const [busy, setBusy] = useState<number | null>(null);
  const { data: stats } = useReadingStats();
  const { toast } = useFeedback();

  // 합산 권수 내림차순 — 출판 대상(30권+)이 맨 앞에 오게
  const rows = students
    .map((s) => {
      const s1 = s1BooksOf(stats, s.id);
      const s2 = stats?.total?.[String(s.id)] ?? 0;
      return { ...s, s1, s2, total: s1 + s2 };
    })
    .sort((a, b) => b.total - a.total);

  async function print(sid: number) {
    if (busy != null) return;
    setBusy(sid);
    try {
      const [s2Reports, turtle] = await Promise.all([
        fetchStudentReports(sid),
        loadS1TurtleReading(),
      ]);
      // 1학기 감상문 (초안 제외, 작성순) — 정적 백업에서
      const s1Entries: BookletEntry[] = turtle.readingReports
        .filter((r) => r.studentId === sid && !(r as { isDraft?: boolean }).isDraft)
        .sort((a, b) => Number(a.docId.split("_")[0] || 0) - Number(b.docId.split("_")[0] || 0))
        .map((r) => ({
          title: r.title, author: r.author, publisher: r.publisher,
          // "6월 11일 오후 10:13" → "1학기 · 6월 11일"
          dateStr: `1학기 · ${r.date.split(" ").slice(0, 2).join(" ")}`,
          summary: r.summary, scene: r.scene, quote: r.quote, thoughts: r.thoughts,
        }));
      const entries = [...s1Entries, ...s2Reports.map(s2ReportToEntry)];
      if (!entries.length) {
        toast("아직 쓴 감상문이 없어요.", "warn");
        return;
      }
      openBooklet(studentById.get(sid)?.name ?? "?", entries, {
        s1: s1Entries.length,
        s2: s2Reports.length,
        totalBooks: s1BooksOf(stats, sid) + (stats?.total?.[String(sid)] ?? 0),
      });
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "불러오기 실패"}`, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">📕 감상문 모음집 (출판용)</h2>
      <p className="mt-1 text-xs text-ink-600">
        학생을 누르면 <b>1·2학기 감상문 전체</b>가 표지·차례·본문을 갖춘 책 레이아웃으로 열려요 —
        인쇄하거나 PDF로 저장해 출판 원고로 쓸 수 있어요. 🏆는 합산 30권 이상,
        🔒 비공개 글도 본인 책에는 포함돼요.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => void print(r.id)}
            disabled={busy != null}
            className={`press rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              r.total >= 30
                ? "border-amber-300 bg-amber-50 font-bold text-amber-800"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-400"
            }`}
          >
            {r.total >= 30 && "🏆 "}
            {r.name}
            <span className="tnum ml-1 text-xs text-ink-400">
              {busy === r.id ? "여는 중…" : `${r.total}권`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
