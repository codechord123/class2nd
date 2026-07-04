// 한 주차의 5모둠 배치 그리드. myStudentId가 속한 모둠은 강조 표시.
import type { WeekSchedule } from "@/types";
import { studentById, ROLE_INFO } from "@/lib/roster";

const roleEmoji = Object.fromEntries(ROLE_INFO.map((r) => [r.key, r.emoji]));

export default function SeatGrid({
  schedule,
  myStudentId,
}: {
  schedule: WeekSchedule;
  myStudentId?: number | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {schedule.groups.map((g) => {
        const mine =
          myStudentId != null &&
          (g.chair === myStudentId || g.members.some((m) => m.studentId === myStudentId));
        return (
          <div
            key={g.groupId}
            className={`rounded-card border p-4 ${
              mine ? "border-brand bg-brand-weak ring-2 ring-brand/30" : "border-ink-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-ink-900">{g.groupId}모둠</h3>
              {mine && (
                <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                  우리 모둠
                </span>
              )}
            </div>
            <ul className="mt-2.5 space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center">👑</span>
                <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                  {studentById.get(g.chair)?.name}
                </span>
                <span className="shrink-0 text-xs text-ink-400">소통 (의장)</span>
              </li>
              {g.members.map((m) => {
                const isMe = m.studentId === myStudentId;
                return (
                  <li key={m.studentId} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center">{roleEmoji[m.role]}</span>
                    <span
                      className={`min-w-0 flex-1 truncate ${isMe ? "font-bold text-brand-strong" : "text-ink-800"}`}
                    >
                      {studentById.get(m.studentId)?.name}
                    </span>
                    <span className="shrink-0 text-xs text-ink-400">{m.role}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
