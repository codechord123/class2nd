import type { MetadataRoute } from "next";

// 웹 앱 매니페스트 — 디벗(태블릿) 홈 화면에 추가하면 이름·아이콘·브랜드색을 갖춘
// 앱처럼 열린다 (주소창 없는 standalone). Next가 /manifest.webmanifest로 서빙.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "2학기 학급 자치 시스템",
    short_name: "학급 자치",
    description: "우리 반 2학기 모둠·독서·상점 관리",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f4f6",
    theme_color: "#3182f6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
