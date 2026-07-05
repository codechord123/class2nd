"use client";
// 코인 대사(재고 조사) — 원장(coinTxns·s1Spends 전체)을 읽어 잔액 문서와 대조한다.
// 이중 실행·부분 실패로 원장과 잔액이 어긋났을 때 조기 발견하는 안전망 (P0 락의 보조).
// 읽기 비용: 원장 문서 수만큼 (한 학기 수백~수천 건) — 필요할 때만 수동 실행.
import { useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students } from "@/lib/roster";
import { signedAmount } from "@/lib/query/wallet";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";

interface Mismatch {
  label: string;
  expected: number;
  actual: number;
}

export default function CoinAuditPanel() {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ txns: number; mismatches: Mismatch[] } | null>(null);

  async function run() {
    if (busy) return;
    const ok = await confirm({
      title: "코인 대사를 실행할까요?",
      body: "원장 전체를 한 번 읽어 잔액과 대조해요 (기록이 많을수록 읽기 사용량이 늘어요 — 필요할 때만).",
      confirmLabel: "실행",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = db();
      const [s2Snap, s1Snap, s2Bal, s1Bal, cumSnap] = await Promise.all([
        getDocs(collection(d, "coinTxns")),
        getDocs(collection(d, "s1Spends")),
        getDoc(doc(d, "coinTxns", "0_balances")),
        getDoc(doc(d, "s1Spends", "0_balances")),
        getDoc(doc(d, "dailyScores", "_cumulative")),
      ]);

      // 원장에서 기대값 계산 — 승인된 기록만 잔액에 반영된다
      const expS2: Record<string, number> = {}; // 2학기 실버 잔액 기대값
      const expS1Used: Record<string, number> = {}; // 이월 실버 사용량 기대값
      let expGoldUsed = 0;
      let txns = 0;
      s2Snap.forEach((t) => {
        if (t.id === "0_balances") return;
        const v = t.data();
        txns++;
        if (v.status !== "approved") return;
        const sid = String(v.studentId);
        expS2[sid] = (expS2[sid] ?? 0) + signedAmount(v.type as string, v.amount as number);
      });
      s1Snap.forEach((t) => {
        if (t.id === "0_balances") return;
        const v = t.data();
        txns++;
        if (v.status !== "approved") return;
        if (v.type === "gold") expGoldUsed += v.amount as number;
        else expS1Used[String(v.studentId)] = (expS1Used[String(v.studentId)] ?? 0) + (v.amount as number);
      });

      const actS2 = (s2Bal.exists() ? s2Bal.data() : {}) as Record<string, number>;
      const actS1 = (s1Bal.exists() ? s1Bal.data() : {}) as Record<string, number>;
      const cum = cumSnap.exists() ? cumSnap.data() : {};

      const mismatches: Mismatch[] = [];
      for (const s of students) {
        const sid = String(s.id);
        const e2 = expS2[sid] ?? 0;
        const a2 = actS2[sid] ?? 0;
        if (e2 !== a2)
          mismatches.push({ label: `${s.name} · 2학기 실버`, expected: e2, actual: a2 });
        const e1 = expS1Used[sid] ?? 0;
        const a1 = actS1[sid] ?? 0;
        if (e1 !== a1)
          mismatches.push({ label: `${s.name} · 이월 사용량`, expected: e1, actual: a1 });
      }
      const actGoldUsed = actS1.classGoldUsed ?? 0;
      if (expGoldUsed !== actGoldUsed)
        mismatches.push({ label: "학급 골드 사용량", expected: expGoldUsed, actual: actGoldUsed });
      // 골드 적립: 잔액 문서의 classGoldEarned와 누적 문서의 classGoldPaid는 항상 같이 움직여야 함
      const earned = actS1.classGoldEarned ?? 0;
      const paid = (cum.classGoldPaid as number) ?? 0;
      if (earned !== paid)
        mismatches.push({ label: "학급 골드 적립(잔액 vs 누적 기록)", expected: paid, actual: earned });

      setResult({ txns, mismatches });
      toast(
        mismatches.length
          ? `⚠️ 불일치 ${mismatches.length}건 발견 — 아래 내역 확인`
          : "✅ 원장과 잔액이 모두 일치해요!",
        mismatches.length ? "warn" : "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "대사에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="🧾 코인 대사 (원장 검증)" desc="원장 전체와 잔액 문서를 대조해 어긋남을 찾아요">
      <button
        onClick={() => void run()}
        disabled={busy}
        className="press mt-3 rounded-btn bg-ink-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "대조 중…" : "대사 실행"}
      </button>
      {result && (
        <div className="mt-3 text-sm">
          <p className="text-xs text-ink-600">원장 {result.txns}건 검사</p>
          {result.mismatches.length === 0 ? (
            <p className="mt-1 rounded-btn bg-success-weak px-3 py-2 font-bold text-success">
              ✅ 전부 일치
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {result.mismatches.map((m) => (
                <li key={m.label} className="rounded-btn bg-danger-weak px-3 py-2 text-danger">
                  <b>{m.label}</b> — 원장 기준 <b>{m.expected}</b> · 잔액 문서 <b>{m.actual}</b>{" "}
                  (차이 {m.actual - m.expected > 0 ? "+" : ""}
                  {m.actual - m.expected})
                </li>
              ))}
            </ul>
          )}
          {result.mismatches.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              해결: 상점 탭 추가 지급(±)으로 차이만큼 보정하거나, 어긋난 학생의 기록을 함께
              확인해주세요. 교사 수동 지급·차감은 원장에 남으므로 보정 후 다시 대사하면 일치해야
              해요.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
