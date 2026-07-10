"use client";
// 내 기록 — "내가 어떻게 하고 있는지 한 곳에서" (학생 페르소나 1건).
// 이미 캐시되는 문서만 재사용: 누적 점수 문서(점수·MVP·득표) + readingStats(주별 권수)
// + 최근 집계일 문서(점수 출처 분해 — Team 탭과 캐시 공유, 추가 읽기 0).
import { useState } from "react";
import { useReadingStats } from "@/lib/query/reading";
import { useDailyScores, useLatestAggregated, useRangeReport } from "@/lib/query/evaluation";
import { useSettings } from "@/lib/query/settings";
import { s1BooksOf } from "@/lib/staticData";
import { shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { periodOfWeek, dateRangeOfPeriod } from "@/lib/aggregate";
import { weekBooks, readingStreaks } from "@/lib/readingStreak";
import type { DailyScoreRow } from "@/types";

export default function MyRecord({
  studentId,
  cumScores,
}: {
  studentId: number;
  cumScores: Record<string, unknown> | null | undefined;
}) {
  const { data: stats } = useReadingStats();
  const { data: settings } = useSettings();
  const today = todayKST();
  // Team 탭이 이미 캐시하는 두 문서 재사용 (추가 읽기 0):
  // 오늘 집계가 있으면 오늘 것을, 없으면(아침 등) 최근 집계일 것을 보여준다.
  const { data: todayScores } = useDailyScores(today);
  const { data: latestAgg } = useLatestAggregated(shiftDate(today, -1), true);
  const cum = (cumScores ?? {}) as {
    mvpWins?: Record<string, number>;
    mvpVotesTotal?: Record<string, number>;
    compStreak?: Record<string, number>;
  } & Record<string, unknown>;
  const sid = String(studentId);
  const score = typeof cum[sid] === "number" ? (cum[sid] as number) : 0;
  const mvpWins = cum.mvpWins?.[sid] ?? 0;
  const bossVotes = cum.mvpVotesTotal?.[sid] ?? 0;
  const totalBooks = s1BooksOf(stats, studentId) + (stats?.total?.[sid] ?? 0);

  const curWeek = weekOfDate(today, SEMESTER_START, TOTAL_WEEKS);
  const weeks = Array.from({ length: curWeek }, (_, i) => i + 1);
  const perWeek = weeks.map((w) => weekBooks(stats, studentId, w));
  const maxW = Math.max(1, ...perWeek);
  const hasAny = score !== 0 || totalBooks > 0 || mvpWins > 0 || bossVotes > 0;

  // 일간 / 세션 / 누적 보기 (사용자 요청). 세션은 눌렀을 때만 로드 — 읽기 예산 보호.
  const [view, setView] = useState<"daily" | "session" | "cumulative">("daily");
  const period = periodOfWeek(Math.max(curWeek, 1));
  const [sStart, sEndRaw] = dateRangeOfPeriod(period);
  const sessionEnd = today < sEndRaw ? today : sEndRaw;
  const { data: sessionReport } = useRangeReport(sStart, sessionEnd, view === "session" && hasAny);
  const sessionTotal = sessionReport?.totals?.[sid] ?? 0;
  // 누적 점수 출처 — 항목별 저장이 없어 집계일 전체를 합산. 읽기 예산 위해 '보기' 눌렀을 때만 로드.
  const [showCumSource, setShowCumSource] = useState(false);
  const { data: cumReport } = useRangeReport("2026-03-01", today, view === "cumulative" && showCumSource);
  const cumCat = cumReport?.sumByCat?.[sid] ?? {};
  // 항목별 라벨 (일간·누적 공용)
  const CAT_LABELS = [
    { key: "peer", icon: "🤝", label: "부서장 평가" },
    { key: "groupRank", icon: "🏆", label: "모둠 순위" },
    { key: "mission", icon: "🎯", label: "칭찬 미션" },
    { key: "comp", icon: "💌", label: "칭찬하기" },
    { key: "boss", icon: "🙌", label: "오늘의 부서장" },
    { key: "mvp", icon: "⭐", label: "MVP" },
    { key: "best", icon: "👑", label: "오늘의 모둠" },
    { key: "read", icon: "🐢", label: "독서" },
    { key: "bonus", icon: "🎁", label: "선생님 보너스" },
  ] as const;

  // ── 점수 출처 분해 — "내 점수가 어디서 왔는지" (사용자 요청) ──
  // 집계일의 내 행(dailyScores/{date})을 항목별로 풀어서 보여준다.
  const todayRow = (todayScores as Record<string, unknown> | null | undefined)?.[sid] as
    | DailyScoreRow
    | undefined;
  const myRow = todayRow ?? (latestAgg?.rows?.[sid] as DailyScoreRow | undefined);
  const aggDate = todayRow ? today : latestAgg?.date;
  const parts = myRow
    ? [
        { icon: "🤝", label: "부서장 평가", v: myRow.peer ?? 0 },
        { icon: "🏆", label: "모둠 순위", v: myRow.groupRank ?? 0 },
        { icon: "🎯", label: "칭찬 미션", v: myRow.mission ?? 0 },
        { icon: "💌", label: "칭찬하기", v: myRow.comp ?? 0 },
        { icon: "🙌", label: "오늘의 부서장", v: myRow.boss ?? 0 },
        { icon: "⭐", label: "MVP", v: myRow.mvp ?? 0 },
        { icon: "👑", label: "오늘의 모둠", v: myRow.best ?? 0 },
        { icon: "🐢", label: "독서", v: myRow.read ?? 0 },
        { icon: "🎁", label: "선생님 보너스", v: myRow.bonus ?? 0 },
      ]
    : [];
  // 스트릭 현황 — 칭찬 연속(매일 칭찬 보내기) + 독서 연속(주간 목표 달성)
  const quota = settings?.weeklyReadingQuota ?? 3;
  const compStreak = cum.compStreak?.[sid] ?? 0;
  const vacation = today < SEMESTER_START;
  const readStreak = vacation ? 0 : readingStreaks(stats, studentId, quota, curWeek).current;
  const fmtDay = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

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
          {/* 일간 / 세션 / 누적 보기 토글 (사용자 요청) */}
          <div className="mt-3 flex gap-1 rounded-btn bg-ink-100 p-0.5 text-xs font-bold">
            {([
              { k: "daily", l: "📅 일간" },
              { k: "session", l: "🗓️ 세션" },
              { k: "cumulative", l: "🏅 누적" },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`press flex-1 rounded-btn py-1.5 ${
                  view === t.k ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>

          {/* 📅 일간 — 최근 집계일 점수 출처 분해 */}
          {view === "daily" &&
            (myRow && aggDate ? (
              <div className="mt-3 rounded-btn bg-ink-50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <p className="text-xs font-bold text-ink-700">🔍 내 점수, 어디서 왔을까?</p>
                  <span className="text-[10px] text-ink-400">최근 집계일 {fmtDay(aggDate)} 기준</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parts.map((p) => (
                    <span
                      key={p.label}
                      className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                        p.v > 0
                          ? "bg-brand-weak text-brand-strong"
                          : p.v < 0
                            ? "bg-danger-weak text-danger"
                            : "bg-white text-ink-400"
                      }`}
                    >
                      {p.icon} {p.label} <b className="tnum">{p.v > 0 ? `+${p.v}` : p.v}</b>
                    </span>
                  ))}
                  <span className="rounded-full bg-ink-900 px-2 py-1 text-[11px] font-bold text-white">
                    = 그날 합계 <b className="tnum">{myRow.total ?? 0}</b>점
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink-200/60 pt-2">
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] text-ink-600">
                    🔥 칭찬 연속 <b className="tnum text-rose-500">{compStreak}</b>일
                    <span className="text-ink-400"> — 5일 +1점 · 10일 +2점</span>
                  </span>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] text-ink-600">
                    📚 독서 목표 연속 <b className="tnum text-emerald-600">{readStreak}</b>주
                    <span className="text-ink-400">
                      {vacation ? " — 개학 후 시작해요" : " — 정산 때 주당 최대 +3점"}
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
                아직 오늘 집계 전이에요 — 선생님이 집계하면 여기 점수 출처가 떠요.
              </p>
            ))}

          {/* 🗓️ 세션 — 이번 세션(2주) 합계·요약 (눌렀을 때만 로드) */}
          {view === "session" && (
            <div className="mt-3 rounded-btn bg-ink-50 p-3">
              <p className="text-xs font-bold text-ink-700">
                🗓️ 이번 세션 <span className="font-normal text-ink-400">({fmtDay(sStart)}~{fmtDay(sessionEnd)})</span>
              </p>
              {!sessionReport ? (
                <p className="mt-3 text-center text-sm text-ink-400">불러오는 중…</p>
              ) : (
                <>
                  <div className="mt-2 rounded-card bg-white p-3 text-center">
                    <p className="text-[11px] text-ink-500">이번 세션 점수</p>
                    <p className="tnum mt-0.5 text-3xl font-extrabold text-brand-strong">{sessionTotal}</p>
                    <p className="text-[10px] text-ink-400">집계된 날 {sessionReport.days}일</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-pink-100 px-2 py-1 text-[11px] font-bold text-pink-600">
                      💌 칭찬 보냄 {sessionReport.givenCount?.[sid] ?? 0}
                    </span>
                    <span className="rounded-full bg-pink-100 px-2 py-1 text-[11px] font-bold text-pink-600">
                      💝 칭찬 받음 {sessionReport.receivedCount?.[sid] ?? 0}
                    </span>
                    <span className="rounded-full bg-warn-weak px-2 py-1 text-[11px] font-bold text-warn">
                      ⭐ MVP {sessionReport.mvpCount?.[sid] ?? 0}회
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 🏅 누적 — 전체 타일 + 주별 독서 */}
          {view === "cumulative" && (
            <>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {tiles.map((t) => (
                  <div key={t.label} className={`rounded-btn px-1.5 py-2.5 text-center ${t.cls}`}>
                    <p className="text-[10px] leading-tight text-ink-600">{t.label}</p>
                    <p className="tnum mt-0.5 text-xl font-extrabold leading-tight">{t.value}</p>
                  </div>
                ))}
              </div>

              {/* 누적 점수 출처 — 집계일 전체 합산 (옵트인 로드, 읽기 예산) */}
              {!showCumSource ? (
                <button
                  onClick={() => setShowCumSource(true)}
                  className="press mt-3 w-full rounded-btn bg-ink-100 py-2 text-xs font-bold text-ink-600"
                >
                  🔍 누적 점수, 어디서 왔을까? (눌러서 보기)
                </button>
              ) : (
                <div className="mt-3 rounded-btn bg-ink-50 p-3">
                  <p className="text-xs font-bold text-ink-700">
                    🔍 누적 점수 출처 <span className="font-normal text-ink-400">— 집계일 전체 합산</span>
                  </p>
                  {!cumReport ? (
                    <p className="mt-3 text-center text-sm text-ink-400">불러오는 중…</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CAT_LABELS.map((c) => {
                        const v = cumCat[c.key] ?? 0;
                        if (v === 0) return null;
                        return (
                          <span
                            key={c.key}
                            className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                              v > 0 ? "bg-brand-weak text-brand-strong" : "bg-danger-weak text-danger"
                            }`}
                          >
                            {c.icon} {c.label} <b className="tnum">{v > 0 ? `+${v}` : v}</b>
                          </span>
                        );
                      })}
                      <span className="rounded-full bg-ink-900 px-2 py-1 text-[11px] font-bold text-white">
                        = 집계일 합계 <b className="tnum">{cumReport.totals?.[sid] ?? 0}</b>점
                      </span>
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-ink-400">
                    ※ 정산 보너스(세션 보상·연속 등)는 누적 점수에만 포함돼 위 합계와 다를 수 있어요.
                  </p>
                </div>
              )}

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
        </>
      )}
    </section>
  );
}
