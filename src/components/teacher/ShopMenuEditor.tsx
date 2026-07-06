"use client";
// 상점 메뉴판 편집 — 아이들과 토의 후 그때그때 추가/수정/삭제 (고정 보상표 없음).
// + 학생 메뉴 제안("이런 메뉴 만들어주세요") 검토: 메뉴판에 추가하거나 반려.
import { useState } from "react";
import {
  useShopMenu,
  useSaveShopMenu,
  useMenuRequests,
  useDeleteMenuRequest,
  type ShopMenuItem,
  type MenuRequest,
} from "@/lib/query/classMeta";
import { studentById } from "@/lib/roster";
import { useFeedback } from "@/components/ui/Feedback";

export default function ShopMenuEditor() {
  const { data: menu } = useShopMenu();
  const save = useSaveShopMenu();
  const { data: requests } = useMenuRequests(true);
  const deleteRequest = useDeleteMenuRequest();
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("1");
  const [wallet, setWallet] = useState<"silver" | "gold">("silver");
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState<number | null>(null); // 수정 중인 메뉴 id (null = 추가 모드)
  const [msg, setMsg] = useState("");
  // 제안 → 메뉴판 추가 시 가격·지갑 입력 (제안 id별)
  const [addingReq, setAddingReq] = useState<string | null>(null);
  const [reqPrice, setReqPrice] = useState("1");
  const [reqWallet, setReqWallet] = useState<"silver" | "gold">("silver");

  // 학생 제안을 메뉴판에 추가 (가격·지갑 지정) 후 제안 삭제
  async function acceptRequest(r: MenuRequest) {
    try {
      const item: ShopMenuItem = {
        id: Date.now(),
        name: r.name,
        price: Math.max(1, Number(reqPrice) || 1),
        wallet: reqWallet,
        ...(r.note ? { note: r.note } : {}),
      };
      await save([...(menu ?? []), item]);
      await deleteRequest(r.id);
      setAddingReq(null);
      setReqPrice("1");
      setReqWallet("silver");
      toast(`✅ "${r.name}" 을(를) 메뉴판에 올렸어요!`, "success");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "추가 실패"}`, "error");
    }
  }

  async function rejectRequest(r: MenuRequest) {
    if (
      !(await confirm({
        title: `"${r.name}" 제안을 반려할까요?`,
        body: "제안이 삭제돼요. (아이에게 따로 이유를 알려주면 좋아요)",
        danger: true,
        confirmLabel: "반려",
      }))
    )
      return;
    try {
      await deleteRequest(r.id);
      toast("반려했어요.");
    } catch (e) {
      toast(`⚠️ ${e instanceof Error ? e.message : "실패"}`, "error");
    }
  }

  function resetForm() {
    setEditId(null);
    setName("");
    setPrice("1");
    setWallet("silver");
    setNote("");
  }

  function startEdit(m: ShopMenuItem) {
    setEditId(m.id);
    setName(m.name);
    setPrice(String(m.price));
    setWallet(m.wallet);
    setNote(m.note ?? "");
    setMsg("");
  }

  async function submit() {
    setMsg("");
    try {
      if (!name.trim()) throw new Error("메뉴 이름을 입력하세요.");
      const item: ShopMenuItem = {
        id: editId ?? Date.now(),
        name: name.trim(),
        price: Math.max(1, Number(price) || 1),
        wallet,
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      if (editId != null) {
        await save((menu ?? []).map((x) => (x.id === editId ? item : x)));
        setMsg("✅ 메뉴가 수정되었습니다.");
      } else {
        await save([...(menu ?? []), item]);
        setMsg("✅ 메뉴가 추가되었습니다.");
      }
      resetForm();
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "실패"}`);
    }
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <h2 className="text-lg font-bold">📋 상점 메뉴판 관리</h2>
      <p className="mt-1 text-xs text-ink-600">
        학급 회의로 정한 메뉴를 추가·수정하세요. 학생 상점에 바로 나타납니다.
      </p>
      <div
        className={`mt-3 rounded-btn ${editId != null ? "bg-brand-weak/50 p-2" : ""}`}
      >
        {editId != null && (
          <p className="mb-2 text-xs font-bold text-brand-strong">
            ✏️ 메뉴 수정 중… 내용을 고치고 [수정 저장]을 누르세요.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="메뉴 이름 (예: 간식 1개)"
            className="min-w-36 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-16 rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          <select
            value={wallet}
            onChange={(e) => setWallet(e.target.value as "silver" | "gold")}
            className="rounded-btn border border-ink-300 px-3 py-2 text-sm"
          >
            <option value="silver">실버 (개인)</option>
            <option value="gold">골드 (학급 공용)</option>
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="설명 (선택)"
            className="min-w-28 flex-1 rounded-btn border border-ink-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void submit()}
            className="press rounded-btn bg-brand px-4 py-2 text-sm font-bold text-white"
          >
            {editId != null ? "수정 저장" : "추가"}
          </button>
          {editId != null && (
            <button
              onClick={resetForm}
              className="press rounded-btn border border-ink-300 bg-white px-3 py-2 text-sm font-bold text-ink-500"
            >
              취소
            </button>
          )}
        </div>
      </div>
      {(menu?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {menu!.map((m) => (
            <li
              key={m.id}
              className={`flex items-center justify-between gap-2 rounded px-3 py-1.5 ${
                editId === m.id ? "bg-brand-weak" : "bg-ink-50"
              }`}
            >
              <span className="min-w-0">
                {m.wallet === "gold" ? "🥇" : "💰"} <b>{m.name}</b>{" "}
                <span className="text-xs text-ink-400">
                  {m.price}
                  {m.wallet === "gold" ? "골드" : "실버"}
                  {m.note && ` · ${m.note}`}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <button
                  onClick={() => startEdit(m)}
                  className="text-xs font-bold text-brand hover:text-brand-strong"
                >
                  수정
                </button>
                <button
                  onClick={() => {
                    if (editId === m.id) resetForm();
                    void save(menu!.filter((x) => x.id !== m.id));
                  }}
                  className="text-xs text-rose-400 hover:text-rose-600"
                >
                  삭제
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}

      {/* 학생 메뉴 제안 검토 — "이런 메뉴 만들어주세요" */}
      {(requests?.length ?? 0) > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <h3 className="text-sm font-bold text-ink-800">
            💡 학생 메뉴 제안{" "}
            <span className="font-normal text-ink-400">({requests!.length}건)</span>
          </h3>
          <ul className="mt-2 space-y-2">
            {requests!.map((r) => (
              <li key={r.id} className="rounded-btn border border-ink-200 bg-ink-50 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[11px] font-bold text-brand-strong">
                      {studentById.get(r.studentId)?.name ?? `?${r.studentId}`}
                    </span>{" "}
                    <b className="text-sm text-ink-900">{r.name}</b>
                    {r.note && <span className="ml-1 text-xs text-ink-500">· {r.note}</span>}
                  </span>
                  {addingReq !== r.id && (
                    <span className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => {
                          setAddingReq(r.id);
                          setReqPrice("1");
                          setReqWallet("silver");
                        }}
                        className="press rounded-btn bg-success px-3 py-1.5 text-xs font-bold text-white"
                      >
                        메뉴판에 추가
                      </button>
                      <button
                        onClick={() => void rejectRequest(r)}
                        className="press rounded-btn border border-danger/40 bg-white px-3 py-1.5 text-xs font-bold text-danger"
                      >
                        반려
                      </button>
                    </span>
                  )}
                </div>
                {/* 가격·지갑 지정 후 확정 */}
                {addingReq === r.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-ink-200 pt-2">
                    <span className="text-xs font-bold text-ink-500">가격</span>
                    <input
                      type="number"
                      min={1}
                      value={reqPrice}
                      onChange={(e) => setReqPrice(e.target.value)}
                      className="w-16 rounded-btn border border-ink-300 px-2 py-1.5 text-sm"
                    />
                    <select
                      value={reqWallet}
                      onChange={(e) => setReqWallet(e.target.value as "silver" | "gold")}
                      className="rounded-btn border border-ink-300 px-2 py-1.5 text-sm"
                    >
                      <option value="silver">실버 (개인)</option>
                      <option value="gold">골드 (학급 공용)</option>
                    </select>
                    <button
                      onClick={() => void acceptRequest(r)}
                      className="press rounded-btn bg-brand px-3 py-1.5 text-xs font-bold text-white"
                    >
                      확정
                    </button>
                    <button
                      onClick={() => setAddingReq(null)}
                      className="press rounded-btn px-2 py-1.5 text-xs font-bold text-ink-400"
                    >
                      취소
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
