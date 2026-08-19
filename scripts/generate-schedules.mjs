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
//
// 👻 가상 인물(GHOST) 방식 (2026-08-19, 전출로 24명이 되며 도입 — 사용자 확정):
//   위원이 20명(5모둠×4역할)이 아닐 때, 빈 슬롯을 '가상 인물'로 채워 라틴 방진 구조를
//   그대로 쓴다. 가상 인물이 배정된 모둠은 실제로는 한 명 적은 모둠이 되고,
//   그 모둠의 역할 하나가 공석이 된다. 가상 인물은 출력 JSON에서 빠진다.
//   제약: 가상 인물이 든 모둠(총원 4명)은 반드시 여2남2 (사용자 확정) — 하드 페널티.

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
// 전출 등 배치 제외 학생 (chairs.json의 excluded) — 학생 번호(id)는 그대로 두고 배치에서만 뺀다
const excluded = new Set(chairsFile.excluded ?? []);
for (const n of excluded)
  if (!names.includes(n)) throw new Error(`excluded에 없는 이름: ${n}`);
if ([...excluded].some((n) => Object.values(chairs).includes(n)))
  throw new Error("의장으로 지정된 학생은 excluded에 넣을 수 없습니다.");

const realMembers = names.filter((n) => !chairIds.has(idOf(n)) && !excluded.has(n)); // 실제 위원
// 👻 가상 인물로 20슬롯(5모둠×4역할)을 채운다 — 라틴 방진·어닐링 구조를 그대로 유지
const SLOTS = 20;
const GHOST = "__ghost__";
if (realMembers.length > SLOTS)
  throw new Error(`위원이 ${realMembers.length}명 — 슬롯(${SLOTS})을 넘습니다.`);
const ghostCount = SLOTS - realMembers.length;
const members = [...realMembers, ...Array.from({ length: ghostCount }, () => GHOST)];
const isGhost = (m) => members[m] === GHOST;
// 가상 인물은 id 0 — 페어·역할 통계에서 제외하는 표식
const memberId = (m) => (isGhost(m) ? 0 : idOf(members[m]));
const genderOfMember = (m) => (isGhost(m) ? null : genderMap[members[m]]);
console.log(
  `명단: 총 ${names.length - excluded.size}명 (의장 5 + 위원 ${realMembers.length})` +
  (excluded.size ? ` · 제외 ${[...excluded].join(",")}` : "") +
  (ghostCount ? ` · 👻 가상 인물 ${ghostCount}명 → ${5 - ghostCount}개 모둠은 5명, ${ghostCount}개 모둠은 4명` : "")
);

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
  for (let m = 0; m < SLOTS; m++) {
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
// G: 4명 모둠(가상 인물이 든 모둠)의 여2남2 위반 — 사용자 확정 제약이라 압도적 페널티
// H: 가상 인물이 같은 모둠에 연속으로 머무는 것(= 한 모둠만 계속 4명) 방지
// I: 4명이 되는 횟수가 특정 모둠에 쏠리는 것 방지 (모둠별 횟수 분산) — 공평성
// J: 5명 모둠도 성비 3:2를 지향 (4:1·5:0 방지) — '4명은 여2남2' 요구의 같은 취지.
//    총원 남12여12에서 4명 모둠이 2:2면 나머지는 모두 3:2로 떨어진다 (수학적으로 달성 가능)
const A = 10, B = 60, C = 25, D = 8, E = 4, G = 5000, H = 40, I = 120, J = 300;

function pairKey(a, b) { return a < b ? a * 100 + b : b * 100 + a; }

/** 한 기간의 배치를 모둠별로 펼친다 → [{ chairId, memberIdx[] }] */
function groupsOf(assign, p) {
  const gs = Array.from({ length: 5 }, (_, g) => ({ chairId: idOf(chairs[g + 1]), ms: [] }));
  for (let m = 0; m < SLOTS; m++) gs[assign[p][m].g].ms.push(m);
  return gs;
}

function cost(assign) {
  const pairCnt = new Map();
  let gender40 = 0, consecG = 0, consecR = 0, quadViolation = 0, ghostStay = 0;
  const quadPerGroup = [0, 0, 0, 0, 0]; // 모둠별 '4명이 된 횟수'
  const roleCnt = Array.from({ length: SLOTS }, () => [0, 0, 0, 0]);

  for (let p = 0; p < PERIODS; p++) {
    for (let m = 0; m < SLOTS; m++) {
      const { g, r } = assign[p][m];
      roleCnt[m][r]++;
      if (p > 0) {
        if (assign[p - 1][m].g === g) consecG++;
        if (assign[p - 1][m].r === r) consecR++;
        // 가상 인물이 지난 기간과 같은 모둠 → 같은 모둠이 연속 4명 (불공평)
        if (isGhost(m) && assign[p - 1][m].g === g) ghostStay++;
      }
    }
    for (const [gi, grp] of groupsOf(assign, p).entries()) {
      // 실제 인원만 (의장 + 가상 아닌 위원)
      const realIds = [grp.chairId, ...grp.ms.filter((m) => !isGhost(m)).map(memberId)];
      for (let i = 0; i < realIds.length; i++)
        for (let j = i + 1; j < realIds.length; j++) {
          const k = pairKey(realIds[i], realIds[j]);
          pairCnt.set(k, (pairCnt.get(k) ?? 0) + 1);
        }
      const hasGhost = grp.ms.some(isGhost);
      const memberGenders = grp.ms.filter((m) => !isGhost(m)).map(genderOfMember);
      if (hasGhost) {
        quadPerGroup[gi]++;
        // 총원 4명 모둠 → 의장 포함 여2남2 (사용자 확정)
        const all = [genderMap[names[grp.chairId - 1]], ...memberGenders];
        const male = all.filter((x) => x === "M").length;
        if (all.length === 4 && male !== 2) quadViolation++;
      } else {
        // 5명 모둠 — 의장 포함 성비가 3:2를 벗어나면(4:1, 5:0) 페널티
        const all = [genderMap[names[grp.chairId - 1]], ...memberGenders];
        const male = all.filter((x) => x === "M").length;
        const skew = Math.abs(male - (all.length - male));
        if (skew > 1) gender40 += skew - 1; // 4:1 → 1, 5:0 → 3
      }
    }
  }

  let pairSq = 0;
  for (const c of pairCnt.values()) pairSq += c * c;

  let roleStd = 0;
  for (let m = 0; m < SLOTS; m++) {
    if (isGhost(m)) continue; // 가상 인물의 역할 편차는 무의미
    const mean = PERIODS / 4;
    roleStd += Math.sqrt(roleCnt[m].reduce((s, c) => s + (c - mean) ** 2, 0) / 4);
  }

  // 4명 모둠이 특정 모둠에 쏠리지 않게 — 모둠별 횟수의 제곱합(분산 대용)
  let quadSpread = 0;
  if (ghostCount) {
    const mean = (PERIODS * ghostCount) / 5;
    for (const q of quadPerGroup) quadSpread += (q - mean) ** 2;
  }

  return A * pairSq + J * gender40 + C * consecG + D * consecR + E * roleStd
       + G * quadViolation + H * ghostStay + I * quadSpread;
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
  const m1 = Math.floor(rand() * SLOTS);
  let m2 = Math.floor(rand() * SLOTS);
  if (m1 === m2) m2 = (m2 + 1) % SLOTS;
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
  let gender40 = 0, consecG = 0, consecR = 0, quadViolation = 0;
  const quadGroups = {}; // 모둠별 '4명이 된 횟수'
  const roleCnt = Array.from({ length: SLOTS }, () => [0, 0, 0, 0]);
  for (let p = 0; p < PERIODS; p++) {
    for (let m = 0; m < SLOTS; m++) {
      const { g, r } = assign[p][m];
      roleCnt[m][r]++;
      if (p > 0) {
        if (assign[p - 1][m].g === g) consecG++;
        if (assign[p - 1][m].r === r) consecR++;
      }
    }
    for (const [gi, grp] of groupsOf(assign, p).entries()) {
      const realIds = [grp.chairId, ...grp.ms.filter((m) => !isGhost(m)).map(memberId)];
      for (let i = 0; i < realIds.length; i++)
        for (let j = i + 1; j < realIds.length; j++) {
          const k = pairKey(realIds[i], realIds[j]);
          pairCnt.set(k, (pairCnt.get(k) ?? 0) + 1);
        }
      const hasGhost = grp.ms.some(isGhost);
      const memberGenders = grp.ms.filter((m) => !isGhost(m)).map(genderOfMember);
      if (hasGhost) {
        quadGroups[gi + 1] = (quadGroups[gi + 1] ?? 0) + 1;
        const all = [genderMap[names[grp.chairId - 1]], ...memberGenders];
        if (all.length === 4 && all.filter((x) => x === "M").length !== 2) quadViolation++;
      } else {
        const all = [genderMap[names[grp.chairId - 1]], ...memberGenders];
        const male = all.filter((x) => x === "M").length;
        if (Math.abs(male - (all.length - male)) > 1) gender40++; // 5명 모둠 4:1 이상
      }
    }
  }
  const counts = [...pairCnt.values()];
  const dist = {};
  for (const c of counts) dist[c] = (dist[c] ?? 0) + 1;
  const nActive = names.length - excluded.size;
  const totalPairs = (nActive * (nActive - 1)) / 2;
  const neverMet = totalPairs - pairCnt.size;
  const gaps = [];
  for (let m = 0; m < SLOTS; m++)
    if (!isGhost(m)) gaps.push(Math.max(...roleCnt[m]) - Math.min(...roleCnt[m]));
  return {
    dist, neverMet, totalPairs, gender40, consecG, consecR, quadViolation, quadGroups,
    worstRoleGap: Math.max(...gaps), maxMeet: Math.max(...counts),
  };
}

const rep = report(bestAssign);
console.log("=== 어닐링 결과 ===");
console.log("cost:", Math.round(best), `(초기 대비)`);
console.log("만남 횟수 분포 {횟수: 쌍 수}:", rep.dist);
console.log("한 번도 안 만난 쌍:", rep.neverMet, "/", rep.totalPairs);
console.log("최다 만남:", rep.maxMeet, "회");
console.log("성비 쏠린 5명 모둠(4:1 이상):", rep.gender40, rep.gender40 === 0 ? "(모두 3:2 ✅)" : "");
console.log("같은 모둠 연속:", rep.consecG, "| 같은 역할 연속:", rep.consecR);
console.log("역할 횟수 최대 편차(학생별 max-min):", rep.worstRoleGap);
if (ghostCount) {
  console.log("👻 4명 모둠 여2남2 위반:", rep.quadViolation, rep.quadViolation === 0 ? "(제약 충족 ✅)" : "❌");
  console.log("👻 모둠별 4명이 된 횟수:", rep.quadGroups, `(총 ${PERIODS}기간)`);
}

// ── 검증: 각 기간이 유효한 배치인지 (모둠×역할 전단사) ──────────
for (let p = 0; p < PERIODS; p++) {
  const seen = new Set();
  for (let m = 0; m < SLOTS; m++) {
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
    for (let m = 0; m < SLOTS; m++) {
      const a = bestAssign[p][m];
      if (a.g === g && !isGhost(m)) // 👻 가상 인물은 출력하지 않는다 → 그 모둠은 한 명 적다
        groupMembers.push({ studentId: memberId(m), role: ROLES[a.r] });
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
      genderSkewedGroups: rep.gender40, // 5명 모둠 중 4:1 이상 (0 = 전부 3:2)
      sameGroupConsecutive: rep.consecG,
      sameRoleConsecutive: rep.consecR,
      quadGenderViolations: rep.quadViolation, // 4명 모둠 여2남2 위반 (0이어야 정상)
    },
    excluded: [...excluded],
    ghostSlots: ghostCount, // 가상 인물 수 = 4명이 되는 모둠 수(기간마다 1개)
  },
  weeks,
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "static", "schedules-21w.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("저장:", outPath);
