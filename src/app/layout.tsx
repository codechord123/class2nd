import type { Metadata, Viewport } from "next";
import { Jua } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/shell/AppShell";
import LoginGate from "@/components/LoginGate";
import BetaBanner from "@/components/BetaBanner";
import CoastDecor from "@/components/CoastDecor";
import ThemeApplier from "@/components/ThemeApplier";
import RivieraFx from "@/components/RivieraFx";
import ReauthDialog from "@/components/ReauthDialog";

// 🌊 바닷마을 테마 제목 글꼴 — 테마가 켜졌을 때만 CSS가 쓰므로, 꺼진 기기는 글꼴 파일을 받지 않는다
const jua = Jua({ weight: "400", preload: false, display: "swap", variable: "--font-coast" });

export const metadata: Metadata = {
  title: "2학기 학급 자치 시스템",
  description: "우리 반 2학기 모둠·독서·상점 관리",
  // 디벗 홈 화면 등록 대응 — icon.svg/apple-icon.png(같은 폴더)는 Next가 자동 연결
  appleWebApp: { capable: true, title: "학급 자치", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3eee6", // 브라우저 UI 색 — 모노크롬 개편: 페이지 바탕과 같은 옅은 회색
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme은 아래 인라인 스크립트가 첫 화면 전에 붙인다 → 서버 HTML과 다를 수 있어 경고 억제
    <html lang="ko" className={`h-full antialiased ${jua.variable}`} suppressHydrationWarning>
      <head>
        {/* 🎨 이 기기가 기억하는 학급 테마를 첫 페인트 전에 적용 (설정 읽기를 기다리면 깜빡인다) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('class2nd-theme');if(t&&t!=='default')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
      </head>
      {/* 배경은 ink-100(옅은 회색) — 흰 카드가 배경과 분리되어 블록 경계가 또렷해진다 */}
      <body className="min-h-full flex flex-col bg-ink-100 text-ink-800">
        <Providers>
          <ThemeApplier />
          <RivieraFx />
          <ReauthDialog />
          {/* 🏛️ 2026-11 재설계: 머리+탭줄 → 왼쪽 사이드바(태블릿·PC) / 아래 탭 막대(휴대폰) */}
          <BetaBanner />
          <CoastDecor />
          <AppShell>
            <LoginGate>{children}</LoginGate>
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
