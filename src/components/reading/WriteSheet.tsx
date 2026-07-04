"use client";
// 감상문 전용 전체화면 쓰기 시트 — 긴 글도 편하게. 넓은 입력 + 고정 상/하단 바.
// 시인성: placeholder에만 의존하지 않고 항목마다 진한 라벨, 흰 입력칸 + 또렷한 테두리.
import { useState } from "react";
import {
  useSaveReport,
  reportBodyLength,
  BOOK_TAGS,
  type ReportForm,
} from "@/lib/query/reading";
import { useSettings } from "@/lib/query/settings";
import { useFeedback } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";

const EMPTY: ReportForm = {
  title: "", author: "", publisher: "", summary: "", scene: "", quote: "", thoughts: "",
  tags: [], isPrivate: false,
};

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
  const saveReport = useSaveReport(studentId, week);
  const { toast, confirm } = useFeedback();

  const initialForm = initial?.form ?? EMPTY;
  const [form, setForm] = useState<ReportForm>(initialForm);
  const [busy, setBusy] = useState(false);

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
      await saveReport(form, { draft, draftId, reportId });
      toast(
        draft
          ? "💾 임시저장 완료! 나중에 이어서 쓸 수 있어요."
          : editingReport
            ? "✅ 감상문이 수정되었어요!"
            : "✅ 감상문이 정식 등록되었어요! +1권"
      );
      if (!draft) onClose();
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
        <button
          onClick={() => void submit(true)}
          disabled={busy}
          className="press rounded-btn bg-brand-weak px-3 py-1.5 text-sm font-bold text-brand-strong disabled:opacity-40"
        >
          임시저장
        </button>
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
            <span className="text-xs text-ink-500">네 칸을 합쳐 {charLimit}자 이상이면 정식 등록!</span>
          </div>
          <div className="mt-3 space-y-3">
            <Field label="줄거리">
              <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="어떤 이야기였나요?" rows={5} />
            </Field>
            <Field label="인상 깊은 장면">
              <Textarea value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })} placeholder="가장 기억에 남는 장면을 써요" rows={4} />
            </Field>
            <Field label="마음에 남는 문장 (인용)">
              <Textarea value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} placeholder="책 속 문장을 그대로 옮겨 적어요" rows={3} />
            </Field>
            <Field label="읽고 나서 든 생각과 느낌">
              <Textarea value={form.thoughts} onChange={(e) => setForm({ ...form, thoughts: e.target.value })} placeholder="나라면 어떻게 했을까? 무엇을 배웠나요?" rows={6} />
            </Field>
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
            <Button size="lg" variant="success" onClick={() => void submit(false)} disabled={busy}>
              {busy ? "저장 중…" : editingReport ? "수정 저장" : "정식 등록 (+1권)"}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
