"use client";
// 📑 왼쪽 분류 목록 + 오른쪽 내용 — 설정 앱처럼 '고른 분류 하나만' 보여 준다.
// 2026-11 사용자: "선생님 탭은 레이아웃과 위계 정리가 필요해" — 설정이 펼치면 6,700px, 점수 보정 11개 패널이
// 한 줄로 쌓여 찾기 어려웠다. 위계: 화면 제목 → (세그먼트) → 분류 목록 → 카드.
// 휴대폰에선 분류가 위쪽 가로 칩 줄이 된다.
export interface Section<K extends string> {
  key: K;
  label: string;
  desc?: string; // 목록에서 이름 아래 한 줄 (무엇이 들어 있는지)
  badge?: number; // 처리할 것 수
}

export default function SideSections<K extends string>({
  sections,
  active,
  onChange,
  children,
}: {
  sections: Section<K>[];
  active: K;
  onChange: (k: K) => void;
  children: React.ReactNode;
}) {
  const cur = sections.find((s) => s.key === active) ?? sections[0];
  return (
    <div className="grid items-start gap-5 md:grid-cols-[208px_minmax(0,1fr)]">
      {/* 휴대폰: 가로 칩 */}
      <div className="-mx-4 overflow-x-auto px-4 md:hidden">
        <ul className="flex gap-1.5 whitespace-nowrap">
          {sections.map((s) => (
            <li key={s.key}>
              <button
                onClick={() => onChange(s.key)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-bold ${
                  s.key === cur.key ? "bg-ink-900 text-white" : "bg-white text-ink-700 shadow-[0_0_0_1px_var(--color-ink-200)]"
                }`}
              >
                {s.label}
                {!!s.badge && <span className="rounded-full bg-danger px-1.5 text-[11px] text-white">{s.badge}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {/* 태블릿·PC: 세로 목록 */}
      <nav aria-label="분류" className="hidden overflow-hidden rounded-card border border-ink-200 bg-white md:sticky md:top-6 md:block">
        <ul className="py-1.5">
          {sections.map((s) => {
            const on = s.key === cur.key;
            return (
              <li key={s.key}>
                <button
                  onClick={() => onChange(s.key)}
                  aria-current={on ? "true" : undefined}
                  className={`flex w-full items-start gap-2 px-4 py-2.5 text-left transition-colors ${on ? "bg-ink-100" : "hover:bg-ink-50"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14.5px] ${on ? "font-bold text-ink-900" : "font-bold text-ink-700"}`}>{s.label}</span>
                    {s.desc && <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">{s.desc}</span>}
                  </span>
                  {!!s.badge && (
                    <span className="mt-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">
                      {s.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 space-y-4">
        <div className="hidden md:block">
          <h2 className="text-[19px] font-bold tracking-tight text-ink-900">{cur.label}</h2>
          {cur.desc && <p className="mt-0.5 text-[13px] text-ink-500">{cur.desc}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
