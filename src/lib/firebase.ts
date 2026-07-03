// Firebase 초기화 (프로젝트: nd-cf543 — 1학기 w-program과 완전 분리).
// 웹 config는 클라이언트 번들에 노출되는 공개 식별자라 커밋해도 안전하며,
// 실제 보안은 Firestore 규칙(firestore.rules)이 담당한다.
// 환경변수(NEXT_PUBLIC_FIREBASE_*)가 있으면 그 값이 우선한다.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

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

export function firebaseAuth(): Auth {
  return getAuth(getApp());
}

export function db(): Firestore {
  return getFirestore(getApp());
}
