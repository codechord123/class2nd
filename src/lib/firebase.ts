// Firebase 초기화 (프로젝트: nd-cf543 — 1학기 w-program과 완전 분리).
// 웹 config는 클라이언트 번들에 노출되는 공개 식별자라 커밋해도 안전하며,
// 실제 보안은 Firestore 규칙(firestore.rules)이 담당한다.
// 환경변수(NEXT_PUBLIC_FIREBASE_*)가 있으면 그 값이 우선한다.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCgNcebghb1SZK_7UjgnuwF20_p2TxSHXI",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "nd-cf543.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "nd-cf543",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "nd-cf543.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "298603555820",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:298603555820:web:81b697fd77943f4fe46ec9",
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;

function getApp(): FirebaseApp {
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
  }
  return app;
}

// 로컬 디자인 프리뷰·개발용 — NEXT_PUBLIC_FIREBASE_EMULATOR=1로 빌드하면
// 실서버 대신 로컬 에뮬레이터(auth 9099 / firestore 8080)에 붙는다.
// 프로덕션 빌드(Vercel)에는 이 env가 없으므로 영향 없음.
const useEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
let authEmuConnected = false;
let fsEmuConnected = false;

export function firebaseAuth(): Auth {
  const auth = getAuth(getApp());
  if (useEmulator && !authEmuConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    authEmuConnected = true;
  }
  return auth;
}

export function db(): Firestore {
  const fs = getFirestore(getApp());
  if (useEmulator && !fsEmuConnected) {
    connectFirestoreEmulator(fs, "127.0.0.1", 8080);
    fsEmuConnected = true;
  }
  return fs;
}
