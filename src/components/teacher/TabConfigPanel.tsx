"use client";
// 탭 이름·순서 편집 — 코딩 없이 내비게이션을 조정한다 (classData/uiText의 nav.* 키).
// 교사 탭은 항상 맨 뒤 고정. 이름을 비우면 기본 이름으로 복귀.
import { useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useQueryClient } from "@tanstack/react-query";
import { TABS, applyTabConfig } from "@/components/TabNav";
import { useUiText } from "@/lib/uiText";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";

/** 저장된 순서를 지워 기본 순서(코드의 TABS)로 복귀 — 이름 커스텀은 유지 */
const RESET_PATCH = { "nav.order": "" };

interface Row {
  href: string;
  defLabel: string;
  label: string;
}

export default function TabConfigPanel() {
  const qc = useQueryClient();
  const { data: uiText } = useUiText();
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function resetOrder() {
    const ok = await confirm({
      title: "탭 순서를 기본값으로 되돌릴까요?",
      body: "저장했던 순서가 지워지고 기본 순서(헌법·개요·모둠·독서·상점·투표·건의·자리·안내)로 돌아가요. 바꾼 이름은 유지돼요.",
      confirmLabel: "기본 순서로",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await setDoc(doc(db(), "classData", "uiText"), RESET_PATCH, { merge: true });
      qc.setQueryData(["uiText"], (prev: Record<string, string> | undefined) => ({
        ...(prev ?? {}),
        ...RESET_PATCH,
      }));
      setRows(null); // 목록 다시 초기화 (기본 순서로)
      toast("✅ 기본 순서로 되돌렸어요 — 새로고침하면 모든 화면에 반영돼요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "되돌리기에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  // 현재 저장된 순서·이름으로 초기화 (1회)
  useEffect(() => {
    if (rows || uiText === undefined) return;
    // 실제 내비게이션과 같은 정렬 규칙 공유 — 새 탭도 기본 위치에 보인다
    const sorted = applyTabConfig(uiText);
    setRows(
      sorted.map((t) => ({
        href: t.href,
        defLabel: TABS.find((x) => x.href === t.href)?.label ?? t.label,
        label: uiText[`nav.label.${t.href}`] ?? "",
      }))
    );
  }, [uiText, rows]);

  function move(i: number, dir: -1 | 1) {
    if (!rows) return;
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    try {
      const patch: Record<string, string> = {
        "nav.order": rows.map((r) => r.href).join(","),
      };
      for (const r of rows) patch[`nav.label.${r.href}`] = r.label.trim();
      // 빈 라벨 키는 저장하지 않도록 정리 후 merge
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v));
      // 지워진 라벨은 빈 문자열로 덮어 기본 복귀
      for (const r of rows) if (!r.label.trim()) clean[`nav.label.${r.href}`] = "";
      await setDoc(doc(db(), "classData", "uiText"), clean, { merge: true });
      qc.setQueryData(["uiText"], (prev: Record<string, string> | undefined) => ({
        ...(prev ?? {}),
        ...clean,
      }));
      toast("✅ 탭 구성이 저장됐어요 — 새로고침하면 모든 화면에 반영돼요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="🗂️ 탭 이름·순서" desc="내비게이션 탭의 이름과 순서를 조정해요 (교사 탭은 맨 뒤 고정)">
      {!rows ? (
        <p className="mt-3 text-xs text-ink-400">불러오는 중…</p>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {rows.map((r, i) => (
              <li key={r.href} className="flex items-center gap-2 rounded-btn bg-ink-50 px-2.5 py-1.5">
                <span className="flex gap-0.5">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="press rounded bg-white px-2 py-1 text-xs font-bold text-ink-600 disabled:opacity-30"
                    aria-label="위로"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    className="press rounded bg-white px-2 py-1 text-xs font-bold text-ink-600 disabled:opacity-30"
                    aria-label="아래로"
                  >
                    ↓
                  </button>
                </span>
                <span className="w-14 shrink-0 text-xs font-bold text-ink-500">{r.defLabel}</span>
                <input
                  value={r.label}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder={`(기본: ${r.defLabel})`}
                  className="min-w-0 flex-1 rounded-btn border border-ink-300 bg-white px-2.5 py-1.5 text-sm"
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void save()}
              disabled={busy}
              className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "저장 중…" : "탭 구성 저장"}
            </button>
            <button
              onClick={() => void resetOrder()}
              disabled={busy}
              className="press rounded-btn border border-ink-300 bg-white px-4 py-2 text-sm font-bold text-ink-600 disabled:opacity-50"
            >
              기본 순서로 되돌리기
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
