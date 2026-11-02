"use client";
// 🔔 교사 종 — 어느 화면에 있든 머리에 떠 있다. 학생이 편지·상점 신청 등을 보내면
// 1분 안에 빨간 숫자가 뜨고, 새로 들어온 순간엔 토스트 + (허락했다면) 컴퓨터 알림 + 탭 제목 (N).
// 읽기: inbox/main 문서 1개를 1분마다 (lib/query/inbox.ts 설명 참고).
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useInbox, unseen, KIND_LABEL } from "@/lib/query/inbox";
import { studentById } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";

const BASE_TITLE = "2학기 학급 자치 시스템";

export default function TeacherBell() {
  const { data } = useInbox(true);
  const { toast } = useFeedback();
  const fresh = unseen(data);
  const n = fresh.length;
  const lastTop = useRef<number | null>(null); // 이번 접속에서 마지막으로 본 가장 새 시각

  // 새로 들어온 것만 알린다 — 첫 로드(이미 쌓여 있던 것)는 숫자로만
  useEffect(() => {
    if (!data) return;
    const top = data.events[0]?.at ?? 0;
    if (lastTop.current == null) {
      lastTop.current = top;
      return;
    }
    const arrived = data.events.filter((e) => e.at > (lastTop.current ?? 0));
    lastTop.current = Math.max(lastTop.current, top);
    if (!arrived.length) return;
    const e = arrived[0];
    const who = studentById.get(e.sid)?.name ?? `${e.sid}번`;
    const k = KIND_LABEL[e.kind];
    const more = arrived.length > 1 ? ` 외 ${arrived.length - 1}건` : "";
    const line = `${k.emoji} ${who}이(가) ${k.verb}${more}`;
    toast(`📬 ${line}`, "success");
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted")
        new Notification("📬 학급 알림", { body: line, tag: "class2nd-inbox" });
    } catch {}
  }, [data, toast]);

  // 탭 제목에 숫자 — 다른 탭에서 일하다가도 보인다
  useEffect(() => {
    document.title = n ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [n]);

  return (
    <Link
      href="/inbox"
      aria-label={n ? `알림함 — 새 소식 ${n}건` : "알림함"}
      className="press relative grid h-7 w-7 place-items-center rounded-full border border-ink-200 text-sm hover:bg-ink-100"
    >
      🔔
      {n > 0 && (
        <span className="badge-pop absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-extrabold text-white">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
