// 스탯 카드 — 성취 숫자를 크게·또렷하게 (토스식 큰 숫자 위계).
type Tone = "neutral" | "brand" | "success" | "warn";

const TONE: Record<Tone, { box: string; num: string; label: string }> = {
  neutral: { box: "border-ink-200 bg-white", num: "text-ink-900", label: "text-ink-500" },
  brand: { box: "border-transparent bg-brand-weak", num: "text-brand-strong", label: "text-brand" },
  success: { box: "border-transparent bg-success-weak", num: "text-success", label: "text-success" },
  warn: { box: "border-transparent bg-warn-weak", num: "text-warn", label: "text-warn" },
};

export default function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className={`rounded-card border p-3.5 text-center ${t.box}`}>
      <p className={`text-xs font-medium ${t.label}`}>{label}</p>
      <p className={`tnum mt-1 text-2xl font-extrabold ${t.num}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-400">{sub}</p>}
    </div>
  );
}
