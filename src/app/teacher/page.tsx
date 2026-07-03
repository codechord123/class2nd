"use client";
// 교사 탭 — 평가 척도 설정(요구사항 Q3: 교사가 수정 가능) + 일일 집계 실행.
// 집계는 교사만 원시 평가(하루 최대 50문서)를 읽고, 학생들은 결과 문서만 읽는다.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { useSettings, useSaveSettings } from "@/lib/query/settings";
import { useQueryClient } from "@tanstack/react-query";
import { aggregateDate, type AggregateResult } from "@/lib/aggregate";
import { todayKST } from "@/lib/date";
import { studentById, students } from "@/lib/roster";
import {
  usePendingRequests,
  useDecideRequest,
  useGrantSilver,
  type WalletKind,
} from "@/lib/query/wallet";
import {
  usePendingSeatRequests,
  useDecideSeatRequest,
  findOccupant,
} from "@/lib/query/seatChange";
import { useBestGroups, useSetBestGroup } from "@/lib/query/classMeta";
import ShopMenuEditor from "@/components/teacher/ShopMenuEditor";
import LinksEditor from "@/components/teacher/LinksEditor";
import { TeacherMemoWidget, BiweeklySettlePanel, BonusPanel } from "@/components/teacher/MemoAndSettle";
import PasswordResetPanel from "@/components/teacher/PasswordResetPanel";
import ReadingAdjustPanel from "@/components/teacher/ReadingAdjustPanel";
import CsvExportPanel from "@/components/teacher/CsvExportPanel";
import SubTabs from "@/components/ui/SubTabs";
import { openRangePrintDoc } from "@/lib/exportDoc";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { weekOfDate } from "@/lib/date";
import type { ClassSettings } from "@/types";

function parseNums(text: string): number[] {
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

export default function TeacherPage() {
  const { role } = useSession();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const qc = useQueryClient();

  const [tTab, setTTab] = useState<"score" | "approve" | "shop" | "tools">("score");
  const [date, setDate] = useState(todayKST());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AggregateResult | null>(null);
  const [msg, setMsg] = useState("");

  const [peerScaleText, setPeerScaleText] = useState<string | null>(null);
  const [groupScaleText, setGroupScaleText] = useState<string | null>(null);
  const [rankPointsText, setRankPointsText] = useState<string | null>(null);
  const [quotaText, setQuotaText] = useState<string | null>(null);
  const [seatCostText, setSeatCostText] = useState<string | null>(null);

  const isTeacher = role === "teacher";
  const { data: pendS2 } = usePendingRequests("s2", isTeacher);
  const { data: pendS1 } = usePendingRequests("s1", isTeacher);
  const decideSpend = useDecideRequest("s2");
  const decideSpendS1 = useDecideRequest("s1");
  const { data: pendSeat } = usePendingSeatRequests(isTeacher);
  const decideSeat = useDecideSeatRequest();
  const grantSilver = useGrantSilver();

  const [grantSid, setGrantSid] = useState(1);
  const [grantAmt, setGrantAmt] = useState("1");
  const [grantNote, setGrantNote] = useState("");

  const { data: bestGroups } = useBestGroups();
  const setBestGroup = useSetBestGroup();
  const [bestGroupId, setBestGroupId] = useState(1);

  if (role !== "teacher") {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">🔒 선생님만 들어올 수 있는 곳이에요.</p>
      </section>
    );
  }
  if (!settings) return <p className="text-sm text-slate-400">불러오는 중…</p>;

  async function runAggregate() {
    setBusy(true);
    setMsg("");
    try {
      const r = await aggregateDate(date, settings!);
      setResult(r);
      // 집계 결과 캐시 무효화 — 다음 조회 때 새 문서를 읽는다
      void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      setMsg(`✅ ${date} 집계 완료 — 평가 ${r.evaluatorCount}명 · 모둠투표 ${r.voterCount}명`);
    } catch (e) {
      setMsg(`⚠️ 집계 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    const next: ClassSettings = {
      ...settings!,
      peerScale: peerScaleText != null ? parseNums(peerScaleText) : settings!.peerScale,
      groupScale: groupScaleText != null ? parseNums(groupScaleText) : settings!.groupScale,
      rankPoints: rankPointsText != null ? parseNums(rankPointsText) : settings!.rankPoints,
      weeklyReadingQuota:
        quotaText != null ? Number(quotaText) || settings!.weeklyReadingQuota : settings!.weeklyReadingQuota,
      seatChangeCost:
        seatCostText != null ? Number(seatCostText) || settings!.seatChangeCost : settings!.seatChangeCost,
    };
    try {
      await saveSettings(next);
      setMsg("✅ 설정이 저장되었습니다.");
    } catch (e) {
      setMsg(`⚠️ 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={[
          { key: "score" as const, label: "📊 점수·집계" },
          { key: "approve" as const, label: "✅ 승인 대기" },
          { key: "shop" as const, label: "🛍️ 상점·지급" },
          { key: "tools" as const, label: "⚙️ 설정·도구" },
        ]}
        active={tTab}
        onChange={setTTab}
      />

      {tTab === "score" && (<>
      {/* 일일 집계 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">📊 일일 평가 집계</h2>
        <p className="mt-1 text-xs text-slate-500">
          종회 후 하루 1번 실행하세요. 다시 실행해도 안전해요(누적 자동 보정).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void runAggregate()}
            disabled={busy}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "집계 중…" : "집계 실행"}
          </button>
        </div>
        {result && (
          <p className="mt-2 text-sm text-slate-600">
            모둠 순위:{" "}
            {Object.entries(result.groupRanks)
              .sort((a, b) => a[1] - b[1])
              .map(([g, r]) => `${g}모둠 ${r}위`)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* 오늘의 모둠 선정 + 칭찬/건의 인쇄 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">👑 오늘의 모둠 & 칭찬 인쇄</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={bestGroupId}
            onChange={(e) => setBestGroupId(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {[1, 2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                {g}모둠
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              void (async () => {
                try {
                  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
                  const chairId =
                    scheduleOfWeek(week).groups.find((g) => g.groupId === bestGroupId)?.chair ?? 0;
                  await setBestGroup(date, bestGroupId, chairId);
                  setMsg(`✅ ${date} 오늘의 모둠: ${bestGroupId}모둠 (의장 ${studentById.get(chairId)?.name})`);
                } catch (e) {
                  setMsg(`⚠️ 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
                }
              })()
            }
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white"
          >
            오늘의 모둠으로 선정
          </button>
          <span className="flex gap-1">
            {(["일간", "주간", "월간"] as const).map((label) => (
              <button
                key={label}
                onClick={() =>
                  void (async () => {
                    try {
                      let start = date, end = date;
                      if (label === "주간") {
                        const s0 = new Date(date + "T00:00:00+09:00");
                        s0.setDate(s0.getDate() - 6);
                        start = s0.toISOString().slice(0, 10);
                      } else if (label === "월간") {
                        start = date.slice(0, 8) + "01";
                        const e0 = new Date(date.slice(0, 7) + "-01T00:00:00Z");
                        e0.setUTCMonth(e0.getUTCMonth() + 1);
                        e0.setUTCDate(0);
                        end = e0.toISOString().slice(0, 10);
                      }
                      const r = await openRangePrintDoc(start, end, label);
                      setMsg(`🖨️ ${label} 인쇄 창 열림 — ${r.days}일치 · 칭찬 ${r.compliments}건 · 건의 ${r.suggestions}건`);
                    } catch (e) {
                      setMsg(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
                    }
                  })()
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                🖨️ {label}
              </button>
            ))}
          </span>
        </div>
        {bestGroups?.[date] && (
          <p className="mt-2 text-sm text-slate-600">
            {date} 오늘의 모둠: <b>{bestGroups[date].groupId}모둠</b> (의장{" "}
            {studentById.get(bestGroups[date].chairId)?.name})
          </p>
        )}
      </section>

      <BiweeklySettlePanel />
      <BonusPanel />
      </>)}

      {tTab === "tools" && (<>
      {/* 평가 척도 설정 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">⚙️ 평가 척도 설정</h2>
        <p className="mt-1 text-xs text-slate-500">쉼표로 구분해 자유롭게 수정할 수 있어요.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            모둠 내 평가 척도
            <input
              value={peerScaleText ?? settings.peerScale.join(", ")}
              onChange={(e) => setPeerScaleText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            모둠 간 평가 척도
            <input
              value={groupScaleText ?? settings.groupScale.join(", ")}
              onChange={(e) => setGroupScaleText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            모둠 순위 → 개인 점수 (1위부터)
            <input
              value={rankPointsText ?? settings.rankPoints.join(", ")}
              onChange={(e) => setRankPointsText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            거북이 독서 주간 의무 권수
            <input
              value={quotaText ?? String(settings.weeklyReadingQuota)}
              onChange={(e) => setQuotaText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            자리 변경 비용 (실버)
            <input
              value={seatCostText ?? String(settings.seatChangeCost)}
              onChange={(e) => setSeatCostText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <button
          onClick={() => void saveAll()}
          className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
        >
          설정 저장
        </button>
      </section>

      <PasswordResetPanel />
      <ReadingAdjustPanel />
      <CsvExportPanel />
      <LinksEditor />
      <TeacherMemoWidget />
      </>)}

      {tTab === "approve" && (<>
      {/* 실버 사용 승인 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">
          🛒 실버 사용 승인 대기{" "}
          <span className="text-sm font-normal text-slate-400">
            ({(pendS2?.length ?? 0) + (pendS1?.length ?? 0)}건)
          </span>
        </h2>
        {!(pendS2?.length || pendS1?.length) && (
          <p className="mt-2 text-sm text-slate-400">대기 중인 신청이 없어요.</p>
        )}
        <ul className="mt-3 space-y-2">
          {([
            ...(pendS2 ?? []).map((r) => ({ r, kind: "s2" as WalletKind })),
            ...(pendS1 ?? []).map((r) => ({ r, kind: "s1" as WalletKind })),
          ]).map(({ r, kind }) => (
            <li
              key={`${kind}-${r.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span>
                <b>{studentById.get(r.studentId)?.name}</b> · {r.item}{" "}
                <span className="text-xs text-slate-400">
                  ({kind === "s2" ? "2학기" : "이월"} 실버 {r.amount}개)
                </span>
              </span>
              <span className="flex gap-1">
                <button
                  onClick={() => void (kind === "s2" ? decideSpend : decideSpendS1)(r, true)}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white"
                >
                  승인
                </button>
                <button
                  onClick={() => void (kind === "s2" ? decideSpend : decideSpendS1)(r, false)}
                  className="rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-white"
                >
                  반려
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 자리 변경 승인 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">
          🎫 자리 변경 승인 대기{" "}
          <span className="text-sm font-normal text-slate-400">({pendSeat?.length ?? 0}건)</span>
        </h2>
        {!pendSeat?.length && (
          <p className="mt-2 text-sm text-slate-400">대기 중인 신청이 없어요.</p>
        )}
        <ul className="mt-3 space-y-2">
          {pendSeat?.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span>
                <b>{studentById.get(r.studentId)?.name}</b> → {r.week}주차 {r.targetGroup}모둠{" "}
                {r.targetRole} 지킴이
              </span>
              <span className="flex gap-1">
                <button
                  onClick={() =>
                    void (async () => {
                      try {
                        const occ = await findOccupant(r.week, r.targetGroup, r.targetRole);
                        const cost = settings!.seatChangeCost;
                        await decideSeat(r, true, occ ?? undefined, cost);
                        setMsg(
                          `✅ 승인: ${studentById.get(r.studentId)?.name} ↔ ${occ ? studentById.get(occ)?.name : "빈자리"} 교환 · 실버 ${cost}개 차감 완료`
                        );
                      } catch (e) {
                        setMsg(`⚠️ ${e instanceof Error ? e.message : "승인 실패"}`);
                      }
                    })()
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white"
                >
                  승인(자리 교환)
                </button>
                <button
                  onClick={() => void decideSeat(r, false)}
                  className="rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-white"
                >
                  반려
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      </>)}

      {tTab === "shop" && (<>
      <ShopMenuEditor />
      {/* 실버 지급 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">🪙 실버 지급 (2학기)</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={grantSid}
            onChange={(e) => setGrantSid(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}번 {s.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={grantAmt}
            onChange={(e) => setGrantAmt(e.target.value)}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={grantNote}
            onChange={(e) => setGrantNote(e.target.value)}
            placeholder="사유 (예: 격주 MVP)"
            className="min-w-40 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() =>
              void (async () => {
                try {
                  await grantSilver(grantSid, Number(grantAmt) || 0, grantNote);
                  setMsg(`✅ ${studentById.get(grantSid)?.name}에게 실버 ${grantAmt}개 지급`);
                  setGrantNote("");
                } catch (e) {
                  setMsg(`⚠️ 지급 실패: ${e instanceof Error ? e.message : String(e)}`);
                }
              })()
            }
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
          >
            지급
          </button>
        </div>
      </section>

      </>)}

      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
