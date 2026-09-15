"use client";
// ✉️ 편지 보내기 + 📬 우체통 (교사).
// 학생끼리는 편지를 주고받지 않으므로 우체통 하나가 곧 '그 학생과 나의 대화'다.
// 답장을 기다리는 학생을 맨 위에 칩으로 세워 놓친 편지가 없게 한다.
// 읽기: 대기 배지 = 부모 문서 25개(오늘 탭 열 때) · 대화 열람 = 고른 1명분만.
import { useEffect, useState } from "react";
import { students, studentById } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import {
  LETTER_MAX,
  useDeleteLetter,
  useLetters,
  useMarkTeacherSeen,
  useTeacherSendLetter,
  useWaitingStudents,
  type Letter,
} from "@/lib/query/letters";

const fmt = (ts: number) => {
  const d = new Date(ts + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export default function LetterPanel() {
  const { toast, confirm } = useFeedback();
  const active = students.filter((s) => !s.inactive);

  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const teacherSend = useTeacherSendLetter();

  const [viewId, setViewId] = useState<number | null>(null);
  const { data: letters } = useLetters(viewId);
  const { data: waiting } = useWaitingStudents(true);
  const markTeacherSeen = useMarkTeacherSeen();
  const del = useDeleteLetter();

  // 대화를 연 순간 '답장 기다리는 중' 배지를 내린다
  useEffect(() => {
    if (viewId != null && letters) void markTeacherSeen(viewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, !!letters]);

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function doSend() {
    if (sending) return;
    setSending(true);
    try {
      await teacherSend(picked, text);
      toast(`💌 ${picked.length}명에게 편지를 보냈어요.`, "success");
      setText("");
      setPicked([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요.", "error");
    } finally {
      setSending(false);
    }
  }

  async function doDelete(l: Letter) {
    if (viewId == null) return;
    const ok = await confirm({
      title: "이 편지를 삭제할까요?",
      body: "되돌릴 수 없어요.",
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    await del(viewId, l.id)
      .then(() => toast("삭제했어요."))
      .catch((e) => toast(e instanceof Error ? e.message : "삭제 실패", "error"));
  }

  const thread = [...(letters ?? [])].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      <Card
        title="✉️ 편지 보내기"
        desc="고른 학생의 우체통으로 들어가요. 학생 화면엔 '선생님'으로 표시돼요."
      >
        <div className="mt-3 flex flex-wrap gap-1.5">
          {active.map((s) => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`press rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                picked.includes(s.id)
                  ? "bg-brand text-white ring-brand"
                  : "bg-white text-ink-700 ring-ink-200"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => setPicked(active.map((s) => s.id))}
            className="press rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600"
          >
            반 전체 선택
          </button>
          <button
            onClick={() => setPicked([])}
            className="press rounded-btn bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-600"
          >
            선택 해제
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, LETTER_MAX))}
          rows={5}
          placeholder="오늘 잘한 점, 응원하고 싶은 말을 적어주세요."
          className="mt-3 w-full rounded-btn border border-ink-300 px-3 py-2 text-sm"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-ink-400">
          <span>
            받는 학생 <b className="tnum text-ink-700">{picked.length}</b>명
          </span>
          <span className="tnum">
            {text.length}/{LETTER_MAX}
          </span>
        </div>
        <button
          onClick={() => void doSend()}
          disabled={sending || !picked.length || !text.trim()}
          className="press mt-2 rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {sending ? "보내는 중…" : "💌 보내기"}
        </button>
      </Card>

      <Card
        title="📬 우체통"
        desc="학생을 고르면 그 학생과 주고받은 편지가 보여요 (고른 1명만 읽어요)."
      >
        {waiting && waiting.length > 0 && (
          <div className="mt-3 rounded-btn bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-800">
              💌 답장을 기다리는 학생 {waiting.length}명 — 눌러서 열어보세요
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {waiting.map((id) => (
                <button
                  key={id}
                  onClick={() => setViewId(id)}
                  className="press rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-300"
                >
                  {studentById.get(id)?.name ?? id} →
                </button>
              ))}
            </div>
          </div>
        )}

        <select
          value={viewId ?? ""}
          onChange={(e) => setViewId(e.target.value ? Number(e.target.value) : null)}
          className="mt-3 rounded-btn border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">학생 선택…</option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
              {waiting?.includes(s.id) ? " 💌" : ""}
            </option>
          ))}
        </select>

        {viewId == null ? (
          <EmptyState emoji="📬" title="학생을 고르면 편지가 보여요" />
        ) : !thread.length ? (
          <EmptyState
            emoji="📭"
            title="아직 주고받은 편지가 없어요"
            desc="위에서 첫 편지를 보내보세요."
          />
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {thread.map((l) => {
                const fromTeacher = l.from === "teacher";
                return (
                  <li
                    key={l.id}
                    className={`flex ${fromTeacher ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-card border p-3 ${
                        fromTeacher
                          ? "border-brand/30 bg-brand-weak/50"
                          : "border-pink-200 bg-pink-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[12px] font-bold text-ink-700">
                          {fromTeacher ? "선생님" : (studentById.get(viewId)?.name ?? "학생")}
                        </span>
                        <span className="text-xs text-ink-400">{fmt(l.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink-800">
                        {l.text}
                      </p>
                      <button
                        onClick={() => void doDelete(l)}
                        className="press mt-2 rounded-btn bg-white px-2.5 py-1 text-xs font-bold text-danger ring-1 ring-ink-200"
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={() => {
                setPicked([viewId]);
                document.getElementById("panel-letters")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="press mt-3 w-full rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
            >
              ✍️ {studentById.get(viewId)?.name}에게 답장 쓰기
            </button>
          </>
        )}
      </Card>
    </>
  );
}
