"use client";
// 🕵️ 숨은 기여 추천 — 투표·건의 탭의 별도 메뉴 (사용자 확정).
// 학급을 위해 드러나지 않게 일한 친구를 실명+이유로 추천한다. 추천은 선생님에게만 보이고
// (인기투표 방지), 선생님이 매주 금요일 확인해 실버 1개씩 지급 — 지급 내역은 지갑 원장에 공개.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { students, studentById } from "@/lib/roster";
import {
  useNominateHidden,
  useMyHiddenNominations,
  useHiddenNominations,
  useDeleteSuggestion,
} from "@/lib/query/board";
import VoteBoardTabs from "@/components/VoteBoardTabs";
import { useFeedback } from "@/components/ui/Feedback";
import JuiceBurst from "@/components/ui/Juice";

export default function HiddenPage() {
  const { role, studentId } = useSession();
  const nominate = useNominateHidden(studentId);
  const { data: mine } = useMyHiddenNominations(role === "student" ? studentId : null);
  // 교사는 전체 추천을 열람 (지급은 교사 탭 '점수 관리 → 숨은 기여'에서)
  const { data: all } = useHiddenNominations(role === "teacher");
  const deleteSuggestion = useDeleteSuggestion();
  const { toast, confirm } = useFeedback();
  const [target, setTarget] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(0);

  const name = (id: number) => studentById.get(id)?.name ?? "?";
  const fmtDay = (ms: number) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  async function submit() {
    if (busy) return;
    if (target == null) {
      toast("추천할 친구를 골라주세요.", "warn");
      return;
    }
    if (reason.trim().length < 10) {
      toast("무엇을 했는지 10글자 이상 적어주세요 — 이유가 공정함을 지켜요.", "warn");
      return;
    }
    setBusy(true);
    try {
      await nominate(target, reason);
      setTarget(null);
      setReason("");
      setBurst((k) => k + 1);
      toast("🕵️ 추천했어요! 선생님이 금요일에 확인해요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "추천에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <VoteBoardTabs current="hidden" />

      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h3 className="text-lg font-bold">🕵️ 숨은 기여 추천</h3>
        <p className="mt-1 text-[13px] text-ink-600">
          학급을 위해 <b>드러나지 않게 일한 친구</b>를 봤나요? 실명과 이유로 추천해요. 추천은{" "}
          <b className="text-brand-strong">선생님에게만 보이고</b>, 선생님이 매주 금요일 확인해{" "}
          <b>실버 1개</b>를 지급해요 (지급 내역은 지갑에 공개 · 한 사람 주 2개까지 · 자기 추천 금지).
        </p>

        {role === "student" && studentId != null && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {students
                .filter((s) => !s.inactive && s.id !== studentId)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setTarget(target === s.id ? null : s.id)}
                    className={`press rounded-full border px-3 py-1.5 text-sm font-medium ${
                      target === s.id
                        ? "border-violet-400 bg-violet-500 text-white"
                        : "border-ink-200 bg-white text-ink-600 hover:border-violet-300"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
                }}
                placeholder={
                  target != null
                    ? `${name(target)}이(가) 무엇을 했나요? (예: 아무도 안 볼 때 우유갑을 정리했어요)`
                    : "먼저 위에서 친구를 골라주세요"
                }
                className="min-w-0 flex-1 rounded-btn border border-ink-200 bg-white px-3 py-2 text-sm"
              />
              <span className="relative shrink-0">
                <button
                  onClick={() => void submit()}
                  disabled={busy || target == null || reason.trim().length < 10}
                  className="press rounded-btn bg-violet-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? "보내는 중…" : "추천하기"}
                </button>
                <JuiceBurst fireKey={burst} emojis={["🕵️", "✨", "💜"]} className="left-1/2 top-0" />
              </span>
            </div>
            {target != null && (
              <p className={`mt-1 text-[11px] ${reason.trim().length >= 10 ? "text-emerald-600" : "text-ink-400"}`}>
                {reason.trim().length >= 10
                  ? `✓ 좋아요! (${reason.trim().length}글자)`
                  : `10글자 이상 — ${10 - reason.trim().length}글자 더 써주세요`}
              </p>
            )}
          </>
        )}
      </section>

      {/* 내가 한 추천 (학생) — 지급 전엔 삭제 가능 */}
      {role === "student" && (mine?.length ?? 0) > 0 && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <h3 className="text-base font-bold">💌 내가 한 추천</h3>
          <ul className="mt-2 space-y-1.5">
            {mine!.map((n) => (
              <li key={n.id} className="flex items-start gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm">
                <span className="shrink-0 font-bold text-violet-700">
                  {n.targetId != null ? name(n.targetId) : "?"}
                </span>
                <span className="min-w-0 flex-1 text-ink-600 [overflow-wrap:anywhere]">{n.content}</span>
                <span className="shrink-0 text-[11px] text-ink-400">{fmtDay(n.createdAt)}</span>
                {n.resolved ? (
                  <span className="shrink-0 text-[11px] font-bold text-success">✓ 지급됨</span>
                ) : (
                  <button
                    onClick={() =>
                      void (async () => {
                        if (await confirm({ title: "이 추천을 삭제할까요?", danger: true })) {
                          await deleteSuggestion(n.id).catch((e: Error) => toast(`⚠️ ${e.message}`, "error"));
                          toast("삭제했어요.");
                        }
                      })()
                    }
                    className="shrink-0 text-[11px] text-ink-400 hover:text-danger"
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 교사 — 전체 추천 열람 (지급은 교사 탭에서) */}
      {role === "teacher" && (
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <h3 className="text-base font-bold">
            📥 들어온 추천 <span className="text-sm font-normal text-ink-400">({(all ?? []).filter((n) => !n.resolved).length}건 대기)</span>
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            지급은 <b>교사 탭 → 점수 관리 → 🕵️ 숨은 기여</b>에서 해요.
          </p>
          <ul className="mt-2 space-y-1.5">
            {(all ?? []).slice(0, 30).map((n) => (
              <li key={n.id} className="flex items-start gap-2 rounded-btn bg-ink-50 px-3 py-2 text-sm">
                <span className="shrink-0 font-bold text-violet-700">
                  {n.targetId != null ? name(n.targetId) : "?"}
                </span>
                <span className="min-w-0 flex-1 text-ink-600 [overflow-wrap:anywhere]">
                  {n.content}
                  <span className="ml-1 text-[11px] text-ink-400">
                    — {typeof n.studentId === "number" ? name(n.studentId) : "선생님"} 추천 · {fmtDay(n.createdAt)}
                  </span>
                </span>
                {n.resolved && <span className="shrink-0 text-[11px] font-bold text-success">✓ 지급됨</span>}
              </li>
            ))}
            {(all ?? []).length === 0 && (
              <li className="rounded-btn bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">
                아직 추천이 없어요.
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
