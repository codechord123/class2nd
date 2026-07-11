"use client";
// 🗄 전체 백업 — 한 학기 기록 전체를 JSON 파일 하나로 다운로드하는 금고.
// Firestore 무료 티어엔 자동 백업이 없다 — 실수 삭제·계정 사고가 나면 복구 수단이 이것뿐.
// 학기말 생활기록부 근거 자료로도 쓴다. 교사 전용 · 누르면 1회 전량 조회(수백~수천 문서)라
// 읽기 예산상 '가끔(주 1회) 수동'이 전제 — 자동 주기 실행은 두지 않는다.
//
// 제외 컬렉션:
//   · studentAuth — 비밀번호 해시. 백업 파일이 돌아다닐 때 유출 표면이 되므로 담지 않는다.
//     (잃어도 학생 재로그인/재설정으로 복구되는 데이터)
//   · evaluations/{date}/entries — 하위 컬렉션이라 날짜별 순회가 필요해 비용이 크고,
//     점수 결과는 dailyScores에 접혀 있다. 원시 평가까지 필요하면 점수 진단에서 날짜별 조회.
import { useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { todayKST } from "@/lib/date";
import { useFeedback } from "@/components/ui/Feedback";

const COLLECTIONS = [
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

export default function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [last, setLast] = useState("");
  const { toast } = useFeedback();

  async function backup() {
    if (busy) return;
    setBusy(true);
    try {
      const d = db();
      const out: Record<string, Record<string, unknown>> = {};
      let docs = 0;
      for (const [i, name] of COLLECTIONS.entries()) {
        setProgress(`${name} (${i + 1}/${COLLECTIONS.length})…`);
        const snap = await getDocs(collection(d, name));
        const bucket: Record<string, unknown> = {};
        snap.forEach((x) => {
          bucket[x.id] = x.data();
          docs++;
        });
        out[name] = bucket;
      }
      const payload = {
        app: "class2nd",
        exportedAt: new Date().toISOString(),
        note: "studentAuth(비밀번호 해시)·evaluations 하위(원시 평가)는 의도적으로 제외",
        docCount: docs,
        data: out,
      };
      const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `class2nd-backup-${todayKST()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLast(`${todayKST()} · 문서 ${docs}개`);
      toast(`🗄 백업 완료 — 문서 ${docs}개를 파일로 내려받았어요.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "백업에 실패했어요.", "error");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">🗄 전체 백업</h2>
      <p className="mt-1 text-xs text-ink-600">
        감상문·게시판·상점 원장·점수 등 학기 기록 전체를 JSON 파일 하나로 내려받아요. 무료
        플랜에는 자동 백업이 없어서 이 파일이 유일한 복구 수단이에요 —{" "}
        <b>주 1회쯤 눌러 안전한 곳에 보관</b>하세요. (비밀번호 정보는 담기지 않아요)
      </p>
      <button
        onClick={() => void backup()}
        disabled={busy}
        className="press mt-3 w-full rounded-btn bg-ink-800 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? `⏳ ${progress || "백업 중…"}` : "🗄 지금 백업 파일 내려받기"}
      </button>
      {last && <p className="mt-2 text-center text-xs text-ink-500">마지막 백업: {last}</p>}
    </section>
  );
}
