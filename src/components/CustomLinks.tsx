"use client";
// 커스텀 링크 카드 (1학기 이식 + 자유도 확장: 이모지·설명·교사 전용·순서).
import { useSession } from "@/stores/session";
import { useCustomLinks } from "@/lib/query/classMeta";

export default function CustomLinks() {
  const { role } = useSession();
  const { data: links } = useCustomLinks();

  const visible = (links ?? []).filter((l) => !l.teacherOnly || role === "teacher");
  if (!visible.length) return null;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="font-bold">🔗 바로가기</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((l) => (
          <a
            key={l.id}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 rounded-btn border border-ink-200 bg-ink-50 p-3 transition-colors hover:border-brand/40 hover:bg-brand-weak"
          >
            <span className="text-xl">{l.emoji || "🔗"}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink-700">
                {l.title}
                {l.teacherOnly && <span className="ml-1 text-[10px] text-amber-500">교사</span>}
              </span>
              {l.desc && <span className="block truncate text-xs text-ink-400">{l.desc}</span>}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
