"use client";
// 주간 의무 권수 경고 + 독서 독려(스트릭·마감 임박) — 학생 홈/독서 탭 상단.
// 읽기: readingStats 1문서 + settings 1문서 (둘 다 캐시).
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { readingStreaks, weekBooks } from "@/lib/readingStreak";

export default function ReadingAlert() {
  const { role, studentId } = useSession();
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();

  if (role !== "student" || !studentId || !settings || !stats) return null;
  const today = todayKST();
  // 개학 전(방학)에는 주간 미션·스트릭이 없다 — 짧은 한 줄만 (첫 화면 공간 확보)
  if (today < SEMESTER_START) {
    const vacBooks = weekBooks(stats, studentId, 0); // 0주차 = 방학 버킷
    return (
      <div className="rounded-btn bg-success-weak px-4 py-2.5 text-sm text-success">
        🏖️ 방학 독서는 쓴 만큼 그대로 쌓여요
        {vacBooks > 0 && (
          <>
            {" "}
            (지금 <b>{vacBooks}권</b> · 권당 +2점, 하루 2권까지)
          </>
        )}{" "}
        — 주간 미션·스트릭은 개학부터!
      </div>
    );
  }

  const week = weekOfDate(today, SEMESTER_START, TOTAL_WEEKS);
  const quota = settings.weeklyReadingQuota;
  const read = weekBooks(stats, studentId, week);
  const shortfall = quota - read;
  const { current, best } = readingStreaks(stats, studentId, quota, week);

  // 주간 마감(일요일)까지 남은 날 — 월=7 … 일=1 (주 시작이 월요일)
  const dow = new Date(today + "T00:00:00+09:00").getUTCDay(); // 일=0 … 토=6 (KST 자정 → UTC 요일 동일)
  const daysLeft = dow === 0 ? 1 : 8 - dow;

  const streakChip =
    current >= 1 ? (
      <span className="ml-2 rounded-full border border-ink-200/60 bg-white/70 px-2 py-0.5 text-xs font-bold">
        🔥 {current}주 연속{best > current ? ` · 최고 ${best}주` : ""}
      </span>
    ) : best >= 1 ? (
      <span className="ml-2 rounded-full border border-ink-200/60 bg-white/70 px-2 py-0.5 text-xs font-bold">
        🏆 최고 기록 {best}주 연속
      </span>
    ) : null;

  // 알림은 얇은 줄 문법 — 상점 시간 안내와 동일 (컬러 카드 블록이 여러 층 쌓이지 않게)
  if (shortfall <= 0) {
    return (
      <div className="rounded-btn bg-success-weak px-4 py-2.5 text-sm text-success">
        🎉 이번 주 거북이 독서 {quota}권 달성!
        {current >= 1 ? ` ${current}주 연속 — 연속 보너스 +${Math.min(current, 3)}점 예약! 🔥` : " 최고예요!"}
        {streakChip}
      </div>
    );
  }

  // 마감 임박(2일 이하)에만 강한 경고 — 그 전부터 빨간불이면 학급 목표보다 경고가 먼저 보인다
  if (daysLeft <= 2) {
    return (
      <div className="rounded-btn bg-danger-weak px-4 py-2.5 text-sm font-bold text-danger">
        ⏰ 주간 마감 D-{daysLeft}! 아직 <b>{shortfall}권</b> 남았어요 ({read}/{quota}권)
        {current >= 1 && ` — 지금 안 읽으면 🔥${current}주 연속 기록이 끊겨요!`}
        {streakChip}
      </div>
    );
  }
  // 주 중반(D-3~4)인데 아직 2권 이상 남음 — 마감 전 몰아치기 예방용 중간 페이스 점검
  if (daysLeft <= 4 && shortfall >= 2) {
    return (
      <div className="rounded-btn bg-warn-weak px-4 py-2.5 text-sm font-medium text-warn">
        🐢 주 중반이에요 — 아직 <b>{shortfall}권</b> 남았어요 ({read}/{quota}권). 오늘 1권 읽으면
        주말이 여유로워져요!
        {streakChip}
      </div>
    );
  }
  return (
    <div className="rounded-btn border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-600">
      🐢 이번 주 <b className="text-emerald-700">{shortfall}권</b> 남았어요 ({read}/{quota}권) —
      매주 채우면 연속 보너스 점수가 커져요! 🔥
      {streakChip}
    </div>
  );
}
