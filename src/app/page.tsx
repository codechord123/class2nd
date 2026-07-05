// 개요(홈) — 시각 위계: 오늘 할 일(행동) → 경고 → 목표(슬림 배너) → 마라톤 → 바로가기.
// 첫 화면 첫 카드는 '지금 해야 할 것' — 목표 배너는 슬림하게 그 아래 (디자이너 감사 반영).
import ReadingAlert from "@/components/reading/ReadingAlert";
import TurtleMarathon from "@/components/reading/TurtleMarathon";
import CustomLinks from "@/components/CustomLinks";
import MyStatus from "@/components/home/MyStatus";
import ClassBanner from "@/components/ClassBanner";

export default function HomePage() {
  return (
    <div className="space-y-4">
      {/* 오늘 할 일 + 내 현황 + 학급 스코어보드 */}
      <MyStatus />

      {/* 이번 주 독서 미달 경고 (개학 후 자동 활성화) */}
      <ReadingAlert />

      {/* 학급 목표 배너 — 교사탭에서 수정/숨김 (홈에서는 슬림) */}
      <ClassBanner compact />

      {/* 거북이 마라톤 (1학기 이어서) */}
      <TurtleMarathon />

      {/* 바로가기 링크 */}
      <CustomLinks />
    </div>
  );
}
