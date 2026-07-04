"use client";
// 🧾 토큰 사용 기록 — 교사용 원장 뷰어: 날짜별 그룹 + 학생 필터.
// 읽기 예산: 최근 기록만 limit 쿼리(2학기 60 + 이월 30), staleTime 5분.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { signedAmount } from "@/lib/query/wallet";
import { kstDateOf } from "@/lib/date";

interface LedgerEntry {
  id: string;
  studentId: number;
  amount: number;
  item: string;
  type: string;
  status: "pending" | "approved" | "rejected";
  wallet: "s2" | "s1";
  createdAt: number;
}


const STATUS_LABEL = { pending: "대기", approved: "승인", rejected: "반려" } as const;
const STATUS_STYLE = {
  pending: "bg-warn-weak text-warn",
  approved: "bg-success-weak text-success",
  rejected: "bg-danger-weak text-danger",
} as const;

function useLedger() {
  return useQuery({
    queryKey: ["tokenLedger"],
    queryFn: async (): Promise<LedgerEntry[]> => {
      const d = db();
      // 0_balances 문서는 createdAt이 없어 orderBy 쿼리에서 자동 제외된다
      const [s2Snap, s1Snap] = await Promise.all([
        getDocs(query(collection(d, "coinTxns"), orderBy("createdAt", "desc"), limit(60))),
        getDocs(query(collection(d, "s1Spends"), orderBy("createdAt", "desc"), limit(30))),
      ]);
      const map = (snap: typeof s2Snap, wallet: "s2" | "s1") =>
        snap.docs.map((doc) => {
          const v = doc.data();
          return {
            id: `${wallet}-${doc.id}`,
            studentId: Number(v.studentId),
            amount: Number(v.amount) || 0,
            item: String(v.item ?? ""),
            type: String(v.type ?? "spend"),
            status: (v.status ?? "approved") as LedgerEntry["status"],
            wallet,
            createdAt: Number(v.createdAt) || 0,
          };
        });
      return [...map(s2Snap, "s2"), ...map(s1Snap, "s1")].sort(
        (a, b) => b.createdAt - a.createdAt
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function TokenLedgerPanel() {
  const { data: ledger, isLoading, refetch, isFetching } = useLedger();
  const [filterSid, setFilterSid] = useState(0); // 0 = 전체

  const filtered = (ledger ?? [])
    // 사용 기록만 — 지급(+)은 여기서 보여줄 필요 없음 (사용자 결정)
    .filter((e) => signedAmount(e.type, e.amount) < 0)
    .filter((e) => filterSid === 0 || e.studentId === filterSid);
  // 날짜별 그룹 (최신 날짜 먼저 — 정렬돼 있으므로 순서대로 묶기만)
  const byDate: [string, LedgerEntry[]][] = [];
  for (const e of filtered) {
    const date = kstDateOf(e.createdAt);
    const last = byDate[byDate.length - 1];
    if (last && last[0] === date) last[1].push(e);
    else byDate.push([date, [e]]);
  }
  const dateLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">🧾 토큰 사용 기록</h2>
        <div className="flex items-center gap-2">
          <select
            value={filterSid}
            onChange={(e) => setFilterSid(Number(e.target.value))}
            className="rounded-btn border border-ink-300 px-3 py-1.5 text-sm"
          >
            <option value={0}>전체 학생</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}번 {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="press rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600 disabled:opacity-50"
          >
            {isFetching ? "…" : "새로고침"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-500">
        학생들이 토큰을 쓴 기록이 날짜별로 쌓여요 — 날짜를 누르면 그날 내역이 펼쳐져요.
      </p>

      {isLoading && <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>}
      {!isLoading && byDate.length === 0 && (
        <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          사용 기록이 없어요.
        </p>
      )}
      <div className="mt-3 space-y-1.5">
        {byDate.map(([date, entries]) => (
          <details key={date} className="group rounded-btn border border-ink-200">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm font-bold text-ink-700 hover:bg-ink-50">
              <span className="tnum">{dateLabel(date)}</span>
              <span className="text-xs font-medium text-ink-400">
                {entries.length}건 <span className="group-open:hidden">▼</span>
                <span className="hidden group-open:inline">▲</span>
              </span>
            </summary>
            <ul className="space-y-1 border-t border-ink-100 p-2">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
                      {studentById.get(e.studentId)?.name ?? `?${e.studentId}`}
                    </span>
                    <span className="truncate text-ink-700">{e.item}</span>
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {e.wallet === "s2" ? "2학기" : "이월"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <b className="tnum text-sm text-ink-700">{Math.abs(e.amount)}개</b>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[e.status]}`}
                    >
                      {STATUS_LABEL[e.status]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
