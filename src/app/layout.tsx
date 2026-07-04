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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-ink-50 text-ink-800">
        <Providers>
          <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/80 backdrop-blur-md">
            <BetaBanner />
            <div className="mx-auto max-w-3xl px-4 lg:max-w-5xl">
              <div className="flex items-center justify-between py-3">
                <h1 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-ink-900">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-extrabold text-white shadow-card">
                    학
                  </span>
                  학급 자치
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">
                    2학기
                  </span>
                </h1>
                <UserChip />
              </div>
              <TabNav />
            </div>
          </header>
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 lg:max-w-5xl">
            <LoginGate>{children}</LoginGate>
          </main>
        </Providers>
      </body>
    </html>
  );
}
