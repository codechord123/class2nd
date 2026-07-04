// 학급 명단 25명 (1학기와 동일) + 의장 5명.
// 거의 불변 데이터이므로 DB가 아닌 코드 상수로 두어 읽기 0회.
// 의장은 data/static/chairs.json이 단일 출처 — 2학기 회장단 선출 후 그 파일만 수정하고
// `node scripts/generate-schedules.mjs`로 자리표를 재생성한다.
import chairsJson from "../../data/static/chairs.json";
import type { Student } from "@/types";

const genderMap: Record<string, "M" | "F"> = {
  가동민: "M", 김선유: "M", 김수형: "M", 김예원: "F", 김용훈: "M",
  김원준: "M", 김주아: "F", 김찬우: "M", 김하영: "F", 문서우: "F",
  박찬: "M", 배한민: "M", 유선재: "F", 윤재익: "M", 이다인: "F",
  이서이: "F", 이서희: "F", 이채연: "F", 임유나: "F", 정지수: "M",
  조수아: "F", 조이환: "M", 최지완: "M", 한민종: "M", 홍아영: "F",
};

export const chairsProvisional = chairsJson.provisional; // true면 아직 1학기 회장단 임시값

const chairs: Record<string, { group: number; isWildcard?: boolean }> = {};
for (const [group, name] of Object.entries(chairsJson.chairs)) {
  chairs[name] = {
    group: Number(group),
    isWildcard: Number(group) === chairsJson.wildcardGroup,
  };
}

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
  { key: "질서", emoji: "👮", dept: "법무부", desc: "바른 자세 / 이동 시 질서 / 규칙 준수 점검" },
  { key: "학습", emoji: "📖", dept: "교육부", desc: "아침 플래너·숙제 확인 / 학습 활동 돕기" },
  { key: "건강", emoji: "🍃", dept: "보건환경부", desc: "우유 점검 / 바른 생활 / 자리 정리" },
  { key: "행정", emoji: "📁", dept: "행정안전부", desc: "과제·준비물 취합 / 유인물 배부 / 청소 담당" },
] as const;
