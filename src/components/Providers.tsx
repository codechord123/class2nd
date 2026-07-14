"use client";
// React Query 전역 설정 — 읽기 절감의 1차 방어선 (설계안 §5 원칙 1·3).
// staleTime을 길게 잡아 같은 데이터 재조회를 자동 차단한다.
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FeedbackProvider, useFeedback } from "@/components/ui/Feedback";

// 실패 토스트 스로틀 — 오프라인이면 여러 쿼리가 한꺼번에 실패하므로 10초에 1번만 알린다
let lastErrToast = 0;

function QueryProviders({ children }: { children: React.ReactNode }) {
  const { toast } = useFeedback();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [client] = useState(
    () =>
      new QueryClient({
        // 읽기 실패를 조용히 삼키면 화면이 '무한 스켈레톤'으로 멈춘다 (학교 와이파이 불안정 대비).
        // 단 permission-denied는 제외 — 규칙 미게시 감지(오늘 할 일 배너) 등이 신호로 쓰는 오류라
        // 전역 토스트를 띄우면 오진이 된다.
        queryCache: new QueryCache({
          onError: (e, query) => {
            if ((e as { code?: string })?.code === "permission-denied") return;
            // 캐시된 데이터가 이미 화면에 있으면 백그라운드 재조회 실패는 조용히 —
            // 다음 재조회가 알아서 복구한다. 토스트는 '정말 안 보일 때'(첫 로드 실패)만.
            if (query.state.data !== undefined) return;
            const now = Date.now();
            if (now - lastErrToast < 10_000) return;
            lastErrToast = now;
            toastRef.current(
              "⚠️ 불러오기에 실패했어요 — 인터넷 연결을 확인하고 새로고침해 주세요",
              "warn"
            );
          },
        }),
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
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // Feedback을 바깥에 — 쿼리 전역 onError가 토스트를 쓸 수 있게 (순서만 바뀌고 동작 동일)
  return (
    <FeedbackProvider>
      <QueryProviders>{children}</QueryProviders>
    </FeedbackProvider>
  );
}
