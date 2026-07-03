"use client";
// 선생님 메모장 + 격주 MVP 정산 + 교사 보너스 (교사 탭 위젯 모음).
import { useEffect, useState } from "react";
import { useTeacherMemo, useSaveTeacherMemo } from "@/lib/query/classMeta";
import { settleBiweekly, setBonus, periodOfWeek, type BiweeklyResult } from "@/lib/aggregate";
import { currentWeekNum } from "@/lib/schedule";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import { useQueryClient } from "@tanstack/react-query";

export function TeacherMemoWidget() {
  const { data: memo } = useTeacherMemo(true);
  const save = useSaveTeacherMemo();
  const [text, setText] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  // 최초 로드 시 서버 값 반영
  useEffect(() => {
    if (memo && text === null) setText(memo.text);
  }, [memo, text]);

  const fs = fontSize ?? memo?.fontSize ?? 14;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📝 선생님 메모장</h2>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          글자
          <button onClick={() => setFontSize(Math.max(10, fs - 2))} className="rounded border px-1.5">−</button>
          {fs}px
          <button onClick={() => setFontSize(Math.min(28, fs + 2))} className="rounded border px-1.5">＋</button>
        </div>
      </div>
      <textarea
        value={text ?? memo?.text ?? ""}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        style={{ fontSize: fs }}
        placeholder="수업 준비, 전달 사항 등을 자유롭게…"
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() =>
            void save({ text: text ?? "", fontSize: fs }).then(
              () => setMsg("✅ 저장됨"),
              (e) => setMsg(`⚠️ ${e.message}`)
            )
          }
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
        >
          메모 저장
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </section>
  );
}

export function BiweeklySettlePanel() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(periodOfWeek(currentWeekNum()));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BiweeklyResult | null>(null);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const r = await settleBiweekly(period);
      setResult(r);
      if (r.alreadySettled) {
        setMsg(`ℹ️ ${period}기간은 이미 정산되었습니다. (아래는 그때 결과)`);
      } else {
        setMsg(`✅ ${period}기간 정산 완료 — MVP ${r.mvps.length}명에게 실버 1개씩 지급!`);
        void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
      }
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "정산 실패"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">🏆 격주 MVP 정산</h2>
      <p className="mt-1 text-xs text-slate-500">
        2주 누적 점수 상위 5명(동점 포함)에게 실버 1개 자동 지급. 격주 금요일에 실행하세요.
        같은 기간을 다시 눌러도 이중 지급되지 않습니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {Array.from({ length: 11 }, (_, i) => i + 1).map((p) => (
            <option key={p} value={p}>
              {p}기간 ({p * 2 - 1}~{Math.min(p * 2, 21)}주)
            </option>
          ))}
        </select>
        <button
          onClick={() => void run()}
          disabled={busy}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "정산 중…" : "MVP 정산 실행"}
        </button>
      </div>
      {result && result.mvps.length > 0 && (
        <p className="mt-2 text-sm text-slate-600">
          🏅 MVP:{" "}
          {result.mvps
            .map((sid) => `${studentById.get(sid)?.name} (${result.sums[sid] ?? 0}점)`)
            .join(" · ")}
        </p>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}

export function BonusPanel() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayKST());
  const [sid, setSid] = useState(1);
  const [bonus, setBonusVal] = useState("1");
  const [msg, setMsg] = useState("");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">➕ 교사 보너스 점수</h2>
      <p className="mt-1 text-xs text-slate-500">
        특정 날짜의 학생 점수에 보너스를 더하거나 뺍니다 (누적 자동 반영).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={sid}
          onChange={(e) => setSid(Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={bonus}
          onChange={(e) => setBonusVal(e.target.value)}
          className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() =>
            void setBonus(date, sid, Number(bonus) || 0).then(
              () => {
                setMsg(`✅ ${studentById.get(sid)?.name} ${date} 보너스 ${bonus}점 반영`);
                void qc.invalidateQueries({ queryKey: ["dailyScores", date] });
                void qc.invalidateQueries({ queryKey: ["cumulativeScores"] });
              },
              (e: Error) => setMsg(`⚠️ ${e.message}`)
            )
          }
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
        >
          반영
        </button>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
