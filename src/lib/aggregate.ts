// 일일 점수 집계 — 교사 세션에서 실행 (Admin SDK/서비스 계정 불필요).
// 원시 평가를 읽는 유일한 코드 경로: 하루 최대 25문서(평가)를
// 교사만 1회 읽고, 결과는 dailyScores/{date} 문서 하나로 저장한다.
// 학생들은 이 결과 문서만 읽으므로 읽기 폭증이 구조적으로 불가능하다.
// 재집계해도 누적이 어긋나지 않도록 이전 집계분을 빼고 더한다(멱등).
import {
  addDoc,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { weekOfDate } from "@/lib/date";
import { countedWeekBooks, streakAtWeek } from "@/lib/readingStreak";
import type { ReadingStats } from "@/lib/query/reading";
import type { ClassSettings, DailyScoreRow } from "@/types";

export interface AggregateResult {
  date: string;
  evaluatorCount: number;
  groupRanks: Record<number, number>;
}

export async function aggregateDate(
  date: string,
  settings: ClassSettings
): Promise<AggregateResult> {
  const d = db();

  // 그날 감상문 제출자 (독서 자동 +1점) — createdAt 하루 범위 쿼리 (교사 1회)
  const dayStartMs = new Date(date + "T00:00:00+09:00").getTime();
  const dayEndMs = dayStartMs + 86400000;

  // 1) 원시 평가 읽기 (교사 1회 — 최대 25문서)
  const [evalSnap, prevSnap, cumSnap, bestSnap, reportSnap] = await Promise.all([
    getDocs(collection(d, "evaluations", date, "entries")),
    getDoc(doc(d, "dailyScores", date)), // 재집계 시 이전분 차감용
    getDoc(doc(d, "dailyScores", "_cumulative")),
    getDoc(doc(d, "classData", "bestGroups")), // 모둠 간 평가 폐지 → 교사 '오늘의 모둠'이 순위 결정
    getDocs(
      query(
        collection(d, "readingReports"),
        where("createdAt", ">=", dayStartMs),
        where("createdAt", "<", dayEndMs)
      )
    ),
  ]);

  // 2) 모둠 내 점수: 받은 평가 합 (+ MVP 득표 집계)
  //    "_"로 시작하는 키는 점수가 아닌 부가 필드(_mvp, _compliment)
  const peer: Record<number, number> = {};
  const mvpVotes: Record<number, number> = {};
  // 칭찬·건의·바라는 점도 _meta에 보관 → 기간 인쇄(일/주/월)가 집계 문서만 읽으면 되게 함
  const compliments: { from: number; to: number; text: string }[] = [];
  const peerSuggestions: { from: number; to: number; text: string }[] = [];
  const toTeacher: { from: number; text: string }[] = [];
  evalSnap.forEach((entry) => {
    const data = entry.data();
    const from = Number(entry.id);
    for (const [targetId, v] of Object.entries(data)) {
      if (targetId.startsWith("_")) continue;
      if (Number(targetId) === from) continue; // 자기 점수 무효 (조작 방지)
      if (typeof v === "number") peer[Number(targetId)] = (peer[Number(targetId)] ?? 0) + v;
    }
    if (typeof data._mvp === "number" && data._mvp > 0 && data._mvp !== from)
      mvpVotes[data._mvp] = (mvpVotes[data._mvp] ?? 0) + 1; // _mvp:0 = 취소, 자기 투표 무효
    // 구버전 단일 칭찬(_compliment) + 신버전 친구별 칭찬(_compliments) — 자기 칭찬 무효
    const legacy = data._compliment as { to: number; text: string } | undefined;
    if (legacy?.text && legacy.to !== from)
      compliments.push({ from, to: legacy.to, text: legacy.text });
    const cmap = data._compliments as Record<string, string> | undefined;
    if (cmap)
      for (const [to, text] of Object.entries(cmap))
        if (text?.trim() && Number(to) !== from) compliments.push({ from, to: Number(to), text });
    const smap = data._peerSuggestions as Record<string, string> | undefined;
    if (smap)
      for (const [to, text] of Object.entries(smap))
        if (text?.trim()) peerSuggestions.push({ from, to: Number(to), text });
    if (typeof data._toTeacher === "string" && data._toTeacher)
      toTeacher.push({ from, text: data._toTeacher });
  });

  // 3) 순위 산정: 교사가 매긴 1~5위(ranking)에 rankPoints(기본 5·4·3·2·1) 배분.
  //    구버전(단일 groupId)은 1위만, 미선정이면 순위 점수 0 (호출부에서 경고 표시).
  const rankPoint = (rank: number) =>
    settings.rankPoints[rank - 1] ?? settings.rankPoints[settings.rankPoints.length - 1] ?? 0;
  const bestEntry = bestSnap.exists()
    ? (bestSnap.data() as Record<string, { groupId: number; ranking?: number[] } | undefined>)[
        date
      ]
    : undefined;
  const ranks: Record<number, number> = bestEntry?.ranking?.length
    ? Object.fromEntries(bestEntry.ranking.map((g, i) => [g, i + 1]))
    : bestEntry?.groupId
      ? { [bestEntry.groupId]: 1 }
      : {};

  // 4) 해당 날짜의 자리표에서 모둠 소속 확인 → 모둠원 전원 동일 순위 점수
  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const groupOfStudent: Record<number, number> = {};
  for (const g of schedule.groups) {
    groupOfStudent[g.chair] = g.groupId;
    for (const m of g.members) groupOfStudent[m.studentId] = g.groupId;
  }

  // 4-0) 그날 감상문 제출자 집합 (독서 자동 +1점)
  const readToday = new Set<number>();
  reportSnap.forEach((r) => {
    const sid = r.data().studentId as number | undefined;
    if (typeof sid === "number") readToday.add(sid);
  });

  // 4-1) 모둠 칭찬 미션: 모둠원 전원이 칭찬을 1개 이상 받으면 그 모둠 전원 +1점
  //      (서로 칭찬하기를 매일 미션으로 — 협력하면 다 같이 이득)
  const complimentedIds = new Set(compliments.map((c) => c.to));
  const missionGroups: number[] = [];
  for (const g of schedule.groups) {
    const ids = [g.chair, ...g.members.map((m) => m.studentId)];
    if (ids.every((id) => complimentedIds.has(id))) missionGroups.push(g.groupId);
  }
  const missionSet = new Set(missionGroups);

  // 4-2) 모둠별 MVP: 각 모둠에서 최다 득표(1표 이상, 동점 모두) — MVP는 +1점
  const mvpWinners: number[] = [];
  for (const g of schedule.groups) {
    const ids = [g.chair, ...g.members.map((m) => m.studentId)];
    const max = Math.max(0, ...ids.map((id) => mvpVotes[id] ?? 0));
    if (max > 0) mvpWinners.push(...ids.filter((id) => (mvpVotes[id] ?? 0) === max));
  }
  const mvpSet = new Set(mvpWinners);

  // 5) 학생별 행 구성 (기존 보너스는 유지)
  //    total = 정량평가 + 오늘의모둠 순위 + 칭찬미션 + MVP + 독서 + 교사보너스
  const prevRows = (prevSnap.exists() ? prevSnap.data() : {}) as Record<
    string,
    DailyScoreRow | unknown
  >;
  const rows: Record<number, DailyScoreRow> = {};
  for (const s of students) {
    const prevRow = prevRows[String(s.id)] as DailyScoreRow | undefined;
    const p = peer[s.id] ?? 0;
    // 순위에 든 모둠 소속이면 그 순위 점수 — 오늘의 모둠(1위)은 +1점 더
    const myRank = ranks[groupOfStudent[s.id]];
    const gr = myRank ? rankPoint(myRank) + (myRank === 1 ? 1 : 0) : 0;
    const bonus = prevRow?.bonus ?? 0;
    const mission = missionSet.has(groupOfStudent[s.id]) ? 1 : 0;
    const mvp = mvpSet.has(s.id) ? 1 : 0;
    const read = readToday.has(s.id) ? 1 : 0;
    rows[s.id] = {
      peer: p,
      groupRank: gr,
      bonus,
      mission,
      mvp,
      read,
      total: p + gr + bonus + mission + mvp + read,
    };
  }

  // 6) 저장: 그날 문서 1개 + 누적 문서 1개 (이전 집계분 빼고 더해 멱등)
  type CumDoc = Record<string, number> & {
    mvpWins?: Record<string, number>;
    mvpVotesTotal?: Record<string, number>;
  };
  const cum = (cumSnap.exists() ? cumSnap.data() : {}) as CumDoc;
  const prevMeta =
    (prevSnap.exists()
      ? (prevSnap.data()._meta as
          | { mvpVotes?: Record<string, number>; mvpWinners?: number[] }
          | undefined)
      : undefined) ?? {};
  const mvpWins = { ...cum.mvpWins };
  const mvpVotesTotal = { ...cum.mvpVotesTotal };
  for (const w of prevMeta.mvpWinners ?? []) mvpWins[String(w)] = (mvpWins[String(w)] ?? 0) - 1;
  for (const [sid, n] of Object.entries(prevMeta.mvpVotes ?? {}))
    mvpVotesTotal[sid] = (mvpVotesTotal[sid] ?? 0) - n;
  for (const w of mvpWinners) mvpWins[String(w)] = (mvpWins[String(w)] ?? 0) + 1;
  for (const [sid, n] of Object.entries(mvpVotes))
    mvpVotesTotal[String(sid)] = (mvpVotesTotal[String(sid)] ?? 0) + n;

  for (const s of students) {
    const prevTotal = (prevRows[String(s.id)] as DailyScoreRow | undefined)?.total ?? 0;
    cum[String(s.id)] = (cum[String(s.id)] ?? 0) - prevTotal + rows[s.id].total;
  }
  await Promise.all([
    setDoc(doc(d, "dailyScores", date), {
      ...rows,
      _meta: {
        aggregatedAt: Date.now(),
        ranks,
        mvpVotes,
        mvpWinners,
        missionGroups,
        compliments,
        peerSuggestions,
        toTeacher,
      },
    }),
    setDoc(doc(d, "dailyScores", "_cumulative"), { ...cum, mvpWins, mvpVotesTotal }),
  ]);

  return {
    date,
    evaluatorCount: evalSnap.size,
    groupRanks: ranks,
  };
}

/** 주차 → 격주 기간 번호 (1~11) */
export function periodOfWeek(week: number): number {
  return Math.floor((week - 1) / 2) + 1;
}

export function dateRangeOfPeriod(period: number): [string, string] {
  const first = scheduleOfWeek(period * 2 - 1).weekStart;
  const lastWeek = Math.min(period * 2, TOTAL_WEEKS);
  const end = new Date(scheduleOfWeek(lastWeek).weekStart + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  return [first, end.toISOString().slice(0, 10)];
}

// ── 세션(2주) 자동 보상 정산 ───────────────────────────────────
// · 최다 MVP(투표 최다) → 실버 1개
// · 최고 모둠(1위 최다) → 모둠원 전원 실버 1개
// · 최다 거북이독서(두 주 합산 '인정 권수' 최다 — 하루 2권 캡) → 실버 1개
// · 최다 칭찬미션 모둠(미션 달성 일수 최다) → 모둠원 전원 실버 1개
// · 독서 스트릭: 주간 목표 달성 주마다 연속 주수만큼 보너스 점수(누적 가산) (1주=1, 2주=2, 3주+=3 상한)
// 멱등: biweeklyScores/session-{period} 마커 재사용(신규 규칙 불필요). 세션 종료 후 월요일에 실행.
export interface SessionSettleResult {
  period: number;
  range: [string, string];
  mvps: number[];
  bestGroups: number[];
  bestGroupMembers: number[];
  readingTop: number[]; // 최다 독서
  missionTopGroups: number[]; // 최다 미션 모둠
  missionTopMembers: number[];
  streakPoints: Record<string, number>; // studentId → 스트릭 보너스(누적 점수 가산)
  alreadySettled: boolean;
}

const STREAK_CAP = 3; // 스트릭 보상 상한 (주당 최대 보너스 점수)

/** 최댓값(>0)을 가진 키들 (동점 모두, 전부 0이면 빈 배열) */
function topKeys(counts: Record<number, number>): number[] {
  const max = Math.max(0, ...Object.values(counts));
  if (max <= 0) return [];
  return Object.entries(counts)
    .filter(([, v]) => v === max)
    .map(([k]) => Number(k));
}

export async function settleSession(period: number): Promise<SessionSettleResult> {
  const d = db();
  const [start, end] = dateRangeOfPeriod(period);
  const marker = doc(d, "biweeklyScores", `session-${period}`);

  const existing = await getDoc(marker);
  if (existing.exists() && existing.data().awardedAt) {
    const data = existing.data();
    return {
      period,
      range: [start, end],
      mvps: data.mvps ?? [],
      bestGroups: data.bestGroups ?? [],
      bestGroupMembers: data.bestGroupMembers ?? [],
      readingTop: data.readingTop ?? [],
      missionTopGroups: data.missionTopGroups ?? [],
      missionTopMembers: data.missionTopMembers ?? [],
      streakPoints: data.streakPoints ?? {},
      alreadySettled: true,
    };
  }

  // 기간 내 일일 집계 문서(최대 14개) + 독서 통계·설정 (교사 1회)
  const [snap, statsSnap, settingsSnap] = await Promise.all([
    getDocs(
      query(
        collection(d, "dailyScores"),
        where(documentId(), ">=", start),
        where(documentId(), "<=", end)
      )
    ),
    getDoc(doc(d, "readingStats", "main")),
    getDoc(doc(d, "classData", "settings")),
  ]);
  const mvpCount: Record<number, number> = {};
  const rank1Count: Record<number, number> = {};
  const missionCount: Record<number, number> = {};
  snap.forEach((day) => {
    const meta = (day.data()._meta ?? {}) as {
      mvpWinners?: number[];
      ranks?: Record<string, number>;
      missionGroups?: number[];
    };
    for (const w of meta.mvpWinners ?? []) mvpCount[w] = (mvpCount[w] ?? 0) + 1;
    for (const [g, r] of Object.entries(meta.ranks ?? {}))
      if (r === 1) rank1Count[Number(g)] = (rank1Count[Number(g)] ?? 0) + 1;
    for (const g of meta.missionGroups ?? []) missionCount[g] = (missionCount[g] ?? 0) + 1;
  });

  const mvps = topKeys(mvpCount);
  const bestGroups = topKeys(rank1Count);
  const missionTopGroups = topKeys(missionCount);

  // 모둠원 전원 명단 (세션 내 모둠 구성은 고정 — 세션 첫 주 자리표 사용)
  const schedule = scheduleOfWeek(period * 2 - 1);
  const membersOf = (gid: number) => {
    const g = schedule.groups.find((x) => x.groupId === gid);
    return g ? [g.chair, ...g.members.map((m) => m.studentId)] : [];
  };
  const bestGroupMembers = bestGroups.flatMap(membersOf);
  const missionTopMembers = missionTopGroups.flatMap(membersOf);

  // 독서: 최다 독서(두 주 합산 최다) + 스트릭 보상(주간 목표 달성 주마다 연속 주수만큼)
  // 파밍 방지: 권수는 '인정 권수'(하루 최대 2권 캡, countedWeekBooks) 기준 —
  // 하루에 몰아 쓴 감상문으로 목표·최다독서를 채울 수 없다 (학생 화면 표시와 동일 판정).
  const quota =
    (settingsSnap.exists() ? (settingsSnap.data().weeklyReadingQuota as number) : undefined) ?? 3;
  const stats = (statsSnap.exists() ? statsSnap.data() : {}) as ReadingStats;
  const w1 = period * 2 - 1;
  const w2 = Math.min(period * 2, TOTAL_WEEKS);

  const readSum: Record<number, number> = {};
  for (const s of students)
    readSum[s.id] =
      countedWeekBooks(stats, s.id, w1) + (w2 !== w1 ? countedWeekBooks(stats, s.id, w2) : 0);
  const readingTop = topKeys(readSum);

  // 스트릭 보상은 실버가 아닌 '보너스 점수'(누적 점수 가산) — 1주=1, 2주 연속=2, 상한 STREAK_CAP
  const streakPoints: Record<string, number> = {};
  if (quota > 0) {
    for (const s of students) {
      let award = 0;
      for (const w of w2 !== w1 ? [w1, w2] : [w1]) {
        const st = streakAtWeek(stats, s.id, quota, w);
        if (st > 0) award += Math.min(st, STREAK_CAP);
      }
      if (award > 0) streakPoints[String(s.id)] = award;
    }
  }

  // 실버 지급 개수 (최다 MVP 1 + 최고모둠 1 + 최다독서 1 + 최다미션모둠 1)
  const grant: Record<number, number> = {};
  for (const sid of mvps) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of bestGroupMembers) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of readingTop) grant[sid] = (grant[sid] ?? 0) + 1;
  for (const sid of missionTopMembers) grant[sid] = (grant[sid] ?? 0) + 1;

  const entries = Object.entries(grant);
  const hasStreak = Object.keys(streakPoints).length > 0;
  // 지급 대상이 전혀 없으면 마커를 남기지 않아 재실행 가능하게 둔다
  if (entries.length === 0 && !hasStreak) {
    return {
      period,
      range: [start, end],
      mvps: [],
      bestGroups: [],
      bestGroupMembers: [],
      readingTop: [],
      missionTopGroups: [],
      missionTopMembers: [],
      streakPoints: {},
      alreadySettled: false,
    };
  }
  for (const [sid, n] of entries) {
    await addDoc(collection(d, "coinTxns"), {
      studentId: Number(sid),
      amount: n,
      item: `세션 보상 (${period}기)`,
      type: "mvp",
      status: "approved",
      createdAt: Date.now(),
    });
  }
  if (entries.length) {
    await setDoc(
      doc(d, "coinTxns", "0_balances"),
      Object.fromEntries(entries.map(([sid, n]) => [sid, increment(n)])),
      { merge: true }
    );
  }
  // 스트릭 보너스 → 누적 점수에 가산 (일일 재집계는 델타 방식이라 이 가산은 보존됨)
  if (hasStreak) {
    await setDoc(
      doc(d, "dailyScores", "_cumulative"),
      Object.fromEntries(Object.entries(streakPoints).map(([sid, n]) => [sid, increment(n)])),
      { merge: true }
    );
  }
  await setDoc(marker, {
    mvps,
    bestGroups,
    bestGroupMembers,
    readingTop,
    missionTopGroups,
    missionTopMembers,
    streakPoints,
    mvpCount,
    rank1Count,
    range: [start, end],
    awardedAt: Date.now(),
  });

  return {
    period,
    range: [start, end],
    mvps,
    bestGroups,
    bestGroupMembers,
    readingTop,
    missionTopGroups,
    missionTopMembers,
    streakPoints,
    alreadySettled: false,
  };
}

// ── 교사 보너스 점수 (일일 집계 행 보정 + 누적 동기화) ───────────
export async function setBonus(date: string, studentId: number, bonus: number): Promise<void> {
  const d = db();
  const [daySnap, cumSnap] = await Promise.all([
    getDoc(doc(d, "dailyScores", date)),
    getDoc(doc(d, "dailyScores", "_cumulative")),
  ]);
  const day = daySnap.exists() ? daySnap.data() : {};
  const prevRow = (day[String(studentId)] as DailyScoreRow | undefined) ?? {
    peer: 0,
    groupRank: 0,
    bonus: 0,
    total: 0,
  };
  const newRow: DailyScoreRow = {
    ...prevRow,
    bonus,
    total:
      prevRow.peer +
      prevRow.groupRank +
      bonus +
      (prevRow.mission ?? 0) +
      (prevRow.mvp ?? 0) +
      (prevRow.read ?? 0),
  };
  const cum = cumSnap.exists() ? cumSnap.data() : {};
  const prevCum = typeof cum[String(studentId)] === "number" ? (cum[String(studentId)] as number) : 0;
  await Promise.all([
    setDoc(doc(d, "dailyScores", date), { [String(studentId)]: newRow }, { merge: true }),
    setDoc(
      doc(d, "dailyScores", "_cumulative"),
      { [String(studentId)]: prevCum - prevRow.total + newRow.total },
      { merge: true }
    ),
  ]);
}
