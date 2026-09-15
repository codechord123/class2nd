"use client";
// 💌 우체통 — 선생님과 나, 둘 사이의 편지. 학생끼리는 주고받지 않는다.
// 한 화면에 대화가 시간순으로 쌓이고 맨 위에서 바로 답장을 쓴다 (탭 전환 없음).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { studentById } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import {
  DAILY_SEND_LIMIT,
  LETTER_MAX,
  LETTER_MIN,
  sentTodayCount,
  useLetters,
  useMailMeta,
  useMarkMailSeen,
  useSendToTeacher,
} from "@/lib/query/letters";

const fmt = (ts: number) => {
  const d = new Date(ts + 9 * 3600000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

export default function LettersPage() {
  const { role, studentId } = useSession();
  const { data: settings } = useSettings();
  const { toast } = useFeedback();

  // 부모 문서는 읽음 표시(seenAt) 쓰기 전에 캐시를 채워두기 위해 구독한다 —
  // 값 자체는 이 화면에서 안 쓰고, 홈 배지가 같은 캐시를 재사용한다 (추가 읽기 0)
  useMailMeta(role === "student" ? studentId : null);
  const { data: letters } = useLetters(role === "student" ? studentId : null);
  const markSeen = useMarkMailSeen(studentId);
  const send = useSendToTeacher(studentId);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // 우체통을 연 순간 읽음 표시 — 홈 배지가 사라진다 (쓰기 1회)
  useEffect(() => {
    if (role === "student" && studentId != null && letters) void markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, studentId, !!letters]);

  const open = settings?.lettersOpen !== false;
  const sentToday = sentTodayCount(letters, studentId);
  const left = Math.max(0, DAILY_SEND_LIMIT - sentToday);
  // 최신이 위 → 읽기는 오래된 것부터가 자연스럽다 (편지는 대화라서)
  const thread = useMemo(
    () => [...(letters ?? [])].sort((a, b) => a.createdAt - b.createdAt),
    [letters]
  );

  if (role !== "student" || studentId == null) {
    return (
      <Card title="💌 우체통">
        <EmptyState
          emoji="🔒"
          title="학생으로 로그인하면 우체통이 열려요"
          desc="선생님과 나만 볼 수 있는 편지예요."
        />
      </Card>
    );
  }

  const myName = studentById.get(studentId)?.name ?? "나";

  async function doSend() {
    if (sending) return;
    if (left <= 0)
      return toast(`편지는 하루에 ${DAILY_SEND_LIMIT}통까지 보낼 수 있어요.`, "warn");
    setSending(true);
    try {
      await send(text);
      setText("");
      toast("💌 선생님께 편지를 보냈어요!", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="💌 우체통"
        desc="선생님과 나만 주고받는 편지예요. 다른 친구는 볼 수 없어요."
        action={
          <Link
            href="/"
            className="press rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600"
          >
            홈으로
          </Link>
        }
      >
        {!open ? (
          <div className="mt-3 rounded-btn bg-ink-50 px-3 py-2.5 text-sm text-ink-500">
            🔒 지금은 편지 쓰기가 잠겨 있어요 — 받은 편지는 아래에서 볼 수 있어요.
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, LETTER_MAX))}
              rows={5}
              placeholder="선생님께 하고 싶은 말을 편하게 적어보세요. 고민도, 고마운 마음도 좋아요."
              className="mt-3 w-full rounded-btn border border-ink-300 px-3 py-2 text-[15px] leading-relaxed"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-ink-400">
              <span>
                {text.trim().length < LETTER_MIN
                  ? `${LETTER_MIN}글자 이상 써주세요`
                  : "선생님이 꼭 읽어볼 거예요"}
              </span>
              <span className="tnum">
                {text.length}/{LETTER_MAX}
              </span>
            </div>
            <button
              onClick={() => void doSend()}
              disabled={sending || left <= 0 || text.trim().length < LETTER_MIN}
              className="press mt-2 w-full rounded-btn bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {sending
                ? "보내는 중…"
                : left <= 0
                  ? "오늘은 다 보냈어요 (내일 또 쓸 수 있어요)"
                  : "💌 선생님께 보내기"}
            </button>
            <p className="mt-1.5 text-center text-xs text-ink-400">
              오늘 {sentToday}/{DAILY_SEND_LIMIT}통
            </p>
          </>
        )}
      </Card>

      <Card title="✉️ 주고받은 편지">
        {thread.length === 0 ? (
          <EmptyState
            emoji="📭"
            title="아직 주고받은 편지가 없어요"
            desc="위에 첫 편지를 써보세요. 선생님만 볼 수 있어요."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {thread.map((l) => {
              const mine = l.from !== "teacher";
              return (
                <li key={l.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-card border p-3 ${
                      mine
                        ? "border-brand/30 bg-brand-weak/50"
                        : "border-pink-200 bg-pink-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${
                          mine
                            ? "bg-brand-weak text-brand-strong"
                            : "bg-pink-100 text-pink-700"
                        }`}
                      >
                        {mine ? myName : "선생님"}
                      </span>
                      <span className="text-xs text-ink-400">{fmt(l.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-800">
                      {l.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
