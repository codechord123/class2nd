"use client";
// 학생 비밀번호 관리 시트 — 비밀번호 변경 + 힌트 설정 (전체화면 오버레이).
// 주의: 헤더(backdrop-blur) 안에서 fixed가 갇히지 않도록 반드시 body로 포털 렌더.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/stores/session";
import { studentById } from "@/lib/roster";
import { changeStudentPassword } from "@/lib/auth";
import { useFeedback } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";

function BigField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink-700">{label}</span>
      <input
        {...props}
        className="w-full rounded-btn border border-ink-300 bg-white px-4 py-3.5 text-base focus:border-brand focus:outline-none"
      />
    </label>
  );
}

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <button onClick={onClose} className="press text-sm font-medium text-ink-500">
          ← 닫기
        </button>
        <span className="text-sm font-bold text-ink-900">🔑 비밀번호 관리</span>
        <span className="w-10" />
      </header>
      <div className="mx-auto w-full max-w-md flex-1 space-y-5 overflow-y-auto p-5 pt-8">
        <p className="text-base text-ink-600">
          <b>{studentById.get(studentId ?? 0)?.name}</b> 학생의 비밀번호를 바꿔요.
        </p>
        <BigField
          label="현재 비밀번호"
          type="password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          placeholder="지금 쓰는 비밀번호"
        />
        <BigField
          label="새 비밀번호 (4자 이상)"
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder="새로 정할 비밀번호"
        />
        <BigField
          label="비밀번호 힌트 (선택 — 잊었을 때 도움돼요)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="예: 좋아하는 색 + 태어난 달"
        />
        <p className="text-sm text-ink-400">
          💡 힌트는 비밀번호를 잊었을 때 로그인 화면에서 볼 수 있어요. 비밀번호 자체는 적지
          마세요!
        </p>
        <Button block size="lg" onClick={() => void submit()} disabled={busy}>
          {busy ? "저장 중…" : "변경하기"}
        </Button>
      </div>
    </div>,
    document.body
  );
}
