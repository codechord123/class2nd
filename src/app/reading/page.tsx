"use client";
// 거북이 독서 — 2학기 기록은 Phase 4. 지금은 1학기 기록(정적 JSON) 조회 제공.
// 313KB 백업은 동적 import — 이 탭에 들어올 때만 로드된다 (첫 화면 무부담).
import { useQuery } from "@tanstack/react-query";
import { loadS1TurtleReading, s1BooksReadOf } from "@/lib/staticData";
import { students } from "@/lib/roster";

export default function ReadingPage() {
  const { data: turtle, isLoading } = useQuery({
    queryKey: ["s1-turtle"],
    queryFn: loadS1TurtleReading,
    staleTime: Infinity, // 정적 데이터 — 재조회 불필요
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">🐢 거북이 독서</h2>
        <p className="mt-1 text-sm text-slate-500">
          2학기 기록(주 3권 의무·순위 캐러셀)은 개학 후 열립니다. 아래는 1학기 기록이에요.
        </p>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
        <h3 className="font-bold">📚 1학기 읽은 책 (최종)</h3>
        {isLoading && <p className="mt-2 text-sm text-slate-400">불러오는 중…</p>}
        {turtle && (
          <>
            <p className="mt-1 text-xs text-slate-500">
              감상문 {turtle.readingReports.length}건 백업 · GitHub 정적 파일 (Firebase 읽기
              0회)
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {students.map((s) => {
                const n = s1BooksReadOf(turtle, s.id);
                return (
                  <li key={s.id} className="flex justify-between border-b border-emerald-100 py-1">
                    <span>{s.name}</span>
                    <b className={n > 0 ? "text-emerald-700" : "text-slate-300"}>{n}권</b>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
