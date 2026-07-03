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
    await setDoc(ref, { hash, updatedAt: Date.now() });
    return { firstTime: true };
  }
  if (snap.data().hash !== hash) {
    throw new Error("비밀번호가 올바르지 않습니다.");
  }
  return { firstTime: false };
}

export async function changeStudentPassword(
  studentId: number,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.trim().length < 4) throw new Error("새 비밀번호는 4자 이상으로 해주세요.");
  const ref = doc(db(), "studentAuth", String(studentId));
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().hash !== (await sha256(oldPassword))) {
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }
  await setDoc(ref, { hash: await sha256(newPassword), updatedAt: Date.now() });
}

export async function logout(): Promise<void> {
  await signOut(firebaseAuth()).catch(() => {});
}
