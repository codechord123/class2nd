"use client";
// 학생 비밀번호 초기화 — ① 학생이 보낸 초기화 요청 목록 ② 수동 초기화.
// 초기화하면 그 학생이 다음 로그인에서 입력한 비밀번호로 다시 등록된다.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import { resetStudentPassword } from "@/lib/auth";
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
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const { data: requests } = useResetRequests(true);

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
    </Card>
  );
}
