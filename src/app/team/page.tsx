// Team — 2학기 핵심 기능 (Phase 3에서 구현).
// 우리 모둠 상호평가(+역할 관점) + 타 모둠 벤치마킹 평가. 척도는 교사 설정값 사용.
import { ROLE_INFO } from "@/lib/roster";

export const metadata = { title: "Team | 2학기 학급 자치" };

export default function TeamPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">🤝 Team (모둠 평가)</h2>
        <p className="mt-1 text-sm text-slate-500">
          개학 후 열립니다. 우리 모둠원 상호평가와 다른 모둠 평가를 매일 할 수 있어요.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold">자리별 고정 역할</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {ROLE_INFO.map((r) => (
            <li key={r.key} className="flex gap-3">
              <span className="w-6 text-lg">{r.emoji}</span>
              <div>
                <b>
                  {r.dept} [{r.key} 지킴이]
                </b>
                <span className="ml-2 text-slate-500">{r.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
