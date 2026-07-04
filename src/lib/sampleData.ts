"use client";
// 샘플 평가 데이터 생성/삭제 — 개학 전 리포트·집계 화면을 실제 모습으로 미리보기.
// 생성: 오늘 날짜의 evaluations 25건 + 감상문 몇 편(독서 +1점 미리보기) + 모둠 순위 저장 + 즉시 집계.
// 삭제: 해당 날짜 평가·샘플 감상문 전부 삭제 + 순위 제거 + 재집계(멱등이라 누적도 원상복구).
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
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

const SAMPLE_BOOKS = [
  { title: "마당을 나온 암탉", author: "황선미", tag: "동화" },
  { title: "샬롯의 거미줄", author: "E.B. 화이트", tag: "동화" },
  { title: "푸른 사자 와니니", author: "이현", tag: "동화" },
  { title: "어린이를 위한 과학 이야기", author: "김과학", tag: "과학" },
  { title: "장영실, 시대를 앞서간 발명가", author: "역사연구회", tag: "인물" },
  { title: "시가 좋아지는 시집", author: "여러 시인", tag: "시" },
];

export interface SampleResult {
  entries: number;
  reports: number;
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

  // 샘플 감상문: 무작위 8명이 그날 1권씩 — 집계의 독서 점수와 스트릭·리포트 미리보기용.
  // _sample 플래그로 표시해 지우기에서 진짜 감상문과 절대 섞이지 않게 한다.
  const dayStartMs = new Date(date + "T09:00:00+09:00").getTime();
  const readers = [...students].sort(() => Math.random() - 0.5).slice(0, 8);
  for (const s of readers) {
    const book = pick(SAMPLE_BOOKS);
    await addDoc(collection(d, "readingReports"), {
      studentId: s.id,
      week,
      isDraft: false,
      isPrivate: false,
      _sample: true,
      title: `(샘플) ${book.title}`,
      author: book.author,
      publisher: "",
      summary: "샘플 감상문이에요. 리포트·점수 미리보기용으로 자동 생성됐어요.",
      scene: "가장 인상 깊었던 장면을 여기에 써요.",
      quote: "기억에 남는 문장을 여기에 옮겨 적어요.",
      thoughts: "읽고 난 생각을 여기에 써요.",
      tags: [book.tag],
      createdAt: dayStartMs + Math.floor(Math.random() * 6 * 3600000), // 9시~15시 사이
    });
  }
  if (readers.length) {
    const statsPatch: Record<string, unknown> = {
      total: Object.fromEntries(readers.map((s) => [String(s.id), increment(1)])),
      byWeek: { [week]: Object.fromEntries(readers.map((s) => [String(s.id), increment(1)])) },
    };
    await setDoc(doc(d, "readingStats", "main"), statsPatch, { merge: true });
  }

  await aggregateDate(date, settings);
  return { entries: students.length, reports: readers.length, ranking };
}

/** 샘플 삭제 — 평가·샘플 감상문 전부 삭제 + 순위 제거 + 재집계(누적 점수 원상복구) */
export async function clearSampleDay(date: string, settings: ClassSettings): Promise<number> {
  const d = db();
  const snap = await getDocs(collection(d, "evaluations", date, "entries"));
  for (const entry of snap.docs) {
    await deleteDoc(doc(d, "evaluations", date, "entries", entry.id));
  }
  await setDoc(doc(d, "classData", "bestGroups"), { [date]: deleteField() }, { merge: true });

  // 그날 생성된 '샘플' 감상문만 삭제 (_sample 플래그) + 권수 통계 원상복구
  const dayStartMs = new Date(date + "T00:00:00+09:00").getTime();
  const repSnap = await getDocs(
    query(
      collection(d, "readingReports"),
      where("createdAt", ">=", dayStartMs),
      where("createdAt", "<", dayStartMs + 86400000)
    )
  );
  const samples = repSnap.docs.filter((r) => r.data()._sample === true);
  const week = weekOfDate(date, SEMESTER_START, TOTAL_WEEKS);
  for (const r of samples) {
    const sid = String(r.data().studentId);
    await deleteDoc(r.ref);
    await setDoc(
      doc(d, "readingStats", "main"),
      {
        total: { [sid]: increment(-1) },
        byWeek: { [week]: { [sid]: increment(-1) } },
      },
      { merge: true }
    );
  }

  await aggregateDate(date, settings); // 빈 평가로 재집계 → 그날 0점, 누적 자동 보정
  return snap.size + samples.length;
}
