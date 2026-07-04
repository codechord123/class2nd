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
import { periodOfWeek, dateRangeOfPeriod } from "@/lib/aggregate";
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

  // 세션(2주) 범위 — 선택한 날짜가 속한 기(1~11기)
  // 베타 기간(개학 전)은 모든 날짜가 1주차로 잡히므로, 범위를 7/1부터로 넓혀 베타 기록도 포함
  const sessionNo = periodOfWeek(week);
  const [s0, sessionEnd] = dateRangeOfPeriod(sessionNo);
  const isBeta = date < s0;
  const sessionStart = isBeta ? "2026-07-01" : s0;
  const w1 = sessionNo * 2 - 1;
  const w2 = Math.min(sessionNo * 2, TOTAL_WEEKS);
  const { data: rep } = useRangeReport(sessionStart, sessionEnd, period === "week");

  // 세션 독서 합산 (readingStats 캐시 — 추가 읽기 0): 두 주 byWeek 합
  const sessionReadOf = (sid: number) =>
    (stats?.byWeek?.[String(w1)]?.[String(sid)] ?? 0) +
    (w2 !== w1 ? (stats?.byWeek?.[String(w2)]?.[String(sid)] ?? 0) : 0);

  // 최다 집계(동점 모두) — [명단, 최댓값]
  function topOf(counts: Record<string, number>): [number[], number] {
    const max = Math.max(0, ...Object.values(counts));
    if (max <= 0) return [[], 0];
    return [
      Object.entries(counts)
        .filter(([, v]) => v === max)
        .map(([k]) => Number(k)),
      max,
    ];
  }

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

  async function sessionPrint() {
    if (printing) return;
    setPrinting(true);
    try {
      // 세션 하이라이트(독서 MVP·최다 모둠 등)를 인쇄 상단에 함께 담는다
      const readCounts: Record<string, number> = {};
      for (const s of students) readCounts[String(s.id)] = sessionReadOf(s.id);
      const top = (counts: Record<string, number>) => {
        const max = Math.max(0, ...Object.values(counts));
        if (max <= 0) return null;
        const ids = Object.entries(counts)
          .filter(([, v]) => v === max)
          .map(([k]) => Number(k));
        return { ids, max };
      };
      const readTop = top(readCounts);
      const bestTop = rep ? top(rep.rank1ByGroup) : null;
      const mvpTop = rep ? top(rep.mvpCount) : null;
      const names = (ids: number[]) => ids.map((id) => esc(nm(id))).join(", ");
      const hi = (label: string, v: string) => `<li><b>${label}</b>: ${v}</li>`;
      const highlightHtml = `<div class="t">🏆 ${sessionNo}기 세션 하이라이트 (${w1}·${w2}주)</div><ul>${[
        readTop ? hi("🐢 독서 MVP", `${names(readTop.ids)} (${readTop.max}권)`) : "",
        bestTop ? hi("👑 오늘의 모둠 최다", `${bestTop.ids.map((g) => `${g}모둠`).join(", ")} (1위 ${bestTop.max}회)`) : "",
        mvpTop ? hi("⭐ MVP 최다", `${names(mvpTop.ids)} (${mvpTop.max}회)`) : "",
        rep ? hi("🎯 미션 달성", `${rep.missionAchievements}회`) : "",
      ]
        .filter(Boolean)
        .join("")}</ul>`;
      await openRangePrintDoc(sessionStart, sessionEnd, `${sessionNo}기 세션`, highlightHtml);
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
            { key: "week", label: "🏆 세션(2주)" },
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

      {/* 🏆 세션(2주) — 모둠별 없이 전체 하이라이트만 */}
      {period === "week" && (
        <div className="mt-2 space-y-2">
          {!rep ? (
            <p className="rounded-btn bg-ink-50 p-3 text-xs text-ink-400">불러오는 중…</p>
          ) : (
            (() => {
              // ── 세션 지표 알고리즘 ──
              // 독서 MVP: 세션 두 주(byWeek w1+w2) 권수 최다 (동점 모두)
              const readCounts: Record<string, number> = {};
              for (const s of students) readCounts[String(s.id)] = sessionReadOf(s.id);
              const [readTop, readMax] = topOf(readCounts);
              // 오늘의 모둠 최다: 기간 중 1위 횟수 최다 모둠
              const [bestGroups, bestMax] = topOf(rep.rank1ByGroup);
              // MVP 최다 / 칭찬왕(보낸) / 인기왕(받은) / 미션 최다 모둠
              const [mvpTop, mvpMax] = topOf(rep.mvpCount);
              const [giveTop, giveMax] = topOf(rep.givenCount);
              const [recvTop, recvMax] = topOf(rep.receivedCount);
              const [missionTop, missionMax] = topOf(rep.missionByGroup);
              const names = (ids: number[]) => ids.map(nm).join(", ");
              const Hi = ({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) => (
                <div className="rounded-btn bg-ink-50 p-3">
                  <p className="text-[11px] text-ink-400">{icon} {label}</p>
                  <p className="mt-0.5 text-sm font-extrabold text-ink-900">{value}</p>
                  {sub && <p className="text-[11px] text-ink-400">{sub}</p>}
                </div>
              );
              return (
                <>
                  <p className="text-xs text-ink-400">
                    {sessionNo}기 세션 ({sessionStart} ~ {sessionEnd}
                    {isBeta && " · 🧪 베타 기록 포함"}) — 집계 {rep.days}일
                  </p>
                  {rep.days === 0 && (
                    <p className="rounded-btn bg-ink-50 p-3 text-xs text-ink-400">
                      이 세션에 집계된 날이 아직 없어요. 매일 집계하면 여기에 쌓여요.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Hi icon="🐢" label="독서 MVP" value={readMax > 0 ? names(readTop) : "아직 없음"} sub={readMax > 0 ? `${readMax}권` : undefined} />
                    <Hi icon="👑" label="오늘의 모둠 최다" value={bestMax > 0 ? bestGroups.map((g) => `${g}모둠`).join(", ") : "아직 없음"} sub={bestMax > 0 ? `1위 ${bestMax}회` : undefined} />
                    <Hi icon="⭐" label="MVP 최다" value={mvpMax > 0 ? names(mvpTop) : "아직 없음"} sub={mvpMax > 0 ? `${mvpMax}회` : undefined} />
                    <Hi icon="🎯" label="미션 최다 모둠" value={missionMax > 0 ? missionTop.map((g) => `${g}모둠`).join(", ") : "아직 없음"} sub={missionMax > 0 ? `${missionMax}일 달성` : undefined} />
                    <Hi icon="💌" label="칭찬왕 (보내기)" value={giveMax > 0 ? names(giveTop) : "아직 없음"} sub={giveMax > 0 ? `${giveMax}회` : undefined} />
                    <Hi icon="💖" label="칭찬 많이 받은 친구" value={recvMax > 0 ? names(recvTop) : "아직 없음"} sub={recvMax > 0 ? `${recvMax}회` : undefined} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-btn bg-ink-50 p-2">
                      <p className="text-[11px] text-ink-400">💌 칭찬</p>
                      <p className="tnum text-lg font-extrabold text-pink-600">{rep.compliments}</p>
                    </div>
                    <div className="rounded-btn bg-ink-50 p-2">
                      <p className="text-[11px] text-ink-400">🗣 칭찬 참여</p>
                      <p className="tnum text-lg font-extrabold text-ink-900">
                        {Object.keys(rep.givenCount).length}
                        <span className="text-xs font-normal text-ink-400">/{students.length}</span>
                      </p>
                    </div>
                    <div className="rounded-btn bg-ink-50 p-2">
                      <p className="text-[11px] text-ink-400">🙋 건의</p>
                      <p className="tnum text-lg font-extrabold text-brand-strong">{rep.suggestions}</p>
                    </div>
                    <div className="rounded-btn bg-ink-50 p-2">
                      <p className="text-[11px] text-ink-400">🎯 미션 달성</p>
                      <p className="tnum text-lg font-extrabold text-warn">{rep.missionAchievements}회</p>
                    </div>
                  </div>

                  {/* 📖 독서 목표 달성률 — 주별 달성 인원 + 세션 학급 권수 */}
                  {(() => {
                    const metOf = (w: number) =>
                      students.filter(
                        (s) => (stats?.byWeek?.[String(w)]?.[String(s.id)] ?? 0) >= quota
                      ).length;
                    const sessionBooks = students.reduce((a, s) => a + sessionReadOf(s.id), 0);
                    return (
                      <div className="rounded-btn bg-ink-50 p-3">
                        <p className="text-sm font-bold text-ink-800">📖 독서 목표 달성률</p>
                        <p className="mt-1 text-sm text-ink-700">
                          {w1}주차 <b>{metOf(w1)}/{students.length}명</b>
                          {w2 !== w1 && (
                            <>
                              {" "}
                              · {w2}주차 <b>{metOf(w2)}/{students.length}명</b>
                            </>
                          )}{" "}
                          · 세션 학급 <b>+{sessionBooks}권</b>
                        </p>
                      </div>
                    );
                  })()}

                  {/* 💗 관심이 필요한 친구 — 세션 동안 칭찬 0회 (MVP도 0이면 ★) */}
                  {rep.days > 0 &&
                    (() => {
                      const noLove = students.filter((s) => !(rep.receivedCount[String(s.id)] > 0));
                      if (!noLove.length)
                        return (
                          <p className="rounded-btn bg-success-weak p-3 text-xs font-bold text-success">
                            💖 세션 동안 전원이 칭찬을 받았어요!
                          </p>
                        );
                      return (
                        <div className="rounded-btn bg-warn-weak p-3">
                          <p className="text-sm font-bold text-warn">
                            💗 관심이 필요한 친구 ({noLove.length})
                          </p>
                          <p className="mt-1 text-xs text-ink-700">
                            {noLove
                              .map(
                                (s) =>
                                  `${s.name}${!(rep.mvpCount[String(s.id)] > 0) ? "★" : ""}`
                              )
                              .join(", ")}
                          </p>
                          <p className="mt-1 text-[11px] text-ink-500">
                            세션 동안 칭찬을 못 받은 친구예요. ★는 MVP도 없던 친구 — 조회 때
                            선생님이 한마디 해주세요.
                          </p>
                        </div>
                      );
                    })()}

                  {/* 👥 모둠 균형 — 모둠별 평균 점수 (개별 기록 아님) */}
                  {rep.days > 0 &&
                    (() => {
                      const rows = schedule.groups
                        .map((g) => {
                          const ids = [g.chair, ...g.members.map((m) => m.studentId)];
                          const sum = ids.reduce(
                            (a, id) => a + (rep.totals[String(id)] ?? 0),
                            0
                          );
                          return { g: g.groupId, avg: sum / ids.length };
                        })
                        .sort((a, b) => b.avg - a.avg);
                      const max = Math.max(1, ...rows.map((r) => r.avg));
                      return (
                        <div className="rounded-btn bg-ink-50 p-3">
                          <p className="text-sm font-bold text-ink-800">👥 모둠 평균 점수</p>
                          <div className="mt-2 space-y-1">
                            {rows.map((r, i) => (
                              <div key={r.g} className="flex items-center gap-2 text-xs">
                                <span className="w-12 shrink-0 font-bold text-ink-700">
                                  {i === 0 && "👑 "}
                                  {r.g}모둠
                                </span>
                                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                                  <span
                                    className={`block h-full rounded-full ${i === 0 ? "bg-warn" : "bg-brand"}`}
                                    style={{ width: `${Math.max(4, (r.avg / max) * 100)}%` }}
                                  />
                                </span>
                                <span className="tnum w-10 shrink-0 text-right font-bold text-ink-700">
                                  {r.avg.toFixed(1)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-1.5 text-[11px] text-ink-400">
                            평균 차이가 크면 모둠 구성·역할을 살펴봐 주세요.
                          </p>
                        </div>
                      );
                    })()}
                  <div className="rounded-btn bg-ink-50 p-3">
                    <p className="text-sm font-bold text-ink-800">🏅 세션 점수 TOP 5</p>
                    <ol className="mt-1 space-y-0.5 text-sm">
                      {[...students]
                        .map((s) => ({ name: s.name, total: rep.totals[String(s.id)] ?? 0 }))
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
              );
            })()
          )}

          <Button onClick={() => void sessionPrint()} disabled={printing} className="mt-1">
            🖨️ 세션 리포트 인쇄 / PDF 저장
          </Button>
          <p className="mt-1.5 text-xs text-ink-400">
            세션 리포트는 전체 하이라이트(독서 MVP·최다 모둠·점수·칭찬·건의)만 담겨요.
          </p>
        </div>
      )}
    </Card>
  );
}
