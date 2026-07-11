"use client";
// 🕵️ 숨은 기여 지급 — 금요일 루틴: 건의 탭 '숨은 기여' 메뉴로 들어온 추천(실명+이유)을 보고
// 학생을 골라 실버 1개씩 지급한다. 공정 장치(사용자 확정 설계): ① 기준을 법률로 사전 공개
// ② 추천은 실명+이유 필수(10자↑) ③ 보상량 고정(1개) ④ 주당 상한은 법률로 안내(운영)
// ⑤ 지급 내역은 원장에 공개. 지급하면 추천에 resolved 표시 — 다음 주 목록에서 빠진다.
import { useState } from "react";
import { studentById } from "@/lib/roster";
import { useGrantSilver } from "@/lib/query/wallet";
import {
  useHiddenNominations,
  useResolveHiddenNominations,
  type Suggestion,
} from "@/lib/query/board";
import { useConstitution, useSaveConstitution } from "@/lib/query/classMeta";
import { composeClause, serializeClauses } from "@/lib/lawText";
import { useFeedback } from "@/components/ui/Feedback";

// 숨은 기여 법률 조문 (사용자 확정 초안) — 의장 부서(학급 전체 관장) 법률에 추가한다
const HIDDEN_LAW = {
  dept: "의장",
  title: "숨은 기여",
  clauses: [
    "학급을 위해 드러나지 않게 일한 학생은 실버 1개를 받을 수 있다.",
    "추천은 누구나 '투표·건의'의 숨은 기여 메뉴에서 할 수 있으며, 무엇을 했는지 이유를 반드시 적는다.",
    "선생님은 매주 금요일 추천을 확인하여 지급하고, 지급 내역은 모두에게 공개한다.",
    "한 학생이 같은 주에 받을 수 있는 숨은 기여 실버는 2개를 넘지 않는다.",
    "자기 자신은 추천할 수 없다.",
  ],
};

export default function HiddenContributionPanel() {
  const grantSilver = useGrantSilver();
  const resolveNoms = useResolveHiddenNominations();
  const { data: constitution } = useConstitution();
  const saveConstitution = useSaveConstitution();
  const { toast, confirm } = useFeedback();
  const [loaded, setLoaded] = useState(false); // 옵트인 로드 (읽기 예산)
  const { data: noms } = useHiddenNominations(loaded);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  // 미지급 추천을 받은 사람별로 묶기 — 추천 근거(누가·왜)를 함께 보여준다
  const pending = (noms ?? []).filter((n) => !n.resolved && n.targetId != null);
  const byReceiver = new Map<number, Suggestion[]>();
  for (const n of pending) {
    const to = n.targetId!;
    if (!byReceiver.has(to)) byReceiver.set(to, []);
    byReceiver.get(to)!.push(n);
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
      // 지급된 학생의 추천은 처리 완료 표시 — 다음 금요일 목록에서 제외 (기록은 보존)
      const ids = pending.filter((n) => selected.has(n.targetId!)).map((n) => n.id);
      await resolveNoms(ids).catch(() => {}); // 표시 실패해도 지급은 유효 — 다음에 다시 표시 가능
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
        금요일 루틴 — 아이들이 <b>투표·건의 → 🕵️ 숨은 기여</b>에서 보낸 추천(실명+이유)을 보고
        골라 실버 1개씩. 지급 내역은 원장에 공개돼요. (주당 한 학생 2개 상한은 법률로 안내)
      </p>
      {!loaded ? (
        <button
          onClick={() => setLoaded(true)}
          className="press mt-3 w-full rounded-btn bg-brand-weak py-2.5 text-sm font-bold text-brand-strong"
        >
          📥 들어온 추천 불러오기
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
                      <span className="ml-1 text-xs text-ink-400">추천 {list.length}건</span>
                      {list.map((n) => (
                        <span key={n.id} className="block text-[12px] text-ink-600 [overflow-wrap:anywhere]">
                          · {typeof n.studentId === "number" ? (studentById.get(n.studentId)?.name ?? "?") : "선생님"}
                          : {n.content}
                        </span>
                      ))}
                    </span>
                  </label>
                </li>
              ))}
            {byReceiver.size === 0 && (
              <li className="rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
                대기 중인 추천이 없어요 — 아이들이 투표·건의 탭에서 추천하면 여기 모여요.
              </li>
            )}
          </ul>
          <button
            onClick={() => void pay()}
            disabled={busy || selected.size === 0}
            className="press mt-2 w-full rounded-btn bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            선택한 {selected.size}명에게 실버 1개씩 지급
          </button>
        </>
      )}
    </section>
  );
}
