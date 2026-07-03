import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import TabNav from "@/components/TabNav";

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
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800">
        <Providers>
          <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
            <div className="mx-auto max-w-5xl px-4">
              <div className="flex items-center justify-between py-3">
                <h1 className="text-lg font-bold">🏫 2학기 학급 자치</h1>
              </div>
              <TabNav />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
