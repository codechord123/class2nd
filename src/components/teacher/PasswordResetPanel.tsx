"use client";
// 학생 비밀번호 초기화 (C1 세트) — 분실 시 교사가 초기화하면 다음 로그인에서 재등록.
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import { resetStudentPassword } from "@/lib/auth";

export default function PasswordResetPanel() {
  const [sid, setSid] = useState(1);
  const [msg, setMsg] = useState("");

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-card">
      <h2 className="text-lg font-bold">🔑 학생 비밀번호 초기화</h2>
      <p className="mt-1 text-xs text-ink-500">
        비밀번호를 잊은 학생을 초기화하면, 그 학생이 다음에 로그인할 때 입력한 비밀번호로
        다시 등록됩니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={sid}
          onChange={(e) => setSid(Number(e.target.value))}
          className="rounded-lg border border-ink-300 px-3 py-2 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            void (async () => {
              if (!confirm(`${studentById.get(sid)?.name} 학생의 비밀번호를 초기화할까요?`)) return;
              try {
                await resetStudentPassword(sid);
                setMsg(`✅ ${studentById.get(sid)?.name} 초기화 완료 — 다음 로그인 시 새 비밀번호 등록`);
              } catch (e) {
                setMsg(`⚠️ ${e instanceof Error ? e.message : "실패"}`);
              }
            })()
          }
          className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white"
        >
          초기화
        </button>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
