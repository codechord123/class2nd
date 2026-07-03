"use client";
// 상점 — 2학기 실버와 1학기 이월 지갑을 완전 격리 (요구사항 §D).
// 구매는 신청 → 교사 승인. 이월 지갑 잔액 = 정적 silverRemaining − 승인된 사용량.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { s1Wallet, s1ClassGoldRemaining, getS1WalletOf } from "@/lib/staticData";
import { studentById } from "@/lib/roster";
import {
  useBalances,
  useMyRequests,
  useCreateSpendRequest,
  type WalletKind,
} from "@/lib/query/wallet";
import { useShopMenu } from "@/lib/query/classMeta";

const STATUS_LABEL = { pending: "⏳ 대기", approved: "✅ 승인", rejected: "❌ 반려" } as const;

export default function ShopPage() {
  const { role, studentId } = useSession();
  const { data: s2Bal } = useBalances("s2");
  const { data: s1Used } = useBalances("s1");

  const [wallet, setWallet] = useState<WalletKind>("s2");
  const [amount, setAmount] = useState("1");
  const [item, setItem] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const createRequest = useCreateSpendRequest(wallet, studentId);
  const createGoldRequest = useCreateSpendRequest("s1", studentId);
  const { data: myS2 } = useMyRequests("s2", studentId);
  const { data: myS1 } = useMyRequests("s1", studentId);
  const { data: menu } = useShopMenu();

  const myS2Balance = studentId ? (s2Bal?.[String(studentId)] ?? 0) : 0;
  const myS1Remaining = studentId
    ? (getS1WalletOf(studentId)?.silverRemaining ?? 0) - (s1Used?.[String(studentId)] ?? 0)
    : 0;
  const classGoldLeft = s1ClassGoldRemaining - (s1Used?.classGoldUsed ?? 0);

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const n = Number(amount);
      const max = wallet === "s2" ? myS2Balance : myS1Remaining;
      if (n > max) throw new Error("가진 실버보다 많이 쓸 수 없어요.");
      await createRequest(n, item);
      setItem("");
      setMsg("✅ 신청 완료! 선생님 승인을 기다려주세요.");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "신청에 실패했어요."}`);
    } finally {
      setBusy(false);
    }
  }

  const myRequests = [...(myS2 ?? []).map((r) => ({ ...r, wallet: "s2" as const })), ...(myS1 ?? []).map((r) => ({ ...r, wallet: "s1" as const }))].sort(
    (a, b) => b.createdAt - a.createdAt
  );

  return (
    <div className="space-y-4">
      {/* 내 지갑 */}
      {role === "student" && studentId && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-xs text-slate-400">2학기 실버</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-800">{myS2Balance}</p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-center">
            <p className="text-xs text-indigo-500">1학기 이월 실버</p>
            <p className="mt-1 text-2xl font-extrabold text-indigo-700">{myS1Remaining}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-center">
            <p className="text-xs text-amber-600">학급 골드토큰 (공용)</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-700">{classGoldLeft}</p>
          </div>
        </section>
      )}

      {/* 메뉴판 (아이들과 토의해 그때그때 추가) */}
      {role === "student" && studentId && (menu?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold">📋 우리 반 메뉴판</h3>
          <p className="mt-1 text-xs text-slate-500">
            학급 회의로 정한 메뉴예요. 골라서 바로 신청하세요!
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {menu!.map((m) => (
              <div
                key={m.id}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                  m.wallet === "gold" ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="text-sm">
                  <b>{m.name}</b>
                  <span className="ml-1.5 text-xs text-slate-500">
                    {m.price}
                    {m.wallet === "gold" ? "골드 (학급 공용)" : "실버"}
                  </span>
                  {m.note && <p className="text-xs text-slate-400">{m.note}</p>}
                </div>
                <button
                  onClick={() =>
                    void (async () => {
                      setMsg("");
                      try {
                        if (m.wallet === "gold") {
                          if (m.price > classGoldLeft) throw new Error("학급 골드토큰이 부족해요.");
                          await createGoldRequest(m.price, m.name, "gold");
                        } else {
                          const max = wallet === "s2" ? myS2Balance : myS1Remaining;
                          if (m.price > max) throw new Error("가진 실버보다 비싸요. 지갑을 바꾸거나 더 모아요!");
                          await createRequest(m.price, m.name);
                        }
                        setMsg(`✅ "${m.name}" 신청 완료! 선생님 승인을 기다려주세요.`);
                      } catch (e) {
                        setMsg(`⚠️ ${e instanceof Error ? e.message : "신청 실패"}`);
                      }
                    })()
                  }
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white ${
                    m.wallet === "gold" ? "bg-amber-500" : "bg-slate-800"
                  }`}
                >
                  신청
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            실버 메뉴는 아래에서 고른 지갑(
            {wallet === "s2" ? "2학기 실버" : "1학기 이월 실버"})에서 나가요.
          </p>
        </section>
      )}

      {/* 직접 입력 신청 */}
      {role === "student" && studentId && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold">🛒 실버 사용 신청 (직접 입력)</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={wallet}
              onChange={(e) => setWallet(e.target.value as WalletKind)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="s2">2학기 실버</option>
              <option value="s1">1학기 이월 실버</option>
            </select>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="무엇에 쓸까요? (예: 자리 이동권)"
              className="min-w-40 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void submit()}
              disabled={busy}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              신청
            </button>
          </div>
          {msg && <p className="mt-2 text-sm">{msg}</p>}

          {myRequests.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {myRequests.slice(0, 8).map((r) => (
                <li key={r.id} className="flex justify-between rounded bg-slate-50 px-3 py-1.5">
                  <span>
                    {r.item}{" "}
                    <span className="text-xs text-slate-400">
                      ({r.wallet === "s2" ? "2학기" : "이월"} {r.amount}개)
                    </span>
                  </span>
                  <span className="text-xs">{STATUS_LABEL[r.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 반 전체 이월 지갑 현황 (표시 전용) */}
      <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">🎒 1학기 이월 지갑</h2>
          <p className="text-sm text-slate-600">
            학급 골드토큰 <b>{classGoldLeft}개</b> 남음
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          1학기에 다 쓰지 못한 실버예요. 2학기 실버와 섞이지 않아요.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <thead>
              <tr className="border-b border-indigo-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-2">이름</th>
                <th className="py-2 pr-2 text-right">이월 실버</th>
                <th className="py-2 pr-2 text-right">사용</th>
                <th className="py-2 text-right">남음</th>
              </tr>
            </thead>
            <tbody>
              {s1Wallet.students.map((s) => {
                const used = s1Used?.[String(s.id)] ?? 0;
                return (
                  <tr key={s.id} className="border-b border-indigo-100 last:border-0">
                    <td className="py-1.5 pr-2 font-medium">
                      {studentById.get(s.id)?.name ?? s.name}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-500">{s.silverRemaining}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-400">{used}</td>
                    <td className="py-1.5 text-right font-bold text-indigo-700">
                      {s.silverRemaining - used}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
