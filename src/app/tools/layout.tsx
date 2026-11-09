"use client";
// 🧰 교실 도구 — 선생님 › 교실 도구. 수업 중 화면에 띄워 쓰는 것들(칠판·타이머·뽑기·체크·소음).
// 위계: 1단 '선생님' → 2단 '교실 도구' → 3단 이 화면의 도구 탭.
import { useSyncExternalStore } from "react";
import { useSession } from "@/stores/session";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { ToolsTabs, TimerWatcher } from "@/components/tools/ToolsShell";

const noop = () => () => {};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const { role } = useSession();
  // 하이드레이션 전엔 세션(localStorage)을 모른다 — 서버 렌더와 어긋나지 않게 첫 그림은 비운다
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  if (role !== "teacher")
    return (
      <Card title="🧰 교실 도구">
        <EmptyState emoji="🔒" title="선생님만 쓸 수 있어요" />
      </Card>
    );
  return (
    <div className="space-y-4">
      <ToolsTabs />
      {children}
      <TimerWatcher />
    </div>
  );
}
