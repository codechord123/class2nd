// 인증 계층:
//  - 교사: Firebase 이메일/비밀번호 로그인 → 규칙에서 email로 교사 판별
//  - 학생: 익명 Firebase Auth + 비밀번호(SHA-256 해시)를 studentAuth/{id}에 저장.
//    로그인 = verify(입력 해시)를 실어 update → 규칙이 저장된 hash와 대조해 검증하고,
//    성공하면 이 기기 uid로 바인딩까지 한 번에 처리(기기 바꿔도 재로그인이면 끝).
//    학생은 studentAuth를 읽을 수 없어 해시 유출·무차별 대입이 차단된다.
//  - 호환: 구버전 규칙(읽기 허용)이 아직 게시돼 있으면 기존 방식(클라이언트 대조)으로 검증.
import {
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { firebaseAuth, db } from "./firebase";

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const codeOf = (e: unknown): string => (e as { code?: string })?.code ?? "";

/**
 * 교사 작업이 permission-denied로 실패했을 때 원인을 스스로 짚어주는 안내.
 * 'Missing or insufficient permissions'만 보이면 교사가 원인(인증 유실 vs 규칙 미게시)을
 * 구분할 수 없다 — 이 기기의 실제 Firebase 인증 상태를 보고 정확한 처방을 낸다.
 */
export function teacherPermissionHint(e: unknown): string | null {
  if (codeOf(e) !== "permission-denied") return null;
  const u = firebaseAuth().currentUser;
  if (!u || u.isAnonymous || !u.email)
    return "이 기기의 로그인이 교사 계정이 아니에요(익명 상태) — 로그아웃 후 교사 이메일로 다시 로그인해주세요.";
  return "권한이 거부됐어요 — Firebase 콘솔에 firestore.rules 최신 버전이 게시됐는지 확인해주세요.";
}

/** 알 수 없는 오류를 진단 가능한 한국어 메시지로 (원인 코드 병기 — 원격 진단용) */
function friendlyAuthError(e: unknown): Error {
  const code = codeOf(e);
  if (code === "auth/admin-restricted-operation" || code === "auth/operation-not-allowed")
    return new Error("익명 로그인 설정이 꺼져 있어요 — 선생님께 알려주세요. (Firebase 콘솔 > Authentication > 익명 사용 설정)");
  if (code === "auth/network-request-failed" || code === "unavailable")
    return new Error("인터넷 연결이 불안정해요 — 와이파이/LTE를 확인하고 다시 시도해주세요.");
  if (code === "resource-exhausted")
    return new Error("오늘 사용량 한도에 걸렸어요 — 선생님께 알려주세요. (resource-exhausted)");
  const msg = e instanceof Error ? e.message : String(e);
  return new Error(`로그인 중 문제가 생겼어요 (${code || msg})`);
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
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      throw friendlyAuthError(e);
    }
  }
  const uid = auth.currentUser?.uid ?? null;

  const ref = doc(db(), "studentAuth", String(studentId));
  const verify = await sha256(password);

  // 구버전 규칙 호환: 읽을 수 있으면 클라이언트에서 먼저 대조 (신규 규칙이면 읽기 거부 → 규칙 검증)
  let verifiedLocally = false;
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // 계정 최초 등록: 이 익명 uid에 바인딩 → 규칙이 타인의 덮어쓰기를 차단
      await setDoc(ref, { hash: verify, updatedAt: Date.now(), uid });
      return { firstTime: true };
    }
    if (snap.data().hash !== verify) throw new Error("비밀번호가 올바르지 않습니다.");
    verifiedLocally = true;
  } catch (e) {
    if (e instanceof Error && e.message === "비밀번호가 올바르지 않습니다.") throw e;
    if (codeOf(e) !== "permission-denied") throw friendlyAuthError(e);
    // 신규 규칙: 읽기 금지 — 아래 update에서 규칙이 비밀번호를 검증한다
  }

  // 로그인 확정 + 이 기기 uid로 바인딩 (verify가 틀리면 규칙이 거부)
  try {
    await updateDoc(ref, { verify, uid, updatedAt: Date.now() });
  } catch (e) {
    if (codeOf(e) === "not-found") {
      await setDoc(ref, { hash: verify, updatedAt: Date.now(), uid });
      return { firstTime: true };
    }
    if (codeOf(e) === "permission-denied") {
      // 이미 클라이언트 대조를 통과했다면(구버전 규칙) 다른 기기 바인딩 잔존일 뿐 —
      // 로그인은 유지 (신규 규칙 게시 후엔 재로그인만으로 자동 해결)
      if (verifiedLocally) return { firstTime: false };
      // 신규 규칙에서는 문서가 없어도 not-found 대신 permission-denied가 온다
      // (update 규칙이 resource 없이 평가 실패). 최초 등록을 create 규칙으로 재시도:
      //   문서 없음 → uid 바인딩 create 허용(최초 등록 성공)
      //   문서 있음 → create가 update로 취급되어 거부 → 비밀번호 오류가 맞다
      try {
        await setDoc(ref, { hash: verify, updatedAt: Date.now(), uid });
        return { firstTime: true };
      } catch {
        throw new Error("비밀번호가 올바르지 않습니다.");
      }
    }
    throw friendlyAuthError(e);
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
  const auth = firebaseAuth();
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser?.uid ?? null;
  const ref = doc(db(), "studentAuth", String(studentId));
  const verify = await sha256(oldPassword);
  const newHash = await sha256(newPassword);

  try {
    await updateDoc(ref, { verify, hash: newHash, updatedAt: Date.now(), uid });
  } catch (e) {
    if (codeOf(e) === "not-found") {
      await setDoc(ref, { hash: newHash, updatedAt: Date.now(), uid });
    } else if (codeOf(e) === "permission-denied") {
      // 신규 규칙: 문서가 없으면 update가 permission-denied로 떨어진다 → create로 재시도
      try {
        await setDoc(ref, { hash: newHash, updatedAt: Date.now(), uid });
      } catch {
        throw new Error("현재 비밀번호가 올바르지 않습니다.");
      }
    } else {
      throw e;
    }
  }
  if (hint !== undefined) await setStudentHintDoc(studentId, hint);
}

/** 힌트 저장 — 로그인 전에 보여줘야 해서 별도 컬렉션(studentHints) */
async function setStudentHintDoc(studentId: number, hint: string): Promise<void> {
  await setDoc(doc(db(), "studentHints", String(studentId)), {
    hint: hint.trim(),
    updatedAt: Date.now(),
  }).catch(() => {});
}

/** 학생 본인: 힌트만 변경 (비밀번호 확인 후) */
export async function setStudentHint(
  studentId: number,
  password: string,
  hint: string
): Promise<void> {
  const ref = doc(db(), "studentAuth", String(studentId));
  const verify = await sha256(password);
  const uid = firebaseAuth().currentUser?.uid ?? null;
  try {
    await updateDoc(ref, { verify, updatedAt: Date.now(), uid });
  } catch (e) {
    if (codeOf(e) === "permission-denied") throw new Error("비밀번호가 올바르지 않습니다.");
    throw e;
  }
  await setStudentHintDoc(studentId, hint);
}

/** 비밀번호 찾기 — 저장된 힌트를 조회 (없으면 null) */
export async function getStudentHint(studentId: number): Promise<string | null> {
  const auth = firebaseAuth();
  if (!auth.currentUser) await signInAnonymously(auth);
  // 신규: studentHints 컬렉션
  const snap = await getDoc(doc(db(), "studentHints", String(studentId)));
  if (snap.exists() && typeof snap.data().hint === "string") {
    return (snap.data().hint as string).trim() || null;
  }
  // 레거시: 구버전 규칙에서 studentAuth에 저장된 힌트 (신규 규칙이면 읽기 거부 → null)
  try {
    const old = await getDoc(doc(db(), "studentAuth", String(studentId)));
    const hint = old.exists() ? old.data().hint : null;
    return typeof hint === "string" && hint.trim() ? hint : null;
  } catch {
    return null;
  }
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
  await deleteDoc(doc(db(), "studentAuth", String(studentId)));
  await deleteDoc(doc(db(), "studentHints", String(studentId))).catch(() => {});
  await deleteDoc(doc(db(), "resetRequests", String(studentId))).catch(() => {});
}

/**
 * 교사: 전체 학생 비밀번호 일괄 초기화 + 새 비밀번호(4자리 숫자) 발급.
 * 발급 즉시 각 학생은 새 번호로만 로그인 가능. 기기 바인딩·힌트는 해제(로그인 시 재바인딩).
 * 반환된 목록은 저장되지 않으니(해시만 저장) 화면에서 인쇄/기록해야 한다.
 */
export async function issueAllPasswords(
  studentIds: number[]
): Promise<{ studentId: number; code: string }[]> {
  const { deleteField } = await import("firebase/firestore");
  // 서로 다른 4자리 코드 (중복 없음 — 친구 번호 추측 방지)
  const codes = new Set<string>();
  const rand = new Uint32Array(1);
  while (codes.size < studentIds.length) {
    crypto.getRandomValues(rand);
    codes.add(String(1000 + (rand[0] % 9000)));
  }
  const list = [...codes];
  const issued: { studentId: number; code: string }[] = [];
  for (let i = 0; i < studentIds.length; i++) {
    const sid = studentIds[i];
    const code = list[i];
    await setDoc(
      doc(db(), "studentAuth", String(sid)),
      {
        hash: await sha256(code),
        updatedAt: Date.now(),
        issuedAt: Date.now(),
        uid: deleteField(),
        hint: deleteField(),
        verify: deleteField(),
      },
      { merge: true }
    );
    await deleteDoc(doc(db(), "studentHints", String(sid))).catch(() => {});
    issued.push({ studentId: sid, code });
  }
  return issued;
}

export async function logout(): Promise<void> {
  await signOut(firebaseAuth()).catch(() => {});
}
