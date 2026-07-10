"use client";
// 부서장 평가 한 줄 — 나(부서장)가 내 부서 미션 2개로 모둠원 한 명을 평가한다.
// 미션마다 0/1로 표기: 지켰으면 눌러 켜서 1(초록), 안 했으면 0(그대로). 점수 = 미션 합(0·1·2).
// 마이너스 없음 · 손대기 전은 0점 → 결석·미평가 학생이 남에게 −를 주는 일이 없다 (사용자 확정).
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
  const cur = criteria.map((_, i) => checks[i] ?? false);
  const score = peerScoreFromChecks(cur); // 0 · 1 · 2
  const scoreCls = score > 0 ? "bg-success text-white" : "bg-ink-200 text-ink-500";

  return (
    <li className="rounded-btn bg-ink-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[15px]">
          <span>{roleEmoji}</span>
          <b>{name}</b>
          <span className="text-xs text-ink-500">{roleLabel} 미션</span>
        </div>
        <span className={`tnum rounded-full px-2 py-0.5 text-xs font-bold ${scoreCls}`}>
          +{score}점
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
                  ? "border-success bg-success text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                  on ? "bg-white text-success" : "bg-ink-100 text-ink-400"
                }`}
              >
                {on ? "1" : "0"}
              </span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}
