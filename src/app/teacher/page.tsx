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
  usePendingSeatRequests,
  useDecideSeatRequest,
  findOccupant,
} from "@/lib/query/seatChange";
import { useBestGroups, useSetBestGroup } from "@/lib/query/classMeta";
import LinksEditor from "@/components/teacher/LinksEditor";
import { TeacherMemoWidget, BiweeklySettlePanel, BonusPanel } from "@/components/teacher/MemoAndSettle";
import PasswordResetPanel from "@/components/teacher/PasswordResetPanel";
import ReadingAdjustPanel from "@/components/teacher/ReadingAdjustPanel";
import TransferPanel from "@/components/teacher/TransferPanel";
import CoinAuditPanel from "@/components/teacher/CoinAuditPanel";
import BookletExportPanel from "@/components/teacher/BookletExportPanel";
import CsvExportPanel from "@/components/teacher/CsvExportPanel";
import DailyReportPanel from "@/components/teacher/DailyReportPanel";
import TodaySubmissionsPanel from "@/components/teacher/TodaySubmissionsPanel";
import SampleDataPanel from "@/components/teacher/SampleDataPanel";
import BetaResetPanel from "@/components/teacher/BetaResetPanel";
import BannerEditor from "@/components/teacher/BannerEditor";
import { BETA_END } from "@/components/BetaBanner";
import ScoreDiagnosisPanel from "@/components/teacher/ScoreDiagnosisPanel";
import SubTabs from "@/components/ui/SubTabs";
import { SkeletonPage } from "@/components/ui/Skeleton";
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

  const [tTab, setTTab] = useState<"score" | "approve" | "tools">("score");
  // 하위탭 — 긴 세로 스크롤 대신 목적별 분리 (사용자 요청)
  const [scoreTab, setScoreTab] = useState<"today" | "report" | "reward">("today");
  const [toolsTab, setToolsTab] = useState<"settings" | "manage">("settings");
  const [date, setDate] = useState(todayKST());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AggregateResult | null>(null);
  const [msg, setMsg] = useState("");
  const { toast, confirm } = useFeedback();

  // 설정 드래프트 — null이면 서버값 사용, 편집 시 모듈형 컨트롤이 직접 값 조작
  const [dPeer, setDPeer] = useState<number[] | null>(null);
  const [dRank, setDRank] = useState<number[] | null>(null);
  const [dQuota, setDQuota] = useState<number | null>(null);
  const [dSeat, setDSeat] = useState<number | null>(null);
  const [dOpen, setDOpen] = useState<number | null>(null);
  const [dClose, setDClose] = useState<number | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const isTeacher = role === "teacher";
  const { data: pendSeat } = usePendingSeatRequests(isTeacher);
  const decideSeat = useDecideSeatRequest();


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
        if (r.redoneDates.length) {
          for (const dt of r.redoneDates)
            void qc.invalidateQueries({ queryKey: ["dailyScores", dt] });
          void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
          toast(
            `♻️ 감상문 삭제 반영 재집계: ${r.redoneDates.map((dt) => dt.slice(5)).join(", ")}`,
            "success"
          );
        }
        if (r.missedRankDates.length)
          toast(
            `⚠️ 순위 미선정으로 순위 점수 0점 처리된 날: ${r.missedRankDates
              .map((dt) => dt.slice(5))
              .join(", ")} — 점수·집계에서 날짜 선택 후 순위 저장→재집계하면 반영돼요`,
            "warn"
          );
        if (r.skippedRange)
          toast(
            `⚠️ ${r.skippedRange.days}일치(${r.skippedRange.from}~${r.skippedRange.to})는 소급 상한(14일)을 넘어 자동 집계에서 제외됐어요 — 필요하면 날짜별 수동 집계로 처리하세요`,
            "warn"
          );
      })
      .catch((e: unknown) => {
        // 자동 집계 실패를 조용히 삼키면 점수가 밀린 채 아무도 모른다 — 반드시 알린다
        toast(
          `⚠️ 자동 집계·정산 실패: ${e instanceof Error ? e.message : String(e)} — 점수·집계 탭에서 수동 실행해주세요`,
          "error"
        );
      });
  }, [settings, role, qc, toast]);

  if (role !== "teacher") {
    return (
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <p className="text-sm text-ink-500">🔒 선생님만 들어올 수 있는 곳이에요.</p>
      </section>
    );
  }
  if (!settings) return <SkeletonPage />;

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
          { key: "approve" as const, label: "🎫 자리 승인" },
          { key: "tools" as const, label: "⚙️ 설정·도구" },
        ]}
        active={tTab}
        onChange={setTTab}
      />

      {tTab === "score" && (<>
      <SubTabs
        tabs={[
          { key: "today" as const, label: "📌 오늘 집계" },
          { key: "report" as const, label: "📄 리포트" },
          { key: "reward" as const, label: "🏆 보상·도구" },
        ]}
        active={scoreTab}
        onChange={setScoreTab}
      />

      {scoreTab === "today" && (<>
      {/* 오늘 제출 현황 — 집계 전 원시 데이터 확인 (저장되고 있는지 즉시 확인) */}
      <TodaySubmissionsPanel date={date} />

      {/* 종회 루틴: ① 순위 저장 → ② 집계 실행 — 매일 쓰는 두 카드를 리포트 위, 한 행(2열)에 */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">

      {/* 오늘의 모둠 순위(1~5위) 선정 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h2 className="text-lg font-bold">👑 오늘의 모둠 순위</h2>
        <p className="mt-1 text-xs text-ink-600">
          잘한 순서대로 눌러주세요 (1위→5위) — 순위대로 5·4·3·2·1점, <b>1위는 +1점 더</b>.
          저장 후 옆 <b>집계 실행</b>으로 반영돼요.
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
                // 5개 미만 저장은 나머지 모둠 순위 점수 0점 — 실수(누락)인지 확인
                if (bestRanking.length < 5) {
                  const missing = [1, 2, 3, 4, 5].filter((g) => !bestRanking.includes(g));
                  const ok = await confirm({
                    title: `${bestRanking.length}개 모둠만 저장할까요?`,
                    body: `${missing.join("·")}모둠은 순위 점수를 받지 못해요 (0점). 전체 순위를 매기려면 취소 후 모둠을 더 눌러주세요.`,
                    confirmLabel: "이대로 저장",
                    danger: true,
                  });
                  if (!ok) return;
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
        <p className="mt-1 text-xs text-ink-600">
          평가·MVP·칭찬을 모아 <b>오늘 점수를 계산</b>해요. 종회 때 1번 — 다시 눌러도
          안전해요. 🤖 <b>밀린 날은 자동 처리</b>되니 오늘 것만 직접!
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
      </div>
      </>)}

      {/* 데일리 리포트 — 오늘 한눈에 + 인쇄 */}
      {scoreTab === "report" && <DailyReportPanel date={date} onDateChange={setDate} />}

      {/* 가끔 쓰는 도구들 — 2열로 스크롤 압축 */}
      {scoreTab === "reward" && (
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        <BiweeklySettlePanel />
        <BonusPanel />
        <ScoreDiagnosisPanel />
        <SampleDataPanel date={date} />
      </div>
      )}
      </>)}

      {tTab === "tools" && (<>
      <SubTabs
        tabs={[
          { key: "settings" as const, label: "⚙️ 설정" },
          { key: "manage" as const, label: "🧰 관리 도구" },
        ]}
        active={toolsTab}
        onChange={setToolsTab}
      />

      {toolsTab === "settings" && (<>
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
            <p className="mt-1 text-xs text-ink-600">
              학생은 이 시간에만 실버·골드 사용을 신청할 수 있어요. (승인은 선생님이 다음 날 아침에)
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-600">시작</span>
                <NumberStepper
                  value={dOpen ?? settings.requestOpenHour}
                  min={0}
                  max={23}
                  onChange={setDOpen}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-600">마감</span>
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
      </>)}

      {toolsTab === "manage" && (<>
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        <PasswordResetPanel />
        <ReadingAdjustPanel />
        <div className="lg:col-span-2">
          <TransferPanel />
        </div>
        {/* 학생 칩 25개가 넓게 퍼지는 카드는 전체 폭 */}
        <div className="lg:col-span-2">
          <BookletExportPanel />
        </div>
        <CsvExportPanel />
        <LinksEditor />
        <CoinAuditPanel />
        <div className="lg:col-span-2">
          <TeacherMemoWidget />
        </div>
      </div>

      {/* 베타 테스트 초기화 — 베타 기간에만 노출 (개학 후 실데이터 보호) */}
      {todayKST() <= BETA_END && <BetaResetPanel />}
      </>)}
      </>)}

      {tTab === "approve" && (<>
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-ink-200 bg-white px-3.5 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-[15px]">
                <span className="shrink-0 rounded bg-brand-weak px-1.5 py-0.5 text-[12px] font-bold text-brand-strong">
                  {studentById.get(r.studentId)?.name}
                </span>
                <span className="truncate text-ink-800">
                  → <b>{r.week}주차 {r.targetGroup}모둠</b> {r.targetRole} 지킴이
                </span>
              </span>
              <span className="flex gap-1.5">
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
                  className="press rounded-btn bg-success px-4 py-2 text-sm font-bold text-white"
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
                  className="press rounded-btn border border-danger/40 bg-white px-4 py-2 text-sm font-bold text-danger"
                >
                  반려
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      </>)}


      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
