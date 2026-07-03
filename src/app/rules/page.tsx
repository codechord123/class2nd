"use client";
// 우리 반 헌법·법률·역할 — 텍스트영역 → 조항 카드 리스트(모듈형).
// 저장 스키마(classData/constitution: 문자열 배열)는 유지 → 기존 데이터 호환.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { ROLE_INFO } from "@/lib/roster";
import { useConstitution, useSaveConstitution, type Constitution } from "@/lib/query/classMeta";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Field";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useFeedback } from "@/components/ui/Feedback";

const SUBTABS = [
  { key: "articles", label: "📜 헌법" },
  { key: "laws", label: "⚖️ 법률" },
  { key: "roles", label: "🎭 역할" },
] as const;
type SubKey = (typeof SUBTABS)[number]["key"];

const HEADING: Record<SubKey, string> = {
  articles: "조",
  laws: "법",
  roles: "역할",
};

export default function RulesPage() {
  const { role } = useSession();
  const { data: c } = useConstitution();
  const save = useSaveConstitution();
  const { toast, confirm } = useFeedback();

  const [tab, setTab] = useState<SubKey>("articles");
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<string[]>([]); // 편집 중인 조항 배열

  if (!c) return <SkeletonCard />;

  // 역할 탭이 비어 있으면 기본 역할표를 보여준다
  const viewItems =
    tab === "roles" && c.roles.length === 0
      ? ROLE_INFO.map((r) => `${r.emoji} ${r.dept} [${r.key} 지킴이] — ${r.desc}`)
      : c[tab];

  function startEdit() {
    setItems([...viewItems]);
    setEditing(true);
  }
  function switchTab(next: SubKey) {
    setTab(next);
    setEditing(false);
  }

  async function saveEdit() {
    try {
      const cleaned = items.map((s) => s.trim()).filter(Boolean);
      const next: Constitution = { ...c!, [tab]: cleaned };
      await save(next);
      setEditing(false);
      toast("✅ 저장되었어요!");
    } catch (e) {
      toast(`⚠️ 저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  return (
    <div className="space-y-4">
      <Card
        title="🏛️ 우리 반 민주교실"
        desc="학생들이 함께 만든 헌법·법률·역할이에요."
        action={
          role === "teacher" &&
          !editing && (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              ✏️ 수정
            </Button>
          )
        }
      >
        <div className="mt-4">
          <SegmentedControl tabs={SUBTABS as unknown as { key: SubKey; label: string }[]} active={tab} onChange={switchTab} />
        </div>

        {editing ? (
          <div className="mt-4 space-y-2">
            {items.map((line, i) => (
              <div key={i} className="flex items-start gap-2 rounded-card bg-ink-50 p-2.5">
                <span className="tnum mt-2 w-7 shrink-0 text-center text-xs font-bold text-ink-400">
                  {i + 1}
                </span>
                <Textarea
                  value={line}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
                  rows={2}
                  placeholder={`${HEADING[tab]} 내용을 적어주세요`}
                />
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="press flex h-6 w-6 items-center justify-center rounded-md bg-ink-100 text-ink-500 disabled:opacity-30"
                    aria-label="위로"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    className="press flex h-6 w-6 items-center justify-center rounded-md bg-ink-100 text-ink-500 disabled:opacity-30"
                    aria-label="아래로"
                  >
                    ▼
                  </button>
                </div>
                <button
                  onClick={() =>
                    void confirm({ title: "이 항목을 삭제할까요?", danger: true, confirmLabel: "삭제" }).then(
                      (ok) => ok && setItems(items.filter((_, j) => j !== i))
                    )
                  }
                  className="press mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger-weak"
                  aria-label="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setItems([...items, ""])}
              className="press w-full rounded-card border border-dashed border-ink-300 py-2.5 text-sm font-bold text-ink-500 hover:bg-ink-50"
            >
              + 항목 추가
            </button>
            <div className="flex gap-2 pt-1">
              <Button onClick={() => void saveEdit()}>저장</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                취소
              </Button>
            </div>
          </div>
        ) : viewItems.length === 0 ? (
          <EmptyState
            emoji="📝"
            title="아직 내용이 없어요"
            desc={role === "teacher" ? "✏️ 수정을 눌러 채워주세요." : "곧 채워질 거예요!"}
          />
        ) : (
          <ol className="mt-4 space-y-2">
            {viewItems.map((line, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-card bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-700"
              >
                <span className="tnum shrink-0 font-bold text-brand">{i + 1}</span>
                <span className="whitespace-pre-wrap">{line}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
