"use client";
// 미니 달력 — 날짜를 눌러 그날 기록만 불러온다 (읽기 예산: 클릭 전엔 아무것도 안 읽음).
// KST 함정 회피: Date 객체 대신 "YYYY-MM-DD" 문자열 연산으로만 날짜를 만든다.
import { useState } from "react";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function MiniCalendar({
  selected,
  onSelect,
  maxDate,
}: {
  selected: string | null;
  onSelect: (date: string) => void;
  maxDate?: string; // 이후 날짜는 비활성 (보통 오늘)
}) {
  const base = selected ?? maxDate ?? "2026-01-01";
  const [ym, setYm] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) });

  // 달의 첫 요일·일수 — UTC 고정 계산이라 실행 환경 시간대와 무관
  const startDow = new Date(Date.UTC(ym.y, ym.m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...(Array(startDow).fill(null) as null[]),
    ...Array.from({ length: daysInMonth }, (_, i) => `${ym.y}-${pad(ym.m)}-${pad(i + 1)}`),
  ];
  const move = (d: number) =>
    setYm(({ y, m }) => {
      const nm = m + d;
      return nm < 1 ? { y: y - 1, m: 12 } : nm > 12 ? { y: y + 1, m: 1 } : { y, m: nm };
    });

  return (
    <div className="w-full max-w-xs rounded-btn border border-ink-200 bg-white p-2.5">
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => move(-1)}
          className="press rounded-btn px-2 py-1 text-sm text-ink-500 hover:bg-ink-100"
          aria-label="이전 달"
        >
          ◀
        </button>
        <b className="tnum text-sm text-ink-800">
          {ym.y}년 {ym.m}월
        </b>
        <button
          onClick={() => move(1)}
          className="press rounded-btn px-2 py-1 text-sm text-ink-500 hover:bg-ink-100"
          aria-label="다음 달"
        >
          ▶
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 text-center text-[11px] font-bold text-ink-400">
        {DOW.map((d, i) => (
          <span key={d} className={i === 0 ? "text-danger/70" : ""}>
            {d}
          </span>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e-${i}`} />
          ) : (
            <button
              key={d}
              disabled={maxDate ? d > maxDate : false}
              onClick={() => onSelect(d)}
              className={`tnum rounded-btn py-1.5 text-sm disabled:opacity-30 ${
                selected === d
                  ? "bg-brand font-bold text-white"
                  : d === maxDate
                    ? "bg-brand-weak font-bold text-brand-strong"
                    : "text-ink-700 hover:bg-ink-100"
              }`}
            >
              {Number(d.slice(8))}
            </button>
          )
        )}
      </div>
    </div>
  );
}
