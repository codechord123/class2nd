"use client";
// 오늘 제출 현황 — 아이들이 저장한 평가·MVP·칭찬이 '실제로 들어왔는지' 집계 전에 바로 확인.
// (집계해야만 보이던 문제 해소 — 데이터가 쌓이는 걸 실시간으로 눈으로 확인)
// 읽기 예산: 교사가 이 패널을 볼 때만 evaluations/{date}/entries 최대 25문서. 새로고침 수동.
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import Card from "@/components/ui/Card";

interface Entry {
  id: number;
  data: Record<string, unknown>;
}

export default function TodaySubmissionsPanel({ date }: { date: string }) {
  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["submissions", date],
    queryFn: async (): Promise<Entry[]> => {
      const snap = await getDocs(collection(db(), "evaluations", date, "entries"));
      return snap.docs.map((d) => ({ id: Number(d.id), data: d.data() }));
    },
    staleTime: 60 * 1000,
  });

  const entries = data ?? [];
  const submitted = new Set(entries.map((e) => e.id));

  // 원시 데이터 미리보기 (집계와 동일한 무효화 규칙: 자기 투표·자기 칭찬 제외)
  const mvpVotes: Record<number, number> = {};
  let compliments = 0;
  let wishes = 0;
  for (const e of entries) {
    const mvp = e.data._mvp;
    if (typeof mvp === "number" && mvp > 0 && mvp !== e.id)
      mvpVotes[mvp] = (mvpVotes[mvp] ?? 0) + 1;
    const cmap = e.data._compliments as Record<string, string> | undefined;
    if (cmap)
      compliments += Object.entries(cmap).filter(
        ([to, t]) => typeof t === "string" && t.trim() && Number(to) !== e.id
      ).length;
    if (typeof e.data._toTeacher === "string" && e.data._toTeacher.trim()) wishes++;
  }
  const mvpTop = Object.entries(mvpVotes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <Card
      title="📥 오늘 제출 현황"
      desc="아이들이 저장한 평가가 실시간으로 여기 쌓여요 — 집계 전에 확인하는 원본이에요."
      action={
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="press rounded-btn bg-brand px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isFetching ? "확인 중…" : "🔄 새로고침"}
        </button>
      }
    >
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <p className="text-sm text-ink-700">
          평가 제출 <b className="tnum text-lg text-brand-strong">{submitted.size}</b>
          <span className="text-ink-400">/{students.length}명</span>
        </p>
        {updatedLabel && <span className="text-xs text-ink-400">({updatedLabel} 기준)</span>}
      </div>

      {/* 전원 제출 상태 칩 — 제출=파랑, 미제출=회색 */}
      <div className="mt-2 flex flex-wrap gap-1">
        {students.map((s) => (
          <span
            key={s.id}
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              submitted.has(s.id)
                ? "bg-brand-weak text-brand-strong"
                : "bg-ink-100 text-ink-400"
            }`}
          >
            {s.name}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-btn bg-warn-weak px-2 py-2">
          <p className="text-[11px] text-ink-500">MVP 득표 선두</p>
          <p className="mt-0.5 text-sm font-extrabold text-warn">
            {mvpTop.length
              ? mvpTop
                  .map(([sid, n]) => `${studentById.get(Number(sid))?.name} ${n}표`)
                  .join(" · ")
              : "아직 없음"}
          </p>
        </div>
        <div className="rounded-btn bg-pink-50 px-2 py-2">
          <p className="text-[11px] text-ink-500">칭찬</p>
          <p className="tnum mt-0.5 text-lg font-extrabold text-pink-600">{compliments}건</p>
        </div>
        <div className="rounded-btn bg-brand-weak px-2 py-2">
          <p className="text-[11px] text-ink-500">바라는 점</p>
          <p className="tnum mt-0.5 text-lg font-extrabold text-brand-strong">{wishes}건</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-400">
        점수로 확정되는 건 집계할 때예요 — 여기 숫자가 있는데 리포트에 없다면 아직 집계 전이라는
        뜻이에요.
      </p>
    </Card>
  );
}
