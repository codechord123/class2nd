"use client";
// 커스텀 링크 관리 — 이모지·설명·교사 전용·순서 이동까지 (1학기보다 자유도 확장).
import { useState } from "react";
import { useCustomLinks, useSaveCustomLinks, type CustomLink } from "@/lib/query/classMeta";

export default function LinksEditor() {
  const { data: links } = useCustomLinks();
  const save = useSaveCustomLinks();
  const [form, setForm] = useState({ emoji: "🔗", title: "", desc: "", url: "" });
  const [teacherOnly, setTeacherOnly] = useState(false);
  const [msg, setMsg] = useState("");

  async function add() {
    setMsg("");
    try {
      if (!form.title.trim()) throw new Error("링크 이름을 입력하세요.");
      let url = form.url.trim();
      if (!url) throw new Error("주소(URL)를 입력하세요.");
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      const link: CustomLink = {
        id: Date.now(),
        emoji: form.emoji.trim() || "🔗",
        title: form.title.trim(),
        ...(form.desc.trim() ? { desc: form.desc.trim() } : {}),
        url,
        ...(teacherOnly ? { teacherOnly: true } : {}),
      };
      await save([...(links ?? []), link]);
      setForm({ emoji: "🔗", title: "", desc: "", url: "" });
      setTeacherOnly(false);
      setMsg("✅ 링크가 추가되었습니다.");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "실패"}`);
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const arr = [...(links ?? [])];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    await save(arr);
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-card">
      <h2 className="text-lg font-bold">🔗 바로가기 링크 관리</h2>
      <p className="mt-1 text-xs text-ink-500">
        패들렛, 학급 홈페이지 등 자주 쓰는 링크를 홈 화면에 카드로 띄웁니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={form.emoji}
          onChange={(e) => setForm({ ...form, emoji: e.target.value })}
          className="w-14 rounded-lg border border-ink-300 px-2 py-2 text-center text-sm"
          title="이모지"
        />
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="이름 (예: 오늘의 패들렛)"
          className="min-w-32 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm"
        />
        <input
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="주소 (URL)"
          className="min-w-40 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm"
        />
        <input
          value={form.desc}
          onChange={(e) => setForm({ ...form, desc: e.target.value })}
          placeholder="설명 (선택)"
          className="min-w-28 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-ink-500">
          <input
            type="checkbox"
            checked={teacherOnly}
            onChange={(e) => setTeacherOnly(e.target.checked)}
          />
          교사만
        </label>
        <button
          onClick={() => void add()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
        >
          추가
        </button>
      </div>
      {(links?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {links!.map((l, i) => (
            <li key={l.id} className="flex items-center justify-between rounded bg-ink-50 px-3 py-1.5">
              <span className="min-w-0 truncate">
                {l.emoji} <b>{l.title}</b>{" "}
                <span className="text-xs text-ink-400">
                  {l.url}
                  {l.teacherOnly && " · 교사만"}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5 text-xs">
                <button onClick={() => void move(i, -1)} className="text-ink-400 hover:text-ink-600">▲</button>
                <button onClick={() => void move(i, 1)} className="text-ink-400 hover:text-ink-600">▼</button>
                <button
                  onClick={() => void save(links!.filter((x) => x.id !== l.id))}
                  className="text-rose-400 hover:text-rose-600"
                >
                  삭제
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
