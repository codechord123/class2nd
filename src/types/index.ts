// ── 학생/학급 기본 ──────────────────────────────────────────────
export type Gender = "M" | "F";

export interface Student {
  id: number; // 1~25 (출석번호)
  name: string;
  gender: Gender;
  isChair: boolean; // 의장 여부 (학기초 고정 5명)
  chairOfGroup?: number; // 의장일 경우 담당 모둠 (1~5)
  isWildcard?: boolean;
}

// ── 자리배치 (정적 JSON: data/static/schedules-21w.json) ────────
export type RoleKey = "소통" | "질서" | "학습" | "건강" | "행정";

export interface GroupMember {
  studentId: number;
  role: RoleKey;
}

export interface GroupAssignment {
  groupId: number; // 1~5
  chair: number; // 의장 studentId
  members: GroupMember[]; // 위원 4명
}

export interface WeekSchedule {
  week: number; // 1~21
  weekStart: string; // "YYYY-MM-DD" (월요일)
  groups: GroupAssignment[];
}

// ── 평가 (Firestore) ────────────────────────────────────────────
/** 모둠 내 상호평가: evaluations/{date}/{evaluatorId} */
export type PeerEvaluation = Record<number, number>; // targetId → 점수(척도는 설정값)

/** 서버 사전집계 결과: dailyScores/{date} 문서 하나에 학생 전원 */
export interface DailyScoreRow {
  peer: number; // 모둠 내 받은 점수 합
  groupRank: number; // 오늘의 모둠 순위 → 개인 점수
  bonus: number; // 교사 보너스
  mission?: number; // 모둠 칭찬 미션(전원 칭찬받기) 달성 시 +1
  mvp?: number; // 점수 MVP 보상 — 그날 기본 점수 모둠 1위 +1 · 학급 1위 +2 추가 (동점 모두)
  read?: number; // 그날 감상문 편수만큼 +1씩 (쓴 만큼 — 독서 자동 가점)
  total: number;
}
export type DailyScores = Record<number, DailyScoreRow>; // studentId → row

// ── 교사 설정 (Firestore: classData/settings — 소량 단일 문서) ──
export interface ClassSettings {
  /** 모둠 내 평가 척도 (기본 [-1, 0, 1]) — 교사가 설정에서 수정 */
  peerScale: number[];
  /** 모둠 간 평가 척도 (기본 [-1, 0, 1]) */
  groupScale: number[];
  /** 모둠 간 Dense Ranking → 개인 점수표 (기본 1위 5 … 5위 1) */
  rankPoints: number[];
  /** 거북이 독서 주간 의무 권수 (기본 3) */
  weeklyReadingQuota: number;
  /** 자리 변경 비용 (실버, 기본 1) */
  seatChangeCost: number;
  /** 거북이 마라톤 학급 목표 권수 */
  readingGoal: number;
  /** 감상문 정식 등록 최소 글자수 (장면+인용+줄거리+느낀점 합산) */
  readingCharLimit: number;
  /** 학기 시작일 (주차 자동 계산 기준) */
  semesterStart: string; // "2026-08-17"
  semesterEnd: string; // "2027-01-08"
  /** 토큰(실버/골드) 사용 신청을 받는 시각(KST, 0~24). 기본 오후 4시~자정. */
  requestOpenHour: number;
  requestCloseHour: number;
}

export const DEFAULT_SETTINGS: ClassSettings = {
  peerScale: [-1, 0, 1],
  groupScale: [-1, 0, 1],
  rankPoints: [5, 4, 3, 2, 1],
  weeklyReadingQuota: 3,
  seatChangeCost: 1,
  readingGoal: 1250,
  readingCharLimit: 700,
  semesterStart: "2026-08-17",
  semesterEnd: "2027-01-08",
  requestOpenHour: 16,
  requestCloseHour: 24,
};

// ── 1학기 이월 지갑 (정적 JSON — 별도 지갑 방식) ────────────────
export interface S1WalletStudent {
  id: number;
  name: string;
  /** 이월 실버 잔액 — 2학기에서 "1학기 이월분" 지갑으로만 사용 가능 */
  silverRemaining: number;
  // 이하 표시 전용 (2학기 연산과 격리)
  silverEarnedS1: number;
  silverUsedS1: number;
  cumulativeScoreS1: number;
  booksReadS1: number;
}

export interface S1Wallet {
  meta: {
    note: string;
    source: string;
    carryoverField: string;
    carryoverPolicy: string;
  };
  students: S1WalletStudent[];
  classGold: { remaining: number; note: string };
}

// ── 1학기 거북이 독서 백업 (정적 JSON — 표시 전용) ──────────────
export interface S1ReadingReport {
  docId: string;
  id: number;
  title: string;
  author: string;
  publisher: string;
  summary: string;
  thoughts: string;
  scene: string;
  quote: string;
  date: string;
  studentId: number;
  studentName: string;
  isAnonymous: boolean;
}

export interface S1TurtleReading {
  meta: { exportedAt: string; note: string };
  students: { id: number; name: string }[];
  readingReports: S1ReadingReport[];
  booksRead: {
    mainState: Record<string, number>;
    sharedRecords: Record<string, number>;
  };
}
