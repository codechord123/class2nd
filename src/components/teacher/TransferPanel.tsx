"use client";
// 전학생·전출 관리 — 코드 수정 없이 명단을 조정한다 (classData/roster 오버라이드).
//   · 전입: 전출간 친구의 번호를 이어받기 → 이름 변경 + 비밀번호 초기화(비밀번호 관리)
//   · 전출: 비활성 표시 → 이름에 (전출) + 평가 대상·칭찬 미션 계산에서 제외
// 자리표(21주 정적)는 그대로이므로, 전출생 자리는 다음 자리 배치 갱신 때 정리한다.
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, applyRosterOverrides, type RosterOverrides } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";

export default function TransferPanel() {
  const { toast, confirm } = useFeedback();
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
              className="press rounded-btn bg-brand px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              이름 변경
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
            <b>전입생 절차</b>: ① 전출간 친구(또는 빈) 번호에 이름 변경 ② 비밀번호 관리에서 그
            번호 초기화 ③ 필요하면 상점 탭에서 잔액 보정. <b>전출 처리</b>하면 평가·칭찬 미션
            계산에서 빠지고 이름에 (전출)이 붙어요 — 자리표의 빈자리는 다음 자리 배치 때
            정리해주세요.
          </p>
        </>
      )}
    </Card>
  );
}
