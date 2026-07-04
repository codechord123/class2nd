// 빈 상태 — 이모지 일러스트 + 안내 (토스식 친근한 empty).
export default function EmptyState({
  emoji = "🫧",
  title,
  desc,
  action,
}: {
  emoji?: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
      <span className="text-3xl">{emoji}</span>
      <p className="mt-1 text-sm font-bold text-ink-700">{title}</p>
      {desc && <p className="text-xs text-ink-400">{desc}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
