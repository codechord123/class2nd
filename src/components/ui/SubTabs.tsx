"use client";
// 페이지 내부 하위탭 — 세로 나열 대신 섹션을 탭으로 구분 (요구사항: 상위탭/하위탭).
export default function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm font-medium">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${
            active === t.key ? "bg-white text-slate-800 shadow" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
