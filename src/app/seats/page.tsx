"use client";
// 자리 배치 및 일정 — 21주 사전계산 자리표(정적 JSON) + 승인된 swap 합성.
// 실버 자리변경 신청: 전주 수요일 자정 마감 · 동일 자리 선착순.
import { useState } from "react";
import { useSession } from "@/stores/session";
import {
  schedules,
  scheduleOfWeek,
  currentWeekNum,
  TOTAL_WEEKS,
  SEMESTER_START,
} from "@/lib/schedule";
import SeatGrid from "@/components/seats/SeatGrid";
import { chairsProvisional, studentById, ROLE_INFO } from "@/lib/roster";
import { useSettings } from "@/lib/query/settings";
import {
  useWeekSwaps,
  applySwaps,
  useWeekRequests,
  useCreateSeatRequest,
  seatChangeDeadline,
} from "@/lib/query/seatChange";
import type { RoleKey } from "@/types";

export default function SeatsPage() {
  const { role, studentId } = useSession();
  const nowWeek = currentWeekNum();
  const [week, setWeek] = useState(nowWeek);
  const beforeSemester = new Date() < new Date(SEMESTER_START + "T00:00:00+09:00");

  const { data: swaps } = useWeekSwaps(week);
  const schedule = applySwaps(scheduleOfWeek(week), swaps ?? []);

  const myGroup = studentId
    ? schedule.groups.find(
        (g) => g.chair === studentId || g.members.some((m) => m.studentId === studentId)
      )
    : undefined;
  const myRole =
    myGroup &&
    (myGroup.chair === studentId
      ? "소통"
      : myGroup.members.find((m) => m.studentId === studentId)?.role);

  // ── 자리변경 신청 ─────────────────────────────────────────────
  const { data: settings } = useSettings();
  const { data: weekRequests } = useWeekRequests(week);
  const createRequest = useCreateSeatRequest(studentId);
  const [showRequest, setShowRequest] = useState(false);
  const [targetGroup, setTargetGroup] = useState(1);
  const [targetRole, setTargetRole] = useState<RoleKey>("질서");
  const [msg, setMsg] = useState("");

  const weekMeta = schedules.weeks[week - 1];
  const deadline = seatChangeDeadline(weekMeta.weekStart);
  const deadlinePassed = new Date() > deadline;

  async function submitRequest() {
    setMsg("");
    try {
      await createRequest({
        week,
        weekStart: weekMeta.weekStart,
        targetGroup,
        targetRole,
        existing: weekRequests ?? [],
      });
      setMsg("✅ 신청 완료! 선생님 승인 후 자리가 바뀌어요.");
      setShowRequest(false);
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "신청 실패"}`);
    }
  }

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

      {/* 실버 자리변경 신청 */}
      {role === "student" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">🎫 실버로 자리 바꾸기 ({week}주차)</h3>
            <span className="text-xs text-slate-400">
              비용 {settings?.seatChangeCost ?? 1}실버 · 마감{" "}
              {deadline.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 수요일
              자정 · 선착순
            </span>
          </div>

          {deadlinePassed ? (
            <p className="mt-2 text-sm text-slate-400">이 주차는 신청 기한이 지났어요.</p>
          ) : (
            <>
              <button
                onClick={() => setShowRequest((v) => !v)}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {showRequest ? "닫기" : "+ 자리 변경 신청"}
              </button>
              {showRequest && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={targetGroup}
                    onChange={(e) => setTargetGroup(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {[1, 2, 3, 4, 5].map((g) => (
                      <option key={g} value={g}>
                        {g}모둠
                      </option>
                    ))}
                  </select>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as RoleKey)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {ROLE_INFO.filter((r) => r.key !== "소통").map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.emoji} {r.key} 지킴이
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void submitRequest()}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
                  >
                    신청하기
                  </button>
                </div>
              )}
            </>
          )}
          {msg && <p className="mt-2 text-sm">{msg}</p>}

          {(weekRequests?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {weekRequests!.map((r) => (
                <li key={r.id} className="flex justify-between rounded bg-slate-50 px-3 py-1.5">
                  <span>
                    {studentById.get(r.studentId)?.name} → {r.targetGroup}모둠 {r.targetRole}
                  </span>
                  <span className="text-xs">
                    {r.status === "pending" ? "⏳ 대기" : r.status === "approved" ? "✅ 승인" : "❌ 반려"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
