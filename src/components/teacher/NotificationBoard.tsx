"use client";
// 📬 알림 게시판 — 아이들이 보내고 신청한 '모든 것'을 한 게시판에 (2026-11 사용자: "교사가 모든 알림을
// 한 번에 확인하는 명확한 게시판"). 신호 문서(inbox/main)가 아니라 각 기능의 실제 데이터에서 한 줄씩 만든다 —
// 규칙 게시 전이어도 보이고, 학생마다 '마지막 한 건'이 아니라 신청·편지 하나하나가 다 보인다.
//   행 = 상점 신청(대기·최근 7일 처리) · 메뉴 건의 · 편지(최근 30일) · 이의 제기 · 자리 신청 · 게시판 글(7일) · 숨은 기여
//   '처리할 것'만 보기 · 종류별 · 이름/내용 검색 · 10/20개 페이지 · 상점은 그 자리에서 승인/반려 · 편지는 바로 열어 답장
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { studentById } from "@/lib/roster";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Pager from "@/components/ui/Pager";
import { useFeedback } from "@/components/ui/Feedback";
import { LetterModal } from "@/components/teacher/LetterBoard";
import {
  usePendingRequests,
  useDecideRequest,
  useRecentDecided,
  type SpendRequest,
  type WalletKind,
} from "@/lib/query/wallet";
import { useMenuRequests } from "@/lib/query/classMeta";
import { useAllAppeals } from "@/lib/query/appeals";
import { usePendingSeatRequests } from "@/lib/query/seatChange";
import { useHiddenNominations, useSuggestions } from "@/lib/query/board";
import { useInbox, refreshInboxSources } from "@/lib/query/inbox";
import { useQueryClient } from "@tanstack/react-query";
import {
  isUnreadLetter,
  useAllLetters,
  useAllMailMeta,
  useLetterTags,
  type BoardLetter,
} from "@/lib/query/letters";

type Kind = "shop" | "shopFail" | "menu" | "letter" | "appeal" | "seat" | "board" | "hidden";
const KIND: Record<Kind, { emoji: string; label: string }> = {
  shop: { emoji: "🛒", label: "상점 신청" },
  shopFail: { emoji: "⚠️", label: "신청 실패" },
  letter: { emoji: "💌", label: "편지" },
  menu: { emoji: "💡", label: "메뉴 건의" },
  appeal: { emoji: "🙋", label: "이의 제기" },
  seat: { emoji: "💺", label: "자리 신청" },
  board: { emoji: "📝", label: "게시판 글" },
  hidden: { emoji: "🌟", label: "숨은 기여" },
};

interface Row {
  key: string;
  kind: Kind;
  sid: number;
  title: string;
  body?: string;
  at: number;
  todo: boolean; // 선생님이 처리할 것
  status: string;
  href?: string;
  shop?: { r: SpendRequest; w: WalletKind };
  letter?: BoardLetter;
}

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const when = (ts: number) => {
  const d = new Date(ts + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const DAY = 86400000;

export default function NotificationBoard({ seenBefore }: { seenBefore: number | null }) {
  const { toast } = useFeedback();
  const { data: pendS2 } = usePendingRequests("s2", true);
  const { data: pendS1 } = usePendingRequests("s1", true);
  const { data: decided } = useRecentDecided(7, true);
  const decideS2 = useDecideRequest("s2");
  const decideS1 = useDecideRequest("s1");
  const { data: menuReqs } = useMenuRequests(true);
  const { data: appeals } = useAllAppeals(true);
  const { data: seats } = usePendingSeatRequests(true);
  const { data: noms } = useHiddenNominations(true);
  const { data: posts } = useSuggestions(40);
  const { data: board } = useAllLetters(true, 30);
  const { data: metas } = useAllMailMeta(true);
  const { data: tags } = useLetterTags(true);
  const { data: inbox } = useInbox(true);
  // 게시판을 열 때마다 모든 목록을 새로 — 캐시가 몇 분 묵어 방금 온 신청이 안 보이던 것 방지
  const qc = useQueryClient();
  useEffect(() => {
    refreshInboxSources(qc);
  }, [qc]);

  const [only, setOnly] = useState<"todo" | "all">("todo");
  const [kind, setKind] = useState<Kind | "">("");
  const [kw, setKw] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [letterKey, setLetterKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [list, w] of [
      [pendS2, "s2"],
      [pendS1, "s1"],
    ] as const)
      for (const r of list ?? [])
        out.push({
          key: `shop-${w}-${r.id}`,
          kind: "shop",
          sid: r.studentId,
          title: `"${r.item}" 신청`,
          body: `${r.type === "gold" ? `골드 ${r.amount}개 (학급 공용)` : `실버 ${r.amount}개`}${w === "s1" && r.type !== "gold" ? " · 이월 지갑" : ""}`,
          at: r.createdAt,
          todo: true,
          status: "⏳ 승인 대기",
          shop: { r, w },
        });
    for (const r of decided ?? [])
      if (r.type === "spend" || r.type === "gold")
        out.push({
          key: `shopd-${r.wallet}-${r.id}`,
          kind: "shop",
          sid: r.studentId,
          title: `"${r.item}" 신청`,
          body: `${r.type === "gold" ? "골드" : "실버"} ${Math.abs(r.amount)}개`,
          at: r.createdAt,
          todo: false,
          status: r.status === "approved" ? "✅ 승인함" : "↩️ 반려함",
        });
    for (const m of menuReqs ?? [])
      out.push({
        key: `menu-${m.id}`,
        kind: "menu",
        sid: m.studentId,
        title: `"${m.name}" 메뉴 만들어 주세요`,
        body: m.note,
        at: m.createdAt,
        todo: true,
        status: "⏳ 검토 대기",
        href: "/shop",
      });
    for (const l of board?.letters ?? [])
      if (l.from !== "teacher") {
        const unread = isUnreadLetter(l, metas);
        out.push({
          key: `letter-${l.owner}-${l.id}`,
          kind: "letter",
          sid: l.owner,
          title: (l.text.split("\n").find((x) => x.trim()) ?? "").trim().slice(0, 50),
          body: l.text,
          at: l.createdAt,
          todo: unread,
          status: unread ? "🔴 안 읽음" : (l.tags?.length ? l.tags.map((t) => `#${t}`).join(" ") : "읽음"),
          letter: l,
        });
      }
    for (const a of appeals ?? [])
      out.push({
        key: `appeal-${a.id}`,
        kind: "appeal",
        sid: a.studentId,
        title: `${Number(a.date.slice(5, 7))}/${Number(a.date.slice(8, 10))} 점수 이의${a.dept ? ` (${a.dept})` : ""}`,
        body: a.reason,
        at: a.createdAt,
        todo: a.status === "pending",
        status: a.status === "pending" ? "⏳ 검토 대기" : a.status === "resolved" ? "✅ 조정함" : "↩️ 반려함",
        href: "/teacher#panel-appeal",
      });
    for (const r of seats ?? [])
      out.push({
        key: `seat-${r.id}`,
        kind: "seat",
        sid: r.studentId,
        title: `${r.week}주차 ${r.targetGroup}모둠 ${r.targetRole} 자리로`,
        at: r.createdAt,
        todo: true,
        status: "⏳ 승인 대기",
        href: "/teacher#panel-seat-approve",
      });
    for (const n of noms ?? [])
      if (typeof n.studentId === "number")
        out.push({
          key: `hidden-${n.id}`,
          kind: "hidden",
          sid: n.studentId,
          title: n.title ?? "숨은 기여 추천",
          body: n.content,
          at: n.createdAt,
          todo: !n.resolved,
          status: n.resolved ? "✅ 처리함" : "⏳ 확인 대기",
          href: "/teacher#panel-hidden",
        });
    for (const p of posts ?? [])
      if (typeof p.studentId === "number" && p.kind !== "hidden" && now - p.createdAt < 7 * DAY) {
        // 🔒 선생님만 보기 글에 아직 선생님 댓글이 없으면 '답할 것'
        const answered = (p.comments ?? []).some((c) => c.studentId === "teacher");
        const toTeacher = !!p.teacherOnly && !answered;
        out.push({
          key: `board-${p.id}`,
          kind: "board",
          sid: p.studentId,
          title: `${p.teacherOnly ? "🔒 " : ""}${p.title ?? p.content.slice(0, 30)}`,
          body: p.content,
          at: p.createdAt,
          todo: toTeacher,
          status: toTeacher ? "💬 선생님 답 기다림" : `댓글 ${(p.comments ?? []).length}`,
          href: "/board",
        });
      }
    // ⚠️ 상점 신청 실패 (신호 문서에서만 알 수 있다 — 규칙 게시 후) · 최근 3일
    for (const e of inbox?.events ?? [])
      if (e.kind === "shopFail" && now - e.at < 3 * DAY)
        out.push({
          key: `fail-${e.sid}-${e.at}`,
          kind: "shopFail",
          sid: e.sid,
          title: "상점 신청이 저장되지 못했어요",
          body: "아이 화면에는 '이 기기를 다시 연결' 안내가 떴어요. 계속 안 되면 로그아웃 → 다시 로그인을 도와주세요. 기기 시계가 틀려도 막힐 수 있어요.",
          at: e.at,
          todo: now - e.at < DAY,
          status: "도움 필요할 수 있음",
        });
    return out.sort((a, b) => b.at - a.at);
  }, [pendS2, pendS1, decided, menuReqs, board, metas, appeals, seats, noms, posts, inbox, now]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) if (only === "all" || r.todo) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [rows, only]);
  const todoCount = rows.filter((r) => r.todo).length;
  const shown = rows.filter(
    (r) =>
      (only === "all" || r.todo) &&
      (!kind || r.kind === kind) &&
      (!kw.trim() || nm(r.sid).includes(kw.trim()) || r.title.includes(kw.trim()) || (r.body ?? "").includes(kw.trim()))
  );
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const items = shown.slice((safePage - 1) * pageSize, safePage * pageSize);
  const openLetter = rows.find((r) => r.key === letterKey)?.letter ?? null;
  const allTags = [...new Set([...(tags ?? []), ...rows.flatMap((r) => r.letter?.tags ?? [])])];

  async function decide(r: SpendRequest, w: WalletKind, approve: boolean) {
    if (busy) return;
    setBusy(r.id);
    try {
      await (w === "s2" ? decideS2 : decideS1)(r, approve);
      toast(
        approve
            ? `✅ ${nm(r.studentId)} — "${r.item}" 승인`
            : `↩️ ${nm(r.studentId)} — "${r.item}" 반려`,
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "처리하지 못했어요.", "error");
    } finally {
      setBusy(null);
    }
  }

  const chip = (on: boolean) =>
    `press shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
      on ? "bg-brand text-white ring-brand" : "bg-white text-ink-700 ring-ink-200"
    }`;

  return (
    <Card
      title="📬 알림 게시판"
      desc="아이들이 보내고 신청한 것이 모두 여기 한 줄씩 쌓여요. 상점 신청은 여기서 바로 승인하고, 편지는 눌러서 바로 읽고 답해요."
    >
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => (setOnly("todo"), setPage(1))} className={chip(only === "todo")}>
          ⏳ 처리할 것 {todoCount}
        </button>
        <button onClick={() => (setOnly("all"), setPage(1))} className={chip(only === "all")}>
          전체 {rows.length}
        </button>
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <button onClick={() => (setKind(""), setPage(1))} className={chip(!kind)}>
          모든 종류
        </button>
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <button key={k} onClick={() => (setKind(kind === k ? "" : k), setPage(1))} className={chip(kind === k)}>
            {KIND[k].emoji} {KIND[k].label}
            {counts[k] ? <span className="ml-1 opacity-75">{counts[k]}</span> : null}
          </button>
        ))}
      </div>
      <input
        value={kw}
        onChange={(e) => (setKw(e.target.value), setPage(1))}
        placeholder="🔎 이름·내용 찾기"
        className="mt-2 w-full rounded-btn border border-ink-300 px-3 py-2 text-sm"
      />

      {!items.length ? (
        <EmptyState
          emoji={only === "todo" ? "✨" : "📭"}
          title={only === "todo" ? "처리할 것이 없어요" : "조건에 맞는 알림이 없어요"}
          desc={only === "todo" ? "'전체'를 누르면 처리한 것까지 볼 수 있어요." : undefined}
        />
      ) : (
        <ul className="mt-3 divide-y divide-ink-100">
          {items.map((r) => {
            const k = KIND[r.kind];
            const isNew = seenBefore != null && r.at > seenBefore;
            const expanded = open === r.key;
            return (
              <li key={r.key} className={r.todo ? "" : "opacity-75"}>
                <div className="flex items-start gap-2 hover:bg-ink-50">
                  <button
                    onClick={() => (r.letter ? setLetterKey(r.key) : setOpen(expanded ? null : r.key))}
                    className="flex min-w-0 flex-1 items-start gap-2.5 px-1 py-3 text-left"
                    aria-expanded={r.letter ? undefined : expanded}
                  >
                    <span className="mt-0.5 text-lg" aria-hidden>
                      {k.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-brand-weak px-1.5 py-0.5 text-xs font-bold text-brand-strong">
                          {nm(r.sid)}
                        </span>
                        <span className={`text-[15px] ${r.todo ? "font-extrabold text-ink-900" : "font-bold text-ink-700"}`}>
                          {r.title}
                        </span>
                        {isNew && (
                          <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                            NEW
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                        <span>{k.label}</span>
                        <span>{when(r.at)}</span>
                        <span className={r.todo ? "font-bold text-warn" : ""}>{r.status}</span>
                        {r.shop && <span>{r.body}</span>}
                      </span>
                    </span>
                  </button>
                  {r.shop && (
                    <span className="flex shrink-0 gap-1.5 py-3 pr-1">
                      <button
                        onClick={() => void decide(r.shop!.r, r.shop!.w, true)}
                        disabled={busy != null}
                        className="press rounded-btn bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => void decide(r.shop!.r, r.shop!.w, false)}
                        disabled={busy != null}
                        className="press rounded-btn bg-white px-3 py-1.5 text-xs font-bold text-ink-600 ring-1 ring-ink-200 disabled:opacity-40"
                      >
                        반려
                      </button>
                    </span>
                  )}
                </div>
                {expanded && (
                  <div className="mb-3 ml-9 rounded-btn bg-ink-50 px-3 py-2.5 text-sm text-ink-700">
                    {r.body && <p className="whitespace-pre-wrap break-words">{r.body}</p>}
                    {r.href && (
                      <Link href={r.href} className="mt-2 inline-block font-bold text-brand-strong underline">
                        처리하러 가기 →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
        <select
          value={pageSize}
          onChange={(e) => (setPageSize(Number(e.target.value)), setPage(1))}
          className="rounded-btn border border-ink-300 px-2 py-1.5 text-xs"
          aria-label="한 쪽에 보일 개수"
        >
          <option value={10}>10개씩</option>
          <option value={20}>20개씩</option>
        </select>
      </div>
      {openLetter && <LetterModal letter={openLetter} allTags={allTags} onClose={() => setLetterKey(null)} />}
    </Card>
  );
}
