"use client";
// 🐢 거북이 독서 마라톤 — 1학기와 이어서 목표 진행:
//   학급 누적 = 1학기(정적) + 2학기(readingStats). 바에 1학기 구간을 진하게 표시.
//   juice: 거북이 종종걸음(상시) + 누르면 점프·입자 버스트·% 배지 팝·바 글로우·응원말.
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, increment, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { useFeedback } from "@/components/ui/Feedback";
import { s1TotalOf } from "@/lib/staticData";

// 🍪 학급 응원 클릭 — 10,000번 달성 시 학급 골드 +5 깜짝 이벤트 (1회성, 교사 접속 때 지급).
// 학생에게는 몇 번 눌렀는지 보여주지 않는다 (사용자 확정 — 서프라이즈 유지, 읽기 0).
// 쓰기 예산 설계: ① 쓰기는 50클릭당 1회 배칭 ② 기기별 하루 상한(초과 클릭은 애니메이션만)
// — 최악의 경우에도 25명 × 300클릭 ÷ 50 = 하루 150쓰기 상한.
const FLUSH_EVERY = 50;
const DAILY_CAP = 300; // 기기당 하루 카운트 상한

// 클릭 버스트 입자 — 방향·회전을 CSS 변수로 (매번 같은 모양이 아니게 응원 횟수로 순환)
const BURSTS = [
  [
    { e: "✨", dx: "-16px", dy: "-26px", rot: "-20deg" },
    { e: "💚", dx: "6px", dy: "-30px", rot: "10deg" },
    { e: "⭐", dx: "22px", dy: "-20px", rot: "25deg" },
  ],
  [
    { e: "🎉", dx: "-20px", dy: "-22px", rot: "-30deg" },
    { e: "✨", dx: "2px", dy: "-32px", rot: "0deg" },
    { e: "💛", dx: "18px", dy: "-24px", rot: "20deg" },
  ],
  [
    { e: "💨", dx: "-24px", dy: "-10px", rot: "-10deg" },
    { e: "⭐", dx: "8px", dy: "-28px", rot: "15deg" },
    { e: "✨", dx: "24px", dy: "-16px", rot: "30deg" },
  ],
];
const CHEER_WORDS = ["힘내라 거북이!", "달려 달려~ 🏃", "한 권 더!", "가즈아 🍜"];
// 연타 콤보 — 10연타마다 특별 연출 (순수 로컬, 전체 클릭 수 비공개 원칙과 무관)
const COMBO_BURST = [
  { e: "🔥", dx: "-18px", dy: "-30px", rot: "-25deg" },
  { e: "🎉", dx: "4px", dy: "-36px", rot: "5deg" },
  { e: "⭐", dx: "20px", dy: "-28px", rot: "25deg" },
];

export default function TurtleMarathon({ bare = false }: { bare?: boolean }) {
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();
  const { toast } = useFeedback();
  const [hopKey, setHopKey] = useState(0); // 클릭할 때마다 juice 애니메이션 재시작

  const [capped, setCapped] = useState(false);
  const pendingRef = useRef(0);
  // 연타 콤보 — 2초 안에 이어 누르면 쌓이고, 쉬면 리셋 (setHopKey 전에 갱신해 렌더에서 읽는다)
  const comboRef = useRef(0);
  const comboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (comboTimer.current) clearTimeout(comboTimer.current); }, []);
  // 기기별 일일 상한 — localStorage에 오늘 카운트 저장
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const dayCount = useRef<number | null>(null);
  const bumpDaily = (): boolean => {
    try {
      if (dayCount.current == null)
        dayCount.current = Number(localStorage.getItem(`turtle-day-${todayKey}`) ?? 0);
      if (dayCount.current >= DAILY_CAP) return false;
      dayCount.current += 1;
      localStorage.setItem(`turtle-day-${todayKey}`, String(dayCount.current));
      return true;
    } catch {
      return true;
    }
  };
  const flush = useCallback(() => {
    const n = pendingRef.current;
    if (n <= 0) return;
    pendingRef.current = 0;
    void setDoc(doc(db(), "classData", "turtleClicks"), { count: increment(n) }, { merge: true })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const onHide = () => flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [flush]);

  const goal = settings?.readingGoal ?? 1250;
  const s2Total = Object.values(stats?.total ?? {}).reduce((a, b) => a + b, 0);
  const s1Total = s1TotalOf(stats);
  const total = s1Total + s2Total;
  const progress = Math.min((total / goal) * 100, 100);
  const s1Progress = Math.min((s1Total / goal) * 100, 100);

  // 10연타마다 특별 버스트·응원말 — 연속 클릭에 '쌓이는 감각'을 준다
  const comboHit = comboRef.current > 0 && comboRef.current % 10 === 0;
  const burst = comboHit ? COMBO_BURST : BURSTS[hopKey % BURSTS.length];
  const cheer = comboHit ? `${comboRef.current}연타! 🔥` : CHEER_WORDS[hopKey % CHEER_WORDS.length];

  return (
    // bare: 다른 카드 안에 합쳐 넣을 때 (독서 탭 상단 압축 — 카드 개수 줄이기)
    <div className={bare ? "" : "rounded-card border border-ink-200 bg-white p-4 shadow-card"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-emerald-900">🐢 거북이 독서 마라톤</h3>
        {/* 성취 숫자가 이 블록의 주인공 — 크게, 진하게 */}
        <p className="flex items-baseline gap-1.5">
          <b className="tnum text-xl font-extrabold text-emerald-700">
            {total.toLocaleString()}
          </b>
          <span className="text-sm font-bold text-emerald-600">/ {goal.toLocaleString()}권</span>
          <span
            key={`b-${hopKey}`}
            className={`tnum rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-extrabold text-white ${
              hopKey > 0 ? "badge-pop" : ""
            }`}
          >
            {Math.floor(progress)}%
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          comboRef.current += 1;
          if (comboTimer.current) clearTimeout(comboTimer.current);
          comboTimer.current = setTimeout(() => { comboRef.current = 0; }, 2000);
          setHopKey((k) => k + 1); // 상한을 넘어도 애니메이션은 그대로 (재미 유지)
          if (!bumpDaily()) {
            if (!capped) {
              setCapped(true);
              toast("🐢 오늘 내 응원은 여기까지! 내일 또 눌러줘요 (기기당 하루 300번)", "warn");
            }
            return;
          }
          pendingRef.current += 1;
          if (pendingRef.current >= FLUSH_EVERY) flush();
        }}
        aria-label="거북이 응원하기"
        key={`bar-${hopKey}`}
        className={`press relative mt-2 block h-8 w-full cursor-pointer overflow-visible rounded-full border-2 border-emerald-300 bg-emerald-100 shadow-inner ${
          hopKey > 0 ? "bar-glow" : ""
        }`}
      >
        {/* 바 내부 채움은 둥근 모서리 밖으로 새지 않게 별도 래퍼에서 클리핑 */}
        <span className="absolute inset-0 overflow-hidden rounded-full">
          {/* 2학기 진행분 (연한 색, 전체 길이) — 줄무늬가 흐르며 '달리는 중' 느낌 */}
          <span
            className="bar-stripes absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-300 to-emerald-400 transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
          {/* 1학기 구간 (진한 색) */}
          <span
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-600"
            style={{ width: `${s1Progress}%` }}
          />
        </span>
        <span className="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-base drop-shadow">
          🍜
        </span>
        {/* 클릭 juice — 입자 버스트 + 응원말 (overflow-visible이라 바 위로 터져 나온다) */}
        {hopKey > 0 &&
          burst.map((pt, i) => (
            <span
              key={`p-${hopKey}-${i}`}
              className="juice-burst pointer-events-none absolute top-0 z-30 text-sm"
              style={
                {
                  left: `max(24px, calc(${progress}% - 10px))`,
                  "--dx": pt.dx,
                  "--dy": pt.dy,
                  "--rot": pt.rot,
                } as React.CSSProperties
              }
            >
              {pt.e}
            </span>
          ))}
        {hopKey > 0 && (
          <span
            key={`c-${hopKey}`}
            className="cheer-float pointer-events-none absolute -top-4 z-30 whitespace-nowrap text-[11px] font-extrabold text-emerald-700"
            style={{ left: `max(40px, calc(${progress}% + 8px))` }}
          >
            {cheer}
          </span>
        )}
        {/* 거북이 — 세로 중앙은 translate 속성(-translate-y-1/2), 모션은 transform (분리!) */}
        <span
          key={`t-${hopKey}`}
          className={`absolute top-1/2 z-20 -translate-y-1/2 text-xl drop-shadow-lg transition-all duration-1000 ease-out ${
            hopKey > 0 ? "turtle-hop" : "turtle-runner"
          }`}
          style={{ left: `max(4px, calc(${progress}% - 26px))` }}
          onAnimationEnd={(e) => {
            // 점프가 끝나면 다시 종종걸음으로
            if (e.animationName === "turtle-hop")
              e.currentTarget.classList.replace("turtle-hop", "turtle-runner");
          }}
        >
          🐢
        </span>
      </button>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium text-emerald-700">
        {/* 클릭 수는 비공개 (깜짝 이벤트) — 응원 자체가 목적처럼 보이게 */}
        <span>👆 거북이를 눌러 응원해 주세요 — 응원이 많이 모이면 좋은 일이 생길지도…? 🎁</span>
        <span>
          1학기 <b className="tnum">{s1Total}권</b> + 2학기 <b className="tnum">{s2Total}권</b> — 이어서 달려요!
        </span>
      </div>
    </div>
  );
}
