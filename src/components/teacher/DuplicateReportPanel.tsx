"use client";
// 🔍 중복 감상문 감지 — 같은 학생이 같은 제목을 여러 번 등록한 의심 건을 찾아 한 클릭 정리.
// (실사례: 등록 버튼 더블클릭으로 동일 글이 0.4초 간격 2건 저장 — 원인은 고쳤지만 과거
//  데이터와 새 유형에 대비한 점검 도구.) 삭제는 기존 경로 재사용 — 권수 차감 + 그날 재집계
//  예약까지 자동이라 점수도 따라 보정된다. 버튼을 눌렀을 때만 전체 1회 조회 (교사 전용).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { kstDateOf } from "@/lib/date";
import { studentById } from "@/lib/roster";
import { useDeleteReport, type ReadingReport2 } from "@/lib/query/reading";
import { useSettings } from "@/lib/query/settings";
import { aggregateDate } from "@/lib/aggregate";
import { useFeedback } from "@/components/ui/Feedback";

type DupGroup = { key: string; reports: ReadingReport2[] };

export default function DuplicateReportPanel() {
  const deleteReport = useDeleteReport();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [groups, setGroups] = useState<DupGroup[] | null>(null); // null = 아직 안 검사
  const [busy, setBusy] = useState(false);

  async function scan() {
    if (busy) return;
    setBusy(true);
    try {
      const snap = await getDocs(collection(db(), "readingReports"));
      const all = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ReadingReport2, "id">) }))
        .filter((r) => !r.isDraft);
      // 같은 학생 + 제목(공백 제거) 묶음에 2건 이상이면 중복 의심
      const byKey = new Map<string, ReadingReport2[]>();
      for (const r of all) {
        const key = `${r.studentId}|${(r.title ?? "").replace(/\s+/g, "").toLowerCase()}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(r);
      }
      const dups = [...byKey.entries()]
        .filter(([, list]) => list.length >= 2)
        .map(([key, reports]) => ({
          key,
          reports: reports.sort((a, b) => a.createdAt - b.createdAt),
        }));
      setGroups(dups);
      toast(
        dups.length
          ? `중복 의심 ${dups.length}묶음을 찾았어요 — 내용을 확인하고 정리하세요.`
          : "🎉 중복 의심 감상문이 없어요!",
        dups.length ? "warn" : "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "검사에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: ReadingReport2, g: DupGroup) {
    if (busy) return;
    const name = studentById.get(r.studentId)?.name ?? "?";
    const ok = await confirm({
      title: `${name}의 「${r.title}」 이 건을 삭제할까요?`,
      body: "권수 1권 차감 + 그날 점수가 바로 재계산돼요.",
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteReport(r);
      // 그 자리에서 그날 점수 재계산 — 예약만 걸면 리포트·점수표에 옛 값이 남는다 (사용자 지적)
      if (settings) {
        const day = kstDateOf(r.createdAt);
        await aggregateDate(day, settings).catch(() => {}); // 실패해도 예약 경로가 다음에 처리
        void qc.invalidateQueries({ queryKey: ["dailyScores", day] });
        void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
      }
      // 화면 갱신 — 지운 건 빼고, 1건만 남으면 묶음 해제
      setGroups(
        (prev) =>
          prev
            ?.map((x) =>
              x.key === g.key ? { ...x, reports: x.reports.filter((y) => y.id !== r.id) } : x
            )
            .filter((x) => x.reports.length >= 2) ?? null
      );
      toast("🗑 삭제 + 그날 점수 재계산 완료", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "삭제에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${kstDateOf(ms).slice(5)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">🔍 중복 감상문 점검</h2>
      <p className="mt-1 text-xs text-ink-600">
        같은 학생이 같은 제목을 2번 이상 등록한 의심 건을 찾아요 (더블클릭 이중 등록 등).
        삭제하면 권수 차감·그날 점수 재집계까지 자동이에요.
      </p>
      {groups === null ? (
        <button
          onClick={() => void scan()}
          disabled={busy}
          className="press mt-3 w-full rounded-btn bg-brand-weak py-2.5 text-sm font-bold text-brand-strong disabled:opacity-50"
        >
          {busy ? "검사 중…" : "🔍 전체 검사하기"}
        </button>
      ) : groups.length === 0 ? (
        <p className="mt-3 rounded-btn bg-success-weak px-3 py-3 text-center text-sm font-bold text-success">
          🎉 중복 의심이 없어요!
        </p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {groups.map((g) => (
            <li key={g.key} className="rounded-btn bg-amber-50 px-3 py-2">
              <p className="text-sm font-bold text-ink-800">
                {studentById.get(g.reports[0].studentId)?.name} · 「{g.reports[0].title}」{" "}
                <span className="text-xs font-normal text-amber-700">{g.reports.length}건</span>
              </p>
              <ul className="mt-1 space-y-1">
                {g.reports.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2 text-xs text-ink-600">
                    <span className="tnum">{fmt(r.createdAt)}</span>
                    <span className="text-ink-400">{i === 0 ? "(처음 글 — 보통 유지)" : ""}</span>
                    <button
                      onClick={() => void remove(r, g)}
                      disabled={busy}
                      className="press ml-auto rounded-btn border border-danger/40 bg-white px-2 py-1 text-[11px] font-bold text-danger disabled:opacity-50"
                    >
                      이 건 삭제
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
