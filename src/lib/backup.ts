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
  // groupVotes 제외 — 실데이터는 groupVotes/{date}/entries 하위컬렉션이라 부모 컬렉션 조회는
  // 규칙상 차단(catch-all)되고 내용도 비어 있다. 이 한 컬렉션 때문에 백업 전체가 실패했었다
  // (실사례 2026-07-25 발견: 주간 자동 백업이 계속 무산 → 초기화 때 복구할 백업이 없었음).
  // 원시 평가(evaluations 하위)와 같은 이유로 백업 대상에서 제외한다.
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
  /** 읽지 못한 컬렉션 (권한·네트워크) — 있으면 부분 백업이라는 뜻 */
  failed?: string[];
}

/** 전 컬렉션을 읽어 백업 페이로드를 만든다 (다운로드/저장은 호출부 선택).
 *  컬렉션 단위 격리: 하나가 실패해도 나머지는 담고 failed에 기록한다 —
 *  예전엔 한 컬렉션(groupVotes)의 권한 오류로 백업 '전체'가 무산됐다 (2026-07-25 발견). */
export async function collectBackup(
  onProgress?: (msg: string) => void
): Promise<BackupPayload> {
  const d = db();
  const out: Record<string, Record<string, unknown>> = {};
  const failed: string[] = [];
  let docs = 0;
  for (const [i, name] of BACKUP_COLLECTIONS.entries()) {
    onProgress?.(`${name} (${i + 1}/${BACKUP_COLLECTIONS.length})…`);
    try {
      const snap = await getDocs(collection(d, name));
      const bucket: Record<string, unknown> = {};
      snap.forEach((x) => {
        bucket[x.id] = x.data();
        docs++;
      });
      out[name] = bucket;
    } catch {
      failed.push(name);
    }
  }
  // 전부 실패면 백업이라 부를 수 없다 — 호출부(초기화 전 백업 등)가 중단할 수 있게 던진다
  if (docs === 0 && failed.length)
    throw new Error(`백업할 데이터를 읽지 못했어요 (${failed.join(", ")})`);
  return {
    app: "class2nd",
    exportedAt: new Date().toISOString(),
    note: "studentAuth(비밀번호 해시)·evaluations/groupVotes 하위(원시 평가)는 의도적으로 제외",
    docCount: docs,
    data: out,
    ...(failed.length ? { failed } : {}),
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
const KEEP = 14; // 매일 백업 기준 최근 14개(2주치) 보관 — 기기 용량 보호 (개당 ~1-3MB)

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

// ── 일일 자동 백업 판정 — 그날(KST) 첫 교사 접속 (사용자 확정: 주 1회 → 매일) ──────
// 서버가 없어 '정각 크론'은 불가 — 접속이 방아쇠라, 접속 없는 날은 건너뛴다.
// 읽기 비용: 하루 1회 전 문서(~학기말 3-5천) = 무료 한도의 10% 미만.
const MARKER = "class2nd-auto-backup-day"; // 이 기기 기준 (기기마다 보관 = 이중 안전)

/** 오늘 몫 자동 백업이 아직이면 실행 — 완료 시 메타 반환, 아니면 null */
export async function runDailyAutoBackup(): Promise<SnapshotMeta | null> {
  const today = todayKST();
  if (localStorage.getItem(MARKER) === today) return null; // 오늘 몫은 이미 저장됨
  const payload = await collectBackup();
  const meta = await saveSnapshotToDevice(payload); // 같은 날짜 키는 덮어씀
  localStorage.setItem(MARKER, today);
  return meta;
}
