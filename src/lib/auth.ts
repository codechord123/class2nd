// 인증 계층 (1학기 방식 계승):
//  - 교사: Firebase 이메일/비밀번호 로그인 → 규칙에서 email로 교사 판별
//  - 학생: 익명 Firebase Auth + 본인 비밀번호(SHA-256 해시)를 studentAuth/{id}에 저장
//    첫 로그인 시 입력한 비밀번호가 그대로 등록된다.
import {
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseAuth, db } from "./firebase";

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function teacherLogin(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth(), email, password);
}

/** 학생 로그인. 반환값 firstTime=true면 방금 입력한 비밀번호로 신규 등록됨. */
export async function studentLogin(
  studentId: number,
  password: string
): Promise<{ firstTime: boolean }> {
  if (!password.trim()) throw new Error("비밀번호를 입력해주세요.");
  const auth = firebaseAuth();
  if (!auth.currentUser) await signInAnonymously(auth);

  const ref = doc(db(), "studentAuth", String(studentId));
  const snap = await getDoc(ref); // 로그인 시 1회 읽기 — 이후 재조회 없음
  const hash = await sha256(password);

  if (!snap.exists()) {
    // 계정 최초 등록: 이 익명 uid에 바인딩 → 규칙이 타인의 덮어쓰기를 차단
    await setDoc(ref, { hash, updatedAt: Date.now(), uid: auth.currentUser?.uid ?? null });
    return { firstTime: true };
  }
  if (snap.data().hash !== hash) {
    throw new Error("비밀번호가 올바르지 않습니다.");
  }
  return { firstTime: false };
}

/** 학생 본인: 비밀번호 변경 (+ 힌트 동시 설정 가능) */
export async function changeStudentPassword(
  studentId: number,
  oldPassword: string,
  newPassword: string,
  hint?: string
): Promise<void> {
  if (newPassword.trim().length < 4) throw new Error("새 비밀번호는 4자 이상으로 해주세요.");
  const ref = doc(db(), "studentAuth", String(studentId));
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().hash !== (await sha256(oldPassword))) {
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }
  await setDoc(
    ref,
    {
      hash: await sha256(newPassword),
      updatedAt: Date.now(),
      uid: firebaseAuth().currentUser?.uid ?? null,
      ...(hint !== undefined ? { hint: hint.trim() } : {}),
    },
    { merge: true }
  );
}

/** 학생 본인: 힌트만 변경 (비밀번호 확인 후) */
export async function setStudentHint(
  studentId: number,
  password: string,
  hint: string
): Promise<void> {
  const ref = doc(db(), "studentAuth", String(studentId));
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().hash !== (await sha256(password))) {
    throw new Error("비밀번호가 올바르지 않습니다.");
  }
  await setDoc(ref, { hint: hint.trim(), updatedAt: Date.now() }, { merge: true });
}

/** 비밀번호 찾기 — 저장된 힌트를 조회 (없으면 null) */
export async function getStudentHint(studentId: number): Promise<string | null> {
  const auth = firebaseAuth();
  if (!auth.currentUser) await signInAnonymously(auth);
  const snap = await getDoc(doc(db(), "studentAuth", String(studentId)));
  if (!snap.exists()) return null; // 아직 비번 미등록
  const hint = snap.data().hint;
  return typeof hint === "string" && hint.trim() ? hint : "";
}

/** 학생: 선생님께 비밀번호 초기화 요청 (힌트로도 못 찾을 때) */
export async function requestPasswordReset(studentId: number): Promise<void> {
  const auth = firebaseAuth();
  if (!auth.currentUser) await signInAnonymously(auth);
  await setDoc(doc(db(), "resetRequests", String(studentId)), {
    studentId,
    requestedAt: Date.now(),
  });
}

/** 교사: 학생 비밀번호 초기화 — 문서 삭제 후 다음 로그인 시 재등록되게 함 */
export async function resetStudentPassword(studentId: number): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db(), "studentAuth", String(studentId)));
  await deleteDoc(doc(db(), "resetRequests", String(studentId))).catch(() => {});
}

export async function logout(): Promise<void> {
  await signOut(firebaseAuth()).catch(() => {});
}
