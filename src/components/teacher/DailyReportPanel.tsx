"use client";
// 데일리 리포트 — 오늘의 독서 현황 + 점수를 한눈에, 인쇄/PDF로 뽑기.
// 읽기 예산: 이미 캐시된 문서만 사용(readingStats·dailyScores·settings). 인쇄 시에만 그날 문서 추가 조회.
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import { s1TotalBooks } from "@/lib/staticData";
import { useReadingStats } from "@/lib/query/reading";
import { useDailyScores, useRangeReport } from "@/lib/query/evaluation";
import { useSettings } from "@/lib/query/settings";
import { weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS, scheduleOfWeek } from "@/lib/schedule";
import { openPrintWindow, openRangePrintDoc, esc } from "@/lib/exportDoc";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SubTabs from "@/components/ui/SubTabs";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function DailyReportPanel({ date }: { date: string }) {
  const { data: stats } = useReadingStats();
  const { data: today } = useDailyScores(date);
  const { data: settings } = useSettings();
  const { toast } = useFeedback();
  const [printing, setPrinting] = useState(false);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [view, setView] = useState<"all" | "groups">("all");

  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const quota = settings?.weeklyReadingQuota ?? 3;

  // 주간 범위 (해당 주 월~일)
  const weekStart = schedule.weekStart;
  const weekEnd = (() => {
    const e = new Date(weekStart + "T00:00:00Z");
    e.setUTCDate(e.getUTCDate() + 6);
    return e.toISOString().slice(0, 10);
  })();
  const { data: weekRep } = useRangeReport(weekStart, weekEnd, period === "week");

  const weekMap = stats?.byWeek?.[String(week)] ?? {};
  const weekRead = (sid: number) => weekMap[String(sid)] ?? 0;
  const classTotal = s1TotalBooks + Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const weekBooks = students.reduce((a, s) => a + weekRead(s.id), 0);
  const notMet = students.filter((s) => weekRead(s.id) < quota);
  const metCount = students.length - notMet.length;

  const scoreRows = students
    .map((s) => ({ name: s.name, row: today?.[s.id] }))
    .filter((r) => r.row)
    .sort((a, b) => b.row!.total - a.row!.total);

  // 집계 문서의 _meta — 집계 후에만 존재
  const meta = (today?._meta ?? null) as {
    mvpWinners?: number[];
    ranks?: Record<string, number>;
    missionGroups?: number[];
    compliments?: { from: number; to: number; text: string }[];
    peerSuggestions?: { from: number; to: number; text: string }[];
    toTeacher?: { from: number; text: string }[];
  } | null;
  const missionSet = new Set(meta?.missionGroups ?? []);
  const nm = (id: number) => studentById.get(id)?.name ?? `?${id}`;
  const mvpNames = (meta?.mvpWinners ?? []).map(nm);
  const rankPairs = Object.entries(meta?.ranks ?? {}).sort((a, b) => a[1] - b[1]);
  const compliments = meta?.compliments ?? [];
  const peerSug = meta?.peerSuggestions ?? [];
  const wishes = meta?.toTeacher ?? [];
  // 커버리지 백스톱: 오늘 칭찬을 하나도 못 받은 친구 — 아침 조회 때 한마디 보정용
  const praisedIds = new Set(compliments.map((c) => c.to));
  const notPraised = students.filter((s) => !praisedIds.has(s.id));

  function print() {
    if (printing) return;
    setPrinting(true);
    try {
      const totalOf = (id: number) =>
        (today?.[id] as { total?: number } | undefined)?.total ?? 0;
      const card = (t: string, inner: string) =>
        `<div class="card"><div class="t">${t}</div>${inner}</div>`;

      // 독서 현황
      const readingCard = card(
        `📖 거북이 독서 현황 (${week}주차)`,
        `<div class="stats">
          <div><div class="l">학급 누적</div><div class="v green">${classTotal}</div></div>
          <div><div class="l">이번 주</div><div class="v">${weekBooks}권</div></div>
          <div><div class="l">목표 달성</div><div class="v blue">${metCount}/${students.length}</div></div>
        </div>${
          notMet.length
            ? `<p class="muted">미달(${notMet.length}): ${notMet.map((s) => esc(s.name)).join(", ")}</p>`
            : `<p class="muted">전원 목표 달성! 🎉</p>`
        }`
      );

      const sections = [readingCard];

      if (meta) {
        // MVP + 순위
        sections.push(
          `<div class="grid2">${card(
            "⭐ 오늘의 MVP",
            `<p>${mvpNames.length ? mvpNames.map(esc).join(", ") : '<span class="muted">없음</span>'}</p>`
          )}${card(
            "🥇 오늘의 모둠 순위",
            rankPairs.length
              ? `<p>${rankPairs.map(([g, r]) => `${r === 1 ? "👑 " : ""}${r}위 ${g}모둠`).join(" · ")}</p>`
              : `<p class="warn">⚠️ 순위 미선정</p>`
          )}</div>`
        );

        // 오늘 점수 (전원)
        const ranked = [...students].sort((a, b) => totalOf(b.id) - totalOf(a.id));
        sections.push(
          card(
            "🏅 오늘 점수",
            `<table><thead><tr><th>순위</th><th>이름</th><th>점수</th></tr></thead><tbody>${ranked
              .map(
                (s, i) =>
                  `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${totalOf(s.id)}점</td></tr>`
              )
              .join("")}</tbody></table>`
          )
        );

        // 모둠별
        const mvpSet = new Set(meta.mvpWinners ?? []);
        const groupsHtml = schedule.groups
          .map((g) => {
            const ids = [g.chair, ...g.members.map((m) => m.studentId)];
            const set = new Set(ids);
            const gRank = meta.ranks?.[String(g.groupId)];
            const gComps = compliments.filter((c) => set.has(c.to));
            const gSugs = peerSug.filter((c) => set.has(c.to));
            const memHtml = ids
              .map(
                (id) => `${mvpSet.has(id) ? "⭐" : ""}${esc(nm(id))} <b>${totalOf(id)}</b>`
              )
              .join(" · ");
            const lines =
              [
                ...gComps.map(
                  (c) => `<li>💌 <b>${esc(nm(c.from))}</b> → <b>${esc(nm(c.to))}</b>: ${esc(c.text)}</li>`
                ),
                ...gSugs.map(
                  (c) => `<li>🙋 <b>${esc(nm(c.from))}</b> → <b>${esc(nm(c.to))}</b>: ${esc(c.text)}</li>`
                ),
              ].join("") || `<li class="muted">오늘 기록이 없어요.</li>`;
            const missionBadge = missionSet.has(g.groupId) ? `<span class="badge">🎯 미션 +1</span>` : "";
            return `<div class="grp"><div class="h"><span class="gname">${gRank === 1 ? "👑 " : ""}${g.groupId}모둠${gRank ? `<span class="badge">${gRank}위</span>` : ""}${missionBadge}</span><span class="mem">${memHtml}</span></div><ul>${lines}</ul></div>`;
          })
          .join("");
        sections.push(card("👥 모둠별 오늘 기록", groupsHtml));

        // 바라는 점
        sections.push(
          card(
            `📨 선생님에게 바라는 점 (${wishes.length})`,
            wishes.length
              ? `<ul>${wishes.map((t) => `<li><b>${esc(nm(t.from))}</b>: ${esc(t.text)}</li>`).join("")}</ul>`
              : `<p class="muted">없음</p>`
          )
        );
        if (notPraised.length) {
          sections.push(
            `<p class="muted warn">📌 오늘 칭찬 못 받은 친구: ${notPraised.map((s) => esc(s.name)).join(", ")}</p>`
          );
        }
      } else {
        sections.push('<p class="muted">아직 집계 전이에요. 집계 후 인쇄하면 점수·모둠별 기록이 담겨요.</p>');
      }

      openPrintWindow(
        `${date} 데일리 리포트`,
        `<h1>🗒️ ${date} 데일리 리포트</h1><div class="sub">${week}주차 · 2학기 학급 자치</div>${sections.join("")}`
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄에 실패했어요.", "error");
    } finally {
      setPrinting(false);
    }
  }

  async function weeklyPrint() {
    if (printing) return;
    setPrinting(true);
    try {
      const readingHtml = `<div class="t">📖 이번 주 독서 (${week}주차)</div><p>반 제출 <b>${weekBooks}권</b> · 목표 달성 ${metCount}/${students.length}명</p>${
        notMet.length ? `<p class="muted">미달: ${notMet.map((s) => esc(s.name)).join(", ")}</p>` : ""
      }`;
      await openRangePrintDoc(weekStart, weekEnd, `${week}주차 주간`, readingHtml);
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄에 실패했어요.", "error");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Card title="🗒️ 리포트" desc={`${date} · ${week}주차`}>
      <div className="mt-3">
        <SubTabs<"day" | "week">
          tabs={[
            { key: "day", label: "📅 일간" },
            { key: "week", label: "📆 주간" },
          ]}
          active={period}
          onChange={setPeriod}
        />
      </div>

      {period === "day" && (
        <div className="mt-2">
          <SubTabs<"all" | "groups">
            tabs={[
              { key: "all", label: "📊 전체" },
              { key: "groups", label: "👥 모둠별" },
            ]}
            active={view}
            onChange={setView}
          />
        </div>
      )}

      {/* 👥 모둠별 — 1~5모둠 각자의 오늘 팀 기록 */}
      {period === "day" && view === "groups" &&
        (meta ? (
          <div className="mt-2 space-y-2">
            {schedule.groups.map((g) => {
              const memberIds = [g.chair, ...g.members.map((m) => m.studentId)];
              const memberSet = new Set(memberIds);
              const gRank = meta.ranks?.[String(g.groupId)];
              const gComps = compliments.filter((c) => memberSet.has(c.to));
              const gSugs = peerSug.filter((c) => memberSet.has(c.to));
              const mvpSet = new Set(meta.mvpWinners ?? []);
              return (
                <div key={g.groupId} className="rounded-btn bg-ink-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-sm font-bold text-ink-800">
                      {gRank === 1 && "👑 "}
                      {g.groupId}모둠
                      {gRank ? (
                        <span className="ml-1.5 rounded-full bg-warn-weak px-2 py-0.5 text-[10px] font-bold text-warn">
                          {gRank}위
                        </span>
                      ) : null}
                      {missionSet.has(g.groupId) && (
                        <span className="ml-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-600">
                          🎯 미션 +1
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-500">
                      {memberIds.map((id) => (
                        <span key={id} className="mr-1.5">
                          {mvpSet.has(id) && "⭐"}
                          {nm(id)}
                          <b className="tnum ml-0.5 text-ink-700">
                            {(today?.[id] as { total?: number } | undefined)?.total ?? 0}
                          </b>
                        </span>
                      ))}
                    </p>
                  </div>
                  {gComps.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-ink-700">
                      {gComps.map((c, i) => (
                        <li key={i}>
                          💌 <b>{nm(c.from)}</b> → <b>{nm(c.to)}</b>: {c.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {gSugs.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-600">
                      {gSugs.map((c, i) => (
                        <li key={i}>
                          🙋 <b>{nm(c.from)}</b> → <b>{nm(c.to)}</b>: {c.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {gComps.length === 0 && gSugs.length === 0 && (
                    <p className="mt-1.5 text-xs text-ink-400">오늘 기록이 없어요.</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-400">집계 후 모둠별 기록이 표시돼요.</p>
        ))}

      {period === "day" && view === "all" && (<>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {/* 독서 현황 */}
        <div className="rounded-btn bg-ink-50 p-3">
          <p className="text-sm font-bold text-ink-800">📖 거북이 독서 ({week}주차)</p>
          <div className="mt-2 flex gap-2 text-center">
            <div className="flex-1">
              <p className="text-[11px] text-ink-400">학급 누적</p>
              <p className="tnum text-lg font-extrabold text-success">{classTotal}</p>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-ink-400">이번 주</p>
              <p className="tnum text-lg font-extrabold text-ink-900">{weekBooks}권</p>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-ink-400">목표 달성</p>
              <p className="tnum text-lg font-extrabold text-brand-strong">
                {metCount}/{students.length}
              </p>
            </div>
          </div>
          {notMet.length > 0 && (
            <p className="mt-2 text-xs text-ink-500">
              미달({notMet.length}): {notMet.map((s) => s.name).join(", ")}
            </p>
          )}
        </div>

        {/* 오늘 점수 */}
        <div className="rounded-btn bg-ink-50 p-3">
          <p className="text-sm font-bold text-ink-800">🏅 오늘 점수 (상위)</p>
          {scoreRows.length === 0 ? (
            <p className="mt-2 text-xs text-ink-400">
              아직 집계 전이에요. 위쪽 일일 평가 집계를 실행하면 반영돼요.
            </p>
          ) : (
            <ol className="mt-2 space-y-0.5 text-sm">
              {scoreRows.slice(0, 5).map((r, i) => (
                <li key={r.name} className="flex justify-between">
                  <span>
                    {MEDAL[i] ?? `${i + 1}.`} {r.name}
                  </span>
                  <b className="tnum">{r.row!.total}점</b>
                </li>
              ))}
              {scoreRows.length > 5 && (
                <li className="text-xs text-ink-400">…외 {scoreRows.length - 5}명</li>
              )}
            </ol>
          )}
        </div>
      </div>
      {/* 집계 후 — MVP·모둠순위·칭찬·건의·바라는 점 */}
      {meta ? (
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-btn bg-ink-50 p-3">
              <p className="text-sm font-bold text-ink-800">⭐ 오늘의 MVP</p>
              <p className="mt-1 text-sm text-ink-700">
                {mvpNames.length ? mvpNames.join(", ") : <span className="text-ink-400">없음</span>}
              </p>
            </div>
            <div className="rounded-btn bg-ink-50 p-3">
              <p className="text-sm font-bold text-ink-800">🥇 오늘의 모둠 순위</p>
              <p className="mt-1 text-sm text-ink-700">
                {rankPairs.length ? (
                  rankPairs
                    .map(([g, r]) => `${r === 1 ? "👑 " : ""}${r}위 ${g}모둠`)
                    .join(" · ")
                ) : (
                  <span className="font-bold text-warn">
                    ⚠️ 순위 미선정 — 순위 점수 0점. 선정 후 재집계하세요
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* 칭찬·건의 요약 — 상세는 모둠별 탭에서 */}
          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-sm font-bold text-ink-800">
              💌 칭찬 {compliments.length}건 · 🙋 건의 {peerSug.length}건
              <button
                onClick={() => setView("groups")}
                className="ml-2 text-xs font-medium text-brand underline underline-offset-2"
              >
                모둠별로 보기 →
              </button>
            </p>
            {compliments.length > 0 && notPraised.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-warn">
                💌 오늘 칭찬 못 받은 친구({notPraised.length}):{" "}
                {notPraised.map((s) => s.name).join(", ")}
              </p>
            )}
          </div>

          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-sm font-bold text-ink-800">📨 선생님에게 바라는 점 ({wishes.length})</p>
            {wishes.length ? (
              <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                {wishes.map((t, i) => (
                  <li key={i}>
                    <b>{nm(t.from)}</b>: {t.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-400">아직 없어요.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-400">
          집계 후 MVP·모둠 순위·칭찬·건의·바라는 점이 여기에 표시돼요.
        </p>
      )}
      </>)}

      {/* 일간 인쇄 */}
      {period === "day" && (
        <>
          <Button onClick={() => print()} disabled={printing} className="mt-3">
            🖨️ 일간 리포트 인쇄 / PDF 저장
          </Button>
          <p className="mt-1.5 text-xs text-ink-400">
            인쇄본도 화면처럼 독서·점수·MVP·순위·모둠별 칭찬/건의·바라는 점 카드로 담겨요.
          </p>
        </>
      )}

      {/* 📆 주간 — 전체 요약만 */}
      {period === "week" && (
        <div className="mt-2 space-y-2">
          <div className="rounded-btn bg-ink-50 p-3">
            <p className="text-sm font-bold text-ink-800">📖 이번 주 독서 ({week}주차)</p>
            <p className="mt-1 text-sm text-ink-700">
              반 제출 <b>{weekBooks}권</b> · 목표 달성{" "}
              <b>
                {metCount}/{students.length}명
              </b>
            </p>
            {notMet.length > 0 && (
              <p className="mt-1 text-xs text-ink-500">미달: {notMet.map((s) => s.name).join(", ")}</p>
            )}
          </div>

          {!weekRep ? (
            <p className="rounded-btn bg-ink-50 p-3 text-xs text-ink-400">불러오는 중…</p>
          ) : weekRep.days === 0 ? (
            <p className="rounded-btn bg-ink-50 p-3 text-xs text-ink-400">
              이번 주 집계된 날이 아직 없어요. (매일 집계하면 여기에 주간 합산이 쌓여요)
            </p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-btn bg-ink-50 p-2">
                  <p className="text-[11px] text-ink-400">집계 일수</p>
                  <p className="tnum text-lg font-extrabold text-ink-900">{weekRep.days}일</p>
                </div>
                <div className="rounded-btn bg-ink-50 p-2">
                  <p className="text-[11px] text-ink-400">💌 칭찬</p>
                  <p className="tnum text-lg font-extrabold text-pink-600">{weekRep.compliments}</p>
                </div>
                <div className="rounded-btn bg-ink-50 p-2">
                  <p className="text-[11px] text-ink-400">🙋 건의</p>
                  <p className="tnum text-lg font-extrabold text-brand-strong">
                    {weekRep.suggestions}
                  </p>
                </div>
                <div className="rounded-btn bg-ink-50 p-2">
                  <p className="text-[11px] text-ink-400">🎯 미션</p>
                  <p className="tnum text-lg font-extrabold text-warn">
                    {weekRep.missionAchievements}회
                  </p>
                </div>
              </div>
              <div className="rounded-btn bg-ink-50 p-3">
                <p className="text-sm font-bold text-ink-800">🏅 주간 점수 (합산 상위)</p>
                <ol className="mt-1 space-y-0.5 text-sm">
                  {[...students]
                    .map((s) => ({ name: s.name, total: weekRep.totals[String(s.id)] ?? 0 }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 5)
                    .map((r, i) => (
                      <li key={r.name} className="flex justify-between">
                        <span>
                          {MEDAL[i] ?? `${i + 1}.`} {r.name}
                        </span>
                        <b className="tnum">{r.total}점</b>
                      </li>
                    ))}
                </ol>
              </div>
            </>
          )}

          <Button onClick={() => void weeklyPrint()} disabled={printing} className="mt-1">
            🖨️ 주간 리포트 인쇄 / PDF 저장
          </Button>
          <p className="mt-1.5 text-xs text-ink-400">
            주간 리포트는 전체 요약(독서·점수·칭찬·건의·바라는 점)만 담겨요.
          </p>
        </div>
      )}
    </Card>
  );
}
