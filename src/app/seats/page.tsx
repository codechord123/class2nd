"use client";
// 자리 배치 및 일정 — 21주 사전계산 자리표(정적 JSON) + 승인된 swap 합성.
// 실버 자리변경 신청: 전주 수요일 자정 마감 · 동일 자리 선착순.
import { useState } from "react";
import { useSession } from "@/stores/session";
import {
  schedules,
  scheduleOfWeek,
  currentWeekNum,
  SEMESTER_START,
} from "@/lib/schedule";
import SeatGrid from "@/components/seats/SeatGrid";
import { chairsProvisional, studentById, ROLE_INFO } from "@/lib/roster";
import { useSettings } from "@/lib/query/settings";
import { useFeedback } from "@/components/ui/Feedback";
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
  const [busy, setBusy] = useState(false);
  const { toast, confirm } = useFeedback();

  const weekMeta = schedules.weeks[week - 1];
  const deadline = seatChangeDeadline(weekMeta.weekStart);
  const deadlinePassed = new Date() > deadline;

  async function submitRequest() {
    if (busy) return;
    const cost = settings?.seatChangeCost ?? 1;
    const ok = await confirm({
      title: "자리를 바꿀까요?",
      body: `${targetGroup}모둠 · ${targetRole} 지킴이로 신청해요. 실버 ${cost}개가 들어요 (선생님 승인 후 차감).`,
      confirmLabel: "신청",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await createRequest({
        week,
        weekStart: weekMeta.weekStart,
        targetGroup,
        targetRole,
        existing: weekRequests ?? [],
      });
      toast("✅ 신청 완료! 선생님 승인 후 자리가 바뀌어요.", "success");
      setShowRequest(false);
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "신청 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  // 자리는 2주 단위(기)로 교체 — 기별 대표(첫 주)만 노출
  const periods = [...new Set(schedules.weeks.map((w) => w.period))].map((p) => {
    const ws = schedules.weeks.filter((w) => w.period === p);
    return { period: p, first: ws[0], weeks: ws.map((w) => w.week) };
  });
  const selPeriod = scheduleOfWeek(week).period;
  const nowPeriod = scheduleOfWeek(nowWeek).period;

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">💺 자리 배치 및 일정</h2>
          <span className="text-xs text-ink-400">
            {beforeSemester
              ? `개학(${SEMESTER_START}) 전 — 미리보기`
              : `현재 ${nowPeriod}기 (${nowWeek}주차)`}{" "}
            · 2주마다 자동 교체
          </span>
        </div>
        {myGroup && (
          <p className="mt-2 rounded-btn bg-brand-weak px-3 py-2 text-sm text-brand-strong">
            {selPeriod}기의 나: <b>{myGroup.groupId}모둠</b> · <b>{myRole} 지킴이</b>
          </p>
        )}
        {chairsProvisional && (
          <p className="mt-2 rounded-btn bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠️ 지금 의장(소통 지킴이)은 1학기 회장단 기준 임시 배치예요. 2학기 회장단 선거
            후 새 명단으로 자리표가 다시 만들어집니다.
          </p>
        )}
      </section>

      {/* 기(2주 단위) 선택 */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-1 pb-1">
          {periods.map((pd) => {
            const active = pd.weeks.includes(week);
            const isNow = pd.weeks.includes(nowWeek) && !beforeSemester;
            const lastWeek = pd.weeks[pd.weeks.length - 1];
            return (
              <button
                key={pd.period}
                onClick={() => setWeek(pd.first.week)}
                className={`press shrink-0 rounded-btn px-2.5 py-1.5 text-center text-xs font-medium ${
                  active
                    ? "bg-brand text-white"
                    : isNow
                      ? "bg-amber-100 text-amber-800"
                      : "border border-ink-200 bg-white text-ink-500"
                }`}
              >
                {pd.period}기
                <span className="block text-[10px] opacity-70">
                  {pd.first.week === lastWeek ? `${pd.first.week}주` : `${pd.first.week}·${lastWeek}주`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <SeatGrid schedule={schedule} myStudentId={studentId} />

      {/* 실버 자리변경 신청 */}
      {role === "student" && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold">🎫 실버로 자리 바꾸기 ({selPeriod}기)</h3>
            <span className="text-xs text-ink-400">
              비용 {settings?.seatChangeCost ?? 1}실버 · 마감{" "}
              {deadline.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 수요일
              자정 · 선착순
            </span>
          </div>

          {deadlinePassed ? (
            <p className="mt-2 text-sm text-ink-400">이 주차는 신청 기한이 지났어요.</p>
          ) : (
            <>
              <button
                onClick={() => setShowRequest((v) => !v)}
                className="mt-2 rounded-btn border border-ink-300 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50"
              >
                {showRequest ? "닫기" : "+ 자리 변경 신청"}
              </button>
              {showRequest && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={targetGroup}
                    onChange={(e) => setTargetGroup(Number(e.target.value))}
                    className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
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
                    className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
                  >
                    {ROLE_INFO.filter((r) => r.key !== "소통").map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.emoji} {r.key} 지킴이
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void submitRequest()}
                    disabled={busy}
                    className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? "신청 중…" : "신청하기"}
                  </button>
                </div>
              )}
            </>
          )}

          {(weekRequests?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {weekRequests!.map((r) => (
                <li key={r.id} className="flex justify-between rounded-btn bg-ink-50 px-3 py-1.5">
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
