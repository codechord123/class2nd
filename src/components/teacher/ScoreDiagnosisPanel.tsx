"use client";
// 점수 진단 — 점수가 이상할 때 원인을 찾고 바로잡는 교사 도구.
// ① 그날 점수 분해(정량/순위/미션/MVP/독서/보너스) ② 원시 평가(누가 몇 점 줬나)
// ③ 누적 검증: Σ일별 총점 + Σ스트릭 보너스 vs 누적 문서 → 어긋나면 한 번에 보정.
import { useState } from "react";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import { useFeedback } from "@/components/ui/Feedback";
import type { DailyScoreRow } from "@/types";

interface Diag {
  row: DailyScoreRow | null;
  received: { from: number; v: number }[];
  expectedCum: number;
  actualCum: number;
  daysCounted: number;
  streakSum: number;
}

export default function ScoreDiagnosisPanel() {
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayKST());
  const [sid, setSid] = useState(1);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diag | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setDiag(null);
    try {
      const d = db();
      const [daySnap, entriesSnap, allDays, markers] = await Promise.all([
        getDoc(doc(d, "dailyScores", date)),
        getDocs(collection(d, "evaluations", date, "entries")),
        getDocs(collection(d, "dailyScores")),
        getDocs(collection(d, "biweeklyScores")),
      ]);

      const row = daySnap.exists()
        ? ((daySnap.data()[String(sid)] as DailyScoreRow | undefined) ?? null)
        : null;

      // 그날 원시 평가에서 이 학생이 '받은' 점수
      const received: { from: number; v: number }[] = [];
      entriesSnap.forEach((e) => {
        const v = e.data()[String(sid)];
        if (typeof v === "number") received.push({ from: Number(e.id), v });
      });

      // 누적 검증: 일별 총점 합 + 세션 스트릭 보너스 합 = 누적이어야 함
      let sum = 0;
      let daysCounted = 0;
      let actualCum = 0;
      allDays.forEach((day) => {
        if (day.id === "_cumulative") {
          actualCum = (day.data()[String(sid)] as number | undefined) ?? 0;
          return;
        }
        const r = day.data()[String(sid)] as DailyScoreRow | undefined;
        if (r?.total != null) {
          sum += r.total;
          daysCounted++;
        }
      });
      let streakSum = 0;
      markers.forEach((m) => {
        const sp = (m.data().streakPoints ?? {}) as Record<string, number>;
        streakSum += sp[String(sid)] ?? 0;
      });

      setDiag({ row, received, expectedCum: sum + streakSum, actualCum, daysCounted, streakSum });
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "진단 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function fixCumulative() {
    if (!diag) return;
    const ok = await confirm({
      title: "누적 점수를 보정할까요?",
      body: `${studentById.get(sid)?.name}의 누적을 ${diag.actualCum}점 → ${diag.expectedCum}점(일별 합계+스트릭)으로 맞춰요.`,
      confirmLabel: "보정",
    });
    if (!ok) return;
    try {
      await setDoc(
        doc(db(), "dailyScores", "_cumulative"),
        { [String(sid)]: diag.expectedCum },
        { merge: true }
      );
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      toast("✅ 누적 점수를 보정했어요.", "success");
      setDiag({ ...diag, actualCum: diag.expectedCum });
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "보정 실패"}`, "error");
    }
  }

  const nm = (id: number) => studentById.get(id)?.name ?? `?${id}`;
  const mismatch = diag != null && diag.expectedCum !== diag.actualCum;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">🔍 점수 진단</h2>
      <p className="mt-1 text-xs text-ink-500">
        점수가 이상할 때: 그날 점수의 출처(누가 몇 점 줬는지)와 누적 계산을 검증하고 바로잡아요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          max={todayKST()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
        />
        <select
          value={sid}
          onChange={(e) => setSid(Number(e.target.value))}
          className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => void run()}
          disabled={busy}
          className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "진단 중…" : "진단 실행"}
        </button>
      </div>

      {diag && (
        <div className="mt-3 space-y-2 text-sm">
          {/* 그날 점수 분해 */}
          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-xs font-bold text-ink-500">
              {date} · {nm(sid)}의 점수 분해
            </p>
            {diag.row ? (
              <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full bg-brand-weak px-2 py-0.5 text-brand-strong">🫂 정량 {diag.row.peer}</span>
                <span className="rounded-full bg-warn-weak px-2 py-0.5 text-warn">👑 순위 {diag.row.groupRank}</span>
                <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600">🎯 미션 {diag.row.mission ?? 0}</span>
                <span className="rounded-full bg-warn-weak px-2 py-0.5 text-warn">⭐ MVP {diag.row.mvp ?? 0}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">📖 독서 {diag.row.read ?? 0}</span>
                <span className="rounded-full bg-success-weak px-2 py-0.5 text-success">🎁 보너스 {diag.row.bonus}</span>
                <b className="tnum ml-1">= 총 {diag.row.total}점</b>
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-400">이 날짜는 집계 기록이 없어요.</p>
            )}
          </div>

          {/* 원시 평가 (받은 점수) */}
          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-xs font-bold text-ink-500">이 날 받은 정량평가 (원본)</p>
            {diag.received.length ? (
              <p className="mt-1 text-xs text-ink-700">
                {diag.received.map((r) => `${nm(r.from)} → ${r.v > 0 ? "+" : ""}${r.v}`).join(" · ")}{" "}
                <b className="tnum">(합 {diag.received.reduce((a, b) => a + b.v, 0)})</b>
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-400">받은 평가가 없어요.</p>
            )}
          </div>

          {/* 누적 검증 */}
          <div className={`rounded-btn p-3 ${mismatch ? "bg-danger-weak" : "bg-success-weak"}`}>
            <p className={`text-xs font-bold ${mismatch ? "text-danger" : "text-success"}`}>
              {mismatch ? "⚠️ 누적 점수 불일치 발견" : "✅ 누적 점수 정상"}
            </p>
            <p className="mt-1 text-xs text-ink-700">
              일별 합계({diag.daysCounted}일) + 스트릭 보너스({diag.streakSum}) ={" "}
              <b className="tnum">{diag.expectedCum}점</b> · 현재 누적:{" "}
              <b className="tnum">{diag.actualCum}점</b>
            </p>
            {mismatch && (
              <button
                onClick={() => void fixCumulative()}
                className="press mt-2 rounded-btn bg-danger px-3 py-1.5 text-xs font-bold text-white"
              >
                누적을 {diag.expectedCum}점으로 보정
              </button>
            )}
          </div>
          <p className="text-[11px] text-ink-400">
            일별 점수 자체를 고치려면 ➕ 교사 보너스로 가감하거나, 그날 순위/평가를 바로잡은 뒤
            해당 날짜로 집계를 다시 실행하세요(자동 보정).
          </p>
        </div>
      )}
    </section>
  );
}
