"use client";
// 부서장 평가 한 줄 — 나(부서장)가 내 부서 미션 2개로 모둠원 한 명을 평가한다.
// 미션을 지켰으면 글상자를 눌러 색을 넣고(초록), 안 했으면 그냥 둔다(색 없음).
// 점수: 2개 다 함 +1 · 하나만 0 · 하나도 안 함 −2 (peerScoreFromChecks).
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
  const evaluated = checks.length > 0; // 게이트로 이미 저장됨 — 열려 있으면 항상 true
  const cur = criteria.map((_, i) => checks[i] ?? false);
  const score = evaluated ? peerScoreFromChecks(cur) : 0;
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
          <span className="text-xs text-ink-500">{roleLabel} 미션</span>
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
                  ? "border-success bg-success text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
              }`}
            >
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c}</span>
              {on && <span className="shrink-0 text-xs font-bold text-white/90">✓ 했어요</span>}
            </button>
          );
        })}
      </div>
    </li>
  );
}
