"use client";
// 🧰 교실 도구 첫 화면 — 큰 타일 다섯 개 (Apple '미리알림' 목록 타일처럼 아이콘 + 이름 + 한 줄 설명).
import Link from "next/link";
import { TOOLS } from "@/components/tools/ToolsShell";
import { useBoardIndex } from "@/lib/query/tools";

export default function ToolsHome() {
  const { data: boards } = useBoardIndex(true);
  const recent = Object.entries(boards ?? {})
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, 4);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="press group flex flex-col rounded-card border border-ink-200 bg-white p-4 shadow-card transition-colors hover:bg-ink-50"
          >
            <span aria-hidden className="grid h-11 w-11 place-items-center rounded-[12px] bg-ink-100 text-[22px]">
              {t.emoji}
            </span>
            <span className="mt-3 text-[17px] font-bold text-ink-900">{t.label}</span>
            <span className="mt-0.5 text-[12.5px] leading-snug text-ink-500">{t.desc}</span>
          </Link>
        ))}
      </div>
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-bold text-ink-500">최근 칠판</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {recent.map(([id, m]) => (
              <Link key={id} href={`/tools/board#${id}`} className="press group block">
                <div className="aspect-video overflow-hidden rounded-[12px] border border-ink-200 bg-white shadow-card">
                  {m.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumb} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <p className="mt-1.5 truncate px-0.5 text-[13px] font-bold text-ink-800">{m.title || "제목 없는 칠판"}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
