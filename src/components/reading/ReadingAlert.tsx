"use client";
// 주간 의무 권수 미달 경고 — 학생 홈 최상단 고정 (요구사항 §C).
// 읽기: readingStats 1문서 + settings 1문서 (둘 다 캐시).
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { useReadingStats } from "@/lib/query/reading";
import { todayKST, weekOfDate } from "@/lib/date";
import { SEMESTER_START, TOTAL_WEEKS } from "@/lib/schedule";

export default function ReadingAlert() {
  const { role, studentId } = useSession();
  const { data: settings } = useSettings();
  const { data: stats } = useReadingStats();

  if (role !== "student" || !studentId || !settings || !stats) return null;
  // 개학 전에는 경고하지 않음
  if (new Date() < new Date(SEMESTER_START + "T00:00:00+09:00")) return null;

  const week = weekOfDate(todayKST(), SEMESTER_START, TOTAL_WEEKS);
  const read = stats.byWeek?.[String(week)]?.[String(studentId)] ?? 0;
  const shortfall = settings.weeklyReadingQuota - read;

  if (shortfall <= 0) {
    return (
      <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        🎉 이번 주 거북이 독서 {settings.weeklyReadingQuota}권 달성! 최고예요!
      </div>
    );
  }
  return (
    <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
      🐢 이번 주 거북이 독서가 <b>{shortfall}권</b> 부족해요! ({read}/
      {settings.weeklyReadingQuota}권) — 짜파게티 파티가 기다리고 있어요 🍜
    </div>
  );
}
