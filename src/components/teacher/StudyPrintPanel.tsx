"use client";
// 📚 헌법·법률 학습지/시험지 인쇄 — 관리 도구. 항상 '지금'의 헌법·법률로 생성 (추가 읽기 0,
// useConstitution 캐시 재사용). 시험지는 세트 번호로 문제가 섞여 짝꿍 베끼기 방지.
import { useState } from "react";
import { useConstitution } from "@/lib/query/classMeta";
import { openPrintWindow } from "@/lib/exportDoc";
import { buildStudySheet, buildQuizSheet, buildLawFillSheet } from "@/lib/studyDoc";
import { useFeedback } from "@/components/ui/Feedback";

export default function StudyPrintPanel() {
  const { data: c } = useConstitution();
  const [setNo, setSetNo] = useState(1);
  const [withAnswers, setWithAnswers] = useState(true);
  const [lawBank, setLawBank] = useState(true); // 법률 빈칸 시험의 <보기> 제공 여부
  const [perDept, setPerDept] = useState(10); // 부서별 문항 수
  const { toast } = useFeedback();

  const laws = c ? Object.values(c.lawsByDept ?? {}).flat().length + (c.laws?.length ?? 0) : 0;
  const arts = c?.articles?.filter((a) => a.trim()).length ?? 0;
  const empty = arts === 0 && laws === 0;

  function print(kind: "study" | "quiz" | "lawfill") {
    if (!c) return;
    if (empty) {
      toast("아직 헌법·법률이 없어요 — 헌법 탭에서 먼저 등록해주세요.", "warn");
      return;
    }
    try {
      if (kind === "study") openPrintWindow("우리 반 헌법·법률 학습지", buildStudySheet(c));
      else if (kind === "lawfill")
        openPrintWindow(
          `법률 빈칸 시험지 (세트 ${setNo})`,
          buildLawFillSheet(c, setNo, withAnswers, { showBank: lawBank, perDept })
        );
      else openPrintWindow(`헌법·법률 시험지 (세트 ${setNo})`, buildQuizSheet(c, setNo, withAnswers));
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄 창을 열지 못했어요.", "error");
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">📚 헌법·법률 학습지 인쇄</h2>
      <p className="mt-1 text-xs text-ink-600">
        지금 등록된 헌법 <b className="tnum">{arts}</b>조 · 법률 <b className="tnum">{laws}</b>개로
        학습지와 시험지를 만들어요. 법률이 새로 채택되면 언제든 다시 뽑으면 최신판이에요.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => print("study")}
          disabled={!c}
          className="press rounded-btn bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          📖 학습지 인쇄
        </button>
        <button
          onClick={() => print("quiz")}
          disabled={!c}
          className="press rounded-btn bg-ink-800 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          📝 시험지 인쇄 (객관식 30)
        </button>
        <button
          onClick={() => print("lawfill")}
          disabled={!c}
          className="press col-span-2 rounded-btn bg-brand-strong py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          ✍️ 법률 빈칸 시험 인쇄 (부서별 {perDept}문항)
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-ink-600">
        <label className="flex items-center gap-1.5">
          시험 세트
          <select
            value={setNo}
            onChange={(e) => setSetNo(Number(e.target.value))}
            className="rounded-btn border border-ink-300 px-2 py-1"
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>세트 {n}</option>
            ))}
          </select>
          <span className="text-ink-400">(세트마다 문제가 달라요)</span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={withAnswers}
            onChange={(e) => setWithAnswers(e.target.checked)}
          />
          마지막 장에 정답지 포함
        </label>
        <label className="flex items-center gap-1.5">
          부서별 문항
          <select
            value={perDept}
            onChange={(e) => setPerDept(Number(e.target.value))}
            className="rounded-btn border border-ink-300 px-2 py-1"
          >
            {[5, 8, 10, 12, 15].map((n) => (
              <option key={n} value={n}>{n}문항</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={lawBank} onChange={(e) => setLawBank(e.target.checked)} />
          법률 빈칸에 &lt;보기&gt; 제공
          <span className="text-ink-400">(빼면 직접 쓰기 — 어려움)</span>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        시험지 2종: ① 객관식 30문항(헌법+법률 종합) ② 법률 빈칸 — 부서별로 묶어 자기 부서 법률을 외우게 하는 용도.
        인쇄 창에서 "PDF로 저장"을 누르면 파일로도 남길 수 있어요.
      </p>
    </section>
  );
}
