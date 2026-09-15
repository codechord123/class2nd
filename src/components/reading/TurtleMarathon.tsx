"use client";
// 🐢 거북이 독서 마라톤 — 1학기와 이어서 목표 진행:
//   학급 누적 = 1학기(정적) + 2학기(readingStats).
//   🚫 채움 게이지는 쓰지 않는다 — 1·2학기 두 겹 중 연한 쪽이 배경과 구분되지 않아
//      "거북이 위치가 게이지와 안 맞는다"는 착시를 만들었다 (사용자 지적 2026-09-16).
//      트랙은 비워 두고 '거북이가 어디까지 왔는지'를 말풍선으로 직접 읽게 한다.
//   🐰 페이스 토끼 = 방학식(READING_DEADLINE)까지 목표를 채우려면 오늘 몇 권이어야 하는지.
//      거북이가 토끼보다 앞서면 잘 가고 있는 것 — 한눈에 비교되는 게 핵심.
//   juice: 거북이 종종걸음(상시) + 누르면 점프·입자 버스트·% 배지 팝·바 글로우·응원말.
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, increment, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { useFeedback } from "@/components/ui/Feedback";
import { s1TotalOf } from "@/lib/staticData";
import { READING_DEADLINE, SEMESTER_START } from "@/lib/schedule";
import { todayKST } from "@/lib/date";

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
  // 연타 콤보 — 2초 안에 이어 누르면 쌓이고, 쉬면 리셋
  const [combo, setCombo] = useState(0);
  const comboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (comboTimer.current) clearTimeout(comboTimer.current); }, []);
  // 기기별 일일 상한 — localStorage에 오늘 카운트 저장
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const dayCount = useRef<number | null>(null);
  const bumpDaily = (): boolean => {
    try {
      if (dayCount.current == null) {
        dayCount.current = Number(localStorage.getItem(`turtle-day-${todayKey}`) ?? 0);
        // 지난 날짜 키 청소 — 안 하면 기기마다 하루 1개씩 영구 누적
        // (삭제 중 인덱스가 재배열되므로 키를 먼저 모아서 지운다)
        Object.keys(localStorage)
          .filter((k) => k.startsWith("turtle-day-") && k !== `turtle-day-${todayKey}`)
          .forEach((k) => localStorage.removeItem(k));
      }
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
  const progress = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

  // 🐰 페이스 — 개학부터 방학식까지를 균등하게 나눠 '오늘까지 있어야 할 권수'.
  //    1학기 권수는 이미 쌓인 몫이라 출발선으로 두고, 남은 목표만 기간에 배분한다.
  const day = (d: string) => new Date(d + "T00:00:00Z").getTime();
  const span = day(READING_DEADLINE) - day(SEMESTER_START);
  const elapsed = span > 0 ? (day(todayKST()) - day(SEMESTER_START)) / span : 1;
  const ratio = Math.min(Math.max(elapsed, 0), 1);
  const paceBooks = Math.round(s1Total + (goal - s1Total) * ratio);
  const pacePct = goal > 0 ? Math.min((paceBooks / goal) * 100, 100) : 0;
  const ahead = total >= paceBooks;
  const gap = Math.abs(total - paceBooks);
  // 트랙 양 끝에서 이모지가 잘리지 않게 안쪽으로 살짝 밀어 둔다 (표시 전용 보정)
  const clampPct = (p: number) => Math.min(Math.max(p, 3), 97);
  const daysLeft = Math.max(
    0,
    Math.ceil((day(READING_DEADLINE) - day(todayKST())) / 86400000)
  );

  // 10연타마다 특별 버스트·응원말 — 연속 클릭에 '쌓이는 감각'을 준다
  const comboHit = combo > 0 && combo % 10 === 0;
  const burst = comboHit ? COMBO_BURST : BURSTS[hopKey % BURSTS.length];
  const cheer = comboHit ? `${combo}연타! 🔥` : CHEER_WORDS[hopKey % CHEER_WORDS.length];

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
          setCombo((c) => c + 1);
          if (comboTimer.current) clearTimeout(comboTimer.current);
          comboTimer.current = setTimeout(() => setCombo(0), 2000);
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
        className={`press relative mb-5 mt-7 block h-8 w-full cursor-pointer overflow-visible rounded-full border-2 border-emerald-300 bg-emerald-50 shadow-inner ${
          hopKey > 0 ? "bar-glow" : ""
        }`}
      >
        {/* 트랙 눈금 — 채움 대신 25% 간격의 옅은 선으로 거리를 가늠하게 (착시 없음) */}
        <span className="absolute inset-0 overflow-hidden rounded-full">
          {[25, 50, 75].map((t) => (
            <span key={t} className="absolute top-0 h-full w-px bg-emerald-200" style={{ left: `${t}%` }} />
          ))}
        </span>
        <span className="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-base drop-shadow">
          🍜
        </span>

        {/* 🐰 페이스 토끼 — 오늘까지 있어야 할 '기준선'.
            거북이와 자리가 가까우면 둘이 겹쳐 읽히지 않으므로(실제로 24% vs 28%에서 겹쳤다)
            토끼는 바 '아래', 거북이는 바 '위'로 세로를 나눠 놓는다. */}
        <span
          className="pointer-events-none absolute top-0 z-10 h-full"
          style={{ left: `${clampPct(pacePct)}%`, translate: "-50% 0" }}
        >
          <span className="absolute left-1/2 top-0 h-full -translate-x-1/2 border-l-2 border-dashed border-amber-500" />
          <span className="absolute left-1/2 top-full mt-0.5 block -translate-x-1/2 text-base leading-none">
            🐰
          </span>
        </span>

        {/* 🐢 거북이 — 현재 권수 자리. 말풍선으로 몇 권인지 바로 읽힌다 */}
        <span
          key={`t-${hopKey}`}
          className={`absolute top-1/2 z-20 text-xl drop-shadow-lg transition-all duration-1000 ease-out ${
            hopKey > 0 ? "turtle-hop" : "turtle-runner"
          }`}
          style={{ left: `${clampPct(progress)}%`, translate: "-50% -50%" }}
          onAnimationEnd={(e) => {
            // 점프가 끝나면 다시 종종걸음으로
            if (e.animationName === "turtle-hop")
              e.currentTarget.classList.replace("turtle-hop", "turtle-runner");
          }}
        >
          <span
            className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white shadow ${
              ahead ? "bg-emerald-600" : "bg-amber-500"
            }`}
          >
            {total.toLocaleString()}권
            <span
              className={`absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent ${
                ahead ? "border-t-emerald-600" : "border-t-amber-500"
              }`}
            />
          </span>
          🐢
        </span>

        {/* 클릭 juice — 입자 버스트 + 응원말 (overflow-visible이라 바 위로 터져 나온다) */}
        {hopKey > 0 &&
          burst.map((pt, i) => (
            <span
              key={`p-${hopKey}-${i}`}
              className="juice-burst pointer-events-none absolute top-0 z-30 text-sm"
              style={
                {
                  left: `${clampPct(progress)}%`,
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
            className="cheer-float pointer-events-none absolute -top-10 z-30 whitespace-nowrap text-[11px] font-extrabold text-emerald-700"
            style={{ left: `calc(${clampPct(progress)}% + 14px)` }}
          >
            {cheer}
          </span>
        )}
      </button>

      {/* 🐰 페이스 안내 — 토끼가 왜 거기 있는지 한 줄로 (숫자가 곧 다음 행동) */}
      <p
        className={`rounded-btn px-3 py-2 text-[12px] font-bold ${
          ahead ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
        }`}
      >
        🐰 오늘까지 <b className="tnum">{paceBooks.toLocaleString()}권</b>이면 방학식(1월 8일)에
        딱 맞아요 ·{" "}
        {ahead ? (
          <>
            🐢 우리 반은 <b className="tnum">{gap.toLocaleString()}권 앞서</b> 달리는 중! 이대로면
            목표 달성이에요 🎉
          </>
        ) : (
          <>
            🐢 지금은 <b className="tnum">{gap.toLocaleString()}권 뒤</b> — 남은{" "}
            <b className="tnum">{daysLeft}일</b> 동안 조금만 더 달리면 따라잡아요!
          </>
        )}
      </p>
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
