"use client";
// 감상문 전용 전체화면 쓰기 시트 — 긴 글도 편하게. 넓은 입력 + 고정 상/하단 바.
// 시인성: placeholder에만 의존하지 않고 항목마다 진한 라벨, 흰 입력칸 + 또렷한 테두리.
import { useEffect, useRef, useState } from "react";
import {
  useSaveReport,
  reportBodyLength,
  BOOK_TAGS,
  type BodyKey,
  type ReportForm,
} from "@/lib/query/reading";
import { useSettings } from "@/lib/query/settings";
import { todayKST } from "@/lib/date";
import { SEMESTER_START } from "@/lib/schedule";
import { useFeedback } from "@/components/ui/Feedback";
import JuiceBurst from "@/components/ui/Juice";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";

const EMPTY: ReportForm = {
  title: "", author: "", publisher: "", summary: "", scene: "", quote: "", thoughts: "",
  authorIntent: "", connect: "", reason: "", characters: "", recommend: "", freeText: "",
  tags: [], isPrivate: false,
};

// 감상 본문 항목 레지스트리 — 체크리스트로 켜고 끄면 그 항목 칸이 나타난다 (레이아웃 = 체크 선택).
//   defaultOn: '가이드 작성' 기본 구성. 자유 작성 프리셋은 freeText 하나만 켠다.
const SECTIONS: { key: BodyKey; label: string; placeholder: string; rows: number; defaultOn: boolean }[] = [
  { key: "reason", label: "🤔 이 책을 고른 이유", placeholder: "표지? 제목? 친구 추천? 왜 이 책을 집었나요?", rows: 3, defaultOn: true },
  { key: "summary", label: "줄거리", placeholder: "", rows: 5, defaultOn: true },
  { key: "characters", label: "👥 등장인물 소개", placeholder: "누가 나오나요? 어떤 성격인가요? 마음에 드는 인물은?", rows: 4, defaultOn: false },
  { key: "scene", label: "인상 깊은 장면", placeholder: "", rows: 4, defaultOn: true },
  { key: "quote", label: "마음에 남은 문장 (인용)", placeholder: "", rows: 3, defaultOn: true },
  { key: "thoughts", label: "읽고 나서 든 생각과 느낌", placeholder: "", rows: 6, defaultOn: true },
  { key: "authorIntent", label: "✍️ 작가는 왜 이 글을 썼을까?", placeholder: "작가가 이 책으로 하고 싶었던 말은 뭘까요? 내 생각을 써요", rows: 3, defaultOn: true },
  { key: "connect", label: "🙋 이 책을 나와 연결하면?", placeholder: "내 경험·우리 반·우리 가족과 어떻게 연결될까요? 나라면 어떻게 했을까요?", rows: 4, defaultOn: true },
  { key: "recommend", label: "💌 누구에게 추천할까?", placeholder: "이 책이 어울리는 사람은 누구? 왜 그 사람에게 추천하나요?", rows: 3, defaultOn: false },
  { key: "freeText", label: "🖊️ 자유롭게 쓰기", placeholder: "정해진 틀 없이 내 마음대로 감상을 써요 — 편지, 일기, 상상 이어쓰기도 좋아요", rows: 10, defaultOn: false },
];

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
  // 이전 세션까지 누적된 복붙·작성 신호 — 초안·정식본을 다시 열어 이어 쓸 때 승계한다.
  // (이게 없으면 '세션1에 붙여넣고 임시저장 → 세션2에 정식등록'이면 붙여넣기 기록이 사라진다)
  prior?: {
    pastedChars?: number;
    pasteCount?: number;
    selfPastedChars?: number;
    selfPasteCount?: number;
    writeMs?: number;
  };
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
  const submittingRef = useRef(false); // 더블클릭 즉시 차단 (state는 같은 틱 연타를 못 막음)

  // 담을 내용 체크 — 기본 구성(defaultOn) + 이미 쓴 내용이 있는 항목(수정·이어쓰기 시 숨지 않게)
  const [enabled, setEnabled] = useState<Set<BodyKey>>(() => {
    const s = new Set<BodyKey>();
    for (const sec of SECTIONS) {
      const has = ((initialForm as unknown as Record<string, string | undefined>)[sec.key] ?? "").trim().length > 0;
      if (sec.defaultOn || has) s.add(sec.key);
    }
    return s;
  });
  const toggleSection = (k: BodyKey) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  // 프리셋 — 가이드(기본 구성) / 자유(자유롭게 쓰기 하나). 이미 쓴 항목은 어느 쪽이든 유지.
  const keysWithText = () =>
    SECTIONS.filter((s) => ((form as unknown as Record<string, string | undefined>)[s.key] ?? "").trim()).map((s) => s.key);
  const presetGuided = () =>
    setEnabled(new Set<BodyKey>([...SECTIONS.filter((s) => s.defaultOn).map((s) => s.key), ...keysWithText()]));
  const presetFree = () => setEnabled(new Set<BodyKey>(["freeText", ...keysWithText()]));

  // ── 자동저장(localStorage) — 쓰다가 크래시·새로고침·실수로 닫혀도 복구 ──
  // 서버에 안 쓰므로 읽기/쓰기 예산과 무관. 대상(새 글/초안/정식본)별로 슬롯을 나눈다.
  const target = initial?.draftId ?? initial?.reportId ?? "new";
  const AUTOSAVE_KEY = `class2nd-reading-autosave-${studentId}`;
  // 열 때 저장된 자동본이 있으면(현재 폼과 다르면) 복구 배너로 제안 (자동 덮어쓰기는 안 함)
  const [recovered, setRecovered] = useState<ReportForm | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as { form?: ReportForm; target?: string };
      if (
        saved?.target === target &&
        saved.form &&
        JSON.stringify(saved.form) !== JSON.stringify(initialForm)
      )
        return saved.form;
    } catch {
      /* 손상된 값은 무시 */
    }
    return null;
  });
  // 입력이 멈추면(0.8초) 현재 폼을 자동저장 — 내용이 있을 때만
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (form.title.trim() || reportBodyLength(form) > 0)
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ form, at: Date.now(), target }));
      } catch {
        /* 용량 초과 등은 무시 */
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [form, AUTOSAVE_KEY, target]);
  const clearAutosave = () => {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* noop */
    }
  };
  // 열 때마다 유도 질문 한 세트 선택 (렌더마다 바뀌지 않게 state 초기값으로 고정)
  const [prompts] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [doneBurst, setDoneBurst] = useState(0); // 정식 등록 성공 juice

  // 복붙·작성 시간 신호 (A·B) — 선생님 참고용. 학생 흐름은 막지 않는다.
  const openedAt = useRef(0);
  // 이전 세션까지 누적된 신호에서 이어간다 (초안·정식본 이어쓰기 시 붙여넣기 기록 보존).
  // 외부 복붙(chars/count)과 자기 글 복사(selfChars/selfCount)를 나눠서 센다.
  const pasted = useRef({
    chars: initial?.prior?.pastedChars ?? 0,
    count: initial?.prior?.pasteCount ?? 0,
    selfChars: initial?.prior?.selfPastedChars ?? 0,
    selfCount: initial?.prior?.selfPasteCount ?? 0,
  });
  const priorMs = useRef(initial?.prior?.writeMs ?? 0); // 이전 세션 누적 작성 시간
  const [pasteHint, setPasteHint] = useState(false); // 붙여넣기 차단 안내
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  // 🚫 복붙 강력 차단 (사용자 확정) — 감상문은 '직접 손으로 쓴 글'만 인정.
  //   ① 붙여넣기(onPaste)·드래그드롭(onDrop)을 preventDefault로 원천 차단
  //   ② onPaste를 안 태우는 디벗(iPad) 붙여넣기·음성 받아쓰기까지 잡으려고, IME 조합이 아닌데
  //      한 번에 15자 이상 늘어나는 입력은 되돌린다(상태 미갱신 → controlled input이 이전 값 복구).
  // 차단은 하되 '시도 흔적'은 남긴다 — 잘게 쪼개 붙여넣기·자동 타이핑까지 100% 막을 순 없으므로,
  // 시도 횟수·글자를 기록해 선생님 화면에 색으로 표시하고, 작성 시간(writeMs)으로 속성 작성을 잡는다.
  const recordBlocked = (n: number) => {
    pasted.current.chars += Math.max(n, 0);
    pasted.current.count += 1;
    setPasteHint(true);
    window.setTimeout(() => setPasteHint(false), 3500);
  };
  const onPasteBody = (e: React.ClipboardEvent) => {
    e.preventDefault();
    recordBlocked((e.clipboardData.getData("text") ?? "").length);
  };
  const onDropBody = (e: React.DragEvent) => {
    e.preventDefault();
    recordBlocked((e.dataTransfer.getData("text") ?? "").length);
  };
  const BULK_INSERT = 15;
  const onBodyChange = (field: BodyKey, e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const oldV = (form[field] as string | undefined) ?? "";
    const newV = e.target.value;
    const composing = (e.nativeEvent as { isComposing?: boolean }).isComposing;
    if (!composing && newV.length - oldV.length >= BULK_INSERT) {
      recordBlocked(newV.length - oldV.length); // 대량 삽입(붙여넣기·받아쓰기) → 되돌리고 기록
      return;
    }
    setForm({ ...form, [field]: newV });
  };

  // 저장하지 않은 변경이 있으면 닫기 전에 확인 (긴 글 유실 방지)
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  async function handleClose() {
    if (
      dirty &&
      !(await confirm({
        title: "쓰던 내용을 닫을까요?",
        body: "이 기기에 자동저장돼 있어서, 다시 열면 '이어서 쓸까요?'로 되살릴 수 있어요. 확실히 저장하려면 '임시저장'을 눌러요.",
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
    // state(busy)는 같은 틱의 빠른 연타를 못 막는다(리렌더 전 두 클릭 모두 busy=false) —
    // ref로 즉시 잠가 더블클릭 이중 등록을 차단 (실사례: 동일 감상문 0.4초 간격 2건 등록)
    if (busy || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      if (!draft && bodyLen < charLimit)
        throw new Error(`본문은 ${charLimit}자 이상이어야 정식 등록할 수 있어요. (현재 ${bodyLen}자) 🐢`);
      // 복붙·작성 신호는 임시저장에도 누적 기록한다 — 그래야 다음 세션에 이어받아
      // '초안에 붙여넣고 나중에 정식등록'해도 붙여넣기 기록이 유실되지 않는다(핵심 수정).
      // 이전 세션 누적(prior) + 이번 세션 = 총 붙여넣기·총 작성 시간.
      // 단, 감지 기능 적용 전 정식본을 잠깐 수정하는 경우(이전 신호 없음)엔 짧은 수정 시간을
      // '빠른 작성'으로 오탐하지 않게 writeMs를 생략한다(붙여넣기 신호는 그대로 기록).
      const hadPriorSignal =
        initial?.prior?.writeMs != null || initial?.prior?.pastedChars != null;
      const preFeatureEdit = editingReport && !hadPriorSignal;
      const detect = {
        pastedChars: pasted.current.chars,
        pasteCount: pasted.current.count,
        selfPastedChars: pasted.current.selfChars,
        selfPasteCount: pasted.current.selfCount,
        ...(preFeatureEdit
          ? {}
          : { writeMs: priorMs.current + (openedAt.current ? Date.now() - openedAt.current : 0) }),
      };
      await saveReport(form, { draft, draftId, reportId, detect });
      clearAutosave(); // 저장 성공 → 자동저장 슬롯 비움
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
      submittingRef.current = false;
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
          {/* 방학(개학 전)엔 주차가 아직 없다 — 런처 버튼의 "🏖️ 방학" 표기와 일치시킴 */}
          감상문 {editingReport ? "수정" : "쓰기"} ·{" "}
          {todayKST() < SEMESTER_START ? "🏖️ 방학" : `${week}주차`}
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
        {/* 자동저장 복구 배너 — 쓰다 만 글이 남아 있으면 되살리기 제안 */}
        {recovered && (
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-amber-300 bg-amber-50 px-4 py-3">
            <span className="text-sm font-bold text-amber-800">
              💾 쓰다 만 글이 있어요 — 이어서 쓸까요?
            </span>
            <span className="flex gap-1.5">
              <button
                onClick={() => {
                  setForm(recovered);
                  setRecovered(null);
                }}
                className="press rounded-btn bg-amber-500 px-3 py-1.5 text-xs font-bold text-white"
              >
                불러오기
              </button>
              <button
                onClick={() => {
                  setRecovered(null);
                  clearAutosave();
                }}
                className="press rounded-btn border border-ink-300 bg-white px-3 py-1.5 text-xs font-bold text-ink-500"
              >
                새로 쓰기
              </button>
            </span>
          </div>
        )}
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
          {/* 담을 내용 체크리스트 — 체크한 항목만 아래에 칸이 나타난다 (레이아웃 = 내 선택) */}
          <div className="mt-3 rounded-btn bg-ink-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-ink-700">📋 어떤 내용을 담을까요? — 체크한 것만 칸이 생겨요</p>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={presetGuided}
                  className="press rounded-btn bg-white px-2.5 py-1 text-[11px] font-bold text-ink-600 ring-1 ring-ink-200"
                >
                  📚 가이드 작성
                </button>
                <button
                  type="button"
                  onClick={presetFree}
                  className="press rounded-btn bg-white px-2.5 py-1 text-[11px] font-bold text-ink-600 ring-1 ring-ink-200"
                >
                  🖊️ 자유 작성
                </button>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SECTIONS.map((s) => {
                const on = enabled.has(s.key);
                const has = ((form as unknown as Record<string, string | undefined>)[s.key] ?? "").trim().length > 0;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSection(s.key)}
                    className={`press rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-ink-200 bg-white text-ink-500 hover:border-ink-300"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {s.label}
                    {!on && has && " ●"}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-ink-400">
              체크를 꺼도 이미 쓴 내용은 지워지지 않아요 (● 표시). 자유 작성은 틀 없이 한 칸에 쭉 써요.
            </p>
          </div>
          <div className="mt-3 space-y-3">
            {SECTIONS.filter((s) => enabled.has(s.key)).map((s) => (
              <Field key={s.key} label={s.label}>
                <Textarea
                  value={((form as unknown as Record<string, string | undefined>)[s.key] ?? "") as string}
                  onChange={(e) => onBodyChange(s.key, e)}
                  onPaste={onPasteBody}
                  onDrop={onDropBody}
                  placeholder={
                    (s.key === "summary" || s.key === "scene" || s.key === "quote" || s.key === "thoughts"
                      ? prompts[s.key]
                      : s.placeholder) || s.placeholder
                  }
                  rows={s.rows}
                />
              </Field>
            ))}
            {pasteHint && (
              <p className="rounded-btn bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-700">
                🚫 붙여넣기는 막혀 있어요 — 감상문은 직접 손으로 써야 해요 🐢
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
