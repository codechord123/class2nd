"use client";
// Team — 2학기 핵심 (요구사항 §A):
//  · 우리 모둠: 모둠원 4명을 역할 관점으로 상호평가 (척도는 교사 설정값)
//  · 다른 모둠: 우수 모둠 벤치마킹 평가 → 집계 시 Dense Ranking → 모둠원 전원 순위점수
//  · 점수는 학생(개인)에게 귀속 — 2주마다 모둠이 바뀌어도 누적 유지
// 읽기 예산: 학생 1일 = 본인 평가 2문서 + 집계 2문서. 저장 후 재조회 없음.
import { useSession } from "@/stores/session";
import { todayKST, weekOfDate } from "@/lib/date";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { studentById, ROLE_INFO } from "@/lib/roster";
import { useSettings } from "@/lib/query/settings";
import {
  useMyEvaluation,
  useSaveEvaluation,
  useDailyScores,
  useCumulativeScores,
  useSaveMvp,
  useSavePeerNotes,
  useSaveToTeacher,
} from "@/lib/query/evaluation";
import { useBestGroups } from "@/lib/query/classMeta";
import TeamStats from "@/components/team/TeamStats";
import SubTabs from "@/components/ui/SubTabs";
import { useFeedback } from "@/components/ui/Feedback";
import { useState } from "react";
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
          className={`min-w-10 rounded-btn border px-2 py-1.5 text-sm font-bold transition-colors ${
            value === v
              ? v > 0
                ? "border-success bg-success text-white"
                : v < 0
                  ? "border-danger bg-danger text-white"
                  : "border-ink-400 bg-ink-400 text-white"
              : "border-ink-200 bg-white text-ink-500 hover:border-ink-400"
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
  const { data: bestGroups } = useBestGroups();

  const [tab, setTab] = useState<"eval" | "stats">("eval");
  const [compTo, setCompTo] = useState<number | null>(null);
  const [compText, setCompText] = useState("");
  const [sugTo, setSugTo] = useState<number | null>(null);
  const [sugText, setSugText] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  const [toTeacherText, setToTeacherText] = useState("");
  const [sending, setSending] = useState(false); // 보내기 더블클릭 중복 전송 방지
  const { toast } = useFeedback();

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
    return <p className="text-sm text-ink-400">불러오는 중…</p>;
  }

  // 평가 대상: 나를 제외한 우리 모둠 전원 (의장 포함)
  const targets = [
    { studentId: myGroup.chair, role: "소통" },
    ...myGroup.members.map((m) => ({ studentId: m.studentId, role: m.role as string })),
  ].filter((t) => t.studentId !== studentId);

  const myRow = todayScores?.[String(studentId)] as DailyScoreRow | undefined;
  const myCum = (cumScores as Record<string, number> | null)?.[String(studentId)];

  // ── 칭찬(필수·자유 선택 + 골고루 넛지) / 건의(필요할 때만) ─────
  // 시기성 보존: 오늘 실제 고마웠던 친구를 직접 고른다. 대신 '내가 최근에 칭찬 안 한
  // 친구'를 앞에 세우고 🌱 배지로 표시해 골고루를 유도(강제 배정 아님).
  // 받는 커버리지는 교사 데일리 리포트의 '칭찬 못 받은 친구' 목록이 보완한다.
  const evalRec = (myEval ?? {}) as Record<string, unknown>;
  const savedComp = (evalRec._compliments as Record<string, string>) ?? {};
  const name = (tid: number) => studentById.get(tid)?.name ?? "?";

  // 내 칭찬 이력(localStorage, 읽기 0) — 최근에 칭찬한 날짜 기록 → 오래된/없는 친구 우선
  const praiseLogKey = `praiseLog-${studentId}`;
  const praiseLog: Record<string, string> =
    typeof window === "undefined" ? {} : JSON.parse(localStorage.getItem(praiseLogKey) ?? "{}");
  const sortedTargets = [...targets].sort((a, b) => {
    const la = praiseLog[a.studentId] ?? "";
    const lb = praiseLog[b.studentId] ?? "";
    return la === lb ? a.studentId - b.studentId : la < lb ? -1 : 1; // 안 한(빈)·오래된 순
  });
  const neverPraised = (tid: number) => !praiseLog[tid];

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
      // 칭찬 이력 갱신 → 다음부터 다른 친구가 앞에 옴
      localStorage.setItem(praiseLogKey, JSON.stringify({ ...praiseLog, [compTo]: date }));
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
            <span className="rounded-full bg-brand-weak px-2 py-0.5 text-brand-strong">🫂 모둠 {myRow.peer >= 0 ? "+" : ""}{myRow.peer}</span>
            {myRow.groupRank !== 0 && (
              <span className="rounded-full bg-warn-weak px-2 py-0.5 text-warn">🏆 순위 +{myRow.groupRank}</span>
            )}
            {myRow.bonus !== 0 && (
              <span className="rounded-full bg-success-weak px-2 py-0.5 text-success">🎁 보너스 {myRow.bonus >= 0 ? "+" : ""}{myRow.bonus}</span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-center text-xs text-ink-400">아직 오늘 점수는 집계 전이에요</p>
        )}
      </section>

      <SubTabs
        tabs={[
          { key: "eval" as const, label: "🫂 평가·칭찬" },
          { key: "stats" as const, label: "📈 통계" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "eval" && (<>

      {/* 모둠 내 상호평가 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="font-bold">🫂 우리 모둠 평가</h3>
        <p className="mt-1 text-xs text-ink-500">
          친구가 역할을 얼마나 잘 수행했는지 점수를 주세요. 누르면 바로 저장돼요.
        </p>
        <ul className="mt-3 space-y-2">
          {targets.map((t) => (
            <li
              key={t.studentId}
              className="flex items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <span>{t.role === "소통" ? "👑" : roleEmoji[t.role]}</span>
                <b>{studentById.get(t.studentId)?.name}</b>
                <span className="text-xs text-ink-400">{t.role} 지킴이</span>
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

      {/* 오늘의 모둠 MVP 투표 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="font-bold">⭐ 오늘의 우리 모둠 MVP</h3>
        <p className="mt-1 text-xs text-ink-500">오늘 가장 빛난 모둠 친구 1명을 뽑아주세요.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {targets.map((t) => {
            const selected = (myEval as Record<string, unknown> | undefined)?._mvp === t.studentId;
            return (
              <button
                key={t.studentId}
                onClick={() =>
                  void saveMvp(selected ? 0 : t.studentId).then(
                    () => toast(selected ? "MVP 선택을 취소했어요." : "⭐ MVP를 뽑았어요!"),
                    (e: Error) => toast(`⚠️ 저장 실패: ${e.message}`, "error")
                  )
                }
                className={`press rounded-full border px-3 py-1.5 text-sm font-medium ${
                  selected
                    ? "border-warn bg-warn text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:border-warn/40"
                }`}
              >
                {selected && "⭐ "}
                {studentById.get(t.studentId)?.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* 오늘의 칭찬(필수) & 건의(선택) — 자유 선택 + 골고루 넛지 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">💌 오늘의 칭찬</h3>
          {/* 오늘 평가 완성 체크리스트 */}
          <span className="flex gap-1.5 text-[11px]">
            <span className={doneScores ? "text-success" : "text-ink-300"}>
              {doneScores ? "✅" : "○"} 평가
            </span>
            <span className={doneMvp ? "text-success" : "text-ink-300"}>
              {doneMvp ? "✅" : "○"} MVP
            </span>
            <span className={doneComp ? "text-success" : "text-ink-300"}>
              {doneComp ? "✅" : "○"} 칭찬
            </span>
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          오늘 고마웠던 친구를 골라 칭찬해요. 🌱 붙은 친구는 아직 내가 칭찬 안 한 친구예요 —
          골고루 칭찬해 주세요!
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sortedTargets.map((t) => (
            <button
              key={t.studentId}
              onClick={() => setCompTo(compTo === t.studentId ? null : t.studentId)}
              className={`press rounded-full border px-3 py-1.5 text-sm font-medium ${
                compTo === t.studentId
                  ? "border-pink-400 bg-pink-500 text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-pink-300"
              }`}
            >
              {neverPraised(t.studentId) && "🌱 "}
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
        {doneComp && (
          <p className="mt-2 text-xs text-ink-500">
            오늘 보낸 칭찬:{" "}
            {Object.entries(savedComp)
              .filter(([, v]) => v?.trim())
              .map(([tid, v]) => `${name(Number(tid))}(${v})`)
              .join(" · ")}
          </p>
        )}

        {/* 건의 — 필요할 때만 */}
        <button
          onClick={() => setSugOpen((v) => !v)}
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
                  onClick={() => setSugTo(sugTo === t.studentId ? null : t.studentId)}
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
            </p>
          </div>
        )}
      </section>

      {/* 선생님에게 바라는 점 */}
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="font-bold">🙏 선생님에게 바라는 점</h3>
        <p className="mt-1 text-xs text-ink-500">
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

      </>)}

      {tab === "stats" && <TeamStats cumScores={cumScores} bestGroups={bestGroups} />}

      <p className="text-xs text-ink-400">
        ※ 점수는 매일 선생님 집계 후 반영돼요. 모둠이 바뀌어도 내 점수는 계속 쌓여요.
      </p>
    </div>
  );
}
