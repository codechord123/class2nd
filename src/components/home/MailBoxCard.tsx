"use client";
// 📮 우체통 카드 (개요) — 학생에겐 '선생님 편지 왔어요', 선생님에겐 '답장 기다리는 학생'.
// 읽기 예산:
//   학생  = letters/{내번호} 부모 문서 1개. 시각 비교(lastAt > seenAt)만 하고 본문은 안 읽는다
//           (홈에서 본문까지 읽으면 25명 × 접속마다 편지 수만큼 읽기가 터진다).
//   교사  = 부모 문서 25개. 교사 화면 우체통 패널과 같은 쿼리 키라 캐시를 공유한다.
import Link from "next/link";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { hasUnread, useMailMeta, useWaitingStudents } from "@/lib/query/letters";

function Shell({
  href,
  highlight,
  dot,
  children,
  cta,
}: {
  href: string;
  highlight: boolean;
  dot: boolean;
  children: React.ReactNode;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className={`press flex items-center gap-3 rounded-card border px-4 py-3 shadow-card ${
        highlight ? "border-pink-300 bg-pink-50" : "border-ink-200 bg-white"
      }`}
    >
      <span className="relative text-2xl">
        📮
        {dot && (
          <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-pink-500 ring-2 ring-white" />
        )}
      </span>
      <span className="min-w-0 flex-1 text-sm text-ink-800">{children}</span>
      <span className="shrink-0 text-xs font-bold text-pink-600">{cta}</span>
    </Link>
  );
}

export default function MailBoxCard() {
  const { role, studentId } = useSession();
  const isTeacher = role === "teacher";
  const { data: meta } = useMailMeta(role === "student" ? studentId : null);
  const { data: waiting } = useWaitingStudents(isTeacher);

  if (isTeacher) {
    const n = waiting?.length ?? 0;
    // 이름을 3명까지만 — 더 길면 카드가 두 줄로 밀려 한눈에 안 들어온다
    const names = (waiting ?? [])
      .slice(0, 3)
      .map((id) => studentById.get(id)?.name ?? `${id}번`)
      .join(", ");
    return (
      <Shell href="/teacher#panel-letters" highlight={n > 0} dot={n > 0} cta={n > 0 ? "읽어보기 →" : "열기 →"}>
        {n > 0 ? (
          <>
            <b className="text-pink-700">답장을 기다리는 편지 {n}통</b>
            <span className="text-ink-500">
              {" "}
              — {names}
              {n > 3 ? ` 외 ${n - 3}명` : ""}
            </span>
          </>
        ) : (
          <>
            <b>우체통</b>
            <span className="text-ink-500"> — 아이들에게 편지를 보내보세요</span>
          </>
        )}
      </Shell>
    );
  }

  if (role !== "student" || studentId == null) return null;

  const unread = hasUnread(meta);
  return (
    <Shell href="/letters" highlight={unread} dot={unread} cta={unread ? "읽어보기 →" : "열기 →"}>
      {unread ? (
        <b className="text-pink-700">선생님께서 편지를 보내셨어요!</b>
      ) : (
        <>
          <b>우체통</b>
          <span className="text-ink-500"> — 선생님께 하고 싶은 말을 편지로 전해보세요</span>
        </>
      )}
    </Shell>
  );
}
