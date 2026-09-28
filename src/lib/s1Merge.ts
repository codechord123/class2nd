// 💰 1학기 이월 실버 → 2학기 지갑 합치기 (1회성).
//
// 왜 합치는가: 지갑이 둘이라 상점에서 "어느 실버로 살까"를 매번 골라야 했고,
//   무엇보다 이월분에는 저축 이자가 붙지 않아 같은 실버인데 대우가 달랐다.
//   (2026-09-28 사용자 확정 — CLAUDE.md의 '이월은 절대 합산하지 않음' 규칙을 대체)
//
// ⚠️ 회수 불가 시스템에서 최악의 사고는 '이중 실행 = 재화 복제'다. 그래서
//   · 마커(classData/s1Merge)를 트랜잭션으로 선점해 딱 한 번만 실행되게 하고
//   · 학생별 이관액을 마커에 남겨 그대로 되돌릴 수 있게 한다.
//
// 📌 silverEarned(= 실버 25개 → 골드 1개 적립 재료)에는 넣지 않는다.
//   이 실버는 1학기에 이미 번 것이라 여기서 또 세면 골드가 부풀어 오른다.
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students } from "@/lib/roster";
import { getS1WalletOf } from "@/lib/staticData";

const MARKER = "s1Merge";

export interface S1MergeState {
  done: boolean;
  at?: number;
  amounts?: Record<string, number>; // 학생번호 → 이관한 실버
  total?: number;
}

/** 합치기가 이미 끝났는지 + 그때 얼마를 옮겼는지 */
export async function readS1MergeState(): Promise<S1MergeState> {
  const snap = await getDoc(doc(db(), "classData", MARKER));
  if (!snap.exists()) return { done: false };
  const d = snap.data() as Partial<S1MergeState>;
  return {
    done: !!d.done,
    at: typeof d.at === "number" ? d.at : undefined,
    amounts: (d.amounts ?? {}) as Record<string, number>,
    total: typeof d.total === "number" ? d.total : undefined,
  };
}

/** 합치기 전 미리보기 — 지금 옮기면 누가 몇 개를 받는지 (쓰기 없음) */
export async function previewS1Merge(): Promise<{ amounts: Record<string, number>; total: number }> {
  const usedSnap = await getDoc(doc(db(), "s1Spends", "0_balances"));
  const used = (usedSnap.exists() ? usedSnap.data() : {}) as Record<string, number>;
  const amounts: Record<string, number> = {};
  let total = 0;
  for (const s of students) {
    // 전출 학생도 기록은 남기되 지갑은 옮기지 않는다 (쓸 사람이 없다)
    if (s.inactive) continue;
    const left = (getS1WalletOf(s.id)?.silverRemaining ?? 0) - (Number(used[String(s.id)]) || 0);
    if (left > 0) {
      amounts[String(s.id)] = left;
      total += left;
    }
  }
  return { amounts, total };
}

/** 실행 — 마커 선점 → 원장 기록 → 2학기 잔액 +, 1학기 사용량 +(= 잔여 0) */
export async function runS1Merge(): Promise<{ amounts: Record<string, number>; total: number }> {
  const d = db();
  const markerRef = doc(d, "classData", MARKER);
  const { amounts, total } = await previewS1Merge();
  if (total <= 0) throw new Error("옮길 이월 실버가 없어요.");

  // ① 선점 — 지급 '전'에 마커부터. 두 탭에서 동시에 눌러도 한쪽만 실행된다.
  const claimed = await runTransaction(d, async (tx) => {
    const snap = await tx.get(markerRef);
    if (snap.exists() && snap.data().done) return false;
    tx.set(markerRef, { done: true, at: Date.now(), amounts, total });
    return true;
  });
  if (!claimed) throw new Error("이미 합치기가 끝났어요 (이중 지급 방지).");

  // ② 원장 — 아이가 내역에서 '1학기에 모은 몫'임을 알아보게 별도 줄로 남긴다
  for (const [sid, n] of Object.entries(amounts)) {
    await addDoc(collection(d, "coinTxns"), {
      studentId: Number(sid),
      amount: n,
      item: `💰 1학기 이월 실버 ${n}개`,
      type: "earn",
      status: "approved",
      createdAt: Date.now(),
    });
  }
  // ③ 2학기 잔액 +
  await setDoc(
    doc(d, "coinTxns", "0_balances"),
    Object.fromEntries(Object.entries(amounts).map(([sid, n]) => [sid, increment(n)])),
    { merge: true }
  );
  // ④ 1학기 사용량 + → 잔여 0 (원본 정적 JSON은 그대로라 1학기 기록은 보존)
  await setDoc(
    doc(d, "s1Spends", "0_balances"),
    Object.fromEntries(Object.entries(amounts).map(([sid, n]) => [sid, increment(n)])),
    { merge: true }
  );
  return { amounts, total };
}

/** 되돌리기 — 마커에 적힌 이관액을 그대로 역연산 (잘못 눌렀을 때의 안전망) */
export async function undoS1Merge(): Promise<number> {
  const d = db();
  const markerRef = doc(d, "classData", MARKER);
  const state = await readS1MergeState();
  if (!state.done || !state.amounts || !Object.keys(state.amounts).length)
    throw new Error("되돌릴 합치기 기록이 없어요.");
  const amounts = state.amounts;

  await setDoc(
    doc(d, "coinTxns", "0_balances"),
    Object.fromEntries(Object.entries(amounts).map(([sid, n]) => [sid, increment(-n)])),
    { merge: true }
  );
  await setDoc(
    doc(d, "s1Spends", "0_balances"),
    Object.fromEntries(Object.entries(amounts).map(([sid, n]) => [sid, increment(-n)])),
    { merge: true }
  );
  for (const [sid, n] of Object.entries(amounts)) {
    await addDoc(collection(d, "coinTxns"), {
      studentId: Number(sid),
      amount: -n,
      item: `↩️ 1학기 이월 합치기 취소 ${n}개`,
      type: "earn",
      status: "approved",
      createdAt: Date.now(),
    });
  }
  await setDoc(markerRef, { done: false, undoneAt: Date.now() }, { merge: true });
  return Object.values(amounts).reduce((a, b) => a + b, 0);
}
