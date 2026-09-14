"use client";
// 💌 우체통 — 받은 편지 / 보낸 편지 / 편지 쓰기.
// 비밀 우체통이라 '내 것'만 보인다 (남의 우체통은 보안 규칙이 막는다).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/stores/session";
import { useSettings } from "@/lib/query/settings";
import { students, studentById } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SegmentedControl from "@/components/ui/SegmentedControl";
import {
  DAILY_SEND_LIMIT,
  LETTER_MAX,
  LETTER_MIN,
  sentTodayCount,
  useFlagLetter,
  useLetters,
  useMailMeta,
  useMarkMailSeen,
  useSendLetter,
  type Letter,
} from "@/lib/query/letters";

const fmt = (ts: number) => {
  const d = new Date(ts + 9 * 3600000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};
const nameOf = (from: Letter["from"]) =>
  from === "teacher" ? "선생님" : (studentById.get(from)?.name ?? "?");

export default function LettersPage() {
  const { role, studentId } = useSession();
  const { data: settings } = useSettings();
  const { toast, confirm } = useFeedback();
  const [tab, setTab] = useState<"in" | "out" | "write">("in");

  const { data: meta } = useMailMeta(studentId);
  const { data: letters } = useLetters(studentId);
  const markSeen = useMarkMailSeen(studentId);
  const flag = useFlagLetter(studentId);
  const send = useSendLetter(studentId);

  // 우체통을 연 순간 읽음 표시 — 홈 배지가 사라진다 (쓰기 1회)
  useEffect(() => {
    if (role === "student" && studentId != null && letters) void markSeen();
    // letters가 처음 도착했을 때 한 번만 — markSeen은 매 렌더 새 함수라 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, studentId, !!letters]);

  const [to, setTo] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const open = settings?.lettersOpen !== false;
  const sentToday = sentTodayCount(meta);
  const left = Math.max(0, DAILY_SEND_LIMIT - sentToday);

  const targets = useMemo(
    () => students.filter((s) => !s.inactive && s.id !== studentId),
    [studentId]
  );
  const inbox = useMemo(() => {
    const all = letters ?? [];
    return showHidden ? all : all.filter((l) => !meta?.flags?.[l.id]?.hidden);
  }, [letters, meta, showHidden]);
  const hiddenCount = (letters ?? []).filter((l) => meta?.flags?.[l.id]?.hidden).length;
  const outbox = useMemo(
    () => [...(meta?.sent ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [meta]
  );

  if (role !== "student" || studentId == null) {
    return (
      <Card title="💌 우체통">
        <EmptyState
          emoji="🔒"
          title="학생으로 로그인하면 우체통이 열려요"
          desc="비밀 우체통이라 내 편지만 볼 수 있어요."
        />
      </Card>
    );
  }

  async function doSend() {
    if (sending) return;
    if (to == null) return toast("편지를 받을 친구를 골라주세요.", "warn");
    if (left <= 0)
      return toast(`편지는 하루에 ${DAILY_SEND_LIMIT}통까지 보낼 수 있어요.`, "warn");
    setSending(true);
    try {
      await send(to, text);
      setText("");
      setTo(null);
      toast("💌 편지를 보냈어요!", "success");
      setTab("out");
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요.", "error");
    } finally {
      setSending(false);
    }
  }

  async function doHide(l: Letter) {
    const ok = await confirm({
      title: "이 편지를 숨길까요?",
      body: "내 우체통에서 보이지 않게 해요. 선생님께는 기록이 남아요.",
      confirmLabel: "숨기기",
    });
    if (!ok) return;
    await flag(l.id, { hidden: true }).catch((e) => toast(e.message, "error"));
  }

  async function doReport(l: Letter) {
    const ok = await confirm({
      title: "선생님께 알릴까요?",
      body: "마음이 불편한 편지를 받았다면 알려주세요. 선생님이 확인하고 도와줄 거예요.",
      confirmLabel: "선생님께 알리기",
      danger: true,
    });
    if (!ok) return;
    await flag(l.id, { reported: true, hidden: true })
      .then(() => toast("선생님께 알렸어요. 혼자 끙끙 앓지 않아서 잘했어요 👍", "success"))
      .catch((e) => toast(e.message, "error"));
  }

  return (
    <div className="space-y-4">
      <Card
        title="💌 우체통"
        desc="친구와 선생님이 보낸 편지가 도착하는 곳이에요. 내 편지는 나와 선생님만 볼 수 있어요."
        action={
          <Link href="/" className="press rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600">
            홈으로
          </Link>
        }
      >
        <div className="mt-3">
          <SegmentedControl
            active={tab}
            onChange={(k) => setTab(k as "in" | "out" | "write")}
            tabs={[
              { key: "in", label: `📥 받은 편지 ${inbox.length}` },
              { key: "out", label: `📤 보낸 편지 ${outbox.length}` },
              { key: "write", label: "✍️ 편지 쓰기" },
            ]}
          />
        </div>
      </Card>

      {tab === "in" && (
        <Card title="📥 받은 편지">
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="press mt-2 rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600"
            >
              {showHidden ? "숨긴 편지 감추기" : `숨긴 편지 ${hiddenCount}통 보기`}
            </button>
          )}
          {inbox.length === 0 ? (
            <EmptyState
              emoji="📭"
              title="아직 도착한 편지가 없어요"
              desc="먼저 친구에게 한 통 보내 볼까요? 받은 사람은 분명 기뻐할 거예요."
              action={
                <button
                  onClick={() => setTab("write")}
                  className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
                >
                  ✍️ 편지 쓰기
                </button>
              }
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {inbox.map((l) => {
                const f = meta?.flags?.[l.id];
                return (
                  <li
                    key={l.id}
                    className={`rounded-btn border p-3 ${
                      f?.hidden ? "border-ink-200 bg-ink-50 opacity-60" : "border-pink-200 bg-pink-50/50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${
                          l.from === "teacher"
                            ? "bg-brand-weak text-brand-strong"
                            : "bg-pink-100 text-pink-700"
                        }`}
                      >
                        {nameOf(l.from)}
                      </span>
                      <span className="text-xs text-ink-400">{fmt(l.createdAt)}</span>
                      {f?.reported && (
                        <span className="text-xs font-bold text-danger">🚨 선생님께 알림</span>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-800">
                      {l.text}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {l.from !== "teacher" && (
                        <button
                          onClick={() => {
                            setTo(l.from as number);
                            setTab("write");
                          }}
                          className="press rounded-btn bg-white px-2.5 py-1 text-xs font-bold text-brand ring-1 ring-ink-200"
                        >
                          ✍️ 답장 쓰기
                        </button>
                      )}
                      {!f?.hidden && (
                        <button
                          onClick={() => void doHide(l)}
                          className="press rounded-btn bg-white px-2.5 py-1 text-xs font-bold text-ink-500 ring-1 ring-ink-200"
                        >
                          숨기기
                        </button>
                      )}
                      {!f?.reported && (
                        <button
                          onClick={() => void doReport(l)}
                          className="press rounded-btn bg-white px-2.5 py-1 text-xs font-bold text-danger ring-1 ring-ink-200"
                        >
                          🚨 선생님께 알리기
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === "out" && (
        <Card title="📤 보낸 편지" desc="내가 보낸 편지 목록이에요 (받는 친구에게만 보여요).">
          {outbox.length === 0 ? (
            <EmptyState emoji="✉️" title="아직 보낸 편지가 없어요" />
          ) : (
            <ul className="mt-3 space-y-2">
              {outbox.map((s) => (
                <li key={s.id} className="rounded-btn border border-ink-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[12px] font-bold text-brand-strong">
                      → {studentById.get(s.to)?.name ?? "?"}
                    </span>
                    <span className="text-xs text-ink-400">{fmt(s.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-700">
                    {s.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "write" && (
        <Card
          title="✍️ 편지 쓰기"
          desc={`오늘 ${sentToday}/${DAILY_SEND_LIMIT}통 보냈어요 — ${left}통 더 보낼 수 있어요.`}
        >
          {!open ? (
            <EmptyState emoji="🔒" title="지금은 우체통이 닫혀 있어요" desc="선생님이 다시 열어줄 거예요." />
          ) : (
            <>
              <p className="mt-3 text-[13px] font-bold text-ink-700">누구에게 보낼까요?</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {targets.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setTo(s.id)}
                    className={`press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                      to === s.id
                        ? "bg-brand text-white ring-brand"
                        : "bg-white text-ink-700 ring-ink-200"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, LETTER_MAX))}
                rows={6}
                placeholder="고마웠던 일, 미안했던 일, 응원하고 싶은 말을 편하게 적어보세요."
                className="mt-3 w-full rounded-btn border border-ink-300 px-3 py-2 text-[15px] leading-relaxed"
              />
              <div className="mt-1 flex items-center justify-between text-xs text-ink-400">
                <span>
                  {text.trim().length < LETTER_MIN
                    ? `${LETTER_MIN}글자 이상 써주세요`
                    : "좋아요! 마음이 잘 전해질 거예요"}
                </span>
                <span className="tnum">
                  {text.length}/{LETTER_MAX}
                </span>
              </div>
              <button
                onClick={() => void doSend()}
                disabled={sending || left <= 0 || to == null || text.trim().length < LETTER_MIN}
                className="press mt-3 w-full rounded-btn bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {sending ? "보내는 중…" : left <= 0 ? "오늘은 다 보냈어요" : "💌 편지 보내기"}
              </button>
              <p className="mt-2 rounded-btn bg-ink-50 px-3 py-2 text-xs text-ink-500">
                편지에는 <b>내 이름이 함께 전해져요.</b> 받는 친구가 마음 상할 말은 쓰지 않기로
                해요 — 선생님은 모든 편지를 볼 수 있어요.
              </p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
