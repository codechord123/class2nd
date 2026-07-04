// 개요(홈) — 시각 위계: 목표(배너) → 경고 → 내 현황(살아있는 숫자) → 마라톤 → 바로가기.
// 정적 안내 카드는 제거(레드팀: 매일 들어올 이유가 없는 홈이었음).
import ReadingAlert from "@/components/reading/ReadingAlert";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import CustomLinks from "@/components/CustomLinks";
import MyStatus from "@/components/home/MyStatus";
import ClassBanner from "@/components/ClassBanner";

export default function HomePage() {
  return (
    <div className="space-y-4">
      {/* 학급 목표 배너 — 교사탭에서 수정/숨김 */}
      <ClassBanner />

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
