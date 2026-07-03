"use client";
// 학급 현황 CSV 내보내기 — 이미 캐시된 문서 4개(useReadingStats·useBalances×2·useCumulativeScores)
// + 정적 1학기 데이터만 사용하므로 추가 Firestore 읽기 0.
import { useReadingStats } from "@/lib/query/reading";
import { useBalances } from "@/lib/query/wallet";
import { useCumulativeScores } from "@/lib/query/evaluation";
import { students } from "@/lib/roster";
import { getS1WalletOf, s1BooksByStudent } from "@/lib/staticData";
import { useFeedback } from "@/components/ui/Feedback";
import { todayKST } from "@/lib/date";

export default function CsvExportPanel() {
  const { data: stats, isLoading: l1 } = useReadingStats();
  const { data: s2Bal, isLoading: l2 } = useBalances("s2");
  const { data: s1Bal, isLoading: l3 } = useBalances("s1");
  const { data: cum, isLoading: l4 } = useCumulativeScores();
  const { toast } = useFeedback();
  const loading = l1 || l2 || l3 || l4;

  function exportCsv() {
    try {
      const header = ["번호", "이름", "누적점수", "2학기실버", "이월실버잔액", "1학기권수", "2학기권수", "합계권수"];
      const rows = students.map((s) => {
        const key = String(s.id);
        const cumScore = typeof cum?.[key] === "number" ? (cum[key] as number) : 0;
        const s2Silver = (s2Bal?.[key] as number | undefined) ?? 0;
        const s1Carry =
          (getS1WalletOf(s.id)?.silverRemaining ?? 0) - ((s1Bal?.[key] as number | undefined) ?? 0);
        const booksS1 = s1BooksByStudent[key] ?? 0;
        const booksS2 = stats?.total?.[key] ?? 0;
        return [s.id, s.name, cumScore, s2Silver, s1Carry, booksS1, booksS2, booksS1 + booksS2];
      });
      const csv = [header, ...rows].map((r) => r.join(",")).join("\r\n");
      // Excel 한글 깨짐 방지 — UTF-8 BOM 포함
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `학급현황-${todayKST()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`✅ ${students.length}명 학급 현황 CSV를 내려받았어요.`, "success");
    } catch (e) {
      toast(`⚠️ 내보내기 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">📥 학급 현황 CSV 내보내기</h2>
      <p className="mt-1 text-xs text-slate-500">
        번호·이름·누적점수·실버(2학기/이월)·독서 권수(1·2학기/합계)를 엑셀용 CSV로 저장해요.
        이미 불러온 자료만 사용해 추가 읽기가 없어요.
      </p>
      <button
        onClick={exportCsv}
        disabled={loading}
        className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {loading ? "자료 불러오는 중…" : "CSV 내려받기"}
      </button>
    </section>
  );
}
