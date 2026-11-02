"use client";
// 📬 교사 알림함 — 학생이 보내고 신청한 모든 것을 한 곳에 (2026-11 사용자 요청).
//   [📬 알림] 처리할 일(상점 신청은 바로 승인·반려) + 최근 소식 타임라인(종류별로 거르기)
//   [💌 편지함] 모든 학생 편지를 게시판처럼 + 태그 모아보기 (LetterBoard)
// 머리의 🔔(TeacherBell)이 이 화면으로 데려온다. 여기를 열면 모든 기기의 종이 꺼진다.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { useFeedback } from "@/components/ui/Feedback";
import LetterBoard from "@/components/teacher/LetterBoard";
import { KIND_LABEL, useInbox, useMarkInboxSeen, type InboxKind } from "@/lib/query/inbox";
import { usePendingRequests, useDecideRequest, type SpendRequest, type WalletKind } from "@/lib/query/wallet";
import { useMenuRequests } from "@/lib/query/classMeta";
import { useAllAppeals } from "@/lib/query/appeals";
import { usePendingSeatRequests } from "@/lib/query/seatChange";
import { useHiddenNominations } from "@/lib/query/board";
import { isUnreadLetter, useAllLetters, useAllMailMeta } from "@/lib/query/letters";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const ago = (ts: number, now: number) => {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = new Date(ts + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

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
          📬 알림
        </button>
        <button onClick={() => setTab("letters")} className={tabCls(tab === "letters")}>
          💌 편지함
        </button>
      </div>
      {tab === "feed" ? <Feed onLetters={() => setTab("letters")} /> : <LetterBoard />}
    </div>
  );
}

function Feed({ onLetters }: { onLetters: () => void }) {
  const { toast } = useFeedback();
  const { data: inbox, error: inboxErr } = useInbox(true);
  const markSeen = useMarkInboxSeen();
  const { data: pendS2 } = usePendingRequests("s2", true);
  const { data: pendS1 } = usePendingRequests("s1", true);
  const decideS2 = useDecideRequest("s2");
  const decideS1 = useDecideRequest("s1");
  const { data: menuReqs } = useMenuRequests(true);
  const { data: appeals } = useAllAppeals(true);
  const { data: seats } = usePendingSeatRequests(true);
  const { data: noms } = useHiddenNominations(true);
  const { data: board } = useAllLetters(true, 30);
  const { data: metas } = useAllMailMeta(true);
  const [kind, setKind] = useState<InboxKind | "">("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // 'NEW' 경계 — 이 화면을 열기 전의 확인 시각. 연 직후 서버엔 지금으로 기록(종 끄기)
  const [boundary, setBoundary] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
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

  const shop = [
    ...(pendS2 ?? []).map((r) => ({ r, w: "s2" as WalletKind })),
    ...(pendS1 ?? []).map((r) => ({ r, w: "s1" as WalletKind })),
  ].sort((a, b) => a.r.createdAt - b.r.createdAt);
  const unreadLetters = (board?.letters ?? []).filter((l) => isUnreadLetter(l, metas));
  const nAppeal = (appeals ?? []).filter((a) => a.status === "pending").length;
  const nHidden = (noms ?? []).filter((n) => !n.resolved).length;
  const nMenu = menuReqs?.length ?? 0;
  const nSeat = seats?.length ?? 0;

  async function decide(r: SpendRequest, w: WalletKind, approve: boolean) {
    if (busyId) return;
    setBusyId(r.id);
    try {
      await (w === "s2" ? decideS2 : decideS1)(r, approve);
      toast(approve ? `✅ ${nm(r.studentId)} — "${r.item}" 승인` : `↩️ ${nm(r.studentId)} — "${r.item}" 반려`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "처리하지 못했어요.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const events = useMemo(
    () => (inbox?.events ?? []).filter((e) => !kind || e.kind === kind).slice(0, 60),
    [inbox, kind]
  );
  const todo: { key: string; label: string; n: number; href?: string; onClick?: () => void }[] = [
    { key: "letter", label: "💌 안 읽은 편지", n: unreadLetters.length, onClick: onLetters },
    { key: "menu", label: "💡 메뉴 건의", n: nMenu, href: "/shop" },
    { key: "appeal", label: "🙋 이의 제기", n: nAppeal, href: "/teacher#panel-appeal" },
    { key: "seat", label: "💺 자리 신청", n: nSeat, href: "/teacher#panel-seat-approve" },
    { key: "hidden", label: "🌟 숨은 기여", n: nHidden, href: "/teacher#panel-hidden" },
  ];
  const nothing = !shop.length && todo.every((t) => !t.n);
  const notifPerm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";

  return (
    <>
      <Card
        title="📬 처리할 일"
        desc="아이들이 보내고 신청한 것 중 아직 처리하지 않은 것들이에요."
        action={
          notifPerm === "default" ? (
            <button
              onClick={() =>
                void Notification.requestPermission().then((p) =>
                  toast(p === "granted" ? "🔔 컴퓨터 알림을 켰어요." : "알림이 허용되지 않았어요.", p === "granted" ? "success" : "warn")
                )
              }
              className="press rounded-btn bg-ink-800 px-3 py-1.5 text-xs font-bold text-white"
            >
              🔔 컴퓨터 알림 켜기
            </button>
          ) : notifPerm === "granted" ? (
            <span className="text-xs font-bold text-success">🔔 컴퓨터 알림 켜짐</span>
          ) : null
        }
      >
        {nothing ? (
          <EmptyState emoji="✨" title="밀린 일이 없어요" desc="새로 들어오면 머리의 🔔에 숫자가 떠요." />
        ) : (
          <>
            {shop.length > 0 && (
              <div className="mt-3">
                <p className="text-[13px] font-bold text-ink-700">🛒 상점 신청 {shop.length}건 — 여기서 바로 처리</p>
                <ul className="mt-1.5 divide-y divide-ink-100 rounded-btn ring-1 ring-ink-200">
                  {shop.map(({ r, w }) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                      <span className="rounded bg-brand-weak px-1.5 py-0.5 text-xs font-bold text-brand-strong">
                        {nm(r.studentId)}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-bold text-ink-800">
                        {r.item}{" "}
                        <span className="font-normal text-ink-500">
                          · {r.type === "gold" ? `골드 ${r.amount}` : `실버 ${r.amount}`}
                          {w === "s1" && r.type !== "gold" ? " (이월)" : ""} · {ago(r.createdAt, now)}
                        </span>
                      </span>
                      <button
                        onClick={() => void decide(r, w, true)}
                        disabled={busyId != null}
                        className="press rounded-btn bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => void decide(r, w, false)}
                        disabled={busyId != null}
                        className="press rounded-btn bg-white px-3 py-1.5 text-xs font-bold text-ink-600 ring-1 ring-ink-200 disabled:opacity-40"
                      >
                        반려
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {todo
                .filter((t) => t.n > 0)
                .map((t) =>
                  t.href ? (
                    <Link
                      key={t.key}
                      href={t.href}
                      className="press rounded-full bg-warn-weak px-3 py-1.5 text-sm font-bold text-ink-800 ring-1 ring-warn/30"
                    >
                      {t.label} {t.n}건 →
                    </Link>
                  ) : (
                    <button
                      key={t.key}
                      onClick={t.onClick}
                      className="press rounded-full bg-warn-weak px-3 py-1.5 text-sm font-bold text-ink-800 ring-1 ring-warn/30"
                    >
                      {t.label} {t.n}건 →
                    </button>
                  )
                )}
            </div>
          </>
        )}
      </Card>

      <Card title="🕘 최근 소식" desc="누가 언제 무엇을 보냈는지 — 학생마다 종류별로 가장 최근 것만 남아요.">
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["", ...Object.keys(KIND_LABEL)] as (InboxKind | "")[]).map((k) => (
            <button
              key={k || "all"}
              onClick={() => setKind(k)}
              className={`press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                kind === k ? "bg-brand text-white ring-brand" : "bg-white text-ink-700 ring-ink-200"
              }`}
            >
              {k ? `${KIND_LABEL[k].emoji} ${KIND_LABEL[k].label}` : "전체"}
            </button>
          ))}
        </div>
        {(inboxErr as { code?: string } | null)?.code === "permission-denied" ? (
          <EmptyState
            emoji="🔒"
            title="알림 규칙이 아직 게시되지 않았어요"
            desc="Firebase 콘솔에 최신 firestore.rules를 게시하면 새 소식이 여기에 쌓여요."
          />
        ) : !events.length ? (
          <EmptyState emoji="📭" title="아직 소식이 없어요" desc="아이들이 편지·신청을 보내면 여기에 떠요." />
        ) : (
          <ul className="mt-3 divide-y divide-ink-100">
            {events.map((e) => {
              const k = KIND_LABEL[e.kind];
              const isNew = boundary !== null && e.at > boundary;
              return (
                <li key={`${e.sid}-${e.kind}`} className="flex items-center gap-2.5 py-2.5">
                  <span className="text-lg" aria-hidden>
                    {k.emoji}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-ink-700">
                    <b className="text-ink-900">{nm(e.sid)}</b>이(가) {k.verb}
                  </span>
                  {isNew && (
                    <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                      NEW
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-ink-400">{ago(e.at, now)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
