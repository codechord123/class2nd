"use client";
// 🎉 이벤트 점수 배수 (교사) — 이벤트 기간 동안 칭찬·MVP·독서 점수를 배수로 올린다.
// 집계는 '집계하는 날짜가 기간 안'일 때만 배수를 적용하므로 재집계해도 안전(멱등).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import NumberStepper from "@/components/ui/NumberStepper";
import { shiftDate, todayKST } from "@/lib/date";
import { aggregateDate } from "@/lib/aggregate";
import { useSettings } from "@/lib/query/settings";
import { useEventBoost, useSaveEventBoost } from "@/lib/query/classMeta";
import { DEFAULT_EVENT_BOOST, type EventBoost } from "@/lib/eventBoost";
import { useFeedback } from "@/components/ui/Feedback";

// 배수를 바꾸면 그 기간의 '이미 집계된 날'을 다시 계산해야 점수가 실제로 바뀐다.
// 자동 집계(autoRun)는 하루 1회라, 오늘치를 이미 집계한 뒤 이벤트를 켜면 저장만으로는
// 오늘 점수가 그대로였다 (2026-09-15 사용자 지적). 저장이 곧 재집계가 되게 한다.
// 되돌릴 때도 같아야 하므로 '이전 기간 ∪ 새 기간'을 함께 다시 집계한다(aggregateDate는 멱등).
const REDO_CAP = 14; // 한 번에 다시 집계할 최대 일수 — 더 길면 '기간 재집계' 도구로 안내

function datesToRedo(prev: EventBoost, next: EventBoost): string[] {
  const today = todayKST();
  const out = new Set<string>();
  for (const b of [prev, next]) {
    if (!b.from || !b.to) continue; // active가 꺼져도 '껐다'는 변화라 기간은 훑는다
    const end = b.to < today ? b.to : today;
    for (let d = b.from; d <= end; d = shiftDate(d, 1)) out.add(d);
  }
  return [...out].sort();
}

const MULTS: { key: keyof EventBoost; label: string }[] = [
  { key: "comp", label: "💌 칭찬(개인)" },
  { key: "mission", label: "🎯 칭찬 미션(팀)" },
  { key: "mvp", label: "⭐ MVP" },
  { key: "fair", label: "🤝 페어플레이" },
  { key: "read", label: "🐢 독서" },
];

export default function EventBoostPanel() {
  const { data: saved } = useEventBoost();
  const { data: settings } = useSettings();
  const save = useSaveEventBoost();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<EventBoost | null>(null);
  const [busy, setBusy] = useState(false);

  // 저장된 구버전 문서엔 fair가 없을 수 있어 기본값 위에 병합 (undefined 스테퍼 방지)
  const base = { ...DEFAULT_EVENT_BOOST, ...(saved ?? {}) };
  const cur = draft ?? base;
  const dirty = JSON.stringify(cur) !== JSON.stringify(base);
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
      const next = { ...cur, name: cur.name.trim() };
      await save(next);
      setDraft(next);
      // 저장 = 재집계. 기간이 길면 뒤쪽(최근) 날짜부터 REDO_CAP일만 처리하고 안내한다.
      const all = datesToRedo(base, next);
      const redo = all.slice(-REDO_CAP);
      let done = 0;
      if (settings) {
        for (const d of redo) {
          // 평가가 없는 날은 건너뛴다(skipIfEmpty) — 빈 날에 0점 문서를 만들지 않기 위함
          const r = await aggregateDate(d, settings, { skipIfEmpty: true }).catch(() => null);
          if (r) {
            done++;
            void qc.invalidateQueries({ queryKey: ["dailyScores", d] });
          }
        }
        void qc.invalidateQueries({ queryKey: ["dailyScores", "_cumulative"] });
        void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      }
      toast(
        done > 0
          ? `이벤트 설정을 저장하고 ${done}일치 점수를 다시 계산했어요.${
              all.length > redo.length
                ? ` (앞쪽 ${all.length - redo.length}일은 '기간 재집계'로 처리해 주세요)`
                : ""
            }`
          : "이벤트 설정을 저장했어요 — 아직 집계된 날이 없어 다시 계산할 점수는 없어요.",
        "success"
      );
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
          {busy ? "저장·재집계 중…" : "저장"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        ※ <b>저장하면 그 기간의 점수를 바로 다시 계산</b>해요 (최근 {REDO_CAP}일까지). 기간이 더
        길면 <b>기간 재집계</b> 도구로 나머지를 처리해 주세요.
      </p>
    </section>
  );
}
