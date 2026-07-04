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

/** 게시판형 목록 스켈레톤 — [썸네일 + 제목/메타 2줄] 행 반복 (감상문·건의·투표 공용) */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-ink-100" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-11 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="mt-2 h-3 w-1/4" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 페이지 전체 로딩 — 카드 두 장 자리 (Team·교사 게이트 공용) */
export function SkeletonPage() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-28 w-full rounded-card" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}
