"use client";
// 🎲 뽑기 — 우리 반 이름 / 번호 범위 / 직접 입력 중에서 공정하게.
// · 오늘 결석(출석부)·전출 학생은 처음부터 빠진다. 이름 칩을 눌러 더 뺄 수 있다.
// · '뽑힌 사람 제외'(기본 켬)면 모두 한 번씩 뽑힐 때까지 겹치지 않는다 — 아이들이 가장 민감한 '공정함'.
// · 슬롯처럼 굴러가다 느려지며 멈춘다 (약 2초). 기록은 이 기기에만 (오늘 날짜로 묶어 둔다).
import { useEffect, useMemo, useRef, useState } from "react";
import { students } from "@/lib/roster";
import { useAttendance } from "@/lib/query/classMeta";
import { todayKST } from "@/lib/date";
import { chimePick, tick, unlockAudio } from "@/lib/tools/chime";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { FocusButton, useFocusMode } from "@/components/tools/ToolsShell";

type Source = "class" | "range" | "custom";
interface Saved {
  date: string;
  picked: Record<Source, string[]>;
  excluded: string[];
  custom: string;
  rangeTo: number;
  noRepeat: boolean;
}
const LS = "class2nd-pick";
const blank = (date: string): Saved => ({
  date,
  picked: { class: [], range: [], custom: [] },
  excluded: [],
  custom: "",
  rangeTo: 25,
  noRepeat: true,
});

function load(date: string): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) ?? "null") as Saved | null;
    if (!raw) return blank(date);
    // 날짜가 바뀌면 뽑힌 기록·제외만 비우고 직접 입력 목록·설정은 남긴다
    if (raw.date !== date) return { ...blank(date), custom: raw.custom ?? "", rangeTo: raw.rangeTo ?? 25, noRepeat: raw.noRepeat ?? true };
    return { ...blank(date), ...raw, picked: { ...blank(date).picked, ...raw.picked } };
  } catch {
    return blank(date);
  }
}

export default function PickPage() {
  const today = todayKST();
  const [s, setS] = useState<Saved>(() => (typeof window === "undefined" ? blank(today) : load(today)));
  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify(s));
    } catch {}
  }, [s]);
  const [source, setSource] = useState<Source>("class");
  const [count, setCount] = useState(1);
  const [rolling, setRolling] = useState<string[] | null>(null);
  const [result, setResult] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const { on: focus, toggle } = useFocusMode();

  const { data: att } = useAttendance();
  const absent = useMemo(() => new Set((att?.[today] ?? []).map(String)), [att, today]);

  // 후보 전체 (뽑힌 사람 제외 전)
  const all: string[] = useMemo(() => {
    if (source === "class") return students.filter((x) => !x.inactive && !absent.has(String(x.id))).map((x) => x.name);
    if (source === "range") return Array.from({ length: Math.max(1, s.rangeTo) }, (_, i) => String(i + 1));
    return [...new Set(s.custom.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];
  }, [source, absent, s.rangeTo, s.custom]);
  const excluded = new Set(s.excluded);
  const picked = new Set(s.picked[source]);
  const pool = all.filter((x) => !excluded.has(x) && (!s.noRepeat || !picked.has(x)));

  const roll = () => {
    if (!pool.length || rolling) return;
    unlockAudio();
    const n = Math.min(count, pool.length);
    // 공정한 섞기(Fisher–Yates) — 결과는 먼저 정하고 화면은 연출만
    const bag = [...pool];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const win = bag.slice(0, n);
    setResult([]);
    let step = 0;
    const steps = 22;
    const spin = () => {
      step++;
      if (step >= steps) {
        setRolling(null);
        setResult(win);
        chimePick();
        setS((p) => ({ ...p, picked: { ...p.picked, [source]: [...p.picked[source], ...win] } }));
        return;
      }
      setRolling(Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]));
      tick();
      // 처음엔 빠르게, 끝으로 갈수록 느려진다 (40ms → ~260ms)
      timer.current = setTimeout(spin, 40 + Math.pow(step / steps, 2.2) * 220);
    };
    spin();
  };

  const shown = rolling ?? result;
  const big = shown.length <= 1;

  const stage = (
    <div
      className={`grid place-items-center rounded-card ${
        focus ? "flex-1 bg-transparent" : "min-h-56 border border-ink-200 bg-white p-6 shadow-card sm:min-h-72"
      }`}
    >
      {shown.length ? (
        <div className={`flex flex-wrap items-center justify-center ${big ? "" : "gap-3"}`}>
          {shown.map((name, i) => (
            <span
              key={rolling ? `r${i}` : `${name}-${i}`}
              className={`font-bold tracking-tight ${rolling ? "opacity-70" : "badge-pop"} ${
                big
                  ? focus
                    ? "text-[min(22vh,16vw)]"
                    : "text-6xl sm:text-8xl"
                  : `rounded-[16px] px-5 py-3 ${focus ? "bg-white/10 text-6xl" : "bg-ink-100 text-3xl sm:text-4xl"}`
              } ${focus ? "text-white" : "text-ink-900"}`}
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <p className={`text-center text-[15px] ${focus ? "text-white/50" : "text-ink-400"}`}>
          {pool.length ? `${pool.length}명 중에서 뽑아요` : "남은 후보가 없어요 — 아래 '처음부터'를 눌러 주세요"}
        </p>
      )}
    </div>
  );

  const rollBtn = (
    <button
      onClick={roll}
      disabled={!pool.length || !!rolling}
      className={`press h-14 min-w-44 rounded-full px-8 text-lg font-bold disabled:opacity-30 ${
        focus ? "bg-white text-ink-900" : "bg-ink-900 text-white"
      }`}
    >
      {rolling ? "뽑는 중…" : result.length ? "한 번 더" : "뽑기"}
    </button>
  );

  if (focus)
    return (
      <section className="fixed inset-0 z-[60] flex flex-col bg-ink-900 p-6 text-white">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-white/60">
            남은 후보 {pool.length}명{s.noRepeat ? ` · 뽑힌 ${picked.size}명` : ""}
          </p>
          <FocusButton on={focus} toggle={toggle} dark />
        </div>
        {stage}
        <div className="flex justify-center pb-4">{rollBtn}</div>
      </section>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <SegmentedControl
            tabs={[
              { key: "class", label: "우리 반" },
              { key: "range", label: "번호" },
              { key: "custom", label: "직접 입력" },
            ]}
            active={source}
            onChange={(k) => {
              setSource(k);
              setResult([]);
            }}
          />
        </div>
        <FocusButton on={focus} toggle={toggle} />
      </div>

      {stage}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center rounded-full bg-ink-100 p-1 text-sm font-bold">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`press h-9 w-10 rounded-full ${count === n ? "bg-white text-ink-900 shadow-card" : "text-ink-500"}`}
              aria-label={`${n}명 뽑기`}
            >
              {n}
            </button>
          ))}
        </div>
        {rollBtn}
      </div>

      {/* 설정 — 미리알림식 그룹 목록 */}
      <section className="divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200 bg-white shadow-card">
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 text-[15px]">
          <span className="font-bold text-ink-800">뽑힌 사람 제외</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-brand)]"
            checked={s.noRepeat}
            onChange={(e) => setS((p) => ({ ...p, noRepeat: e.target.checked }))}
          />
        </label>
        {source === "range" && (
          <label className="flex min-h-12 items-center justify-between gap-3 px-4 text-[15px]">
            <span className="font-bold text-ink-800">1번부터</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={2}
                max={200}
                value={s.rangeTo}
                onChange={(e) => setS((p) => ({ ...p, rangeTo: Math.max(2, Math.min(200, Number(e.target.value) || 2)) }))}
                className="h-9 w-20 rounded-btn bg-ink-100 px-3 text-right font-bold"
              />
              번까지
            </span>
          </label>
        )}
        {source === "custom" && (
          <div className="px-4 py-3">
            <p className="mb-2 text-[13px] text-ink-500">한 줄에 하나씩 (또는 쉼표로) — 모둠 이름·발표 주제·역할 무엇이든</p>
            <textarea
              value={s.custom}
              onChange={(e) => setS((p) => ({ ...p, custom: e.target.value }))}
              rows={4}
              placeholder={"1모둠\n2모둠\n3모둠"}
              className="w-full rounded-btn bg-ink-50 p-3 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-brand/30"
            />
          </div>
        )}
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink-500">
              후보 {all.filter((x) => !excluded.has(x)).length}명
              {source === "class" && absent.size ? ` · 오늘 결석 ${absent.size}명 빠짐` : ""} · 눌러서 빼기/넣기
            </span>
            <button
              onClick={() => {
                setS((p) => ({ ...p, picked: { ...p.picked, [source]: [] }, excluded: [] }));
                setResult([]);
              }}
              className="press rounded-full px-3 py-1 text-[13px] font-bold text-brand hover:bg-brand-weak"
            >
              처음부터
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {all.map((x) => {
              const off = excluded.has(x);
              const was = picked.has(x);
              return (
                <button
                  key={x}
                  onClick={() =>
                    setS((p) => ({
                      ...p,
                      excluded: off ? p.excluded.filter((y) => y !== x) : [...p.excluded, x],
                    }))
                  }
                  className={`press rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors ${
                    off
                      ? "bg-ink-50 text-ink-300 line-through"
                      : was && s.noRepeat
                        ? "bg-ink-100 text-ink-400"
                        : "bg-ink-100 text-ink-800 hover:bg-ink-200"
                  }`}
                >
                  {was && s.noRepeat && !off ? "✓ " : ""}
                  {x}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
