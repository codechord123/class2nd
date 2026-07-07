"use client";
// 전학생·전출 관리 — 코드 수정 없이 명단을 조정한다 (classData/roster 오버라이드).
//   · 전입 처리(원클릭): 전출간 친구의 번호 이어받기 = 이름 변경 + 전출 해제 +
//     기록 초기화(누적 점수·MVP·독서·2학기 실버·이월 실버 → 전부 0에서 새로 시작).
//     자리는 그 번호의 자리표 자리를 그대로 물려받는다 (사용자 확정).
//   · 전출: 비활성 표시 → 이름에 (전출) + 평가 대상·칭찬 미션 계산에서 제외
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { students, applyRosterOverrides, type RosterOverrides } from "@/lib/roster";
import { getS1WalletOf, s1BooksByStudent } from "@/lib/staticData";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";

export default function TransferPanel() {
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const [ov, setOv] = useState<RosterOverrides>({ renames: {}, inactive: [] });
  const [loaded, setLoaded] = useState(false);
  const [sid, setSid] = useState(1);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getDoc(doc(db(), "classData", "roster"))
      .then((snap) => {
        if (snap.exists()) setOv(snap.data() as RosterOverrides);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save(next: RosterOverrides, okMsg: string) {
    setBusy(true);
    try {
      await setDoc(doc(db(), "classData", "roster"), next);
      setOv(next);
      applyRosterOverrides(next); // 이 세션에 즉시 반영 (다른 화면은 새로고침 시)
      toast(`${okMsg} — 다른 화면·기기에는 새로고침 후 반영돼요.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    const name = newName.trim();
    if (!name) {
      toast("새 이름을 입력해주세요.", "warn");
      return;
    }
    const next: RosterOverrides = {
      ...ov,
      renames: { ...(ov.renames ?? {}), [String(sid)]: name },
    };
    await save(next, `✅ ${sid}번 이름을 "${name}"(으)로 변경`);
    setNewName("");
  }

  async function resetName() {
    const renames = { ...(ov.renames ?? {}) };
    delete renames[String(sid)];
    await save({ ...ov, renames }, `↩️ ${sid}번 이름을 원래대로 되돌림`);
  }

  // 전입 처리 — 번호 승계 + 기록 0에서 새로 시작 (사용자 확정).
  // 초기화 대상: 누적 점수·MVP·득표·칭찬 연속, 독서(총·주별·1학기 보정), 2학기 실버 잔액,
  // 이월 실버(사용량 = 이월분으로 채워 잔여 0). 과거 일일 기록 문서는 역사로 남는다.
  async function enrollNew() {
    const name = newName.trim();
    if (!name) {
      toast("전입생 이름을 먼저 입력해주세요.", "warn");
      return;
    }
    const ok = await confirm({
      title: `${sid}번에 "${name}" 전입 처리할까요?`,
      body: `${sid}번의 누적 점수·MVP·독서·실버(2학기/이월)가 모두 0으로 초기화되고, 이름이 "${name}"(으)로 바뀌며 전출 표시가 해제돼요. 자리는 기존 ${sid}번 자리를 그대로 물려받아요. 이 초기화는 되돌릴 수 없어요.`,
      confirmLabel: "전입 처리",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = db();
      const key = String(sid);
      // ① 명단: 이름 변경 + 전출 해제
      const next: RosterOverrides = {
        renames: { ...(ov.renames ?? {}), [key]: name },
        inactive: (ov.inactive ?? []).filter((n) => n !== sid),
      };
      await setDoc(doc(d, "classData", "roster"), next);
      setOv(next);
      applyRosterOverrides(next);
      // ② 누적 점수·타이틀·연속 기록 초기화
      await setDoc(
        doc(d, "dailyScores", "_cumulative"),
        {
          [key]: 0,
          mvpWins: { [key]: 0 },
          mvpVotesTotal: { [key]: 0 },
          compStreak: { [key]: 0 },
          silverEarned: { [key]: 0 },
        },
        { merge: true }
      );
      // ③ 독서: 2학기 총·주별 0, 1학기 권수는 보정으로 상쇄 (표시 = 실기록 + s1Adj)
      const statsSnap = await getDoc(doc(d, "readingStats", "main"));
      const stats = (statsSnap.exists() ? statsSnap.data() : {}) as {
        byWeek?: Record<string, Record<string, number>>;
      };
      const byWeekZero: Record<string, Record<string, number>> = {};
      for (const [w, m] of Object.entries(stats.byWeek ?? {}))
        if (m?.[key]) byWeekZero[w] = { [key]: 0 };
      await setDoc(
        doc(d, "readingStats", "main"),
        {
          total: { [key]: 0 },
          s1Adj: { [key]: -(s1BooksByStudent[key] ?? 0) },
          byWeek: byWeekZero,
        },
        { merge: true }
      );
      // ④ 지갑: 2학기 실버 잔액 0 · 이월 실버 잔여 0(사용량 = 이월분)
      await setDoc(doc(d, "coinTxns", "0_balances"), { [key]: 0 }, { merge: true });
      await setDoc(
        doc(d, "s1Spends", "0_balances"),
        { [key]: getS1WalletOf(sid)?.silverRemaining ?? 0 },
        { merge: true }
      );
      for (const qk of ["cumulativeScores", "readingStats"] as const)
        void qc.invalidateQueries({ queryKey: [qk] });
      void qc.invalidateQueries({ queryKey: ["balances", "s2"] });
      void qc.invalidateQueries({ queryKey: ["balances", "s1"] });
      setNewName("");
      toast(
        `✅ ${sid}번 "${name}" 전입 완료 — 기록이 0에서 시작해요. 비밀번호 관리에서 ${sid}번을 초기화해주세요.`,
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "전입 처리에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleInactive() {
    const inactive = new Set(ov.inactive ?? []);
    const turningOff = inactive.has(sid);
    if (!turningOff) {
      const ok = await confirm({
        title: `${sid}번을 전출 처리할까요?`,
        body: "이름에 (전출)이 붙고, 모둠 평가 대상·칭찬 미션 계산에서 빠져요. 점수·기록은 지워지지 않고, 언제든 해제할 수 있어요.",
        confirmLabel: "전출 처리",
        danger: true,
      });
      if (!ok) return;
      inactive.add(sid);
    } else {
      inactive.delete(sid);
    }
    await save(
      { ...ov, inactive: [...inactive] },
      turningOff ? `↩️ ${sid}번 전출 해제` : `✅ ${sid}번 전출 처리`
    );
  }

  const renameEntries = Object.entries(ov.renames ?? {});
  const inactiveList = ov.inactive ?? [];
  const isInactive = inactiveList.includes(sid);

  return (
    <Card title="🚌 전학생·전출 관리" desc="코드 수정 없이 명단을 조정해요 (전 기기 공통 반영)">
      {!loaded ? (
        <p className="mt-3 text-xs text-ink-400">불러오는 중…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={sid}
              onChange={(e) => setSid(Number(e.target.value))}
              className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}번 {s.name}
                </option>
              ))}
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void rename();
              }}
              placeholder="새 이름 (전입생)"
              className="w-36 rounded-btn border border-ink-300 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void rename()}
              disabled={busy}
              className="press rounded-btn border border-ink-300 bg-white px-3 py-2 text-sm font-bold text-ink-600 disabled:opacity-50"
            >
              이름만 변경
            </button>
            <button
              onClick={() => void enrollNew()}
              disabled={busy}
              className="press rounded-btn bg-brand px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              🆕 전입 처리
            </button>
            <button
              onClick={() => void toggleInactive()}
              disabled={busy}
              className={`press rounded-btn px-3 py-2 text-sm font-bold disabled:opacity-50 ${
                isInactive
                  ? "border border-ink-300 bg-white text-ink-600"
                  : "border border-danger/40 bg-white text-danger"
              }`}
            >
              {isInactive ? "전출 해제" : "전출 처리"}
            </button>
          </div>

          {(renameEntries.length > 0 || inactiveList.length > 0) && (
            <div className="mt-3 space-y-1 rounded-btn bg-ink-50 p-3 text-xs text-ink-600">
              {renameEntries.map(([k, v]) => (
                <p key={k}>
                  ✏️ {k}번 → <b>{v}</b>
                  {inactiveList.includes(Number(k)) && " (전출)"}
                </p>
              ))}
              {inactiveList
                .filter((n) => !(ov.renames ?? {})[String(n)])
                .map((n) => (
                  <p key={n}>🚌 {n}번 전출</p>
                ))}
            </div>
          )}

          <p className="mt-3 rounded-btn bg-sky-50 p-3 text-[11px] leading-relaxed text-sky-800">
            <b>전입생 절차</b>: ① 전출간 친구(또는 빈) 번호를 고르고 이름 입력 → <b>🆕 전입
            처리</b> 한 번이면 끝 — 점수·MVP·독서·실버가 전부 0에서 새로 시작하고, <b>자리는 그
            번호의 자리를 그대로 물려받아요</b>. ② 비밀번호 관리에서 그 번호를 초기화해 새 비밀번호를
            정해주세요. <b>전출 처리</b>하면 평가·칭찬 미션 계산에서 빠지고 이름에 (전출)이 붙어요 —
            기록은 지워지지 않아요.
          </p>
        </>
      )}
    </Card>
  );
}
