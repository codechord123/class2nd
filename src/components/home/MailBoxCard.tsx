"use client";
// 💌 우체통 카드 (홈) — 새 편지가 왔는지 '시각 비교'만으로 알린다.
// 읽는 문서는 letters/{내번호} 부모 하나뿐이고, 편지 본문은 우체통에 들어가야 읽는다
// (홈에서 본문까지 읽으면 학생 25명 × 접속마다 편지 수만큼 읽기가 터진다).
import Link from "next/link";
import { useSession } from "@/stores/session";
import { hasUnread, useMailMeta } from "@/lib/query/letters";

export default function MailBoxCard() {
  const { role, studentId } = useSession();
  const { data: meta } = useMailMeta(role === "student" ? studentId : null);
  if (role !== "student" || studentId == null) return null;

  const unread = hasUnread(meta);
  return (
    <Link
      href="/letters"
      className={`press flex items-center gap-3 rounded-card border px-4 py-3 shadow-card ${
        unread ? "border-pink-300 bg-pink-50" : "border-ink-200 bg-white"
      }`}
    >
      <span className="relative text-2xl">
        📮
        {unread && (
          <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-pink-500 ring-2 ring-white" />
        )}
      </span>
      <span className="min-w-0 flex-1 text-sm text-ink-800">
        {unread ? (
          <b className="text-pink-700">새 편지가 도착했어요!</b>
        ) : (
          <>
            <b>우체통</b>
            <span className="text-ink-500"> — 친구에게 마음을 편지로 전해보세요</span>
          </>
        )}
      </span>
      <span className="shrink-0 text-xs font-bold text-pink-600">
        {unread ? "읽어보기 →" : "열기 →"}
      </span>
    </Link>
  );
}
