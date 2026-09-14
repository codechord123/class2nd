"use client";
// ✉️ 편지 보내기 + 📬 우체통 열람 (교사).
// 비밀 우체통의 안전망은 '선생님이 전부 볼 수 있다'는 사실 하나다 — 그래서 열람을
// 기능이 아니라 기본으로 둔다. 다만 25명 전체를 한 번에 읽으면 읽기가 터지므로
// 고른 학생 1명분만 읽는다 (부모 1 + 최근 50통).
import { useState } from "react";
import { students, studentById } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import {
  LETTER_MAX,
  useDeleteLetter,
  useLetters,
  useMailMeta,
  useTeacherSendLetter,
  type Letter,
} from "@/lib/query/letters";

const fmt = (ts: number) => {
  const d = new Date(ts + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const nameOf = (from: Letter["from"]) =>
  from === "teacher" ? "선생님" : (studentById.get(from)?.name ?? "?");

export default function LetterPanel() {
  const { toast, confirm } = useFeedback();
  const active = students.filter((s) => !s.inactive);

  // ── 보내기 ──
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const teacherSend = useTeacherSendLetter();

  // ── 열람 ──
  const [viewId, setViewId] = useState<number | null>(null);
  const { data: meta } = useMailMeta(viewId);
  const { data: letters } = useLetters(viewId);
  const del = useDeleteLetter();

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
      body: "되돌릴 수 없어요. 문제가 되는 편지만 지워주세요.",
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    await del(viewId, l.id)
      .then(() => toast("삭제했어요."))
      .catch((e) => toast(e instanceof Error ? e.message : "삭제 실패", "error"));
  }

  const reported = (letters ?? []).filter((l) => meta?.flags?.[l.id]?.reported);

  return (
    <>
      <Card
        title="✉️ 편지 보내기"
        desc="고른 학생의 우체통으로 편지가 들어가요. 아이들 화면엔 '선생님'으로 표시돼요."
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
        title="📬 우체통 열람"
        desc="학생을 고르면 그 학생이 받은 편지를 볼 수 있어요 (고른 1명만 읽어요)."
      >
        <select
          value={viewId ?? ""}
          onChange={(e) => setViewId(e.target.value ? Number(e.target.value) : null)}
          className="mt-3 rounded-btn border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">학생 선택…</option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}번 {s.name}
            </option>
          ))}
        </select>

        {viewId == null ? (
          <EmptyState emoji="📬" title="학생을 고르면 편지가 보여요" />
        ) : !letters?.length ? (
          <EmptyState emoji="📭" title="받은 편지가 없어요" />
        ) : (
          <>
            {reported.length > 0 && (
              <p className="mt-3 rounded-btn bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700">
                🚨 이 학생이 신고한 편지 {reported.length}건이 있어요 — 아래에서 확인해 주세요.
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {letters.map((l) => {
                const f = meta?.flags?.[l.id];
                return (
                  <li
                    key={l.id}
                    className={`rounded-btn border p-3 ${
                      f?.reported ? "border-rose-300 bg-rose-50" : "border-ink-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[12px] font-bold text-ink-700">
                        {nameOf(l.from)} →{" "}
                        {studentById.get(viewId)?.name}
                      </span>
                      <span className="text-xs text-ink-400">{fmt(l.createdAt)}</span>
                      {f?.reported && <span className="text-xs font-bold text-danger">🚨 신고됨</span>}
                      {f?.hidden && <span className="text-xs text-ink-400">숨김</span>}
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
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
