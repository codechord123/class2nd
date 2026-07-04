"use client";
// 🔬 연결 진단 — 로그인이 안 될 때 기기에서 어느 구간이 막히는지 확인하는 페이지.
// 층별로 나눠 검사: ① 인증 서버 도달 ② DB 서버 도달 ③ SDK 익명 로그인 ④ SDK DB 읽기.
// 각 8초 제한 — 결과 화면을 스크린샷으로 공유하면 원격 진단이 가능하다.
import { useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { firebaseAuth, db } from "@/lib/firebase";

const KEY = "AIzaSyCgNcebghb1SZK_7UjgnuwF20_p2TxSHXI"; // 공개 웹 키 (firebase.ts와 동일)

interface Result {
  name: string;
  ok: boolean | null; // null = 실행 중
  detail: string;
}

async function timed(
  fn: () => Promise<string>,
  ms = 8000
): Promise<{ ok: boolean; detail: string }> {
  const t0 = Date.now();
  try {
    const note = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`응답 없음 (${ms / 1000}초 초과)`)), ms)
      ),
    ]);
    return { ok: true, detail: `${note} · ${Date.now() - t0}ms` };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, detail: `${code || (e as Error).message} · ${Date.now() - t0}ms` };
  }
}

const PROBES: { name: string; run: () => Promise<string> }[] = [
  {
    name: "① 인증 서버 도달 (fetch)",
    run: async () => {
      const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${KEY}`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return "정상";
    },
  },
  {
    name: "② DB 서버 도달 (fetch)",
    run: async () => {
      const r = await fetch(
        "https://firestore.googleapis.com/v1/projects/nd-cf543/databases/(default)/documents/classData/settings"
      );
      // 403(권한 거부)도 '서버까지는 도달'이므로 정상으로 판정
      if (r.status === 200 || r.status === 403) return `정상 (HTTP ${r.status})`;
      throw new Error(`HTTP ${r.status}`);
    },
  },
  {
    name: "③ SDK 익명 로그인",
    run: async () => {
      await signInAnonymously(firebaseAuth());
      return "정상";
    },
  },
  {
    name: "④ SDK DB 읽기 (설정 문서)",
    run: async () => {
      const snap = await getDoc(doc(db(), "classData", "settings"));
      return snap.exists() ? "정상 (문서 있음)" : "정상 (문서 없음)";
    },
  },
];

export default function DebugPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  async function runAll() {
    if (running) return;
    setRunning(true);
    const acc: Result[] = [];
    for (const p of PROBES) {
      acc.push({ name: p.name, ok: null, detail: "검사 중…" });
      setResults([...acc]);
      const r = await timed(p.run);
      acc[acc.length - 1] = { name: p.name, ...r };
      setResults([...acc]);
    }
    setRunning(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <section className="rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <h1 className="text-lg font-bold">🔬 연결 진단</h1>
        <p className="mt-1 text-xs text-ink-500">
          로그인이 안 될 때 이 기기에서 어느 구간이 막히는지 검사해요. 결과 화면을
          스크린샷으로 공유해주세요.
        </p>
        <button
          onClick={() => void runAll()}
          disabled={running}
          className="press mt-3 w-full rounded-btn bg-brand py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {running ? "진단 중…" : "진단 시작"}
        </button>

        <ul className="mt-4 space-y-2">
          {results.map((r) => (
            <li
              key={r.name}
              className={`rounded-btn px-3 py-2.5 text-sm ${
                r.ok === null
                  ? "bg-ink-100 text-ink-500"
                  : r.ok
                    ? "bg-success-weak text-success"
                    : "bg-danger-weak text-danger"
              }`}
            >
              <b>{r.ok === null ? "⏳" : r.ok ? "✓" : "✗"} {r.name}</b>
              <span className="ml-1 break-all text-xs">— {r.detail}</span>
            </li>
          ))}
        </ul>

        {results.length === PROBES.length && !running && (
          <p className="mt-3 rounded-btn bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-500">
            해석: ①②가 ✗면 이 기기/통신망에서 구글 서버 연결이 막힌 것 · ①②는 ✓인데
            ③④가 ✗면 앱과 서버 사이 설정 문제예요. 이 화면을 캡처해서 보내주세요.
          </p>
        )}
      </section>
      <p className="text-center text-[11px] text-ink-400">
        기기: <span className="break-all">{typeof navigator !== "undefined" ? navigator.userAgent : ""}</span>
      </p>
    </div>
  );
}
