"use client";
// 교사 독서 권수 ±보정 — 종이 감상문 인정, count 꼬임 복구용. 1·2학기 모두 지원:
//   2학기: readingStats/main.total(+오늘 주차 byWeek)
//   1학기: readingStats/main.s1Adj (기본값 = 실제 감상문 수 — staticData.s1BooksOf에서 합산)
// runTransaction으로 서버 값을 읽고 보정(클릭당 문서 1회 읽기) —
// 낡은 캐시로 인한 음수 총권수, 주간 카운트 음수를 원천 차단한다.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { useReadingStats, type ReadingStats } from "@/lib/query/reading";
import { s1BooksByStudent } from "@/lib/staticData";
import { useFeedback } from "@/components/ui/Feedback";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";

export default function ReadingAdjustPanel() {
  const [sid, setSid] = useState(1);
  const [sem, setSem] = useState<"s2" | "s1">("s2");
  const [busy, setBusy] = useState(false);
  const { data: stats } = useReadingStats();
  const qc = useQueryClient();
  const { toast } = useFeedback();

  const key = String(sid);
  const s1Base = s1BooksByStudent[key] ?? 0; // 1학기 실제 감상문 수 (정적)
  const s1Cur = s1Base + (stats?.s1Adj?.[key] ?? 0);
  const s2Cur = stats?.total?.[key] ?? 0;
  const current = sem === "s1" ? s1Cur : s2Cur;

  async function adjust(delta: 1 | -1) {
    if (busy) return;
    if (delta === -1 && current <= 0) return;
    setBusy(true);
    try {
      const d = db();
      const newTotal = await runTransaction(d, async (tx) => {
        const snap = await tx.get(doc(d, "readingStats", "main"));
        const data = (snap.exists() ? snap.data() : {}) as ReadingStats;
        if (sem === "s1") {
          const curAdj = data.s1Adj?.[key] ?? 0;
          if (delta === -1 && s1Base + curAdj <= 0)
            throw new Error("이미 0권이라 더 뺄 수 없어요.");
          tx.set(doc(d, "readingStats", "main"), { s1Adj: { [key]: curAdj + delta } }, { merge: true });
          return s1Base + curAdj + delta;
        }
        const curTotal = data.total?.[key] ?? 0;
        if (delta === -1 && curTotal <= 0) throw new Error("이미 0권이라 더 뺄 수 없어요.");
        const week = String(weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS));
        const curWeek = data.byWeek?.[week]?.[key] ?? 0;
        tx.set(
          doc(d, "readingStats", "main"),
          {
            total: { [key]: curTotal + delta },
            // 주간 카운트는 0 밑으로 내려가지 않게 클램프 (주간 의무 권수 표시 보호)
            byWeek: { [week]: { [key]: Math.max(curWeek + delta, 0) } },
          },
          { merge: true }
        );
        return curTotal + delta;
      });
      await qc.invalidateQueries({ queryKey: ["readingStats"] });
      toast(
        `✅ ${studentById.get(sid)?.name} ${sem === "s1" ? "1학기" : "2학기"} 권수 ${delta > 0 ? "+1" : "−1"} (현재 ${newTotal}권)`,
        "success"
      );
    } catch (e) {
      toast(`⚠️ 보정 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">📚 독서 권수 보정</h2>
      <p className="mt-1 text-xs text-ink-500">
        종이 감상문 인정, count 꼬임 복구용. 1학기 권수는 <b>실제 감상문 수</b>가 기본값이고
        여기서 더한 만큼이 보정으로 저장돼요. 2학기 보정은 오늘 기준 주차에 함께 반영돼요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-btn bg-ink-100 p-1 text-xs font-bold">
          {(["s2", "s1"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSem(m)}
              className={`press rounded-[10px] px-3 py-1.5 ${
                sem === m ? "bg-white text-ink-900 shadow-card" : "text-ink-500"
              }`}
            >
              {m === "s2" ? "2학기" : "1학기"}
            </button>
          ))}
        </div>
        <select
          value={sid}
          onChange={(e) => setSid(Number(e.target.value))}
          className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-600">
          현재 <b>{current}</b>권
          {sem === "s1" && (
            <span className="text-xs text-ink-400">
              {" "}
              (감상문 {s1Base} {(stats?.s1Adj?.[key] ?? 0) !== 0 && `· 보정 ${(stats?.s1Adj?.[key] ?? 0) > 0 ? "+" : ""}${stats?.s1Adj?.[key]}`})
            </span>
          )}
        </span>
        <button
          onClick={() => void adjust(-1)}
          disabled={busy || current <= 0}
          className="rounded-btn bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          −1
        </button>
        <button
          onClick={() => void adjust(1)}
          disabled={busy}
          className="rounded-btn bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          +1
        </button>
      </div>
    </section>
  );
}
