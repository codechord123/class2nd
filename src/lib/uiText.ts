"use client";
// 문구 오버라이드 — 자주 다듬는 안내문·독려 메시지를 코딩 없이 교사 화면에서 수정
// (classData/uiText 문서 1개, 30분 캐시). 목록은 카탈로그로 관리 — 키를 추가하면
// 편집 패널에 자동으로 나타난다. 레이아웃·구조 변경은 여기 대상이 아님.
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface UiTextEntry {
  key: string;
  label: string; // 편집 패널에 보일 이름
  def: string; // 기본 문구 (비우면 이 값으로 복귀)
  multiline?: boolean; // 줄바꿈 구분 목록 (예: 독려 메시지 로테이션)
}

export const UI_TEXT_CATALOG: UiTextEntry[] = [
  {
    key: "home.cheers",
    label: "홈 · 독서 참여 독려 메시지 (한 줄에 하나씩 — 날마다 돌아가며 표시)",
    def: [
      "오늘 10분만 읽어도 거북이는 앞으로 가요 🐢",
      "짧은 책도 1권! 완독의 기쁨을 쌓아봐요 📚",
      "감상문 한 편 = 점수 +1 & 학급 마라톤 전진!",
      "친구 감상문에 댓글 달고 다음 책 아이디어를 얻어봐요 💬",
      "연속 주 기록(스트릭)을 이어가면 보너스가 커져요 🔥",
    ].join("\n"),
    multiline: true,
  },
  {
    key: "team.bossDesc",
    label: "Team · 오늘의 부서장 투표 안내문",
    def: "오늘 가장 친절하게 모둠원들을 안내하고 자기 부서 역할을 잘한 부서장 1명을 뽑아주세요. 받은 표는 1표당 +1점이 돼요!",
  },
  {
    key: "team.reflectionDesc",
    label: "Team · 세션 모둠 반성 안내문",
    def: "2주 동안 우리 모둠은 어땠나요? 잘한 점과 다음 세션에 바꾸고 싶은 점을 남겨요 — 세션 리포트에 실려요.",
  },
];

export function useUiText() {
  return useQuery({
    queryKey: ["uiText"],
    queryFn: async (): Promise<Record<string, string>> => {
      const snap = await getDoc(doc(db(), "classData", "uiText"));
      return snap.exists() ? (snap.data() as Record<string, string>) : {};
    },
    staleTime: 30 * 60 * 1000,
  });
}

/** 오버라이드가 있으면 그것, 없으면 기본 문구 */
export function uiTextOf(
  map: Record<string, string> | undefined,
  key: string,
  def?: string
): string {
  const v = map?.[key]?.trim();
  if (v) return v;
  return def ?? UI_TEXT_CATALOG.find((e) => e.key === key)?.def ?? "";
}
