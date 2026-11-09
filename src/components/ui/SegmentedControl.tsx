"use client";
// 세그먼트 컨트롤 — SubTabs 승격판. 활성 세그먼트에 흰 캡슐 + 옅은 그림자(Apple식).
// 컨트롤(탭·버튼류)에서는 이모지를 걷어내 정돈된 인상으로 — 호출부 라벨은 그대로 두고
// 렌더 시점에 제거한다 (이모지는 콘텐츠 영역의 배지·제목에서만).
const stripEmoji = (s: string) =>
  s.replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/\s{2,}/g, " ").trim();

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
    // 트랙은 배경(ink-100)보다 한 톤 어둡게 — 회색 페이지 배경 위에서도 경계가 보이게
    // Apple 세그먼트: 옅은 회색 트랙 + 흰 캡슐, 활성은 검정 글씨 (색은 '행동'에만 쓴다)
    <div className="flex gap-0.5 overflow-x-auto rounded-[10px] bg-ink-200/70 p-[3px] text-[13px] font-bold">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`press flex-1 whitespace-nowrap rounded-[8px] px-3 py-1.5 transition-colors ${
            active === t.key
              ? "bg-white text-ink-900 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
              : "text-ink-600 hover:text-ink-900"
          }`}
        >
          {stripEmoji(t.label)}
        </button>
      ))}
    </div>
  );
}
