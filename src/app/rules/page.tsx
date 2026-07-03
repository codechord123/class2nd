"use client";
// 우리 반 헌법·법률·역할 (요구사항 v2 §7) — 학생·교사 모두 열람, 교사는 즉시 수정.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { ROLE_INFO } from "@/lib/roster";
import { useConstitution, useSaveConstitution, type Constitution } from "@/lib/query/classMeta";

const SUBTABS = [
  { key: "articles", label: "📜 헌법" },
  { key: "laws", label: "⚖️ 법률" },
  { key: "roles", label: "🎭 역할" },
] as const;
type SubKey = (typeof SUBTABS)[number]["key"];

export default function RulesPage() {
  const { role } = useSession();
  const { data: c } = useConstitution();
  const save = useSaveConstitution();

  const [tab, setTab] = useState<SubKey>("articles");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");

  if (!c) return <p className="text-sm text-slate-400">불러오는 중…</p>;

  // 역할 탭이 비어 있으면 기본 역할표를 보여준다
  const items =
    tab === "roles" && c.roles.length === 0
      ? ROLE_INFO.map((r) => `${r.emoji} ${r.dept} [${r.key} 지킴이] — ${r.desc}`)
      : c[tab];

  function startEdit() {
    setDraft(items.join("\n"));
    setEditing(true);
    setMsg("");
  }

  async function saveEdit() {
    try {
      const next: Constitution = {
        ...c!,
        [tab]: draft.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      await save(next);
      setEditing(false);
      setMsg("✅ 저장되었습니다.");
    } catch (e) {
      setMsg(`⚠️ 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">🏛️ 우리 반 민주교실</h2>
          {role === "teacher" && !editing && (
            <button
              onClick={startEdit}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              ✏️ 수정
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {SUBTABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setEditing(false);
                setMsg("");
              }}
              className={`flex-1 rounded-md py-2 ${
                tab === t.key ? "bg-white shadow text-slate-800" : "text-slate-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {editing ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-400">한 줄이 조항 하나예요. 자유롭게 고쳐주세요.</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void saveEdit()}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
              >
                저장
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-500"
              >
                취소
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            아직 내용이 없어요. {role === "teacher" ? "✏️ 수정을 눌러 채워주세요." : "곧 채워질 거예요!"}
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {items.map((line, i) => (
              <li
                key={i}
                className="rounded-lg bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-700"
              >
                {line}
              </li>
            ))}
          </ol>
        )}
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </section>
    </div>
  );
}
