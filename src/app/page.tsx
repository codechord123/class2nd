// 개요(홈) — 사용자 확정 위계: 학급 미션(공지, 최상단) → 오늘 할 일(크게) →
// 내 현황+우리 반(통합) → 거북이 독서 통합(마라톤+내 통계+독려) → 바로가기.
import CustomLinks from "@/components/CustomLinks";
import MyStatus from "@/components/home/MyStatus";
import ClassBanner from "@/components/ClassBanner";

export default function HomePage() {
  return (
    <div className="space-y-4">
      {/* 학급 미션(공지) 배너 — 중요도 최상, 교사탭에서 수정/숨김 */}
      <ClassBanner />

      {/* 오늘 할 일(크게) + 내 현황·우리 반 통합 + 독서 통합 카드 */}
      <MyStatus />

      {/* 바로가기 링크 */}
      <CustomLinks />
    </div>
  );
}
