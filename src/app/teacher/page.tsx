"use client";
// 교사 탭 — 평가 척도 설정(요구사항 Q3: 교사가 수정 가능) + 일일 집계 실행.
// 집계는 교사만 원시 평가(하루 최대 50문서)를 읽고, 학생들은 결과 문서만 읽는다.
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/stores/session";
import { useSettings, useSaveSettings } from "@/lib/query/settings";
import { useQueryClient } from "@tanstack/react-query";
import { aggregateDate, type AggregateResult } from "@/lib/aggregate";
import { runAutoTasks } from "@/lib/autoRun";
import { todayKST, weekOfDate } from "@/lib/date";
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
import DailyReportPanel from "@/components/teacher/DailyReportPanel";
import SampleDataPanel from "@/components/teacher/SampleDataPanel";
import BetaResetPanel from "@/components/teacher/BetaResetPanel";
import BannerEditor from "@/components/teacher/BannerEditor";
import { BETA_END } from "@/components/BetaBanner";
import ScoreDiagnosisPanel from "@/components/teacher/ScoreDiagnosisPanel";
import SubTabs from "@/components/ui/SubTabs";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import NumberStepper from "@/components/ui/NumberStepper";
import { ScaleEditor, RankPointsEditor } from "@/components/teacher/SettingsEditors";
import { requestWindowLabel } from "@/lib/requestWindow";
import { useFeedback } from "@/components/ui/Feedback";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import type { ClassSettings } from "@/types";

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
  const { toast } = useFeedback();

  // 설정 드래프트 — null이면 서버값 사용, 편집 시 모듈형 컨트롤이 직접 값 조작
  const [dPeer, setDPeer] = useState<number[] | null>(null);
  const [dRank, setDRank] = useState<number[] | null>(null);
  const [dQuota, setDQuota] = useState<number | null>(null);
  const [dSeat, setDSeat] = useState<number | null>(null);
  const [dOpen, setDOpen] = useState<number | null>(null);
  const [dClose, setDClose] = useState<number | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);

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
  const [bestRanking, setBestRanking] = useState<number[]>([]); // 누른 순서 = 1위→5위

  // 자동 집계·정산: 교사 화면이 열리면 밀린 하루 집계(자정 기준)와 끝난 세션 정산을 자동 처리
  const autoRan = useRef(false);
  useEffect(() => {
    if (!settings || role !== "teacher" || autoRan.current) return;
    autoRan.current = true;
    runAutoTasks(settings)
      .then((r) => {
        if (!r) return;
        if (r.aggregatedDates.length) {
          for (const dt of r.aggregatedDates)
            void qc.invalidateQueries({ queryKey: ["dailyScores", dt] });
          void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
          toast(
            `🤖 밀린 일일 집계 자동 완료: ${r.aggregatedDates.map((dt) => dt.slice(5)).join(", ")}`,
            "success"
          );
        }
        if (r.settledPeriods.length) {
          void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
          void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
          toast(
            `🏆 ${r.settledPeriods.map((p) => `${p}기`).join("·")} 세션 보상 자동 정산 완료!`,
            "success"
          );
        }
      })
      .catch(() => {
        /* 자동 작업 실패는 조용히 — 아래 수동 버튼으로 언제든 가능 */
      });
  }, [settings, role, qc, toast]);

  if (role !== "teacher") {
    return (
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <p className="text-sm text-ink-500">🔒 선생님만 들어올 수 있는 곳이에요.</p>
      </section>
    );
  }
  if (!settings) return <p className="text-sm text-ink-400">불러오는 중…</p>;

  async function runAggregate() {
    setBusy(true);
    setMsg("");
    try {
      const r = (await aggregateDate(date, settings!))!; // 수동 실행은 skipIfEmpty 없음 — 항상 결과 반환
      setResult(r);
      // 집계 결과 캐시 무효화 — 다음 조회 때 새 문서를 읽는다
      void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
      void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      const noBest = Object.keys(r.groupRanks).length === 0;
      setMsg(
        `✅ ${date} 집계 완료 — 평가 ${r.evaluatorCount}명 제출` +
          (noBest ? " · ⚠️ 오늘의 모둠 미선정(순위 점수 0점) — 아래에서 선정 후 재집계하세요" : "")
      );
    } catch (e) {
      setMsg(`⚠️ 집계 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    const next: ClassSettings = {
      ...settings!,
      peerScale: dPeer ?? settings!.peerScale,
      groupScale: settings!.groupScale,
      rankPoints: dRank ?? settings!.rankPoints,
      weeklyReadingQuota: dQuota ?? settings!.weeklyReadingQuota,
      seatChangeCost: dSeat ?? settings!.seatChangeCost,
      requestOpenHour: dOpen ?? settings!.requestOpenHour,
      requestCloseHour: dClose ?? settings!.requestCloseHour,
    };
    try {
      await saveSettings(next);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
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
      {/* 데일리 리포트 — 오늘 한눈에 + 인쇄 */}
      <DailyReportPanel date={date} />

      {/* 샘플 데이터 — 개학 전 미리보기 */}
      <SampleDataPanel date={date} />

      {/* 오늘의 모둠 순위(1~5위) 선정 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold">👑 오늘의 모둠 순위</h2>
        <p className="mt-1 text-xs text-ink-500">
          잘한 순서대로 모둠을 눌러주세요 (1위→5위). 순위대로 5·4·3·2·1점 + <b>오늘의 모둠(1위)은
          +1점 더</b> 받아요. 세션 통계(최고 모둠)는 1위만 집계. <b>순위 저장 후 아래에서 집계
          실행</b>하면 반영돼요.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((g) => {
            const pos = bestRanking.indexOf(g);
            return (
              <button
                key={g}
                onClick={() =>
                  setBestRanking(
                    pos >= 0 ? bestRanking.filter((x) => x !== g) : [...bestRanking, g]
                  )
                }
                className={`press rounded-btn border px-3 py-2 text-sm font-bold ${
                  pos === 0
                    ? "border-warn bg-warn text-white"
                    : pos > 0
                      ? "border-brand bg-brand text-white"
                      : "border-ink-200 bg-white text-ink-600"
                }`}
              >
                {pos >= 0 && `${pos + 1}위 · `}
                {g}모둠
              </button>
            );
          })}
          <button
            onClick={() =>
              void (async () => {
                if (bestRanking.length === 0) {
                  toast("먼저 모둠을 순서대로 눌러주세요.", "warn");
                  return;
                }
                try {
                  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
                  const chairId =
                    scheduleOfWeek(week).groups.find((g) => g.groupId === bestRanking[0])?.chair ??
                    0;
                  await setBestGroup(date, bestRanking, chairId);
                  toast(
                    `✅ ${date} 순위 저장: ${bestRanking.map((g, i) => `${i + 1}위 ${g}모둠`).join(" · ")} — 집계 실행 시 반영돼요`
                  );
                } catch (e) {
                  toast(`⚠️ 저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
                }
              })()
            }
            className="press rounded-btn bg-warn px-4 py-2 text-sm font-bold text-white"
          >
            순위 저장
          </button>
        </div>
        {bestGroups?.[date] && (
          <p className="mt-2 text-sm text-ink-600">
            {date} 저장된 순위:{" "}
            <b>
              {(bestGroups[date].ranking ?? [bestGroups[date].groupId])
                .map((g, i) => `${i + 1}위 ${g}모둠`)
                .join(" · ")}
            </b>{" "}
            (오늘의 모둠 의장 {studentById.get(bestGroups[date].chairId)?.name})
          </p>
        )}
      </section>

      {/* 일일 집계 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold">📊 일일 평가 집계</h2>
        <p className="mt-1 text-xs text-ink-500">
          학생들이 낸 평가(모둠 친구 점수·MVP·칭찬)를 모아 <b>오늘 점수를 계산</b>해서 반영해요.
          <br />
          순서: ① 위 👑에서 모둠 순위 저장 → ② 종회 때 이 버튼 1번. 다시 눌러도 안전해요(누적
          자동 보정).
          <br />
          🤖 <b>어제까지 밀린 집계는 자동</b>이에요 — 깜빡해도 다음 날 교사 화면이 열리면 자정
          기준으로 자동 처리돼요. (오늘 것만 종회 때 직접!)
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayKST()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void runAggregate()}
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "집계 중…" : "집계 실행"}
          </button>
        </div>
        {result && (
          <p className="mt-2 text-sm text-ink-600">
            모둠 순위:{" "}
            {Object.entries(result.groupRanks)
              .sort((a, b) => a[1] - b[1])
              .map(([g, r]) => `${g}모둠 ${r}위`)
              .join(" · ")}
          </p>
        )}
      </section>

      <BiweeklySettlePanel />
      <BonusPanel />
      <ScoreDiagnosisPanel />
      </>)}

      {tTab === "tools" && (<>
      {/* 학급 목표 배너 편집 */}
      <BannerEditor />
      {/* 평가 척도 설정 — 모듈형 */}
      <Card title="⚙️ 평가 척도 설정" desc="버튼으로 조절하고, 학생 화면 미리보기로 바로 확인하세요.">
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ScaleEditor
            label="모둠 내 평가 척도"
            value={dPeer ?? settings.peerScale}
            onChange={setDPeer}
          />
          <RankPointsEditor value={dRank ?? settings.rankPoints} onChange={setDRank} />
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-card bg-ink-50 p-4">
              <span className="text-sm font-bold text-ink-800">🐢 주간 의무 권수</span>
              <NumberStepper
                value={dQuota ?? settings.weeklyReadingQuota}
                min={0}
                max={20}
                onChange={setDQuota}
              />
            </div>
            <div className="flex items-center justify-between rounded-card bg-ink-50 p-4">
              <span className="text-sm font-bold text-ink-800">🎫 자리 변경 비용(실버)</span>
              <NumberStepper
                value={dSeat ?? settings.seatChangeCost}
                min={0}
                max={20}
                onChange={setDSeat}
              />
            </div>
          </div>

          {/* 토큰 신청 가능 시간대 — 아침 신청 러시 방지 */}
          <div className="rounded-card bg-ink-50 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink-800">🕓 토큰 신청 가능 시간</span>
              <span className="rounded-full bg-brand-weak px-2.5 py-0.5 text-xs font-bold text-brand-strong">
                {requestWindowLabel(
                  dOpen ?? settings.requestOpenHour,
                  dClose ?? settings.requestCloseHour
                )}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              학생은 이 시간에만 실버·골드 사용을 신청할 수 있어요. (승인은 선생님이 다음 날 아침에)
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500">시작</span>
                <NumberStepper
                  value={dOpen ?? settings.requestOpenHour}
                  min={0}
                  max={23}
                  onChange={setDOpen}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500">마감</span>
                <NumberStepper
                  value={dClose ?? settings.requestCloseHour}
                  min={1}
                  max={24}
                  onChange={setDClose}
                />
              </div>
            </div>
          </div>
        </div>
        <Button
          variant={savedFlash ? "success" : "primary"}
          onClick={() => void saveAll()}
          className="mt-4"
        >
          {savedFlash ? "✓ 저장됨" : "설정 저장"}
        </Button>
      </Card>

      <button
        onClick={() => setShowMoreTools((v) => !v)}
        className="press flex w-full items-center justify-between rounded-card border border-ink-200 bg-white px-4 py-3 text-left shadow-card"
      >
        <span className="text-sm font-bold text-ink-800">
          🧰 기타 관리 도구
          <span className="ml-1 font-normal text-ink-400">
            비밀번호·독서 보정·CSV·바로가기·메모
          </span>
        </span>
        <span className="shrink-0 text-xs text-ink-400">
          {showMoreTools ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>
      {showMoreTools && (
        <>
          <PasswordResetPanel />
          <ReadingAdjustPanel />
          <CsvExportPanel />
          <LinksEditor />
          <TeacherMemoWidget />
        </>
      )}

      {/* 베타 테스트 초기화 — 베타 기간에만 노출 (개학 후 실데이터 보호) */}
      {todayKST() <= BETA_END && <BetaResetPanel />}
      </>)}

      {tTab === "approve" && (<>
      {/* 실버 사용 승인 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold">
          🛒 실버 사용 승인 대기{" "}
          <span className="text-sm font-normal text-ink-400">
            ({(pendS2?.length ?? 0) + (pendS1?.length ?? 0)}건)
          </span>
        </h2>
        {!(pendS2?.length || pendS1?.length) && (
          <p className="mt-2 text-sm text-ink-400">대기 중인 신청이 없어요.</p>
        )}
        <ul className="mt-3 space-y-2">
          {([
            ...(pendS2 ?? []).map((r) => ({ r, kind: "s2" as WalletKind })),
            ...(pendS1 ?? []).map((r) => ({ r, kind: "s1" as WalletKind })),
          ]).map(({ r, kind }) => (
            <li
              key={`${kind}-${r.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm"
            >
              <span>
                <b>{studentById.get(r.studentId)?.name}</b> · {r.item}{" "}
                <span className="text-xs text-ink-400">
                  ({kind === "s2" ? "2학기" : "이월"} 실버 {r.amount}개)
                </span>
              </span>
              <span className="flex gap-1">
                <button
                  onClick={() =>
                    void (kind === "s2" ? decideSpend : decideSpendS1)(r, true).then(
                      () => toast(`✅ 승인: ${studentById.get(r.studentId)?.name} · ${r.item}`),
                      (e: Error) => toast(`⚠️ ${e.message}`, "error")
                    )
                  }
                  className="press rounded-btn bg-success px-3 py-1 text-xs font-bold text-white"
                >
                  승인
                </button>
                <button
                  onClick={() =>
                    void (kind === "s2" ? decideSpend : decideSpendS1)(r, false).then(
                      () => toast(`반려 처리했어요: ${r.item}`),
                      (e: Error) => toast(`⚠️ ${e.message}`, "error")
                    )
                  }
                  className="press rounded-btn bg-danger px-3 py-1 text-xs font-bold text-white"
                >
                  반려
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 자리 변경 승인 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold">
          🎫 자리 변경 승인 대기{" "}
          <span className="text-sm font-normal text-ink-400">({pendSeat?.length ?? 0}건)</span>
        </h2>
        {!pendSeat?.length && (
          <p className="mt-2 text-sm text-ink-400">대기 중인 신청이 없어요.</p>
        )}
        <ul className="mt-3 space-y-2">
          {pendSeat?.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm"
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
                        toast(
                          `✅ 승인: ${studentById.get(r.studentId)?.name} ↔ ${occ ? studentById.get(occ)?.name : "빈자리"} 교환 · 실버 ${cost}개 차감`
                        );
                      } catch (e) {
                        toast(`⚠️ ${e instanceof Error ? e.message : "승인 실패"}`, "error");
                      }
                    })()
                  }
                  className="press rounded-btn bg-success px-3 py-1 text-xs font-bold text-white"
                >
                  승인(자리 교환)
                </button>
                <button
                  onClick={() =>
                    void decideSeat(r, false).then(
                      () => toast("반려 처리했어요."),
                      (e: Error) => toast(`⚠️ ${e.message}`, "error")
                    )
                  }
                  className="press rounded-btn bg-danger px-3 py-1 text-xs font-bold text-white"
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
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold">🪙 실버 지급 (2학기)</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={grantSid}
            onChange={(e) => setGrantSid(Number(e.target.value))}
            className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}번 {s.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={grantAmt}
            onChange={(e) => setGrantAmt(e.target.value)}
            className="w-20 rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          <input
            value={grantNote}
            onChange={(e) => setGrantNote(e.target.value)}
            placeholder="사유 (예: 격주 MVP)"
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
                try {
                  await grantSilver(grantSid, n, grantNote);
                  toast(`✅ ${studentById.get(grantSid)?.name}에게 실버 ${n}개 지급`);
                  setGrantNote("");
                } catch (e) {
                  toast(`⚠️ 지급 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
                }
              })()
            }
            className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
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
