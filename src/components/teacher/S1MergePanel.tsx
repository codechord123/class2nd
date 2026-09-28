"use client";
// 💰 1학기 이월 실버 합치기 (교사 도구, 1회성).
// 회수 불가 시스템이라 '미리보기 → 확인 → 실행' 3단계로 두고, 실행 뒤에도
// 되돌리기를 남겨 잘못 눌렀을 때 빠져나올 길을 만든다.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { studentById } from "@/lib/roster";
import Card from "@/components/ui/Card";
import { useFeedback } from "@/components/ui/Feedback";
import {
  previewS1Merge,
  readS1MergeState,
  runS1Merge,
  undoS1Merge,
  type S1MergeState,
} from "@/lib/s1Merge";

export default function S1MergePanel() {
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const [state, setState] = useState<S1MergeState | null>(null);
  const [preview, setPreview] = useState<{ amounts: Record<string, number>; total: number } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  async function load() {
    const st = await readS1MergeState().catch(() => null);
    setState(st);
    if (st && !st.done) setPreview(await previewS1Merge().catch(() => null));
  }
  useEffect(() => {
    // load()는 await 뒤에 setState하므로 렌더 중 동기 갱신이 아니다.
    // 마운트 1회만 — 실행·되돌리기 뒤에는 각 핸들러가 직접 다시 부른다.
    let alive = true;
    void (async () => {
      const st = await readS1MergeState().catch(() => null);
      if (!alive) return;
      setState(st);
      if (st && !st.done) {
        const pv = await previewS1Merge().catch(() => null);
        if (alive) setPreview(pv);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function refreshWallets() {
    void qc.invalidateQueries({ queryKey: ["balances"] });
    void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
  }

  async function doMerge() {
    if (busy || !preview) return;
    const names = Object.keys(preview.amounts).length;
    const ok = await confirm({
      title: "이월 실버를 2학기 지갑에 합칠까요?",
      body: `${names}명에게 모두 ${preview.total}개가 들어가요. 합친 뒤에는 이월 지갑이 0이 되고, 이 실버도 저축 이자를 받게 돼요. (되돌리기 가능)`,
      confirmLabel: "합치기",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await runS1Merge();
      toast(`💰 ${r.total}개를 2학기 지갑으로 합쳤어요.`, "success");
      refreshWallets();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "합치기에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doUndo() {
    if (busy) return;
    const ok = await confirm({
      title: "합치기를 되돌릴까요?",
      body: "옮겼던 실버를 그대로 빼고 이월 지갑으로 돌려놔요. 합친 뒤에 쓴 실버가 있으면 잔액이 마이너스가 될 수 있어요.",
      confirmLabel: "되돌리기",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const n = await undoS1Merge();
      toast(`↩️ ${n}개를 되돌렸어요.`, "success");
      refreshWallets();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "되돌리기에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const fmtDay = (ms: number) =>
    new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

  return (
    <Card
      title="💰 1학기 이월 실버 합치기"
      desc="이월 실버를 2학기 지갑으로 옮겨 하나로 만들어요. 한 번만 실행돼요."
    >
      {state?.done ? (
        <>
          <p className="mt-3 rounded-btn bg-emerald-50 px-3 py-2.5 text-[13px] font-bold text-emerald-800">
            ✅ 합치기 완료 — {state.at ? `${fmtDay(state.at)}에 ` : ""}
            {Object.keys(state.amounts ?? {}).length}명에게 모두{" "}
            <b className="tnum">{state.total ?? 0}개</b>를 옮겼어요. 이제 실버는 하나뿐이고 이월분도
            이자를 받아요.
          </p>
          <button
            onClick={() => void doUndo()}
            disabled={busy}
            className="press mt-3 rounded-btn bg-white px-4 py-2 text-sm font-bold text-danger ring-1 ring-ink-200 disabled:opacity-40"
          >
            {busy ? "처리 중…" : "↩️ 되돌리기"}
          </button>
        </>
      ) : (
        <>
          {preview && preview.total > 0 ? (
            <>
              <p className="mt-3 text-[13px] text-ink-700">
                지금 합치면 <b className="tnum">{Object.keys(preview.amounts).length}명</b>에게 모두{" "}
                <b className="tnum text-brand-strong">{preview.total}개</b>가 들어가요.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(preview.amounts)
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([sid, n]) => (
                    <li
                      key={sid}
                      className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-700"
                    >
                      {studentById.get(Number(sid))?.name ?? sid} <span className="tnum">{n}</span>
                    </li>
                  ))}
              </ul>
              <button
                onClick={() => void doMerge()}
                disabled={busy}
                className="press mt-3 rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "합치는 중…" : "💰 합치기 실행"}
              </button>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-400">옮길 이월 실버가 없어요.</p>
          )}
        </>
      )}
      <p className="mt-2 text-[11px] text-ink-400">
        ※ 1학기 원본 기록(정적 명부)은 그대로 남아요. 이 실버는 1학기에 이미 번 것이라 &apos;실버
        25개 → 골드&apos; 적립에는 다시 세지 않아요.
      </p>
    </Card>
  );
}
