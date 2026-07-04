// 스켈레톤 로딩 — "불러오는 중…" 텍스트를 대체하는 시각적 로딩.
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-btn ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-2/3" />
    </div>
  );
}
