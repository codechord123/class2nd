"use client";
// 부서장 평가 한 줄 — 나(부서장)가 내 부서 O/X 기준으로 모둠원 한 명을 평가한다.
// 스케일(-1/0/+1) 대신 관찰 가능한 O/X 2개 → 점수 자동(전부 O +1·일부 0·전부 X −1).
import { peerScoreFromChecks } from "@/lib/peerCriteria";

export default function PeerEvalRow({
  name,
  roleEmoji,
  roleLabel,
  criteria,
  checks,
  onToggle,
}: {
  name: string;
  roleEmoji: string;
  roleLabel: string;
  criteria: string[];
  checks: boolean[];
  onToggle: (idx: number) => void;
}) {
  const evaluated = checks.length > 0; // 한 번이라도 체크했는지 — 손대기 전은 '미평가'(0점)
  const cur = criteria.map((_, i) => checks[i] ?? false);
  const score = evaluated ? peerScoreFromChecks(cur) : 0; // 미평가면 0 (자동 −1 방지)
  const scoreCls = !evaluated
    ? "bg-ink-200 text-ink-500"
    : score > 0
      ? "bg-success text-white"
      : score < 0
        ? "bg-danger text-white"
        : "bg-ink-200 text-ink-600";

  return (
    <li className="rounded-btn bg-ink-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[15px]">
          <span>{roleEmoji}</span>
          <b>{name}</b>
          <span className="text-xs text-ink-500">{roleLabel} 기준</span>
        </div>
        <span className={`tnum rounded-full px-2 py-0.5 text-xs font-bold ${scoreCls}`}>
          {!evaluated ? "미평가" : score > 0 ? `+${score}점` : `${score}점`}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {criteria.map((c, i) => {
          const on = cur[i];
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              className={`press flex w-full items-center gap-2 rounded-btn border px-3 py-2 text-left text-sm transition-colors ${
                on
                  ? "border-success bg-success-weak text-ink-900"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  on ? "bg-success text-white" : evaluated ? "bg-danger text-white" : "bg-ink-100 text-ink-400"
                }`}
              >
                {on ? "O" : evaluated ? "X" : "·"}
              </span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}
