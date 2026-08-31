// 🪑 빈자리 채우기 — 전출로 비워둔 자리(가상 인물 슬롯)에 전입생을 넣는다.
//   사용: node scripts/fill-vacancy.mjs <학생번호>
//   예)  node scripts/fill-vacancy.mjs 24     ← 전출 학생 번호를 승계한 전입생
//
// 왜 재생성이 아니라 '보정'인가: generate-schedules.mjs를 다시 돌리면 어닐링이 새로
// 계산돼 25명 전원의 자리가 바뀐다. 학기 중에 그러면 아이들이 혼란스럽다.
// 이 스크립트는 다른 학생 배치를 한 칸도 건드리지 않고, 매 기간의 '비어 있는 역할'에만
// 지정한 번호를 넣는다. (전입생은 전출 학생 번호를 승계하는 앱 규칙과 맞물린다)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sid = Number(process.argv[2]);
if (!Number.isInteger(sid) || sid < 1 || sid > 25) {
  console.error("사용법: node scripts/fill-vacancy.mjs <학생번호 1~25>");
  process.exit(1);
}

const ROLES = ["질서", "학습", "건강", "행정"];
const path = join(ROOT, "data", "static", "schedules-21w.json");
const data = JSON.parse(readFileSync(path, "utf-8"));

let filled = 0;
const already = [];
for (const w of data.weeks) {
  const present = new Set();
  for (const g of w.groups) {
    present.add(g.chair);
    for (const m of g.members) present.add(m.studentId);
  }
  if (present.has(sid)) {
    already.push(w.week);
    continue;
  }
  // 이 주의 '빈자리' = 위원이 4명 미만인 모둠 + 그 모둠에서 안 쓰인 역할
  const short = w.groups.find((g) => g.members.length < ROLES.length);
  if (!short) {
    console.error(`⚠️ ${w.week}주차에 빈자리가 없습니다 (이미 전원 배치).`);
    continue;
  }
  const used = new Set(short.members.map((m) => m.role));
  const role = ROLES.find((r) => !used.has(r));
  short.members.push({ studentId: sid, role });
  short.members.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  filled++;
}

// ── 검증: 모든 주차가 유효한 배치인지 ───────────────────────────
const names = JSON.parse(readFileSync(join(ROOT, "data", "static", "chairs.json"), "utf-8"));
void names;
let bad = 0;
for (const w of data.weeks) {
  const ids = [];
  for (const g of w.groups) {
    ids.push(g.chair, ...g.members.map((m) => m.studentId));
    const roles = g.members.map((m) => m.role);
    if (new Set(roles).size !== roles.length) {
      console.error(`❌ ${w.week}주차 ${g.groupId}모둠 역할 중복`);
      bad++;
    }
  }
  if (new Set(ids).size !== ids.length) {
    console.error(`❌ ${w.week}주차 중복 배치`);
    bad++;
  }
}
if (bad) process.exit(1);

data.meta.ghostSlots = Math.max(0, (data.meta.ghostSlots ?? 0) - 1);
data.meta.filledVacancy = [...(data.meta.filledVacancy ?? []), { studentId: sid, at: new Date().toISOString().slice(0, 10) }];
if (Array.isArray(data.meta.excluded)) data.meta.excludedNote = "전출 번호를 전입생이 승계해 자리를 다시 채움";
writeFileSync(path, JSON.stringify(data, null, 2));

const total = new Set();
for (const g of data.weeks[0].groups) {
  total.add(g.chair);
  for (const m of g.members) total.add(m.studentId);
}
console.log(`✅ ${sid}번을 빈자리에 채웠습니다 — ${filled}개 주차 배치` + (already.length ? ` (이미 있던 주차 ${already.length}개는 건너뜀)` : ""));
console.log(`   1주차 인원: ${total.size}명 · 배치 유효성: OK`);
