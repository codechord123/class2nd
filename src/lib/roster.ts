// 학급 명단 25명 (1학기와 동일) + 의장 5명 (학기초 고정).
// 거의 불변 데이터이므로 DB가 아닌 코드 상수로 두어 읽기 0회.
import type { Student } from "@/types";

const genderMap: Record<string, "M" | "F"> = {
  가동민: "M", 김선유: "M", 김수형: "M", 김예원: "F", 김용훈: "M",
  김원준: "M", 김주아: "F", 김찬우: "M", 김하영: "F", 문서우: "F",
  박찬: "M", 배한민: "M", 유선재: "F", 윤재익: "M", 이다인: "F",
  이서이: "F", 이서희: "F", 이채연: "F", 임유나: "F", 정지수: "M",
  조수아: "F", 조이환: "M", 최지완: "M", 한민종: "M", 홍아영: "F",
};

// 의장: 1모둠 윤재익(반장1), 2모둠 김하영(반장2), 3모둠 가동민(부반장1),
//       4모둠 홍아영(부반장2), 5모둠 이다인(와일드카드)
const chairs: Record<string, { group: number; isWildcard?: boolean }> = {
  윤재익: { group: 1 },
  김하영: { group: 2 },
  가동민: { group: 3 },
  홍아영: { group: 4 },
  이다인: { group: 5, isWildcard: true },
};

export const students: Student[] = Object.keys(genderMap).map((name, i) => ({
  id: i + 1,
  name,
  gender: genderMap[name],
  isChair: name in chairs,
  chairOfGroup: chairs[name]?.group,
  isWildcard: chairs[name]?.isWildcard ?? false,
}));

export const studentById = new Map(students.map((s) => [s.id, s]));

export const ROLE_INFO = [
  { key: "소통", emoji: "👑", dept: "의장", desc: "모둠 토의 주재 / 말차례 배분 / 소외 챙기기" },
  { key: "질서", emoji: "⚖️", dept: "법무부", desc: "바른 자세 / 이동 시 질서 / 규칙 준수 점검" },
  { key: "학습", emoji: "📖", dept: "교육부", desc: "아침 플래너·숙제 확인 / 학습 활동 돕기" },
  { key: "건강", emoji: "🍃", dept: "보건환경부", desc: "우유 점검 / 바른 생활 / 자리 정리" },
  { key: "행정", emoji: "📁", dept: "행정안전부", desc: "과제·준비물 취합 / 유인물 배부 / 청소 담당" },
] as const;
