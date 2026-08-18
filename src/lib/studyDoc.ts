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
const DEPTS: string[] = ROLE_INFO.map((x) => x.dept);
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

// ══════════════════════ ② 시험지 (+정답지) — 진짜 학교 시험지 양식 ══════════════════════
// 바탕체·무채색·테두리 인적사항표·【N~M】 묶음 지시문·①~⑤ 선택형 — 실제 단원평가처럼 (사용자 확정).
const EXAM_CSS = `<style>
  .exam { font-family: "Batang", "바탕", "Nanum Myeongjo", "Noto Serif KR", serif; color: #000; }
  .exam .exhead { border: 2.5px solid #000; border-bottom-width: 1.2px; padding: 10px 14px 8px; }
  .exam .exmeta { display: flex; justify-content: space-between; font-size: 11.5px; }
  .exam .exhead h1 { text-align: center; font-size: 22px; margin: 6px 0 2px; letter-spacing: 0.02em; }
  .exam .exsub { text-align: center; font-size: 11.5px; margin-bottom: 2px; }
  .exam .nametbl { width: 100%; border-collapse: collapse; margin: 0 0 18px; }
  .exam .nametbl td { border: 1.2px solid #000; border-top: 0; font-size: 12px; text-align: center;
                      padding: 6px 4px; }
  .exam .nametbl td.lab { width: 11%; background: #f2f2f2; font-weight: 700; }
  .exam .nametbl td.in { width: 14%; }
  .exam .nametbl td.in.wide { width: 22%; }
  .exam .direction { font-size: 12.5px; margin: 0 0 14px; }
  .exam .sect { font-weight: 800; font-size: 13.5px; margin: 18px 0 8px; line-height: 1.6; }
  .exam .sect .pts { font-weight: 700; }
  .exam .bogi { border: 1.2px solid #000; padding: 7px 12px; font-size: 13px; margin: 6px 0 12px;
                display: flex; gap: 8px; align-items: baseline; }
  .exam .bogi .bt { font-weight: 800; flex: none; }
  .exam .bogi .bw { line-height: 1.9; word-spacing: 1.2em; }
  .exam .qq { font-size: 13.5px; line-height: 1.9; margin: 10px 0; page-break-inside: avoid; }
  .exam .qq .no { font-weight: 800; margin-right: 2px; }
  .exam .qq .paren { display: inline-block; min-width: 84px; border-bottom: 1.4px solid #000;
                     text-align: center; }
  .exam .choices { display: flex; flex-wrap: wrap; gap: 4px 22px; font-size: 13px; margin: 4px 0 0 18px; }
  .exam .oxend { float: right; font-weight: 700; }
  .exam .qtext { border-left: 2.5px solid #555; padding: 2px 0 2px 10px; margin: 4px 0 6px 4px;
                 font-size: 13px; }
  .exam .wbox { border: 1.2px solid #000; height: 84px; margin: 6px 0 4px; }
  .exam .anspage { page-break-before: always; }
  .exam .anshead { border: 2px solid #000; text-align: center; font-size: 16px; font-weight: 800;
                   padding: 8px; margin-bottom: 12px; }
  .exam .anstbl { width: 100%; border-collapse: collapse; }
  .exam .anstbl th, .exam .anstbl td { border: 1px solid #000; font-size: 12.5px; padding: 6px 8px; }
  .exam .anstbl th { background: #f2f2f2; width: 14%; }
  .exam .anstbl td { text-align: left; }
</style>`;

const CIRCLED = ["①", "②", "③", "④", "⑤"];

export function buildQuizSheet(c: Constitution, setNo: number, withAnswers: boolean): string {
  const r = rng(20260818 + setNo * 7919);
  const articles = (c.articles ?? []).filter((a) => a.trim());
  const laws = flatLaws(c);
  const deptLaws = laws.filter((l) => l.dept !== "우리 반 공통");
  const year = new Date().getFullYear();
  const keyRows: [string, string][] = []; // [문항, 정답]
  let qNo = 0;
  let html = EXAM_CSS + `<div class="exam">
    <div class="exhead">
      <div class="exmeta"><span>${year}학년도 2학기</span><span>학급 자치 (세트 ${setNo})</span></div>
      <h1>우리 반 헌법·법률 평가</h1>
      <div class="exsub">5학년 ― 우리 반이 함께 만든 헌법과 법률</div>
    </div>
    <table class="nametbl"><tr>
      <td class="lab">반</td><td class="in"></td>
      <td class="lab">번호</td><td class="in"></td>
      <td class="lab">이름</td><td class="in wide"></td>
      <td class="lab">점수</td><td class="in"></td>
    </tr></table>
    <p class="direction">※ 문제를 잘 읽고 알맞은 답을 쓰거나 고르시오.</p>`;

  // 【빈칸 채우기】 헌법 — <보기>에서 골라 쓰기 (각 8점)
  const fillArts = shuffle(articles.map((a, i) => ({ a, i })), r).slice(0, 5);
  const fills = fillArts
    .map(({ a, i }) => ({ i, blank: pickBlank(a, r) }))
    .filter((x): x is { i: number; blank: { blanked: string; answer: string } } => !!x.blank);
  if (fills.length) {
    const s0 = qNo + 1, s1 = qNo + fills.length;
    const bank = shuffle(fills.map((f) => f.blank.answer), r);
    html += `<p class="sect">【${s0}~${s1}】 다음은 우리 반 헌법이다. 빈칸에 들어갈 알맞은 말을 &lt;보기&gt;에서 골라 쓰시오. <span class="pts">[각 8점]</span></p>
      <div class="bogi"><span class="bt">&lt;보기&gt;</span><span class="bw">${bank.map(esc).join("  ")}</span></div>` +
      fills.map((f) => {
        qNo++;
        keyRows.push([String(qNo), f.blank.answer]);
        return `<div class="qq"><span class="no">${qNo}.</span> [제${f.i + 1}조] ${f.blank.blanked.replace(/<span class="blank">[^<]*<\/span>/, '<span class="paren">(\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0)</span>')}</div>`;
      }).join("");
  }

  // 【선택형】 이 법률을 만든 부서 고르기 — ①~⑤ (각 7점)
  const seenM = new Set<string>();
  const mcq = shuffle(deptLaws, r).filter((l) => !seenM.has(l.dept) && seenM.add(l.dept)).slice(0, 4);
  if (mcq.length >= 2) {
    const s0 = qNo + 1, s1 = qNo + mcq.length;
    html += `<p class="sect">【${s0}~${s1}】 다음 법률을 만든 부서로 알맞은 것을 고르시오. <span class="pts">[각 7점]</span></p>` +
      mcq.map((m) => {
        qNo++;
        const ansIdx = DEPTS.indexOf(m.dept);
        keyRows.push([String(qNo), `${CIRCLED[ansIdx]} ${m.dept}`]);
        return `<div class="qq"><span class="no">${qNo}.</span><div class="qtext">${esc(m.text)}</div>
          <div class="choices">${DEPTS.map((d, i) => `<span>${CIRCLED[i]} ${esc(d)}</span>`).join("")}</div></div>`;
      }).join("");
  }

  // 【O/X】 옳으면 O, 틀리면 X (각 4점) — 절반은 부서를 바꿔치기한 오답 문장
  const oxPool = shuffle(deptLaws.filter((l) => !mcq.includes(l)), r).slice(0, 2);
  if (oxPool.length) {
    const s0 = qNo + 1, s1 = qNo + oxPool.length;
    html += `<p class="sect">【${s0}~${s1}】 다음 설명이 옳으면 O표, 틀리면 X표 하시오. <span class="pts">[각 4점]</span></p>` +
      oxPool.map((l, idx) => {
        qNo++;
        const wrong = idx % 2 === 1;
        const shownDept = wrong ? shuffle(DEPTS.filter((d) => d !== l.dept), r)[0] : l.dept;
        keyRows.push([String(qNo), wrong ? `X (${l.dept}의 법률)` : "O"]);
        return `<div class="qq"><span class="no">${qNo}.</span> "${esc(l.text)}"는 ${esc(shownDept)}에서 만든 법률이다. <span class="oxend">(&nbsp;&nbsp;&nbsp;&nbsp;)</span></div>`;
      }).join("");
  }

  // 【서술형】 (각 14~12점 — 남은 배점을 나눠 100점 맞춤)
  const used = fills.length * 8 + (mcq.length >= 2 ? mcq.length * 7 : 0) + oxPool.length * 4;
  const remain = Math.max(100 - used, 20);
  const each = Math.floor(remain / 2);
  html += `<p class="sect">【${qNo + 1}~${qNo + 2}】 서술형 문제를 읽고 답을 쓰시오. <span class="pts">[${qNo + 1}번 ${each}점, ${qNo + 2}번 ${remain - each}점]</span></p>`;
  qNo++;
  keyRows.push([String(qNo), "자유 답안 — 조항을 정확히 쓰고 이유가 구체적이면 만점"]);
  html += `<div class="qq"><span class="no">${qNo}.</span> 우리 반 헌법 중 가장 중요하다고 생각하는 조항 하나를 쓰고, 그렇게 생각한 이유를 쓰시오.<div class="wbox"></div></div>`;
  qNo++;
  keyRows.push([String(qNo), "자유 답안 — 실천 방법이 구체적이면 만점"]);
  html += `<div class="qq"><span class="no">${qNo}.</span> 우리 반 법률을 잘 지키는 반이 되기 위해 내가 실천할 수 있는 일을 두 가지 쓰시오.<div class="wbox"></div></div>`;

  if (withAnswers) {
    html += `<div class="anspage"><div class="anshead">정답 및 채점 기준 (세트 ${setNo} · 교사용)</div>
      <table class="anstbl"><tr><th>문항</th><td style="background:#f2f2f2;font-weight:700">정답</td></tr>` +
      keyRows.map(([n, a]) => `<tr><th>${n}번</th><td>${esc(a).replace(/&lt;/g, "<").replace(/&gt;/g, ">")}</td></tr>`).join("") +
      `</table></div>`;
  }
  return html + `</div>`;
}
