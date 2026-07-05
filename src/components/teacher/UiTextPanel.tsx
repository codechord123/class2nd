"use client";
// 문구 편집 — 카탈로그(uiText.ts)에 등록된 안내문·독려 메시지를 코딩 없이 수정.
// 빈 칸으로 저장하면 기본 문구로 복귀. 새 문구 항목이 필요하면 요청으로 카탈로그에 추가.
import { useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useQueryClient } from "@tanstack/react-query";
import { UI_TEXT_CATALOG, useUiText } from "@/lib/uiText";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";

export default function UiTextPanel() {
  const qc = useQueryClient();
  const { data: uiText } = useUiText();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (uiText) setDraft((d) => ({ ...uiText, ...d }));
  }, [uiText]);

  async function save() {
    setBusy(true);
    try {
      // 빈 값은 저장하지 않음(기본 문구 복귀) — 문서를 통째로 교체
      const clean = Object.fromEntries(
        Object.entries(draft)
          .map(([k, v]) => [k, v.trim()])
          .filter(([, v]) => v)
      );
      await setDoc(doc(db(), "classData", "uiText"), clean);
      qc.setQueryData(["uiText"], clean);
      toast("✅ 문구가 저장됐어요 — 학생 화면에는 30분 안(또는 새로고침 시) 반영돼요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="✏️ 문구 편집" desc="앱 안내문·독려 메시지를 코딩 없이 수정해요 (비우면 기본 문구로 복귀)">
      <div className="mt-3 space-y-3">
        {UI_TEXT_CATALOG.map((e) => (
          <div key={e.key}>
            <p className="text-xs font-bold text-ink-700">{e.label}</p>
            {e.multiline ? (
              <textarea
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
                placeholder={e.def}
                rows={4}
                className="mt-1 w-full rounded-btn border border-ink-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            ) : (
              <input
                value={draft[e.key] ?? ""}
                onChange={(ev) => setDraft((d) => ({ ...d, [e.key]: ev.target.value }))}
                placeholder={e.def}
                className="mt-1 w-full rounded-btn border border-ink-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => void save()}
        disabled={busy}
        className="press mt-3 rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "저장 중…" : "문구 저장"}
      </button>
    </Card>
  );
}
