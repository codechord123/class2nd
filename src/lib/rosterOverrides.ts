"use client";
// classData/roster 오버라이드 로더 — 세션당 1회 읽어 정적 명단에 덧입힌다 (읽기 1회).
// 실패(미로그인·오프라인)해도 기본 명단으로 동작하므로 조용히 넘어간다.
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { applyRosterOverrides, type RosterOverrides } from "@/lib/roster";

let loaded = false;

export async function ensureRosterOverrides(): Promise<void> {
  if (loaded) return;
  try {
    const snap = await getDoc(doc(db(), "classData", "roster"));
    if (snap.exists()) applyRosterOverrides(snap.data() as RosterOverrides);
    loaded = true;
  } catch {
    // 다음 기회(재로그인 등)에 다시 시도
  }
}

/** 교사가 오버라이드를 저장한 직후 즉시 재적용할 때 사용 */
export function markRosterDirty(): void {
  loaded = false;
}
