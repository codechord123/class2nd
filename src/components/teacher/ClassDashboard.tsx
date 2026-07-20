"use client";
// 🗂️ 학급 현황판 — 교사가 학급 전체를 한 화면에서 내려다보며 관리 (사용자 확정).
//  ① 학급 골드 카드: 자동 적립 + 교사 ± 보너스 조정
//  ② 학생별 종합표: 누적점수·2학기실버·이월실버·독서권수 (클릭 → 상세 팝업)
//  ③ 선택 학생 팝업: 점수 주기·빼기(오늘 보너스) + 실버 지급 + 상점 사용 내역
// 읽기 예산: 표는 이미 캐시되는 문서 4개(누적·s2잔액·s1사용·독서)만. 상세는 클릭 시.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { getS1WalletOf, s1BooksOf } from "@/lib/staticData";
import { kstDateOf, todayKST } from "@/lib/date";
import { addBonus } from "@/lib/aggregate";
import { classGoldLeft } from "@/lib/gold";
import {
  useBalances,
  useGrantSilver,
  useDeductMany,
  useAdjustClassGold,
  signedAmount,
} from "@/lib/query/wallet";
import { useCumulativeScores } from "@/lib/query/evaluation";
import { useReadingStats } from "@/lib/query/reading";
import { useFeedback } from "@/components/ui/Feedback";

interface LedgerRow {
  id: string;
  item: string;
  amount: number;
  type: string;
  status: string;
  wallet: "s2" | "s1";
  createdAt: number;
}

/** 학생 한 명의 상점 원장 (클릭 시에만 조회) */
function useStudentLedger(sid: number | null) {
  return useQuery({
    queryKey: ["dashLedger", sid],
    enabled: sid != null,
    queryFn: async (): Promise<LedgerRow[]> => {
      const d = db();
      const make = (coll: string) =>
        query(
          collection(d, coll),
          where("studentId", "==", sid),
          orderBy("createdAt", "desc"),
          limit(30)
        );
      const [s2, s1] = await Promise.all([
        getDocs(make("coinTxns")),
        getDocs(make("s1Spends")),
      ]);
      const map = (
        snap: Awaited<ReturnType<typeof getDocs>>,
        wallet: "s2" | "s1"
      ): LedgerRow[] =>
        snap.docs.map((docSnap) => {
          const v = docSnap.data() as Record<string, unknown>;
          return {
            id: `${wallet}-${docSnap.id}`,
            item: String(v.item ?? ""),
            amount: Number(v.amount) || 0,
            type: String(v.type ?? "spend"),
            status: String(v.status ?? "approved"),
            wallet,
            createdAt: Number(v.createdAt) || 0,
          };
        });
      return [...map(s2, "s2"), ...map(s1, "s1")].sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 3 * 60 * 1000,
  });
}

const fmtDate = (ms: number) => {
  const d = kstDateOf(ms);
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
};

export default function ClassDashboard() {
  const { data: cum } = useCumulativeScores();
  const { data: stats } = useReadingStats();
  const { data: s2Bal } = useBalances("s2");
  const { data: s1Used } = useBalances("s1");
  const grantSilver = useGrantSilver();
  const deductMany = useDeductMany();
  const adjustGold = useAdjustClassGold();
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();

  const [sel, setSel] = useState<number | null>(null);
  const [grantAmt, setGrantAmt] = useState("1");
  const [grantNote, setGrantNote] = useState("");
  const [allAmt, setAllAmt] = useState("1"); // 전체 지급 개수
  const [allNote, setAllNote] = useState(""); // 전체 지급 사유 (선택)
  const [allBusy, setAllBusy] = useState(false);
  // ➖ 여러 명 실버 차감 (상점 사용 수동 기록)
  const [dedKind, setDedKind] = useState<"s1" | "s2">("s1"); // 방학 사용분은 이월(s1)이 기본
  const [dedNote, setDedNote] = useState("");
  const [dedSel, setDedSel] = useState<Record<number, string>>({}); // sid → 차감 개수(문자열). 존재=선택
  const [dedBusy, setDedBusy] = useState(false);
  const [scoreAmt, setScoreAmt] = useState("1");
  const [scoreBusy, setScoreBusy] = useState(false);
  const [goldBusy, setGoldBusy] = useState(false);
  const [sortKey, setSortKey] = useState<"id" | "score" | "silver" | "books">("id");
  const { data: ledger } = useStudentLedger(sel);

  const cumScore = (id: number) => {
    const v = cum?.[String(id)];
    return typeof v === "number" ? v : 0;
  };
  const s2Silver = (id: number) => (s2Bal?.[String(id)] as number | undefined) ?? 0;
  const s1Carry = (id: number) =>
    (getS1WalletOf(id)?.silverRemaining ?? 0) - ((s1Used?.[String(id)] as number | undefined) ?? 0);
  const booksOf = (id: number) => s1BooksOf(stats, id) + (stats?.total?.[String(id)] ?? 0);

  const rows = [...students].sort((a, b) => {
    if (sortKey === "score") return cumScore(b.id) - cumScore(a.id);
    if (sortKey === "silver") return s2Silver(b.id) - s2Silver(a.id);
    if (sortKey === "books") return booksOf(b.id) - booksOf(a.id);
    return a.id - b.id;
  });

  const goldLeft = classGoldLeft(s1Used);
  const goldEarned = (s1Used?.classGoldEarned as number | undefined) ?? 0;
  const goldBonus = (s1Used?.classGoldBonus as number | undefined) ?? 0;
  const goldUsed = (s1Used?.classGoldUsed as number | undefined) ?? 0;

  // 학급 합계
  const totalScore = students.reduce((a, s) => a + cumScore(s.id), 0);
  const totalSilver = students.reduce((a, s) => a + s2Silver(s.id), 0);
  const totalBooks = students.reduce((a, s) => a + booksOf(s.id), 0);

  async function changeGold(delta: number) {
    if (goldBusy) return;
    setGoldBusy(true);
    try {
      await adjustGold(delta);
      toast(delta > 0 ? "🥇 학급 골드 +1" : "학급 골드 −1", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "조정 실패", "error");
    } finally {
      setGoldBusy(false);
    }
  }

  async function grant(kind: "s2") {
    if (sel == null) return;
    const n = Number(grantAmt);
    if (!Number.isInteger(n) || n <= 0) {
      toast("지급 개수는 1 이상의 정수여야 해요.", "warn");
      return;
    }
    try {
      await grantSilver([sel], n, grantNote || "학급 현황판 지급");
      toast(`✅ ${studentById.get(sel)?.name}에게 실버 ${n}개 지급`, "success");
      setGrantNote("");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "지급 실패"}`, "error");
    }
    void kind;
  }

  // 👥 전체 학생 일괄 지급 — 전출(inactive) 제외. 25개 단위로 학급 골드가 자동 적립되니
  // 실수 방지를 위해 확인 다이얼로그를 거친다 (한 번에 25명 × n개).
  async function grantAll() {
    if (allBusy) return;
    const n = Number(allAmt);
    if (!Number.isInteger(n) || n <= 0) {
      toast("지급 개수는 1 이상의 정수여야 해요.", "warn");
      return;
    }
    const ids = students.filter((s) => !s.inactive).map((s) => s.id);
    if (
      !(await confirm({
        title: `전체 ${ids.length}명에게 실버 ${n}개씩 지급할까요?`,
        body: `총 ${ids.length * n}개가 들어가요. 학급 실버 25개마다 골드 1개가 자동 적립돼요. (전출 학생 제외)`,
        confirmLabel: `${ids.length}명 지급`,
      }))
    )
      return;
    setAllBusy(true);
    try {
      await grantSilver(ids, n, allNote || "학급 전체 지급");
      toast(`✅ 전체 ${ids.length}명에게 실버 ${n}개씩 지급했어요`, "success");
      setAllNote("");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "지급 실패"}`, "error");
    } finally {
      setAllBusy(false);
    }
  }

  // ➖ 여러 명 실버 차감 — 지갑별 잔액 헬퍼 + 선택 토글 + 실행
  const dedBalOf = (sid: number) =>
    dedKind === "s2"
      ? (s2Bal?.[String(sid)] ?? 0)
      : (getS1WalletOf(sid)?.silverRemaining ?? 0) - (s1Used?.[String(sid)] ?? 0);
  const toggleDed = (sid: number) =>
    setDedSel((prev) => {
      const next = { ...prev };
      if (sid in next) delete next[sid];
      else next[sid] = "1";
      return next;
    });
  const dedEntries = Object.entries(dedSel).map(([sid, amt]) => ({
    studentId: Number(sid),
    amount: Number(amt),
  }));
  const dedTotal = dedEntries.reduce((a, e) => a + (Number.isFinite(e.amount) ? e.amount : 0), 0);

  async function runDeduct() {
    if (dedBusy) return;
    const items = dedEntries.filter((e) => Number.isInteger(e.amount) && e.amount > 0);
    if (!items.length) {
      toast("차감할 학생과 개수를 골라주세요.", "warn");
      return;
    }
    // 잔액 초과 사전 점검 (트랜잭션도 막지만, 누구인지 미리 알려주면 친절)
    const over = items.find((e) => e.amount > dedBalOf(e.studentId));
    if (over) {
      toast(
        `${studentById.get(over.studentId)?.name}의 ${dedKind === "s2" ? "2학기" : "이월"} 실버가 부족해요 (남은 ${dedBalOf(over.studentId)}개).`,
        "warn"
      );
      return;
    }
    const walletName = dedKind === "s2" ? "2학기 실버" : "이월 실버";
    if (
      !(await confirm({
        title: `${items.length}명에게서 ${walletName} 합 ${dedTotal}개를 차감할까요?`,
        body: items
          .map((e) => `${studentById.get(e.studentId)?.name} −${e.amount}`)
          .join(" · "),
        confirmLabel: `${items.length}명 차감`,
        danger: true,
      }))
    )
      return;
    setDedBusy(true);
    try {
      await deductMany(dedKind, items, dedNote || `교사 차감(${walletName})`);
      toast(`✅ ${items.length}명 · ${walletName} ${dedTotal}개 차감 완료`, "success");
      setDedSel({});
      setDedNote("");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "차감 실패"}`, "error");
    } finally {
      setDedBusy(false);
    }
  }

  // 일반 점수 주기·빼기 — 오늘 날짜의 교사 보너스(addBonus 트랜잭션)로 기록.
  // 자동 집계가 덮어쓰지 않는 델타 방식이라 내일 재집계와도 안전하다.
  async function adjustScore(sign: 1 | -1) {
    if (sel == null || scoreBusy) return;
    const n = Number(scoreAmt);
    if (!Number.isInteger(n) || n <= 0) {
      toast("점수는 1 이상의 정수여야 해요.", "warn");
      return;
    }
    setScoreBusy(true);
    const date = todayKST();
    try {
      const daySum = await addBonus(date, sel, sign * n);
      toast(
        `🏅 ${studentById.get(sel)?.name} 점수 ${sign > 0 ? "+" : "−"}${n} (오늘 보너스 합 ${daySum}점)`,
        "success"
      );
      void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "점수 조정 실패"}`, "error");
    } finally {
      setScoreBusy(false);
    }
  }

  const th = (key: typeof sortKey, label: string, extra = "") => (
    <th
      onClick={() => setSortKey(key)}
      className={`cursor-pointer py-2 font-bold hover:text-brand ${
        sortKey === key ? "text-brand" : "text-ink-500"
      } ${extra}`}
    >
      {label}
      {sortKey === key && " ▾"}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* ① 학급 골드 카드 */}
      <section className="rounded-card border border-amber-200 bg-amber-50/50 p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-amber-800">🥇 학급 골드토큰 (공용)</h2>
            <p className="mt-0.5 text-xs text-ink-600">
              자동 적립 {goldEarned} · 교사 보너스 {goldBonus >= 0 ? "+" : ""}
              {goldBonus} · 사용 {goldUsed}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void changeGold(-1)}
              disabled={goldBusy || goldLeft <= 0}
              className="press flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-bold text-danger shadow-card disabled:opacity-30"
              aria-label="골드 감점"
            >
              −
            </button>
            <span className="tnum w-14 text-center text-3xl font-extrabold text-amber-600">
              {goldLeft}
            </span>
            <button
              onClick={() => void changeGold(1)}
              disabled={goldBusy}
              className="press flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-bold text-success shadow-card disabled:opacity-30"
              aria-label="골드 보너스"
            >
              +
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          + / − 는 즉석 보너스·감점이에요 (자동 적립과 별개로 기록돼요).
        </p>
      </section>

      {/* 👥 전체 실버 일괄 지급 — 이벤트·행사 보상 등을 반 전체에 한 번에 */}
      <section className="rounded-card border border-emerald-200 bg-emerald-50/40 p-4 shadow-card">
        <h2 className="text-lg font-bold text-emerald-800">👥 전체 실버 지급</h2>
        <p className="mt-0.5 text-xs text-ink-600">
          전출 학생을 뺀 <b>{students.filter((s) => !s.inactive).length}명 전원</b>에게 한 번에
          지급해요 (행사·이벤트 보상 등).
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-600">
            개수
            <input
              type="number"
              min={1}
              value={allAmt}
              onChange={(e) => setAllAmt(e.target.value)}
              className="w-16 rounded-btn border border-ink-300 px-2.5 py-1.5 text-sm tnum"
              aria-label="전체 지급 개수"
            />
          </label>
          <input
            value={allNote}
            onChange={(e) => setAllNote(e.target.value)}
            placeholder="사유 (선택) — 예: 학예회 보상"
            className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => void grantAll()}
            disabled={allBusy}
            className="press rounded-btn bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {allBusy ? "지급 중…" : "전원 지급"}
          </button>
        </div>
      </section>

      {/* ➖ 여러 명 실버 차감 — 상점 사용을 수동으로 기록·차감 (예: 방학 이월 사용분 재입력) */}
      <section className="rounded-card border border-rose-200 bg-rose-50/40 p-4 shadow-card">
        <h2 className="text-lg font-bold text-rose-700">➖ 실버 차감 (여러 명)</h2>
        <p className="mt-0.5 text-xs text-ink-600">
          상점 사용을 수동으로 기록해요. 학생을 골라 개수를 적고 한 번에 차감해요 (잔액 부족이면
          막혀요).
        </p>

        {/* 지갑 선택 */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {(
            [
              { k: "s1" as const, label: "🎒 이월 실버" },
              { k: "s2" as const, label: "💰 2학기 실버" },
            ]
          ).map((w) => (
            <button
              key={w.k}
              onClick={() => setDedKind(w.k)}
              className={`press rounded-full px-3 py-1.5 text-xs font-bold ${
                dedKind === w.k ? "bg-rose-600 text-white" : "border border-ink-200 bg-white text-ink-500"
              }`}
            >
              {w.label}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-ink-400">
            방학 사용분은 <b>이월 실버</b>예요
          </span>
        </div>

        {/* 학생 선택 칩 — 잔액이 0인 학생은 흐리게 */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {students
            .filter((s) => !s.inactive)
            .map((s) => {
              const on = s.id in dedSel;
              const bal = dedBalOf(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleDed(s.id)}
                  className={`press rounded-full border px-2.5 py-1.5 text-xs font-bold ${
                    on
                      ? "border-rose-400 bg-rose-500 text-white"
                      : bal <= 0
                        ? "border-ink-100 bg-white text-ink-300"
                        : "border-ink-200 bg-white text-ink-600 hover:border-rose-300"
                  }`}
                >
                  {s.name}
                  <span className={`ml-1 tnum font-normal ${on ? "text-white/80" : "text-ink-400"}`}>
                    {bal}
                  </span>
                </button>
              );
            })}
        </div>

        {/* 선택된 학생 — 개수 입력 (기본 1) */}
        {dedEntries.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-btn bg-white/70 p-2.5">
            {dedEntries.map((e) => (
              <div key={e.studentId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-ink-800">
                  {studentById.get(e.studentId)?.name}
                  <span className="ml-1 text-[11px] text-ink-400">잔액 {dedBalOf(e.studentId)}</span>
                </span>
                <span className="text-xs text-rose-600">−</span>
                <input
                  type="number"
                  min={1}
                  max={dedBalOf(e.studentId)}
                  value={dedSel[e.studentId]}
                  onChange={(ev) =>
                    setDedSel((prev) => ({ ...prev, [e.studentId]: ev.target.value }))
                  }
                  className="w-16 rounded-btn border border-ink-300 px-2 py-1 text-sm tnum"
                  aria-label={`${studentById.get(e.studentId)?.name} 차감 개수`}
                />
                <button
                  onClick={() => toggleDed(e.studentId)}
                  className="press text-ink-400 hover:text-danger"
                  aria-label="빼기"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            value={dedNote}
            onChange={(e) => setDedNote(e.target.value)}
            placeholder="사유 (선택) — 예: 방학 상점 사용 재입력"
            className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => void runDeduct()}
            disabled={dedBusy || dedEntries.length === 0}
            className="press rounded-btn bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {dedBusy ? "차감 중…" : dedEntries.length ? `${dedEntries.length}명 차감` : "차감"}
          </button>
        </div>
      </section>

      {/* 학급 합계 요약 */}
      <section className="grid grid-cols-3 gap-2">
        {[
          { label: "🏅 학급 총점", value: totalScore, tone: "text-indigo-600" },
          { label: "💰 2학기 실버 합", value: totalSilver, tone: "text-ink-900" },
          { label: "🐢 학급 권수", value: totalBooks, tone: "text-emerald-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-ink-200 bg-white p-3 text-center shadow-card">
            <p className="text-[11px] text-ink-400">{s.label}</p>
            <p className={`tnum text-xl font-extrabold ${s.tone}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </section>

      {/* ② 학생별 종합표 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold">🗂️ 학생별 현황</h2>
        <p className="mt-0.5 text-xs text-ink-600">
          이름을 누르면 점수·실버 지급과 상점 내역 팝업이 열려요. 열 제목을 누르면 정렬돼요.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs">
                {th("id", "학생", "pr-2")}
                {th("score", "누적점수", "pr-2 text-right")}
                {th("silver", "2학기실버", "pr-2 text-right")}
                <th className="py-2 pr-2 text-right font-bold text-ink-500">이월실버</th>
                {th("books", "독서", "text-right")}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSel(sel === s.id ? null : s.id)}
                  className={`cursor-pointer border-b border-ink-100 last:border-0 ${
                    sel === s.id ? "bg-brand-weak/40" : "hover:bg-ink-50"
                  }`}
                >
                  <td className="py-2 pr-2 font-medium">
                    <span className="text-ink-400">{s.id}</span> {studentById.get(s.id)?.name ?? s.name}
                  </td>
                  <td className="tnum py-2 pr-2 text-right font-bold text-indigo-600">{cumScore(s.id)}</td>
                  <td className="tnum py-2 pr-2 text-right font-bold text-ink-900">{s2Silver(s.id)}</td>
                  <td className="tnum py-2 pr-2 text-right text-brand-strong">{s1Carry(s.id)}</td>
                  <td className="tnum py-2 text-right text-emerald-600">{booksOf(s.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ③ 선택 학생 상세 — 팝업 (점수 조정 + 실버 지급 + 상점 내역) */}
      {sel != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-3 sm:p-6"
          onClick={() => setSel(null)}
        >
          <div
            className="rise flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-card bg-white shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 상단바 — 이름 + 현재 수치 요약 + 닫기 */}
            <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
              <h3 className="min-w-0 truncate text-base font-bold text-ink-900">
                {studentById.get(sel)?.name}
                <span className="ml-1.5 text-xs font-normal text-ink-400">
                  🏅 <b className="tnum text-indigo-600">{cumScore(sel)}</b>점 · 💰{" "}
                  <b className="tnum text-ink-700">{s2Silver(sel)}</b>개
                </span>
              </h3>
              <button
                onClick={() => setSel(null)}
                className="press shrink-0 rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-500"
              >
                ✕ 닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {/* 일반 점수 주기·빼기 */}
              <div className="rounded-btn bg-indigo-50 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-indigo-700">🏅 점수 주기·빼기</span>
                  <input
                    type="number"
                    min={1}
                    value={scoreAmt}
                    onChange={(e) => setScoreAmt(e.target.value)}
                    className="w-16 rounded-btn border border-ink-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => void adjustScore(-1)}
                    disabled={scoreBusy}
                    className="press rounded-btn bg-white px-3 py-1.5 text-sm font-bold text-danger shadow-card disabled:opacity-40"
                  >
                    − 빼기
                  </button>
                  <button
                    onClick={() => void adjustScore(1)}
                    disabled={scoreBusy}
                    className="press rounded-btn bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    + 주기
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">
                  오늘 날짜의 교사 보너스로 기록돼요 — 자동 집계와 겹쳐도 안전해요.
                </p>
              </div>

              {/* 실버 지급 */}
              <div className="rounded-btn bg-ink-50 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-ink-600">💰 실버 지급</span>
                  <input
                    type="number"
                    min={1}
                    value={grantAmt}
                    onChange={(e) => setGrantAmt(e.target.value)}
                    className="w-16 rounded-btn border border-ink-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <input
                    value={grantNote}
                    onChange={(e) => setGrantNote(e.target.value)}
                    placeholder="사유 (선택)"
                    className="min-w-32 flex-1 rounded-btn border border-ink-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => void grant("s2")}
                    className="press rounded-btn bg-brand px-4 py-1.5 text-sm font-bold text-white"
                  >
                    지급
                  </button>
                </div>
              </div>

              {/* 상점 내역 */}
              <div>
                <p className="text-xs font-bold text-ink-500">🧾 상점 내역 (최근 30건)</p>
                {!ledger ? (
                  <p className="mt-1 text-sm text-ink-400">불러오는 중…</p>
                ) : ledger.length === 0 ? (
                  <p className="mt-1 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
                    아직 상점 기록이 없어요.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {ledger.map((e) => {
                      const v = signedAmount(e.type, e.amount);
                      return (
                        <li
                          key={e.id}
                          className="flex items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-ink-700">{e.item}</span>
                            <span className="shrink-0 text-[11px] text-ink-400">
                              {e.type === "gold" ? "🥇골드" : e.wallet === "s2" ? "2학기" : "이월"} ·{" "}
                              {fmtDate(e.createdAt)}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <b className={`tnum ${v > 0 ? "text-success" : "text-ink-700"}`}>
                              {v > 0 ? `+${v}` : v}
                            </b>
                            {e.status !== "approved" && (
                              <span className="rounded-full bg-warn-weak px-1.5 py-0.5 text-[10px] font-bold text-warn">
                                {e.status === "pending" ? "대기" : "반려"}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
