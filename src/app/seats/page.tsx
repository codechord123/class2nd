"use client";
// 자리 배치 및 일정 — 21주 사전계산 자리표(정적 JSON) 뷰. DB 읽기 0회.
// 토큰 자리변경 신청(수요일 자정 마감·선착순)은 Phase 5에서 이 화면에 붙는다.
import { useState } from "react";
import { useSession } from "@/stores/session";
import {
  schedules,
  scheduleOfWeek,
  currentWeekNum,
  groupOf,
  roleOf,
  TOTAL_WEEKS,
  SEMESTER_START,
} from "@/lib/schedule";
import SeatGrid from "@/components/seats/SeatGrid";
import { chairsProvisional } from "@/lib/roster";

export default function SeatsPage() {
  const { studentId } = useSession();
  const nowWeek = currentWeekNum();
  const [week, setWeek] = useState(nowWeek);
  const schedule = scheduleOfWeek(week);
  const beforeSemester = new Date() < new Date(SEMESTER_START + "T00:00:00+09:00");

  const myGroup = studentId ? groupOf(week, studentId) : undefined;
  const myRole = studentId ? roleOf(week, studentId) : undefined;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">🪑 자리 배치 및 일정</h2>
          <span className="text-xs text-slate-400">
            {beforeSemester ? `개학(${SEMESTER_START}) 전 — 미리보기` : `현재 ${nowWeek}주차`} ·
            2주마다 자동 교체
          </span>
        </div>
        {myGroup && (
          <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            {week}주차의 나: <b>{myGroup.groupId}모둠</b> · <b>{myRole} 지킴이</b>
          </p>
        )}
        {chairsProvisional && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠️ 지금 의장(소통 지킴이)은 1학기 회장단 기준 임시 배치예요. 2학기 회장단 선거
            후 새 명단으로 자리표가 다시 만들어집니다.
          </p>
        )}
      </section>

      {/* 주차 선택 */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-1 pb-1">
          {schedules.weeks.map((w) => (
            <button
              key={w.week}
              onClick={() => setWeek(w.week)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                w.week === week
                  ? "bg-slate-800 text-white"
                  : w.week === nowWeek && !beforeSemester
                    ? "bg-amber-100 text-amber-800"
                    : "bg-white text-slate-500 border border-slate-200"
              }`}
            >
              {w.week}주
              <span className="block text-[10px] opacity-70">{w.weekStart.slice(5)}</span>
            </button>
          ))}
        </div>
      </div>

      <SeatGrid schedule={schedule} myStudentId={studentId} />

      <p className="text-xs text-slate-400">
        ※ 자리표는 시뮬레이티드 어닐링으로 사전 계산되어 {TOTAL_WEEKS}주 전체가 확정되어
        있어요. 토큰을 사용한 자리 변경 신청(전주 수요일 자정 마감, 선착순)은 곧 열립니다.
      </p>
    </div>
  );
}
