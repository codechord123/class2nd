// 공용 카드 — 섹션 컨테이너. 제목/설명/우측 액션 슬롯.
// 🍎 2026-11 Apple 미니멀 개편: 흰 카드 + 머리카락 테두리, 제목 17px 세미볼드 · 설명 13px 회색.
// 제목 맨 앞 이모지는 자동으로 뗀다 — 호출부는 그대로 "📬 처리할 일"처럼 써도 된다.
const LEAD_EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍|\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

export function splitLeadEmoji(title: React.ReactNode): { icon: string | null; text: React.ReactNode } {
  if (typeof title !== "string") return { icon: null, text: title };
  const m = LEAD_EMOJI.exec(title);
  return m ? { icon: m[1], text: title.slice(m[0].length) } : { icon: null, text: title };
}

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
  // 제목 맨 앞 이모지는 떼고 글자만 — 이모지 타일이 화면마다 반복돼 유치하고 산만했다 (2026-11 재설계)
  const { text } = splitLeadEmoji(title);
  return (
    <section
      className={`rise rounded-card border border-ink-200 bg-white shadow-card ${pad ? "p-5" : ""} ${className}`}
    >
      {(title || action) && (
        <div className={`flex items-start justify-between gap-3 ${pad ? "" : "p-5 pb-0"}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-bold leading-snug tracking-[-0.02em] text-ink-900">{text}</h2>}
            {desc && <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{desc}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
