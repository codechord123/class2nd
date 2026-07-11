"use client";
// 📋 오늘 할 일 브리핑 — 4개 탭에 흩어진 대기 항목을 교사 '오늘' 맨 위에 한 줄로 모은다.
//   자리 승인 · 상점 신청(실버/이월/메뉴 제안) · 이의제기 · 숨은 기여 · 비밀번호 재설정
//   + 최근 학사일 순위 미선정 경고. 칩을 누르면 해당 탭/페이지로 이동.
// 규칙 미게시 감지: 이 카드가 어차피 읽는 scoreAppeals·menuRequests 쿼리가
//   permission-denied로 실패하면 = 콘솔에 최신 firestore.rules가 게시되지 않은 것 —
//   학생 저장이 조용히 실패하는 상태라 빨간 배너로 경고한다 (추가 읽기 0).
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseAuth } from "@/lib/firebase";
import { isWeekend, shiftDate, todayKST } from "@/lib/date";
import { SEMESTER_START } from "@/lib/schedule";
import { BETA_END } from "@/components/BetaBanner";
import { usePendingSeatRequests } from "@/lib/query/seatChange";
import { usePendingRequests } from "@/lib/query/wallet";
import { useAllAppeals } from "@/lib/query/appeals";
import { useHiddenNominations } from "@/lib/query/board";
import { useBestGroups, useMenuRequests } from "@/lib/query/classMeta";
import { useSettings } from "@/lib/query/settings";

const isDenied = (e: unknown) => (e as { code?: string })?.code === "permission-denied";

export default function TodayBriefing({
  onGo,
}: {
  onGo: (tab: "manage" | "settings") => void;
}) {
  const { data: seat } = usePendingSeatRequests(true);
  const { data: pendS2 } = usePendingRequests("s2", true);
  const { data: pendS1 } = usePendingRequests("s1", true);
  const { data: menuReqs, error: menuErr } = useMenuRequests(true);
  const { data: appeals, error: appealErr } = useAllAppeals(true);
  const { data: noms } = useHiddenNominations(true);
  const { data: bestGroups } = useBestGroups();
  const { data: settings } = useSettings();
  // 비밀번호 재설정 요청 — 소량 컬렉션 전체 (PasswordResetPanel과 동일 키로 캐시 공유)
  const { data: resets } = useQuery({
    queryKey: ["resetRequests"],
    queryFn: async () => (await getDocs(collection(db(), "resetRequests"))).docs.length,
    staleTime: 2 * 60 * 1000,
  });

  const nSeat = seat?.length ?? 0;
  const nShop = (pendS2?.length ?? 0) + (pendS1?.length ?? 0) + (menuReqs?.length ?? 0);
  const nAppeal = (appeals ?? []).filter((a) => a.status === "pending").length;
  const nHidden = (noms ?? []).filter((n) => !n.resolved).length;
  const nReset = resets ?? 0;

  // 최근 학사일 순위 미선정 — 어제부터 최대 7일 거슬러 주말·공휴일이 아닌 첫 날 확인.
  // 방학(베타 종료 후 ~ 개학 전)엔 순위가 없는 게 정상이라 경고하지 않는다.
  const today = todayKST();
  let lastSchool = "";
  for (let i = 1; i <= 7; i++) {
    const d = shiftDate(today, -i);
    if (!isWeekend(d) && !(settings?.holidays ?? []).includes(d)) {
      lastSchool = d;
      break;
    }
  }
  const rankRelevant = today <= BETA_END || lastSchool >= SEMESTER_START;
  const missedRank = rankRelevant && lastSchool && !bestGroups?.[lastSchool];

  const chips: { key: string; label: string; go?: "manage" | "settings"; href?: string }[] = [];
  if (nSeat) chips.push({ key: "seat", label: `🎫 자리 승인 ${nSeat}건`, go: "settings" });
  if (nShop) chips.push({ key: "shop", label: `🛒 상점 신청 ${nShop}건`, href: "/shop" });
  if (nAppeal) chips.push({ key: "appeal", label: `🙋 이의제기 ${nAppeal}건`, go: "manage" });
  if (nHidden) chips.push({ key: "hidden", label: `🕵️ 숨은 기여 ${nHidden}건`, go: "manage" });
  if (nReset) chips.push({ key: "reset", label: `🔑 비밀번호 ${nReset}건`, go: "settings" });

  // 규칙 미게시 감지 — 어느 컬렉션이 막혔는지 이름으로 알려준다.
  // 단, 이 기기의 인증이 익명(교사 이메일 아님)이면 규칙이 최신이어도 같은 오류가 난다 —
  // 그 경우 '재로그인' 처방을 먼저 보여준다 (규칙 배너 오진 방지).
  const u = firebaseAuth().currentUser;
  const anonTeacher = !u || u.isAnonymous || !u.email;
  const missingRules = [
    ...(isDenied(appealErr) ? ["이의제기(scoreAppeals)"] : []),
    ...(isDenied(menuErr) ? ["메뉴 제안(menuRequests)"] : []),
  ];

  if (!chips.length && !missedRank && !missingRules.length) return null; // 할 일 없으면 조용히

  const chipCls =
    "press rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink-700 ring-1 ring-ink-200 hover:ring-brand";
  return (
    <section className="rounded-card border border-brand/30 bg-brand-weak/40 p-4 shadow-card">
      <h2 className="text-sm font-extrabold text-ink-800">📋 오늘 할 일</h2>
      {missingRules.length > 0 && (
        <p className="mt-2 rounded-btn bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700">
          {anonTeacher
            ? "⚠️ 이 기기의 로그인이 교사 계정이 아니에요(익명 상태) — 집계·승인 등 모든 교사 작업이 실패해요. 로그아웃 후 교사 이메일로 다시 로그인해주세요."
            : `⚠️ 최신 보안 규칙(firestore.rules)이 콘솔에 게시되지 않았어요 — ${missingRules.join(", ")} 저장이 조용히 실패하는 상태예요. Firebase 콘솔 → Firestore → 규칙에 게시해 주세요.`}
        </p>
      )}
      {missedRank && (
        <p className="mt-2 rounded-btn bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800">
          ⚠️ {Number(lastSchool.slice(5, 7))}월 {Number(lastSchool.slice(8, 10))}일 모둠 순위가
          아직 없어요 — 아래에서 날짜를 바꿔 순위 저장하면 그날 순위 점수가 반영돼요.
        </p>
      )}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) =>
            c.href ? (
              <Link key={c.key} href={c.href} className={chipCls}>
                {c.label} →
              </Link>
            ) : (
              <button key={c.key} onClick={() => c.go && onGo(c.go)} className={chipCls}>
                {c.label} →
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
