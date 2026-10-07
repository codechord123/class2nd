"use client";
// 🙂 감정 돌아보기 (교사) — 오늘 한눈에 + 살펴볼 친구 + 학생별 추이 + 교사 관찰(선택).
// 트래킹의 핵심은 '오늘 0을 누른 아이'가 아니라 '저조가 이어지는 아이'다 —
// 아이들은 장난으로도 0을 누르므로 단일 값으로 판단하면 틀린다.
import { useMemo, useState } from "react";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Field";
import { useFeedback } from "@/components/ui/Feedback";
import { revealPanel } from "@/lib/revealPanel";
import {
  LOW_STREAK_DAYS,
  MOOD_FACES,
  MOOD_LABELS,
  dayAverage,
  lowStreak,
  needsAttention,
  recentMoods,
  useMoodHistory,
  useSaveTeacherMood,
} from "@/lib/query/mood";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const fmtDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function MoodPanel() {
  const { toast } = useFeedback();
  const today = todayKST();
  const { data: hist, isLoading, error } = useMoodHistory(true);
  const saveTeacherMood = useSaveTeacherMood();

  const active = useMemo(() => students.filter((s) => !s.inactive), []);
  const ids = useMemo(() => active.map((s) => s.id), [active]);
  const attention = useMemo(() => needsAttention(hist, ids, today), [hist, ids, today]);
  const avg = dayAverage(hist, today);
  const [sel, setSel] = useState<number | null>(null);

  // 교사 관찰 입력 (선택 — 매번 하는 게 아니라 필요할 때만)
  const [obsDate, setObsDate] = useState(today);
  const [obsV, setObsV] = useState<number | null>(null);
  const [obsNote, setObsNote] = useState("");
  const [busy, setBusy] = useState(false);

  // ?? {} 를 그대로 쓰면 매 렌더 새 객체라 아래 useMemo가 항상 다시 돈다
  const todayRow = useMemo(() => hist?.byDate?.[today] ?? {}, [hist, today]);
  const sorted = useMemo(
    () =>
      [...active].sort((a, b) => {
        const va = todayRow[String(a.id)];
        const vb = todayRow[String(b.id)];
        if (va == null && vb == null) return a.id - b.id;
        if (va == null) return 1; // 미입력은 뒤로
        if (vb == null) return -1;
        return va - vb; // 낮은 아이가 앞으로
      }),
    [active, todayRow]
  );

  async function saveObs() {
    if (sel == null || busy) return;
    setBusy(true);
    try {
      await saveTeacherMood(obsDate, sel, obsV, obsNote);
      toast("관찰을 기록했어요.", "success");
      setObsNote("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "기록 실패", "error");
    } finally {
      setBusy(false);
    }
  }

  const trend = sel != null ? recentMoods(hist, sel, 30) : [];
  const selObs = sel != null ? hist?.teacher?.[obsDate]?.[String(sel)] : undefined;

  return (
    <>
      <Card
        title="🙂 오늘의 감정"
        desc="아이들이 모둠 활동을 시작하며 고른 기분이에요. 점수와는 무관해요."
      >
        {error ? (
          <p className="mt-3 rounded-btn bg-rose-50 px-3 py-2.5 text-[13px] font-bold text-rose-700">
            ⚠️ 감정 기록을 읽지 못했어요 — Firebase 콘솔에 최신 firestore.rules를 게시해 주세요.
          </p>
        ) : null}

        {avg != null && (
          <p className="mt-3 text-sm text-ink-700">
            오늘 반 평균 <b className="tnum text-brand-strong">{avg.toFixed(1)}</b> / 5 ·{" "}
            {Object.keys(todayRow).length}명 기록
          </p>
        )}

        {attention.length > 0 && (
          <div className="mt-3 rounded-btn bg-rose-50 p-3 ring-1 ring-rose-200">
            <p className="text-xs font-bold text-rose-800">
              🔴 살펴볼 친구 {attention.length}명 — 오늘 많이 힘들거나, {LOW_STREAK_DAYS}회 이상
              이어서 힘든 아이예요
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {attention.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSel(a.id)}
                  className="press rounded-full bg-white px-3 py-1.5 text-xs font-bold text-rose-800 ring-1 ring-rose-300"
                >
                  {nm(a.id)}
                  {a.today != null && ` ${MOOD_FACES[a.today]}`}
                  {a.streak >= LOW_STREAK_DAYS && (
                    <span className="tnum ml-1 opacity-70">연속 {a.streak}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>
        ) : !Object.keys(todayRow).length ? (
          <EmptyState
            emoji="🙂"
            title="오늘 기록된 기분이 아직 없어요"
            desc="아이들이 모둠 탭에서 기분을 고르면 여기에 모여요."
          />
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sorted.map((s) => {
              const v = todayRow[String(s.id)];
              const streak = lowStreak(hist, s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setSel(s.id)}
                  className={`press flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold ring-1 ${
                    v == null
                      ? "bg-ink-50 text-ink-400 ring-ink-200"
                      : v <= 1
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : v <= 2
                          ? "bg-amber-50 text-amber-700 ring-amber-200"
                          : "bg-white text-ink-700 ring-ink-200"
                  } ${sel === s.id ? "ring-2 ring-brand" : ""}`}
                >
                  <span>{s.name}</span>
                  <span className="text-sm leading-none">{v == null ? "—" : MOOD_FACES[v]}</span>
                  {streak >= LOW_STREAK_DAYS && <span className="tnum text-[10px]">·{streak}</span>}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink-400">
          🔒 아이들은 <b>서로의 기분을 볼 수 없어요</b> — 비교·놀림이 생기면 솔직하게 고르지
          못하니까요. 기분은 점수·할 일 완주에 들어가지 않습니다.
        </p>
      </Card>

      <Card
        title="📈 학생별 돌아보기"
        desc="이름을 고르면 최근 30일 흐름과 선생님 관찰을 함께 볼 수 있어요."
      >
        <select
          value={sel ?? ""}
          onChange={(e) => setSel(e.target.value ? Number(e.target.value) : null)}
          className="mt-3 rounded-btn border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">학생 선택…</option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {sel == null ? (
          <EmptyState emoji="📈" title="학생을 고르면 흐름이 보여요" />
        ) : (
          <>
            {trend.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">아직 기록이 없어요.</p>
            ) : (
              <>
                {/* 막대 그래프 — 날짜별 자기보고. 낮을수록 붉게 */}
                <div className="mt-3 flex items-end gap-1 overflow-x-auto rounded-btn bg-ink-50 p-3">
                  {trend.map((t) => (
                    <span
                      key={t.date}
                      title={`${t.date} · ${MOOD_LABELS[t.v]}`}
                      className="flex shrink-0 flex-col items-center gap-1"
                    >
                      <span
                        className={`w-5 rounded-t ${
                          t.v <= 1 ? "bg-rose-400" : t.v <= 2 ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                        style={{ height: `${8 + t.v * 12}px` }}
                      />
                      <span className="tnum text-[9px] text-ink-400">{fmtDay(t.date)}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-600">
                  최근 {trend.length}회 평균{" "}
                  <b className="tnum">
                    {(trend.reduce((a, b) => a + b.v, 0) / trend.length).toFixed(1)}
                  </b>
                  {lowStreak(hist, sel) >= LOW_STREAK_DAYS && (
                    <span className="ml-2 font-bold text-rose-700">
                      · 🔴 {lowStreak(hist, sel)}회 연속 힘들어하고 있어요
                    </span>
                  )}
                </p>
              </>
            )}

            {/* 교사 관찰 — 선택. 매번 적을 필요 없고, 눈에 밟히는 날만 남긴다 */}
            <div className="mt-4 rounded-btn bg-ink-50 p-3">
              <p className="text-[13px] font-bold text-ink-700">
                👩‍🏫 선생님 관찰 <span className="font-normal text-ink-400">— 필요할 때만 남기세요</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={obsDate}
                  max={today}
                  onChange={(e) => setObsDate(e.target.value)}
                  className="rounded-btn border border-ink-300 px-2 py-1.5 text-sm"
                />
                <div className="flex gap-1">
                  {MOOD_FACES.map((f, v) => (
                    <button
                      key={v}
                      onClick={() => setObsV(obsV === v ? null : v)}
                      className={`press rounded-btn px-2 py-1 text-lg leading-none ring-1 ${
                        obsV === v ? "bg-brand-weak ring-brand" : "bg-white ring-ink-200"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {selObs?.v != null && (
                <p className="mt-1.5 text-xs text-ink-500">
                  이 날 기록해 둔 관찰: {MOOD_FACES[selObs.v]} {MOOD_LABELS[selObs.v]}
                  {selObs.note ? ` — ${selObs.note}` : ""}
                </p>
              )}
              <div className="mt-2">
                <Textarea
                  value={obsNote}
                  onChange={(e) => setObsNote(e.target.value)}
                  rows={3}
                  placeholder="무엇이 눈에 밟혔나요? (예: 쉬는 시간에 혼자 있음. 아이는 괜찮다고 함)"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => void saveObs()}
                  disabled={busy || (obsV == null && !obsNote.trim())}
                  className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {busy ? "기록 중…" : "관찰 기록"}
                </button>
                <button
                  onClick={() => revealPanel("panel-log")}
                  className="press rounded-btn bg-white px-4 py-2 text-sm font-bold text-ink-600 ring-1 ring-ink-200"
                >
                  📔 일지에 자세히 쓰기
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
