"use client";
// ✅ 체크리스트 — 두 종류.
//   · 학생 확인: 우리 반 이름 타일을 눌러 제출·회신을 체크 → "아직: ○○, ○○"이 바로 보인다(복사 가능)
//   · 할 일   : Things 3처럼 동그라미 체크, 끝낸 일은 아래로 흐리게
// 저장: classData/checklists 문서 하나 — 누를 때마다 그 칸만 서버에 (다른 기기에서도 이어서).
import { useMemo, useState } from "react";
import { students } from "@/lib/roster";
import { useChecklists, useChecklistOps, type Checklist, type ChecklistKind } from "@/lib/query/tools";
import { useFeedback } from "@/components/ui/Feedback";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";

const TEMPLATES: { title: string; kind: ChecklistKind }[] = [
  { title: "숙제 제출", kind: "roster" },
  { title: "가정통신문 회신", kind: "roster" },
  { title: "오늘 할 일", kind: "todo" },
];

export default function ChecklistPage() {
  const { data: lists, isLoading } = useChecklists(true);
  const ops = useChecklistOps();
  const { toast, confirm } = useFeedback();
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ChecklistKind>("roster");

  const sorted = useMemo(
    () => Object.entries(lists ?? {}).sort((a, b) => b[1].createdAt - a[1].createdAt),
    [lists]
  );
  const activeId = sel && lists?.[sel] ? sel : (sorted[0]?.[0] ?? null);
  const active = activeId ? lists?.[activeId] : undefined;

  const fail = () => toast("저장하지 못했어요. 인터넷 연결을 확인해 주세요.", "error");
  const create = async (t: string, k: ChecklistKind) => {
    if (!t.trim()) return;
    try {
      const id = await ops.create(t.trim(), k);
      setSel(id);
      setCreating(false);
      setTitle("");
    } catch {
      fail();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* 목록 — 미리알림 사이드바 */}
      <aside className="space-y-2">
        <div className="overflow-hidden rounded-card border border-ink-200 bg-white shadow-card">
          {isLoading ? (
            <p className="px-4 py-3 text-sm text-ink-400">불러오는 중…</p>
          ) : sorted.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-400">아직 목록이 없어요</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {sorted.map(([id, l]) => {
                const total = l.kind === "roster" ? students.filter((s) => !s.inactive).length : Object.keys(l.items ?? {}).length;
                const done = Object.keys(l.done ?? {}).length;
                const on = id === activeId;
                return (
                  <li key={id}>
                    <button
                      onClick={() => setSel(id)}
                      className={`flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors ${on ? "bg-ink-100" : "hover:bg-ink-50"}`}
                    >
                      <span aria-hidden className="text-[17px]">{l.kind === "roster" ? "👥" : "☑️"}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-900">{l.title}</span>
                      <span className={`text-[13px] font-bold tabular-nums ${total && done >= total ? "text-success" : "text-ink-400"}`}>
                        {Math.min(done, total)}/{total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {creating ? (
          <div className="space-y-2 rounded-card border border-ink-200 bg-white p-3 shadow-card">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void create(title, kind);
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="목록 이름 (예: 수학 익힘 p.42)"
              className="h-10 w-full rounded-btn bg-ink-50 px-3 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-brand/30"
            />
            <SegmentedControl
              tabs={[
                { key: "roster", label: "학생 확인" },
                { key: "todo", label: "할 일" },
              ]}
              active={kind}
              onChange={setKind}
            />
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)} className="press h-9 flex-1 rounded-btn bg-ink-100 text-sm font-bold text-ink-700">
                취소
              </button>
              <button
                onClick={() => void create(title, kind)}
                disabled={!title.trim()}
                className="press h-9 flex-1 rounded-btn bg-ink-900 text-sm font-bold text-white disabled:opacity-30"
              >
                만들기
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="press flex h-11 w-full items-center gap-2 rounded-card px-4 text-[15px] font-bold text-brand hover:bg-brand-weak"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-sm text-white">+</span>
            새 목록
          </button>
        )}
      </aside>

      {/* 본문 */}
      <section className="min-w-0">
        {active && activeId ? (
          <Detail
            key={activeId}
            id={activeId}
            list={active}
            onFail={fail}
            onDelete={async () => {
              if (!(await confirm({ title: `'${active.title}' 목록을 지울까요?`, body: "체크한 기록도 함께 사라져요.", danger: true, confirmLabel: "지우기" })))
                return;
              try {
                await ops.remove(activeId);
                setSel(null);
              } catch {
                fail();
              }
            }}
          />
        ) : (
          <div className="rounded-card border border-ink-200 bg-white p-6 shadow-card">
            <EmptyState emoji="✅" title="체크리스트를 만들어 보세요" desc="숙제 제출·회신 확인은 '학생 확인', 수업 준비는 '할 일'" />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  onClick={() => void create(t.title, t.kind)}
                  className="press rounded-full bg-ink-100 px-4 py-2 text-sm font-bold text-ink-800 hover:bg-ink-200"
                >
                  + {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Detail({ id, list, onDelete, onFail }: { id: string; list: Checklist; onDelete: () => void; onFail: () => void }) {
  const ops = useChecklistOps();
  const { toast } = useFeedback();
  const [name, setName] = useState(list.title);
  const done = list.done ?? {};
  const safe = (p: Promise<unknown>) => void p.catch(onFail);

  const header = (total: number, n: number) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== list.title && safe(ops.rename(id, name.trim()))}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 bg-transparent text-[24px] font-bold tracking-tight text-ink-900 outline-none"
          aria-label="목록 이름"
        />
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => safe(ops.resetChecks(id))}
            disabled={!n}
            className="press h-8 rounded-full px-3 text-[13px] font-bold text-ink-600 hover:bg-ink-100 disabled:opacity-30"
          >
            모두 해제
          </button>
          <button onClick={onDelete} className="press h-8 rounded-full px-3 text-[13px] font-bold text-danger hover:bg-danger-weak">
            삭제
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${total && n >= total ? "bg-success" : "bg-brand"}`}
            style={{ width: `${total ? (Math.min(n, total) / total) * 100 : 0}%` }}
          />
        </div>
        <span className="text-[13px] font-bold tabular-nums text-ink-500">
          {Math.min(n, total)}/{total}
        </span>
      </div>
    </div>
  );

  if (list.kind === "roster") {
    const roster = students.filter((s) => !s.inactive);
    const n = roster.filter((s) => done[String(s.id)]).length;
    const missing = roster.filter((s) => !done[String(s.id)]);
    return (
      <div className="space-y-4 rounded-card border border-ink-200 bg-white p-5 shadow-card">
        {header(roster.length, n)}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {roster.map((s) => {
            const on = !!done[String(s.id)];
            return (
              <button
                key={s.id}
                onClick={() => safe(ops.toggle(id, String(s.id), !on))}
                aria-pressed={on}
                className={`press flex min-h-14 items-center gap-2 rounded-[12px] px-3 text-left transition-colors ${
                  on ? "bg-success-weak" : "bg-ink-50 hover:bg-ink-100"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    on ? "bg-success text-white" : "border-[1.5px] border-ink-300"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold leading-none text-ink-400">{s.id}</span>
                  <span className={`block truncate text-[15px] font-bold ${on ? "text-success" : "text-ink-800"}`}>{s.name}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-start justify-between gap-3 rounded-[12px] bg-ink-50 px-4 py-3">
          <p className="text-[14px] leading-relaxed text-ink-700">
            {missing.length ? (
              <>
                <b className="text-ink-900">아직 {missing.length}명</b> · {missing.map((s) => s.name).join(", ")}
              </>
            ) : (
              <b className="text-success">🎉 모두 끝났어요</b>
            )}
          </p>
          {missing.length > 0 && (
            <button
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(`${list.title} 아직: ${missing.map((s) => s.name).join(", ")}`)
                  .then(() => toast("명단을 복사했어요.", "success"))
                  .catch(() => {})
              }
              className="press shrink-0 rounded-full px-3 py-1 text-[13px] font-bold text-brand hover:bg-brand-weak"
            >
              복사
            </button>
          )}
        </div>
      </div>
    );
  }

  return <TodoDetail id={id} list={list} header={header} safe={safe} />;
}

function TodoDetail({
  id,
  list,
  header,
  safe,
}: {
  id: string;
  list: Checklist;
  header: (total: number, n: number) => React.ReactNode;
  safe: (p: Promise<unknown>) => void;
}) {
  const ops = useChecklistOps();
  const [text, setText] = useState("");
  const done = list.done ?? {};
  const items = Object.entries(list.items ?? {}).sort((a, b) => {
    const da = done[a[0]] ? 1 : 0;
    const dbb = done[b[0]] ? 1 : 0;
    return da - dbb || a[1].at - b[1].at;
  });
  const n = items.filter(([k]) => done[k]).length;
  const add = () => {
    if (!text.trim()) return;
    safe(ops.addItem(id, text.trim()));
    setText("");
  };
  return (
    <div className="space-y-3 rounded-card border border-ink-200 bg-white p-5 shadow-card">
      {header(items.length, n)}
      <ul className="-mx-2">
        {items.map(([k, it]) => {
          const on = !!done[k];
          return (
            <li key={k} className="group flex min-h-11 items-center gap-3 rounded-[10px] px-2 hover:bg-ink-50">
              <button
                onClick={() => safe(ops.toggle(id, k, !on))}
                aria-pressed={on}
                aria-label={on ? "체크 해제" : "체크"}
                className={`press grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[12px] font-bold transition-colors ${
                  on ? "bg-brand text-white" : "border-[1.5px] border-ink-300 hover:border-brand"
                }`}
              >
                {on ? "✓" : ""}
              </button>
              <span className={`min-w-0 flex-1 text-[15px] ${on ? "text-ink-400 line-through" : "text-ink-900"}`}>{it.text}</span>
              <button
                onClick={() => safe(ops.removeItem(id, k))}
                aria-label="지우기"
                className="press h-7 w-7 shrink-0 rounded-full text-ink-300 opacity-0 hover:bg-ink-100 hover:text-danger group-hover:opacity-100 focus:opacity-100"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-ink-100 pt-3">
        <span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ink-100 text-[13px] font-bold text-ink-400">
          +
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
          placeholder="새 할 일 — Enter로 추가"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-400"
        />
        {text.trim() && (
          <button onClick={add} className="press h-8 rounded-full bg-ink-900 px-3 text-[13px] font-bold text-white">
            추가
          </button>
        )}
      </div>
    </div>
  );
}
