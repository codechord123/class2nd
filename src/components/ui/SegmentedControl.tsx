"use client";
// 세그먼트 컨트롤 — SubTabs 승격판. 활성 세그먼트에 흰 캡슐 + 옅은 그림자(토스식).
export default function SegmentedControl<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-btn bg-ink-100 p-1 text-sm font-bold">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`press flex-1 whitespace-nowrap rounded-[11px] px-3 py-2 transition-colors ${
            active === t.key ? "bg-white text-ink-900 shadow-card" : "text-ink-500 hover:text-ink-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
