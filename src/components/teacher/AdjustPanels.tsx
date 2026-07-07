"use client";
// 🛠 점수 조정 탭 전용 패널 — 실버 지급·차감 / 학급 골드 ± (사용자 확정: 모든 보정을 한 탭에).
// 개인 점수 보정(BonusPanel)·독서 권수 보정(ReadingAdjustPanel)은 기존 컴포넌트를 같은 탭에 배치.
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import {
  useBalances,
  useGrantSilver,
  useDeductSilver,
  useAdjustClassGold,
} from "@/lib/query/wallet";
import { classGoldLeft } from "@/lib/gold";
import { useFeedback } from "@/components/ui/Feedback";

/** 💰 실버 지급·차감 — 학생 1명 단위 (여러 명 동시 지급은 상점 관리의 기존 도구) */
export function SilverAdjustPanel() {
  const [sid, setSid] = useState(1);
  const [amt, setAmt] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: s2Bal } = useBalances("s2");
  const grant = useGrantSilver();
  const deduct = useDeductSilver();
  const { toast } = useFeedback();

  const cur = (s2Bal?.[String(sid)] as number | undefined) ?? 0;

  async function run(sign: 1 | -1) {
    if (busy) return;
    const n = Number(amt);
    if (!Number.isInteger(n) || n <= 0) {
      toast("개수는 1 이상의 정수여야 해요.", "warn");
      return;
    }
    setBusy(true);
    try {
      if (sign > 0) await grant([sid], n, note || "교사 보정 지급");
      else await deduct(sid, n, note || "교사 보정 차감");
      toast(
        `✅ ${studentById.get(sid)?.name} 실버 ${sign > 0 ? "+" : "−"}${n}개`,
        "success"
      );
      setNote("");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "보정 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">💰 실버토큰 보정</h2>
      <p className="mt-1 text-xs text-ink-600">
        지급(+)은 골드 자동 적립 재료에도 포함되고, 차감(−)은 그만큼 되돌려요. 내역은 상점
        원장에 남아요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={sid}
          onChange={(e) => setSid(Number(e.target.value))}
          className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-600">
          현재 <b className="tnum">{cur}</b>개
        </span>
        <input
          type="number"
          min={1}
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          className="w-16 rounded-btn border border-ink-300 px-2 py-2 text-sm"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="사유 (선택)"
          className="min-w-28 flex-1 rounded-btn border border-ink-300 px-2 py-2 text-sm"
        />
        <button
          onClick={() => void run(-1)}
          disabled={busy || cur <= 0}
          className="press rounded-btn bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          − 차감
        </button>
        <button
          onClick={() => void run(1)}
          disabled={busy}
          className="press rounded-btn bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          + 지급
        </button>
      </div>
    </section>
  );
}

/** 🥇 학급 골드토큰 보정 — 학급 현황판 카드와 같은 classGoldBonus 델타 */
export function GoldAdjustPanel() {
  const { data: s1Used } = useBalances("s1");
  const adjustGold = useAdjustClassGold();
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  const goldLeft = classGoldLeft(s1Used as Record<string, number> | undefined);
  const goldBonus = ((s1Used ?? {}) as Record<string, number>).classGoldBonus ?? 0;

  async function change(delta: number) {
    if (busy) return;
    setBusy(true);
    try {
      await adjustGold(delta);
      toast(delta > 0 ? "🥇 학급 골드 +1" : "학급 골드 −1", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "조정 실패", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-amber-200 bg-amber-50/50 p-4 shadow-card">
      <h2 className="text-lg font-bold text-amber-800">🥇 학급 골드토큰 보정</h2>
      <p className="mt-1 text-xs text-ink-600">
        자동 적립과 별개인 즉석 보너스·감점이에요 (현재 교사 보정 누계{" "}
        {goldBonus >= 0 ? "+" : ""}
        {goldBonus}).
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => void change(-1)}
          disabled={busy || goldLeft <= 0}
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-bold text-danger shadow-card disabled:opacity-30"
          aria-label="골드 감점"
        >
          −
        </button>
        <span className="tnum w-14 text-center text-3xl font-extrabold text-amber-600">
          {goldLeft}
        </span>
        <button
          onClick={() => void change(1)}
          disabled={busy}
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-bold text-success shadow-card disabled:opacity-30"
          aria-label="골드 보너스"
        >
          +
        </button>
        <span className="text-xs text-ink-400">학급 공용 잔량</span>
      </div>
    </section>
  );
}
