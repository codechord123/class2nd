"use client";
// 💺 선생님 자리 바꾸기 — 두 학생을 골라 맞바꾼다 (사용자 요청 2026-08-28).
// 왜 필요한가: 다투거나 관계가 어려워졌을 때 즉시 떼어놓아야 하는데, 학생 신청(실버·마감·
// 선착순)으로는 늦다. 범위를 골라 '이 세션 내내' 또는 '오늘 하루만' 적용한다.
// 데이터: 기 스왑(classData/seatSwaps-{기 첫 주}) · 하루 스왑(seatSwapsDay-{날짜}).
// 집계도 같은 순서로 합성해 모둠 점수·칭찬 미션이 바뀐 자리를 따른다.
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import { currentWeekNum, scheduleOfWeek } from "@/lib/schedule";
import {
  useWeekSwaps,
  useDaySwaps,
  useTeacherSwapSeats,
  useClearSwaps,
  applySwaps,
} from "@/lib/query/seatChange";
import { useFeedback } from "@/components/ui/Feedback";

export default function SeatSwapPanel() {
  const week = currentWeekNum();
  const date = todayKST();
  const period = scheduleOfWeek(week).period;
  const { data: swaps } = useWeekSwaps(week);
  const { data: daySwaps } = useDaySwaps(date);
  const swapSeats = useTeacherSwapSeats();
  const clearSwaps = useClearSwaps();
  const { toast, confirm } = useFeedback();

  const [a, setA] = useState<number>(0);
  const [b, setB] = useState<number>(0);
  const [scope, setScope] = useState<"session" | "day">("day");
  const [busy, setBusy] = useState(false);

  // 지금 적용된 배치 (기 스왑 + 오늘 스왑) — 바꾸기 전 '누가 어디' 확인용
  const applied = applySwaps(scheduleOfWeek(week), [...(swaps ?? []), ...(daySwaps ?? [])]);
  const seatOf = (sid: number) => {
    const g = applied.groups.find(
      (x) => x.chair === sid || x.members.some((m) => m.studentId === sid)
    );
    if (!g) return "-";
    const role = g.chair === sid ? "소통" : g.members.find((m) => m.studentId === sid)?.role;
    return `${g.groupId}모둠 ${role}`;
  };
  const nameOf = (sid: number) => studentById.get(sid)?.name ?? `${sid}번`;
  const groupIdOf = (sid: number) =>
    applied.groups.find((x) => x.chair === sid || x.members.some((m) => m.studentId === sid))
      ?.groupId ?? 0;
  // ⚠️ 같은 모둠끼리 맞바꾸면 역할만 바뀌고 '떼어놓기'는 안 된다 — 가장 흔한 오해라 미리 막는다
  const sameGroup = a > 0 && b > 0 && a !== b && groupIdOf(a) === groupIdOf(b);
  const active = students.filter((s) => !s.inactive);
  const list = scope === "day" ? (daySwaps ?? []) : (swaps ?? []);

  async function run() {
    if (busy) return;
    if (!a || !b) {
      toast("바꿀 두 학생을 골라주세요.", "warn");
      return;
    }
    if (a === b) {
      toast("서로 다른 두 학생을 골라주세요.", "warn");
      return;
    }
    const label = scope === "day" ? `오늘(${date}) 하루만` : `${period}기 세션 내내`;
    if (
      !(await confirm({
        title: `${nameOf(a)} ↔ ${nameOf(b)} 자리를 바꿀까요?`,
        body:
          `${label} 적용돼요.\n${nameOf(a)}: ${seatOf(a)}\n${nameOf(b)}: ${seatOf(b)}\n\n` +
          (sameGroup
            ? `⚠️ 두 학생이 같은 ${groupIdOf(a)}모둠이라 자리(역할)만 바뀌고 여전히 같은 모둠이에요. 떼어놓으려면 다른 모둠 학생과 바꿔주세요.\n\n`
            : "") +
          "바뀐 자리는 학생 화면에 바로 보이고, 모둠 점수도 바뀐 자리 기준으로 계산돼요.",
        confirmLabel: "자리 바꾸기",
      }))
    )
      return;
    setBusy(true);
    try {
      await swapSeats({ a, b, scope, week, date });
      toast(`💺 ${nameOf(a)} ↔ ${nameOf(b)} 자리를 바꿨어요 (${label}).`, "success");
      setA(0);
      setB(0);
    } catch (e) {
      toast(e instanceof Error ? e.message : "자리 변경에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    const label = scope === "day" ? `오늘(${date})` : `${period}기`;
    if (
      !(await confirm({
        title: `${label} 자리 교환을 모두 되돌릴까요?`,
        body: "원래 자리표로 돌아가요. (학생이 실버로 신청해 승인된 교환도 함께 지워지니 주의하세요)",
        confirmLabel: "되돌리기",
        danger: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await clearSwaps({ scope, week, date });
      toast(`↩️ ${label} 자리 교환을 되돌렸어요.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "되돌리기에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const sel = (value: number, onChange: (v: number) => void, label: string) => (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-ink-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 rounded-btn border border-ink-300 px-2 py-1.5 text-sm"
      >
        <option value={0}>학생 선택</option>
        {active.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id}번 {s.name} — {seatOf(s.id)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">💺 자리 바꾸기 (선생님)</h2>
      <p className="mt-1 text-xs text-ink-600">
        다툼 등으로 급히 떼어놓아야 할 때, 두 학생의 자리를 바로 맞바꿔요. 학생 화면에 즉시
        반영되고 <b>모둠 점수도 바뀐 자리 기준</b>으로 계산돼요.
      </p>

      <div className="mt-3 flex gap-1.5">
        {(["day", "session"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setScope(k)}
            className={`press flex-1 rounded-btn px-3 py-2 text-xs font-bold ${
              scope === k ? "bg-brand text-white" : "border border-ink-200 bg-white text-ink-500"
            }`}
          >
            {k === "day" ? `📅 오늘 하루만 (${date.slice(5)})` : `🗓 이번 ${period}기 내내`}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {sel(a, setA, "A")}
        <span className="text-sm font-bold text-ink-400">↔</span>
        {sel(b, setB, "B")}
      </div>

      {sameGroup && (
        <p className="mt-2 rounded-btn bg-warn-weak px-3 py-2 text-xs text-warn">
          ⚠️ 두 학생이 <b>같은 {groupIdOf(a)}모둠</b>이에요 — 맞바꾸면 역할만 바뀌고 여전히 같은
          모둠이라 <b>떨어지지 않아요</b>. 떼어놓으려면 <b>다른 모둠</b> 학생과 바꿔주세요.
        </p>
      )}

      <button
        onClick={() => void run()}
        disabled={busy || !a || !b}
        className="press mt-2.5 w-full rounded-btn bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? "적용 중…" : "💺 두 학생 자리 바꾸기"}
      </button>

      {list.length > 0 && (
        <div className="mt-3 border-t border-ink-100 pt-2.5">
          <p className="text-xs font-bold text-ink-700">
            {scope === "day" ? `오늘 적용된 교환 ${list.length}건` : `${period}기 적용된 교환 ${list.length}건`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {list.map((s, i) => (
              <li key={i} className="rounded-btn bg-ink-50 px-3 py-1.5 text-xs text-ink-600">
                {nameOf(s.a)} ↔ {nameOf(s.b)}
              </li>
            ))}
          </ul>
          <button
            onClick={() => void reset()}
            disabled={busy}
            className="press mt-2 w-full rounded-btn border border-ink-300 bg-white py-2 text-xs font-bold text-ink-600 disabled:opacity-50"
          >
            ↩️ 이 {scope === "day" ? "날" : "기"}의 교환 모두 되돌리기
          </button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-400">
        💡 오늘 하루 교환은 그날 집계에만 반영돼요. 계속 떨어뜨려 놓으려면 &lsquo;이번 기 내내&rsquo;로
        바꾸세요. 이미 집계가 끝난 지난 날짜의 점수는 그대로 유지돼요.
      </p>
    </section>
  );
}
