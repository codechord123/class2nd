"use client";
// 감상문 전용 전체화면 쓰기 시트 — 긴 글도 편하게. 넓은 입력 + 고정 상/하단 바.
// 시인성: placeholder에만 의존하지 않고 항목마다 진한 라벨, 흰 입력칸 + 또렷한 테두리.
import { useEffect, useRef, useState } from "react";
import {
  useSaveReport,
  reportBodyLength,
  BOOK_TAGS,
  type ReportForm,
} from "@/lib/query/reading";
import { useSettings } from "@/lib/query/settings";
import { useFeedback } from "@/components/ui/Feedback";
import JuiceBurst from "@/components/ui/Juice";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";

const EMPTY: ReportForm = {
  title: "", author: "", publisher: "", summary: "", scene: "", quote: "", thoughts: "",
  authorIntent: "", connect: "", tags: [], isPrivate: false,
};

// 유도 질문 로테이션 — 매번 같은 질문이면 감상이 틀에 박힌다 (열 때마다 한 세트 무작위)
const PROMPTS: { summary: string; scene: string; quote: string; thoughts: string }[] = [
  {
    summary: "어떤 이야기였나요?",
    scene: "가장 기억에 남는 장면을 써요",
    quote: "책 속 문장을 그대로 옮겨 적어요",
    thoughts: "나라면 어떻게 했을까? 무엇을 배웠나요?",
  },
  {
    summary: "누가 나오고, 무슨 일이 벌어졌나요?",
    scene: "주인공이 가장 힘들었던(또는 기뻤던) 순간은 언제였나요?",
    quote: "소리 내어 읽고 싶은 문장을 옮겨 적어요",
    thoughts: "이 책을 친구에게 추천한다면 뭐라고 말할래요?",
  },
  {
    summary: "이야기의 처음–중간–끝을 세 문장으로 정리해봐요",
    scene: "내가 그 장면 속에 있었다면 어떤 기분이었을까요?",
    quote: "주인공의 마음이 가장 잘 드러난 문장을 찾아 적어요",
    thoughts: "책을 읽기 전과 후, 내 생각이 어떻게 달라졌나요?",
  },
  {
    summary: "뒤 표지에 실릴 소개글처럼 줄거리를 써봐요",
    scene: "작가가 가장 공들여 쓴 것 같은 장면은 어디인가요?",
    quote: "나중에 다시 꺼내 보고 싶은 문장을 적어요",
    thoughts: "주인공에게 하고 싶은 말이 있다면?",
  },
];

export interface WriteInitial {
  form: ReportForm;
  draftId?: string;
  reportId?: string;
}

export default function WriteSheet({
  studentId,
  week,
  initial,
  onClose,
}: {
  studentId: number;
  week: number;
  initial: WriteInitial | null; // null = 새 글
  onClose: () => void;
}) {
  const { data: settings } = useSettings();
  const saveReport = useSaveReport(studentId);
  const { toast, confirm } = useFeedback();

  const initialForm = initial?.form ?? EMPTY;
  const [form, setForm] = useState<ReportForm>(initialForm);
  const [busy, setBusy] = useState(false);
  // 열 때마다 유도 질문 한 세트 선택 (렌더마다 바뀌지 않게 state 초기값으로 고정)
  const [prompts] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [doneBurst, setDoneBurst] = useState(0); // 정식 등록 성공 juice

  // 복붙·작성 시간 신호 (A·B) — 선생님 참고용. 학생 흐름은 막지 않는다.
  const openedAt = useRef(0);
  const pasted = useRef({ chars: 0, count: 0 });
  const justPasted = useRef(false); // onPaste 직후 onChange 중복 집계 방지
  const [pasteHint, setPasteHint] = useState(false); // 큰 붙여넣기 시 부드러운 안내
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  const flagInsert = (n: number) => {
    pasted.current.chars += n;
    pasted.current.count += 1;
    if (n >= 30) {
      setPasteHint(true);
      window.setTimeout(() => setPasteHint(false), 4000);
    }
  };
  // 감상 칸에 붙여넣기 → 글자 수·횟수 누적 (인용 칸은 책 문장 옮겨적기라 제외)
  const onPasteBody = (e: React.ClipboardEvent) => {
    justPasted.current = true; // 곧 onChange가 뒤따르므로 그쪽 집계는 건너뛴다
    const t = e.clipboardData.getData("text") ?? "";
    if (t.length >= 8) flagInsert(t.length);
  };
  // 입력량이 한 번에 크게 늘면(붙여넣기·자동삽입·받아쓰기 등) 방식과 무관하게 삽입으로 본다.
  // 디벗(iPad)에서 붙여넣기가 onPaste를 안 태우는 경우까지 잡는 핵심 신호.
  const BULK_INSERT = 15;
  const noteInsert = (oldV: string, newV: string) => {
    if (justPasted.current) {
      justPasted.current = false; // onPaste에서 이미 집계함
      return;
    }
    const delta = newV.length - oldV.length;
    if (delta >= BULK_INSERT) flagInsert(delta);
  };

  // 저장하지 않은 변경이 있으면 닫기 전에 확인 (긴 글 유실 방지)
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  async function handleClose() {
    if (
      dirty &&
      !(await confirm({
        title: "쓰던 내용을 닫을까요?",
        body: "저장하지 않은 내용은 사라져요. 아래 '임시저장'을 누르면 나중에 이어 쓸 수 있어요.",
        confirmLabel: "닫기",
        danger: true,
      }))
    )
      return;
    onClose();
  }
  const draftId = initial?.draftId;
  const reportId = initial?.reportId;
  const editingReport = Boolean(reportId);

  const charLimit = settings?.readingCharLimit ?? 700;
  const bodyLen = reportBodyLength(form);
  const pct = Math.min((bodyLen / charLimit) * 100, 100);

  async function submit(draft: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (!draft && bodyLen < charLimit)
        throw new Error(`본문은 ${charLimit}자 이상이어야 정식 등록할 수 있어요. (현재 ${bodyLen}자) 🐢`);
      // 정식 등록·수정 시에만 신호 기록 (임시저장은 미기록 — 이어쓰기 중이라 무의미)
      const detect = draft
        ? undefined
        : {
            pastedChars: pasted.current.chars,
            pasteCount: pasted.current.count,
            writeMs: openedAt.current ? Date.now() - openedAt.current : 0,
          };
      await saveReport(form, { draft, draftId, reportId, detect });
      toast(
        draft
          ? "💾 임시저장 완료! 나중에 이어서 쓸 수 있어요."
          : editingReport
            ? "✅ 감상문이 수정되었어요!"
            : "✅ 감상문이 정식 등록되었어요! +1권"
      );
      if (!draft) {
        // 등록 juice — 📚 버스트를 잠깐 보여주고 닫는다 (성취의 한 박자)
        setDoneBurst((k) => k + 1);
        setTimeout(onClose, 650);
        return;
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-50">
      {/* 상단 고정 */}
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3">
        <button onClick={() => void handleClose()} className="press text-sm font-bold text-ink-600">
          ← 닫기
        </button>
        <span className="text-base font-extrabold text-ink-900">
          감상문 {editingReport ? "수정" : "쓰기"} · {week}주차
        </span>
        {/* 정식본 수정 중엔 임시저장 숨김 — 초안 복사본이 생겨 나중에 중복 등록(+1)되는 사고 방지 */}
        {editingReport ? (
          <span className="w-16" aria-hidden />
        ) : (
          <button
            onClick={() => void submit(true)}
            disabled={busy}
            className="press rounded-btn bg-brand-weak px-3 py-1.5 text-sm font-bold text-brand-strong disabled:opacity-40"
          >
            임시저장
          </button>
        )}
      </header>

      {/* 본문 (스크롤) — 카드 2장: 책 정보 / 감상 */}
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 overflow-y-auto p-4">
        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <h3 className="text-base font-extrabold text-ink-900">1. 어떤 책인가요?</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field
              label={
                <>
                  책 제목 <span className="text-danger">*</span>
                </>
              }
            >
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 마당을 나온 암탉" className="h-12" />
            </Field>
            <Field label="지은이">
              <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="예: 황선미" className="h-12" />
            </Field>
            <Field label="출판사">
              <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} placeholder="(선택)" className="h-12" />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-bold text-ink-700">책 종류:</span>
            {BOOK_TAGS.map((t) => (
              <button
                key={t}
                onClick={() =>
                  setForm({
                    ...form,
                    tags: form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t],
                  })
                }
                className={`press rounded-full border px-2.5 py-1 text-xs font-bold ${
                  form.tags.includes(t)
                    ? "border-success bg-success text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:border-ink-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <h3 className="text-base font-extrabold text-ink-900">2. 감상을 남겨요</h3>
            <span className="text-xs text-ink-600">칸을 합쳐 {charLimit}자 이상이면 정식 등록!</span>
          </div>
          <div className="mt-3 space-y-3">
            <Field label="줄거리">
              <Textarea value={form.summary} onChange={(e) => { noteInsert(form.summary, e.target.value); setForm({ ...form, summary: e.target.value }); }} onPaste={onPasteBody} placeholder={prompts.summary} rows={5} />
            </Field>
            <Field label="인상 깊은 장면">
              <Textarea value={form.scene} onChange={(e) => { noteInsert(form.scene, e.target.value); setForm({ ...form, scene: e.target.value }); }} onPaste={onPasteBody} placeholder={prompts.scene} rows={4} />
            </Field>
            <Field label="마음에 남은 문장 (인용)">
              {/* 인용은 책 문장을 옮겨적는 칸이라 붙여넣기 감지에서 제외 */}
              <Textarea value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} placeholder={prompts.quote} rows={3} />
            </Field>
            <Field label="읽고 나서 든 생각과 느낌">
              <Textarea value={form.thoughts} onChange={(e) => { noteInsert(form.thoughts, e.target.value); setForm({ ...form, thoughts: e.target.value }); }} onPaste={onPasteBody} placeholder={prompts.thoughts} rows={6} />
            </Field>
            {/* 생각 유도 질문 — 검색·복붙으로는 못 채우는 나만의 답 (사용자 요청) */}
            <Field label="✍️ 작가는 왜 이 글을 썼을까?">
              <Textarea
                value={form.authorIntent ?? ""}
                onChange={(e) => { noteInsert(form.authorIntent ?? "", e.target.value); setForm({ ...form, authorIntent: e.target.value }); }}
                onPaste={onPasteBody}
                placeholder="작가가 이 책으로 하고 싶었던 말은 뭘까요? 내 생각을 써요"
                rows={3}
              />
            </Field>
            <Field label="🙋 이 책을 나와 연결하면?">
              <Textarea
                value={form.connect ?? ""}
                onChange={(e) => { noteInsert(form.connect ?? "", e.target.value); setForm({ ...form, connect: e.target.value }); }}
                onPaste={onPasteBody}
                placeholder="내 경험·우리 반·우리 가족과 어떻게 연결될까요? 나라면 어떻게 했을까요?"
                rows={4}
              />
            </Field>
            {pasteHint && (
              <p className="rounded-btn bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-700">
                📋 붙여넣기가 감지됐어요 — 직접 쓴 글일수록 더 좋아요 🙂
              </p>
            )}
          </div>
          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-600">
            <input
              type="checkbox"
              checked={form.isPrivate ?? false}
              onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            🔒 선생님만 보기 (친구들에게는 내용이 보이지 않아요)
          </label>
        </section>
      </div>

      {/* 하단 고정 저장 바 */}
      <footer className="border-t border-ink-200 bg-white px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-success" : pct >= 50 ? "bg-warn" : "bg-ink-300"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`tnum text-sm font-extrabold ${pct >= 100 ? "text-success" : "text-ink-600"}`}>
              {bodyLen} / {charLimit}자 {pct >= 100 ? "✅ 등록 가능!" : ""}
            </span>
            <span className="relative">
              <Button size="lg" variant="primary" onClick={() => void submit(false)} disabled={busy}>
                {busy ? "저장 중…" : editingReport ? "수정 저장" : "정식 등록 (+1권)"}
              </Button>
              <JuiceBurst fireKey={doneBurst} emojis={["📚", "🐢", "✨"]} className="left-1/2 top-0" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
