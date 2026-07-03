"use client";
// 교사 탭 — 평가 척도 설정(요구사항 Q3: 교사가 수정 가능) + 일일 집계 실행.
// 집계는 교사만 원시 평가(하루 최대 50문서)를 읽고, 학생들은 결과 문서만 읽는다.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { useSettings, useSaveSettings } from "@/lib/query/settings";
import { useQueryClient } from "@tanstack/react-query";
import { aggregateDate, type AggregateResult } from "@/lib/aggregate";
import { todayKST } from "@/lib/date";
import type { ClassSettings } from "@/types";

function parseNums(text: string): number[] {
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

export default function TeacherPage() {
  const { role } = useSession();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const qc = useQueryClient();

  const [date, setDate] = useState(todayKST());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AggregateResult | null>(null);
  const [msg, setMsg] = useState("");

  const [peerScaleText, setPeerScaleText] = useState<string | null>(null);
  const [groupScaleText, setGroupScaleText] = useState<string | null>(null);
  const [rankPointsText, setRankPointsText] = useState<string | null>(null);
  const [quotaText, setQuotaText] = useState<string | null>(null);

  if (role !== "teacher") {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">🔒 선생님만 들어올 수 있는 곳이에요.</p>
      </section>
    );
  }
  if (!settings) return <p className="text-sm text-slate-400">불러오는 중…</p>;

  async function runAggregate() {
    setBusy(true);
    setMsg("");
    try {
      const r = await aggregateDate(date, settings!);
      setResult(r);
      // 집계 결과 캐시 무효화 — 다음 조회 때 새 문서를 읽는다
      void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      setMsg(`✅ ${date} 집계 완료 — 평가 ${r.evaluatorCount}명 · 모둠투표 ${r.voterCount}명`);
    } catch (e) {
      setMsg(`⚠️ 집계 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    const next: ClassSettings = {
      ...settings!,
      peerScale: peerScaleText != null ? parseNums(peerScaleText) : settings!.peerScale,
      groupScale: groupScaleText != null ? parseNums(groupScaleText) : settings!.groupScale,
      rankPoints: rankPointsText != null ? parseNums(rankPointsText) : settings!.rankPoints,
      weeklyReadingQuota:
        quotaText != null ? Number(quotaText) || settings!.weeklyReadingQuota : settings!.weeklyReadingQuota,
    };
    try {
      await saveSettings(next);
      setMsg("✅ 설정이 저장되었습니다.");
    } catch (e) {
      setMsg(`⚠️ 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* 일일 집계 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">📊 일일 평가 집계</h2>
        <p className="mt-1 text-xs text-slate-500">
          종회 후 하루 1번 실행하세요. 다시 실행해도 안전해요(누적 자동 보정).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void runAggregate()}
            disabled={busy}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "집계 중…" : "집계 실행"}
          </button>
        </div>
        {result && (
          <p className="mt-2 text-sm text-slate-600">
            모둠 순위:{" "}
            {Object.entries(result.groupRanks)
              .sort((a, b) => a[1] - b[1])
              .map(([g, r]) => `${g}모둠 ${r}위`)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* 평가 척도 설정 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">⚙️ 평가 척도 설정</h2>
        <p className="mt-1 text-xs text-slate-500">쉼표로 구분해 자유롭게 수정할 수 있어요.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            모둠 내 평가 척도
            <input
              value={peerScaleText ?? settings.peerScale.join(", ")}
              onChange={(e) => setPeerScaleText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            모둠 간 평가 척도
            <input
              value={groupScaleText ?? settings.groupScale.join(", ")}
              onChange={(e) => setGroupScaleText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            모둠 순위 → 개인 점수 (1위부터)
            <input
              value={rankPointsText ?? settings.rankPoints.join(", ")}
              onChange={(e) => setRankPointsText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            거북이 독서 주간 의무 권수
            <input
              value={quotaText ?? String(settings.weeklyReadingQuota)}
              onChange={(e) => setQuotaText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <button
          onClick={() => void saveAll()}
          className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
        >
          설정 저장
        </button>
      </section>

      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
