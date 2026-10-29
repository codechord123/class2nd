"use client";
// 🎨 학급 화면 테마 — 교사 설정(classData/settings.theme)을 <html data-theme>에 반영한다.
// 마지막 테마를 이 기기에 기억해 두고(layout의 인라인 스크립트가 첫 화면 전에 적용) 깜빡임을 없앤다.
// 설정 문서는 원래 화면마다 읽는 문서라 추가 읽기 없음.
import { useEffect } from "react";
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";

export const THEME_KEY = "class2nd-theme";

function Apply() {
  const { data: settings } = useSettings();
  const theme = settings?.theme ?? "default";
  useEffect(() => {
    if (!settings) return;
    const el = document.documentElement;
    if (theme === "default") delete el.dataset.theme;
    else el.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 저장소가 막힌 기기 — 다음 접속 때 잠깐 기본 테마로 보였다가 바뀐다
    }
  }, [settings, theme]);
  return null;
}

export default function ThemeApplier() {
  const { role } = useSession();
  // 로그인 전엔 설정을 읽을 수 없다(규칙) — 기억해 둔 테마가 그대로 보인다
  return role ? <Apply /> : null;
}
