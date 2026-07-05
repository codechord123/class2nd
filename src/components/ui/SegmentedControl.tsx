"use client";
// 세그먼트 컨트롤 — SubTabs 승격판. 활성 세그먼트에 흰 캡슐 + 옅은 그림자(토스식).
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
    <div className="flex gap-1 overflow-x-auto rounded-btn border border-ink-200 bg-ink-200/60 p-1 text-sm font-bold">
      {tabs.map((t) => (
        <button
          // 활성 전환 시 리마운트 → 흰 캡슐이 통통 (juice — 앱 전체 하위탭 공통)
          key={`${t.key}-${active === t.key}`}
          onClick={() => onChange(t.key)}
          className={`press flex-1 whitespace-nowrap rounded-[11px] px-3 py-2 transition-colors ${
            active === t.key
              ? "badge-pop bg-white font-extrabold text-brand-strong shadow-card"
              : "text-ink-500 hover:text-ink-700"
          }`}
        >
          {stripEmoji(t.label)}
        </button>
      ))}
    </div>
  );
}
