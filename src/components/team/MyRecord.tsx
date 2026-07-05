"use client";
// 내 기록 — "내가 어떻게 하고 있는지 한 곳에서" (학생 페르소나 1건).
// 이미 캐시되는 문서만 재사용: 누적 점수 문서(점수·MVP·득표) + readingStats(주별 권수).
import { useReadingStats } from "@/lib/query/reading";
import { s1BooksOf } from "@/lib/staticData";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { weekBooks } from "@/lib/readingStreak";

export default function MyRecord({
  studentId,
  cumScores,
}: {
  studentId: number;
  cumScores: Record<string, unknown> | null | undefined;
}) {
  const { data: stats } = useReadingStats();
  const cum = (cumScores ?? {}) as {
    mvpWins?: Record<string, number>;
    mvpVotesTotal?: Record<string, number>;
  } & Record<string, unknown>;
  const sid = String(studentId);
  const score = typeof cum[sid] === "number" ? (cum[sid] as number) : 0;
  const mvpWins = cum.mvpWins?.[sid] ?? 0;
  const bossVotes = cum.mvpVotesTotal?.[sid] ?? 0;
  const totalBooks = s1BooksOf(stats, studentId) + (stats?.total?.[sid] ?? 0);

  const curWeek = weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);
  const weeks = Array.from({ length: curWeek }, (_, i) => i + 1);
  const perWeek = weeks.map((w) => weekBooks(stats, studentId, w));
  const maxW = Math.max(1, ...perWeek);
  const hasAny = score !== 0 || totalBooks > 0 || mvpWins > 0 || bossVotes > 0;

  const tiles = [
    { label: "🏅 누적 점수", value: score, cls: "bg-brand-weak text-brand-strong" },
    { label: "🐢 총 권수 (1+2학기)", value: totalBooks, cls: "bg-success-weak text-success" },
    { label: "⭐ MVP 횟수", value: mvpWins, cls: "bg-warn-weak text-warn" },
    { label: "👑 부서장 득표", value: bossVotes, cls: "bg-ink-50 text-ink-900" },
  ];

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h3 className="text-lg font-bold">📒 내 기록</h3>
      {!hasAny ? (
        <p className="mt-2 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          아직 기록이 없어요 — 오늘 평가와 독서로 첫 기록을 남겨보세요!
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-btn px-1.5 py-2.5 text-center ${t.cls}`}>
                <p className="text-[10px] leading-tight text-ink-600">{t.label}</p>
                <p className="tnum mt-0.5 text-xl font-extrabold leading-tight">{t.value}</p>
              </div>
            ))}
          </div>

          {/* 주별 독서 막대 — byWeek 재사용, 이번 주는 파랑 강조 */}
          <p className="mt-3 text-xs font-bold text-ink-600">📖 주별 독서 권수</p>
          <div className="mt-1.5 flex items-end gap-1 overflow-x-auto pb-1">
            {weeks.map((w, i) => (
              <div key={w} className="flex w-7 shrink-0 flex-col items-center gap-0.5">
                <span className="tnum text-[10px] leading-none text-ink-500">
                  {perWeek[i] > 0 ? perWeek[i] : ""}
                </span>
                <div
                  className={`w-full rounded-t ${
                    w === curWeek ? "bg-brand" : perWeek[i] > 0 ? "bg-emerald-400" : "bg-ink-100"
                  }`}
                  style={{ height: `${Math.max((perWeek[i] / maxW) * 48, 3)}px` }}
                />
                <span className="tnum text-[9px] leading-none text-ink-400">{w}주</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
