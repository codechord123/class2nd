"use client";
// 페이지 그룹 방식 페이지네이션 (네이버·다음식):
//   « [1 2 3 4 5] »   →   « [6 7 8 9 10] »   →   …
// 좁은 폰에서도 오버플로우 없이 그룹 크기만큼만 노출. 감상문·건의 게시판 공용.
export default function Pager({
  page,
  totalPages,
  onChange,
  groupSize = 5,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  groupSize?: number;
}) {
  if (totalPages <= 1) return null;
  const groupIdx = Math.floor((page - 1) / groupSize);
  const start = groupIdx * groupSize + 1;
  const end = Math.min(start + groupSize - 1, totalPages);
  const hasPrev = start > 1;
  const hasNext = end < totalPages;
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, start - 1))}
        disabled={!hasPrev}
        aria-label="이전 페이지 그룹"
        className="press tnum min-w-8 rounded-btn bg-ink-100 px-2 py-1 text-sm font-bold text-ink-600 hover:bg-ink-200 disabled:opacity-30"
      >
        «
      </button>
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`press tnum min-w-8 rounded-btn px-2 py-1 text-sm font-bold ${
            p === page ? "bg-brand text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(Math.min(totalPages, end + 1))}
        disabled={!hasNext}
        aria-label="다음 페이지 그룹"
        className="press tnum min-w-8 rounded-btn bg-ink-100 px-2 py-1 text-sm font-bold text-ink-600 hover:bg-ink-200 disabled:opacity-30"
      >
        »
      </button>
    </div>
  );
}
