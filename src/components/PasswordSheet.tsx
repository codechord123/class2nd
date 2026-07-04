"use client";
// 학생 비밀번호 관리 시트 — 비밀번호 변경 + 힌트 설정 (전체화면 오버레이).
import { useState } from "react";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { changeStudentPassword } from "@/lib/auth";
import { useFeedback } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function PasswordSheet({ onClose }: { onClose: () => void }) {
  const { studentId } = useSession();
  const { toast } = useFeedback();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (studentId == null) return;
    if (busy) return;
    setBusy(true);
    try {
      await changeStudentPassword(studentId, oldPw, newPw, hint || undefined);
      toast("✅ 비밀번호가 변경됐어요!");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "변경에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <button onClick={onClose} className="text-sm font-medium text-ink-500">
          ← 닫기
        </button>
        <span className="text-sm font-bold text-ink-900">🔑 비밀번호 관리</span>
        <span className="w-10" />
      </header>
      <div className="mx-auto w-full max-w-sm flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-sm text-ink-500">
          {studentById.get(studentId ?? 0)?.name} 학생의 비밀번호를 바꿔요.
        </p>
        <Field label="현재 비밀번호">
          <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="지금 쓰는 비밀번호" />
        </Field>
        <Field label="새 비밀번호 (4자 이상)">
          <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="새로 정할 비밀번호" />
        </Field>
        <Field label="비밀번호 힌트 (선택 — 잊었을 때 도움돼요)">
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="예: 좋아하는 색 + 태어난 달"
          />
        </Field>
        <p className="text-xs text-ink-400">
          💡 힌트는 비밀번호를 잊었을 때 로그인 화면에서 볼 수 있어요. 비밀번호 자체는 적지
          마세요!
        </p>
        <Button block size="lg" onClick={() => void submit()} disabled={busy}>
          {busy ? "저장 중…" : "변경하기"}
        </Button>
      </div>
    </div>
  );
}
