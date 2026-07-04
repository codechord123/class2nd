"use client";
// 학급 목표 배너 편집 — 문구 수정·숨기기(삭제). 홈·독서 상단 + 리포트에 반영.
import { useState } from "react";
import { useClassBanner, useSaveClassBanner } from "@/lib/query/classMeta";
import { useFeedback } from "@/components/ui/Feedback";

export default function BannerEditor() {
  const { data: banner } = useClassBanner();
  const save = useSaveClassBanner();
  const { toast } = useFeedback();
  const [title, setTitle] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!banner) return null;
  const curTitle = title ?? banner.title;
  const curSub = sub ?? banner.sub ?? "";

  async function submit(active: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await save({ title: curTitle.trim(), sub: curSub.trim(), active });
      toast(active ? "🎯 학급 목표가 걸렸어요!" : "배너를 내렸어요.", "success");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "저장 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">🎯 학급 목표 배너</h2>
      <p className="mt-1 text-xs text-ink-500">
        홈·독서 상단의 주황 배너예요. 학급 목표로 활용하세요 — 리포트에도 함께 담겨요.
      </p>
      <div className="mt-3 space-y-2">
        <input
          value={curSub}
          onChange={(e) => setSub(e.target.value)}
          placeholder="작은 글씨 (예: 🐢 거북이 독서 최종 미션)"
          className="w-full rounded-btn border border-ink-300 px-3 py-2 text-sm"
        />
        <input
          value={curTitle}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="큰 글씨 (예: 🍜 짜파게티 파티까지 달린다!)"
          className="w-full rounded-btn border border-ink-300 px-3 py-2 text-sm font-bold"
        />
        {/* 미리보기 */}
        {curTitle.trim() && (
          <div className="rounded-card bg-gradient-to-r from-amber-400 to-orange-500 p-3 text-white">
            {curSub.trim() && <p className="text-xs font-medium opacity-90">{curSub}</p>}
            <p className="text-lg font-extrabold">{curTitle}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => void submit(true)}
            disabled={busy || !curTitle.trim()}
            className="press rounded-btn bg-warn px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {banner.active ? "배너 수정" : "배너 걸기"}
          </button>
          {banner.active && (
            <button
              onClick={() => void submit(false)}
              disabled={busy}
              className="press rounded-btn border border-ink-300 bg-white px-4 py-2 text-sm font-bold text-ink-600 disabled:opacity-50"
            >
              배너 내리기
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
