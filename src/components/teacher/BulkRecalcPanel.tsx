"use client";
// ♻️ 기간 일괄 재집계 — 개학~오늘의 일일 점수를 한 번에 다시 계산한다.
// 쓰는 때: 자리표를 갈아끼웠거나(의장단 교체·전출), 집계 규칙이 바뀌었거나,
//          지난 날짜의 순위를 뒤늦게 입력했을 때.
// 읽기 예산: 날짜당 원시 평가 + 집계 문서 (하루치 집계와 같은 비용) — 버튼 옵트인.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { aggregateDate } from "@/lib/aggregate";
import { useSettings } from "@/lib/query/settings";
import { useBestGroups } from "@/lib/query/classMeta";
import { todayKST } from "@/lib/date";
import { SEMESTER_START } from "@/lib/schedule";
import { useFeedback } from "@/components/ui/Feedback";

/** start~end(포함) 날짜 목록 — 주말은 집계가 skipIfEmpty로 알아서 건너뛴다 */
function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (d <= last && out.length < 200) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export default function BulkRecalcPanel() {
  const { data: settings } = useSettings();
  const { data: bestGroups } = useBestGroups();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const today = todayKST();
  const [from, setFrom] = useState(SEMESTER_START);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState<{ ok: number; skipped: number } | null>(null);

  const dates = datesBetween(from, to);
  // 순위(오늘의 모둠 1~5위)를 넣지 않은 날 — 모둠 점수의 가장 큰 요소라 별도로 짚어준다
  const noRankDates = dates.filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) return false; // 주말 제외
    if (d > today) return false;
    const e = (bestGroups as Record<string, { ranking?: number[] } | undefined> | undefined)?.[d];
    return !e?.ranking?.length;
  });

  async function run() {
    if (busy || !settings) return;
    if (
      !(await confirm({
        title: `${dates.length}일치를 다시 집계할까요?`,
        body: `${from} ~ ${to}\n기록이 없는 날(주말 등)은 자동으로 건너뛰어요. 점수는 규칙대로 다시 계산되며, 이미 준 보너스는 중복되지 않아요(멱등).`,
        confirmLabel: "재집계 실행",
      }))
    )
      return;
    setBusy(true);
    setDone(null);
    let ok = 0;
    let skipped = 0;
    try {
      for (const [i, d] of dates.entries()) {
        setProgress(`${d} (${i + 1}/${dates.length})`);
        const r = await aggregateDate(d, settings, { skipIfEmpty: true });
        if (r) {
          ok++;
          void qc.invalidateQueries({ queryKey: ["dailyScores", d] });
        } else skipped++;
      }
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      setDone({ ok, skipped });
      toast(`♻️ 재집계 완료 — ${ok}일 갱신, ${skipped}일 건너뜀(기록 없음)`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "재집계에 실패했어요.", "error");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">♻️ 기간 일괄 재집계</h2>
      <p className="mt-1 text-xs text-ink-600">
        자리표를 바꿨거나(의장단 교체·전출), 지난 날짜의 순위를 뒤늦게 넣었을 때 그 기간의
        점수를 한 번에 다시 계산해요. 여러 번 돌려도 점수가 중복되지 않아요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-btn border border-ink-300 px-2.5 py-1.5"
          aria-label="시작 날짜"
        />
        <span className="text-ink-400">~</span>
        <input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-btn border border-ink-300 px-2.5 py-1.5"
          aria-label="끝 날짜"
        />
        <span className="text-xs text-ink-500">{dates.length}일</span>
      </div>

      {noRankDates.length > 0 && (
        <div className="mt-2.5 rounded-btn bg-warn-weak px-3 py-2 text-xs text-warn">
          ⚠️ <b>순위를 넣지 않은 학사일이 {noRankDates.length}일</b> 있어요 (
          {noRankDates.slice(0, 6).map((d) => d.slice(5)).join(", ")}
          {noRankDates.length > 6 ? " 외" : ""}) — 순위는 모둠 점수의 가장 큰 요소예요. 그날의
          순위를 먼저 저장한 뒤 재집계하면 반영돼요. (순위가 없으면 모둠 점수가 칭찬 미션만
          남아 전 모둠이 나란히 동점이 돼요)
        </div>
      )}

      <button
        onClick={() => void run()}
        disabled={busy || !settings || !dates.length}
        className="press mt-3 w-full rounded-btn bg-ink-800 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? `⏳ ${progress || "재집계 중…"}` : `♻️ ${dates.length}일치 다시 집계하기`}
      </button>
      {done && (
        <p className="mt-2 text-center text-xs text-ink-500">
          ✅ {done.ok}일 갱신 · {done.skipped}일 건너뜀(기록 없음)
        </p>
      )}
    </section>
  );
}
