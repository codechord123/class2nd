"use client";
// Team — 2학기 핵심 (요구사항 §A):
//  · 우리 모둠: 모둠원 4명을 역할 관점으로 상호평가 (척도는 교사 설정값)
//  · 다른 모둠: 우수 모둠 벤치마킹 평가 → 집계 시 Dense Ranking → 모둠원 전원 순위점수
//  · 점수는 학생(개인)에게 귀속 — 2주마다 모둠이 바뀌어도 누적 유지
// 읽기 예산: 학생 1일 = 본인 평가 2문서 + 집계 2문서. 저장 후 재조회 없음.
import { useSession } from "@/stores/session";
import { shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { studentById, ROLE_INFO } from "@/lib/roster";
import { useSettings } from "@/lib/query/settings";
import {
  useMyEvaluation,
  useSaveEvaluation,
  useDailyScores,
  useCumulativeScores,
  useLatestAggregated,
  useSaveMvp,
  useSavePeerNotes,
  useSaveToTeacher,
} from "@/lib/query/evaluation";
import {
  useBestGroups,
  useComplimentCoverage,
  useSetComplimentCoverage,
} from "@/lib/query/classMeta";
import TeamStats from "@/components/team/TeamStats";
import SubTabs from "@/components/ui/SubTabs";
import { SkeletonPage } from "@/components/ui/Skeleton";
import { useFeedback } from "@/components/ui/Feedback";
import { useRef, useState } from "react";
import type { DailyScoreRow } from "@/types";

const roleEmoji = Object.fromEntries(ROLE_INFO.map((r) => [r.key, r.emoji]));

function ScaleButtons({
  scale,
  value,
  onSelect,
}: {
  scale: number[];
  value: number | undefined;
  onSelect: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {scale.map((v) => (
        <button
          key={v}
          onClick={() => onSelect(v)}
          className={`press min-w-11 rounded-btn border px-2 py-2 text-[15px] font-bold transition-colors ${
            value === v
              ? v > 0
                ? "border-success bg-success text-white shadow-card"
                : v < 0
                  ? "border-danger bg-danger text-white shadow-card"
                  : "border-ink-500 bg-ink-500 text-white shadow-card"
              : "border-ink-300 bg-white text-ink-600 hover:border-ink-500 hover:text-ink-900"
          }`}
        >
          {v > 0 ? `+${v}` : v}
        </button>
      ))}
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
  const saveEval = useSaveEvaluation(date, studentId);
  const saveMvp = useSaveMvp(date, studentId);
  const savePeer = useSavePeerNotes(date, studentId);
  const saveToTeacher = useSaveToTeacher(date, studentId);
  const { data: todayScores } = useDailyScores(date);
  const { data: cumScores } = useCumulativeScores();
  // 받은 칭찬·바라는 점 — 가장 최근 집계일(어제 이하) 문서 1개
  const { data: latestAgg } = useLatestAggregated(shiftDate(date, -1), role === "student");
  const { data: bestGroups } = useBestGroups();
  const { data: coverage } = useComplimentCoverage(date, role === "student");
  const setCoverage = useSetComplimentCoverage(date, studentId);

  const [tab, setTab] = useState<"eval" | "stats">("eval");
  const [compTo, setCompTo] = useState<number | null>(null);
  const [compText, setCompText] = useState("");
  const [sugTo, setSugTo] = useState<number | null>(null);
  const [sugText, setSugText] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  const [toTeacherText, setToTeacherText] = useState("");
  const [sending, setSending] = useState(false); // 보내기 더블클릭 중복 전송 방지
  const [mvpBusy, setMvpBusy] = useState(false); // MVP 저장 중 추가 클릭 무시
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
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <h2 className="text-lg font-bold">🤝 Team</h2>
          <p className="mt-1 text-sm text-ink-500">
            선생님은 <b>교사</b> 탭에서 집계·오늘의 모둠 선정·칭찬 인쇄를 관리할 수 있어요.
          </p>
        </section>
        <TeamStats cumScores={cumScores} bestGroups={bestGroups} />
      </div>
    );
  }

  const myGroup = schedule.groups.find(
    (g) => g.chair === studentId || g.members.some((m) => m.studentId === studentId)
  );
  if (!studentId || !myGroup || !settings) {
    return <SkeletonPage />;
  }

  // 우리 모둠 전원(의장 포함) / 평가 대상은 나를 제외
  const allMembers = [myGroup.chair, ...myGroup.members.map((m) => m.studentId)];
  const targets = [
    { studentId: myGroup.chair, role: "소통" },
    ...myGroup.members.map((m) => ({ studentId: m.studentId, role: m.role as string })),
  ].filter((t) => t.studentId !== studentId);
  // 내 부서(역할) — 나는 이 부서의 부서장으로서 '내 부서 기준'으로 친구들을 평가한다
  const myRole =
    myGroup.chair === studentId
      ? "소통"
      : ((myGroup.members.find((m) => m.studentId === studentId)?.role as string) ?? "");

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
  const notReceived = (tid: number) => !receivedSet.has(tid);
  // 아직 칭찬 못 받은 우리 모둠원(나 포함 전원 기준) → 미션 대상
  const uncoveredMembers = allMembers.filter((id) => notReceived(id));
  // 내가 칭찬할 수 있는 대상(나 제외): 아직 못 받은 친구를 앞으로
  const sortedTargets = [...targets].sort((a, b) => {
    const ua = notReceived(a.studentId) ? 0 : 1;
    const ub = notReceived(b.studentId) ? 0 : 1;
    return ua === ub ? a.studentId - b.studentId : ua - ub;
  });

  // 오늘 평가 완성 체크 — 정량 전원 + MVP + 칭찬 1건 (건의는 선택이라 미포함)
  const doneScores = targets.every((t) => typeof evalRec[t.studentId] === "number");
  const doneMvp = typeof evalRec._mvp === "number" && (evalRec._mvp as number) > 0;
  const doneComp = Object.values(savedComp).some((v) => v?.trim());

  async function submitPeerNotes() {
    if (sending) return;
    if (compTo == null) {
      toast("칭찬할 친구를 골라주세요.", "warn");
      return;
    }
    if (!compText.trim()) {
      toast("칭찬 내용을 적어주세요.", "warn");
      return;
    }
    if (sugOpen && sugText.trim() && sugTo == null) {
      toast("건의를 전할 친구를 골라주세요.", "warn");
      return;
    }
    setSending(true);
    const compliments: Record<string, string> = { [compTo]: compText.trim() };
    const suggestions: Record<string, string> = {};
    if (sugOpen && sugTo != null && sugText.trim()) suggestions[sugTo] = sugText.trim();
    try {
      await savePeer(compliments, suggestions);
      // 커버리지 갱신(best-effort) → 다른 친구 화면에서 '받음'으로. 실패해도 칭찬 저장엔 영향 없음
      void setCoverage(compTo).catch(() => {});
      setCompTo(null);
      setCompText("");
      setSugTo(null);
      setSugText("");
      setSugOpen(false);
      toast("💌 전달됐어요!", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
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
      toast(e instanceof Error ? e.message : "삭제에 실패했어요.", "error");
    }
  }

  // 보낸 칭찬·건의 인라인 수정 저장
  async function savePeerEdit() {
    if (!editPeer) return;
    if (!editPeer.text.trim()) {
      toast("내용을 적어주세요. 지우려면 삭제를 눌러요.", "warn");
      return;
    }
    try {
      if (editPeer.kind === "comp") await savePeer({ [editPeer.tid]: editPeer.text.trim() }, {});
      else await savePeer({}, { [editPeer.tid]: editPeer.text.trim() });
      setEditPeer(null);
      toast("✏️ 수정됐어요!", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "수정에 실패했어요.", "error");
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
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-ink-900">
            🤝 Team · {myGroup.groupId}모둠
          </h2>
          <span className="text-xs text-ink-400">{week}주차 · {date}</span>
        </div>
        {/* 큰 숫자 2개를 앵커로 */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-card bg-ink-50 p-3 text-center">
            <p className="text-xs text-ink-500">오늘 점수</p>
            <p className="tnum mt-0.5 text-2xl font-extrabold text-ink-900">
              {myRow ? myRow.total : "–"}
            </p>
          </div>
          <div className="rounded-card bg-brand-weak p-3 text-center">
            <p className="text-xs text-brand">누적 점수</p>
            <p className="tnum mt-0.5 text-2xl font-extrabold text-brand-strong">{myCum ?? 0}</p>
          </div>
        </div>
        {/* 오늘 점수 출처 — 별도 줄 */}
        {myRow ? (
          <div className="mt-2 flex flex-wrap justify-center gap-1 text-xs">
            <span className="rounded-full bg-brand-weak px-2 py-0.5 text-brand-strong">🤝 모둠 {myRow.peer >= 0 ? "+" : ""}{myRow.peer}</span>
            {myRow.groupRank !== 0 && (
              <span className="rounded-full bg-warn-weak px-2 py-0.5 text-warn">🏆 순위 +{myRow.groupRank}</span>
            )}
            {myRow.bonus !== 0 && (
              <span className="rounded-full bg-success-weak px-2 py-0.5 text-success">🎁 보너스 {myRow.bonus >= 0 ? "+" : ""}{myRow.bonus}</span>
            )}
            {(myRow.mission ?? 0) > 0 && (
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600">🎯 미션 +{myRow.mission}</span>
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
          { key: "stats" as const, label: "📈 통계" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "eval" && (
      /* 디벗·데스크탑(lg): 좌우 독립 스택 2열 — 그리드는 행 높이를 서로 맞추느라
         짧은 카드 아래 빈 공간이 생겨서(사용자 지적) 열마다 따로 쌓는다 */
      <div className="space-y-4 lg:flex lg:items-start lg:gap-4 lg:space-y-0">
      <div className="min-w-0 space-y-4 lg:flex-1">

      {/* 모둠 내 상호평가 — 부서장 평가: 각자 자기 부서 기준으로 다른 모둠원을 평가 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">🤝 부서장 평가</h3>
        <p className="mt-1 text-[13px] text-ink-600">
          나는 우리 모둠의 <b>{roleEmoji[myRole] ?? "👑"} {myRole} 부서장</b>! 친구들이 오늘{" "}
          <b>{myRole}</b>을(를) 얼마나 잘 지켰는지 내 부서 기준으로 평가해요. 누르면 바로
          저장돼요.
        </p>
        <ul className="mt-3 space-y-2">
          {targets.map((t) => (
            <li
              key={t.studentId}
              className="flex items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2"
            >
              <div className="flex items-center gap-2 text-[15px]">
                <span>{t.role === "소통" ? "👑" : roleEmoji[t.role]}</span>
                <b>{studentById.get(t.studentId)?.name}</b>
                <span className="text-xs text-ink-500">{t.role} 부서장</span>
              </div>
              <ScaleButtons
                scale={settings.peerScale}
                value={myEval?.[t.studentId]}
                onSelect={(v) =>
                  void saveEval({ [t.studentId]: v }).catch((e: Error) =>
                    toast(`⚠️ 저장 실패: ${e.message}`, "error")
                  )
                }
              />
            </li>
          ))}
        </ul>
      </section>

      {/* 오늘의 부서장 투표 — 칭호만 (MVP는 점수 합산으로 자동 선정) */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">👑 오늘의 부서장</h3>
        <p className="mt-1 text-[13px] text-ink-600">
          오늘 <b>가장 친절하게 모둠원들을 안내</b>하고 자기 부서 역할을 잘한 부서장 1명을
          뽑아주세요. (오늘의 MVP는 그날 점수 합산으로 자동 선정 — 모둠 1위 +1점, 학급 1위 +2점
          추가)
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {targets.map((t) => {
            const selected = (myEval as Record<string, unknown> | undefined)?._mvp === t.studentId;
            return (
              <button
                key={t.studentId}
                onClick={() => {
                  if (mvpBusy || !firstClick(`mvp-${t.studentId}`)) return;
                  setMvpBusy(true);
                  // 선택 결과는 칩 색으로 충분 — 토스트를 띄우지 않는다 (연타 시 화면을 가리는 문제)
                  void saveMvp(selected ? 0 : t.studentId)
                    .catch((e: Error) => toast(`⚠️ 저장 실패: ${e.message}`, "error"))
                    .finally(() => setMvpBusy(false));
                }}
                className={`press rounded-full border px-3 py-1.5 text-sm font-medium ${
                  selected
                    ? "border-warn bg-warn text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:border-warn/40"
                }`}
              >
                {selected && "👑 "}
                {studentById.get(t.studentId)?.name}
              </button>
            );
          })}
        </div>
      </section>
      </div>

      <div className="min-w-0 space-y-4 lg:flex-1">
      {/* 오늘의 칭찬(필수) & 건의(선택) — 자유 선택 + 골고루 넛지 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">💌 오늘의 칭찬</h3>
          {/* 오늘 평가 완성 체크리스트 */}
          <span className="flex gap-1.5 text-[11px]">
            <span className={doneScores ? "text-success" : "text-ink-300"}>
              {doneScores ? "✅" : "○"} 평가
            </span>
            <span className={doneMvp ? "text-success" : "text-ink-300"}>
              {doneMvp ? "✅" : "○"} 부서장
            </span>
            <span className={doneComp ? "text-success" : "text-ink-300"}>
              {doneComp ? "✅" : "○"} 칭찬
            </span>
          </span>
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
            placeholder={
              compTo != null
                ? `${name(compTo)}에게 칭찬 한마디`
                : "먼저 위에서 친구를 골라주세요"
            }
            className="min-w-0 flex-1 rounded-btn border border-ink-200 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={() => void submitPeerNotes()}
            disabled={sending}
            className="press shrink-0 rounded-btn bg-pink-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {sending ? "저장 중…" : "보내기"}
          </button>
        </div>
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
            <input
              value={sugText}
              onChange={(e) => setSugText(e.target.value)}
              placeholder="예: 준비물을 미리 챙겨오면 더 좋을 것 같아"
              className="mt-2 w-full rounded-btn border border-ink-200 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-ink-400">
              건의는 칭찬 보내기를 누를 때 함께 전달돼요. 비워두면 안 보내져요.
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
                  toast(e instanceof Error ? e.message : "전달에 실패했어요.", "error");
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
      </div>

      </div>)}

      {tab === "stats" && <TeamStats cumScores={cumScores} bestGroups={bestGroups} />}

      <p className="text-xs text-ink-400">
        ※ 점수는 매일 선생님 집계 후 반영돼요. 모둠이 바뀌어도 내 점수는 계속 쌓여요.
      </p>
    </div>
  );
}
