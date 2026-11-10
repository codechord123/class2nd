"use client";
// 탭 이름·순서 편집 — 코딩 없이 내비게이션을 조정한다 (classData/uiText의 nav.* 키).
// 2026-11 2단 메뉴 개편: 순서는 '주 메뉴'만(nav.order3), 이름은 주 메뉴·하위 메뉴 모두(nav.label.경로).
// 이름을 비우면 기본 이름으로 복귀. (예전 1단 순서 nav.order는 더 쓰지 않는다)
import { useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useQueryClient } from "@tanstack/react-query";
import { NAV, TABS, applyTabConfig } from "@/components/TabNav";
import { useUiText } from "@/lib/uiText";
import { useFeedback } from "@/components/ui/Feedback";
import Card from "@/components/ui/Card";

/** 저장된 순서를 지워 기본 순서(코드의 TABS)로 복귀 — 이름 커스텀은 유지 */
const RESET_PATCH = { "nav.order3": "" };

interface Row {
  href: string;
  defLabel: string;
  label: string;
  sub?: boolean; // 하위 메뉴 — 순서는 고정, 이름만
}

export default function TabConfigPanel() {
  const qc = useQueryClient();
  const { data: uiText } = useUiText();
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function resetOrder() {
    const ok = await confirm({
      title: "탭 순서를 기본값으로 되돌릴까요?",
      body: "저장했던 순서가 지워지고 기본 순서(홈·모둠·독서·나와 우리·상점·우리 반)로 돌아가요. 바꾼 이름은 유지돼요.",
      confirmLabel: "기본 순서로",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await setDoc(doc(db(), "classData", "uiText"), RESET_PATCH, { merge: true });
      qc.setQueryData(["uiText"], (prev: Record<string, string> | undefined) => ({
        ...(prev ?? {}),
        ...RESET_PATCH,
      }));
      setRows(null); // 목록 다시 초기화 (기본 순서로)
      toast("✅ 기본 순서로 되돌렸어요 — 새로고침하면 모든 화면에 반영돼요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "되돌리기에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  // 현재 저장된 순서·이름으로 초기화 (1회)
  useEffect(() => {
    if (rows || uiText === undefined) return;
    // 실제 내비게이션과 같은 정렬 규칙 공유 — 새 탭도 기본 위치에 보인다
    const sorted = applyTabConfig(uiText).filter((g) => !g.teacherOnly);
    const row = (href: string, sub = false): Row => ({
      href,
      sub,
      defLabel: TABS.find((x) => x.href === href)?.label ?? href,
      label: uiText[`nav.label.${href}`] ?? "",
    });
    setRows(
      sorted.flatMap((g) => [row(g.href), ...(NAV.find((x) => x.href === g.href)?.children ?? []).map((c) => row(c.href, true))])
    );
  }, [uiText, rows]);

  // 주 메뉴 단위로 옮긴다 — 하위 메뉴는 자기 묶음을 따라 함께 움직인다
  function move(i: number, dir: -1 | 1) {
    if (!rows) return;
    const blocks: Row[][] = [];
    for (const r of rows) (r.sub ? blocks[blocks.length - 1] : (blocks[blocks.length] = [])).push(r);
    const bi = blocks.findIndex((b) => b[0] === rows[i]);
    const bj = bi + dir;
    if (bi < 0 || bj < 0 || bj >= blocks.length) return;
    [blocks[bi], blocks[bj]] = [blocks[bj], blocks[bi]];
    setRows(blocks.flat());
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    try {
      const patch: Record<string, string> = {
        "nav.order3": rows.filter((r) => !r.sub).map((r) => r.href).join(","),
      };
      for (const r of rows) patch[`nav.label.${r.href}`] = r.label.trim();
      // 빈 라벨 키는 저장하지 않도록 정리 후 merge
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v));
      // 지워진 라벨은 빈 문자열로 덮어 기본 복귀
      for (const r of rows) if (!r.label.trim()) clean[`nav.label.${r.href}`] = "";
      await setDoc(doc(db(), "classData", "uiText"), clean, { merge: true });
      qc.setQueryData(["uiText"], (prev: Record<string, string> | undefined) => ({
        ...(prev ?? {}),
        ...clean,
      }));
      toast("✅ 탭 구성이 저장됐어요 — 새로고침하면 모든 화면에 반영돼요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장에 실패했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="🗂️ 메뉴 이름·순서" desc="주 메뉴의 순서와 모든 메뉴의 이름을 바꿀 수 있어요 (하위 메뉴는 묶음을 따라 움직여요, 선생님 메뉴는 맨 뒤 고정)">
      {!rows ? (
        <p className="mt-3 text-xs text-ink-400">불러오는 중…</p>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {rows.map((r, i) => (
              <li
                key={r.href}
                className={`flex items-center gap-2 rounded-btn px-2.5 py-1.5 ${r.sub ? "ml-8 bg-white ring-1 ring-ink-200" : "bg-ink-50"}`}
              >
                <span className={`flex gap-0.5 ${r.sub ? "invisible" : ""}`}>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || r.sub}
                    className="press rounded bg-white px-2 py-1 text-xs font-bold text-ink-600 disabled:opacity-30"
                    aria-label="위로"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={r.sub || !rows.slice(i + 1).some((x) => !x.sub)}
                    className="press rounded bg-white px-2 py-1 text-xs font-bold text-ink-600 disabled:opacity-30"
                    aria-label="아래로"
                  >
                    ↓
                  </button>
                </span>
                <span className="w-14 shrink-0 text-xs font-bold text-ink-500">{r.defLabel}</span>
                <input
                  value={r.label}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder={`(기본: ${r.defLabel})`}
                  className="min-w-0 flex-1 rounded-btn border border-ink-300 bg-white px-2.5 py-1.5 text-sm"
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void save()}
              disabled={busy}
              className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "저장 중…" : "탭 구성 저장"}
            </button>
            <button
              onClick={() => void resetOrder()}
              disabled={busy}
              className="press rounded-btn border border-ink-300 bg-white px-4 py-2 text-sm font-bold text-ink-600 disabled:opacity-50"
            >
              기본 순서로 되돌리기
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
