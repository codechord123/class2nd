"use client";
// Team — 2학기 핵심 (요구사항 §A):
//  · 우리 모둠: 모둠원 4명을 역할 관점으로 상호평가 (척도는 교사 설정값)
//  · 다른 모둠: 우수 모둠 벤치마킹 평가 → 집계 시 Dense Ranking → 모둠원 전원 순위점수
//  · 점수는 학생(개인)에게 귀속 — 2주마다 모둠이 바뀌어도 누적 유지
// 읽기 예산: 학생 1일 = 본인 평가 2문서 + 집계 2문서. 저장 후 재조회 없음.
import { useSession } from "@/stores/session";
import { friendlyWriteError } from "@/lib/auth";
import { isWeekend, shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { students, studentById, ROLE_INFO } from "@/lib/roster";
import { DEFAULT_PEER_CRITERIA } from "@/lib/peerCriteria";
import { useSettings } from "@/lib/query/settings";
import {
  useMyEvaluation,
  useDailyScores,
  useCumulativeScores,
  useLatestAggregated,
  useSaveFair,
  useSaveMvp,
  useSavePeerChecks,
  useSavePeerNotes,
  useSaveToTeacher,
  useSaveReflection,
} from "@/lib/query/evaluation";
import { BETA_END } from "@/components/BetaBanner";
import { useUiText, uiTextOf } from "@/lib/uiText";
import JuiceBurst from "@/components/ui/Juice";
import {
  useAttendance,
  useBestGroups,
  useComplimentCoverage,
  usePeerCriteria,
  useSetComplimentCoverage,
} from "@/lib/query/classMeta";
import TeamStats from "@/components/team/TeamStats";
import AttendancePanel from "@/components/team/AttendancePanel";
import PeerEvalRow from "@/components/team/PeerEvalRow";
import ReceivedPeerEval from "@/components/team/ReceivedPeerEval";
import EventBanner from "@/components/EventBanner";
import MyRecord from "@/components/team/MyRecord";
import GroupGoals from "@/components/team/GroupGoals";
import GroupBreakdown from "@/components/team/GroupBreakdown";
import ClassRecap from "@/components/team/ClassRecap";
import ReceivedNotes from "@/components/team/ReceivedNotes";
import SubTabs from "@/components/ui/SubTabs";
import { SkeletonPage } from "@/components/ui/Skeleton";
import { useFeedback } from "@/components/ui/Feedback";
import { useEffect, useRef, useState } from "react";
import type { DailyScoreRow, RoleKey } from "@/types";

const roleEmoji = Object.fromEntries(ROLE_INFO.map((r) => [r.key, r.emoji]));
const COMP_MIN = 10; // 칭찬 최소 글자 수 — "ㅇㅇ" 같은 한 글자 땡 방지 (사용자 확정)

// 📍 오늘의 3가지 플로팅 진행 바 — 긴 화면 어디에 있어도 남은 일이 보인다.
// 칩을 누르면 그 섹션으로 부드럽게 이동, 3가지 완료 순간엔 초록 배지가 잠깐 반짝
// (완료 상태로 다시 들어와도 한 번 반짝 — 홈 JuiceBurst와 같은 '기분 좋음 우선').
// 부모의 조기 return 아래에서 훅을 못 쓰므로(React #310) 자체 훅을 가진 컴포넌트로 분리.
function TodayProgressBar({
  doneScores,
  doneMvp,
  doneFair,
  doneComp,
}: {
  doneScores: boolean;
  doneMvp: boolean;
  doneFair: boolean;
  doneComp: boolean;
}) {
  const allDone3 = doneScores && doneMvp && doneFair && doneComp;
  const [doneFlash, setDoneFlash] = useState(false);
  useEffect(() => {
    if (!allDone3) return;
    setDoneFlash(true);
    const t = setTimeout(() => setDoneFlash(false), 2600);
    return () => clearTimeout(t);
  }, [allDone3]);

  if (allDone3)
    return doneFlash ? (
      <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2">
        <div className="badge-pop rounded-full bg-success px-4 py-2 text-sm font-bold text-white shadow-pop">
          🎉 오늘의 4가지 완료!
        </div>
      </div>
    ) : null;

  return (
    <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-ink-200 bg-white/95 px-2 py-1.5 shadow-pop backdrop-blur">
        {(
          [
            ["peer-eval", "📋 평가", doneScores],
            ["boss-vote", "🙌 부서장", doneMvp],
            ["fair-vote", "🤝 페어플레이", doneFair],
            ["compliment", "💌 칭찬", doneComp],
          ] as const
        ).map(([id, label, done]) => (
          <button
            key={id}
            onClick={() =>
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className={`press rounded-full px-2.5 py-1 text-xs font-bold ${
              done ? "text-success" : "bg-ink-50 text-ink-600"
            }`}
          >
            {done ? "✅ " : ""}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { role, studentId } = useSession();
  const date = todayKST();
  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);

  const { data: settings } = useSettings();
  const { data: myEval } = useMyEvaluation(date, studentId);
  const savePeerChecks = useSavePeerChecks(date, studentId);
  const { data: peerCriteria } = usePeerCriteria();
  const saveMvp = useSaveMvp(date, studentId);
  const saveFair = useSaveFair(date, studentId);
  const savePeer = useSavePeerNotes(date, studentId);
  const saveToTeacher = useSaveToTeacher(date, studentId);
  const saveReflection = useSaveReflection(date, studentId);
  const { data: uiText } = useUiText(); // 문구 오버라이드 (교사 편집)
  const { data: todayScores } = useDailyScores(date);
  const { data: cumScores } = useCumulativeScores();
  // 받은 칭찬·바라는 점 — 가장 최근 집계일(어제 이하) 문서 1개
  const { data: latestAgg } = useLatestAggregated(shiftDate(date, -1), role === "student");
  const { data: bestGroups } = useBestGroups();
  const { data: attendance } = useAttendance();
  const { data: coverage } = useComplimentCoverage(date, role === "student");
  const setCoverage = useSetComplimentCoverage(date, studentId);

  const [tab, setTab] = useState<"eval" | "me" | "group">("eval");
  const [groupTab, setGroupTab] = useState<"group" | "class">("group"); // 모둠·학급 하위 탭
  const [meTab, setMeTab] = useState<"stats" | "received">("stats"); // 내 기록 하위 탭
  // 홈 '받은 마음' 배너 딥링크 — /team#received로 오면 내 기록 > 받은 것을 바로 연다
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#received") {
      setTab("me");
      setMeTab("received");
    }
  }, []);
  const [tView, setTView] = useState<"group" | "student">("group"); // 교사용 하위 탭
  const [tSid, setTSid] = useState(students.find((s) => !s.inactive)?.id ?? 1); // 교사 개인별 선택
  const [tDate, setTDate] = useState(todayKST()); // 교사 모둠 기록 날짜별 보기
  const [compTo, setCompTo] = useState<number | null>(null);
  const [compText, setCompText] = useState("");
  const [sugTo, setSugTo] = useState<number | null>(null);
  const [sugText, setSugText] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  const [toTeacherText, setToTeacherText] = useState("");
  const [reflText, setReflText] = useState("");
  const [compBurst, setCompBurst] = useState(0); // 칭찬 전송 성공 juice
  const [gaugeBurst, setGaugeBurst] = useState(0); // 실버 게이지 응원 juice
  const [reflBurst, setReflBurst] = useState(0); // 모둠 반성 저장 juice
  const [sending, setSending] = useState(false); // 보내기 더블클릭 중복 전송 방지
  const [mvpBusy, setMvpBusy] = useState(false); // 부서장 투표 저장 중 추가 클릭 무시
  const [bossPick, setBossPick] = useState<number | null>(null); // 부서장 투표 대상(제출 전)
  const [bossReason, setBossReason] = useState(""); // 부서장 투표 이유(필수)
  const [fairBusy, setFairBusy] = useState(false); // 🤝 페어플레이 투표 저장 중 추가 클릭 무시
  // 보낸 칭찬·건의 인라인 수정 (당일 한정 — 평가 문서가 오늘 것이라 자연히 오늘만 가능)
  const [editPeer, setEditPeer] = useState<{ kind: "comp" | "sug"; tid: string; text: string } | null>(null);
  const { toast, confirm } = useFeedback();

  // 데스크탑 더블클릭 오동작 방지 — 같은 토글 버튼이 짧은 간격에 다시 눌리면 무시
  // (마우스 더블클릭 습관 → 선택과 취소가 연달아 일어나는 문제)
  const lastClickRef = useRef<{ key: string; t: number }>({ key: "", t: 0 });
  function firstClick(key: string): boolean {
    const now = Date.now();
    if (lastClickRef.current.key === key && now - lastClickRef.current.t < 450) return false;
    lastClickRef.current = { key, t: now };
    return true;
  }

  if (role === "teacher") {
    return (
      <div className="space-y-4">
        <EventBanner />
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <h2 className="text-lg font-bold">🤝 Team</h2>
          <p className="mt-1 text-sm text-ink-500">
            선생님은 <b>교사</b> 탭에서 집계·오늘의 모둠 선정·칭찬 인쇄를 관리할 수 있어요.
          </p>
        </section>
        <SubTabs
          tabs={[
            { key: "group" as const, label: "🏆 모둠·학급" },
            { key: "student" as const, label: "🧑 개인별 기록" },
          ]}
          active={tView}
          onChange={setTView}
        />
        {tView === "group" && (
          <>
            <AttendancePanel />
            <ClassRecap />
            <GroupGoals />
            {/* 날짜별 모둠 기록 — 지난 날의 분해도 넘겨보며 확인 (사용자 요청) */}
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-ink-200 bg-white p-3 shadow-card">
              <span className="text-sm font-bold text-ink-700">📅 날짜별 모둠 기록</span>
              <button
                onClick={() => setTDate(shiftDate(tDate, -1))}
                className="press rounded-btn bg-ink-100 px-3 py-1.5 text-sm font-bold text-ink-600"
                aria-label="하루 전"
              >
                ◀
              </button>
              <input
                type="date"
                value={tDate}
                max={todayKST()}
                onChange={(e) => e.target.value && setTDate(e.target.value)}
                className="rounded-btn border border-ink-300 px-2.5 py-1.5 text-sm"
              />
              <button
                onClick={() => setTDate(shiftDate(tDate, 1))}
                disabled={tDate >= todayKST()}
                className="press rounded-btn bg-ink-100 px-3 py-1.5 text-sm font-bold text-ink-600 disabled:opacity-30"
                aria-label="하루 후"
              >
                ▶
              </button>
              {tDate !== todayKST() && (
                <button
                  onClick={() => setTDate(todayKST())}
                  className="press rounded-btn bg-brand-weak px-3 py-1.5 text-xs font-bold text-brand-strong"
                >
                  오늘로
                </button>
              )}
            </div>
            <GroupBreakdown date={tDate} />
            <TeamStats cumScores={cumScores} bestGroups={bestGroups} />
          </>
        )}
        {tView === "student" && (
          <>
            {/* 학생 선택 → 그 학생의 '내 기록'(점수 출처 분해 포함)을 교사가 그대로 열람 */}
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-ink-200 bg-white p-3 shadow-card">
              <span className="text-sm font-bold text-ink-700">🧑 학생 선택</span>
              <select
                value={tSid}
                onChange={(e) => setTSid(Number(e.target.value))}
                className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
              >
                {students
                  .filter((s) => !s.inactive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}번 {s.name}
                    </option>
                  ))}
              </select>
              <span className="text-xs text-ink-400">
                학생이 보는 &lsquo;내 기록&rsquo;과 같은 화면이에요 (점수 출처 분해 포함)
              </span>
            </div>
            <MyRecord studentId={tSid} cumScores={cumScores} />
            <ReceivedPeerEval studentId={tSid} readOnly />
            <ReceivedNotes studentId={tSid} />
          </>
        )}
      </div>
    );
  }

  const myGroup = schedule.groups.find(
    (g) => g.chair === studentId || g.members.some((m) => m.studentId === studentId)
  );
  if (!studentId || !myGroup || !settings) {
    return <SkeletonPage />;
  }

  // 우리 모둠 전원(의장 포함) / 평가 대상은 나를 제외. 전출(inactive) 학생도 제외.
  // 오늘 결석한 친구는 '전원 칭찬' 미션 대상에서 빠진다 — 집계와 같은 규칙 (막힘 방지)
  const absentSet = new Set(attendance?.[date] ?? []);
  const isActive = (id: number) => !studentById.get(id)?.inactive;
  const allMembers = [myGroup.chair, ...myGroup.members.map((m) => m.studentId)].filter(
    (id) => isActive(id) && !absentSet.has(id)
  );
  const targets = [
    { studentId: myGroup.chair, role: "소통" },
    ...myGroup.members.map((m) => ({ studentId: m.studentId, role: m.role as string })),
  ].filter(
    (t) => t.studentId !== studentId && isActive(t.studentId) && !absentSet.has(t.studentId)
  );
  // 내 부서(역할) — 나는 이 부서의 부서장으로서 '내 부서 기준'으로 친구들을 평가한다
  const myRole = (
    myGroup.chair === studentId
      ? "소통"
      : (myGroup.members.find((m) => m.studentId === studentId)?.role ?? "소통")
  ) as RoleKey;
  // 내 부서의 O/X 평가 기준 (교사 편집값, 없으면 기본값)
  const myCriteria = peerCriteria?.[myRole] ?? DEFAULT_PEER_CRITERIA[myRole];

  const myRow = todayScores?.[String(studentId)] as DailyScoreRow | undefined;
  const myCum = (cumScores as Record<string, number> | null)?.[String(studentId)];

  // 받은 마음 — 가장 최근 집계일의 칭찬·바라는 점 중 내가 받은 것 (실명 표시)
  const myReceivedComps = (latestAgg?.meta.compliments ?? []).filter((c) => c.to === studentId);
  const myReceivedSugs = (latestAgg?.meta.peerSuggestions ?? []).filter((s) => s.to === studentId);
  const fmtDay = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

  // ── 칭찬(필수·자유 선택) / 건의(필요할 때만) ──────────────────
  // 미션: 모둠원 전원이 1번씩 칭찬받으면 전원 +1점. 그래서 '아직 칭찬 못 받은 친구'를
  // 커버리지 문서로 파악해 앞에 세우고 표시(누가 칭찬했는지는 안 보여줌).
  const evalRec = (myEval ?? {}) as Record<string, unknown>;
  const savedComp = (evalRec._compliments as Record<string, string>) ?? {};
  const savedSug = (evalRec._peerSuggestions as Record<string, string>) ?? {};
  const sentComp = Object.entries(savedComp).filter(([, v]) => v?.trim());
  const sentSug = Object.entries(savedSug).filter(([, v]) => v?.trim());
  const name = (tid: number) => studentById.get(tid)?.name ?? "?";

  // 오늘 우리 모둠 칭찬 커버리지 — { 칭찬한사람: 대상 } → 대상 집합이 '받은 사람'.
  // 내가 보낸 칭찬(savedComp)은 서버 커버리지와 무관하게 즉시 반영(쓰기 실패 대비).
  const receivedSet = new Set([
    ...Object.values(coverage ?? {})
      .map((v) => Number(v))
      .filter((v) => v > 0),
    ...Object.entries(savedComp)
      .filter(([, v]) => v?.trim())
      .map(([k]) => Number(k)),
  ]);
  // 결석한 친구는 🌱(미션 대상)에서 제외 — 집계 규칙과 일치
  const notReceived = (tid: number) => !receivedSet.has(tid) && !absentSet.has(tid);
  // 아직 칭찬 못 받은 우리 모둠원(나 포함 전원 기준) → 미션 대상
  const uncoveredMembers = allMembers.filter((id) => notReceived(id));
  // 내가 칭찬할 수 있는 대상(나 제외): 아직 못 받은 친구를 앞으로
  const sortedTargets = [...targets].sort((a, b) => {
    const ua = notReceived(a.studentId) ? 0 : 1;
    const ub = notReceived(b.studentId) ? 0 : 1;
    return ua === ub ? a.studentId - b.studentId : ua - ub;
  });

  // 부서장 평가는 '선택'이라 전원 요구하지 않는다(안 하면 0점, 강요 X). 한 명이라도 했으면 ✅.
  const doneScores = targets.some((t) => typeof evalRec[t.studentId] === "number");
  const doneMvp = typeof evalRec._mvp === "number" && (evalRec._mvp as number) > 0;
  const doneFair = typeof evalRec._fair === "number" && (evalRec._fair as number) > 0;
  const doneComp = Object.values(savedComp).some((v) => v?.trim());

  // 부서장 평가 — 미션은 바로 보인다(게이트 없음). 마이너스가 없어 안 건드린 친구는 0점이라
  // 결석·미평가로 남에게 손해가 가지 않는다 (사용자 확정).
  const savedPeerChecks = (evalRec._peerChecks as Record<string, boolean[]> | undefined) ?? {};

  // 주말·공휴일엔 평가·칭찬 잠금 (사용자 확정) — 학교 없는 날의 점수 쌓기 방지.
  // 바라는 점·세션 반성(주말에 쓰는 기능)·기록 열람은 그대로 열린다.
  const evalOpen = !isWeekend(date) && !(settings.holidays ?? []).includes(date);

  // 칭찬 보내기 (건의와 독립)
  async function submitComp() {
    if (sending) return;
    if (compTo == null) {
      toast("칭찬할 친구를 골라주세요.", "warn");
      return;
    }
    if (compText.trim().length < COMP_MIN) {
      toast(`칭찬은 ${COMP_MIN}글자 이상 적어주세요 (성의 있게!).`, "warn");
      return;
    }
    setSending(true);
    try {
      await savePeer({ [compTo]: compText.trim() }, {});
      // 커버리지 갱신(best-effort) → 다른 친구 화면에서 '받음'으로. 실패해도 칭찬 저장엔 영향 없음
      void setCoverage(compTo).catch(() => {});
      setCompTo(null);
      setCompText("");
      setCompBurst((k) => k + 1); // 💌 버스트
      toast("💌 칭찬을 전달했어요!", "success");
    } catch (e) {
      toast(friendlyWriteError(e, "저장에 실패했어요."), "error");
    } finally {
      setSending(false);
    }
  }

  // 오늘의 부서장 투표 — 대상 + 이유(필수)를 함께 저장 (인기투표 억제)
  async function submitBoss() {
    if (mvpBusy) return;
    const rec = (myEval as Record<string, unknown> | undefined) ?? {};
    const target = bossPick ?? (typeof rec._mvp === "number" && rec._mvp > 0 ? (rec._mvp as number) : null);
    if (target == null) {
      toast("먼저 부서장을 골라주세요.", "warn");
      return;
    }
    if (!bossReason.trim()) {
      toast("왜 오늘 부서 일을 잘했는지 이유를 적어주세요.", "warn");
      return;
    }
    setMvpBusy(true);
    try {
      await saveMvp(target, bossReason.trim());
      setBossPick(null);
      toast("🙌 오늘의 부서장 투표 완료!", "success");
    } catch (e) {
      toast(friendlyWriteError(e, "저장에 실패했어요."), "error");
    } finally {
      setMvpBusy(false);
    }
  }

  // 건의 보내기 (칭찬과 독립 — 따로 전달)
  async function submitSug() {
    if (sending) return;
    if (sugTo == null) {
      toast("건의를 전할 친구를 골라주세요.", "warn");
      return;
    }
    if (!sugText.trim()) {
      toast("건의 내용을 적어주세요.", "warn");
      return;
    }
    setSending(true);
    try {
      await savePeer({}, { [sugTo]: sugText.trim() });
      setSugTo(null);
      setSugText("");
      setCompBurst((k) => k + 1); // 🙋 전송 juice 공유
      toast("🙋 건의를 전달했어요!", "success");
    } catch (e) {
      toast(friendlyWriteError(e, "저장에 실패했어요."), "error");
    } finally {
      setSending(false);
    }
  }

  // 보낸 칭찬·건의 삭제 — 빈 문자열 merge 저장 = 집계에서 '없음' 처리 (trim 필터와 호환)
  async function deletePeerNote(kind: "comp" | "sug", tid: string) {
    const label = kind === "comp" ? "칭찬" : "건의";
    const ok = await confirm({
      title: `${name(Number(tid))}에게 보낸 ${label}을 삭제할까요?`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      if (kind === "comp") {
        await savePeer({ [tid]: "" }, {});
        // 커버리지 재계산 — 남은 칭찬 대상이 있으면 그 친구로, 없으면 해제(새싹 복귀)
        const rest = Object.entries(savedComp)
          .filter(([k, v]) => k !== tid && v?.trim())
          .map(([k]) => Number(k));
        void setCoverage(rest[0] ?? null).catch(() => {});
      } else {
        await savePeer({}, { [tid]: "" });
      }
      toast(`${label}을 삭제했어요.`);
    } catch (e) {
      toast(friendlyWriteError(e, "삭제에 실패했어요."), "error");
    }
  }

  // 보낸 칭찬·건의 인라인 수정 저장
  async function savePeerEdit() {
    if (!editPeer) return;
    if (!editPeer.text.trim()) {
      toast("내용을 적어주세요. 지우려면 삭제를 눌러요.", "warn");
      return;
    }
    // 칭찬만 10글자 최소 (건의는 짧아도 됨)
    if (editPeer.kind === "comp" && editPeer.text.trim().length < COMP_MIN) {
      toast(`칭찬은 ${COMP_MIN}글자 이상 적어주세요.`, "warn");
      return;
    }
    try {
      if (editPeer.kind === "comp") await savePeer({ [editPeer.tid]: editPeer.text.trim() }, {});
      else await savePeer({}, { [editPeer.tid]: editPeer.text.trim() });
      setEditPeer(null);
      toast("✏️ 수정됐어요!", "success");
    } catch (e) {
      toast(friendlyWriteError(e, "수정에 실패했어요."), "error");
    }
  }

  // 보낸 칭찬·건의 한 줄 — 이름 + 내용 + 수정/삭제 (수정 중엔 인라인 입력)
  const renderSentItem = (kind: "comp" | "sug", tid: string, v: string) => {
    const editing = editPeer?.kind === kind && editPeer.tid === tid;
    return (
      <li
        key={`${kind}-${tid}`}
        className="flex items-start gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm"
      >
        <span className="shrink-0 font-bold text-ink-700">{name(Number(tid))}</span>
        {editing && editPeer ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              value={editPeer.text}
              onChange={(e) => setEditPeer({ ...editPeer, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void savePeerEdit();
              }}
              autoFocus
              className="min-w-0 flex-1 rounded-btn border border-ink-300 bg-white px-2 py-1 text-sm focus:border-brand focus:outline-none"
            />
            <button onClick={() => void savePeerEdit()} className="shrink-0 text-xs font-bold text-brand">
              저장
            </button>
            <button onClick={() => setEditPeer(null)} className="shrink-0 text-xs text-ink-400">
              취소
            </button>
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-ink-600 [overflow-wrap:anywhere]">{v}</span>
            <span className="flex shrink-0 gap-2 text-xs">
              <button onClick={() => setEditPeer({ kind, tid, text: v })} className="text-brand">
                수정
              </button>
              <button
                onClick={() => void deletePeerNote(kind, tid)}
                className="text-ink-400 hover:text-danger"
              >
                삭제
              </button>
            </span>
          </>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <EventBanner />
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-ink-900">
            🤝 Team · {myGroup.groupId}모둠
          </h2>
          <span className="text-xs text-ink-400">{week}주차 · {date}</span>
        </div>
        {/* 큰 숫자 4개 — 개인(오늘·누적) + 우리 모둠(오늘·누적)을 한눈에 (사용자 요청) */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-card bg-ink-50 p-3 text-center">
            <p className="text-xs text-ink-600">오늘 점수</p>
            <p className="tnum mt-0.5 text-2xl font-extrabold text-ink-900">
              {myRow ? myRow.total : "–"}
            </p>
          </div>
          <div className="rounded-card bg-brand-weak p-3 text-center">
            <p className="text-xs text-brand">누적 점수</p>
            <p className="tnum mt-0.5 text-2xl font-extrabold text-brand-strong">{myCum ?? 0}</p>
          </div>
        </div>
        {/* 우리 모둠 요약 + 응원 멘트 — 이미 읽는 문서(오늘 집계 _meta·누적 groupCum) 재사용 */}
        {(() => {
          const gid = String(myGroup.groupId);
          const meta = (todayScores as { _meta?: { groupSums?: Record<string, number>; autoBestGroups?: number[] } } | null | undefined)?._meta;
          const gToday = meta?.groupSums?.[gid];
          let gCumMap = ((cumScores as Record<string, unknown> | null)?.groupCum ?? {}) as Record<string, number>;
          // groupCum이 아직 없으면(초기화 직후 등) 모둠 대항전(GroupGoals)과 같은 폴백 —
          // 개인 누적 합으로 계산해 '누적 0'으로 보이지 않게 (다음 집계 때 새 회계로 자동 전환)
          if (!Object.keys(gCumMap).length && cumScores) {
            const cm = cumScores as Record<string, unknown>;
            gCumMap = Object.fromEntries(
              schedule.groups.map((g) => [
                String(g.groupId),
                [g.chair, ...g.members.map((m) => m.studentId)]
                  .filter(isActive)
                  .reduce((a, id) => a + (typeof cm[String(id)] === "number" ? (cm[String(id)] as number) : 0), 0),
              ])
            );
          }
          const gCum = gCumMap[gid] ?? 0;
          const ranked = Object.entries(gCumMap).sort((a, b) => b[1] - a[1]);
          const myRank = ranked.findIndex(([k]) => k === gid) + 1; // 0 = 데이터 없음
          const gap = myRank > 1 ? (ranked[0]?.[1] ?? 0) - gCum : 0;
          const isBestToday = (meta?.autoBestGroups ?? []).includes(myGroup.groupId);
          // 응원 멘트 — 상태에 따라 하나 (오늘의모둠 > 누적1위 > 추격권 > 기본)
          const cheer = isBestToday
            ? `👑 오늘의 모둠! 우리 ${myGroup.groupId}모둠 최고예요!`
            : myRank === 1
              ? "🏆 모둠 누적 1위 — 다 함께 선두를 지켜요!"
              : myRank > 1 && gap <= 5
                ? `🔥 1위까지 딱 ${gap}점 — 역전 가능해요!`
                : "🐢 꾸준함이 이겨요 — 오늘도 우리 모둠 한 걸음!";
          return (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-card bg-orange-50 p-2.5 text-center">
                  <p className="text-[11px] text-orange-700">👥 모둠 오늘</p>
                  <p className="tnum mt-0.5 text-lg font-extrabold text-orange-800">
                    {gToday ?? "–"}
                  </p>
                </div>
                <div className="rounded-card bg-orange-100/70 p-2.5 text-center">
                  <p className="text-[11px] text-orange-700">
                    🏁 모둠 누적{myRank > 0 && <b className="ml-1">{myRank}위</b>}
                  </p>
                  <p className="tnum mt-0.5 text-lg font-extrabold text-orange-800">{gCum}</p>
                </div>
              </div>
              <p className="mt-2 rounded-btn bg-amber-50 px-3 py-1.5 text-center text-xs font-bold text-amber-800">
                {cheer}
              </p>
            </>
          );
        })()}
        {/* 다음 실버 게이지 — 누적 25점마다 실버 1개 자동 지급. 이미 읽는 누적 문서로 계산(추가 읽기 0) */}
        {(() => {
          const cumVal = Math.max(myCum ?? 0, 0);
          const prog = cumVal % 25;
          const earned = Math.floor(cumVal / 25);
          return (
            <div className="mt-2">
              {/* 누르면 🥈 응원 juice — 마라톤과 같은 놀이 문법 */}
              <button
                type="button"
                onClick={() => setGaugeBurst((k) => k + 1)}
                aria-label="실버 게이지 응원하기"
                key={`g-${gaugeBurst}`}
                className={`press relative block h-5 w-full cursor-pointer rounded-full bg-ink-100 ${
                  gaugeBurst > 0 ? "bar-glow" : ""
                }`}
              >
                <span className="absolute inset-0 overflow-hidden rounded-full">
                  <span
                    className="bar-stripes block h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-400"
                    style={{ width: `${Math.max((prog / 25) * 100, prog > 0 ? 6 : 0)}%` }}
                  />
                </span>
                <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-ink-700">
                  🥈 다음 실버까지 {25 - prog}점 ({prog}/25)
                </span>
                <JuiceBurst
                  fireKey={gaugeBurst}
                  emojis={["🥈", "✨", "⭐"]}
                  className="left-1/2 top-0"
                />
              </button>
              {earned > 0 && (
                <p className="mt-1 text-center text-[11px] text-ink-400">
                  지금까지 점수로 받은 실버 {earned}개 — 25점마다 자동으로 지급돼요
                </p>
              )}
            </div>
          );
        })()}
        {/* 오늘 점수 출처 — 별도 줄 */}
        {myRow ? (
          <div className="mt-2 flex flex-wrap justify-center gap-1 text-xs">
            <span className="rounded-full bg-brand-weak px-2 py-0.5 text-brand-strong">📋 부서장 {myRow.peer >= 0 ? "+" : ""}{myRow.peer}</span>
            {myRow.groupRank !== 0 && (
              <span className="rounded-full bg-warn-weak px-2 py-0.5 text-warn">🏆 순위 +{myRow.groupRank}</span>
            )}
            {myRow.bonus !== 0 && (
              <span className="rounded-full bg-success-weak px-2 py-0.5 text-success">🎁 보너스 {myRow.bonus >= 0 ? "+" : ""}{myRow.bonus}</span>
            )}
            {(myRow.mission ?? 0) > 0 && (
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600">🎯 미션 +{myRow.mission}</span>
            )}
            {(myRow.comp ?? 0) > 0 && (
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600">💌 칭찬 +{myRow.comp}</span>
            )}
            {(myRow.boss ?? 0) > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">👑 부서장 표 +{myRow.boss}</span>
            )}
            {(myRow.fair ?? 0) > 0 && (
              <span className="rounded-full bg-success-weak px-2 py-0.5 text-success">🤝 페어플레이 +{myRow.fair}</span>
            )}
            {(myRow.allDone ?? 0) > 0 && (
              <span className="rounded-full bg-brand-weak px-2 py-0.5 text-brand-strong">📌 할 일 완주 +{myRow.allDone}</span>
            )}
            {(myRow.mvp ?? 0) > 0 && (
              <span className="rounded-full bg-warn-weak px-2 py-0.5 text-warn">⭐ MVP +{myRow.mvp}</span>
            )}
            {(myRow.read ?? 0) > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">📖 독서 +{myRow.read}</span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-center text-xs text-ink-400">아직 오늘 점수는 집계 전이에요</p>
        )}
      </section>

      {/* 받은 마음 — 친구들이 보낸 칭찬·바라는 점을 본인에게 실명으로 전달 (집계 다음 날) */}
      {(myReceivedComps.length > 0 || myReceivedSugs.length > 0) && latestAgg && (
        <section className="rounded-card border border-pink-200 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold">💌 친구들이 보낸 마음</h3>
            <span className="text-xs text-ink-400">{fmtDay(latestAgg.date)}</span>
          </div>
          {myReceivedComps.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {myReceivedComps.map((c, i) => (
                <li
                  key={`rc-${i}`}
                  className="flex items-start gap-2 rounded-btn bg-pink-50 px-3 py-2 text-sm"
                >
                  <span className="shrink-0 font-bold text-pink-700">{name(c.from)}</span>
                  <span className="min-w-0 flex-1 text-ink-700 [overflow-wrap:anywhere]">
                    {c.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {myReceivedSugs.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-ink-500">🙋 친구가 나에게 바라는 점</p>
              <ul className="mt-1.5 space-y-1.5">
                {myReceivedSugs.map((s, i) => (
                  <li
                    key={`rs-${i}`}
                    className="flex items-start gap-2 rounded-btn bg-sky-50 px-3 py-2 text-sm"
                  >
                    <span className="shrink-0 font-bold text-sky-700">{name(s.from)}</span>
                    <span className="min-w-0 flex-1 text-ink-700 [overflow-wrap:anywhere]">
                      {s.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <SubTabs
        tabs={[
          { key: "eval" as const, label: "🤝 평가·칭찬" },
          { key: "me" as const, label: "📒 내 기록" },
          { key: "group" as const, label: "👥 모둠·학급" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "eval" && (
      /* 디벗·데스크탑(lg): 좌우 독립 스택 2열 — 그리드는 행 높이를 서로 맞추느라
         짧은 카드 아래 빈 공간이 생겨서(사용자 지적) 열마다 따로 쌓는다 */
      <div className="space-y-4 lg:flex lg:items-start lg:gap-4 lg:space-y-0">
      <div className="min-w-0 space-y-4 lg:flex-1">

      {/* 주말·공휴일 — 평가·칭찬 잠금 안내 (기록 열람·바라는 점·세션 반성은 열림) */}
      {!evalOpen && (
        <section className="rounded-card border border-ink-200 bg-ink-50 p-5 text-center shadow-card">
          <p className="text-3xl">🏖️</p>
          <p className="mt-1 text-sm font-bold text-ink-700">오늘은 쉬는 날!</p>
          <p className="mt-0.5 text-xs text-ink-500">
            부서장 평가·칭찬은 학교 오는 날에만 열려요. 내 기록과 받은 마음은 언제든 볼 수 있어요.
          </p>
        </section>
      )}

      {evalOpen && (<>
      {/* 모둠 내 상호평가 — 부서장 평가: 내 부서 O/X 기준으로 다른 모둠원을 평가 */}
      <section id="peer-eval" className="scroll-mt-28 rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">🤝 부서장 평가</h3>
        <p className="mt-1 text-[13px] text-ink-600">
          나는 우리 모둠의 <b>{roleEmoji[myRole] ?? "👑"} {myRole} 부서장</b>! 친구가 지킨{" "}
          <b>미션</b>만 눌러서 <b className="text-success">초록색</b>으로 켜요. 미션당 0.5점 —{" "}
          <b>둘 다 +1 · 하나만 +0.5 · 안 켜면 0점</b> (마이너스 없음).
          <b className="text-brand-strong"> 내가 준 평가는 친구에게 실명으로 보여요</b> — 사실대로!
        </p>
        <ul className="mt-3 space-y-2">
          {targets.map((t) => (
            <PeerEvalRow
              key={t.studentId}
              name={studentById.get(t.studentId)?.name ?? "?"}
              roleEmoji={roleEmoji[myRole] ?? "👑"}
              roleLabel={myRole}
              criteria={myCriteria}
              checks={savedPeerChecks[String(t.studentId)] ?? []}
              onToggle={(idx) => {
                const cur = savedPeerChecks[String(t.studentId)] ?? [];
                const next = myCriteria.map((_, i) => (i === idx ? !(cur[i] ?? false) : cur[i] ?? false));
                void savePeerChecks(t.studentId, next).catch((e: Error) =>
                  toast(`⚠️ 저장 실패: ${e.message}`, "error")
                );
              }}
            />
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-ink-400">
          <b>안 건드린 친구는 0점</b> — 잘한 미션만 눌러 초록으로 켜면 돼요. 마이너스가 없어서
          평가를 안 해도 친구에게 손해가 없어요.
        </p>
      </section>

      {/* 오늘의 부서장 투표 — '그날 부서 일을 가장 잘한 사람'. 최다 득표자 고정 +1점.
          이유를 반드시 적게 해서 인기투표를 억제한다 (사용자 확정). */}
      <section id="boss-vote" className="scroll-mt-28 rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">🙌 오늘의 부서장</h3>
        <p className="mt-1 text-[13px] text-ink-600">{uiTextOf(uiText, "team.bossDesc")}</p>
        {(() => {
          const rec = (myEval as Record<string, unknown> | undefined) ?? {};
          const votedId = typeof rec._mvp === "number" && rec._mvp > 0 ? (rec._mvp as number) : null;
          const votedReason = (rec._mvpReason as string) ?? "";
          return (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {targets.map((t) => {
                  const picked = bossPick === t.studentId || (bossPick == null && votedId === t.studentId);
                  return (
                    <button
                      key={t.studentId}
                      onClick={() => {
                        setBossPick(t.studentId);
                        if (votedId !== t.studentId) setBossReason("");
                        else setBossReason(votedReason);
                      }}
                      className={`press rounded-full border px-3 py-1.5 text-sm font-medium ${
                        picked
                          ? "border-warn bg-warn text-white"
                          : "border-ink-200 bg-white text-ink-600 hover:border-warn/40"
                      }`}
                    >
                      {picked && "🙌 "}
                      {studentById.get(t.studentId)?.name}
                    </button>
                  );
                })}
              </div>
              {(bossPick != null || votedId != null) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={bossPick != null ? bossReason : votedReason}
                    onChange={(e) => {
                      if (bossPick == null) setBossPick(votedId);
                      setBossReason(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) void submitBoss();
                    }}
                    placeholder="왜 오늘 부서 일을 잘했나요? (예: 준비물을 꼼꼼히 챙겼어요)"
                    className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => void submitBoss()}
                    disabled={mvpBusy}
                    className="press shrink-0 rounded-btn bg-warn px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {votedId != null && bossPick == null ? "완료" : "투표"}
                  </button>
                  {votedId != null && (
                    <button
                      onClick={() => {
                        if (mvpBusy) return;
                        setMvpBusy(true);
                        void saveMvp(0)
                          .then(() => {
                            setBossPick(null);
                            setBossReason("");
                            toast("투표를 취소했어요.");
                          })
                          .catch((e: Error) => toast(`⚠️ ${e.message}`, "error"))
                          .finally(() => setMvpBusy(false));
                      }}
                      className="press shrink-0 rounded-btn border border-ink-300 bg-white px-3 py-2 text-sm font-bold text-ink-500"
                    >
                      취소
                    </button>
                  )}
                </div>
              )}
              {votedId != null && bossPick == null && (
                <p className="mt-2 text-xs text-ink-500">
                  ✓ <b>{studentById.get(votedId)?.name}</b>에게 투표함 · 이유: {votedReason || "—"}
                </p>
              )}
            </>
          );
        })()}
      </section>

      {/* 🤝 오늘의 페어플레이 — '모둠원 사이에서 배려를 가장 잘한 사람'. 최다 득표자 +1점.
          부서장 투표(일 잘함)와 축이 다르다: 여기는 태도·배려를 본다 (사용자 확정). */}
      <section id="fair-vote" className="scroll-mt-28 rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">🤝 오늘의 페어플레이</h3>
        <p className="mt-1 text-[13px] text-ink-600">
          오늘 모둠원을 가장 잘 <b>배려</b>한 친구는 누구인가요? 양보하고, 도와주고, 기다려준
          친구에게 한 표! (모둠 최다 득표 +1점)
        </p>
        {(() => {
          const rec = (myEval as Record<string, unknown> | undefined) ?? {};
          const votedId = typeof rec._fair === "number" && rec._fair > 0 ? (rec._fair as number) : null;
          return (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {targets.map((t) => {
                  const picked = votedId === t.studentId;
                  return (
                    <button
                      key={t.studentId}
                      onClick={() => {
                        if (fairBusy) return;
                        setFairBusy(true);
                        const next = picked ? 0 : t.studentId; // 같은 친구 다시 누르면 취소
                        void saveFair(next)
                          .then(() =>
                            toast(
                              next
                                ? `🤝 ${studentById.get(next)?.name}에게 페어플레이 한 표!`
                                : "페어플레이 투표를 취소했어요."
                            , next ? "success" : undefined)
                          )
                          .catch((e: Error) => toast(`⚠️ ${e.message}`, "error"))
                          .finally(() => setFairBusy(false));
                      }}
                      disabled={fairBusy}
                      className={`press rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
                        picked
                          ? "border-success bg-success text-white"
                          : "border-ink-200 bg-white text-ink-600 hover:border-success/40"
                      }`}
                    >
                      {picked && "🤝 "}
                      {studentById.get(t.studentId)?.name}
                    </button>
                  );
                })}
              </div>
              {votedId != null && (
                <p className="mt-2 text-xs text-ink-500">
                  ✓ <b>{studentById.get(votedId)?.name}</b>에게 투표함 — 다른 친구를 누르면
                  바꿀 수 있어요.
                </p>
              )}
            </>
          );
        })()}
      </section>
      <TodayProgressBar doneScores={doneScores} doneMvp={doneMvp} doneFair={doneFair} doneComp={doneComp} />
      </>)}
      </div>

      <div className="min-w-0 space-y-4 lg:flex-1">
      {/* 오늘의 칭찬(필수) & 건의(선택) — 자유 선택 + 골고루 넛지. 주말·공휴일엔 잠금 */}
      {evalOpen && (
      <section id="compliment" className="scroll-mt-28 rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">
            💌 오늘의 칭찬
            {(() => {
              // 🔥 미션 연속(팀·학사일) — 3~5일차 +1 · 6~8일차 +2 · 9일차 +3 · 10일차 +4 (모둠 점수).
              // 누적 문서의 missionStreak 재사용 (추가 읽기 0)
              const st =
                ((cumScores as Record<string, unknown> | null)?.missionStreak as
                  | Record<string, number>
                  | undefined)?.[String(myGroup?.groupId ?? 0)] ?? 0;
              const nextLabel =
                st < 3 ? "3일부터 팀 +1" : st < 6 ? "팀 +1 중 · 6일부터 +2" : st < 9 ? "팀 +2 중 · 9일 +3" : st < 10 ? "팀 +3 중 · 10일 +4" : "팀 +4 만점!";
              return st > 0 ? (
                <span className="ml-1.5 rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-pink-600">
                  🔥 우리 모둠 미션 연속 {st}일 ({nextLabel})
                </span>
              ) : null;
            })()}
          </h3>
        </div>
        <p className="mt-1 text-[13px] text-ink-600">
          오늘 고마웠던 친구를 골라 칭찬해요. 내가 쓴 칭찬은 <b>다음 날 그 친구에게 내 이름과
          함께</b> 전달돼요. 🌱 새싹 친구는 <b>아직 칭찬을 못 받은 친구</b> — 칭찬을 받으면
          새싹이 사라져요!
        </p>
        {/* 미션 진행 — 모둠원 전원 칭찬받기 */}
        <div
          className={`mt-2 rounded-btn px-3 py-2 text-xs ${
            uncoveredMembers.length === 0
              ? "bg-success-weak text-success"
              : "bg-pink-50 text-pink-700"
          }`}
        >
          🎯 <b>오늘의 미션</b> — 모둠 전원이 칭찬받으면 <b>전원 +1점</b>! (
          {allMembers.length - uncoveredMembers.length}/{allMembers.length}명 받음)
          {uncoveredMembers.length > 0 ? (
            <>
              {" "}
              🌱 새싹 친구: <b>{uncoveredMembers.map(name).join(", ")}</b>
            </>
          ) : (
            <> 🎉 전원 달성!</>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sortedTargets.map((t) => (
            <button
              key={t.studentId}
              onClick={() => {
                if (!firstClick(`comp-${t.studentId}`)) return;
                setCompTo(compTo === t.studentId ? null : t.studentId);
              }}
              className={`press rounded-full border px-3 py-1.5 text-sm font-medium ${
                compTo === t.studentId
                  ? "border-pink-400 bg-pink-500 text-white"
                  : notReceived(t.studentId)
                    ? "border-pink-300 bg-pink-50 text-pink-700"
                    : "border-ink-200 bg-white text-ink-500 hover:border-pink-300"
              }`}
            >
              {notReceived(t.studentId) && "🌱 "}
              {name(t.studentId)}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={compText}
            onChange={(e) => setCompText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void submitComp();
            }}
            placeholder={
              compTo != null
                ? `${name(compTo)}에게 칭찬 한마디 (${COMP_MIN}글자 이상)`
                : "먼저 위에서 친구를 골라주세요"
            }
            className="min-w-0 flex-1 rounded-btn border border-ink-200 bg-white px-3 py-2 text-sm"
          />
          <span className="relative shrink-0">
            <button
              onClick={() => void submitComp()}
              disabled={sending || compText.trim().length < COMP_MIN}
              className="press rounded-btn bg-pink-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? "저장 중…" : "칭찬 보내기"}
            </button>
            {/* 전송 성공 juice — 💌가 버튼 위로 터진다 */}
            <JuiceBurst fireKey={compBurst} emojis={["💌", "✨", "💛"]} className="left-1/2 top-0" />
          </span>
        </div>
        {/* 글자 수 힌트 — 10글자 미만이면 남은 글자, 충족하면 초록 체크 */}
        {compTo != null && (
          <p className={`mt-1 text-[11px] ${compText.trim().length >= COMP_MIN ? "text-emerald-600" : "text-ink-400"}`}>
            {compText.trim().length >= COMP_MIN
              ? `✓ 좋아요! (${compText.trim().length}글자)`
              : `${COMP_MIN}글자 이상 — ${COMP_MIN - compText.trim().length}글자 더 써주세요`}
          </p>
        )}
        {sentComp.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold text-ink-500">
              💌 오늘 보낸 칭찬 <span className="font-normal text-ink-400">— 오늘 안엔 고치거나 지울 수 있어요</span>
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {sentComp.map(([tid, v]) => renderSentItem("comp", tid, v))}
            </ul>
          </div>
        )}

        {/* 건의 — 필요할 때만 */}
        <button
          onClick={() => {
            if (!firstClick("sug-open")) return;
            setSugOpen((v) => !v);
          }}
          className="mt-3 text-xs font-medium text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline"
        >
          {sugOpen ? "건의 접기 ▲" : "🙋 친구에게 건의할 게 있어요 (선택) ▼"}
        </button>
        {sugOpen && (
          <div className="mt-2 rounded-btn bg-sky-50 p-3">
            <div className="flex flex-wrap gap-1.5">
              {targets.map((t) => (
                <button
                  key={t.studentId}
                  onClick={() => {
                    if (!firstClick(`sug-${t.studentId}`)) return;
                    setSugTo(sugTo === t.studentId ? null : t.studentId);
                  }}
                  className={`press rounded-full border px-2.5 py-1 text-xs font-medium ${
                    sugTo === t.studentId
                      ? "border-sky-400 bg-sky-500 text-white"
                      : "border-ink-200 bg-white text-ink-600"
                  }`}
                >
                  {name(t.studentId)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={sugText}
                onChange={(e) => setSugText(e.target.value)}
                placeholder="예: 준비물을 미리 챙겨오면 더 좋을 것 같아"
                className="min-w-0 flex-1 rounded-btn border border-ink-200 bg-white px-3 py-2 text-sm"
              />
              <button
                onClick={() => void submitSug()}
                disabled={sending}
                className="press shrink-0 rounded-btn bg-sky-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {sending ? "저장 중…" : "건의 보내기"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">
              건의는 칭찬과 <b>따로</b> 보낼 수 있어요.
              <b className="text-sky-600"> 다음 날 그 친구에게 내 이름과 함께 보여요</b> — 예의
              바르고 다정하게 부탁해요!
            </p>
          </div>
        )}
        {sentSug.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold text-ink-500">
              🙋 오늘 보낸 건의 <span className="font-normal text-ink-400">— 오늘 안엔 고치거나 지울 수 있어요</span>
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {sentSug.map(([tid, v]) => renderSentItem("sug", tid, v))}
            </ul>
          </div>
        )}
      </section>
      )}

      {/* 선생님에게 바라는 점 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">🙏 선생님에게 바라는 점</h3>
        <p className="mt-1 text-[13px] text-ink-600">
          오늘 선생님께 하고 싶은 말이나 바라는 점을 남겨주세요. 선생님만 볼 수 있어요.
        </p>
        {(() => {
          const saved = (myEval as Record<string, unknown> | undefined)?._toTeacher as
            | string
            | undefined;
          return saved ? (
            <p className="mt-3 rounded-btn bg-sky-50 px-3 py-2 text-sm text-sky-700">
              💬 {saved}
              <button
                onClick={() => setToTeacherText(saved)}
                className="ml-2 text-xs text-sky-400 underline"
              >
                고치기
              </button>
            </p>
          ) : null;
        })()}
        <div className="mt-3 flex items-center gap-2">
          <input
            value={toTeacherText}
            onChange={(e) => setToTeacherText(e.target.value)}
            placeholder="예: 체육 시간이 더 있었으면 좋겠어요"
            className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() =>
              void (async () => {
                if (!toTeacherText.trim()) {
                  toast("내용을 적어주세요.", "warn");
                  return;
                }
                if (sending) return;
                setSending(true);
                try {
                  await saveToTeacher(toTeacherText);
                  toast("전달됐어요!", "success");
                  setToTeacherText("");
                } catch (e) {
                  toast(friendlyWriteError(e, "전달에 실패했어요."), "error");
                } finally {
                  setSending(false);
                }
              })()
            }
            disabled={sending}
            className="press shrink-0 rounded-btn bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            보내기
          </button>
        </div>
      </section>

      {/* 세션 모둠 반성 — 세션 마지막 주(짝수 주) 금~일에만 열림. 세션 리포트에 수록 */}
      {(() => {
        const dow = new Date(date + "T00:00:00+09:00").getUTCDay();
        const reflectionOpen =
          (week % 2 === 0 && (dow >= 5 || dow === 0)) || date <= BETA_END; // 베타 중엔 연습 가능
        if (!reflectionOpen) return null;
        const savedRefl = (myEval as Record<string, unknown> | undefined)?._reflection as
          | string
          | undefined;
        return (
          <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
            <h3 className="text-lg font-bold">📝 세션 모둠 반성</h3>
            <p className="mt-1 text-[13px] text-ink-600">
              {uiTextOf(uiText, "team.reflectionDesc")}
            </p>
            {savedRefl && (
              <p className="mt-2 rounded-btn bg-brand-weak px-3 py-2 text-sm text-brand-strong">
                💬 {savedRefl}
                <button
                  onClick={() => setReflText(savedRefl)}
                  className="ml-2 text-xs text-brand underline"
                >
                  고치기
                </button>
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <input
                value={reflText}
                onChange={(e) => setReflText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                }}
                placeholder="예: 서로 칭찬을 잘했어요. 다음엔 준비물을 더 잘 챙기고 싶어요"
                className="min-w-0 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() =>
                  void (async () => {
                    if (sending) return;
                    setSending(true);
                    try {
                      await saveReflection(reflText);
                      setReflBurst((k) => k + 1);
                      toast("📝 모둠 반성이 저장됐어요!", "success");
                      setReflText("");
                    } catch (e) {
                      toast(friendlyWriteError(e, "저장에 실패했어요."), "error");
                    } finally {
                      setSending(false);
                    }
                  })()
                }
                disabled={sending}
                className="press relative shrink-0 rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                저장
                <JuiceBurst fireKey={reflBurst} emojis={["📝", "✨", "💙"]} className="left-1/2 top-0" />
              </button>
            </div>
          </section>
        );
      })()}
      </div>

      </div>)}

      {/* 개인 통계 — 하위 탭: 내 기록(점수 분해) / 받은 마음(칭찬·건의 날짜별) */}
      {tab === "me" && (
        <div className="space-y-4">
          <SubTabs
            tabs={[
              { key: "stats" as const, label: "📒 내 기록" },
              { key: "received" as const, label: "💌 받은 것" },
            ]}
            active={meTab}
            onChange={setMeTab}
          />
          {meTab === "stats" && <MyRecord studentId={studentId} cumScores={cumScores} />}
          {meTab === "received" && (
            // 받은 부서장 평가(+이의제기) + 받은 칭찬·건의를 한곳에 (스크롤·발견성 개선)
            <div className="space-y-4">
              <ReceivedPeerEval studentId={studentId} />
              <ReceivedNotes studentId={studentId} />
            </div>
          )}
        </div>
      )}

      {/* 모둠·학급 통계 — 하위 탭으로 분리: 모둠 대항전(+점수 분해) / 학급 통계 (사용자 요청) */}
      {tab === "group" && (
        <div className="space-y-4">
          <SubTabs
            tabs={[
              { key: "group" as const, label: "🏆 모둠 대항" },
              { key: "class" as const, label: "🎉 우리 반" },
            ]}
            active={groupTab}
            onChange={setGroupTab}
          />
          {groupTab === "group" && (
            // 모둠 대항전 + 점수 분해 (둘 다 모둠 점수 관점)
            <div className="space-y-4">
              <GroupGoals myStudentId={studentId} />
              <GroupBreakdown myStudentId={studentId} />
            </div>
          )}
          {groupTab === "class" && (
            // 오늘의 반 하이라이트 + 학급 통계 (둘 다 반 전체 관점)
            <div className="space-y-4">
              <ClassRecap myStudentId={studentId} />
              <TeamStats cumScores={cumScores} bestGroups={bestGroups} />
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-ink-400">
        ※ 점수는 매일 선생님 집계 후 반영돼요. 모둠이 바뀌어도 내 점수는 계속 쌓여요.
      </p>
    </div>
  );
}
