"use client";
// ✅ 오늘 — 학생의 첫 화면 (2026-11 재설계, 사용자: "자주 쓰는 건 위로, 페이지를 아래로 내리지 않게, 중복 정리").
//   왼쪽: 오늘 할 일 목록(완료 체크) + 내 현황 + 새 소식   오른쪽: 고른 할 일 하나를 바로 여기서.
//   예전 홈의 독서 마라톤·학급 배너는 '독서'에만, 할 일 타일 → 모둠 화면 이동은 없앴다(여기서 바로 한다).
// 교사는 '선생님 › 오늘 운영'이 첫 화면이다.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/stores/session";
import { TeamScreen } from "@/components/team/TeamScreen";
import MyStatus from "@/components/home/MyStatus";
import CustomLinks from "@/components/CustomLinks";

export default function TodayPage() {
  const { role } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (role === "teacher") router.replace("/teacher");
  }, [role, router]);
  if (role !== "student") return null;
  return (
    <div className="space-y-6">
      <TeamScreen mode="today" aside={<MyStatus variant="aside" />} />
      <CustomLinks />
    </div>
  );
}
