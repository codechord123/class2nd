// 공용 카드 — 섹션 컨테이너. 제목/설명/우측 액션 슬롯.
export default function Card({
  title,
  desc,
  action,
  children,
  className = "",
  pad = true,
}: {
  title?: React.ReactNode;
  desc?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={`rise rounded-card border border-ink-200 bg-white shadow-card ${pad ? "p-4" : ""} ${className}`}
    >
      {(title || action) && (
        <div className={`flex items-start justify-between gap-3 ${pad ? "" : "p-4 pb-0"}`}>
          <div>
            {title && <h2 className="text-base font-bold text-ink-900">{title}</h2>}
            {desc && <p className="mt-1 text-xs text-ink-500">{desc}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
