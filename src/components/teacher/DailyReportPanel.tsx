"use client";
// 데일리 리포트 — 오늘의 독서 현황 + 점수를 한눈에, 인쇄/PDF로 뽑기.
// 읽기 예산: 이미 캐시된 문서만 사용(readingStats·dailyScores·settings). 인쇄 시에만 그날 문서 추가 조회.
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import { s1TotalOf, s1BooksOf } from "@/lib/staticData";
import { useReadingStats } from "@/lib/query/reading";
import { useDailyScores, useRangeReport } from "@/lib/query/evaluation";
import { useSettings } from "@/lib/query/settings";
import { useClassBanner } from "@/lib/query/classMeta";
import { weekOfDate } from "@/lib/date";
import { weekBooks } from "@/lib/readingStreak";
import { SEMESTER_START, TOTAL_WEEKS, scheduleOfWeek } from "@/lib/schedule";
import { periodOfWeek, dateRangeOfPeriod } from "@/lib/aggregate";
import {
  openPrintWindow,
  openStudentPrintDoc,
  esc,
  brandHeader,
  dateTitle,
} from "@/lib/exportDoc";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SubTabs from "@/components/ui/SubTabs";
import type { DailyScoreRow } from "@/types";
import { groupDayScore, type GroupDayScore } from "@/lib/groupScore";

const MEDAL = ["🥇", "🥈", "🥉"];

// 모둠 점수 반영 항목 (lib/groupScore 규칙) — 화면 모둠별 칩
const GROUP_PARTS: { key: keyof GroupDayScore; icon: string; label: string }[] = [
  { key: "rankOnce", icon: "🏆", label: "순위(1회)" },
  { key: "missionOnce", icon: "💌", label: "미션" },
  { key: "read", icon: "🐢", label: "독서" },
  { key: "bonus", icon: "🎁", label: "보너스" },
];

export default function DailyReportPanel({
  date,
  onDateChange,
}: {
  date: string;
  onDateChange?: (date: string) => void; // 리포트 탭에서 바로 날짜 이동 (오늘 집계 탭과 공유)
}) {
  const { data: stats } = useReadingStats();
  const { data: today } = useDailyScores(date);
  const { data: settings } = useSettings();
  const { data: banner } = useClassBanner();
  const { toast } = useFeedback();
  const goalLine = banner?.active && banner.title.trim() ? banner.title.trim() : null;
  const [printing, setPrinting] = useState(false);
  const [period, setPeriod] = useState<"day" | "week" | "student">("day");
  const [view, setView] = useState<"all" | "groups">("all");
  // 개인 리포트 — 학생·범위 선택 (상담·가정통신 첨부용)
  const [repSid, setRepSid] = useState(1);
  const [repScope, setRepScope] = useState<"session" | "semester">("session");

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

  // 세션 독서 합산 (readingStats 캐시 — 추가 읽기 0): 두 주 권수 합 (정산과 동일 기준)
  const sessionReadOf = (sid: number) =>
    weekBooks(stats, sid, w1) + (w2 !== w1 ? weekBooks(stats, sid, w2) : 0);

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

  const weekRead = (sid: number) => weekBooks(stats, sid, week);
  const classTotal = s1TotalOf(stats) + Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const weekBooksTotal = students.reduce((a, s) => a + weekRead(s.id), 0);
  const notMet = students.filter((s) => weekRead(s.id) < quota);
  const metCount = students.length - notMet.length;

  const scoreRows = students
    .map((s) => ({ name: s.name, row: today?.[s.id] }))
    .filter((r) => r.row)
    .sort((a, b) => b.row!.total - a.row!.total);

  // 학생/모둠의 항목별 점수 분해 — dailyScores 행 재사용 (추가 읽기 0).
  // 모둠 점수 규칙은 lib/groupScore 단일 출처 (내부 상호평가·MVP 제외, 순위·미션 1회)
  const rowOf = (id: number) => today?.[String(id)] as DailyScoreRow | undefined;
  const groupScoreOf = (ids: number[]) =>
    groupDayScore((today ?? {}) as Record<string, unknown>, ids);

  // 집계 문서의 _meta — 집계 후에만 존재
  const meta = (today?._meta ?? null) as {
    mvpWinners?: number[]; // 점수 MVP (모둠별 1위)
    classTop?: number[]; // 학급 전체 1위 (+2 추가)
    bossWinners?: number[]; // 오늘의 부서장 (투표 최다 — 칭호)
    autoBestGroups?: number[]; // 오늘의 모둠 — 총점 합계 1위 (자동 타이틀)
    ranks?: Record<string, number>; // 교사 순위 (점수 배분)
    missionGroups?: number[];
    compliments?: { from: number; to: number; text: string }[];
    peerSuggestions?: { from: number; to: number; text: string }[];
    bossReasons?: { from: number; to: number; text: string }[];
    toTeacher?: { from: number; text: string }[];
  } | null;
  const autoBestSet = new Set(meta?.autoBestGroups ?? []);
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

      // 독서 현황 (인쇄물은 이모지 대신 텍스트 제목 — 프린터에서 이모지가 깨지는 문제)
      const metPct = Math.round((metCount / students.length) * 100);
      const readingCard = card(
        `거북이 독서 현황 (${week}주차)`,
        `<div class="stats">
          <div><div class="l">학급 누적</div><div class="v green">${classTotal}</div></div>
          <div><div class="l">이번 주</div><div class="v">${weekBooksTotal}권</div></div>
          <div><div class="l">목표 달성</div><div class="v blue">${metCount}/${students.length}</div></div>
        </div>
        <div class="gauge"><i style="width:${metPct}%"></i><span>주간 목표 달성 ${metCount}/${students.length}명 (${metPct}%)</span></div>${
          notMet.length === 0 ? `<p class="muted">전원 목표 달성!</p>` : ""
        }`
      );
      // 미달 학생 명단은 인쇄물에 싣지 않는다 — 학부모 공유물에 낙인 방지 (사용자 결정)

      const sections = [readingCard];

      if (meta) {
        // ── 1페이지: 학부모용 — '받은 것만' 뱃지로 (숫자표 대신, 3초에 읽히게) ──
        const praisedSet = new Set((meta.compliments ?? []).map((c) => c.to));
        const bossReasons = meta.bossReasons ?? [];
        // 학생 한 명의 뱃지 — 0점 항목은 숨기고 획득한 것만
        const kidBadges = (id: number): string => {
          const r = rowOf(id);
          if (!r) return "";
          const bs: string[] = [];
          if ((meta.classTop ?? []).includes(id)) bs.push(`<span class="bc mvp">⭐ 오늘의 MVP</span>`);
          else if ((r.mvp ?? 0) > 0) bs.push(`<span class="bc mvp">⭐ MVP</span>`);
          if ((r.best ?? 0) > 0) bs.push(`<span class="bc best">👑 오늘의 모둠</span>`);
          if ((r.boss ?? 0) > 0) bs.push(`<span class="bc boss">🙌 오늘의 부서장</span>`);
          if ((r.read ?? 0) > 0) bs.push(`<span class="bc read">🐢 독서 ${r.read}권</span>`);
          if (praisedSet.has(id)) bs.push(`<span class="bc praise">💌 칭찬 받음</span>`);
          if ((r.bonus ?? 0) > 0) bs.push(`<span class="bc best">🎁 선생님 +${r.bonus}</span>`);
          return bs.join("");
        };
        // 반 전체 하이라이트 — 오늘의 모둠 + 오늘의 MVP
        const bestNames = (meta.autoBestGroups ?? []).map((g) => `${g}모둠`).join(", ") || "—";
        const mvpNamesTop = (meta.classTop ?? []).map(nm).join(", ") || "—";
        const highlights = `<div class="hlrow">
  <div class="hl gold"><span class="ic">👑</span><div><div class="k">오늘의 모둠</div><div class="v">${esc(bestNames)}</div></div></div>
  <div class="hl star"><span class="ic">⭐</span><div><div class="k">오늘의 MVP</div><div class="v">${esc(mvpNamesTop)}</div></div></div>
</div>`;
        const groupsHtml = schedule.groups
          .map((g) => {
            const ids = [g.chair, ...g.members.map((m) => m.studentId)];
            const isBest = autoBestSet.has(g.groupId);
            const gSum = groupScoreOf(ids).total;
            const rows = ids
              .map((id) => {
                const badges = kidBadges(id);
                const score = totalOf(id);
                // 뱃지가 없으면 응원 멘트 (낙인 대신 격려 — 사용자 확정)
                const tail = badges
                  ? `<span class="bs">${badges}</span>`
                  : `<span class="q">${score > 0 ? "오늘도 성실히 참여했어요" : "내일의 주인공을 응원해요 🌱"}</span>`;
                const row = `<div class="kid"><span class="nm">${esc(nm(id))}</span><span class="pt${score > 0 ? "" : " z"}">${score}</span>${tail}</div>`;
                // 부서장이면 추천 이유를 바로 아래 (인기투표 아님을 학부모가 알 수 있게)
                if ((rowOf(id)?.boss ?? 0) > 0) {
                  const rs = bossReasons.filter((r) => r.to === id);
                  if (rs.length)
                    return (
                      row +
                      `<div class="rsn">🙌 <b>${esc(nm(id))}</b> 부서장 — “${esc(rs[0].text)}” (${rs.length}명 추천)</div>`
                    );
                }
                return row;
              })
              .join("");
            const bestBadge = isBest ? `<span class="badge gold">오늘의 모둠</span>` : "";
            const missionBadge = missionSet.has(g.groupId) ? `<span class="badge">🎯 칭찬 미션</span>` : "";
            return `<div class="grp${isBest ? " win" : ""}">
  <div class="h"><span class="gname">${g.groupId}모둠${bestBadge}${missionBadge}</span><span class="gsum">모둠 점수 <b>${gSum}</b>점</span></div>
  <div class="kids">${rows}</div>
</div>`;
          })
          .join("");
        sections.push(
          card("오늘 우리 반 — 아이별 기록", `${highlights}<div class="grps wide">${groupsHtml}</div>`)
        );

        // ── 2페이지: 정성 — 모둠별 칭찬·건의 (말풍선) + 바라는 점 ──
        sections.push(
          `<div class="pagebreak"></div>` +
            brandHeader(
              `${dateTitle(date)} 마음 기록`,
              "오늘 주고받은 칭찬 · 건의 (모둠별) · 선생님에게 바라는 점"
            )
        );
        const heartHtml = schedule.groups
          .map((g) => {
            const ids = [g.chair, ...g.members.map((m) => m.studentId)];
            const set = new Set(ids);
            const gComps = compliments.filter((c) => set.has(c.to));
            const gSugs = peerSug.filter((c) => set.has(c.to));
            const bubbles =
              [
                ...gComps.map(
                  (c) =>
                    `<li class="bub"><b>${esc(nm(c.from))}</b> → <b>${esc(nm(c.to))}</b> · ${esc(c.text)}</li>`
                ),
                ...gSugs.map(
                  (c) =>
                    `<li class="bub sug"><b>${esc(nm(c.from))}</b> → <b>${esc(nm(c.to))}</b> · 건의: ${esc(c.text)}</li>`
                ),
              ].join("") || `<li class="bub none">오늘 기록이 없어요.</li>`;
            return `<div class="grp"><div class="h"><span class="gname">${g.groupId}모둠</span><span class="gsum">칭찬 ${gComps.length} · 건의 ${gSugs.length}</span></div><ul class="bubs">${bubbles}</ul></div>`;
          })
          .join("");
        sections.push(
          card(
            `모둠별 칭찬·건의 (칭찬 ${compliments.length} · 건의 ${peerSug.length})`,
            `<div class="grps">${heartHtml}</div>`
          )
        );
        sections.push(
          card(
            `선생님에게 바라는 점 (${wishes.length})`,
            wishes.length
              ? `<ul>${wishes.map((t) => `<li><b>${esc(nm(t.from))}</b>: ${esc(t.text)}</li>`).join("")}</ul>`
              : `<p class="muted">없음</p>`
          )
        );
        if (notPraised.length) {
          sections.push(
            `<p class="muted warn">※ 오늘 칭찬 못 받은 친구: ${notPraised.map((s) => esc(s.name)).join(", ")}</p>`
          );
        }
      } else {
        sections.push('<p class="muted">아직 집계 전이에요. 집계 후 인쇄하면 점수·모둠별 기록이 담겨요.</p>');
      }

      openPrintWindow(
        `${date} 데일리 리포트`,
        brandHeader(
          `${dateTitle(date)} 데일리 리포트`,
          `2학기 학급 자치 · ${week}주차${goalLine ? ` · 목표: ${esc(goalLine)}` : ""}`
        ) + sections.join("")
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄에 실패했어요.", "error");
    } finally {
      setPrinting(false);
    }
  }

  // 세션 인쇄 — 화면의 하이라이트 구성을 그대로 담는다 (사용자 확정: 개별 칭찬·바라는 점
  // 같은 마음 기록은 제외, 2주 활동을 한눈에 + 모둠 반성 수록)
  function sessionPrint() {
    if (printing || !rep) return;
    setPrinting(true);
    try {
      const readCounts: Record<string, number> = {};
      for (const s of students) readCounts[String(s.id)] = sessionReadOf(s.id);
      const [readTop, readMax] = topOf(readCounts);
      const [bestGs, bestMax] = topOf(rep.rank1ByGroup);
      const [mvpTop, mvpMax] = topOf(rep.mvpCount);
      const [giveTop, giveMax] = topOf(rep.givenCount);
      const [recvTop, recvMax] = topOf(rep.receivedCount);
      const [missionTop, missionMax] = topOf(rep.missionByGroup);
      const names = (ids: number[]) => ids.map((id) => esc(nm(id))).join(", ");
      const card = (t: string, inner: string) =>
        `<div class="card"><div class="t">${t}</div>${inner}</div>`;

      // ① 하이라이트 6종 — 화면의 타일 구성 그대로
      const hiTiles = [
        ["독서 MVP", readMax > 0 ? `${names(readTop)} (${readMax}권)` : "없음"],
        ["오늘의 모둠 최다", bestMax > 0 ? `${bestGs.map((g) => `${g}모둠`).join(", ")} (${bestMax}회)` : "없음"],
        ["MVP 최다", mvpMax > 0 ? `${names(mvpTop)} (${mvpMax}회)` : "없음"],
        ["미션 최다 모둠", missionMax > 0 ? `${missionTop.map((g) => `${g}모둠`).join(", ")} (${missionMax}일)` : "없음"],
        ["칭찬왕 (보내기)", giveMax > 0 ? `${names(giveTop)} (${giveMax}회)` : "없음"],
        ["칭찬 많이 받은 친구", recvMax > 0 ? `${names(recvTop)} (${recvMax}회)` : "없음"],
      ]
        .map(([l, v]) => `<tr><td>${l}</td><td><b>${v}</b></td></tr>`)
        .join("");

      // ② 활동 스탯 + 독서 달성률
      const metOf = (w: number) =>
        students.filter((s) => weekBooks(stats, s.id, w) >= quota).length;
      const sessionBooks = students.reduce((a, s) => a + sessionReadOf(s.id), 0);
      const statsHtml = `<div class="stats">
        <div><div class="l">칭찬</div><div class="v green">${rep.compliments}</div></div>
        <div><div class="l">미션 달성</div><div class="v blue">${rep.missionAchievements}회</div></div>
        <div><div class="l">학급 독서</div><div class="v">+${sessionBooks}권</div></div>
      </div>
      <p class="muted">독서 목표 달성 — ${w1}주차 ${metOf(w1)}/${students.length}명${
        w2 !== w1 ? ` · ${w2}주차 ${metOf(w2)}/${students.length}명` : ""
      } · 칭찬 참여 ${Object.keys(rep.givenCount).length}/${students.length}명</p>`;

      // ③ 모둠 평균 점수 + 세션 TOP 5
      const groupRows = schedule.groups
        .map((g) => {
          const ids = [g.chair, ...g.members.map((m) => m.studentId)];
          const sum = ids.reduce((a, id) => a + (rep.totals[String(id)] ?? 0), 0);
          return { g: g.groupId, avg: sum / ids.length };
        })
        .sort((a, b) => b.avg - a.avg);
      const groupHtml = `<table><thead><tr><th>모둠</th><th>세션 평균 점수</th></tr></thead><tbody>${groupRows
        .map((r, i) => `<tr><td>${i === 0 ? "★ " : ""}${r.g}모둠</td><td><b>${r.avg.toFixed(1)}</b></td></tr>`)
        .join("")}</tbody></table>`;
      const top5 = [...students]
        .map((s) => ({ name: s.name, total: rep.totals[String(s.id)] ?? 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      const top5Html = `<table><thead><tr><th>순위</th><th>이름</th><th>세션 총점</th></tr></thead><tbody>${top5
        .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td><b>${r.total}</b></td></tr>`)
        .join("")}</tbody></table>`;

      // ④ 모둠 반성 — 세션 마지막 주말에 학생들이 남긴 글 (1기 등 기록 없으면 섹션 생략)
      const reflHtml = rep.reflections.length
        ? card(
            `세션 모둠 반성 (${rep.reflections.length}건)`,
            `<ul class="bubs">${rep.reflections
              .map((r) => `<li class="bub"><b>${esc(nm(r.from))}</b> · ${esc(r.text)}</li>`)
              .join("")}</ul>`
          )
        : "";

      openPrintWindow(
        `${sessionNo}기 세션 리포트`,
        brandHeader(
          `${sessionNo}기 세션 리포트`,
          `${dateTitle(sessionStart)} ~ ${dateTitle(sessionEnd)} · 집계 ${rep.days}일${goalLine ? ` · 목표: ${esc(goalLine)}` : ""}`
        ) +
          card(`세션 하이라이트 (${w1}·${w2}주)`, `<table><tbody>${hiTiles}</tbody></table>`) +
          card("활동 요약", statsHtml) +
          `<div class="grid2">${card("모둠 평균 점수", groupHtml)}${card("세션 점수 TOP 5", top5Html)}</div>` +
          reflHtml
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄에 실패했어요.", "error");
    } finally {
      setPrinting(false);
    }
  }

  async function studentPrint() {
    if (printing) return;
    setPrinting(true);
    try {
      const [ps, pe] =
        repScope === "session"
          ? [sessionStart, sessionEnd]
          : [isBeta ? "2026-07-01" : SEMESTER_START, date];
      const label = repScope === "session" ? `${sessionNo}기 세션` : "학기 전체";
      const r = await openStudentPrintDoc(repSid, ps, pe, label);
      if (r.days === 0) toast("이 기간에 집계된 날이 없어요 — 빈 리포트가 열렸어요.", "warn");
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄에 실패했어요.", "error");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Card
      title="🗒️ 리포트"
      desc={`${date} · ${week}주차`}
      action={
        onDateChange ? (
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="rounded-btn border border-ink-300 px-2.5 py-1.5 text-sm"
            aria-label="리포트 날짜 선택"
          />
        ) : undefined
      }
    >
      <div className="mt-3">
        <SubTabs<"day" | "week" | "student">
          tabs={[
            { key: "day", label: "📅 일간" },
            { key: "week", label: "🏆 세션(2주)" },
            { key: "student", label: "🧑 개인" },
          ]}
          active={period}
          onChange={setPeriod}
        />
      </div>

      {/* 학급 목표 — 교사탭에서 편집한 배너를 리포트에도 */}
      {goalLine && (
        <p className="mt-2 rounded-btn bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
          🎯 학급 목표: {goalLine}
        </p>
      )}

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
                      {autoBestSet.has(g.groupId) && "👑 "}
                      {g.groupId}모둠
                      {autoBestSet.has(g.groupId) && (
                        <span className="ml-1.5 rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold text-white">
                          오늘의 모둠
                        </span>
                      )}
                      {gRank ? (
                        <span className="ml-1.5 rounded-full bg-warn-weak px-2 py-0.5 text-[10px] font-bold text-warn">
                          교사 {gRank}위
                        </span>
                      ) : null}
                      {missionSet.has(g.groupId) && (
                        <span className="ml-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-600">
                          🎯 미션 +1
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-600">
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
                  {/* 모둠 점수 분해 — 반영 항목 칩 + 합계 (개인 전용 항목은 표에서 확인) */}
                  {(() => {
                    const gs = groupScoreOf(memberIds);
                    return (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1">
                        {GROUP_PARTS.map((p) => {
                          const v = gs[p.key] as number;
                          return (
                            <span
                              key={p.key}
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                v > 0
                                  ? "bg-white text-brand-strong"
                                  : v < 0
                                    ? "bg-danger-weak text-danger"
                                    : "bg-white/60 text-ink-300"
                              }`}
                            >
                              {p.icon}
                              {p.label} <b className="tnum">{v > 0 ? `+${v}` : v}</b>
                            </span>
                          );
                        })}
                        <span className="rounded-full bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          = 모둠 점수 <b className="tnum">{gs.total}</b>점
                        </span>
                      </p>
                    );
                  })()}
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
              <p className="tnum text-lg font-extrabold text-ink-900">{weekBooksTotal}권</p>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-ink-400">목표 달성</p>
              <p className="tnum text-lg font-extrabold text-brand-strong">
                {metCount}/{students.length}
              </p>
            </div>
          </div>
          {/* 미달 명단은 표시하지 않음 — 달성 명수만 (낙인 방지, 사용자 결정) */}
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
              <p className="text-sm font-bold text-ink-800">⭐ 오늘의 MVP (점수 1위)</p>
              <p className="mt-1 text-sm text-ink-700">
                {mvpNames.length ? mvpNames.join(", ") : <span className="text-ink-400">없음</span>}
              </p>
              {(meta?.classTop ?? []).length > 0 && (
                <p className="mt-0.5 text-xs text-warn">
                  🏆 학급 1위(+2 추가): {(meta!.classTop ?? []).map(nm).join(", ")}
                </p>
              )}
              {(meta?.bossWinners ?? []).length > 0 && (
                <p className="mt-0.5 text-xs text-ink-600">
                  👑 오늘의 부서장(투표): {(meta!.bossWinners ?? []).map(nm).join(", ")}
                </p>
              )}
            </div>
            <div className="rounded-btn bg-ink-50 p-3">
              <p className="text-sm font-bold text-ink-800">👑 오늘의 모둠 (총점 합계 1위)</p>
              <p className="mt-1 text-sm text-ink-700">
                {(meta?.autoBestGroups ?? []).length ? (
                  (meta!.autoBestGroups ?? []).map((g) => `${g}모둠`).join(", ")
                ) : (
                  <span className="text-ink-400">집계 후 자동 선정</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                교사 순위 점수:{" "}
                {rankPairs.length ? (
                  rankPairs.map(([g, r]) => `${r}위 ${g}모둠`).join(" · ")
                ) : (
                  <span className="font-bold text-warn">
                    ⚠️ 미선정 — 순위 점수 0점. 선정 후 재집계하세요
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

      {/* 🧑 개인 리포트 — 상담·가정통신 첨부용 (점수 흐름·받은 칭찬·독서만) */}
      {period === "student" && (
        <div className="mt-2 space-y-2">
          <p className="rounded-btn bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
            학생 한 명의 <b>날짜별 점수 흐름 + 받은 칭찬(보낸 친구 실명) + 독서 기록</b>만 담은
            1장짜리 인쇄물이에요. 상담이나 가정통신 첨부용 — 다른 학생의 점수·건의는 담기지
            않아요.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={repSid}
              onChange={(e) => setRepSid(Number(e.target.value))}
              className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}번 {s.name}
                </option>
              ))}
            </select>
            <select
              value={repScope}
              onChange={(e) => setRepScope(e.target.value as "session" | "semester")}
              className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
            >
              <option value="session">{sessionNo}기 세션 ({sessionStart} ~ {sessionEnd})</option>
              <option value="semester">학기 전체 (~ {date})</option>
            </select>
            <Button onClick={() => void studentPrint()} disabled={printing}>
              🖨️ 개인 리포트 인쇄 / PDF 저장
            </Button>
          </div>
        </div>
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
                      students.filter((s) => weekBooks(stats, s.id, w) >= quota).length;
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
