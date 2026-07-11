"use client";
// 🗄 전체 백업 — 학기 기록 전체를 JSON으로 보관하는 금고.
// · 수동: 버튼 한 번으로 파일 다운로드 (언제든)
// · 자동: 매주 금요일 밤 10시(KST)가 지난 뒤 첫 교사 접속 때 이 기기에 스냅샷 저장
//   (서버가 없어 '정각 크론'은 불가 — autoRun과 같은 접속 트리거 방식. 최근 8개 보관)
// 읽기 비용: 1회 = 전 문서 (학기말 ~3–5천 읽기, 무료 한도의 10% 미만) — 주 1회 무부담.
import { useEffect, useState } from "react";
import { todayKST } from "@/lib/date";
import {
  collectBackup,
  downloadBackup,
  downloadSnapshot,
  listSnapshots,
  type SnapshotMeta,
} from "@/lib/backup";
import { useFeedback } from "@/components/ui/Feedback";

export default function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [last, setLast] = useState("");
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const { toast } = useFeedback();

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

  const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">🗄 전체 백업</h2>
      <p className="mt-1 text-xs text-ink-600">
        감상문·게시판·상점 원장·점수 등 학기 기록 전체를 JSON으로 보관해요. 무료 플랜에는
        자동 백업이 없어서 이 파일이 유일한 복구 수단이에요. (비밀번호 정보는 담기지 않아요)
      </p>
      <p className="mt-1.5 rounded-btn bg-success-weak px-3 py-2 text-xs text-success">
        ⏰ <b>매주 금요일 밤 10시가 지나면</b>, 그 뒤 처음 접속할 때 이 기기에 자동으로
        스냅샷이 저장돼요 — 아래 목록에서 언제든 파일로 내려받을 수 있어요.
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
    </section>
  );
}
