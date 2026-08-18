"use client";
// 📚 우리 반 헌법·법률 학습지 + 시험지 생성 (교사 인쇄 도구) — 사용자 요청 2026-08-18.
// classData/constitution(이미 캐시된 1문서)만 사용 — 추가 읽기 0.
// 시험 문제는 시드 셔플로 자동 출제 (세트 번호를 바꾸면 다른 조합) + 마지막 장 정답지.
import { esc, brandHeader } from "@/lib/exportDoc";
import type { Constitution } from "@/lib/query/classMeta";
import { ROLE_INFO } from "@/lib/roster";

// ── 시드 셔플 (mulberry32) — 같은 세트 번호면 항상 같은 문제지/정답지 ──────
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 부서명 목록 (의장 제외 — 법률은 4개 부서 + 의장 소관으로 쓰일 수 있어 전체 유지)
const DEPTS = ROLE_INFO.map((x) => x.dept);
const deptEmoji = (dept: string) => ROLE_INFO.find((x) => x.dept === dept)?.emoji ?? "📜";

/** 부서별 법률 평탄화: [부서, 조항] 목록 (미분류 legacy laws는 '우리 반 공통') */
function flatLaws(c: Constitution): { dept: string; text: string }[] {
  const out: { dept: string; text: string }[] = [];
  for (const dept of Object.keys(c.lawsByDept ?? {}))
    for (const t of c.lawsByDept![dept] ?? []) if (t.trim()) out.push({ dept, text: t.trim() });
  for (const t of c.laws ?? []) if (t.trim()) out.push({ dept: "우리 반 공통", text: t.trim() });
  return out;
}

/** 조항에서 빈칸으로 뚫을 핵심 단어 선택 — 가장 긴 어절 (2자 미만·숫자 제외) */
function pickBlank(text: string, r: () => number): { blanked: string; answer: string } | null {
  const tokens = text.split(/\s+/).filter((t) => t.replace(/[^가-힣a-zA-Z]/g, "").length >= 2);
  if (!tokens.length) return null;
  const maxLen = Math.max(...tokens.map((t) => t.length));
  const candidates = tokens.filter((t) => t.length === maxLen);
  const answer = candidates[Math.floor(r() * candidates.length)];
  // 첫 등장 어절만 빈칸으로 (같은 단어 반복 시 전부 뚫리는 것 방지)
  const blanked = text.replace(answer, `<span class="blank">${"&nbsp;".repeat(Math.min(answer.length * 3, 14))}</span>`);
  return { blanked, answer };
}

const nameBox = `<div class="namebox"><span>5학년 ____반</span><span>이름: ______________</span></div>`;
const EXTRA_CSS = `<style>
  .namebox { display:flex; justify-content:flex-end; gap:18px; font-size:13px; font-weight:700;
             color:#333d4b; margin:-6px 0 12px; }
  .blank { display:inline-block; min-width:52px; border-bottom:2px solid #191f28; }
  .writeline { border-bottom:1.5px dashed #c9cdd2; height:26px; margin-top:8px; }
  .chk { color:#8b95a1; font-size:12px; }
  .art { display:flex; gap:8px; align-items:flex-start; margin:5px 0; line-height:1.65; font-size:13px; }
  .art .no { flex:none; font-weight:800; color:#2272eb; font-size:12.5px; padding-top:1px; }
  .q { margin:7px 0; line-height:1.7; font-size:13px; }
  .q .qno { font-weight:800; color:#191f28; margin-right:4px; }
  .ox { float:right; font-weight:700; color:#8b95a1; white-space:nowrap; margin-left:8px; }
  .bank { border:1.5px solid #b7d3fa; background:#f3f8ff; border-radius:10px; padding:8px 12px;
          font-size:12.5px; margin:6px 0 10px; line-height:1.9; }
  .bank b { color:#2272eb; margin-right:6px; }
  .bank span { display:inline-block; border:1px solid #d9e5f5; background:#fff; border-radius:6px;
               padding:1px 9px; margin:0 4px 2px 0; font-weight:600; }
  .match { display:grid; grid-template-columns:1fr auto; gap:4px 26px; align-items:center;
           font-size:13px; margin-top:6px; }
  .match .l { line-height:1.55; padding:3px 0; }
  .match .r { font-weight:700; padding:3px 10px; border:1px solid #e5e8eb; border-radius:8px; }
  .match .dot { color:#3182f6; font-weight:800; margin-left:6px; }
  .score { float:right; border:1.5px solid #e5e8eb; border-radius:10px; padding:4px 14px;
           font-size:12px; color:#6b7684; font-weight:700; }
  .anskey { page-break-before:always; }
  .cutline { border-top:2px dashed #c9cdd2; margin:10px 0 12px; position:relative; }
  .cutline::after { content:"✂️ 정답지 — 학생용에서 잘라내세요"; position:absolute; top:-9px; left:12px;
                    background:#fff; padding:0 8px; font-size:11px; color:#8b95a1; }
  .ansline { font-size:12.5px; line-height:1.9; margin:3px 0; }
  .ansline b { color:#2272eb; }
</style>`;

// ══════════════════════ ① 학습지 ══════════════════════
export function buildStudySheet(c: Constitution): string {
  const laws = flatLaws(c);
  const byDept = new Map<string, string[]>();
  for (const l of laws) byDept.set(l.dept, [...(byDept.get(l.dept) ?? []), l.text]);

  const artHtml = (c.articles ?? []).filter((a) => a.trim()).map((a, i) =>
    `<div class="art"><span class="no">제${i + 1}조</span><span>${esc(a)}</span><span class="chk" style="margin-left:auto">☐ 소리내어 읽기</span></div>`
  ).join("");

  const deptCards = [...byDept.entries()].map(([dept, items]) =>
    `<div class="card"><p class="t">${deptEmoji(dept)} ${esc(dept)} 법률</p>${
      items.map((t, i) => `<div class="art"><span class="no">${i + 1}</span><span>${esc(t)}</span></div>`).join("")
    }</div>`
  ).join("");

  return EXTRA_CSS + brandHeader("우리 반 헌법·법률 공부", "2학기 학급 자치 · 학습지") + nameBox +
    `<div class="card"><p class="t">📜 우리 반 헌법</p>${artHtml || '<p class="q">아직 헌법이 없어요.</p>'}</div>` +
    deptCards +
    `<div class="card"><p class="t">✍️ 활동 1 — 따라 쓰기</p>
      <p class="q">헌법 중에서 <b>가장 마음에 남는 조항</b>을 골라 또박또박 따라 써 보세요.</p>
      <div class="writeline"></div><div class="writeline"></div></div>
     <div class="card"><p class="t">⭐ 활동 2 — 내가 뽑은 최고의 법률</p>
      <p class="q">법률 중 하나를 골라 쓰고, 왜 중요한지 이유를 쓰세요.</p>
      <div class="writeline"></div><div class="writeline"></div><div class="writeline"></div></div>
     <div class="card"><p class="t">💡 활동 3 — 새 법률 제안</p>
      <p class="q">우리 반에 <b>새로 필요한 법률</b>을 하나 만들어 보세요. (좋은 제안은 투표·건의 탭에 올려요!)</p>
      <div class="writeline"></div><div class="writeline"></div></div>`;
}

// ══════════════════════ ② 시험지 (+정답지) ══════════════════════
export function buildQuizSheet(c: Constitution, setNo: number, withAnswers: boolean): string {
  const r = rng(20260818 + setNo * 7919);
  const articles = (c.articles ?? []).filter((a) => a.trim());
  const laws = flatLaws(c);
  const deptLaws = laws.filter((l) => l.dept !== "우리 반 공통");
  const answers: string[] = [];
  let html = EXTRA_CSS + brandHeader("우리 반 헌법·법률 시험", `2학기 학급 자치 · 시험지 (세트 ${setNo})`) +
    `<div class="score">점수: &nbsp;&nbsp;&nbsp;&nbsp; / 100</div>` + nameBox;

  // 1️⃣ 빈칸 채우기 (헌법 최대 5) — 보기 상자 제공
  const fillArts = shuffle(articles.map((a, i) => ({ a, i })), r).slice(0, 5);
  const fills = fillArts
    .map(({ a, i }) => ({ i, blank: pickBlank(a, r) }))
    .filter((x): x is { i: number; blank: { blanked: string; answer: string } } => !!x.blank);
  if (fills.length) {
    const bank = shuffle(fills.map((f) => f.blank.answer), r);
    html += `<div class="card"><p class="t">1. 빈칸 채우기 — 헌법 (문항당 8점)</p>
      <div class="bank"><b>보기</b>${bank.map((w) => `<span>${esc(w)}</span>`).join("")}</div>` +
      fills.map((f, n) => `<div class="q"><span class="qno">1-${n + 1}.</span> [제${f.i + 1}조] ${f.blank.blanked}</div>`).join("") +
      `</div>`;
    answers.push(`<div class="ansline"><b>1. 빈칸</b> — ${fills.map((f, n) => `1-${n + 1}: ${esc(f.blank.answer)}`).join(" · ")}</div>`);
  }

  // 2️⃣ O/X — 이 법률은 이 부서의 법률일까? (최대 6, 절반은 다른 부서로 바꿔치기)
  const oxPool = shuffle(deptLaws, r).slice(0, 6);
  if (oxPool.length >= 2) {
    const oxItems = oxPool.map((l, idx) => {
      const wrong = idx % 2 === 1; // 홀수 번째는 오답 문장
      const shownDept = wrong
        ? shuffle(DEPTS.filter((d) => d !== l.dept), r)[0]
        : l.dept;
      return { ...l, shownDept, isO: !wrong };
    });
    html += `<div class="card"><p class="t">2. O, X 퀴즈 — 어느 부서의 법률일까? (문항당 5점)</p>` +
      oxItems.map((q, n) =>
        `<div class="q"><span class="qno">2-${n + 1}.</span> “${esc(q.text)}” — 이것은 <b>${esc(q.shownDept)}</b>의 법률이다. <span class="ox">( O / X )</span></div>`
      ).join("") + `</div>`;
    answers.push(`<div class="ansline"><b>2. O/X</b> — ${oxItems.map((q, n) => `2-${n + 1}: ${q.isO ? "O" : `X (정답: ${esc(q.dept)})`}`).join(" · ")}</div>`);
  }

  // 3️⃣ 연결하기 — 법률 ↔ 부서 (부서당 1개, 최대 5)
  const seen = new Set<string>();
  const matchItems = shuffle(deptLaws, r).filter((l) => !seen.has(l.dept) && seen.add(l.dept)).slice(0, 5);
  if (matchItems.length >= 2) {
    const rights = shuffle(matchItems.map((m) => m.dept), r);
    html += `<div class="card"><p class="t">3. 연결하기 — 법률과 부서를 선으로 이으세요 (문항당 4점)</p><div class="match">` +
      matchItems.map((m, n) =>
        `<span class="l"><span class="qno">${"㉮㉯㉰㉱㉲"[n]}</span> ${esc(m.text)}<span class="dot">●</span></span>` +
        `<span class="r"><span class="dot" style="margin:0 6px 0 0">●</span>${deptEmoji(rights[n])} ${esc(rights[n])}</span>`
      ).join("") + `</div></div>`;
    answers.push(`<div class="ansline"><b>3. 연결</b> — ${matchItems.map((m, n) => `${"㉮㉯㉰㉱㉲"[n]}→${esc(m.dept)}`).join(" · ")}</div>`);
  }

  // 4️⃣ 서술형 (고정 2문항)
  html += `<div class="card"><p class="t">4. 생각 쓰기 (문항당 정성껏!)</p>
    <div class="q"><span class="qno">4-1.</span> 우리 반 헌법 중 <b>가장 중요하다고 생각하는 조항</b>을 쓰고, 그 이유를 쓰세요.</div>
    <div class="writeline"></div><div class="writeline"></div>
    <div class="q" style="margin-top:14px"><span class="qno">4-2.</span> 법률을 <b>잘 지키는 우리 반</b>이 되려면 내가 무엇을 할 수 있을지 쓰세요.</div>
    <div class="writeline"></div><div class="writeline"></div></div>`;
  answers.push(`<div class="ansline"><b>4. 서술형</b> — 자유 답안 (조항·이유의 구체성을 보고 채점)</div>`);

  if (withAnswers)
    html += `<div class="anskey"><div class="cutline"></div>` +
      brandHeader("정답지", `시험지 세트 ${setNo} · 교사용`) + answers.join("") + `</div>`;
  return html;
}
