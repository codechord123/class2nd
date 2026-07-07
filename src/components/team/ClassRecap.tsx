"use client";
// 🎉 오늘의 우리 반 — 학부모 리포트와 같은 뱃지 카드를 학생도 다같이 읽는 화면 (사용자 요청).
// 하위 토글: 모둠 파트(하이라이트+모둠별 뱃지) / 칭찬 파트(오늘 주고받은 칭찬). 읽기 전용.
// 오늘 집계가 있으면 오늘, 없으면 최근 집계일 — Team 탭이 이미 캐시하는 문서 2개 재사용 (추가 읽기 0).
import { useState } from "react";
import { studentById } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { shiftDate, todayKST, weekOfDate } from "@/lib/date";
import { useDailyScores, useLatestAggregated, type DailyMeta } from "@/lib/query/evaluation";
import { groupDayScore } from "@/lib/groupScore";
import SubTabs from "@/components/ui/SubTabs";
import type { DailyScoreRow } from "@/types";

const nm = (id: number) => studentById.get(id)?.name ?? "?";

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    mvp: "bg-brand-weak text-brand-strong",
    best: "bg-warn-weak text-warn",
    boss: "bg-violet-100 text-violet-700",
    read: "bg-success-weak text-success",
    praise: "bg-pink-100 text-pink-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls[tone]}`}>{children}</span>
  );
}

export default function ClassRecap({ myStudentId }: { myStudentId?: number | null }) {
  const [view, setView] = useState<"group" | "praise">("group");
  const today = todayKST();
  const { data: todayScores } = useDailyScores(today);
  const { data: latestAgg } = useLatestAggregated(shiftDate(today, -1), true);

  const todayMeta = (todayScores as { _meta?: DailyMeta } | null | undefined)?._meta;
  const useToday = !!todayMeta;
  const rows = (useToday ? (todayScores as Record<string, unknown>) : latestAgg?.rows) ?? null;
  const meta = useToday ? todayMeta! : latestAgg?.meta;
  const date = useToday ? today : latestAgg?.date;
  if (!rows || !date || !meta) {
    return (
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">🎉 오늘의 우리 반</h3>
        <p className="mt-2 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
          선생님이 오늘 점수를 집계하면, 우리 반 기록이 여기에 모여요!
        </p>
      </section>
    );
  }

  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const rowOf = (id: number) => rows[String(id)] as DailyScoreRow | undefined;
  const bestGroups = meta.autoBestGroups ?? [];
  const classTop = meta.classTop ?? [];
  const missionSet = new Set(meta.missionGroups ?? []);
  const praisedSet = new Set((meta.compliments ?? []).map((c) => c.to));
  const bossReasons = meta.bossReasons ?? [];
  const isToday = date === today;
  const fmt = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

  const badgesOf = (id: number) => {
    const r = rowOf(id);
    if (!r) return [];
    const bs: React.ReactNode[] = [];
    if (classTop.includes(id)) bs.push(<Badge key="mvp" tone="mvp">⭐ 오늘의 MVP</Badge>);
    else if ((r.mvp ?? 0) > 0) bs.push(<Badge key="mvp" tone="mvp">⭐ MVP</Badge>);
    if ((r.best ?? 0) > 0) bs.push(<Badge key="best" tone="best">👑 오늘의 모둠</Badge>);
    if ((r.boss ?? 0) > 0) bs.push(<Badge key="boss" tone="boss">🙌 오늘의 부서장</Badge>);
    if ((r.read ?? 0) > 0) bs.push(<Badge key="read" tone="read">🐢 독서 {r.read}권</Badge>);
    if (praisedSet.has(id)) bs.push(<Badge key="praise" tone="praise">💌 칭찬 받음</Badge>);
    return bs;
  };

  const comps = meta.compliments ?? [];

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">🎉 오늘의 우리 반</h3>
        <span className="text-xs text-ink-400">{isToday ? "오늘" : `${fmt} 기준`}</span>
      </div>

      {/* 모둠 파트 / 칭찬 파트 나누기 (사용자 요청) */}
      <div className="mt-3">
        <SubTabs
          tabs={[
            { key: "group" as const, label: "👑 모둠" },
            { key: "praise" as const, label: `💌 칭찬${comps.length ? ` ${comps.length}` : ""}` },
          ]}
          active={view}
          onChange={setView}
        />
      </div>

      {view === "praise" ? (
        comps.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {comps.map((c, i) => (
              <li key={i} className="rounded-btn bg-pink-50 px-3 py-2 text-[13px] text-ink-800">
                <b className="text-pink-700">{nm(c.from)}</b> → <b>{nm(c.to)}</b> · {c.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
            아직 오늘 주고받은 칭찬이 없어요 — 첫 칭찬의 주인공이 되어보세요!
          </p>
        )
      ) : (
        <>
      {/* 하이라이트 — 오늘의 모둠 · MVP */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2.5 rounded-btn bg-warn-weak px-3 py-2.5">
          <span className="text-xl">👑</span>
          <div>
            <p className="text-[11px] font-bold text-ink-500">오늘의 모둠</p>
            <p className="text-sm font-extrabold text-warn">
              {bestGroups.length ? bestGroups.map((g) => `${g}모둠`).join(", ") : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-btn bg-brand-weak px-3 py-2.5">
          <span className="text-xl">⭐</span>
          <div>
            <p className="text-[11px] font-bold text-ink-500">오늘의 MVP</p>
            <p className="text-sm font-extrabold text-brand-strong">
              {classTop.length ? classTop.map(nm).join(", ") : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* 모둠별 뱃지 카드 */}
      <div className="mt-3 space-y-2">
        {schedule.groups.map((g) => {
          const ids = [g.chair, ...g.members.map((m) => m.studentId)].filter(
            (id) => !studentById.get(id)?.inactive
          );
          const isBest = bestGroups.includes(g.groupId);
          const gScore = groupDayScore(rows, ids).total;
          const mine = myStudentId != null && ids.includes(myStudentId);
          return (
            <div
              key={g.groupId}
              className={`overflow-hidden rounded-btn border ${
                isBest ? "border-warn/50 bg-warn-weak/20" : "border-ink-200"
              }`}
            >
              <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50/60 px-3 py-1.5">
                <span className="text-sm font-bold">
                  {isBest && "👑 "}
                  {g.groupId}모둠{mine && " ★"}
                </span>
                {missionSet.has(g.groupId) && (
                  <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold text-pink-600">
                    🎯 칭찬 미션
                  </span>
                )}
                <span className="ml-auto text-[11px] text-ink-500">
                  모둠 점수 <b className="text-ink-900">{gScore}</b>점
                </span>
              </div>
              <div className="divide-y divide-ink-50">
                {ids.map((id) => {
                  const bs = badgesOf(id);
                  const reason = bossReasons.find((r) => r.to === id);
                  return (
                    <div key={id}>
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <span className={`text-[13px] font-bold ${id === myStudentId ? "text-brand" : "text-ink-800"}`}>
                          {nm(id)}
                        </span>
                        {bs.length > 0 ? (
                          <span className="ml-auto flex flex-wrap justify-end gap-1">{bs}</span>
                        ) : (
                          <span className="ml-auto text-[11px] text-ink-300">오늘도 함께했어요</span>
                        )}
                      </div>
                      {(rowOf(id)?.boss ?? 0) > 0 && reason && (
                        <p className="px-3 pb-1.5 text-[11px] text-ink-500">
                          🙌 <b className="text-violet-600">{nm(id)}</b> — “{reason.text}”
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

        </>
      )}
    </section>
  );
}
