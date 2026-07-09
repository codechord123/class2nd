"use client";
// 🎉 이벤트 점수 배수 (교사) — 이벤트 기간 동안 칭찬·MVP·독서 점수를 배수로 올린다.
// 집계는 '집계하는 날짜가 기간 안'일 때만 배수를 적용하므로 재집계해도 안전(멱등).
import { useState } from "react";
import NumberStepper from "@/components/ui/NumberStepper";
import { todayKST } from "@/lib/date";
import { useEventBoost, useSaveEventBoost } from "@/lib/query/classMeta";
import { DEFAULT_EVENT_BOOST, type EventBoost } from "@/lib/eventBoost";
import { useFeedback } from "@/components/ui/Feedback";

const MULTS: { key: keyof EventBoost; label: string }[] = [
  { key: "comp", label: "💌 칭찬(개인)" },
  { key: "mission", label: "🎯 칭찬 미션(팀)" },
  { key: "mvp", label: "⭐ MVP" },
  { key: "read", label: "🐢 독서" },
];

export default function EventBoostPanel() {
  const { data: saved } = useEventBoost();
  const save = useSaveEventBoost();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<EventBoost | null>(null);
  const [busy, setBusy] = useState(false);

  const cur = draft ?? saved ?? DEFAULT_EVENT_BOOST;
  const dirty = JSON.stringify(cur) !== JSON.stringify(saved ?? DEFAULT_EVENT_BOOST);
  const set = (patch: Partial<EventBoost>) => setDraft({ ...cur, ...patch });

  const boostedList = MULTS.filter((m) => (cur[m.key] as number) > 1)
    .map((m) => `${m.label.replace(/^\S+\s/, "")}×${cur[m.key]}`)
    .join(" · ");

  async function onSave() {
    if (busy) return;
    if (cur.active && (!cur.from || !cur.to || cur.from > cur.to)) {
      toast("이벤트 기간(시작·종료 날짜)을 올바르게 정해주세요.", "warn");
      return;
    }
    setBusy(true);
    try {
      await save({ ...cur, name: cur.name.trim() });
      setDraft(cur);
      toast("이벤트 설정을 저장했어요 — 그날 집계부터 반영돼요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const runningToday =
    cur.active && cur.from && cur.to && cur.from <= todayKST() && todayKST() <= cur.to;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">🎉 이벤트 점수 배수</h3>
        <label className="flex items-center gap-1.5 text-sm font-bold">
          <input
            type="checkbox"
            checked={cur.active}
            onChange={(e) => set({ active: e.target.checked })}
            className="h-4 w-4"
          />
          이벤트 켬
        </label>
      </div>
      <p className="mt-1 text-[13px] text-ink-500">
        이벤트 기간 동안 아래 점수가 배수로 올라가요. <b>기간 안 날짜만</b> 적용되고 재집계해도
        안전해요. {runningToday ? "🟢 지금 진행 중" : "⚪ 오늘은 적용 안 됨"}
      </p>

      <div className="mt-3 space-y-2">
        <input
          value={cur.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="이벤트 이름 (예: 칭찬 두 배 주간)"
          className="w-full rounded-btn border border-ink-300 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-500">기간</span>
          <input
            type="date"
            value={cur.from}
            max={cur.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
            className="rounded-btn border border-ink-300 px-2 py-1.5"
          />
          <span className="text-ink-400">~</span>
          <input
            type="date"
            value={cur.to}
            min={cur.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
            className="rounded-btn border border-ink-300 px-2 py-1.5"
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {MULTS.map((m) => (
          <div
            key={m.key}
            className="flex items-center justify-between rounded-btn bg-ink-50 px-3 py-2"
          >
            <span className="text-sm font-bold text-ink-800">{m.label}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ink-400">×</span>
              <NumberStepper
                value={cur[m.key] as number}
                min={1}
                max={5}
                onChange={(v) => set({ [m.key]: v } as Partial<EventBoost>)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500">
          {boostedList ? `배수: ${boostedList}` : "배수 설정 없음 (전부 ×1)"}
        </p>
        <button
          onClick={() => void onSave()}
          disabled={busy || !dirty}
          className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        ※ 이미 지난 날에 적용하려면 그 날짜를 <b>다시 집계</b>해야 반영돼요 (오늘·최근은 자동 집계).
      </p>
    </section>
  );
}
