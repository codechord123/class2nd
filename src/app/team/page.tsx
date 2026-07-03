"use client";
// Team — 2학기 핵심 (요구사항 §A):
//  · 우리 모둠: 모둠원 4명을 역할 관점으로 상호평가 (척도는 교사 설정값)
//  · 다른 모둠: 우수 모둠 벤치마킹 평가 → 집계 시 Dense Ranking → 모둠원 전원 순위점수
//  · 점수는 학생(개인)에게 귀속 — 2주마다 모둠이 바뀌어도 누적 유지
// 읽기 예산: 학생 1일 = 본인 평가 2문서 + 집계 2문서. 저장 후 재조회 없음.
import { useSession } from "@/stores/session";
import { todayKST, weekOfDate } from "@/lib/date";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { studentById, ROLE_INFO } from "@/lib/roster";
import { useSettings } from "@/lib/query/settings";
import {
  useMyEvaluation,
  useSaveEvaluation,
  useMyGroupVotes,
  useSaveGroupVotes,
  useDailyScores,
  useCumulativeScores,
} from "@/lib/query/evaluation";
import type { DailyScoreRow } from "@/types";

const roleEmoji = Object.fromEntries(ROLE_INFO.map((r) => [r.key, r.emoji]));

function ScaleButtons({
  scale,
  value,
  onSelect,
}: {
  scale: number[];
  value: number | undefined;
  onSelect: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {scale.map((v) => (
        <button
          key={v}
          onClick={() => onSelect(v)}
          className={`min-w-10 rounded-lg border px-2 py-1.5 text-sm font-bold transition-colors ${
            value === v
              ? v > 0
                ? "border-emerald-500 bg-emerald-500 text-white"
                : v < 0
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-slate-500 bg-slate-500 text-white"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
          }`}
        >
          {v > 0 ? `+${v}` : v}
        </button>
      ))}
    </div>
  );
}

export default function TeamPage() {
  const { role, studentId } = useSession();
  const date = todayKST();
  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);

  const { data: settings } = useSettings();
  const { data: myEval } = useMyEvaluation(date, studentId);
  const { data: myVotes } = useMyGroupVotes(date, studentId);
  const saveEval = useSaveEvaluation(date, studentId);
  const saveVotes = useSaveGroupVotes(date, studentId);
  const { data: todayScores } = useDailyScores(date);
  const { data: cumScores } = useCumulativeScores();

  if (role === "teacher") {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">🤝 Team</h2>
        <p className="mt-1 text-sm text-slate-500">
          선생님은 <b>교사</b> 탭에서 평가 집계와 척도 설정을 관리할 수 있어요.
        </p>
      </section>
    );
  }

  const myGroup = schedule.groups.find(
    (g) => g.chair === studentId || g.members.some((m) => m.studentId === studentId)
  );
  if (!studentId || !myGroup || !settings) {
    return <p className="text-sm text-slate-400">불러오는 중…</p>;
  }

  const otherGroups = schedule.groups.filter((g) => g.groupId !== myGroup.groupId);
  // 평가 대상: 나를 제외한 우리 모둠 전원 (의장 포함)
  const targets = [
    { studentId: myGroup.chair, role: "소통" },
    ...myGroup.members.map((m) => ({ studentId: m.studentId, role: m.role as string })),
  ].filter((t) => t.studentId !== studentId);

  const myRow = todayScores?.[String(studentId)] as DailyScoreRow | undefined;
  const myCum = (cumScores as Record<string, number> | null)?.[String(studentId)];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            🤝 Team — {week}주차 · {myGroup.groupId}모둠
          </h2>
          <span className="text-xs text-slate-400">{date}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <span>
            오늘 점수: <b>{myRow ? myRow.total : "집계 전"}</b>
          </span>
          <span>
            누적 점수: <b>{myCum ?? 0}</b>
          </span>
        </div>
      </section>

      {/* 모둠 내 상호평가 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold">🫂 우리 모둠 평가</h3>
        <p className="mt-1 text-xs text-slate-500">
          친구가 역할을 얼마나 잘 수행했는지 점수를 주세요. 누르면 바로 저장돼요.
        </p>
        <ul className="mt-3 space-y-2">
          {targets.map((t) => (
            <li
              key={t.studentId}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <span>{t.role === "소통" ? "👑" : roleEmoji[t.role]}</span>
                <b>{studentById.get(t.studentId)?.name}</b>
                <span className="text-xs text-slate-400">{t.role} 지킴이</span>
              </div>
              <ScaleButtons
                scale={settings.peerScale}
                value={myEval?.[t.studentId]}
                onSelect={(v) => void saveEval({ [t.studentId]: v })}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* 모둠 간 평가 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold">🏆 다른 모둠 평가</h3>
        <p className="mt-1 text-xs text-slate-500">
          오늘 잘한 모둠에게 점수를 주세요. 집계 후 순위에 따라 그 모둠 전원이 점수를
          받아요.
        </p>
        <ul className="mt-3 space-y-2">
          {otherGroups.map((g) => (
            <li
              key={g.groupId}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="text-sm">
                <b>{g.groupId}모둠</b>
                <span className="ml-2 text-xs text-slate-400">
                  {studentById.get(g.chair)?.name} 외 {g.members.length}명
                </span>
              </div>
              <ScaleButtons
                scale={settings.groupScale}
                value={myVotes?.[g.groupId]}
                onSelect={(v) => void saveVotes({ [g.groupId]: v })}
              />
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-slate-400">
        ※ 점수는 매일 선생님 집계 후 반영돼요. 모둠이 바뀌어도 내 점수는 계속 쌓여요.
      </p>
    </div>
  );
}
