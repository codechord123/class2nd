"use client";
// 주간 의무 권수 경고 + 독서 독려(스트릭·마감 임박) — 학생 홈/독서 탭 상단.
// 읽기: readingStats 1문서 + settings 1문서 (둘 다 캐시).
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";
import { countedWeekBooks, readingStreaks } from "@/lib/readingStreak";
import { BETA_END } from "@/components/BetaBanner";

export default function ReadingAlert() {
  const { role, studentId } = useSession();
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();

  if (role !== "student" || !studentId || !settings || !stats) return null;
  const today = todayKST();
  // 방학(베타 종료 후 ~ 개학 전)에는 경고하지 않음
  if (today < SEMESTER_START && today > BETA_END) return null;

  const week = weekOfDate(today, SEMESTER_START, TOTAL_WEEKS);
  const quota = settings.weeklyReadingQuota;
  // 목표 판정은 '인정 권수'(하루 최대 2권) — 몰아쓰기 방지, 정산과 동일 기준
  const read = countedWeekBooks(stats, studentId, week);
  const rawRead = stats.byWeek?.[String(week)]?.[String(studentId)] ?? 0;
  const capNote = rawRead > read ? " (하루 최대 2권까지 목표로 인정돼요)" : "";
  const shortfall = quota - read;
  const { current, best } = readingStreaks(stats, studentId, quota, week);

  // 주간 마감(일요일)까지 남은 날 — 월=7 … 일=1 (주 시작이 월요일)
  const dow = new Date(today + "T00:00:00+09:00").getUTCDay(); // 일=0 … 토=6 (KST 자정 → UTC 요일 동일)
  const daysLeft = dow === 0 ? 1 : 8 - dow;

  const streakChip =
    current >= 1 ? (
      <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
        🔥 {current}주 연속{best > current ? ` · 최고 ${best}주` : ""}
      </span>
    ) : best >= 1 ? (
      <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
        🏆 최고 기록 {best}주 연속
      </span>
    ) : null;

  if (shortfall <= 0) {
    return (
      <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        🎉 이번 주 거북이 독서 {quota}권 달성!
        {current >= 1 ? ` ${current}주 연속 — 연속 보너스 +${Math.min(current, 3)}점 예약! 🔥` : " 최고예요!"}
        {streakChip}
      </div>
    );
  }

  // 마감 임박(3일 이하) — 강한 경고
  if (daysLeft <= 3) {
    return (
      <div className="rounded-card border border-danger/40 bg-danger-weak p-4 text-sm font-bold text-danger">
        ⏰ 주간 마감 D-{daysLeft}! 아직 <b>{shortfall}권</b> 남았어요 ({read}/{quota}권)
        {capNote}
        {current >= 1 && ` — 지금 안 읽으면 🔥${current}주 연속 기록이 끊겨요!`}
        {streakChip}
      </div>
    );
  }
  return (
    <div className="rounded-card border border-warn/30 bg-warn-weak p-4 text-sm font-medium text-warn">
      🐢 이번 주 거북이 독서가 <b>{shortfall}권</b> 남았어요 ({read}/{quota}권){capNote} — 매주
      채우면 연속 보너스 점수가 커져요! 🔥
      {streakChip}
    </div>
  );
}
