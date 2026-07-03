"use client";
// 로그인 게이트 — 로그인 전에는 탭 콘텐츠 대신 로그인 화면을 보여준다.
// 학생: 명단에서 이름 선택 + 비밀번호 (첫 로그인 시 그 비밀번호로 등록)
// 교사: 이메일/비밀번호 (Firebase Auth 콘솔에 만든 계정)
//
// 중요: 새로고침 직후 Firebase 인증 복원이 끝나기 전에 Firestore 쿼리가 나가면
// 전부 permission-denied가 된다("로딩 안 됨" 증상). 인증 상태가 확정될 때까지
// 콘텐츠 렌더를 보류하고, 세션은 학생인데 Firebase 로그인이 풀려 있으면
// 익명 로그인을 자동 복구, 교사면 재로그인을 요청한다.
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { useSession } from "@/stores/session";
import { students } from "@/lib/roster";
import { studentLogin, teacherLogin } from "@/lib/auth";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { role, login, logout } = useSession();
  // persist 하이드레이션 전 SSR 불일치 방지
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Firebase 인증 상태 확정 대기
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth(), (u) => {
      setFbUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // 세션은 살아있는데 Firebase 로그인이 풀린 경우 복구
  useEffect(() => {
    if (!authReady || fbUser) return;
    if (role === "student") {
      void signInAnonymously(firebaseAuth()).catch(() => logout());
    } else if (role === "teacher") {
      logout(); // 교사는 비밀번호 재입력 필요
    }
  }, [authReady, fbUser, role, logout]);

  if (!mounted) return null;
  if (role) {
    if (!authReady || !fbUser) {
      return (
        <p className="py-16 text-center text-sm font-medium text-ink-400">🔐 연결 확인 중…</p>
      );
    }
    return <>{children}</>;
  }
  return <LoginScreen onLogin={login} />;
}

function LoginScreen({
  onLogin,
}: {
  onLogin: (role: "student" | "teacher", studentId?: number) => void;
}) {
  const [mode, setMode] = useState<"student" | "teacher">("student");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "student") {
        if (!selectedId) throw new Error("이름을 선택해주세요.");
        const { firstTime } = await studentLogin(selectedId, password);
        if (firstTime) setNotice("첫 로그인! 지금 입력한 비밀번호가 등록되었어요.");
        onLogin("student", selectedId);
      } else {
        await teacherLogin(email, password);
        onLogin("teacher");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <div className="text-center">
        <p className="text-4xl">🏫</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight text-ink-900">
          2학기 학급 자치 시스템
        </h2>
        <p className="mt-1 text-sm text-ink-500">로그인하고 시작해요</p>
      </div>

      <div className="flex gap-1 rounded-btn bg-ink-100 p-1 text-sm font-bold">
        {(["student", "teacher"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`press flex-1 rounded-[11px] py-2.5 transition-colors ${
              mode === m ? "bg-white text-ink-900 shadow-card" : "text-ink-500"
            }`}
          >
            {m === "student" ? "🎒 학생" : "🧑‍🏫 선생님"}
          </button>
        ))}
      </div>

      {mode === "student" ? (
        <>
          <div className="grid grid-cols-5 gap-1.5">
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`press rounded-xl py-2.5 text-xs font-bold transition-colors ${
                  selectedId === s.id
                    ? "bg-brand text-white shadow-card"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder="비밀번호 (처음이면 새로 정하는 비밀번호)"
          />
        </>
      ) : (
        <>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="선생님 이메일"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder="비밀번호"
          />
        </>
      )}

      {error && <p className="text-sm font-medium text-danger">⚠️ {error}</p>}
      {notice && <p className="text-sm font-medium text-success">✅ {notice}</p>}

      <Button onClick={submit} disabled={busy} block size="lg">
        {busy ? "확인 중…" : "로그인"}
      </Button>
    </div>
  );
}
