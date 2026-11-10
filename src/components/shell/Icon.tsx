// 내비게이션 선 아이콘 — 이모지 대신 1.75px 선 그림 (구형 Windows에서도 모양이 같고, 화면이 차분해진다).
// 24×24 격자, currentColor. 새 아이콘은 같은 굵기·둥근 끝으로만 그린다.
const P: Record<string, React.ReactNode> = {
  law: (
    <>
      <path d="M12 4v16M6 20h12" />
      <path d="M5 8h14M7.5 8 4.5 14a3 3 0 0 0 6 0L7.5 8ZM16.5 8l-3 6a3 3 0 0 0 6 0l-3-6Z" />
    </>
  ),
  today: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 19a4 4 0 0 1 6.5-3" />
    </>
  ),
  read: (
    <>
      <path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2Z" />
      <path d="M12 6.5v13" />
    </>
  ),
  shop: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  life: (
    <>
      <path d="M12 20s-7-4.3-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.7 12 20 12 20Z" />
    </>
  ),
  teacher: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="2" />
      <path d="M8 20h8M12 15.5V20" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8-8M16 6l2 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
};

export default function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {P[name]}
    </svg>
  );
}
