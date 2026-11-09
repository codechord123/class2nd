"use client";
// 📬 교사 알림함 — 학생이 보내고 신청한 모든 것을 한 곳에 (2026-11 사용자 요청).
//   [📬 알림] 상태 점검(규칙 게시·상점 신청 시간·컴퓨터 알림) + 📬 알림 게시판(NotificationBoard:
//            모든 신청·편지·건의를 한 줄씩, 상점은 바로 승인·반려)
//   [💌 편지함] 모든 학생 편지를 게시판처럼 + 태그 모아보기 (LetterBoard)
// 머리의 🔔(TeacherBell)과 교사 탭줄의 '알림함'이 이 화면으로 데려온다. 여기를 열면 모든 기기의 종이 꺼진다.
import { useEffect, useState } from "react";
import { useSession } from "@/stores/session";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { useFeedback } from "@/components/ui/Feedback";
import LetterBoard from "@/components/teacher/LetterBoard";
import NotificationBoard from "@/components/teacher/NotificationBoard";
import { useInbox, useMarkInboxSeen } from "@/lib/query/inbox";
import { useAllLetters } from "@/lib/query/letters";
import { useSettings } from "@/lib/query/settings";
import { isRequestOpen, requestWindowLabel } from "@/lib/requestWindow";

export default function InboxPage() {
  const { role } = useSession();
  const [tab, setTab] = useState<"feed" | "letters">(() =>
    typeof window !== "undefined" && window.location.hash === "#letters" ? "letters" : "feed"
  );
  if (role !== "teacher")
    return (
      <Card title="📬 알림함">
        <EmptyState emoji="🔒" title="선생님만 볼 수 있어요" />
      </Card>
    );
  const tabCls = (on: boolean) =>
    `press flex-1 rounded-btn py-2 text-sm font-bold ${on ? "bg-white text-ink-900 shadow-card" : "text-ink-500"}`;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-card bg-ink-100 p-1">
        <button onClick={() => setTab("feed")} className={tabCls(tab === "feed")}>
          📬 알림 게시판
        </button>
        <button onClick={() => setTab("letters")} className={tabCls(tab === "letters")}>
          💌 편지함
        </button>
      </div>
      {tab === "feed" ? <Feed /> : <LetterBoard />}
    </div>
  );
}

function Feed() {
  const { data: inbox } = useInbox(true);
  const markSeen = useMarkInboxSeen();
  // 'NEW' 경계 — 이 화면을 열기 전의 확인 시각. 연 직후 서버엔 지금으로 기록(모든 기기의 종 끄기)
  const [boundary, setBoundary] = useState<number | null>(null);
  useEffect(() => {
    if (!inbox || boundary !== null) return;
    const b = inbox.teacherSeenAt;
    void Promise.resolve().then(() => {
      setBoundary(b);
      void markSeen();
    });
  }, [inbox, boundary, markSeen]);
  // 이 화면을 연 채로 새 소식이 오면 바로 확인 처리 (종이 계속 켜져 있지 않게)
  const top = inbox?.events[0]?.at ?? 0;
  useEffect(() => {
    if (boundary !== null && inbox && top > inbox.teacherSeenAt) void markSeen();
  }, [top, boundary, inbox, markSeen]);

  return (
    <>
      <StatusCard />
      <NotificationBoard seenBefore={boundary} />
    </>
  );
}

/** 🩺 지금 상태 — '알림이 안 와요·신청이 안 돼요'의 흔한 원인을 화면에서 바로 알 수 있게 */
function StatusCard() {
  const { toast } = useFeedback();
  const { error: inboxErr } = useInbox(true);
  const { data: letters } = useAllLetters(true, 30);
  const { data: settings } = useSettings();
  const rulesMissing =
    (inboxErr as { code?: string } | null)?.code === "permission-denied" || !!letters?.fallback;
  const open = settings?.requestOpenHour ?? 16;
  const close = settings?.requestCloseHour ?? 24;
  const shopOpenNow = !settings?.usageLocked && isRequestOpen(open, close);
  const [perm, setPerm] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const line = "flex flex-wrap items-center gap-2 rounded-btn px-3 py-2 text-sm";
  return (
    <Card title="🩺 지금 상태" desc="알림이 안 오거나 아이들 신청이 막힐 때 여기부터 보세요.">
      <div className="mt-3 space-y-2">
        {rulesMissing ? (
          <p className={`${line} bg-danger-weak font-bold text-danger`}>
            ⚠️ 새 보안 규칙이 아직 게시되지 않았어요 — 🔔 실시간 알림과 “기기 여러 대 로그인”(상점 신청이
            막히던 주원인)이 꺼져 있어요. Firebase 콘솔 → Firestore → 규칙에 최신 규칙을 게시해 주세요.
            (아래 게시판은 지금도 보여요)
          </p>
        ) : (
          <p className={`${line} bg-success-weak font-bold text-success`}>✅ 보안 규칙 최신 — 🔔 알림이 1분 안에 와요</p>
        )}
        <p className={`${line} ${shopOpenNow ? "bg-ink-50 text-ink-700" : "bg-warn-weak text-ink-800"}`}>
          🛒 상점 신청 시간 <b>{requestWindowLabel(open, close)}</b>
          {settings?.usageLocked ? (
            <b className="text-danger">· 🔒 지금 잠금 중 — 아이들이 신청할 수 없어요</b>
          ) : shopOpenNow ? (
            <span>· 지금 열려 있어요</span>
          ) : (
            <b>· 지금은 닫혀 있어요 (이 시간 밖에 신청하면 막혀요)</b>
          )}
        </p>
        <p className={`${line} bg-ink-50 text-ink-700`}>
          🔔 컴퓨터 알림{" "}
          {perm === "granted" ? (
            <b className="text-success">켜짐 — 다른 창에서 일해도 알려 드려요</b>
          ) : perm === "default" ? (
            <button
              onClick={() =>
                void Notification.requestPermission().then((p) => {
                  setPerm(p);
                  toast(p === "granted" ? "🔔 컴퓨터 알림을 켰어요." : "알림이 허용되지 않았어요.", p === "granted" ? "success" : "warn");
                })
              }
              className="press rounded-btn bg-ink-800 px-3 py-1.5 text-xs font-bold text-white"
            >
              켜기
            </button>
          ) : perm === "denied" ? (
            <span>브라우저에서 막혀 있어요 (주소창 왼쪽 자물쇠 → 알림 허용)</span>
          ) : (
            <span>이 브라우저는 지원하지 않아요</span>
          )}
        </p>
      </div>
    </Card>
  );
}
