"use client";
// 베타 테스트 초기화 패널 — 2단계 확인 후 학생 기록 전체 삭제 (설정·비밀번호는 유지).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resetAllRecords } from "@/lib/betaReset";
import { collectBackup, downloadBackup, saveSnapshotToDevice } from "@/lib/backup";
import { todayKST } from "@/lib/date";
import { reaggregateReadingDates } from "@/lib/aggregate";
import { useSettings } from "@/lib/query/settings";
import { useFeedback } from "@/components/ui/Feedback";

export default function BetaResetPanel() {
  const { toast, confirm } = useFeedback();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  async function run() {
    if (busy) return;
    const ok1 = await confirm({
      title: "베타 기록을 전부 지울까요?",
      body: "평가·점수·칭찬·실버·건의·투표·자리신청 기록이 삭제돼요.\n🐢 독서는 7/5 이후 감상문·권수·독서 점수가 유지되고, 그 전 연습분만 정리돼요.\n교사 설정·상점 메뉴·헌법·학생 비밀번호는 유지됩니다.",
      confirmLabel: "계속",
      danger: true,
    });
    if (!ok1) return;
    const ok2 = await confirm({
      title: "정말 초기화할까요?",
      body: "삭제 직전에 전체 백업 파일이 자동으로 내려받아져요 — 실수했더라도 그 파일로 복원할 수 있어요. (백업이 실패하면 초기화는 중단됩니다)",
      confirmLabel: "백업 후 초기화 실행",
      danger: true,
    });
    if (!ok2) return;
    setBusy(true);
    try {
      // 🛟 삭제 전 자동 백업 (실사례 2026-07-20: 방학 이월 실버 사용 기록이 초기화로 유실) —
      // 파일 다운로드 + 이 기기 스냅샷 이중 저장. 백업이 실패하면 초기화를 중단한다.
      setProgress("삭제 전 백업 저장 중…");
      try {
        const payload = await collectBackup(setProgress);
        downloadBackup(payload, `pre-reset-${todayKST()}`);
        await saveSnapshotToDevice(payload).catch(() => {}); // 스냅샷은 보조 — 실패해도 파일이 있으면 진행
      } catch (e) {
        toast(
          `⚠️ 삭제 전 백업에 실패해 초기화를 중단했어요 — ${e instanceof Error ? e.message : "네트워크를 확인해주세요."}`,
          "error"
        );
        return;
      }
      const r = await resetAllRecords(setProgress);
      // 독서 점수 즉시 복원 — 자동 실행을 기다리면 다음 접속까지 아이들 누적이 0으로 보인다.
      // 남은 감상문 날짜 전체를 재집계해 일일 read(+2/편)를 다시 채운다 (멱등).
      setProgress("독서 점수 복원 중…");
      const redone = settings ? await reaggregateReadingDates(settings).catch(() => []) : [];
      qc.clear(); // 캐시 전체 비우기 — 모든 화면이 빈 상태부터 다시
      if (r.failed.length === 0) {
        toast(
          `🧹 초기화 완료 — ${r.deleted}개 기록 삭제${redone.length ? ` · 🐢 독서 점수 ${redone.length}일치 복원` : ""}. 새 출발!`,
          "success"
        );
      } else {
        toast(
          `⚠️ ${r.deleted}개 삭제했지만 일부 실패: ${r.failed.join(", ")} — Firebase 콘솔에 최신 규칙(firestore.rules)을 게시한 뒤 다시 실행해주세요.`,
          "warn"
        );
      }
      setProgress("");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "초기화 실패"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-danger/30 bg-danger-weak/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-danger">🧨 베타 테스트 초기화</p>
          <p className="mt-0.5 text-xs text-ink-600">
            테스트 기간의 학생 기록을 삭제해요 (설정·메뉴·비밀번호 유지). 🐢 독서는 7/5부터
            진짜 누적 — 그 이후 감상문·권수·독서 점수는 지워지지 않고, 연습분(7/5 전)만
            정리돼요. 개학 전 새 출발용.
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={busy}
          className="press rounded-btn bg-danger px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? progress || "삭제 중…" : "전체 초기화"}
        </button>
      </div>
    </section>
  );
}
