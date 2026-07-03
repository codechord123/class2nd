"use client";
// 상점 메뉴판 편집 — 아이들과 토의 후 그때그때 추가/삭제 (고정 보상표 없음).
import { useState } from "react";
import { useShopMenu, useSaveShopMenu, type ShopMenuItem } from "@/lib/query/classMeta";

export default function ShopMenuEditor() {
  const { data: menu } = useShopMenu();
  const save = useSaveShopMenu();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("1");
  const [wallet, setWallet] = useState<"silver" | "gold">("silver");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  async function add() {
    setMsg("");
    try {
      if (!name.trim()) throw new Error("메뉴 이름을 입력하세요.");
      const item: ShopMenuItem = {
        id: Date.now(),
        name: name.trim(),
        price: Math.max(1, Number(price) || 1),
        wallet,
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      await save([...(menu ?? []), item]);
      setName("");
      setNote("");
      setMsg("✅ 메뉴가 추가되었습니다.");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "실패"}`);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">📋 상점 메뉴판 관리</h2>
      <p className="mt-1 text-xs text-slate-500">
        학급 회의로 정한 메뉴를 추가하세요. 학생 상점에 바로 나타납니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="메뉴 이름 (예: 간식 1개)"
          className="min-w-36 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-16 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={wallet}
          onChange={(e) => setWallet(e.target.value as "silver" | "gold")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="silver">실버 (개인)</option>
          <option value="gold">골드 (학급 공용)</option>
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="설명 (선택)"
          className="min-w-28 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => void add()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
        >
          추가
        </button>
      </div>
      {(menu?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {menu!.map((m) => (
            <li key={m.id} className="flex justify-between rounded bg-slate-50 px-3 py-1.5">
              <span>
                {m.wallet === "gold" ? "🥇" : "🪙"} <b>{m.name}</b>{" "}
                <span className="text-xs text-slate-400">
                  {m.price}
                  {m.wallet === "gold" ? "골드" : "실버"}
                  {m.note && ` · ${m.note}`}
                </span>
              </span>
              <button
                onClick={() => void save(menu!.filter((x) => x.id !== m.id))}
                className="text-xs text-rose-400 hover:text-rose-600"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
