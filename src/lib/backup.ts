"use client";
// 🗄 전체 백업 공용 로직 — 수동 버튼(BackupPanel)과 주간 자동 백업(교사 접속 트리거)이 공유.
//
// 자동 백업 설계: 서버가 없는 구조라 '금요일 밤 10시 정각' 크론은 불가 — 대신 autoRun처럼
// "금 22:00(KST)이 지난 뒤 첫 교사 접속"에 실행한다. 파일 자동 다운로드는 iOS 등에서
// 제스처 없이는 조용히 막힐 수 있어, 자동분은 이 기기의 IndexedDB에 저장(어디서든 확실)하고
// 파일로 내려받기는 패널 목록에서 버튼으로 한다 (제스처 → 모든 브라우저에서 안전).
// 비용: 1회 = 전 문서 읽기(학기말 ~3–5천 읽기, 무료 한도 5만/일의 10% 미만) — 주 1회 무부담.
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { todayKST } from "@/lib/date";

export const BACKUP_COLLECTIONS = [
  "readingReports", // 감상문 전문 (가장 소중한 원본)
  "readingDrafts",
  "readingStats",
  "suggestions", // 게시판 (건의·법률·숨은 기여·댓글)
  "polls",
  "coinTxns", // 상점 원장 + 잔액
  "s1Spends",
  "seatChangeRequests",
  "scoreAppeals",
  "menuRequests",
  "groupVotes",
  "dailyScores", // 일일 점수 + 누적
  "biweeklyScores", // 세션 정산 기록
  "classData", // 설정·순위·결석·법률 등
  "complimentCoverage",
  "resetRequests",
  "studentHints",
] as const;
// studentAuth(비밀번호 해시)는 담지 않는다 — 백업 파일 유출 표면 최소화 (보안 규칙)

export interface BackupPayload {
  app: "class2nd";
  exportedAt: string;
  note: string;
  docCount: number;
  data: Record<string, Record<string, unknown>>;
}

/** 전 컬렉션을 읽어 백업 페이로드를 만든다 (다운로드/저장은 호출부 선택) */
export async function collectBackup(
  onProgress?: (msg: string) => void
): Promise<BackupPayload> {
  const d = db();
  const out: Record<string, Record<string, unknown>> = {};
  let docs = 0;
  for (const [i, name] of BACKUP_COLLECTIONS.entries()) {
    onProgress?.(`${name} (${i + 1}/${BACKUP_COLLECTIONS.length})…`);
    const snap = await getDocs(collection(d, name));
    const bucket: Record<string, unknown> = {};
    snap.forEach((x) => {
      bucket[x.id] = x.data();
      docs++;
    });
    out[name] = bucket;
  }
  return {
    app: "class2nd",
    exportedAt: new Date().toISOString(),
    note: "studentAuth(비밀번호 해시)·evaluations 하위(원시 평가)는 의도적으로 제외",
    docCount: docs,
    data: out,
  };
}

/** 백업 파일 파싱 + 검증 — 다른 앱 JSON·깨진 파일을 조용히 쓰는 사고 방지 */
export function parseBackup(json: string): BackupPayload {
  let p: unknown;
  try {
    p = JSON.parse(json);
  } catch {
    throw new Error("JSON 파일이 아니거나 파일이 깨져 있어요.");
  }
  const b = p as Partial<BackupPayload>;
  if (b?.app !== "class2nd" || typeof b.data !== "object" || b.data == null)
    throw new Error("이 앱(class2nd)의 백업 파일이 아니에요.");
  return b as BackupPayload;
}

export interface RestoreResult {
  written: number;
  failed: string[]; // 실패한 컬렉션 (규칙 미게시 등)
}

/** 🛟 백업 복원 — 선택한 컬렉션의 문서를 같은 id로 다시 쓴다 (교사 전용).
 *  · 같은 id 문서는 백업 내용으로 통째로 덮어쓴다 (merge 아님 — 백업 시점 그대로)
 *  · 백업에 없는 '지금 있는' 문서는 지우지 않는다 — 복원 후 새로 쌓인 기록 보존
 *  · 컬렉션 단위 격리: 하나가 권한 오류여도 나머지는 계속 (초기화와 동일한 태도) */
export async function restoreBackup(
  payload: BackupPayload,
  collections: string[],
  onProgress?: (msg: string) => void
): Promise<RestoreResult> {
  const d = db();
  let written = 0;
  const failed: string[] = [];
  for (const name of collections) {
    const bucket = payload.data[name];
    if (!bucket) continue;
    const entries = Object.entries(bucket);
    onProgress?.(`${name} 복원 중… (${entries.length}개)`);
    try {
      // 25개씩 병렬 — 순차보다 수십 배 빠르고, 폭주는 방지
      for (let i = 0; i < entries.length; i += 25) {
        await Promise.all(
          entries
            .slice(i, i + 25)
            .map(([id, data]) => setDoc(doc(d, name, id), data as Record<string, unknown>))
        );
        written += Math.min(25, entries.length - i);
      }
    } catch {
      failed.push(name);
    }
  }
  return { written, failed };
}

/** 페이로드를 JSON 파일로 다운로드 (사용자 제스처 안에서 부르는 것을 권장) */
export function downloadBackup(payload: BackupPayload, label = ""): void {
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `class2nd-backup-${label || todayKST()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 이 기기 스냅샷 보관함 (IndexedDB) — 자동 백업의 저장처 ──────────────
const DB_NAME = "class2nd-backups";
const STORE = "snapshots";
const KEEP = 8; // 최근 8개(약 2달치)만 보관 — 기기 용량 보호

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB를 열 수 없어요"));
  });
}

export interface SnapshotMeta {
  key: string; // "2026-09-05" (저장일)
  savedAt: number;
  docCount: number;
  bytes: number;
}

/** 자동 백업 저장 — 같은 날짜 키는 덮어쓰고, KEEP개 초과분은 오래된 것부터 정리 */
export async function saveSnapshotToDevice(payload: BackupPayload): Promise<SnapshotMeta> {
  const idb = await openStore();
  const json = JSON.stringify(payload);
  const meta: SnapshotMeta = {
    key: todayKST(),
    savedAt: Date.now(),
    docCount: payload.docCount,
    bytes: json.length,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...meta, json });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("저장 실패"));
  });
  // 초과분 정리
  const all = await listSnapshots();
  const extra = all.slice(KEEP);
  if (extra.length) {
    await new Promise<void>((resolve) => {
      const tx = idb.transaction(STORE, "readwrite");
      for (const m of extra) tx.objectStore(STORE).delete(m.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // 정리 실패는 무시 (다음에 다시)
    });
  }
  idb.close();
  return meta;
}

/** 이 기기에 저장된 스냅샷 목록 (최신순) */
export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const idb = await openStore();
  const rows = await new Promise<SnapshotMeta[]>((resolve, reject) => {
    const req = idb.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as (SnapshotMeta & { json: string })[]).map(({ key, savedAt, docCount, bytes }) => ({
          key, savedAt, docCount, bytes,
        }))
      );
    req.onerror = () => reject(req.error ?? new Error("목록 조회 실패"));
  });
  idb.close();
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

/** 저장된 스냅샷을 파일로 내려받기 (버튼 제스처에서 호출) */
export async function downloadSnapshot(key: string): Promise<void> {
  const idb = await openStore();
  const row = await new Promise<{ json: string } | undefined>((resolve, reject) => {
    const req = idb.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as { json: string } | undefined);
    req.onerror = () => reject(req.error ?? new Error("읽기 실패"));
  });
  idb.close();
  if (!row) throw new Error("스냅샷을 찾을 수 없어요");
  const blob = new Blob([row.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `class2nd-backup-${key}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 주간 자동 백업 판정 — 금요일 22:00(KST) 이후 첫 접속 ──────────────
const MARKER = "class2nd-auto-backup-at"; // 이 기기 기준 (기기마다 보관 = 이중 안전)

/** 가장 최근에 지난 '금요일 22:00 KST'의 epoch ms */
export function lastFriday22(nowMs: number): number {
  // KST 기준 요일·시각 계산 (고정 +9h — KST는 DST 없음)
  const kst = new Date(nowMs + 9 * 3600_000);
  const dow = kst.getUTCDay(); // 0=일 … 5=금
  const past = new Date(kst);
  past.setUTCDate(kst.getUTCDate() - ((dow - 5 + 7) % 7));
  past.setUTCHours(22, 0, 0, 0);
  if (past.getTime() > kst.getTime()) past.setUTCDate(past.getUTCDate() - 7);
  return past.getTime() - 9 * 3600_000;
}

/** 이번 주 자동 백업이 아직이면 실행 — 완료 시 메타 반환, 아니면 null */
export async function runWeeklyAutoBackup(): Promise<SnapshotMeta | null> {
  const now = Date.now();
  const due = lastFriday22(now);
  const last = Number(localStorage.getItem(MARKER) ?? 0);
  if (last >= due) return null; // 이번 주 몫은 이미 저장됨
  const payload = await collectBackup();
  const meta = await saveSnapshotToDevice(payload);
  localStorage.setItem(MARKER, String(now));
  return meta;
}
