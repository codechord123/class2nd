"use client";
// 법률 조항 렌더 (대한민국 법령 형식) — 헌법 탭·건의 게시판 공용.
// "제4조(부제) ① …<개정…> ② …\n[전문개정…]" → 제목 + 항 목록 + 메타로 분해.
import type { ReactNode } from "react";

const CIRCLED = /[①-⑳]/;

/** <개정…>·<신설…> 조각을 연한 회색으로 인라인 렌더 */
function withAmend(s: string, keyBase: string): ReactNode[] {
  return s.split(/(<[^>]*>)/).map((part, i) =>
    part.startsWith("<") ? (
      <span key={`${keyBase}-${i}`} className="text-[11px] text-ink-400">
        {part}
      </span>
    ) : (
      <span key={`${keyBase}-${i}`}>{part}</span>
    )
  );
}

export default function LawClause({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const meta = lines.filter((l) => /^\[.*\]$/.test(l)); // [전문개정…] 등
  const main = lines.filter((l) => !/^\[.*\]$/.test(l)).join(" ").replace(/\s+/g, " ");
  const first = main.search(CIRCLED);
  const title = first >= 0 ? main.slice(0, first).trim() : main;
  const items =
    first >= 0
      ? main.slice(first).split(/(?=[①-⑳])/).map((s) => s.trim()).filter(Boolean)
      : [];
  return (
    <div>
      {title && <p className="text-[15px] font-bold text-ink-900">{title}</p>}
      {items.map((it, i) => {
        const m = it.match(/^([①-⑳])\s*(.*)$/);
        return (
          <p key={i} className="mt-1.5 flex gap-1.5 text-sm text-ink-700">
            <span className="shrink-0 font-bold text-brand">{m?.[1] ?? "·"}</span>
            <span className="min-w-0">{withAmend(m?.[2] ?? it, `it-${i}`)}</span>
          </p>
        );
      })}
      {/* 항 번호가 없는 단순 법(옛 형식·한 문장)은 본문을 그대로 */}
      {items.length === 0 && title !== main && (
        <p className="mt-1 text-sm text-ink-700">{withAmend(main.slice(title.length).trim(), "b")}</p>
      )}
      {meta.map((mLine, i) => (
        <p key={`m-${i}`} className="mt-1 text-[11px] text-ink-400">
          {mLine}
        </p>
      ))}
    </div>
  );
}
