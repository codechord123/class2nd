// 21주 자리표 사전계산 (학기 시작 전 1회 실행):
//   node scripts/generate-schedules.mjs
// → data/static/schedules-21w.json 생성. 결과는 정적 파일로 커밋 — 앱은 DB 읽기 0회.
//
// 알고리즘 (인수인계 문서 §5.1):
//   1) 직교 라틴 방진으로 초기 배치 (역할 진화 + 모둠 점프)
//   2) 시뮬레이티드 어닐링으로 비용 최소화
//      cost = α·Σ pair² + β·성별 4:0 모둠 + γ·같은 모둠 연속 + δ·같은 역할 연속 + ε·역할 편차
// 자리는 2주마다 교체(요구사항) → 21주 = 11 로테이션(마지막 1주).
// 시드 고정 PRNG라 재실행해도 동일한 결과가 나온다.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 학급 구성 (src/lib/roster.ts와 동일해야 함) ──────────────────
const genderMap = {
  가동민: "M", 김선유: "M", 김수형: "M", 김예원: "F", 김용훈: "M",
  김원준: "M", 김주아: "F", 김찬우: "M", 김하영: "F", 문서우: "F",
  박찬: "M", 배한민: "M", 유선재: "F", 윤재익: "M", 이다인: "F",
  이서이: "F", 이서희: "F", 이채연: "F", 임유나: "F", 정지수: "M",
  조수아: "F", 조이환: "M", 최지완: "M", 한민종: "M", 홍아영: "F",
};
const names = Object.keys(genderMap);
const idOf = (name) => names.indexOf(name) + 1;

// 의장 5명 — 단일 출처: data/static/chairs.json (2학기 선출 후 그 파일 수정 → 재실행)
const chairsFile = JSON.parse(readFileSync(join(ROOT, "data", "static", "chairs.json"), "utf-8"));
const chairs = Object.fromEntries(
  Object.entries(chairsFile.chairs).map(([g, name]) => [Number(g), name])
);
if (chairsFile.provisional) {
  console.warn("⚠️ chairs.json이 아직 1학기 회장단 임시값입니다. 2학기 선출 후 갱신하세요.");
}
const chairIds = new Set(Object.values(chairs).map(idOf));
const members = names.filter((n) => !chairIds.has(idOf(n))); // 위원 20명

const ROLES = ["질서", "학습", "건강", "행정"];
const SEMESTER_START = "2026-08-17"; // 월요일
const TOTAL_WEEKS = 21;
const ROTATION_WEEKS = 2; // 자리 교체 주기
const PERIODS = Math.ceil(TOTAL_WEEKS / ROTATION_WEEKS); // 11

// ── 시드 고정 PRNG (재현 가능) ───────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260817);

// ── 초기 배치: 직교 라틴 방진 ────────────────────────────────────
// assign[p][m] = { g: 0..4, r: 0..3 }  (m = 위원 인덱스 0..19)
const jump = [1, 2, 3, 4]; // 초기 역할별 모둠 점프 폭
const assign = [];
for (let p = 0; p < PERIODS; p++) {
  const row = [];
  for (let m = 0; m < 20; m++) {
    const g0 = m % 5;
    const r0 = Math.floor(m / 5);
    const r = (r0 + p) % 4;
    const g = (g0 + jump[r0] * p) % 5;
    row.push({ g, r });
  }
  assign.push(row);
}

// ── 비용 함수 ────────────────────────────────────────────────────
// 제안 가중치(α10 β5 γ3 δ3 ε2)에서 성별쏠림·연속모둠을 강화해 튜닝
const A = 10, B = 60, C = 25, D = 8, E = 4;

function pairKey(a, b) { return a < b ? a * 100 + b : b * 100 + a; }

function cost(assign) {
  const pairCnt = new Map();
  let gender40 = 0, consecG = 0, consecR = 0;
  const roleCnt = Array.from({ length: 20 }, () => [0, 0, 0, 0]);

  for (let p = 0; p < PERIODS; p++) {
    // 모둠 구성원 수집 (의장 포함)
    const groupMembers = Array.from({ length: 5 }, (_, g) => [idOf(chairs[g + 1])]);
    for (let m = 0; m < 20; m++) {
      const { g, r } = assign[p][m];
      groupMembers[g].push(idOf(members[m]));
      roleCnt[m][r]++;
      if (p > 0) {
        if (assign[p - 1][m].g === g) consecG++;
        if (assign[p - 1][m].r === r) consecR++;
      }
    }
    for (let g = 0; g < 5; g++) {
      const ids = groupMembers[g];
      // 만남 페어 (의장 포함 5명 → 10쌍)
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = pairKey(ids[i], ids[j]);
          pairCnt.set(k, (pairCnt.get(k) ?? 0) + 1);
        }
      // 위원 4명 성별 쏠림
      const genders = ids.slice(1).map((id) => genderMap[names[id - 1]]);
      if (genders.every((x) => x === "M") || genders.every((x) => x === "F")) gender40++;
    }
  }

  let pairSq = 0;
  for (const c of pairCnt.values()) pairSq += c * c;

  let roleStd = 0;
  for (const cnts of roleCnt) {
    const mean = PERIODS / 4;
    roleStd += Math.sqrt(cnts.reduce((s, c) => s + (c - mean) ** 2, 0) / 4);
  }

  return A * pairSq + B * gender40 + C * consecG + D * consecR + E * roleStd;
}

// ── 시뮬레이티드 어닐링 ──────────────────────────────────────────
let cur = cost(assign);
let best = cur;
let bestAssign = structuredClone(assign);
const ITER = 500000;
const T0 = 1.0, T1 = 0.01;

for (let it = 0; it < ITER; it++) {
  const T = T0 * Math.pow(T1 / T0, it / ITER);
  // 무작위 기간에서 위원 2명의 (모둠,역할) swap
  const p = Math.floor(rand() * PERIODS);
  const m1 = Math.floor(rand() * 20);
  let m2 = Math.floor(rand() * 20);
  if (m1 === m2) m2 = (m2 + 1) % 20;
  [assign[p][m1], assign[p][m2]] = [assign[p][m2], assign[p][m1]];

  const next = cost(assign);
  const accept = next <= cur || rand() < Math.exp((cur - next) / (T * 50));
  if (accept) {
    cur = next;
    if (cur < best) {
      best = cur;
      bestAssign = structuredClone(assign);
    }
  } else {
    [assign[p][m1], assign[p][m2]] = [assign[p][m2], assign[p][m1]]; // 원복
  }
}

// ── 검증 리포트 ──────────────────────────────────────────────────
function report(assign) {
  const pairCnt = new Map();
  let gender40 = 0, consecG = 0, consecR = 0;
  const roleCnt = Array.from({ length: 20 }, () => [0, 0, 0, 0]);
  for (let p = 0; p < PERIODS; p++) {
    const groupMembers = Array.from({ length: 5 }, (_, g) => [idOf(chairs[g + 1])]);
    for (let m = 0; m < 20; m++) {
      const { g, r } = assign[p][m];
      groupMembers[g].push(idOf(members[m]));
      roleCnt[m][r]++;
      if (p > 0) {
        if (assign[p - 1][m].g === g) consecG++;
        if (assign[p - 1][m].r === r) consecR++;
      }
    }
    for (let g = 0; g < 5; g++) {
      const ids = groupMembers[g];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = pairKey(ids[i], ids[j]);
          pairCnt.set(k, (pairCnt.get(k) ?? 0) + 1);
        }
      const genders = ids.slice(1).map((id) => genderMap[names[id - 1]]);
      if (genders.every((x) => x === "M") || genders.every((x) => x === "F")) gender40++;
    }
  }
  const counts = [...pairCnt.values()];
  const dist = {};
  for (const c of counts) dist[c] = (dist[c] ?? 0) + 1;
  const totalPairs = (25 * 24) / 2;
  const neverMet = totalPairs - pairCnt.size;
  const roleMinMax = roleCnt.map((c) => [Math.min(...c), Math.max(...c)]);
  const worstRoleGap = Math.max(...roleMinMax.map(([lo, hi]) => hi - lo));
  return { dist, neverMet, gender40, consecG, consecR, worstRoleGap, maxMeet: Math.max(...counts) };
}

const rep = report(bestAssign);
console.log("=== 어닐링 결과 ===");
console.log("cost:", Math.round(best), `(초기 대비)`);
console.log("만남 횟수 분포 {횟수: 쌍 수}:", rep.dist);
console.log("한 번도 안 만난 쌍:", rep.neverMet, "/ 300");
console.log("최다 만남:", rep.maxMeet, "회");
console.log("성별 4:0 모둠(기간×모둠 중):", rep.gender40);
console.log("같은 모둠 연속:", rep.consecG, "| 같은 역할 연속:", rep.consecR);
console.log("역할 횟수 최대 편차(학생별 max-min):", rep.worstRoleGap);

// ── 검증: 각 기간이 유효한 배치인지 (모둠×역할 전단사) ──────────
for (let p = 0; p < PERIODS; p++) {
  const seen = new Set();
  for (let m = 0; m < 20; m++) {
    const { g, r } = bestAssign[p][m];
    const key = g * 10 + r;
    if (seen.has(key)) throw new Error(`기간 ${p + 1}: (모둠${g + 1},${ROLES[r]}) 중복!`);
    seen.add(key);
  }
}
console.log("배치 유효성: OK (모든 기간 모둠×역할 전단사)");

// ── JSON 출력 (주차 단위 21개 — 같은 기간은 동일 배치) ──────────
function weekStartOf(week) {
  // UTC 기준 날짜 연산 — 시간대에 따른 하루 밀림 방지
  const d = new Date(SEMESTER_START + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7);
  return d.toISOString().slice(0, 10);
}

const weeks = [];
for (let w = 1; w <= TOTAL_WEEKS; w++) {
  const p = Math.min(Math.floor((w - 1) / ROTATION_WEEKS), PERIODS - 1);
  const groups = [];
  for (let g = 0; g < 5; g++) {
    const groupMembers = [];
    for (let m = 0; m < 20; m++) {
      const a = bestAssign[p][m];
      if (a.g === g) groupMembers.push({ studentId: idOf(members[m]), role: ROLES[a.r] });
    }
    groupMembers.sort((x, y) => ROLES.indexOf(x.role) - ROLES.indexOf(y.role));
    groups.push({ groupId: g + 1, chair: idOf(chairs[g + 1]), members: groupMembers });
  }
  weeks.push({ week: w, weekStart: weekStartOf(w), period: p + 1, groups });
}

const out = {
  meta: {
    note: "21주 자리표 사전계산 결과 (시뮬레이티드 어닐링). 정적 파일 — 앱은 DB 읽기 0회. 재생성: node scripts/generate-schedules.mjs",
    semesterStart: SEMESTER_START,
    totalWeeks: TOTAL_WEEKS,
    rotationWeeks: ROTATION_WEEKS,
    periods: PERIODS,
    seed: 20260817,
    quality: {
      neverMetPairs: rep.neverMet,
      maxMeetCount: rep.maxMeet,
      gender40Groups: rep.gender40,
      sameGroupConsecutive: rep.consecG,
      sameRoleConsecutive: rep.consecR,
    },
  },
  weeks,
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "static", "schedules-21w.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("저장:", outPath);
