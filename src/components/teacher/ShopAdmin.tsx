"use client";
// 🛍️ 교사 상점 관리 — 상점 탭에서 상점 관련 업무 전부 (사용자 결정: 교사탭에서 이동).
//   [✅ 승인·오늘] 기본: 오늘 승인해야 할 대기 + 오늘 처리한 내역만
//   [🧾 기록] 달력에서 날짜 클릭 → 그날만 쿼리 (읽기 예산) · 최근 7일 · 학생별
//   [💰 지급] 다중 선택 지급 + 오늘 지급 내역
//   [📋 메뉴판] 메뉴 관리
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { todayKST, kstDateOf, shiftDate } from "@/lib/date";
import { s1Wallet, getS1WalletOf } from "@/lib/staticData";
import { classGoldLeft } from "@/lib/gold";
import {
  useBalances,
  usePendingRequests,
  useDecideRequest,
  useGrantSilver,
  signedAmount,
  type WalletKind,
} from "@/lib/query/wallet";
import ShopMenuEditor from "@/components/teacher/ShopMenuEditor";
import SubTabs from "@/components/ui/SubTabs";
import MiniCalendar from "@/components/ui/MiniCalendar";
import { useFeedback } from "@/components/ui/Feedback";

interface Entry {
  id: string;
  studentId: number;
  amount: number;
  item: string;
  type: string;
  status: "pending" | "approved" | "rejected";
  wallet: WalletKind;
  createdAt: number;
}

const STATUS_LABEL = { pending: "대기", approved: "승인", rejected: "반려" } as const;
const STATUS_STYLE = {
  pending: "bg-warn-weak text-warn",
  approved: "bg-success-weak text-success",
  rejected: "bg-danger-weak text-danger",
} as const;

const mapDocs = (
  snap: { docs: { id: string; data: () => Record<string, unknown> }[] },
  wallet: WalletKind
): Entry[] =>
  snap.docs.map((d) => {
    const v = d.data();
    return {
      id: `${wallet}-${d.id}`,
      studentId: Number(v.studentId),
      amount: Number(v.amount) || 0,
      item: String(v.item ?? ""),
      type: String(v.type ?? "spend"),
      status: (v.status ?? "approved") as Entry["status"],
      wallet,
      createdAt: Number(v.createdAt) || 0,
    };
  });

const dayMs = (date: string) => new Date(date + "T00:00:00+09:00").getTime();

/** 날짜 범위 기록 — 클릭한 날짜(또는 7일)만 읽는다 */
function useRangeLedger(start: string | null, endExclusive: string | null) {
  return useQuery({
    queryKey: ["shopLedger", start, endExclusive],
    enabled: !!start && !!endExclusive,
    queryFn: async (): Promise<Entry[]> => {
      const d = db();
      const [a, b] = [dayMs(start!), dayMs(endExclusive!)];
      const make = (coll: string) =>
        query(collection(d, coll), where("createdAt", ">=", a), where("createdAt", "<", b));
      const [s2, s1] = await Promise.all([getDocs(make("coinTxns")), getDocs(make("s1Spends"))]);
      return [...mapDocs(s2, "s2"), ...mapDocs(s1, "s1")].sort((x, y) => y.createdAt - x.createdAt);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** 오늘 처리(승인/반려)된 내역 — decidedAt 기준 (신청은 보통 전날 저녁이라 createdAt으론 못 잡음) */
function useDecidedToday() {
  const today = todayKST();
  return useQuery({
    queryKey: ["shopDecided", today],
    queryFn: async (): Promise<Entry[]> => {
      const d = db();
      const [a, b] = [dayMs(today), dayMs(today) + 86400000];
      const make = (coll: string) =>
        query(collection(d, coll), where("decidedAt", ">=", a), where("decidedAt", "<", b));
      const [s2, s1] = await Promise.all([getDocs(make("coinTxns")), getDocs(make("s1Spends"))]);
      return [...mapDocs(s2, "s2"), ...mapDocs(s1, "s1")].sort((x, y) => y.createdAt - x.createdAt);
    },
    staleTime: 60 * 1000,
  });
}

/** 학생별 최근 기록 — count는 '더보기'로 20씩 늘어난다 */
function useStudentLedger(sid: number | null, count: number) {
  return useQuery({
    queryKey: ["shopLedgerStudent", sid, count],
    enabled: sid != null,
    queryFn: async (): Promise<Entry[]> => {
      const d = db();
      const make = (coll: string) =>
        query(
          collection(d, coll),
          where("studentId", "==", sid),
          orderBy("createdAt", "desc"),
          limit(count)
        );
      const [s2, s1] = await Promise.all([getDocs(make("coinTxns")), getDocs(make("s1Spends"))]);
      return [...mapDocs(s2, "s2"), ...mapDocs(s1, "s1")].sort((x, y) => y.createdAt - x.createdAt);
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

const fmtDate = (ms: number) => {
  const d = kstDateOf(ms);
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
};

function EntryRow({ e, showDate }: { e: Entry; showDate?: boolean }) {
  const v = signedAmount(e.type, e.amount);
  return (
    <li className="flex items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
          {studentById.get(e.studentId)?.name ?? `?${e.studentId}`}
        </span>
        <span className="truncate text-ink-700">{e.item}</span>
        {/* 골드는 지갑(s1)이 아니라 학급 공용 재화 — 이월 실버로 오인하지 않게 명시 */}
        <span
          className={`shrink-0 text-[11px] ${
            e.type === "gold" ? "font-bold text-amber-600" : "text-ink-400"
          }`}
        >
          {e.type === "gold" ? "🥇 골드" : e.wallet === "s2" ? "2학기" : "이월"}
          {showDate && <span className="tnum"> · {fmtDate(e.createdAt)}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <b className={`tnum text-sm ${v > 0 ? "text-success" : "text-ink-700"}`}>
          {v > 0 ? `+${v}` : Math.abs(v)}개
        </b>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[e.status]}`}>
          {STATUS_LABEL[e.status]}
        </span>
      </span>
    </li>
  );
}

export default function ShopAdmin() {
  const [tab, setTab] = useState<"approve" | "ledger" | "grant" | "menu">("approve");
  const { toast } = useFeedback();
  const qc = useQueryClient();
  const today = todayKST();

  // ── 승인 ──
  const { data: pendS2 } = usePendingRequests("s2", true);
  const { data: pendS1 } = usePendingRequests("s1", true);
  const decideS2 = useDecideRequest("s2");
  const decideS1 = useDecideRequest("s1");
  const { data: decidedToday } = useDecidedToday();
  const pending = [
    ...(pendS2 ?? []).map((r) => ({ r, kind: "s2" as WalletKind })),
    ...(pendS1 ?? []).map((r) => ({ r, kind: "s1" as WalletKind })),
  ];
  // 승인 판단용 잔액 — 이미 캐시되는 잔액 문서 2개 재사용 (추가 읽기 없음)
  const { data: s2Bal } = useBalances("s2");
  const { data: s1Used } = useBalances("s1");
  const balanceOf = (p: (typeof pending)[number]): number =>
    p.r.type === "gold"
      ? classGoldLeft(s1Used)
      : p.kind === "s2"
        ? (s2Bal?.[String(p.r.studentId)] ?? 0)
        : (getS1WalletOf(p.r.studentId)?.silverRemaining ?? 0) -
          (s1Used?.[String(p.r.studentId)] ?? 0);

  // ── 기록 (달력) ──
  const [mode, setMode] = useState<"date" | "week" | "student">("date");
  const [selDate, setSelDate] = useState<string | null>(null);
  const [selSid, setSelSid] = useState<number | null>(null);
  const [ledgerCount, setLedgerCount] = useState(20); // 학생별 더보기 — 20건씩
  const dayQ = useRangeLedger(
    mode === "date" ? selDate : mode === "week" ? shiftDate(today, -6) : null,
    mode === "date" && selDate ? shiftDate(selDate, 1) : mode === "week" ? shiftDate(today, 1) : null
  );
  const studentQ = useStudentLedger(mode === "student" ? selSid : null, ledgerCount);
  const ledgerEntries = (mode === "student" ? studentQ.data : dayQ.data) ?? [];
  const usageEntries = ledgerEntries.filter((e) => signedAmount(e.type, e.amount) < 0);
  const ledgerLoading = mode === "student" ? studentQ.isLoading : dayQ.isLoading;
  const ledgerReady =
    mode === "student" ? selSid != null : mode === "week" ? true : selDate != null;

  // ── 지급 ──
  const grantSilver = useGrantSilver();
  const [grantSids, setGrantSids] = useState<number[]>([]);
  const [grantAmt, setGrantAmt] = useState("1");
  const [grantNote, setGrantNote] = useState("");
  const todayGrantQ = useRangeLedger(tab === "grant" ? today : null, tab === "grant" ? shiftDate(today, 1) : null);
  const todayGrants = (todayGrantQ.data ?? []).filter((e) => signedAmount(e.type, e.amount) > 0);

  async function decide(r: (typeof pending)[number], approve: boolean) {
    try {
      await (r.kind === "s2" ? decideS2 : decideS1)(r.r, approve);
      toast(
        approve
          ? `✅ 승인: ${studentById.get(r.r.studentId)?.name} · ${r.r.item}`
          : `반려 처리했어요: ${r.r.item}`
      );
      void qc.invalidateQueries({ queryKey: ["shopDecided"] });
      void qc.invalidateQueries({ queryKey: ["shopLedger"] });
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "처리 실패"}`, "error");
    }
  }

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={[
          { key: "approve" as const, label: "✅ 승인·오늘" },
          { key: "ledger" as const, label: "🧾 기록" },
          { key: "grant" as const, label: "💰 지급" },
          { key: "menu" as const, label: "📋 메뉴판" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ✅ 기본: 오늘 승인해야 하는 것 + 오늘 처리한 것 */}
      {tab === "approve" && (
        <>
          <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
            <h2 className="text-lg font-bold">
              🛒 승인 대기{" "}
              <span className="text-sm font-normal text-ink-400">({pending.length}건)</span>
            </h2>
            {!pending.length && (
              <p className="mt-2 text-sm text-ink-400">대기 중인 신청이 없어요.</p>
            )}
            <ul className="mt-3 space-y-2">
              {pending.map((p) => (
                <li
                  key={`${p.kind}-${p.r.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-ink-200 bg-white px-3.5 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[12px] font-bold text-brand-strong">
                      {studentById.get(p.r.studentId)?.name}
                    </span>
                    <b className="truncate text-[15px] text-ink-900">{p.r.item}</b>
                    {/* 골드 신청(type=gold)은 학급 공용 재화 — "이월 N개"로 오인하면 오승인 */}
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                        p.r.type === "gold"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-warn-weak text-warn"
                      }`}
                    >
                      {p.r.type === "gold"
                        ? `🥇 학급 골드 ${p.r.amount}개`
                        : `${p.kind === "s2" ? "2학기" : "이월"} ${p.r.amount}개`}
                    </span>
                    {p.r.reserved && (
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-500">
                        🕓 예약
                      </span>
                    )}
                    {/* 승인 판단 정보 — 부족하면 빨간 경고 (승인 시 트랜잭션이 최종 차단) */}
                    <span
                      className={`shrink-0 text-xs ${
                        balanceOf(p) < p.r.amount ? "font-bold text-danger" : "text-ink-400"
                      }`}
                    >
                      {p.r.type === "gold" ? "학급 골드" : "잔액"} {balanceOf(p)}개
                      {balanceOf(p) < p.r.amount && " ⚠️ 부족"}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <button
                      onClick={() => void decide(p, true)}
                      className="press rounded-btn bg-success px-4 py-2 text-sm font-bold text-white"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => void decide(p, false)}
                      className="press rounded-btn border border-danger/40 bg-white px-4 py-2 text-sm font-bold text-danger"
                    >
                      반려
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
            <h2 className="text-base font-bold">
              📅 오늘 처리한 내역{" "}
              <span className="text-sm font-normal text-ink-400">
                ({(decidedToday ?? []).length}건)
              </span>
            </h2>
            {(decidedToday ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-ink-400">오늘 승인·반려한 내역이 없어요.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {decidedToday!.map((e) => (
                  <EntryRow key={e.id} e={e} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 🧾 기록 — 달력 클릭 시에만 그날 데이터 로드 */}
      {tab === "ledger" && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">🧾 토큰 기록</h2>
            <div className="flex gap-1 rounded-btn bg-ink-100 p-1 text-xs font-bold">
              {(
                [
                  ["date", "날짜별"],
                  ["week", "최근 7일"],
                  ["student", "학생별"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`press rounded-[10px] px-3 py-1.5 ${
                    mode === k ? "bg-white text-ink-900 shadow-card" : "text-ink-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-600">
            날짜(또는 학생)를 고르면 그때만 불러와요 — 미리 읽지 않아 데이터 낭비가 없어요.
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
            {mode === "date" && (
              <MiniCalendar selected={selDate} onSelect={setSelDate} maxDate={today} />
            )}
            {mode === "student" && (
              <select
                value={selSid ?? ""}
                onChange={(e) => {
                  setSelSid(e.target.value ? Number(e.target.value) : null);
                  setLedgerCount(20); // 학생 바꾸면 더보기 범위 초기화
                }}
                className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
              >
                <option value="">학생을 골라주세요</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}번 {s.name}
                  </option>
                ))}
              </select>
            )}

            <div className="min-w-0 flex-1">
              {!ledgerReady && (
                <p className="rounded-btn bg-ink-50 px-3 py-6 text-center text-sm text-ink-400">
                  {mode === "date" ? "달력에서 날짜를 눌러주세요." : "학생을 골라주세요."}
                </p>
              )}
              {ledgerReady && ledgerLoading && (
                <p className="rounded-btn bg-ink-50 px-3 py-6 text-center text-sm text-ink-400">
                  불러오는 중…
                </p>
              )}
              {ledgerReady && !ledgerLoading && usageEntries.length === 0 && (
                <p className="rounded-btn bg-ink-50 px-3 py-6 text-center text-sm text-ink-400">
                  사용 기록이 없어요.
                </p>
              )}
              {usageEntries.length > 0 && (
                <>
                  {/* 요약 스탯 행 — 목록만 있으면 밀도가 낮아 한눈 파악이 어려움 (디자이너 감사) */}
                  <p className="mb-2 rounded-btn bg-ink-50 px-3 py-2 text-xs font-bold text-ink-600">
                    사용 {usageEntries.length}건 · 실버{" "}
                    {usageEntries
                      .filter((e) => e.type !== "gold")
                      .reduce((a, e) => a + e.amount, 0)}
                    개
                    {usageEntries.some((e) => e.type === "gold") && (
                      <>
                        {" "}
                        · 골드{" "}
                        {usageEntries
                          .filter((e) => e.type === "gold")
                          .reduce((a, e) => a + e.amount, 0)}
                        개
                      </>
                    )}
                  </p>
                  <ul className="space-y-1">
                    {usageEntries.map((e) => (
                      <EntryRow key={e.id} e={e} showDate={mode !== "date"} />
                    ))}
                  </ul>
                </>
              )}
              {/* 학생별 더보기 — 20건 한도에 걸렸을 때 20건씩 추가 조회 */}
              {mode === "student" &&
                !ledgerLoading &&
                ledgerEntries.length >= ledgerCount && (
                  <button
                    onClick={() => setLedgerCount((c) => c + 20)}
                    className="press mt-2 w-full rounded-btn bg-ink-100 py-2 text-xs font-bold text-ink-600 hover:bg-ink-200"
                  >
                    더보기 (이전 기록 20건)
                  </button>
                )}
            </div>
          </div>

          {/* 반 전체 이월 지갑 현황 — 참고용 (접이식) */}
          <details className="mt-4 rounded-btn border border-ink-200">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-bold text-ink-700 hover:bg-ink-50">
              🎒 반 전체 이월 지갑 현황
            </summary>
            <div className="overflow-x-auto border-t border-ink-100 p-3">
              <S1CarryTable />
            </div>
          </details>
        </section>
      )}

      {/* 💰 지급 — 다중 선택 + 오늘 지급 내역 */}
      {tab === "grant" && (
        <>
          <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">💰 실버 지급 (2학기)</h2>
              <span className="text-xs text-ink-600">
                {grantSids.length > 0
                  ? `${grantSids.length}명 선택됨`
                  : "학생을 눌러 선택 (여러 명 가능)"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={() =>
                  setGrantSids(
                    grantSids.length === students.length ? [] : students.map((s) => s.id)
                  )
                }
                className="press rounded-full border border-ink-400 bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-700"
              >
                {grantSids.length === students.length ? "전체 해제" : "전체 선택"}
              </button>
              {students.map((s) => {
                const on = grantSids.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setGrantSids(on ? grantSids.filter((x) => x !== s.id) : [...grantSids, s.id])
                    }
                    className={`press rounded-full border px-3 py-1.5 text-sm font-medium ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-ink-200 bg-white text-ink-600 hover:border-brand/40"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-600">1인당</span>
              <input
                type="number"
                min={1}
                value={grantAmt}
                onChange={(e) => setGrantAmt(e.target.value)}
                className="w-20 rounded-btn border border-ink-300 px-3 py-2 text-sm"
              />
              <span className="text-xs text-ink-600">개</span>
              <input
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder="사유 (예: 발표 준비 도움)"
                className="min-w-40 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() =>
                  void (async () => {
                    const n = Number(grantAmt);
                    if (!Number.isInteger(n) || n <= 0) {
                      toast("지급 개수는 1 이상의 정수여야 해요.", "warn");
                      return;
                    }
                    if (grantSids.length === 0) {
                      toast("지급할 학생을 골라주세요.", "warn");
                      return;
                    }
                    try {
                      await grantSilver(grantSids, n, grantNote);
                      toast(`✅ ${grantSids.length}명에게 실버 ${n}개씩 지급했어요.`);
                      setGrantNote("");
                      setGrantSids([]);
                      void qc.invalidateQueries({ queryKey: ["shopLedger"] });
                    } catch (e) {
                      toast(`⚠️ 지급 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
                    }
                  })()
                }
                className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
              >
                {grantSids.length > 1 ? `${grantSids.length}명에게 지급` : "지급"}
              </button>
            </div>
          </section>

          <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
            <h2 className="text-base font-bold">
              📅 오늘 지급 내역{" "}
              <span className="text-sm font-normal text-ink-400">({todayGrants.length}건)</span>
            </h2>
            {todayGrants.length === 0 ? (
              <p className="mt-2 text-sm text-ink-400">오늘 지급한 내역이 없어요.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {todayGrants.map((e) => (
                  <EntryRow key={e.id} e={e} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 📋 메뉴판 */}
      {tab === "menu" && <ShopMenuEditor />}
    </div>
  );
}

/** 반 전체 이월 지갑 표 — 잔여 = 정적 이월분 − 승인된 사용량 */
function S1CarryTable() {
  const { data: s1Used } = useQuery({
    queryKey: ["balances", "s1"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { doc, getDoc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db(), "s1Spends", "0_balances"));
      return snap.exists() ? (snap.data() as Record<string, number>) : {};
    },
    staleTime: 10 * 60 * 1000,
  });
  return (
    <table className="w-full min-w-[380px] text-sm">
      <thead>
        <tr className="border-b border-ink-200 text-left text-xs text-ink-600">
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
            <tr key={s.id} className="border-b border-ink-100 last:border-0">
              <td className="py-1.5 pr-2 font-medium">{studentById.get(s.id)?.name ?? s.name}</td>
              <td className="py-1.5 pr-2 text-right text-ink-500">{s.silverRemaining}</td>
              <td className="py-1.5 pr-2 text-right text-ink-400">{used}</td>
              <td className="py-1.5 text-right font-bold text-brand-strong">
                {s.silverRemaining - used}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
