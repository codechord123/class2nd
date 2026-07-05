"use client";
// 상점 — 2학기 실버와 1학기 이월 지갑을 완전 격리 (요구사항 §D).
// 구매는 신청 → 교사 승인. 이월 지갑 잔액 = 정적 silverRemaining − 승인된 사용량.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { s1ClassGoldRemaining, getS1WalletOf } from "@/lib/staticData";
import ShopAdmin from "@/components/teacher/ShopAdmin";
import {
  useBalances,
  useMyRequests,
  useCreateSpendRequest,
  signedAmount,
  type WalletKind,
} from "@/lib/query/wallet";
import { useShopMenu } from "@/lib/query/classMeta";
import { useSettings } from "@/lib/query/settings";
import { isRequestOpen, requestWindowLabel } from "@/lib/requestWindow";
import SubTabs from "@/components/ui/SubTabs";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useFeedback } from "@/components/ui/Feedback";
import JuiceBurst from "@/components/ui/Juice";

const STATUS_LABEL = { pending: "⏳ 대기", approved: "✅ 승인", rejected: "❌ 반려" } as const;
const STATUS_STYLE = {
  pending: "bg-warn-weak text-warn",
  approved: "bg-success-weak text-success",
  rejected: "bg-danger-weak text-danger",
} as const;
const WALLET_LABEL = { s2: "2학기 실버", s1: "이월 실버" } as const;

export default function ShopPage() {
  const { role, studentId } = useSession();
  const { data: s2Bal } = useBalances("s2");
  const { data: s1Used } = useBalances("s1");

  const [tab, setTab] = useState<"shop" | "history">("shop");
  const [wallet, setWallet] = useState<WalletKind>("s2");
  const [amount, setAmount] = useState("1");
  const [item, setItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [directOpen, setDirectOpen] = useState(false);
  const [buyBurst, setBuyBurst] = useState(0); // 신청·예약 성공 juice
  const { toast, confirm } = useFeedback();

  const createRequest = useCreateSpendRequest(wallet, studentId);
  const createGoldRequest = useCreateSpendRequest("s1", studentId);
  const { data: myS2 } = useMyRequests("s2", studentId);
  const { data: myS1 } = useMyRequests("s1", studentId);
  const { data: menu } = useShopMenu();
  const { data: settings } = useSettings();

  // 신청 가능 시간대 (KST) — 교사는 제한 없음
  const openHour = settings?.requestOpenHour ?? 16;
  const closeHour = settings?.requestCloseHour ?? 24;
  const windowLabel = requestWindowLabel(openHour, closeHour);
  const requestOpen = role === "teacher" || isRequestOpen(openHour, closeHour);

  // 교사는 상점 탭에서 관리 화면을 본다 (승인·기록·지급·메뉴판 — 교사탭에서 이동)
  if (role === "teacher") return <ShopAdmin />;

  const myS2Balance = studentId ? (s2Bal?.[String(studentId)] ?? 0) : 0;
  const myS1Remaining = studentId
    ? (getS1WalletOf(studentId)?.silverRemaining ?? 0) - (s1Used?.[String(studentId)] ?? 0)
    : 0;
  // 골드 = 1학기 이월분 − 사용 + 실버 마일스톤 적립(실버 25개 벌 때마다 +1)
  const classGoldLeft =
    s1ClassGoldRemaining - (s1Used?.classGoldUsed ?? 0) + (s1Used?.classGoldEarned ?? 0);
  // 잔액 홀드 — 승인 대기 중인 신청 금액은 이미 쓴 것으로 본다 (잔액 1개로 이중 신청 방지)
  const holdOf = (reqs: { status: string; type?: string; amount: number }[] | undefined) =>
    (reqs ?? [])
      .filter((r) => r.status === "pending" && r.type !== "gold")
      .reduce((a, r) => a + r.amount, 0);
  const s2Hold = holdOf(myS2);
  const s1Hold = holdOf(myS1);
  const availOf = (w: WalletKind) =>
    w === "s2" ? myS2Balance - s2Hold : myS1Remaining - s1Hold;

  // 직접 입력 신청 — 검증 → 확인 다이얼로그 → 신청.
  // 시간창 밖이면 '예약 담기' — 접수는 되고 승인은 똑같이 다음 날 아침 (깜빡 방지)
  async function submit() {
    const n = Number(amount);
    const name = item.trim();
    if (!name) {
      toast("사고 싶은 것을 적어주세요.", "warn");
      return;
    }
    if (!Number.isInteger(n) || n <= 0) {
      toast("개수를 확인해주세요.", "warn");
      return;
    }
    const max = availOf(wallet);
    if (n > max) {
      toast(
        max < (wallet === "s2" ? myS2Balance : myS1Remaining)
          ? "승인 기다리는 신청까지 계산하면 실버가 모자라요."
          : "가진 실버보다 많이 쓸 수 없어요.",
        "warn"
      );
      return;
    }
    const ok = await confirm({
      title: requestOpen ? `"${name}" 신청할까요?` : `"${name}" 예약으로 담을까요?`,
      body: requestOpen
        ? `${WALLET_LABEL[wallet]} 지갑에서 ${n}개가 나가요 (선생님 승인 후)`
        : `지금은 신청 시간(${windowLabel})이 아니라 예약으로 담아요. ${WALLET_LABEL[wallet]} 지갑에서 ${n}개 — 선생님이 다음 날 아침에 승인해요.`,
      confirmLabel: requestOpen ? "신청" : "예약 담기",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await createRequest(n, name, "spend", { reserved: !requestOpen });
      setBuyBurst((k) => k + 1);
      setItem("");
      toast(
        requestOpen ? "신청 완료! 선생님 승인을 기다려주세요." : "🕓 예약 완료! 내일 아침에 승인돼요.",
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "신청에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  // 메뉴판 카드 신청 — 검증 → 확인 다이얼로그 → 신청 (busy 가드로 중복 신청 차단)
  async function requestMenuItem(m: NonNullable<typeof menu>[number]) {
    if (busy) return;
    if (m.wallet === "gold") {
      // 골드는 학급 공용 재화 — 사용 신청은 학급 회장만 (사용자 확정, 설정에서 지정)
      if (role === "student" && studentId !== settings?.presidentId) {
        toast(
          settings?.presidentId
            ? "🥇 골드토큰은 학급 회장만 신청할 수 있어요 — 학급 회의에서 정한 뒤 회장에게 부탁해요!"
            : "🥇 골드토큰은 학급 회장만 신청할 수 있어요 — 아직 회장이 지정되지 않았어요.",
          "warn"
        );
        return;
      }
      if (m.price > classGoldLeft) {
        toast("학급 골드토큰이 부족해요.", "warn");
        return;
      }
    } else {
      const max = availOf(wallet);
      if (m.price > max) {
        toast(
          max < (wallet === "s2" ? myS2Balance : myS1Remaining)
            ? "승인 기다리는 신청까지 계산하면 실버가 모자라요."
            : "가진 실버보다 비싸요. 지갑을 바꾸거나 더 모아요!",
          "warn"
        );
        return;
      }
    }
    const cost =
      m.wallet === "gold"
        ? `학급 골드토큰 ${m.price}개를 사용해요`
        : `${WALLET_LABEL[wallet]} 지갑에서 ${m.price}개가 나가요`;
    const ok = await confirm({
      title: requestOpen ? `"${m.name}" 신청할까요?` : `"${m.name}" 예약으로 담을까요?`,
      body: requestOpen
        ? `${cost} (선생님 승인 후)`
        : `지금은 신청 시간(${windowLabel})이 아니라 예약으로 담아요. ${cost} — 선생님이 다음 날 아침에 승인해요.`,
      confirmLabel: requestOpen ? "신청" : "예약 담기",
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (m.wallet === "gold")
        await createGoldRequest(m.price, m.name, "gold", { reserved: !requestOpen });
      else await createRequest(m.price, m.name, "spend", { reserved: !requestOpen });
      setBuyBurst((k) => k + 1);
      toast(
        requestOpen
          ? `"${m.name}" 신청 완료! 선생님 승인을 기다려주세요.`
          : `🕓 "${m.name}" 예약 완료! 내일 아침에 승인돼요.`,
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "신청에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const myRequests = [...(myS2 ?? []).map((r) => ({ ...r, wallet: "s2" as const })), ...(myS1 ?? []).map((r) => ({ ...r, wallet: "s1" as const }))].sort(
    (a, b) => b.createdAt - a.createdAt
  );

  return (
    <div className="space-y-4">
      {/* 내 지갑 — 잔액 요약 + (상점 탭) 결제 지갑 토글을 한 카드로 압축 */}
      {role === "student" && studentId && (
        <section className="relative rounded-card border border-ink-200 bg-white p-4 shadow-card">
          {/* 신청·예약 성공 juice */}
          <JuiceBurst fireKey={buyBurst} emojis={["🛒", "✨", "🧾"]} className="left-1/2 top-2" />
          <div className="grid grid-cols-3 divide-x divide-ink-100 text-center">
            <div className="px-1">
              <p className="text-[11px] text-ink-400">2학기 실버</p>
              <p className="tnum text-xl font-extrabold text-ink-900">{myS2Balance}</p>
            </div>
            <div className="px-1">
              <p className="text-[11px] text-ink-400">이월 실버</p>
              <p className="tnum text-xl font-extrabold text-brand-strong">{myS1Remaining}</p>
            </div>
            <div className="px-1">
              <p className="text-[11px] text-ink-400">골드 · 공용</p>
              <p className="tnum text-xl font-extrabold text-warn">{classGoldLeft}</p>
            </div>
          </div>
          {/* 버는 법 — 경제가 쓰기 전용으로 보이지 않게 */}
          <details className="mt-2 border-t border-ink-100 pt-2">
            <summary className="cursor-pointer text-xs font-medium text-ink-400">
              💰 실버는 어떻게 벌어요?
            </summary>
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-600">
              <li>
                🏅 <b>누적 점수 25점</b>이 모일 때마다 실버 1개 (자동!)
              </li>
              <li>⭐ 최다 MVP — 2주 동안 MVP에 가장 많이 뽑힌 친구</li>
              <li>👑 최고 모둠 — 오늘의 모둠에 가장 많이 뽑힌 모둠 전원</li>
              <li>🐢 최다 독서 — 2주 동안 가장 많이 읽은 친구</li>
              <li>📚 주간 최다 독서 모둠 — 매주 감상문을 가장 많이 쓴 모둠 전원</li>
              <li>🎯 최다 미션 모둠 — 칭찬 미션을 가장 많이 성공한 모둠 전원</li>
              <li>🎁 선생님 지급 — 특별히 잘한 일</li>
              <li>
                🥇 <b>실버 25개</b>를 벌 때마다 학급 골드토큰 +1 (자동!)
              </li>
            </ul>
          </details>
          {tab === "shop" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-2">
              <span className="shrink-0 text-xs text-ink-400">결제 지갑</span>
              {(["s2", "s1"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWallet(w)}
                  className={`press rounded-full px-3 py-1 text-xs font-bold ${
                    wallet === w ? "bg-brand text-white" : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {w === "s2" ? `2학기 (${myS2Balance})` : `이월 (${myS1Remaining})`}
                </button>
              ))}
              {(s2Hold > 0 || s1Hold > 0) && (
                <span className="text-[11px] text-ink-400">
                  ⏳ 승인 대기로 잡힌 실버{s2Hold > 0 && ` 2학기 ${s2Hold}`}
                  {s1Hold > 0 && ` 이월 ${s1Hold}`} — 쓸 수 있는 만큼만 신청돼요
                </span>
              )}
            </div>
          )}
        </section>
      )}

      <SubTabs
        tabs={[
          { key: "shop" as const, label: "🛒 상점" },
          { key: "history" as const, label: "📜 내 사용 내역" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* 신청 시간창 안내 — 창 밖에는 '예약 담기'로 접수 (승인은 똑같이 다음 날 아침) */}
      {tab === "shop" && role === "student" && studentId && !requestOpen && (
        <div className="rounded-btn bg-warn-weak px-4 py-2.5 text-sm text-warn">
          🕓 정식 신청 시간은 <b>{windowLabel}</b>이에요. 지금 담으면 <b>예약</b>으로
          접수되고, 승인은 똑같이 다음 날 아침에 나요 — 깜빡할 걱정 없이 미리 담아두세요!
        </div>
      )}

      {/* 메뉴판 — 로딩/빈 상태 안내 */}
      {tab === "shop" && role === "student" && studentId && !menu && <SkeletonCard />}
      {tab === "shop" && role === "student" && studentId && menu && menu.length === 0 && (
        <p className="rounded-card border border-ink-200 bg-white px-4 py-6 text-center text-sm text-ink-400 shadow-card">
          📋 아직 메뉴가 없어요. 선생님이 메뉴를 올리면 여기에 보여요. 그동안은 아래에서 직접 신청할
          수 있어요!
        </p>
      )}

      {/* 메뉴판 (아이들과 토의해 그때그때 추가) */}
      {tab === "shop" && role === "student" && studentId && (menu?.length ?? 0) > 0 && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <h3 className="text-lg font-bold">📋 우리 반 메뉴판</h3>
          <p className="mt-1 text-xs text-ink-600">
            선생님이 올린 메뉴예요. 골라서 신청하면 다음 날 아침에 승인돼요!
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {menu!.map((m) => (
              <div
                key={m.id}
                className={`flex items-center justify-between gap-2 rounded-btn border p-3 ${
                  m.wallet === "gold" ? "border-amber-200 bg-amber-50/60" : "border-ink-200 bg-ink-50"
                }`}
              >
                <div className="text-sm">
                  <b>{m.name}</b>
                  <span className="ml-1.5 text-xs text-ink-600">
                    {m.price}
                    {m.wallet === "gold" ? "골드 (학급 공용)" : "실버"}
                  </span>
                  {m.wallet === "gold" && (
                    <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      🥇 회장 전용
                    </span>
                  )}
                  {m.note && <p className="text-xs text-ink-400">{m.note}</p>}
                </div>
                <button
                  onClick={() => void requestMenuItem(m)}
                  disabled={busy}
                  className={`press shrink-0 rounded-btn px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40 ${
                    m.wallet === "gold" ? "bg-warn" : "bg-brand"
                  }`}
                >
                  {requestOpen ? "신청" : "🕓 예약"}
                </button>
              </div>
            ))}
          </div>

        </section>
      )}

      {/* 직접 입력 신청 — 메뉴판이 주인공, 직접 입력은 접어둠 */}
      {tab === "shop" && role === "student" && studentId && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <button
            onClick={() => setDirectOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-bold text-ink-700">🛒 메뉴에 없는 것 직접 신청</span>
            <span className="text-xs text-ink-400">{directOpen ? "접기 ▲" : "펼치기 ▼"}</span>
          </button>
          {directOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-btn bg-ink-100 px-3 py-2 text-xs font-bold text-ink-500">
                {WALLET_LABEL[wallet]}에서
              </span>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-20 rounded-btn border border-ink-300 px-3 py-2 text-[15px] focus:border-brand focus:outline-none"
              />
              <input
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="무엇에 쓸까요? (예: 간식 교환권 · 자리는 자리 탭에서!)"
                className="min-w-40 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-[15px] focus:border-brand focus:outline-none"
              />
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {requestOpen ? "신청" : "🕓 예약"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* 상점 탭에는 대기 중인 신청만 짧게 — 전체 이력은 '내 사용 내역' 탭 */}
      {tab === "shop" && role === "student" && studentId &&
        myRequests.some((r) => r.status === "pending") && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <p className="text-[15px] font-bold text-ink-800">⏳ 승인 기다리는 신청</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {myRequests.filter((r) => r.status === "pending").map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2.5"
              >
                <span className="min-w-0 truncate">
                  <b className="text-[15px] text-ink-900">{r.item}</b>{" "}
                  <span className="text-xs text-ink-600">
                    ·{" "}
                    {r.type === "gold"
                      ? `🥇 학급 골드 ${r.amount}개`
                      : `${r.wallet === "s2" ? "2학기" : "이월"} 실버 ${r.amount}개`}
                    {r.reserved && " · 🕓 예약"}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE.pending}`}>
                  {STATUS_LABEL.pending}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 📜 내 사용 내역 — 내가 신청·사용한 토큰 전체 (이월 지갑 탭 대체) */}
      {tab === "history" && role === "student" && studentId && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">📜 내 사용 내역</h2>
            <span className="text-xs text-ink-600">
              이월 실버 <b className="text-brand-strong">{myS1Remaining}개</b> 남음 (2학기와 안 섞여요)
            </span>
          </div>
          {myRequests.length === 0 ? (
            <p className="mt-3 rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
              아직 사용한 토큰이 없어요. 상점에서 첫 신청을 해보세요!
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {myRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2.5"
                >
                  <span className="min-w-0 truncate">
                    <b className="text-[15px] text-ink-900">{r.item}</b>{" "}
                    <span className="text-xs text-ink-600">
                      · {r.type === "gold" ? "🥇 골드" : r.wallet === "s2" ? "2학기" : "이월"}
                      <span className="tnum">
                        {" "}· {new Date(r.createdAt).getMonth() + 1}월 {new Date(r.createdAt).getDate()}일
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {/* 받은 실버(+)는 초록, 쓴 실버(−)는 빨강 — 종류(type)로 판단 */}
                    <b
                      className={`tnum text-sm ${
                        signedAmount(r.type, r.amount) > 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      {(() => {
                        const v = signedAmount(r.type, r.amount);
                        return v > 0 ? `+${v}` : `${v}`;
                      })()}
                    </b>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

    </div>
  );
}
