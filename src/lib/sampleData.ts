"use client";
// 샘플 평가 데이터 생성/삭제 — 개학 전 리포트·집계 화면을 실제 모습으로 미리보기.
// 생성: 오늘 날짜의 evaluations 25건 + 모둠 순위 저장 + 즉시 집계.
// 삭제: 해당 날짜 평가 전부 삭제 + 순위 제거 + 재집계(멱등이라 누적도 원상복구).
import { collection, deleteDoc, deleteField, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students } from "@/lib/roster";
import { scheduleOfWeek, SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { weekOfDate } from "@/lib/date";
import { aggregateDate } from "@/lib/aggregate";
import type { ClassSettings } from "@/types";

const COMPLIMENTS = [
  "발표할 때 목소리가 또렷해서 좋았어!",
  "내가 어려워할 때 먼저 도와줘서 고마워",
  "청소를 끝까지 열심히 해줬어",
  "모둠 활동에서 아이디어를 많이 냈어",
  "친구 이야기를 잘 들어줘서 멋져",
  "준비물을 빌려줘서 고마웠어",
  "웃으면서 인사해줘서 기분이 좋았어",
];
const SUGGESTIONS = [
  "숙제를 미리미리 하면 좋을 것 같아",
  "목소리를 조금만 줄여주면 좋겠어",
  "정리할 때 같이 하면 좋겠어",
  "차례를 지켜주면 좋을 것 같아",
];
const WISHES = [
  "체육 시간이 더 있었으면 좋겠어요",
  "자리를 바꾸고 싶어요",
  "보드게임 시간을 만들어주세요",
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export interface SampleResult {
  entries: number;
  ranking: number[];
}

/** 오늘 날짜로 25명 전원 샘플 평가 생성 + 순위 저장 + 집계까지 한 번에 */
export async function generateSampleDay(
  date: string,
  settings: ClassSettings
): Promise<SampleResult> {
  const d = db();
  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  const schedule = scheduleOfWeek(week);
  const scale = settings.peerScale.length ? settings.peerScale : [0, 1];

  for (const g of schedule.groups) {
    const ids = [g.chair, ...g.members.map((m) => m.studentId)];
    for (const me of ids) {
      const targets = ids.filter((t) => t !== me);
      const entry: Record<string, unknown> = {};
      for (const t of targets) entry[t] = pick(scale);
      entry._mvp = pick(targets);
      entry._compliments = { [pick(targets)]: pick(COMPLIMENTS) };
      if (Math.random() < 0.6) entry._peerSuggestions = { [pick(targets)]: pick(SUGGESTIONS) };
      if (Math.random() < 0.35) entry._toTeacher = pick(WISHES);
      await setDoc(doc(d, "evaluations", date, "entries", String(me)), entry);
    }
  }

  // 모둠 순위 샘플 (무작위 셔플)
  const ranking = [1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  const chairId = schedule.groups.find((g) => g.groupId === ranking[0])?.chair ?? 0;
  await setDoc(
    doc(d, "classData", "bestGroups"),
    { [date]: { groupId: ranking[0], chairId, ranking } },
    { merge: true }
  );

  await aggregateDate(date, settings);
  return { entries: students.length, ranking };
}

/** 샘플 삭제 — 평가 전부 삭제 + 순위 제거 + 재집계(누적 점수 원상복구) */
export async function clearSampleDay(date: string, settings: ClassSettings): Promise<number> {
  const d = db();
  const snap = await getDocs(collection(d, "evaluations", date, "entries"));
  for (const entry of snap.docs) {
    await deleteDoc(doc(d, "evaluations", date, "entries", entry.id));
  }
  await setDoc(doc(d, "classData", "bestGroups"), { [date]: deleteField() }, { merge: true });
  await aggregateDate(date, settings); // 빈 평가로 재집계 → 그날 0점, 누적 자동 보정
  return snap.size;
}
