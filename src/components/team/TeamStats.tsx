"use client";
// 통계 (요구사항 v2 §3~5): 누적 점수 / MVP 득표·선정 / 오늘의 모둠 1등 의장 횟수.
// 데이터 출처는 문서 2개(_cumulative + bestGroups)뿐 — 추가 읽기 없음.
import { students, studentById } from "@/lib/roster";
import type { BestGroups } from "@/lib/query/classMeta";

interface CumDoc {
  [sid: string]: number | Record<string, number> | undefined;
  mvpWins?: Record<string, number>;
  mvpVotesTotal?: Record<string, number>;
}

function TopList({
  title,
  counts,
  unit,
}: {
  title: string;
  counts: Record<string, number>;
  unit: string;
}) {
  const ranked = students
    .map((s) => ({ name: s.name, n: counts[String(s.id)] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{title}</p>
      {ranked.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">아직 기록이 없어요</p>
      ) : (
        <ol className="mt-1 space-y-0.5 text-sm">
          {ranked.map((x, i) => (
            <li key={x.name} className="flex justify-between">
              <span>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {x.name}
              </span>
              <b>
                {x.n}
                {unit}
              </b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function TeamStats({
  cumScores,
  bestGroups,
}: {
  cumScores: Record<string, unknown> | null | undefined;
  bestGroups: BestGroups | undefined;
}) {
  const cum = (cumScores ?? {}) as CumDoc;

  // 누적 점수 (숫자 필드만)
  const totals: Record<string, number> = {};
  for (const s of students) {
    const v = cum[String(s.id)];
    if (typeof v === "number") totals[String(s.id)] = v;
  }

  // 오늘의 모둠: 의장별 1등 횟수 ("1등 홍길동 3회")
  const chairWins: Record<string, number> = {};
  for (const v of Object.values(bestGroups ?? {})) {
    chairWins[String(v.chairId)] = (chairWins[String(v.chairId)] ?? 0) + 1;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold">📈 우리 반 통계</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TopList title="🏅 누적 점수 TOP 5" counts={totals} unit="점" />
        <TopList title="⭐ MVP 선정 횟수" counts={cum.mvpWins ?? {}} unit="회" />
        <TopList title="🗳️ MVP 득표 누적" counts={cum.mvpVotesTotal ?? {}} unit="표" />
        <TopList title="👑 오늘의 모둠 이끈 의장" counts={chairWins} unit="회" />
      </div>
      {Object.keys(bestGroups ?? {}).length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          최근 오늘의 모둠:{" "}
          {Object.entries(bestGroups!)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 5)
            .map(
              ([d, v]) =>
                `${d.slice(5)} ${v.groupId}모둠(${studentById.get(v.chairId)?.name ?? "?"})`
            )
            .join(" · ")}
        </p>
      )}
    </section>
  );
}
