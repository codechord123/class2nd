"use client";
// 칩 토글 — 태그·필터·선택지용 알약 버튼 (선택 시 브랜드/성취색).
type Tone = "brand" | "success";

export default function ChipToggle({
  label,
  active,
  onClick,
  tone = "brand",
}: {
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: Tone;
}) {
  const on =
    tone === "success" ? "bg-success text-white" : "bg-brand text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? on : "bg-ink-100 text-ink-500 hover:bg-ink-200"
      }`}
    >
      {label}
    </button>
  );
}
