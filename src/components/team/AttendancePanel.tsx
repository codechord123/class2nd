"use client";
// 🙋 결석 처리 (교사 전용) — 그날 결석한 학생을 기록하면 집계가 그 학생을
// 모둠 칭찬 미션 '전원' 판정과 팀 보상(순위·미션·오늘의 모둠)에서 제외한다.
// classData/attendance = { [date]: number[] } 단일 문서 (bestGroups와 동형·읽기 1회).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { students } from "@/lib/roster";
import { shiftDate, todayKST } from "@/lib/date";
import { useAttendance, useSetAttendance } from "@/lib/query/classMeta";
import { useSettings } from "@/lib/query/settings";
import { aggregateDate } from "@/lib/aggregate";
import { useFeedback } from "@/components/ui/Feedback";

export default function AttendancePanel() {
  const { data: attendance } = useAttendance();
  const setAttendance = useSetAttendance();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [date, setDate] = useState(todayKST());
  const [busy, setBusy] = useState(false);

  const absent = new Set(attendance?.[date] ?? []);
  const roster = students.filter((s) => !s.inactive);

  async function toggle(id: number) {
    if (busy) return;
    const next = new Set(absent);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setBusy(true);
    try {
      await setAttendance(date, [...next]);
      // 그 자리에서 그날 점수 재계산 — 예약만 걸면 과거 날짜 보정이 점수표에 영영 안 뜬다
      // (오늘은 autoRun이 재집계하지만, 과거 날짜는 트리거가 없다). 결석은 드물어 읽기 비용 미미.
      if (settings) {
        await aggregateDate(date, settings).catch(() => {});
        void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
        void qc.invalidateQueries({ queryKey: ["dailyScores", "_cumulative"] });
        void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      }
      toast(
        next.has(id)
          ? `${students.find((s) => s.id === id)?.name} 결석 처리 + 그날 점수 재계산 완료.`
          : `${students.find((s) => s.id === id)?.name} 출석으로 되돌렸어요.`,
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const isToday = date === todayKST();

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">🙋 결석 처리</h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="press rounded-btn bg-ink-100 px-2.5 py-1 text-sm font-bold text-ink-600"
            aria-label="하루 전"
          >
            ◀
          </button>
          <input
            type="date"
            value={date}
            max={todayKST()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-btn border border-ink-300 px-2 py-1 text-sm"
          />
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= todayKST()}
            className="press rounded-btn bg-ink-100 px-2.5 py-1 text-sm font-bold text-ink-600 disabled:opacity-30"
            aria-label="하루 후"
          >
            ▶
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(todayKST())}
              className="press rounded-btn bg-brand-weak px-2.5 py-1 text-xs font-bold text-brand-strong"
            >
              오늘
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[13px] text-ink-600">
        결석한 학생을 골라주세요. 결석 학생은 그날 <b>모둠 칭찬 미션 &lsquo;전원&rsquo; 판정</b>과{" "}
        <b>팀 보상(순위·미션·오늘의 모둠)</b>에서 자동 제외돼요 — 남은 모둠원이 미션을 달성할 수
        있어요. (누르면 그날 점수가 바로 재계산돼요 · 칭찬 연속은 끊기지 않아요)
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {roster.map((s) => {
          const off = absent.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => void toggle(s.id)}
              disabled={busy}
              className={`press rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
                off
                  ? "border-danger bg-danger text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-danger/40"
              }`}
            >
              {off && "🚫 "}
              {s.name}
            </button>
          );
        })}
      </div>
      {absent.size > 0 && (
        <p className="mt-2 rounded-btn bg-danger-weak px-3 py-2 text-xs text-danger">
          결석 {absent.size}명:{" "}
          <b>
            {[...absent]
              .map((id) => students.find((s) => s.id === id)?.name)
              .filter(Boolean)
              .join(", ")}
          </b>
        </p>
      )}
    </section>
  );
}
