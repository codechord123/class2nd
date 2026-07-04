"use client";
// 데일리 리포트 — 오늘의 독서 현황 + 점수를 한눈에, 인쇄/PDF로 뽑기.
// 읽기 예산: 이미 캐시된 문서만 사용(readingStats·dailyScores·settings). 인쇄 시에만 그날 문서 추가 조회.
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import { s1TotalBooks } from "@/lib/staticData";
import { useReadingStats } from "@/lib/query/reading";
import { useDailyScores } from "@/lib/query/evaluation";
import { useSettings } from "@/lib/query/settings";
import { weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { openRangePrintDoc } from "@/lib/exportDoc";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function DailyReportPanel({ date }: { date: string }) {
  const { data: stats } = useReadingStats();
  const { data: today } = useDailyScores(date);
  const { data: settings } = useSettings();
  const { toast } = useFeedback();
  const [printing, setPrinting] = useState(false);

  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const quota = settings?.weeklyReadingQuota ?? 3;

  const weekMap = stats?.byWeek?.[String(week)] ?? {};
  const weekRead = (sid: number) => weekMap[String(sid)] ?? 0;
  const classTotal = s1TotalBooks + Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const weekBooks = students.reduce((a, s) => a + weekRead(s.id), 0);
  const notMet = students.filter((s) => weekRead(s.id) < quota);
  const metCount = students.length - notMet.length;

  const scoreRows = students
    .map((s) => ({ name: s.name, row: today?.[s.id] }))
    .filter((r) => r.row)
    .sort((a, b) => b.row!.total - a.row!.total);

  // 집계 문서의 _meta — 집계 후에만 존재
  const meta = (today?._meta ?? null) as {
    mvpWinners?: number[];
    ranks?: Record<string, number>;
    compliments?: { from: number; to: number; text: string }[];
    peerSuggestions?: { from: number; to: number; text: string }[];
    toTeacher?: { from: number; text: string }[];
  } | null;
  const nm = (id: number) => studentById.get(id)?.name ?? `?${id}`;
  const mvpNames = (meta?.mvpWinners ?? []).map(nm);
  const rankPairs = Object.entries(meta?.ranks ?? {}).sort((a, b) => a[1] - b[1]);
  const compliments = meta?.compliments ?? [];
  const peerSug = meta?.peerSuggestions ?? [];
  const wishes = meta?.toTeacher ?? [];
  // 커버리지 백스톱: 오늘 칭찬을 하나도 못 받은 친구 — 아침 조회 때 한마디 보정용
  const praisedIds = new Set(compliments.map((c) => c.to));
  const notPraised = students.filter((s) => !praisedIds.has(s.id));

  async function print() {
    if (printing) return;
    setPrinting(true);
    try {
      const readingHtml = `<h2>📖 거북이 독서 현황 (${week}주차)</h2>
<p>학급 누적 <b>${classTotal}권</b> · 이번 주 반 제출 <b>${weekBooks}권</b> · 의무(${quota}권) 달성 ${metCount}명 / 미달 ${notMet.length}명</p>
${
        notMet.length
          ? `<p class="muted">미달(${notMet.length}): ${notMet.map((s) => s.name).join(", ")}</p>`
          : `<p class="muted">전원 목표 달성! 🎉</p>`
      }`;
      await openRangePrintDoc(date, date, `${date} 데일리 리포트`, readingHtml);
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄에 실패했어요.", "error");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Card title="🗒️ 데일리 리포트" desc={`${date} · ${week}주차 — 오늘 한눈에 보고 인쇄까지`}>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {/* 독서 현황 */}
        <div className="rounded-btn bg-ink-50 p-3">
          <p className="text-sm font-bold text-ink-800">📖 거북이 독서 ({week}주차)</p>
          <div className="mt-2 flex gap-2 text-center">
            <div className="flex-1">
              <p className="text-[11px] text-ink-400">학급 누적</p>
              <p className="tnum text-lg font-extrabold text-success">{classTotal}</p>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-ink-400">이번 주</p>
              <p className="tnum text-lg font-extrabold text-ink-900">{weekBooks}권</p>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-ink-400">목표 달성</p>
              <p className="tnum text-lg font-extrabold text-brand-strong">
                {metCount}/{students.length}
              </p>
            </div>
          </div>
          {notMet.length > 0 && (
            <p className="mt-2 text-xs text-ink-500">
              미달({notMet.length}): {notMet.map((s) => s.name).join(", ")}
            </p>
          )}
        </div>

        {/* 오늘 점수 */}
        <div className="rounded-btn bg-ink-50 p-3">
          <p className="text-sm font-bold text-ink-800">🏅 오늘 점수 (상위)</p>
          {scoreRows.length === 0 ? (
            <p className="mt-2 text-xs text-ink-400">
              아직 집계 전이에요. 위쪽 일일 평가 집계를 실행하면 반영돼요.
            </p>
          ) : (
            <ol className="mt-2 space-y-0.5 text-sm">
              {scoreRows.slice(0, 5).map((r, i) => (
                <li key={r.name} className="flex justify-between">
                  <span>
                    {MEDAL[i] ?? `${i + 1}.`} {r.name}
                  </span>
                  <b className="tnum">{r.row!.total}점</b>
                </li>
              ))}
              {scoreRows.length > 5 && (
                <li className="text-xs text-ink-400">…외 {scoreRows.length - 5}명</li>
              )}
            </ol>
          )}
        </div>
      </div>
      {/* 집계 후 — MVP·모둠순위·칭찬·건의·바라는 점 */}
      {meta ? (
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-btn bg-ink-50 p-3">
              <p className="text-sm font-bold text-ink-800">⭐ 오늘의 MVP</p>
              <p className="mt-1 text-sm text-ink-700">
                {mvpNames.length ? mvpNames.join(", ") : <span className="text-ink-400">없음</span>}
              </p>
            </div>
            <div className="rounded-btn bg-ink-50 p-3">
              <p className="text-sm font-bold text-ink-800">🥇 오늘의 모둠</p>
              <p className="mt-1 text-sm text-ink-700">
                {rankPairs.length ? (
                  rankPairs.map(([g]) => `👑 ${g}모둠`).join(" · ")
                ) : (
                  <span className="font-bold text-warn">
                    ⚠️ 미선정 — 순위 점수 0점. 선정 후 재집계하세요
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-sm font-bold text-ink-800">💌 모둠원 칭찬 ({compliments.length})</p>
            {compliments.length ? (
              <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                {compliments.map((c, i) => (
                  <li key={i}>
                    <b>{nm(c.from)}</b> → <b>{nm(c.to)}</b>: {c.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-400">아직 없어요.</p>
            )}
            {compliments.length > 0 && notPraised.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-warn">
                💌 오늘 칭찬 못 받은 친구({notPraised.length}):{" "}
                {notPraised.map((s) => s.name).join(", ")}
              </p>
            )}
          </div>

          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-sm font-bold text-ink-800">🙋 모둠원 건의 ({peerSug.length})</p>
            {peerSug.length ? (
              <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                {peerSug.map((c, i) => (
                  <li key={i}>
                    <b>{nm(c.from)}</b> → <b>{nm(c.to)}</b>: {c.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-400">아직 없어요.</p>
            )}
          </div>

          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-sm font-bold text-ink-800">📨 선생님에게 바라는 점 ({wishes.length})</p>
            {wishes.length ? (
              <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                {wishes.map((t, i) => (
                  <li key={i}>
                    <b>{nm(t.from)}</b>: {t.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-400">아직 없어요.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-400">
          집계 후 MVP·모둠 순위·칭찬·건의·바라는 점이 여기에 표시돼요.
        </p>
      )}

      <Button onClick={() => void print()} disabled={printing} className="mt-3">
        {printing ? "여는 중…" : "🖨️ 리포트 인쇄 / PDF 저장"}
      </Button>
      <p className="mt-1.5 text-xs text-ink-400">
        인쇄본에는 독서 현황·점수 요약·칭찬·바라는 점·안건이 함께 담겨요.
      </p>
    </Card>
  );
}
