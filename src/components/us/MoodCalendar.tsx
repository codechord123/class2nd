"use client";
// 📅 나의 감정 달력 — 본인만 본다. 한 달을 한눈에 보면 '나는 월요일마다 지치는구나' 같은
// 자기 패턴을 스스로 발견한다 (자기 인식 = SEL의 첫 역량). 평가하는 말은 붙이지 않는다.
import { useMemo, useState } from "react";
import { MOOD_FACES, MOOD_LABELS } from "@/lib/query/mood";
import { colorInfo, type MoodSelf } from "@/lib/query/moodShare";

const pad = (n: number) => String(n).padStart(2, "0");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export default function MoodCalendar({ data, today }: { data: MoodSelf | undefined; today: string }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [pick, setPick] = useState<string | null>(null);

  const shift = (k: number) => {
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    setYm(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
    setPick(null);
  };

  const stats = useMemo(() => {
    const entries = Object.entries(data?.byDate ?? {}).filter(([d]) => d.startsWith(ym));
    const vs = entries.map(([, e]) => e.v).filter((v): v is number => typeof v === "number");
    const words: Record<string, number> = {};
    for (const [, e] of entries) if (e.w) words[e.w] = (words[e.w] ?? 0) + 1;
    const top = Object.entries(words).sort((a, b) => b[1] - a[1])[0];
    return {
      avg: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null,
      n: vs.length,
      top,
    };
  }, [data, ym]);

  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const sel = pick ? data?.byDate?.[pick] : undefined;

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => shift(-1)}
          aria-label="이전 달"
          className="press min-h-11 rounded-btn px-3 text-sm font-bold text-ink-500"
        >
          ◀
        </button>
        <span className="text-[15px] font-bold text-ink-800">
          {y}년 {m}월
        </span>
        <button
          onClick={() => shift(1)}
          disabled={ym >= today.slice(0, 7)}
          aria-label="다음 달"
          className="press min-h-11 rounded-btn px-3 text-sm font-bold text-ink-500 disabled:opacity-30"
        >
          ▶
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center">
        {DOW.map((d, i) => (
          <span
            key={d}
            className={`text-[11px] font-bold ${i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-ink-400"}`}
          >
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <span key={`e${i}`} />;
          const date = `${ym}-${pad(day)}`;
          const e = data?.byDate?.[date];
          const c = e?.c ? colorInfo(e.c) : null;
          return (
            <button
              key={date}
              onClick={() => setPick(pick === date ? null : date)}
              className={`press relative flex aspect-square flex-col items-center justify-center rounded-btn text-[10px] ${
                date === today ? "ring-2 ring-brand" : ""
              } ${pick === date ? "bg-brand-weak" : e ? "bg-ink-50" : ""} ${date > today ? "opacity-30" : ""}`}
            >
              <span className="tnum text-ink-400">{day}</span>
              <span className="text-lg leading-none">{typeof e?.v === "number" ? MOOD_FACES[e.v] : ""}</span>
              {c && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${c.dot}`} />}
            </button>
          );
        })}
      </div>

      {pick && (
        <p className="mt-2 rounded-btn bg-ink-50 px-3 py-2 text-[13px] text-ink-700">
          <b>
            {Number(pick.slice(5, 7))}월 {Number(pick.slice(8, 10))}일
          </b>{" "}
          {sel ? (
            <>
              {typeof sel.v === "number" && `${MOOD_FACES[sel.v]} ${MOOD_LABELS[sel.v]}`}
              {sel.w && (
                <span className={`ml-1.5 font-bold ${colorInfo(sel.c).text}`}>· &quot;{sel.w}&quot;</span>
              )}
            </>
          ) : (
            <span className="text-ink-400">기록이 없어요</span>
          )}
        </p>
      )}

      <p className="mt-2 text-xs text-ink-500">
        {stats.n ? (
          <>
            이번 달 기분 기록 <b className="tnum">{stats.n}</b>번 · 평균{" "}
            <b className="tnum">{stats.avg!.toFixed(1)}</b>
            {stats.top && (
              <>
                {" "}
                · 가장 많이 고른 마음 <b>&quot;{stats.top[0]}&quot;</b>({stats.top[1]}번)
              </>
            )}
          </>
        ) : (
          "이 달엔 아직 기록이 없어요. 모둠 탭에서 기분을 고르면 여기에 쌓여요."
        )}
      </p>
      <p className="mt-1 text-[11px] text-ink-400">🔒 이 달력은 나와 선생님만 볼 수 있어요.</p>
    </div>
  );
}
