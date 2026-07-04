"use client";
// 학생 비밀번호 초기화 — ① 학생이 보낸 초기화 요청 목록 ② 수동 초기화
// ③ 전체 일괄 초기화 + 새 비밀번호 발급(4자리, 인쇄용 쪽지).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { resetStudentPassword, issueAllPasswords } from "@/lib/auth";
import { openPrintWindow, esc } from "@/lib/exportDoc";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { useFeedback } from "@/components/ui/Feedback";

function useResetRequests(enabled: boolean) {
  return useQuery({
    queryKey: ["resetRequests"],
    enabled,
    queryFn: async (): Promise<{ studentId: number; requestedAt: number }[]> => {
      const snap = await getDocs(collection(db(), "resetRequests"));
      return snap.docs
        .map((d) => d.data() as { studentId: number; requestedAt: number })
        .sort((a, b) => a.requestedAt - b.requestedAt);
    },
    staleTime: 60 * 1000,
  });
}

export default function PasswordResetPanel() {
  const [sid, setSid] = useState(1);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ studentId: number; code: string }[] | null>(null);
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const { data: requests } = useResetRequests(true);

  async function issueAll() {
    if (issuing) return;
    const ok = await confirm({
      title: "전체 학생 비밀번호를 새로 발급할까요?",
      body:
        "25명 전원의 비밀번호가 무작위 4자리 숫자로 바뀌어요.\n" +
        "기존 비밀번호로는 더 이상 로그인할 수 없고, 발급된 번호는 이 화면에서만 볼 수 있어요 — 꼭 인쇄하거나 적어두세요!",
      confirmLabel: "전체 발급",
      danger: true,
    });
    if (!ok) return;
    setIssuing(true);
    try {
      const list = await issueAllPasswords(students.map((s) => s.id));
      setIssued(list);
      toast(`✅ ${list.length}명 비밀번호 발급 완료 — 목록을 인쇄해 나눠주세요.`, "success");
      void qc.invalidateQueries({ queryKey: ["resetRequests"] });
    } catch (e) {
      toast(`⚠️ 발급 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setIssuing(false);
    }
  }

  function printIssued() {
    if (!issued) return;
    const slips = issued
      .map(({ studentId, code }) => {
        const s = studentById.get(studentId);
        return `<div style="border:1.5px dashed #94a3b8;border-radius:10px;padding:10px 12px;text-align:center">
          <div style="font-size:12px;color:#64748b">${studentId}번 ${esc(s?.name ?? "")}</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:3px;margin-top:2px">${code}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">새 비밀번호 · 로그인 후 바꿀 수 있어요</div>
        </div>`;
      })
      .join("");
    openPrintWindow(
      "학생 비밀번호 발급표",
      `<div class="card"><div class="t">🔑 새 비밀번호 발급표 — 잘라서 한 장씩 나눠주세요</div>
       <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">${slips}</div></div>`
    );
  }

  async function doReset(id: number) {
    const ok = await confirm({
      title: `${studentById.get(id)?.name} 비밀번호를 초기화할까요?`,
      body: "다음 로그인 때 입력한 비밀번호로 다시 등록돼요.",
      confirmLabel: "초기화",
      danger: true,
    });
    if (!ok) return;
    try {
      await resetStudentPassword(id);
      toast(`✅ ${studentById.get(id)?.name} 초기화 완료`);
      void qc.invalidateQueries({ queryKey: ["resetRequests"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "실패", "error");
    }
  }

  return (
    <Card title="🔑 학생 비밀번호 초기화" desc="분실 학생이 보낸 요청을 처리하거나, 직접 초기화하세요.">
      {/* 학생이 보낸 초기화 요청 */}
      {(requests?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-card bg-warn-weak p-3">
          <p className="text-xs font-bold text-warn">🙋 초기화 요청 {requests!.length}건</p>
          <ul className="mt-2 space-y-1.5">
            {requests!.map((r) => (
              <li key={r.studentId} className="flex items-center justify-between text-sm">
                <span className="font-bold text-ink-800">{studentById.get(r.studentId)?.name}</span>
                <Button size="sm" variant="danger" onClick={() => void doReset(r.studentId)}>
                  초기화
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 직접 초기화 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={sid} onChange={(e) => setSid(Number(e.target.value))} className="w-auto">
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
        </Select>
        <Button variant="danger" onClick={() => void doReset(sid)}>
          초기화
        </Button>
      </div>

      {/* 전체 일괄 발급 */}
      <div className="mt-4 rounded-card border border-dashed border-ink-300 bg-ink-50/50 p-3">
        <p className="text-sm font-bold text-ink-800">🎫 전체 비밀번호 일괄 발급</p>
        <p className="mt-0.5 text-xs text-ink-500">
          전원의 비밀번호를 무작위 4자리 숫자로 새로 정해서 나눠줘요 (학기 초·비밀번호 대란 때).
          발급 후 인쇄해서 한 장씩 잘라 주면 끝 — 학생은 로그인 후 원하는 비밀번호로 바꿀 수 있어요.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => void issueAll()} disabled={issuing}>
            {issuing ? "발급 중…" : "전체 발급"}
          </Button>
          {issued && (
            <Button variant="ghost" onClick={printIssued}>
              🖨️ 발급표 인쇄
            </Button>
          )}
        </div>
        {issued && (
          <div className="mt-3">
            <p className="text-xs font-bold text-danger">
              ⚠️ 이 목록은 지금만 볼 수 있어요 — 화면을 닫기 전에 꼭 인쇄하거나 적어두세요!
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {issued.map(({ studentId, code }) => (
                <div
                  key={studentId}
                  className="rounded-btn border border-ink-200 bg-white px-2 py-1.5 text-center"
                >
                  <p className="text-[11px] text-ink-500">
                    {studentId}번 {studentById.get(studentId)?.name}
                  </p>
                  <p className="tnum text-base font-extrabold tracking-widest text-ink-900">
                    {code}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
