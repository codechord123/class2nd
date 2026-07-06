"use client";
// 우리 반 헌법·법률·역할.
// 법률은 부서별로 나눠 아이들이 자기 부서 규칙을 만들 수 있게 한다 (사용자 확정).
// 저장 스키마: articles·laws(미분류)·roles는 문자열 배열, lawsByDept는 부서명→배열 맵.
import { useState } from "react";
import { useSession } from "@/stores/session";
import { ROLE_INFO } from "@/lib/roster";
import { useConstitution, useSaveConstitution, type Constitution } from "@/lib/query/classMeta";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Field";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useFeedback } from "@/components/ui/Feedback";

const SUBTABS = [
  { key: "articles", label: "📜 헌법" },
  { key: "laws", label: "📜 법률" },
  { key: "roles", label: "🎭 역할" },
] as const;
type SubKey = (typeof SUBTABS)[number]["key"];

// 부서 목록 — ROLE_INFO의 dept 필드가 저장 키. 순서·이모지·설명 이 배열이 단일 출처.
const DEPTS = ROLE_INFO.map((r) => ({
  key: r.dept, // "의장" | "법무부" | ...
  emoji: r.emoji,
  role: r.key, // 소통·질서·학습·건강·행정 — placeholder 힌트용
  desc: r.desc,
}));

// 부서별 placeholder 힌트 — "OO법 N조 N항 — ~이다" 형식 예시 (사용자 확정)
const LAW_HINT: Record<string, string> = {
  의장: "예: 소통법 1조 1항 — 회의 시작 전 3분 간 침묵으로 마음을 모은다.",
  법무부: "예: 질서법 1조 1항 — 복도에서는 오른쪽으로 걷고, 뛰지 않는다.",
  교육부: "예: 학습법 1조 1항 — 아침 자습 시간(8:40~9:00)은 조용히 학습한다.",
  보건환경부: "예: 건강법 1조 1항 — 급식 후 반드시 양치질을 한다.",
  행정안전부: "예: 행정법 1조 1항 — 유인물은 당일 가정으로 전달한다.",
};

/** 부서의 법 이름 — 역할명 + 법 (질서 지킴이 → 질서법) */
const lawNameOf = (dept: string) => `${DEPTS.find((d) => d.key === dept)?.role ?? ""}법`;

export default function RulesPage() {
  const { role } = useSession();
  const { data: c } = useConstitution();
  const save = useSaveConstitution();
  const { toast, confirm } = useFeedback();

  const [tab, setTab] = useState<SubKey>("articles");
  const [selectedDept, setSelectedDept] = useState<string | null>(null); // 선택된 부서(법률 탭)
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<string[]>([]);

  if (!c) return <SkeletonCard />;

  // 현재 보고 있는 조항 목록 계산
  // - 헌법·역할: 기존과 동일
  // - 법률: 부서를 선택했으면 그 부서 배열, 아니면 (그리드 화면이라 렌더 안 함)
  const currentDeptLaws = (dept: string) => c.lawsByDept?.[dept] ?? [];
  const viewItems =
    tab === "roles" && c.roles.length === 0
      ? ROLE_INFO.map((r) => `${r.emoji} ${r.dept} [${r.key} 지킴이] — ${r.desc}`)
      : tab === "laws"
        ? selectedDept
          ? currentDeptLaws(selectedDept)
          : []
        : c[tab];

  const showDeptGrid = tab === "laws" && !selectedDept;

  function startEdit() {
    setItems([...viewItems]);
    setEditing(true);
  }
  function switchTab(next: SubKey) {
    setTab(next);
    setEditing(false);
    setSelectedDept(null);
  }
  function selectDept(dept: string) {
    setSelectedDept(dept);
    setEditing(false);
  }
  function backToGrid() {
    setSelectedDept(null);
    setEditing(false);
  }

  // 부서 하나의 법률 전체 삭제 (부서별 일괄)
  async function clearDept(dept: string) {
    if (
      !(await confirm({
        title: `${dept}의 법률을 모두 삭제할까요?`,
        body: `${currentDeptLaws(dept).length}개 조항이 지워지고 되돌릴 수 없어요.`,
        danger: true,
        confirmLabel: "모두 삭제",
      }))
    )
      return;
    try {
      await save({ ...c!, lawsByDept: { ...(c!.lawsByDept ?? {}), [dept]: [] } });
      setEditing(false);
      toast(`🗑️ ${dept} 법률을 모두 삭제했어요.`);
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "삭제 실패"}`, "error");
    }
  }

  // 전 부서 + 미분류 법률 통합 삭제
  async function clearAllLaws() {
    const total =
      Object.values(c!.lawsByDept ?? {}).reduce((a, v) => a + v.length, 0) + c!.laws.length;
    if (
      !(await confirm({
        title: "모든 법률을 삭제할까요?",
        body: `전 부서 + 미분류 ${total}개 조항이 모두 지워지고 되돌릴 수 없어요. (헌법·역할은 그대로예요)`,
        danger: true,
        confirmLabel: "전부 삭제",
      }))
    )
      return;
    try {
      await save({ ...c!, lawsByDept: {}, laws: [] });
      toast(`🗑️ 모든 법률(${total}개)을 삭제했어요.`);
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "삭제 실패"}`, "error");
    }
  }

  async function saveEdit() {
    try {
      const cleaned = items.map((s) => s.trim()).filter(Boolean);
      let next: Constitution;
      if (tab === "laws" && selectedDept) {
        // 법률: 선택 부서의 배열만 갱신, 다른 부서·미분류는 보존
        next = {
          ...c!,
          lawsByDept: { ...(c!.lawsByDept ?? {}), [selectedDept]: cleaned },
        };
      } else if (tab === "articles" || tab === "roles") {
        next = { ...c!, [tab]: cleaned };
      } else {
        // laws 탭인데 부서 미선택 — 원래 도달 불가
        return;
      }
      await save(next);
      setEditing(false);
      toast("✅ 저장되었어요!");
    } catch (e) {
      toast(`⚠️ 저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  // 편집 UI (헌법·역할·특정 부서 법률 공통)
  const editingUI = (
    <div className="mt-4 space-y-2">
      {items.map((line, i) => (
        <div key={i} className="flex items-start gap-2 rounded-card bg-ink-50 p-2.5">
          <span className="tnum mt-2 w-7 shrink-0 text-center text-xs font-bold text-ink-400">
            {i + 1}
          </span>
          <Textarea
            value={line}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
            rows={2}
            placeholder={
              tab === "laws" && selectedDept ? LAW_HINT[selectedDept] : "내용을 적어주세요"
            }
          />
          <div className="flex shrink-0 flex-col gap-1">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="press flex h-6 w-6 items-center justify-center rounded-md bg-ink-100 text-ink-500 disabled:opacity-30"
              aria-label="위로"
            >
              ▲
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              className="press flex h-6 w-6 items-center justify-center rounded-md bg-ink-100 text-ink-500 disabled:opacity-30"
              aria-label="아래로"
            >
              ▼
            </button>
          </div>
          <button
            onClick={() =>
              void confirm({ title: "이 항목을 삭제할까요?", danger: true, confirmLabel: "삭제" }).then(
                (ok) => ok && setItems(items.filter((_, j) => j !== i))
              )
            }
            className="press mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger-weak"
            aria-label="삭제"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          setItems([
            ...items,
            // 법률은 "OO법 N조 N항 — ~이다" 형식이 관례 — 템플릿을 미리 채워
            // 아이들(과 교사)이 형식을 고민하지 않고 내용만 쓰게 한다 (사용자 확정)
            tab === "laws" && selectedDept
              ? `${lawNameOf(selectedDept)} ${items.length + 1}조 1항 — `
              : "",
          ])
        }
        className="press w-full rounded-card border border-dashed border-ink-300 py-2.5 text-sm font-bold text-ink-500 hover:bg-ink-50"
      >
        + 항목 추가{tab === "laws" && selectedDept ? ` (${lawNameOf(selectedDept)} ${items.length + 1}조)` : ""}
      </button>
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={() => void saveEdit()}>저장</Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>
          취소
        </Button>
        {/* 부서 법률 일괄 삭제 — 법률 탭 부서 상세 편집일 때만 */}
        {tab === "laws" && selectedDept && currentDeptLaws(selectedDept).length > 0 && (
          <button
            onClick={() => void clearDept(selectedDept)}
            className="press ml-auto rounded-btn border border-danger/40 bg-white px-3 py-2 text-xs font-bold text-danger hover:bg-danger-weak"
          >
            🗑️ 이 부서 전체 삭제
          </button>
        )}
      </div>
    </div>
  );

  // 부서 선택 그리드 (법률 탭 첫 화면)
  const deptGrid = (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-ink-500">
        각 부서가 담당 영역의 법을 만들어요. 부서를 눌러 조항을 확인·편집하세요.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DEPTS.map((d) => {
          const count = currentDeptLaws(d.key).length;
          return (
            <button
              key={d.key}
              onClick={() => selectDept(d.key)}
              className="press flex flex-col items-center gap-1 rounded-card border border-ink-200 bg-white px-3 py-3 text-center hover:border-brand hover:bg-brand-weak/30"
            >
              <span className="text-2xl">{d.emoji}</span>
              <span className="text-sm font-bold text-ink-900">{d.key}</span>
              <span className="text-[11px] text-ink-500">{d.role} 지킴이</span>
              <span className="tnum mt-0.5 rounded-full bg-brand-weak px-2 py-0.5 text-[11px] font-bold text-brand-strong">
                {count}조
              </span>
            </button>
          );
        })}
      </div>
      {/* 교사: 전 부서 통합 삭제 — 조항이 하나라도 있을 때만 */}
      {role === "teacher" &&
        (Object.values(c.lawsByDept ?? {}).some((v) => v.length > 0) || c.laws.length > 0) && (
          <div className="flex justify-end">
            <button
              onClick={() => void clearAllLaws()}
              className="press rounded-btn border border-danger/40 bg-white px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-weak"
            >
              🗑️ 모든 법률 삭제
            </button>
          </div>
        )}
      {/* 미분류 잔재 (건의 채택으로 쌓인 laws 배열) — 있을 때만 안내 */}
      {c.laws.length > 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs font-bold text-amber-800">
            📦 미분류 법률 {c.laws.length}개 (건의에서 채택된 초안)
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-900">
            {c.laws.slice(0, 5).map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
            {c.laws.length > 5 && <li>… 외 {c.laws.length - 5}개</li>}
          </ul>
        </div>
      )}
    </div>
  );

  // 부서 상세 헤더 (뒤로가기 + 부서명)
  const deptDetail = selectedDept && DEPTS.find((d) => d.key === selectedDept);

  return (
    <div className="space-y-4">
      <Card
        title="🏛️ 우리 반 민주교실"
        desc="학생들이 함께 만든 헌법·법률·역할이에요."
        action={
          // 법률 탭은 부서 헤더 바에 수정 버튼이 따로 있다 (중복 방지)
          role === "teacher" &&
          !editing &&
          tab !== "laws" && (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              ✏️ 수정
            </Button>
          )
        }
      >
        <div className="mt-4">
          <SegmentedControl
            tabs={SUBTABS as unknown as { key: SubKey; label: string }[]}
            active={tab}
            onChange={switchTab}
          />
        </div>

        {/* 법률 탭: 부서 상세 진입 시 헤더 (뒤로가기 + 수정 — 눈에 잘 띄는 위치에) */}
        {tab === "laws" && selectedDept && deptDetail && (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-btn bg-brand-weak/40 px-3 py-2">
            <button
              onClick={backToGrid}
              className="press shrink-0 text-xs font-bold text-brand-strong hover:text-brand"
            >
              ← 부서 목록
            </button>
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink-900">
              <span>{deptDetail.emoji}</span>
              <span>{deptDetail.key}</span>
              <span className="hidden text-xs font-medium text-ink-500 sm:inline">
                · {lawNameOf(selectedDept)}
              </span>
            </p>
            {role === "teacher" && !editing ? (
              <button
                onClick={startEdit}
                className="press shrink-0 rounded-btn bg-brand px-3 py-1.5 text-xs font-bold text-white"
              >
                ✏️ 수정
              </button>
            ) : (
              <span className="w-14 shrink-0" />
            )}
          </div>
        )}

        {showDeptGrid ? (
          deptGrid
        ) : editing ? (
          editingUI
        ) : viewItems.length === 0 ? (
          <EmptyState
            emoji="📝"
            title="아직 내용이 없어요"
            desc={role === "teacher" ? "✏️ 수정을 눌러 채워주세요." : "곧 채워질 거예요!"}
          />
        ) : (
          <ol className="mt-4 space-y-2">
            {viewItems.map((line, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-card bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-700"
              >
                <span className="tnum shrink-0 font-bold text-brand">{i + 1}</span>
                <span className="whitespace-pre-wrap">{line}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
