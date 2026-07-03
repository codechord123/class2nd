// 일일 점수 집계 — 교사 세션에서 실행 (Admin SDK/서비스 계정 불필요).
// 원시 평가를 읽는 유일한 코드 경로: 하루 최대 50문서(평가 25 + 모둠투표 25)를
// 교사만 1회 읽고, 결과는 dailyScores/{date} 문서 하나로 저장한다.
// 학생들은 이 결과 문서만 읽으므로 읽기 폭증이 구조적으로 불가능하다.
// 재집계해도 누적이 어긋나지 않도록 이전 집계분을 빼고 더한다(멱등).
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
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
  const [evalSnap, voteSnap, prevSnap, cumSnap] = await Promise.all([
    getDocs(collection(d, "evaluations", date, "entries")),
    getDocs(collection(d, "groupVotes", date, "entries")),
    getDoc(doc(d, "dailyScores", date)), // 재집계 시 이전분 차감용
    getDoc(doc(d, "dailyScores", "_cumulative")),
  ]);

  // 2) 모둠 내 점수: 받은 평가 합 (+ MVP 득표 집계)
  //    "_"로 시작하는 키는 점수가 아닌 부가 필드(_mvp, _compliment)
  const peer: Record<number, number> = {};
  const mvpVotes: Record<number, number> = {};
  evalSnap.forEach((entry) => {
    const data = entry.data();
    for (const [targetId, v] of Object.entries(data)) {
      if (targetId.startsWith("_")) continue;
      if (typeof v === "number") peer[Number(targetId)] = (peer[Number(targetId)] ?? 0) + v;
    }
    if (typeof data._mvp === "number") mvpVotes[data._mvp] = (mvpVotes[data._mvp] ?? 0) + 1;
  });

  // 3) 모둠 간: 모둠별 득점 합 → Dense Ranking → 순위 점수
  const groupScore: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  voteSnap.forEach((entry) => {
    for (const [gId, v] of Object.entries(entry.data())) {
      if (typeof v === "number" && groupScore[Number(gId)] !== undefined)
        groupScore[Number(gId)] += v;
    }
  });
  const ranks = denseRank(groupScore);
  const rankPoint = (rank: number) =>
    settings.rankPoints[rank - 1] ?? settings.rankPoints[settings.rankPoints.length - 1] ?? 0;

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
    const gr = rankPoint(ranks[groupOfStudent[s.id]] ?? Object.keys(ranks).length);
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
      _meta: { aggregatedAt: Date.now(), groupScore, ranks, mvpVotes, mvpWinners },
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
