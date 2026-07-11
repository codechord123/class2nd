"use client";
// 🕵️ 숨은 기여 지급 — 금요일 루틴: 이번 주 칭찬(실명+이유)을 훑어 '드러나지 않게 일한 학생'을
// 골라 실버 1개씩 지급한다. 공정 장치(사용자 확정 설계): ① 기준을 법률로 사전 공개
// ② 추천(칭찬)은 실명+이유 필수(기존 칭찬하기 재사용) ③ 보상량 고정(1개) ④ 주당 상한은
// 법률로 안내(운영) ⑤ 지급 내역은 원장에 공개.
// 읽기 예산: 버튼을 눌렀을 때만 최근 7일 집계 문서 7개를 읽는다 (옵트인).
import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { shiftDate, todayKST } from "@/lib/date";
import { studentById } from "@/lib/roster";
import { useGrantSilver } from "@/lib/query/wallet";
import { useConstitution, useSaveConstitution } from "@/lib/query/classMeta";
import { composeClause, serializeClauses } from "@/lib/lawText";
import { useFeedback } from "@/components/ui/Feedback";

// 숨은 기여 법률 조문 (사용자 확정 초안) — 의장 부서(학급 전체 관장) 법률에 추가한다
const HIDDEN_LAW = {
  dept: "의장",
  title: "숨은 기여",
  clauses: [
    "학급을 위해 드러나지 않게 일한 학생은 실버 1개를 받을 수 있다.",
    "추천은 누구나 할 수 있으며, 무엇을 했는지 이유를 반드시 적는다.",
    "선생님은 매주 금요일 추천을 확인하여 지급하고, 지급 내역은 모두에게 공개한다.",
    "한 학생이 같은 주에 받을 수 있는 숨은 기여 실버는 2개를 넘지 않는다.",
    "자기 자신은 추천할 수 없다.",
  ],
};

type Comp = { from: number; to: number; text: string; date: string };

export default function HiddenContributionPanel() {
  const grantSilver = useGrantSilver();
  const { data: constitution } = useConstitution();
  const saveConstitution = useSaveConstitution();
  const { toast, confirm } = useFeedback();
  const [comps, setComps] = useState<Comp[] | null>(null); // null = 아직 안 불러옴
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  // 최근 7일 칭찬 모으기 — 집계 문서의 _meta.compliments 재사용 (7문서, 옵트인)
  async function loadWeek() {
    if (busy) return;
    setBusy(true);
    try {
      const d = db();
      const today = todayKST();
      const all: Comp[] = [];
      for (let i = 0; i < 7; i++) {
        const date = shiftDate(today, -i);
        const snap = await getDoc(doc(d, "dailyScores", date));
        if (!snap.exists()) continue;
        const meta = (snap.data()._meta ?? {}) as {
          compliments?: { from: number; to: number; text: string }[];
        };
        for (const c of meta.compliments ?? []) all.push({ ...c, date });
      }
      setComps(all);
      setSelected(new Set());
      if (!all.length) toast("최근 7일 집계에 칭찬이 없어요.", "warn");
    } catch (e) {
      toast(e instanceof Error ? e.message : "불러오기에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (busy || selected.size === 0) return;
    const names = [...selected].map((id) => studentById.get(id)?.name ?? "?").join(", ");
    const ok = await confirm({
      title: `숨은 기여 실버를 지급할까요?`,
      body: `${names} — 각 실버 1개. 원장에 '🕵️ 숨은 기여'로 기록되어 모두에게 공개돼요.`,
      confirmLabel: "지급",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await grantSilver([...selected], 1, "🕵️ 숨은 기여");
      toast(`🕵️ 숨은 기여 지급 완료 — ${names} (+1)`, "success");
      setSelected(new Set());
    } catch (e) {
      toast(e instanceof Error ? e.message : "지급에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  // 조문을 헌법(의장 부서 법률)에 추가 — 같은 제목이 있으면 중복 방지
  async function addLaw() {
    if (busy || !constitution) return;
    const existing = constitution.lawsByDept?.[HIDDEN_LAW.dept] ?? [];
    if (existing.some((l) => l.includes(`(${HIDDEN_LAW.title})`))) {
      toast("이미 '숨은 기여' 조문이 법률에 있어요.", "warn");
      return;
    }
    const ok = await confirm({
      title: "'숨은 기여' 조문을 법률에 추가할까요?",
      body: "의장 부서 법률에 제N조(숨은 기여) ①~⑤항이 들어가요 — 기준을 미리 공개해 공정하게.",
      confirmLabel: "법률에 추가",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const clause = composeClause(
        existing.length + 1,
        HIDDEN_LAW.title,
        serializeClauses(HIDDEN_LAW.clauses)
      );
      await saveConstitution({
        ...constitution,
        lawsByDept: { ...(constitution.lawsByDept ?? {}), [HIDDEN_LAW.dept]: [...existing, clause] },
      });
      toast("📜 '숨은 기여' 조문을 법률에 추가했어요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "추가에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  // 받은 사람별로 묶기 — 추천(칭찬) 근거를 함께 보여준다
  const byReceiver = new Map<number, Comp[]>();
  for (const c of comps ?? []) {
    if (!byReceiver.has(c.to)) byReceiver.set(c.to, []);
    byReceiver.get(c.to)!.push(c);
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">🕵️ 숨은 기여 지급</h2>
        <button
          onClick={() => void addLaw()}
          className="press rounded-btn bg-ink-100 px-2.5 py-1.5 text-xs font-bold text-ink-600"
        >
          📜 법률로 추가
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-600">
        금요일 루틴 — 이번 주 칭찬(실명+이유)에서 <b>드러나지 않게 일한 학생</b>을 골라 실버
        1개씩. 지급 내역은 원장에 공개돼요. (주당 한 학생 2개 상한은 법률로 안내)
      </p>
      {comps === null ? (
        <button
          onClick={() => void loadWeek()}
          disabled={busy}
          className="press mt-3 w-full rounded-btn bg-brand-weak py-2.5 text-sm font-bold text-brand-strong disabled:opacity-50"
        >
          {busy ? "불러오는 중…" : "📥 이번 주 칭찬 불러오기 (최근 7일)"}
        </button>
      ) : (
        <>
          <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
            {[...byReceiver.entries()]
              .sort((a, b) => b[1].length - a[1].length)
              .map(([to, list]) => (
                <li key={to} className="rounded-btn bg-ink-50 px-3 py-2">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(to)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(to)) next.delete(to);
                          else next.add(to);
                          return next;
                        })
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <b className="text-sm">{studentById.get(to)?.name ?? "?"}</b>
                      <span className="ml-1 text-xs text-ink-400">칭찬 {list.length}건</span>
                      {list.map((c, i) => (
                        <span key={i} className="block text-[12px] text-ink-600 [overflow-wrap:anywhere]">
                          · {studentById.get(c.from)?.name}: {c.text}
                        </span>
                      ))}
                    </span>
                  </label>
                </li>
              ))}
            {byReceiver.size === 0 && (
              <li className="rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
                최근 7일 집계에 칭찬이 없어요.
              </li>
            )}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void pay()}
              disabled={busy || selected.size === 0}
              className="press flex-1 rounded-btn bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              선택한 {selected.size}명에게 실버 1개씩 지급
            </button>
            <button
              onClick={() => void loadWeek()}
              disabled={busy}
              className="press shrink-0 rounded-btn bg-ink-100 px-3 py-2.5 text-sm font-bold text-ink-600"
            >
              🔄
            </button>
          </div>
        </>
      )}
    </section>
  );
}
