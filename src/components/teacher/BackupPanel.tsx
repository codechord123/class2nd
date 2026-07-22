"use client";
// 🗄 전체 백업 — 학기 기록 전체를 JSON으로 보관하는 금고 + 그 파일로 되돌리는 복원 도구.
// · 수동: 버튼 한 번으로 파일 다운로드 (언제든)
// · 자동: 매주 금요일 밤 10시(KST)가 지난 뒤 첫 교사 접속 때 이 기기에 스냅샷 저장
//   (서버가 없어 '정각 크론'은 불가 — autoRun과 같은 접속 트리거 방식. 최근 8개 보관)
// · 복원: 백업 JSON을 골라 컬렉션 단위로 되돌린다 (실사례 2026-07-20 이월 실버 유실 후 추가)
// 읽기 비용: 1회 = 전 문서 (학기말 ~3–5천 읽기, 무료 한도의 10% 미만) — 주 1회 무부담.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { todayKST } from "@/lib/date";
import {
  BACKUP_COLLECTIONS,
  collectBackup,
  downloadBackup,
  downloadSnapshot,
  listSnapshots,
  parseBackup,
  restoreBackup,
  type BackupPayload,
  type SnapshotMeta,
} from "@/lib/backup";
import { useFeedback } from "@/components/ui/Feedback";

// 복원 화면에 보여줄 한글 라벨 (모르는 컬렉션은 이름 그대로)
const COLL_LABELS: Record<string, string> = {
  readingReports: "🐢 감상문",
  readingDrafts: "임시저장 글",
  readingStats: "독서 권수 통계",
  suggestions: "게시판 (건의·법률·숨은기여)",
  polls: "투표",
  coinTxns: "💰 2학기 실버 원장·잔액",
  s1Spends: "🎒 이월 실버 사용",
  seatChangeRequests: "자리 신청",
  scoreAppeals: "점수 이의제기",
  menuRequests: "메뉴 제안",
  groupVotes: "모둠 간 평가",
  dailyScores: "🏅 일일 점수·누적",
  biweeklyScores: "세션 정산",
  classData: "⚙️ 설정·순위·헌법",
  complimentCoverage: "칭찬 커버리지",
  resetRequests: "비밀번호 재설정 요청",
  studentHints: "비밀번호 힌트",
};

export default function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [last, setLast] = useState("");
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();

  // 🛟 복원 — 파일을 고르면 요약 + 컬렉션 선택이 열린다
  const fileRef = useRef<HTMLInputElement>(null);
  const [restorePayload, setRestorePayload] = useState<BackupPayload | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    void listSnapshots().then(setSnaps).catch(() => {});
  }, [last]);

  async function backup() {
    if (busy) return;
    setBusy(true);
    try {
      const payload = await collectBackup(setProgress);
      downloadBackup(payload);
      setLast(`${todayKST()} · 문서 ${payload.docCount}개`);
      toast(`🗄 백업 완료 — 문서 ${payload.docCount}개를 파일로 내려받았어요.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "백업에 실패했어요.", "error");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  function onPickFile(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = parseBackup(String(reader.result ?? ""));
        setRestorePayload(p);
        // 기본 선택: 파일에 실제로 담긴 컬렉션 전부
        setPicked(new Set(Object.keys(p.data).filter((k) => Object.keys(p.data[k] ?? {}).length)));
      } catch (e) {
        toast(e instanceof Error ? e.message : "파일을 읽을 수 없어요.", "error");
        setRestorePayload(null);
      }
    };
    reader.onerror = () => toast("파일을 읽을 수 없어요.", "error");
    reader.readAsText(f);
  }

  async function runRestore() {
    if (restoring || !restorePayload) return;
    const colls = [...picked];
    if (!colls.length) {
      toast("복원할 항목을 하나 이상 골라주세요.", "warn");
      return;
    }
    const total = colls.reduce(
      (a, c) => a + Object.keys(restorePayload.data[c] ?? {}).length,
      0
    );
    if (
      !(await confirm({
        title: `백업으로 ${colls.length}개 항목을 복원할까요?`,
        body: `${restorePayload.exportedAt.slice(0, 10)} 백업 · 문서 ${total}개.\n같은 문서는 백업 내용으로 덮어써요. 백업에 없는 최근 기록은 지우지 않아요.`,
        confirmLabel: `${total}개 문서 복원`,
        danger: true,
      }))
    )
      return;
    setRestoring(true);
    try {
      const r = await restoreBackup(restorePayload, colls, setProgress);
      qc.clear(); // 모든 화면이 복원된 데이터로 다시 그려지게
      if (r.failed.length === 0) {
        toast(`🛟 복원 완료 — 문서 ${r.written}개를 되돌렸어요.`, "success");
        setRestorePayload(null);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        toast(
          `⚠️ ${r.written}개 복원, 일부 실패: ${r.failed.join(", ")} — Firebase 콘솔에 최신 규칙 게시 후 다시 시도해주세요.`,
          "warn"
        );
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "복원에 실패했어요.", "error");
    } finally {
      setProgress("");
      setRestoring(false);
    }
  }

  const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);
  const countOf = (c: string) => Object.keys(restorePayload?.data[c] ?? {}).length;

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">🗄 전체 백업</h2>
      <p className="mt-1 text-xs text-ink-600">
        감상문·게시판·상점 원장·점수 등 학기 기록 전체를 JSON 파일로 보관하고, 그 파일로
        언제든 되돌릴 수 있어요. (비밀번호 정보는 담기지 않아요)
      </p>
      <p className="mt-1.5 rounded-btn bg-success-weak px-3 py-2 text-xs text-success">
        ⏰ <b>매주 금요일 밤 10시가 지나면</b> 그 뒤 처음 접속할 때 이 기기에 자동 스냅샷이
        저장돼요. 초기화를 실행할 때도 삭제 직전에 백업 파일이 자동으로 내려받아져요.
      </p>
      <p className="mt-1.5 rounded-btn bg-warn-weak px-3 py-2 text-xs text-warn">
        💾 자동 스냅샷은 <b>이 기기 브라우저 안에만</b> 있어요 — 기기가 고장 나면 함께
        사라져요. <b>한 달에 한 번은 파일로 내려받아</b> 구글 드라이브 등 다른 곳에도 보관해
        주세요.
      </p>
      <button
        onClick={() => void backup()}
        disabled={busy}
        className="press mt-3 w-full rounded-btn bg-ink-800 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? `⏳ ${progress || "백업 중…"}` : "🗄 지금 백업 파일 내려받기"}
      </button>
      {last && <p className="mt-2 text-center text-xs text-ink-500">마지막 수동 백업: {last}</p>}

      {snaps.length > 0 && (
        <div className="mt-3 border-t border-ink-100 pt-2.5">
          <p className="text-xs font-bold text-ink-700">📱 이 기기의 자동 스냅샷</p>
          <ul className="mt-1.5 space-y-1">
            {snaps.map((s) => (
              <li key={s.key} className="flex items-center gap-2 rounded-btn bg-ink-50 px-3 py-1.5 text-xs text-ink-600">
                <span className="tnum font-bold text-ink-800">{s.key}</span>
                <span className="tnum">문서 {s.docCount}개 · {fmtSize(s.bytes)}</span>
                <button
                  onClick={() => void downloadSnapshot(s.key).catch((e: Error) => toast(e.message, "error"))}
                  className="press ml-auto shrink-0 rounded-btn border border-ink-300 bg-white px-2 py-1 text-[11px] font-bold text-ink-700"
                >
                  ⬇️ 파일로
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 🛟 백업에서 복원 — 파일 선택 → 담긴 항목 확인 → 골라서 되돌리기 */}
      <div className="mt-3 border-t border-ink-100 pt-2.5">
        <p className="text-xs font-bold text-ink-700">🛟 백업에서 복원</p>
        <p className="mt-0.5 text-[11px] text-ink-500">
          백업 JSON 파일을 골라, 필요한 항목만 그 시점으로 되돌려요. 같은 문서는 덮어쓰고,
          백업에 없는 최근 기록은 지우지 않아요.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => onPickFile(e.target.files?.[0])}
          className="mt-2 block w-full text-xs text-ink-600 file:mr-2 file:rounded-btn file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-ink-700"
          aria-label="백업 파일 선택"
        />
        {restorePayload && (
          <div className="mt-2 rounded-btn bg-ink-50 p-3">
            <p className="text-xs text-ink-700">
              📄 <b>{restorePayload.exportedAt.slice(0, 10)}</b> 백업 · 문서{" "}
              <b className="tnum">{restorePayload.docCount}</b>개
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BACKUP_COLLECTIONS.filter((c) => countOf(c) > 0).map((c) => {
                const on = picked.has(c);
                return (
                  <button
                    key={c}
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        next.has(c) ? next.delete(c) : next.add(c);
                        return next;
                      })
                    }
                    className={`press rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-ink-200 bg-white text-ink-500"
                    }`}
                  >
                    {COLL_LABELS[c] ?? c} <span className="tnum font-normal">{countOf(c)}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => void runRestore()}
              disabled={restoring || picked.size === 0}
              className="press mt-2.5 w-full rounded-btn bg-brand py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {restoring ? `⏳ ${progress || "복원 중…"}` : `🛟 선택한 ${picked.size}개 항목 복원`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
