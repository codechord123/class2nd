// 개요(홈) — 시각 위계: 목표(배너) → 경고 → 내 현황(살아있는 숫자) → 마라톤 → 바로가기.
// 정적 안내 카드는 제거(레드팀: 매일 들어올 이유가 없는 홈이었음).
import ReadingAlert from "@/components/reading/ReadingAlert";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import CustomLinks from "@/components/CustomLinks";
import MyStatus from "@/components/home/MyStatus";

export default function HomePage() {
  return (
    <div className="space-y-4">
      {/* 최종 목표 배너 — 상단 고정 */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-5 text-white shadow">
        <p className="text-sm font-medium opacity-90">🐢 거북이 독서 최종 미션</p>
        <p className="mt-1 text-2xl font-extrabold">🍜 짜파게티 파티까지 달린다!</p>
      </div>

      {/* 이번 주 독서 미달 경고 (개학 후 자동 활성화) */}
      <ReadingAlert />

      {/* 내 현황 + 학급 스코어보드 */}
      <MyStatus />

      {/* 거북이 마라톤 (1학기 이어서) */}
      <TurtleMarathon />

      {/* 바로가기 링크 */}
      <CustomLinks />
    </div>
  );
}
