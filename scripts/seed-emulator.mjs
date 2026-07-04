// 로컬 에뮬레이터 시드 — 디자인 프리뷰용 샘플 데이터 (실서버에 절대 닿지 않음).
// 사용: npx firebase-tools emulators:start --only auth,firestore --project nd-cf543 실행 후
//       node scripts/seed-emulator.mjs
// 교사 계정: 규칙(isTeacher)의 이메일 + 에뮬레이터 전용 더미 비밀번호(실제 비밀번호 아님).
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from "firebase/firestore";

const app = initializeApp({ apiKey: "fake-api-key", projectId: "nd-cf543" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

const TEACHER_EMAIL = "whata2mazing1@gmail.com"; // firestore.rules와 동일 (공개 식별자)
const TEACHER_PW = "emulator-only-password";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const now = Date.now();
const H = 3600000;
const ids = Array.from({ length: 25 }, (_, i) => i + 1);

// ── 로그인 (에뮬레이터에 교사 생성) ──────────────────────────────
try {
  await createUserWithEmailAndPassword(auth, TEACHER_EMAIL, TEACHER_PW);
} catch {
  await signInWithEmailAndPassword(auth, TEACHER_EMAIL, TEACHER_PW);
}

// ── 설정·배너·순위 ───────────────────────────────────────────────
await setDoc(doc(db, "classData", "settings"), {
  peerScale: [-1, 0, 1],
  groupScale: [0, 1, 2],
  rankPoints: [5, 4, 3, 2, 1],
  weeklyReadingQuota: 3,
  seatChangeCost: 1,
  requestOpenHour: 16,
  requestCloseHour: 24,
  readingGoal: 1250,
  readingCharLimit: 700,
});
await setDoc(doc(db, "classData", "banner"), {
  title: "🍜 짜파게티 파티까지 달린다!",
  sub: "🐢 거북이 독서 최종 미션",
  active: true,
});
await setDoc(doc(db, "classData", "bestGroups"), {
  [today]: { groupId: 3, chairId: 11, ranking: [3, 1, 5, 2, 4] },
});

// ── 오늘 평가 원본 + 집계 결과 ──────────────────────────────────
const compliments = [
  { from: 2, to: 1, text: "발표할 때 목소리가 또렷해서 좋았어!" },
  { from: 1, to: 3, text: "어려운 문제를 같이 고민해줘서 고마워" },
  { from: 3, to: 4, text: "청소를 끝까지 열심히 해줬어" },
  { from: 4, to: 2, text: "준비물을 빌려줘서 고마웠어" },
  { from: 5, to: 6, text: "모둠 활동에서 아이디어를 많이 냈어" },
  { from: 7, to: 8, text: "웃으면서 인사해줘서 기분이 좋았어" },
];
const peerSuggestions = [{ from: 2, to: 5, text: "목소리를 조금만 줄여주면 좋겠어" }];
const toTeacher = [
  { from: 4, text: "체육 시간이 더 있었으면 좋겠어요" },
  { from: 9, text: "보드게임 시간을 만들어주세요" },
];
for (const me of ids.slice(0, 18)) {
  const targets = ids.filter((t) => Math.ceil(t / 5) === Math.ceil(me / 5) && t !== me);
  const entry = { _mvp: targets[0] ?? 0 };
  for (const t of targets) entry[t] = [0, 1, 1, -1][t % 4] ?? 0;
  await setDoc(doc(db, "evaluations", today, "entries", String(me)), entry);
}

const rows = {};
const cum = {};
const mvpWins = {};
for (const sid of ids) {
  const peer = ((sid * 7) % 5) - 1;
  const rankIdx = [3, 1, 5, 2, 4].indexOf(Math.ceil(sid / 5));
  const groupRank = [6, 4, 3, 2, 1][rankIdx] ?? 0;
  const mission = Math.ceil(sid / 5) === 3 ? 1 : 0;
  const mvp = sid % 5 === 1 ? 1 : 0;
  const read = sid % 4 === 0 ? 1 : 0;
  const total = peer + groupRank + mission + mvp + read;
  rows[sid] = { peer, groupRank, bonus: 0, mission, mvp, read, total };
  cum[sid] = total + 20 + ((sid * 3) % 15);
  if (mvp) mvpWins[sid] = 1 + (sid % 3);
}
await setDoc(doc(db, "dailyScores", today), {
  ...rows,
  _meta: {
    aggregatedAt: now,
    ranks: { 3: 1, 1: 2, 5: 3, 2: 4, 4: 5 },
    mvpVotes: { 1: 3, 6: 2, 11: 4, 16: 2, 21: 3 },
    mvpWinners: [1, 6, 11, 16, 21],
    missionGroups: [3],
    compliments,
    peerSuggestions,
    toTeacher,
  },
});
await setDoc(doc(db, "dailyScores", "_cumulative"), { ...cum, mvpWins });
await setDoc(doc(db, "complimentCoverage", today), { 2: 1, 1: 3, 3: 4, 4: 2, 5: 6, 7: 8 });

// ── 독서: 감상문 + 통계 ─────────────────────────────────────────
const books = [
  { t: "마당을 나온 암탉", a: "황선미", p: "사계절", g: "동화", sid: 1, c: 2 },
  { t: "푸른 사자 와니니", a: "이현", p: "창비", g: "동화", sid: 4, c: 1 },
  { t: "샬롯의 거미줄", a: "E.B. 화이트", p: "시공주니어", g: "소설", sid: 8, c: 0 },
  { t: "정재승의 과학 콘서트", a: "정재승", p: "어크로스", g: "과학", sid: 12, c: 3 },
  { t: "장영실, 시대를 앞서간 발명가", a: "김연희", p: "비룡소", g: "인물", sid: 16, c: 0 },
  { t: "만복이네 떡집", a: "김리리", p: "비룡소", g: "동화", sid: 20, c: 1 },
  { t: "어린이 삼국유사", a: "일연 원작", p: "웅진주니어", g: "역사", sid: 3, c: 0 },
  { t: "긴긴밤", a: "루리", p: "문학동네", g: "소설", sid: 7, c: 2 },
  { t: "수학 유령의 미스터리", a: "김성수", p: "글송이", g: "지식·정보", sid: 11, c: 0 },
  { t: "시가 말을 걸어요", a: "정끝별", p: "토토북", g: "시", sid: 15, c: 1 },
];
let bi = 0;
for (const b of books) {
  bi++;
  await setDoc(doc(db, "readingReports", `seed-${bi}`), {
    studentId: b.sid,
    title: b.t,
    author: b.a,
    publisher: b.p,
    summary:
      "주인공이 어려움을 만나지만 포기하지 않고 친구들과 함께 문제를 해결해 나가는 이야기예요. 마지막 장면에서 주인공이 성장한 모습이 인상 깊었어요.",
    scene: "주인공이 처음으로 용기를 내서 친구를 도와주는 장면이 가장 기억에 남아요.",
    quote: "진짜 용기는 무서워도 한 걸음 내딛는 거야.",
    thoughts:
      "나라면 어떻게 했을까 생각해 봤어요. 나도 주인공처럼 힘든 일이 있어도 포기하지 않고 도전하고 싶어요. 친구들과 함께라면 더 잘할 수 있을 것 같아요.",
    isDraft: false,
    isPrivate: bi === 9,
    tags: [b.g],
    week: 1,
    createdAt: now - bi * 5 * H,
    comments: Array.from({ length: b.c }, (_, i) => ({
      id: now - i,
      studentId: ((b.sid + i) % 25) + 1,
      text: ["와 나도 이 책 읽어봐야겠다!", "감상문 진짜 잘 썼다 👍", "주인공 최고야"][i % 3],
      createdAt: now - i * H,
    })),
  });
}
const total = {};
const byWeek1 = {};
for (const b of books) {
  total[b.sid] = (total[b.sid] ?? 0) + 1;
  byWeek1[b.sid] = (byWeek1[b.sid] ?? 0) + 1;
}
total[12] = 4;
byWeek1[12] = 4;
await setDoc(doc(db, "readingStats", "main"), { total, byWeek: { 1: byWeek1 } });

// ── 건의 게시판 ─────────────────────────────────────────────────
const sugs = [
  {
    title: "말차례 경청을 지켜주세요!",
    content: "제가 말차례 경청 지킴이인데 떠드는 친구들이 계속 있어요. 다 같이 약속을 지켜주면 좋겠습니다.",
    sid: 10, ann: true, st: "논의중", ag: 8, dg: 1,
    cs: [
      { sid: 3, text: "맞아요, 저도 잘 안 들릴 때가 있어요" },
      { sid: 7, text: "우리 모둠부터 잘 지킬게!" },
    ],
  },
  {
    title: "사물함 정리 규칙을 정하자",
    content: "사물함 위에 물건이 쌓여서 자꾸 떨어져요. 각자 자기 칸만 쓰기로 규칙을 정하면 좋겠어요.",
    sid: 5, st: "채택", law: true, ag: 12, dg: 0,
    cs: [{ sid: 1, text: "찬성! 지난주에 물통 떨어질 뻔했어" }],
  },
  {
    title: "급식 기준이 궁금해요",
    content: "경고를 주는 기준이 친구마다 다른 것 같아요. 기준을 정확히 정해서 공지해 주세요.",
    sid: 14, st: "논의중", ag: 5, dg: 2, cs: [],
  },
  {
    title: "보드게임 시간을 만들어요",
    content: "금요일 마지막 시간에 다 같이 보드게임을 하면 좋겠습니다. 학급비로 게임을 사면 어떨까요?",
    sid: 21, st: "보류", ag: 15, dg: 3,
    cs: [
      { sid: 9, text: "루미큐브 사자!" },
      { sid: 2, text: "할리갈리도 좋아" },
      { sid: 17, text: "공부 시간 줄어드는 건 싫은데…" },
    ],
  },
];
let si = 0;
for (const s of sugs) {
  si++;
  const agree = {};
  const disagree = {};
  for (let i = 1; i <= s.ag; i++) agree[i] = true;
  for (let i = 20; i < 20 + s.dg; i++) disagree[i] = true;
  await setDoc(doc(db, "suggestions", `seed-${si}`), {
    studentId: s.sid,
    title: s.title,
    content: s.content,
    isAnonymous: si === 3,
    isAnnouncement: Boolean(s.ann),
    status: s.st,
    enactedAsLaw: Boolean(s.law),
    agree,
    disagree,
    createdAt: now - si * 9 * H,
    comments: s.cs.map((c, i) => ({ id: now - si * 100 - i, studentId: c.sid, text: c.text, createdAt: now - i * H })),
  });
}

// ── 투표 ────────────────────────────────────────────────────────
await setDoc(doc(db, "polls", "seed-1"), {
  title: "학급 파티 날 뭐 할까?",
  desc: "2학기 첫 파티! 하고 싶은 걸 골라줘 (복수 선택)",
  options: ["보드게임", "영화 보기", "쿠킹 클래스", "운동장 놀이"],
  votes: Object.fromEntries(ids.slice(0, 17).map((i) => [i, [i % 4, (i + 1) % 4].slice(0, (i % 2) + 1)])),
  multi: true,
  anonymous: false,
  createdBy: 6,
  createdAt: now - 2 * H,
});
await setDoc(doc(db, "polls", "seed-2"), {
  title: "자리 바꾸는 주기, 어떻게 할까?",
  options: ["2주마다 (지금처럼)", "한 달마다", "선생님이 정하기"],
  votes: Object.fromEntries(ids.slice(0, 22).map((i) => [i, [i % 3]])),
  anonymous: true,
  closed: true,
  createdBy: "teacher",
  createdAt: now - 30 * H,
});

// ── 지갑 ────────────────────────────────────────────────────────
await setDoc(
  doc(db, "coinTxns", "0_balances"),
  Object.fromEntries(ids.map((i) => [i, (i * 2) % 7]))
);
await setDoc(doc(db, "coinTxns", "seed-1"), {
  studentId: 1, amount: 2, item: "세션 보상 (1기)", type: "mvp", status: "approved", createdAt: now - 5 * H,
});
await setDoc(doc(db, "coinTxns", "seed-2"), {
  studentId: 1, amount: -1, item: "간식 교환권", type: "spend", status: "pending", createdAt: now - H,
});
await setDoc(doc(db, "s1Spends", "0_balances"), {});
await setDoc(doc(db, "classData", "shopMenu"), {
  items: [
    { id: "m1", name: "간식 교환권", price: 3, wallet: "silver", note: "금요일에 사용 가능" },
    { id: "m2", name: "자리 하루 자유석", price: 2, wallet: "silver" },
    { id: "m3", name: "학급 영화 시간", price: 5, wallet: "gold", note: "학급 회의로 결정" },
  ],
});

console.log("✅ seed complete:", today);
process.exit(0);
