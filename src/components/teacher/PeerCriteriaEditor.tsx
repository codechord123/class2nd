"use client";
// 부서장 평가 O/X 기준 편집 (교사) — 부서별 기준 문구를 추가/수정/삭제.
// classData/peerCriteria 단일 문서. 학생 평가 화면·집계가 이 기준을 그대로 쓴다.
import { useState } from "react";
import { ROLE_INFO } from "@/lib/roster";
import type { RoleKey } from "@/types";
import {
  usePeerCriteria,
  useSavePeerCriteria,
  useConstitution,
  useSaveConstitution,
  type PeerCriteria,
} from "@/lib/query/classMeta";
import { DEFAULT_PEER_CRITERIA, DEPT_LAW_ARTICLES } from "@/lib/peerCriteria";
import { composeClause, serializeClauses } from "@/lib/lawText";
import { useFeedback } from "@/components/ui/Feedback";

export default function PeerCriteriaEditor() {
  const { data: saved } = usePeerCriteria();
  const save = useSavePeerCriteria();
  const { data: constitution } = useConstitution();
  const saveConstitution = useSaveConstitution();
  const { toast, confirm } = useFeedback();
  const [draft, setDraft] = useState<PeerCriteria | null>(null);
  const [busy, setBusy] = useState(false);

  // 부서장 평가 기준의 법률 조항 버전을 헌법의 부서별 법률(lawsByDept)에 추가 (중복 제외)
  async function addToLaws() {
    if (busy || !constitution) return;
    const ok = await confirm({
      title: "부서장 평가 기준을 법률로 추가할까요?",
      body: "부서별 법률 조항으로 다듬은 문장을 헌법의 각 부서 법률에 넣어요 (이미 있는 문장은 건너뜀). 아이들이 만든 법률은 지워지지 않아요.",
      confirmLabel: "법률에 추가",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const lawsByDept = { ...(constitution.lawsByDept ?? {}) };
      let added = 0;
      for (const [dept, art] of Object.entries(DEPT_LAW_ARTICLES)) {
        const existing = lawsByDept[dept] ?? [];
        // 같은 제목의 조가 이미 있으면 건너뜀 (다시 눌러도 중복 안 됨)
        if (existing.some((l) => l.includes(`(${art.title})`))) {
          lawsByDept[dept] = existing;
          continue;
        }
        // 대한민국 법령 형식: 기존 법률 다음 번호로 "제N조(제목) ① … ② …"
        const clause = composeClause(existing.length + 1, art.title, serializeClauses(art.clauses));
        lawsByDept[dept] = [...existing, clause];
        added++;
      }
      await saveConstitution({ ...constitution, lawsByDept });
      toast(added > 0 ? `부서별 법률 ${added}개 조를 추가했어요.` : "이미 모두 법률에 있어요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "추가에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const cur = draft ?? saved ?? DEFAULT_PEER_CRITERIA;
  const dirty = JSON.stringify(cur) !== JSON.stringify(saved ?? DEFAULT_PEER_CRITERIA);

  const setRole = (role: RoleKey, list: string[]) => setDraft({ ...cur, [role]: list });

  async function onSave() {
    setBusy(true);
    try {
      // 빈 문구 제거 후 저장
      const clean = Object.fromEntries(
        Object.entries(cur).map(([r, list]) => [r, list.map((s) => s.trim()).filter(Boolean)])
      ) as PeerCriteria;
      await save(clean);
      setDraft(clean);
      toast("부서장 평가 기준을 저장했어요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-500">
        부서장은 <b>자기 부서 기준</b>으로 모둠원을 O/X 평가해요. 전부 O면 +1, 일부 0, 전부 X면
        −1. 관찰 가능한 <b>사실</b>로 적을수록 이의제기가 명확해져요.
      </p>
      {ROLE_INFO.map((r) => {
        const list = cur[r.key as RoleKey] ?? [];
        return (
          <div key={r.key} className="rounded-card bg-ink-50 p-3">
            <p className="text-sm font-bold text-ink-800">
              {r.emoji} {r.dept} <span className="text-xs font-normal text-ink-500">({r.key})</span>
            </p>
            <div className="mt-2 space-y-1.5">
              {list.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="tnum shrink-0 text-xs text-ink-400">{i + 1}</span>
                  <input
                    value={c}
                    onChange={(e) => {
                      const next = [...list];
                      next[i] = e.target.value;
                      setRole(r.key as RoleKey, next);
                    }}
                    className="min-w-0 flex-1 rounded-btn border border-ink-300 bg-white px-2.5 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => setRole(r.key as RoleKey, list.filter((_, j) => j !== i))}
                    className="press shrink-0 rounded-btn px-2 py-1 text-xs font-bold text-danger hover:bg-danger-weak"
                    aria-label="기준 삭제"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button
                onClick={() => setRole(r.key as RoleKey, [...list, ""])}
                className="press rounded-btn border border-dashed border-ink-300 px-2.5 py-1 text-xs font-bold text-ink-500 hover:border-ink-400"
              >
                + 기준 추가
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-warn">저장 안 된 변경이 있어요</span>}
        <button
          onClick={() => void onSave()}
          disabled={busy || !dirty}
          className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy ? "저장 중…" : "기준 저장"}
        </button>
      </div>
      {/* 법률 만들기 활동 연동 — 평가 기준을 부서별 법률 조항으로 헌법에 추가 */}
      <div className="rounded-btn border border-dashed border-brand/40 bg-brand-weak/30 p-3">
        <p className="text-[13px] text-ink-600">
          📜 이 평가 기준을 <b>부서별 법률</b>로 헌법에 넣을 수 있어요 (법률 만들기 활동용). 규범형
          문장으로 다듬어 추가하고, 아이들이 만든 법률은 그대로 둬요.
        </p>
        <button
          onClick={() => void addToLaws()}
          disabled={busy}
          className="press mt-2 rounded-btn bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          📜 부서별 법률로 추가
        </button>
      </div>
    </div>
  );
}
