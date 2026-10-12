// 💌 "이 아이에게 편지 쓰기"로 건너갈 때 받는 사람·첫 문장을 들고 가는 쪽지.
// 감정 패널(교사 '일지·감정' 탭)·마음 담벼락(/us)에서 누르면 편지 패널(교사 '오늘' 탭)이 열리며
// 그 학생이 골라진 채 이모티콘이 담긴 첫 문장이 채워진다 (2026-10-12 사용자 요청).
// 탭 전환은 같은 페이지 안, 담벼락에서는 클라이언트 이동이라 모듈 변수로 충분하지만
// 새로고침에도 살아남도록 sessionStorage에도 둔다 (막힌 기기는 조용히 모듈 변수만).
import { MOOD_FACES, MOOD_LABELS } from "@/lib/query/mood";

export interface LetterIntent {
  sid: number;
  text: string;
}

const KEY = "class2nd-letter-intent";
let pending: LetterIntent | null = null;

export function setLetterIntent(i: LetterIntent) {
  pending = i;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(i));
  } catch {}
}

export function peekLetterIntent(): LetterIntent | null {
  if (pending) return pending;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LetterIntent) : null;
  } catch {
    return null;
  }
}

export function clearLetterIntent() {
  pending = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

/** 오늘 고른 기분(0~5)으로 편지 첫머리 — 선생님이 이어 쓰거나 고쳐 쓴다 */
export function moodLetterText(v: number): string {
  // 라벨이 전부 'ㅁ' 받침(나쁨·그저 그럼·좋음…)이라 '이었구나'가 자연스럽다
  const head = `${MOOD_FACES[v]} 오늘 기분이 '${MOOD_LABELS[v]}'이었구나.\n`;
  if (v <= 1) return head + "선생님이 많이 마음이 쓰여. 무슨 일이 있었는지 편하게 이야기해 줄래? 언제든 기다릴게.";
  if (v <= 2) return head + "오늘 하루가 조금 힘들었니? 선생님한테 이야기하고 싶은 게 있으면 언제든 답장해 줘.";
  if (v === 3) return head + "오늘 하루는 어땠는지 궁금하다. ";
  return head + "좋은 일이 있었나 보네! 선생님도 덩달아 기분이 좋아. 무슨 일이었는지 알려 줄래?";
}

/** 마음 담벼락 카드(감정 단어)로 편지 첫머리 */
export function wordLetterText(word: string): string {
  // 감정 단어는 전부 '~요'로 끝나서(설레요·지쳐요…) '라고'가 맞다
  return `오늘 마음 담벼락에 "${word}"라고 남긴 걸 봤어.\n`;
}
