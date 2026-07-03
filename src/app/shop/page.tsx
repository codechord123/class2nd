// 상점 — 2학기 재화(Firestore)와 1학기 이월 지갑(정적 JSON)을 완전 격리 (요구사항 §D).
// 이월 정책: "별도 지갑" 방식 — 이월분은 이 지갑에서만 사용/차감, 2학기 재화와 합산하지 않음.
// 이월분 사용(차감) 트랜잭션은 Phase 5(상점)에서 Firestore `s1Spends`로 구현 예정.
import { s1Wallet, s1ClassGoldRemaining } from "@/lib/staticData";

export const metadata = { title: "상점 | 2학기 학급 자치" };

export default function ShopPage() {
  const totalCarryover = s1Wallet.students.reduce((a, s) => a + s.silverRemaining, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">🛍️ 2학기 상점</h2>
        <p className="mt-1 text-sm text-slate-500">
          2학기 실버 적립·사용은 개학 후 열립니다. (Phase 5)
        </p>
      </section>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">🎒 1학기 이월 지갑</h2>
          <p className="text-sm text-slate-600">
            반 전체 이월 실버 <b>{totalCarryover}개</b> · 학급 골드토큰{" "}
            <b>{s1ClassGoldRemaining}개</b>
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          1학기에 다 쓰지 못한 실버입니다. 2학기 실버와 섞이지 않고 이 지갑에서만 사용할 수
          있어요.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-indigo-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-2">번호</th>
                <th className="py-2 pr-2">이름</th>
                <th className="py-2 pr-2 text-right">이월 실버</th>
                <th className="py-2 pr-2 text-right text-slate-400">1학기 획득</th>
                <th className="py-2 text-right text-slate-400">1학기 사용</th>
              </tr>
            </thead>
            <tbody>
              {s1Wallet.students.map((s) => (
                <tr key={s.id} className="border-b border-indigo-100 last:border-0">
                  <td className="py-1.5 pr-2 text-slate-400">{s.id}</td>
                  <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                  <td className="py-1.5 pr-2 text-right font-bold text-indigo-700">
                    {s.silverRemaining}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-slate-400">{s.silverEarnedS1}</td>
                  <td className="py-1.5 text-right text-slate-400">{s.silverUsedS1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          ※ 이 표는 GitHub 정적 파일에서 표시됩니다 — Firebase 읽기 0회.
        </p>
      </section>
    </div>
  );
}
