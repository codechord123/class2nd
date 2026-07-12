import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import TabNav from "@/components/TabNav";
import LoginGate from "@/components/LoginGate";
import UserChip from "@/components/UserChip";
import BetaBanner from "@/components/BetaBanner";

export const metadata: Metadata = {
  title: "2학기 학급 자치 시스템",
  description: "우리 반 2학기 모둠·독서·상점 관리",
  // 디벗 홈 화면 등록 대응 — icon.svg/apple-icon.png(같은 폴더)는 Next가 자동 연결
  appleWebApp: { capable: true, title: "학급 자치", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3182f6", // 브라우저 UI 색 — 헤더 로고와 동일한 brand
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      {/* 배경은 ink-100(옅은 회색) — 흰 카드가 배경과 분리되어 블록 경계가 또렷해진다 */}
      <body className="min-h-full flex flex-col bg-ink-100 text-ink-800">
        <Providers>
          {/* 브랜드 행은 스크롤과 함께 지나가고 탭만 상단 고정 — 작은 화면에서
              상시 점유 높이를 132px → 60px대로 (레이아웃 감사 반영) */}
          <header className="bg-white">
            <BetaBanner />
            <div className="mx-auto max-w-3xl px-4 lg:max-w-5xl">
              <div className="flex items-center justify-between gap-2 py-3">
                {/* 좁은 화면(아이폰 390px 교사 모드)에서 '학급 자\n치'로 꺾이지 않게 nowrap,
                    장식용 2학기 칩은 sm 미만에서 숨겨 우측 버튼 자리를 확보 */}
                <h1 className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[15px] font-extrabold tracking-tight text-ink-900">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-extrabold text-white shadow-card">
                    학
                  </span>
                  학급 자치
                  <span className="hidden rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500 sm:inline-block">
                    2학기
                  </span>
                </h1>
                <UserChip />
              </div>
            </div>
          </header>
          <div className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur-md">
            <div className="mx-auto max-w-3xl px-4 pt-2 lg:max-w-5xl">
              <TabNav />
            </div>
          </div>
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 lg:max-w-5xl">
            <LoginGate>{children}</LoginGate>
          </main>
        </Providers>
      </body>
    </html>
  );
}
