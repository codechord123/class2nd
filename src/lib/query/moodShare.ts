"use client";
// 🌈 나와 우리 — 사회정서학습(SEL). '감정 체크 0~5'(비공개 트래킹)와는 별개의 '나누는' 공간이다.
//
// 세 겹으로 나뉜다 — 공개 범위가 서로 다르다는 게 이 기능 설계의 전부다:
//  ① 🌤️ 우리 반 마음 날씨  moodShare/{날짜}.c0~c5   이름 없는 '개수'만. 누가 몇을 골랐는지는 없다.
//     (0~5를 고를 때 학생이 ±1씩 갱신하고, 교사 집계가 실제 값으로 다시 맞춘다 — 자가 치유)
//  ② 💗 마음 담벼락        moodShare/{날짜}/cards/{학생}  원하는 아이만, 감정 '단어'로 나눈다.
//     반응은 정해진 공감 4종뿐(댓글 없음) — 상처 주는 말이 끼어들 구조를 처음부터 없앤다.
//     그날 카드만 보인다 — 어제의 '슬퍼요'가 쌓여 낙인이 되지 않게.
//  ③ 📅 나의 감정 달력     moodSelf/{학생}  본인+교사만. 내 기분(0~5)과 내가 고른 감정 단어.
//
// 🚫 어느 것도 점수·할 일 완주에 들어가지 않는다 — 보상이 붙으면 '점수 받으려고 쓰는 감정'이 된다.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students } from "@/lib/roster";

// ── 감정 단어 (예일대 RULER '무드미터' — 에너지 × 기분 4칸) ─────────────────────
// 5학년 눈높이의 말로. '좋다/나쁘다' 두 칸 대신 정확한 이름을 붙이는 힘이 SEL의 첫 단계다.
export type MoodColor = "red" | "yellow" | "blue" | "green";

export const MOOD_COLORS: {
  key: MoodColor;
  title: string;
  hint: string;
  words: string[];
  /** 칸 배경 / 단어 글자 / 점 색 — Tailwind 토큰 유틸 (구형 Windows에서 안 깨지게 색 원 이모지 대신 CSS 점) */
  tile: string;
  text: string;
  dot: string;
}[] = [
  {
    key: "red",
    title: "불끈불끈",
    hint: "에너지 높고 불편해요",
    words: ["화나요", "짜증나요", "걱정돼요", "긴장돼요", "억울해요", "답답해요"],
    tile: "bg-rose-50 ring-rose-200",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
  {
    key: "yellow",
    title: "두근두근",
    hint: "에너지 높고 즐거워요",
    words: ["신나요", "설레요", "뿌듯해요", "즐거워요", "자신 있어요", "기대돼요"],
    tile: "bg-amber-50 ring-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  {
    key: "blue",
    title: "축 처져요",
    hint: "에너지 낮고 불편해요",
    words: ["슬퍼요", "서운해요", "외로워요", "지쳐요", "실망했어요", "심심해요"],
    tile: "bg-sky-50 ring-sky-200",
    text: "text-sky-700",
    dot: "bg-sky-500",
  },
  {
    key: "green",
    title: "포근포근",
    hint: "에너지 낮고 편안해요",
    words: ["편안해요", "차분해요", "고마워요", "만족해요", "느긋해요", "안심돼요"],
    tile: "bg-emerald-50 ring-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
];
export const colorInfo = (c: MoodColor | undefined) =>
  MOOD_COLORS.find((m) => m.key === c) ?? MOOD_COLORS[3];

// ── 공감 반응 — 4종만. 부정적인 반응은 아예 없다 ─────────────────────────────
export type ReactionKey = "same" | "cheer" | "joy" | "up";
export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: "same", emoji: "💗", label: "나도 그래" },
  { key: "cheer", emoji: "💪", label: "힘내" },
  { key: "joy", emoji: "🎉", label: "같이 기뻐" },
  { key: "up", emoji: "👍", label: "응원해" },
];

export const NOTE_MAX = 40;
/** 날씨는 이만큼 모여야 보여준다 — 두세 명이면 '비 1'이 누군지 짐작된다 */
export const WEATHER_MIN = 5;

export interface MoodCard {
  sid: number;
  word: string;
  color: MoodColor;
  note: string;
  at: number;
  /** 반응: { [반응한 학생 번호]: 종류 } — 한 사람당 카드 하나에 반응 하나 */
  r: Record<string, ReactionKey>;
  /** 마지막으로 쓴 사람 (규칙이 '자기 번호만 바꿨는지' 대조하는 데 쓴다) */
  by: number;
  hidden?: boolean;
}

export interface Weather {
  counts: number[]; // 0~5 각 개수
  total: number;
}

export interface MoodSelf {
  /** { "2026-10-07": { v: 4, w: "신나요", c: "yellow" } } */
  byDate: Record<string, { v?: number; w?: string; c?: MoodColor }>;
}

// ── 🌤️ 마음 날씨 ─────────────────────────────────────────────────────────
export function useWeather(date: string, enabled = true) {
  return useQuery({
    queryKey: ["moodWeather", date],
    enabled,
    queryFn: async (): Promise<Weather> => {
      const snap = await getDoc(doc(db(), "moodShare", date));
      const d = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
      // 집계 전 ±1 경합으로 음수가 잠깐 생겨도 화면은 0으로 본다
      const counts = [0, 1, 2, 3, 4, 5].map((i) => Math.max(0, Number(d[`c${i}`] ?? 0) || 0));
      return { counts, total: counts.reduce((a, b) => a + b, 0) };
    },
    staleTime: 60 * 1000,
  });
}

/** 맑음(4~5) · 구름(2~3) · 비(0~1) — 개수는 숨기고 비율만 쓴다 */
export function weatherSplit(w: Weather | undefined) {
  const c = w?.counts ?? [0, 0, 0, 0, 0, 0];
  const total = w?.total ?? 0;
  const sun = c[4] + c[5];
  const cloud = c[2] + c[3];
  const rain = c[0] + c[1];
  const icon = !total ? "🌫️" : sun >= cloud && sun >= rain ? "☀️" : rain > sun && rain >= cloud ? "🌧️" : "⛅";
  const label = icon === "☀️" ? "맑음" : icon === "🌧️" ? "비" : icon === "⛅" ? "구름 조금" : "아직 몰라요";
  return { sun, cloud, rain, total, icon, label };
}

/** 내 기분(0~5)을 고르거나 바꿀 때 — 날씨 개수를 옮긴다(이전 -1, 새 값 +1).
 *  실패해도 조용히 넘어간다: 날씨는 '분위기'일 뿐이고 교사 집계가 정확한 값으로 다시 맞춘다. */
export async function bumpWeather(date: string, prev: number | null, next: number) {
  if (prev === next) return;
  const patch: Record<string, unknown> = { [`c${next}`]: increment(1) };
  if (prev != null) patch[`c${prev}`] = increment(-1);
  await setDoc(doc(db(), "moodShare", date), patch, { merge: true }).catch(() => {});
}

// ── 📅 나의 감정 달력 ───────────────────────────────────────────────────────
export function useMoodSelf(sid: number | null) {
  return useQuery({
    queryKey: ["moodSelf", sid],
    enabled: sid != null,
    queryFn: async (): Promise<MoodSelf> => {
      const snap = await getDoc(doc(db(), "moodSelf", String(sid)));
      const d = (snap.exists() ? snap.data() : {}) as Partial<MoodSelf>;
      return { byDate: d.byDate && typeof d.byDate === "object" ? d.byDate : {} };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** 내 달력에 한 칸 기록 — 중첩 객체 + merge (setDoc의 점 표기는 경로가 아니라 글자 그대로라서) */
export async function writeMoodSelf(
  sid: number,
  date: string,
  patch: { v?: number; w?: string; c?: MoodColor },
  qc?: ReturnType<typeof useQueryClient>
) {
  await setDoc(doc(db(), "moodSelf", String(sid)), { byDate: { [date]: patch } }, { merge: true }).catch(
    () => {}
  );
  qc?.setQueryData(["moodSelf", sid], (prev: MoodSelf | undefined) => {
    if (!prev) return prev; // 아직 안 읽었으면 다음에 읽을 때 서버 값으로
    return { byDate: { ...prev.byDate, [date]: { ...(prev.byDate[date] ?? {}), ...patch } } };
  });
}

// ── 💗 마음 담벼락 ─────────────────────────────────────────────────────────
const cardsKey = (date: string) => ["moodCards", date];

export function useMoodCards(date: string, enabled = true) {
  return useQuery({
    queryKey: cardsKey(date),
    enabled,
    queryFn: async (): Promise<MoodCard[]> => {
      const snap = await getDocs(collection(db(), "moodShare", date, "cards"));
      return snap.docs.map((x) => {
        const d = x.data() as Partial<MoodCard>;
        return {
          sid: Number(d.sid ?? x.id),
          word: String(d.word ?? ""),
          color: (d.color ?? "green") as MoodColor,
          note: String(d.note ?? ""),
          at: Number(d.at ?? 0),
          r: (d.r && typeof d.r === "object" ? d.r : {}) as Record<string, ReactionKey>,
          by: Number(d.by ?? d.sid ?? x.id),
          hidden: d.hidden === true,
        };
      });
    },
    // 담벼락은 '오늘'이 살아 움직이는 곳이라 짧게. 그래도 25장 이하 × 1분 캐시라 하루 수천 읽기 수준.
    staleTime: 60 * 1000,
  });
}

/** 카드 올리기/고치기 — 고치면 반응은 비운다('슬퍼요'에 단 '힘내'가 '신나요'에 남으면 어색하다) */
export function usePostCard(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (word: string, color: MoodColor, note: string) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    const card: MoodCard = {
      sid: myId,
      word,
      color,
      note: note.trim().slice(0, NOTE_MAX),
      at: Date.now(),
      r: {},
      by: myId,
    };
    await setDoc(doc(db(), "moodShare", date, "cards", String(myId)), card);
    qc.setQueryData(cardsKey(date), (prev: MoodCard[] | undefined) => [
      card,
      ...(prev ?? []).filter((c) => c.sid !== myId),
    ]);
    void writeMoodSelf(myId, date, { w: word, c: color }, qc);
  };
}

/** 공감 반응 — 같은 걸 다시 누르면 취소, 다른 걸 누르면 바꾼다 (한 사람당 하나) */
export function useReact(date: string, myId: number | null) {
  const qc = useQueryClient();
  return async (card: MoodCard, kind: ReactionKey) => {
    if (myId == null) throw new Error("로그인이 필요해요.");
    if (card.sid === myId) return;
    const me = String(myId);
    const off = card.r[me] === kind;
    // updateDoc은 점 표기가 '경로'다 (setDoc과 반대) — r.3 하나만 건드린다
    await updateDoc(doc(db(), "moodShare", date, "cards", String(card.sid)), {
      [`r.${me}`]: off ? deleteField() : kind,
      by: myId,
    });
    qc.setQueryData(cardsKey(date), (prev: MoodCard[] | undefined) =>
      (prev ?? []).map((c) => {
        if (c.sid !== card.sid) return c;
        const r = { ...c.r };
        if (off) delete r[me];
        else r[me] = kind;
        return { ...c, r, by: myId };
      })
    );
  };
}

/** 내 카드 내리기(본인) / 지우기(교사) */
export function useDeleteCard(date: string) {
  const qc = useQueryClient();
  return async (sid: number) => {
    await deleteDoc(doc(db(), "moodShare", date, "cards", String(sid)));
    qc.setQueryData(cardsKey(date), (prev: MoodCard[] | undefined) =>
      (prev ?? []).filter((c) => c.sid !== sid)
    );
  };
}

/** 교사: 가리기/다시 보이기 — 지우지 않고 가려서 기록은 남긴다 */
export function useHideCard(date: string) {
  const qc = useQueryClient();
  return async (sid: number, hidden: boolean) => {
    await updateDoc(doc(db(), "moodShare", date, "cards", String(sid)), { hidden });
    qc.setQueryData(cardsKey(date), (prev: MoodCard[] | undefined) =>
      (prev ?? []).map((c) => (c.sid === sid ? { ...c, hidden } : c))
    );
  };
}

// ── 🛡️ 올리기 전 점검 — 공개 공간이라 '내 마음'만 남게 한다 ───────────────────
// 위험 신호는 공개하지 않고 선생님께 이어준다. 띄어쓰기를 지우고 대조한다("죽고 싶" = "죽고싶").
const RISK = ["죽고싶", "자살", "자해", "사라지고싶", "없어지고싶", "살기싫", "괴롭혀", "괴롭힘", "왕따", "때렸"];
const BAD = ["시발", "씨발", "ㅅㅂ", "병신", "ㅂㅅ", "개새", "꺼져", "닥쳐", "존나", "좆", "지랄", "미친"];

export type NoteCheck =
  | { ok: true }
  | { ok: false; kind: "risk" }
  | { ok: false; kind: "bad" }
  | { ok: false; kind: "name"; name: string };

export function checkNote(note: string, myId: number | null): NoteCheck {
  const t = note.replace(/\s+/g, "");
  if (!t) return { ok: true };
  if (RISK.some((w) => t.includes(w))) return { ok: false, kind: "risk" };
  if (BAD.some((w) => t.includes(w))) return { ok: false, kind: "bad" };
  // 친구 이름(성 포함 또는 이름 두 글자) — "○○ 때문에 짜증" 같은 공개 저격을 막는다
  for (const s of students) {
    if (s.id === myId || s.inactive) continue;
    const given = s.name.length >= 3 ? s.name.slice(-2) : s.name;
    if (t.includes(s.name) || t.includes(given)) return { ok: false, kind: "name", name: given };
  }
  return { ok: true };
}
