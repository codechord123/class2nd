"use client";
// 텍스트형 → 모듈형: 평가 척도(프리셋+미리보기), 순위 점수(스텝퍼 행).
import ChipToggle from "@/components/ui/ChipToggle";
import NumberStepper from "@/components/ui/NumberStepper";

function buildRange(max: number, includeZero: boolean): number[] {
  const neg = Array.from({ length: max }, (_, i) => -(max - i)); // -max..-1
  const pos = Array.from({ length: max }, (_, i) => i + 1); // 1..max
  return [...neg, ...(includeZero ? [0] : []), ...pos];
}

/** 평가 척도 — 학생에게 보일 점수 버튼 세트. 범위(±) 프리셋 + 0 포함 토글 + 미리보기. */
export function ScaleEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const max = Math.max(1, ...value.map((n) => Math.abs(n)));
  const hasZero = value.includes(0);

  return (
    <div className="rounded-card bg-ink-50 p-4">
      <p className="text-sm font-bold text-ink-800">{label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {[1, 2, 3].map((m) => (
          <ChipToggle
            key={m}
            label={`±${m}`}
            active={max === m}
            onClick={() => onChange(buildRange(m, hasZero))}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <ChipToggle
          label="0 포함"
          active={hasZero}
          onClick={() => onChange(buildRange(max, !hasZero))}
        />
      </div>
      {/* 미리보기 — 학생 화면에서 보일 버튼 */}
      <div className="mt-3">
        <p className="text-[11px] text-ink-400">학생에게 이렇게 보여요</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {value.map((v) => (
            <span
              key={v}
              className={`tnum min-w-9 rounded-btn px-2 py-1 text-center text-sm font-bold ${
                v > 0
                  ? "bg-success-weak text-success"
                  : v < 0
                    ? "bg-danger-weak text-danger"
                    : "bg-ink-100 text-ink-500"
              }`}
            >
              {v > 0 ? `+${v}` : v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 오늘의 모둠 점수 — 모둠 간 평가 폐지 후 순위는 '오늘의 모둠(1위)'만 존재. */
export function RankPointsEditor({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <div className="rounded-card bg-ink-50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-ink-800">👑 오늘의 모둠 점수</span>
        <NumberStepper
          value={value[0] ?? 5}
          min={0}
          max={20}
          onChange={(v) => onChange([v, ...value.slice(1)])}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-400">
        선생님이 고른 오늘의 모둠 전원이 받는 점수예요. (다른 모둠은 0점)
      </p>
    </div>
  );
}
