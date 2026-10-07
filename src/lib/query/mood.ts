"use client";
// 🙂 감정 체크 — 매일 모둠활동 때 아이가 자기 기분을 0~5로 남기고, 교사가 추이를 본다.
//
// 저장 위치가 이 기능의 핵심 설계다:
//  ① 학생 자기보고 → evaluations/{날짜}/entries/{본인}._mood
//     이미 매일 쓰는 자기 문서라 추가 읽기 0·새 규칙 0이고, 각자 자기 문서라 25명이
//     동시에 눌러도 쓰기 경합이 없다. 규칙상 '본인+교사'만 읽으므로 프라이버시도 그대로.
//  ② 추이·교사 관찰 → moodHistory/main (교사 전용 컬렉션)
//     ⚠️ classData·dailyScores는 학생도 읽을 수 있어(read: isAuthed) 거기 모아두면
//        서로의 기분이 노출된다. "쟤 또 0이래"가 생기면 정서 기록이 상처가 된다.
//        그래서 교사만 읽는 새 컬렉션을 따로 둔다(규칙 게시 필요).
//
// 🚫 기분은 점수·할 일 완주에 절대 반영하지 않는다 — 0을 고르면 손해라는 신호가
//    조금이라도 있으면 아이들이 솔직하게 고르지 못하고, 그 순간 데이터가 거짓이 된다.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { bumpWeather, writeMoodSelf } from "@/lib/query/moodShare";

/** 0=매우 나쁨 … 5=매우 좋음. 5학년에겐 숫자보다 얼굴이 직관적이다.
 *  (구형 Windows에서 깨지는 U+1FA70 이상 이모지는 쓰지 않는다 — 전부 안전 범위) */
export const MOOD_FACES = ["😭", "😢", "😕", "🙂", "😄", "🤩"] as const;
export const MOOD_LABELS = ["매우 나쁨", "나쁨", "그저 그럼", "괜찮음", "좋음", "매우 좋음"] as const;
export const MOOD_MIN = 0;
export const MOOD_MAX = 5;
/** 이 값 이하가 이어지면 '살펴볼 친구'로 올린다 — 단일 값은 장난일 수 있고, 신호는 '연속'이다 */
export const LOW_THRESHOLD = 2;
export const LOW_STREAK_DAYS = 3;

export interface TeacherMoodNote {
  v: number | null; // 교사 관찰 점수 (선택 — 적지 않을 수도 있다)
  note?: string;
}

export interface MoodHistory {
  /** 학생 자기보고: { "2026-10-07": { "3": 4 } } — 집계가 채운다 */
  byDate: Record<string, Record<string, number>>;
  /** 교사 관찰(선택): { "2026-10-07": { "3": { v: 2, note: "…" } } } */
  teacher: Record<string, Record<string, TeacherMoodNote>>;
}

const EMPTY: MoodHistory = { byDate: {}, teacher: {} };

export function useMoodHistory(enabled: boolean) {
  return useQuery({
    queryKey: ["moodHistory"],
    enabled,
    queryFn: async (): Promise<MoodHistory> => {
      const snap = await getDoc(doc(db(), "moodHistory", "main"));
      if (!snap.exists()) return EMPTY;
      const d = snap.data() as Partial<MoodHistory>;
      return {
        byDate: d.byDate && typeof d.byDate === "object" ? d.byDate : {},
        teacher: d.teacher && typeof d.teacher === "object" ? d.teacher : {},
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** 학생: 내 기분 저장 — 내 평가 문서에 _mood만 얹는다 (추가 읽기 0) */
export function useSaveMood(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (mood: number) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (mood < MOOD_MIN || mood > MOOD_MAX) throw new Error("기분은 0~5 사이예요.");
    const prevRec = qc.getQueryData(["evaluation", date, myId]) as Record<string, unknown> | undefined;
    const prev = typeof prevRec?._mood === "number" ? (prevRec._mood as number) : null;
    await setDoc(
      doc(db(), "evaluations", date, "entries", String(myId)),
      { _mood: mood },
      { merge: true }
    );
    qc.setQueryData(["evaluation", date, myId], (prev: Record<string, unknown> | undefined) => ({
      ...(prev ?? {}),
      _mood: mood,
    }));
    // 🌈 나와 우리: 반 날씨엔 '이름 없이 개수만', 내 달력엔 나만 보이게 — 둘 다 실패해도 기분 저장은 유효
    void bumpWeather(date, prev, mood);
    void writeMoodSelf(myId, date, { v: mood }, qc);
  };
}

/** 교사 관찰 — 매번 하는 게 아니라 '필요할 때만' 남긴다 (사용자 확정 2026-10-07) */
export function useSaveTeacherMood() {
  const qc = useQueryClient();
  return async (date: string, studentId: number, v: number | null, note = "") => {
    // ⚠️ setDoc에서 점(.)은 '경로'가 아니라 글자 그대로의 필드명이다 — `teacher.2026-10-07.1`
    //    같은 키를 주면 중첩이 아니라 그 이름의 납작한 필드가 생겨 되읽을 때 사라진다
    //    (E2E에서 '관찰값 불일치'로 잡힌 버그). 중첩 객체 + merge:true가 올바른 방법이며,
    //    merge는 맵을 깊게 합치므로 같은 날 다른 학생 기록도 보존된다.
    await setDoc(
      doc(db(), "moodHistory", "main"),
      { teacher: { [date]: { [String(studentId)]: { v, note: note.trim() } } } },
      { merge: true }
    );
    qc.setQueryData(["moodHistory"], (prev: MoodHistory | undefined) => {
      const base = prev ?? EMPTY;
      return {
        ...base,
        teacher: {
          ...base.teacher,
          [date]: { ...(base.teacher[date] ?? {}), [studentId]: { v, note: note.trim() } },
        },
      };
    });
  };
}

/** 최근 N일(기록이 있는 날만) 자기보고 — 오래된 것부터 */
export function recentMoods(
  h: MoodHistory | undefined,
  studentId: number,
  days = 30
): { date: string; v: number }[] {
  const out: { date: string; v: number }[] = [];
  for (const [date, row] of Object.entries(h?.byDate ?? {})) {
    const v = row?.[String(studentId)];
    if (typeof v === "number") out.push({ date, v });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(-days);
}

/** 연속 저조 일수 — 최근부터 거슬러 LOW_THRESHOLD 이하가 몇 번 이어졌나 */
export function lowStreak(h: MoodHistory | undefined, studentId: number): number {
  const all = recentMoods(h, studentId, 365);
  let n = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].v <= LOW_THRESHOLD) n++;
    else break;
  }
  return n;
}

/** 🔴 살펴볼 친구 — 오늘 저조하거나, 저조가 이어지는 아이 */
export function needsAttention(
  h: MoodHistory | undefined,
  ids: number[],
  today: string
): { id: number; today: number | null; streak: number }[] {
  return ids
    .map((id) => ({
      id,
      today: (h?.byDate?.[today]?.[String(id)] as number | undefined) ?? null,
      streak: lowStreak(h, id),
    }))
    .filter((x) => (x.today != null && x.today <= 1) || x.streak >= LOW_STREAK_DAYS)
    .sort((a, b) => b.streak - a.streak || (a.today ?? 9) - (b.today ?? 9));
}

/** 평균 — 그날 반 전체 분위기 한 줄 */
export function dayAverage(h: MoodHistory | undefined, date: string): number | null {
  const row = h?.byDate?.[date];
  const vals = Object.values(row ?? {}).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
