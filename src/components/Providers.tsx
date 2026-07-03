"use client";
// React Query 전역 설정 — 읽기 절감의 1차 방어선 (설계안 §5 원칙 1·3).
// staleTime을 길게 잡아 같은 데이터 재조회를 자동 차단한다.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { FeedbackProvider } from "@/components/ui/Feedback";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 기본 5분 — 자리표·명단 등은 훅에서 더 길게 지정
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false, // 창 전환마다 재조회 금지 (1학기 낭비 패턴 차단)
            retry: 1,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <FeedbackProvider>{children}</FeedbackProvider>
    </QueryClientProvider>
  );
}
