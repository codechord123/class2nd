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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {schedule.groups.map((g) => {
        const mine =
          myStudentId != null &&
          (g.chair === myStudentId || g.members.some((m) => m.studentId === myStudentId));
        return (
          <div
            key={g.groupId}
            className={`rounded-xl border p-4 ${
              mine
                ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold">
                {g.groupId}모둠 {mine && <span className="text-xs text-indigo-600">★ 우리 모둠</span>}
              </h3>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <span>👑</span>
                <b>{studentById.get(g.chair)?.name}</b>
                <span className="text-xs text-slate-400">소통 지킴이 (의장)</span>
              </li>
              {g.members.map((m) => (
                <li key={m.studentId} className="flex items-center gap-2">
                  <span>{roleEmoji[m.role]}</span>
                  <span className={m.studentId === myStudentId ? "font-bold text-indigo-700" : ""}>
                    {studentById.get(m.studentId)?.name}
                  </span>
                  <span className="text-xs text-slate-400">{m.role} 지킴이</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
