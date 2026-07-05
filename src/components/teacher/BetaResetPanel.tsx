"use client";
// 베타 테스트 초기화 패널 — 2단계 확인 후 학생 기록 전체 삭제 (설정·비밀번호는 유지).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resetAllRecords } from "@/lib/betaReset";
import { payVacationReading } from "@/lib/aggregate";
import { useFeedback } from "@/components/ui/Feedback";

export default function BetaResetPanel() {
  const { toast, confirm } = useFeedback();
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
      title: "정말 초기화할까요? (되돌릴 수 없어요)",
      body: "개학 전 새 출발용입니다. 삭제 후에는 복구할 수 없어요.",
      confirmLabel: "전체 초기화 실행",
      danger: true,
    });
    if (!ok2) return;
    setBusy(true);
    try {
      const r = await resetAllRecords(setProgress);
      // 방학 독서 점수 즉시 복원 — 자동 실행(하루 1회)을 기다리면 다음 날까지
      // 아이들 누적 점수가 0으로 보인다. 0주차 버킷 → 누적 재지급 (멱등).
      setProgress("독서 점수 복원 중…");
      const vr = await payVacationReading().catch(() => null);
      qc.clear(); // 캐시 전체 비우기 — 모든 화면이 빈 상태부터 다시
      if (r.failed.length === 0) {
        toast(
          `🧹 초기화 완료 — ${r.deleted}개 기록 삭제${vr ? ` · 🐢 독서 점수 ${vr.points}점 복원` : ""}. 새 출발!`,
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
