// 일일 점수 집계 — 교사 세션에서 실행 (Admin SDK/서비스 계정 불필요).
// 원시 평가를 읽는 유일한 코드 경로: 하루 최대 50문서(평가 25 + 모둠투표 25)를
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
import type { ClassSettings, DailyScoreRow } from "@/types";

/** Dense Ranking: 점수 내림차순, 동점은 같은 순위·후순위 안 내림 (인수인계 §5.5) */
export function denseRank(groupScores: Record<number, number>): Record<number, number> {
  const sorted = Object.entries(groupScores).sort((a, b) => b[1] - a[1]);
  const ranks: Record<number, number> = {};
  let rank = 0;
  let prev: number | null = null;
  for (const [gId, score] of sorted) {
    if (score !== prev) {
      rank++;
      prev = score;
    }
    ranks[Number(gId)] = rank;
  }
  return ranks;
}

export interface AggregateResult {
  date: string;
  evaluatorCount: number;
  voterCount: number;
  groupRanks: Record<number, number>;
}

export async function aggregateDate(
  date: string,
  settings: ClassSettings
): Promise<AggregateResult> {
  const d = db();

  // 1) 원시 평가 읽기 (교사 1회 — 최대 50문서)
  const [evalSnap, voteSnap, prevSnap, cumSnap, bestSnap] = await Promise.all([
    getDocs(collection(d, "evaluations", date, "entries")),
    getDocs(collection(d, "groupVotes", date, "entries")),
    getDoc(doc(d, "dailyScores", date)), // 재집계 시 이전분 차감용
    getDoc(doc(d, "dailyScores", "_cumulative")),
    getDoc(doc(d, "classData", "bestGroups")), // 모둠 간 평가 폐지 → 교사 '오늘의 모둠'으로 순위 대체
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
      if (typeof v === "number") peer[Number(targetId)] = (peer[Number(targetId)] ?? 0) + v;
    }
    if (typeof data._mvp === "number" && data._mvp > 0)
      mvpVotes[data._mvp] = (mvpVotes[data._mvp] ?? 0) + 1; // _mvp:0 = 선택 취소
    // 구버전 단일 칭찬(_compliment) + 신버전 친구별 칭찬(_compliments)
    const legacy = data._compliment as { to: number; text: string } | undefined;
    if (legacy?.text) compliments.push({ from, to: legacy.to, text: legacy.text });
    const cmap = data._compliments as Record<string, string> | undefined;
    if (cmap)
      for (const [to, text] of Object.entries(cmap))
        if (text?.trim()) compliments.push({ from, to: Number(to), text });
    const smap = data._peerSuggestions as Record<string, string> | undefined;
    if (smap)
      for (const [to, text] of Object.entries(smap))
        if (text?.trim()) peerSuggestions.push({ from, to: Number(to), text });
    if (typeof data._toTeacher === "string" && data._toTeacher)
      toTeacher.push({ from, text: data._toTeacher });
  });

  // 3) 모둠 간: 모둠별 득점 합 → Dense Ranking → 순위 점수
  const groupScore: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  voteSnap.forEach((entry) => {
    for (const [gId, v] of Object.entries(entry.data())) {
      if (typeof v === "number" && groupScore[Number(gId)] !== undefined)
        groupScore[Number(gId)] += v;
    }
  });
  const rankPoint = (rank: number) =>
    settings.rankPoints[rank - 1] ?? settings.rankPoints[settings.rankPoints.length - 1] ?? 0;

  // 순위 산정: 모둠 간 평가 표가 있으면 Dense Ranking, 없으면(현행) 교사가 고른
  // '오늘의 모둠'만 1위 → 나머지 모둠은 순위 점수 0. (모둠 간 평가 폐지 반영)
  const bestGroupId = bestSnap.exists()
    ? (bestSnap.data() as Record<string, { groupId: number } | undefined>)[date]?.groupId
    : undefined;
  const ranks: Record<number, number> = !voteSnap.empty
    ? denseRank(groupScore)
    : bestGroupId
      ? { [bestGroupId]: 1 }
      : {};

  // 4) 해당 날짜의 자리표에서 모둠 소속 확인 → 모둠원 전원 동일 순위 점수
  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const groupOfStudent: Record<number, number> = {};
  for (const g of schedule.groups) {
    groupOfStudent[g.chair] = g.groupId;
    for (const m of g.members) groupOfStudent[m.studentId] = g.groupId;
  }

  // 5) 학생별 행 구성 (기존 보너스는 유지)
  const prevRows = (prevSnap.exists() ? prevSnap.data() : {}) as Record<
    string,
    DailyScoreRow | unknown
  >;
  const rows: Record<number, DailyScoreRow> = {};
  for (const s of students) {
    const prevRow = prevRows[String(s.id)] as DailyScoreRow | undefined;
    const p = peer[s.id] ?? 0;
    // 순위에 든 모둠 소속이면 그 순위 점수, 아니면 0 (미평가 그룹은 가점 없음)
    const myRank = ranks[groupOfStudent[s.id]];
    const gr = myRank ? rankPoint(myRank) : 0;
    const bonus = prevRow?.bonus ?? 0;
    rows[s.id] = { peer: p, groupRank: gr, bonus, total: p + gr + bonus };
  }

  // 5-1) 모둠별 MVP: 각 모둠에서 최다 득표(1표 이상, 동점 모두)
  const mvpWinners: number[] = [];
  for (const g of schedule.groups) {
    const ids = [g.chair, ...g.members.map((m) => m.studentId)];
    const max = Math.max(0, ...ids.map((id) => mvpVotes[id] ?? 0));
    if (max > 0) mvpWinners.push(...ids.filter((id) => (mvpVotes[id] ?? 0) === max));
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
        groupScore,
        ranks,
        mvpVotes,
        mvpWinners,
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
    voterCount: voteSnap.size,
    groupRanks: ranks,
  };
}

// ── 격주 MVP 정산 (인수인계 §5.7: 2주 누적 상위 5명, 동점 포함, 실버 1개) ──
export interface BiweeklyResult {
  period: number;
  range: [string, string];
  sums: Record<number, number>;
  mvps: number[];
  alreadySettled: boolean;
}

/** 주차 → 격주 기간 번호 (1~11) */
export function periodOfWeek(week: number): number {
  return Math.floor((week - 1) / 2) + 1;
}

function dateRangeOfPeriod(period: number): [string, string] {
  const first = scheduleOfWeek(period * 2 - 1).weekStart;
  const lastWeek = Math.min(period * 2, TOTAL_WEEKS);
  const end = new Date(scheduleOfWeek(lastWeek).weekStart + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  return [first, end.toISOString().slice(0, 10)];
}

/**
 * 격주 정산: 기간 내 일일 집계 문서(최대 14개)를 합산해 MVP 선정 + 실버 1개 지급.
 * 같은 기간을 두 번 정산하면 alreadySettled=true로 반환하고 지급하지 않는다.
 */
export async function settleBiweekly(period: number): Promise<BiweeklyResult> {
  const d = db();
  const [start, end] = dateRangeOfPeriod(period);

  const existing = await getDoc(doc(d, "biweeklyScores", String(period)));
  if (existing.exists() && existing.data().awardedAt) {
    const data = existing.data();
    return {
      period,
      range: [start, end],
      sums: data.sums ?? {},
      mvps: data.mvps ?? [],
      alreadySettled: true,
    };
  }

  // 기간 내 일일 집계 문서 범위 조회 (_cumulative는 "_"라 범위 밖)
  const snap = await getDocs(
    query(
      collection(d, "dailyScores"),
      where(documentId(), ">=", start),
      where(documentId(), "<=", end)
    )
  );
  const sums: Record<number, number> = {};
  snap.forEach((day) => {
    for (const s of students) {
      const row = day.data()[String(s.id)] as DailyScoreRow | undefined;
      if (row) sums[s.id] = (sums[s.id] ?? 0) + row.total;
    }
  });

  // 상위 5명 (동점자 모두 포함)
  const sorted = Object.entries(sums).sort((a, b) => b[1] - a[1]);
  const cutoff = sorted[4]?.[1];
  const mvps =
    cutoff === undefined
      ? sorted.map(([sid]) => Number(sid))
      : sorted.filter(([, v]) => v >= cutoff).map(([sid]) => Number(sid));

  // 지급: 실버 1개씩 (원장 + 잔액)
  for (const sid of mvps) {
    await addDoc(collection(d, "coinTxns"), {
      studentId: sid,
      amount: 1,
      item: `격주 MVP (${period}기간)`,
      type: "mvp",
      status: "approved",
      createdAt: Date.now(),
    });
  }
  if (mvps.length) {
    await setDoc(
      doc(d, "coinTxns", "0_balances"),
      Object.fromEntries(mvps.map((sid) => [sid, increment(1)])),
      { merge: true }
    );
  }
  await setDoc(doc(d, "biweeklyScores", String(period)), {
    sums,
    mvps,
    range: [start, end],
    awardedAt: Date.now(),
  });

  return { period, range: [start, end], sums, mvps, alreadySettled: false };
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
    total: prevRow.peer + prevRow.groupRank + bonus,
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
