"use client";
// 🕵️ 숨은 기여 지급 — 금요일 루틴 (사용자 확정: 건의로 추천 → 학급 👍👎 투표로 결정 → 교사 지급).
// 건의 게시판의 '숨은 기여 추천' 글과 찬반 투표 결과를 보고 학생을 골라 실버 1개씩 지급한다.
// 공정 장치: ① 기준을 법률로 사전 공개 ② 추천은 실명+이유 필수(10자↑) ③ 학급 투표로 결정
// ④ 보상량 고정(1개)·주당 상한은 법률로 안내 ⑤ 지급 내역은 원장에 공개.
// 지급하면 추천에 resolved 표시 — 다음 주 목록에서 빠진다.
import { useEffect, useRef, useState } from "react";
import { studentById } from "@/lib/roster";
import { useGrantSilver } from "@/lib/query/wallet";
import {
  useHiddenNominations,
  useResolveHiddenNominations,
  reactionCounts,
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
    "추천은 누구나 건의 게시판의 '숨은 기여 추천'으로 할 수 있으며, 무엇을 했는지 이유를 반드시 적는다.",
    "추천은 학급의 찬성 투표로 결정하고, 선생님이 매주 금요일 확인하여 지급한다. 지급 내역은 모두에게 공개한다.",
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

  // 조문을 헌법(의장 부서 법률)에 자동 등록 (사용자 확정: 버튼 없이 추가) —
  // 패널이 열릴 때 조문이 없으면 한 번만 넣는다. 제목 존재 검사로 멱등(다시 열어도 중복 없음).
  const lawAdded = useRef(false);
  useEffect(() => {
    if (!constitution || lawAdded.current) return;
    const existing = constitution.lawsByDept?.[HIDDEN_LAW.dept] ?? [];
    if (existing.some((l) => l.includes(`(${HIDDEN_LAW.title})`))) {
      lawAdded.current = true; // 이미 있음
      return;
    }
    lawAdded.current = true; // 선(先)마킹 — 개발 모드 이중 이펙트·재렌더 중복 방지
    const clause = composeClause(
      existing.length + 1,
      HIDDEN_LAW.title,
      serializeClauses(HIDDEN_LAW.clauses)
    );
    void saveConstitution({
      ...constitution,
      lawsByDept: { ...(constitution.lawsByDept ?? {}), [HIDDEN_LAW.dept]: [...existing, clause] },
    })
      .then(() => toast("📜 '숨은 기여' 조문이 의장 법률에 자동 등록됐어요.", "success"))
      .catch(() => {
        lawAdded.current = false; // 실패 시 다음 렌더에서 재시도
      });
  }, [constitution, saveConstitution, toast]);

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">🕵️ 숨은 기여 지급</h2>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">
          📜 의장 법률 자동 등록
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-600">
        금요일 루틴 — 건의 게시판의 <b>숨은 기여 추천</b>과 학급 <b>👍👎 투표 결과</b>를 보고 골라
        실버 1개씩. 지급 내역은 원장에 공개돼요. (주당 한 학생 2개 상한은 법률로 안내)
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
              // 찬성 투표 합이 많은 순 (동률이면 추천 건수 순) — 투표로 결정 (사용자 확정)
              .sort((a, b) => {
                const up = (l: Suggestion[]) => l.reduce((s, n) => s + reactionCounts(n).up, 0);
                return up(b[1]) - up(a[1]) || b[1].length - a[1].length;
              })
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
                      {list.map((n) => {
                        const rc = reactionCounts(n);
                        return (
                          <span key={n.id} className="block text-[12px] text-ink-600 [overflow-wrap:anywhere]">
                            · {typeof n.studentId === "number" ? (studentById.get(n.studentId)?.name ?? "?") : "선생님"}
                            : {n.content}{" "}
                            <b className={rc.up > rc.down ? "text-success" : "text-ink-400"}>
                              👍{rc.up}
                            </b>
                            {rc.down > 0 && <b className="text-danger"> 👎{rc.down}</b>}
                          </span>
                        );
                      })}
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
