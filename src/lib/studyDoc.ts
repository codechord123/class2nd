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
// 객관식 ①~⑤ 30문항 (사용자 확정 2026-08-18) · 2단 편집 · 정답지는 번호 그리드 별지.
// 유형: A 빈칸 / B 부서 고르기 / C 부서의 법률 고르기 / D 헌법 조항 내용 / E 헌법·법률 구분.
const EXAM_CSS = `<style>
  .exam { font-family: "Batang", "바탕", "Nanum Myeongjo", "Noto Serif KR", serif; color: #000; }
  .exam .exhead { border: 2.5px solid #000; border-bottom-width: 1.2px; padding: 10px 14px 8px; }
  .exam .exmeta { display: flex; justify-content: space-between; font-size: 11.5px; }
  .exam .exhead h1 { text-align: center; font-size: 22px; margin: 6px 0 2px; letter-spacing: 0.02em; }
  .exam .exsub { text-align: center; font-size: 11.5px; margin-bottom: 2px; }
  .exam .nametbl { width: 100%; border-collapse: collapse; margin: 0 0 12px; }
  .exam .nametbl td { border: 1.2px solid #000; border-top: 0; font-size: 12px; text-align: center;
                      padding: 6px 4px; }
  .exam .nametbl td.lab { width: 11%; background: #f2f2f2; font-weight: 700; }
  .exam .nametbl td.in { width: 14%; }
  .exam .nametbl td.in.wide { width: 22%; }
  .exam .direction { font-size: 12px; margin: 0 0 10px; }
  .exam .qbody { column-count: 2; column-gap: 26px; column-rule: 1px solid #999; }
  .exam .sect { font-weight: 800; font-size: 12.5px; margin: 12px 0 6px; line-height: 1.55;
                break-inside: avoid; }
  .exam .bogi { border: 1.2px solid #000; padding: 5px 10px; font-size: 12px; margin: 4px 0 8px;
                break-inside: avoid; }
  .exam .bogi .bt { font-weight: 800; margin-right: 8px; }
  .exam .qq { font-size: 12.5px; line-height: 1.75; margin: 8px 0; break-inside: avoid; }
  .exam .qq .no { font-weight: 800; margin-right: 2px; }
  .exam .qq .paren { display: inline-block; min-width: 64px; border-bottom: 1.2px solid #000;
                     text-align: center; }
  .exam .qtext { border-left: 2px solid #555; padding: 1px 0 1px 8px; margin: 3px 0 4px 2px;
                 font-size: 12px; }
  .exam .ch-in { display: flex; flex-wrap: wrap; gap: 2px 16px; font-size: 12px; margin: 3px 0 0 14px; }
  .exam .ch-bl { font-size: 12px; margin: 2px 0 0 14px; }
  .exam .ch-bl div { line-height: 1.65; }
  .exam .anspage { page-break-before: always; }
  .exam .anshead { border: 2px solid #000; text-align: center; font-size: 16px; font-weight: 800;
                   padding: 8px; margin-bottom: 12px; }
  .exam .anstbl { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .exam .anstbl th, .exam .anstbl td { border: 1px solid #000; font-size: 13px; padding: 6px 4px;
                                       text-align: center; }
  .exam .anstbl th { background: #f2f2f2; width: 9%; font-size: 12px; }
</style>`;

const CIRCLED = ["①", "②", "③", "④", "⑤"];
// 빈칸 오답 보기가 모자랄 때 채우는 그럴듯한 낱말 (정답과 겹치면 자동 제외)
const FILLER_WORDS = ["약속을", "즐겁게", "천천히", "정직하게", "도와주며", "스스로", "차례대로", "사이좋게"];

interface Mcq { stem: string; quoted?: string; options: string[]; answer: number; inline: boolean }

export function buildQuizSheet(c: Constitution, setNo: number, withAnswers: boolean): string {
  const r = rng(20260818 + setNo * 7919);
  const articles = (c.articles ?? []).filter((a) => a.trim());
  const laws = flatLaws(c);
  const deptLaws = laws.filter((l) => l.dept !== "우리 반 공통");
  const year = new Date().getFullYear();

  // ── 유형 A: 빈칸 객관식 — 헌법·법률 전 조항에서 핵심 낱말 뚫기 ──
  const clauses = [
    ...articles.map((a, i) => ({ text: a, label: `[헌법 제${i + 1}조]` })),
    ...laws.map((l) => ({ text: l.text, label: `[${l.dept} 법률]` })),
  ];
  const blanks = clauses
    .map((cl) => ({ ...cl, blank: pickBlank(cl.text, r) }))
    .filter((x): x is typeof x & { blank: { blanked: string; answer: string } } => !!x.blank);
  const wordPool = [...new Set(blanks.map((b) => b.blank.answer))];
  const qA: Mcq[] = shuffle(blanks, r).map((b) => {
    const distract = shuffle(
      [...wordPool.filter((w) => w !== b.blank.answer), ...FILLER_WORDS.filter((w) => w !== b.blank.answer)],
      r
    ).slice(0, 4);
    const options = shuffle([b.blank.answer, ...distract], r);
    return {
      stem: `${b.label} ${b.blank.blanked.replace(/<span class="blank">[^<]*<\/span>/, '<span class="paren">(\u00A0\u00A0\u00A0\u00A0)</span>')}`,
      options,
      answer: options.indexOf(b.blank.answer),
      inline: true,
    };
  });

  // ── 유형 B: 이 법률을 만든 부서는? (보기 = 부서 5개 고정) ──
  const qB: Mcq[] = shuffle(deptLaws, r).map((l) => ({
    stem: "다음 법률을 만든 부서는 어디입니까?",
    quoted: l.text,
    options: [...DEPTS],
    answer: DEPTS.indexOf(l.dept),
    inline: true,
  }));
  const bStems = new Set(qB.map((q) => q.quoted));

  // ── 유형 C: ○○부의 법률로 알맞은 것은? (정답 1 + 다른 부서 법률 4) ──
  const qC: Mcq[] = [];
  for (const dept of shuffle([...new Set(deptLaws.map((l) => l.dept))], r)) {
    const mine = shuffle(deptLaws.filter((l) => l.dept === dept), r);
    const others = shuffle(deptLaws.filter((l) => l.dept !== dept), r).slice(0, 4);
    if (!mine.length || others.length < 4) continue;
    const correct = mine.find((m) => !bStems.has(m.text)) ?? mine[0];
    const options = shuffle([correct.text, ...others.map((o) => o.text)], r);
    qC.push({
      stem: `다음 중 <u>${esc(dept)}</u>의 법률로 알맞은 것은 무엇입니까?`,
      options,
      answer: options.indexOf(correct.text),
      inline: false,
    });
  }

  // ── 유형 D: 헌법 제N조의 내용으로 알맞은 것은? ──
  const qD: Mcq[] = shuffle(articles.map((a, i) => ({ a, i })), r).map(({ a, i }) => {
    const distract = shuffle(
      [...articles.filter((x) => x !== a), ...laws.map((l) => l.text).filter((t) => t !== a)],
      r
    ).slice(0, 4);
    if (distract.length < 4) return null;
    const options = shuffle([a, ...distract], r);
    return {
      stem: `다음 중 우리 반 헌법 <u>제${i + 1}조</u>의 내용으로 알맞은 것은 무엇입니까?`,
      options,
      answer: options.indexOf(a),
      inline: false,
    };
  }).filter((x): x is Mcq => !!x);

  // ── 유형 E: 헌법·법률 구분 — "법률인 것은?" / "헌법 조항인 것은?" ──
  const qE: Mcq[] = [];
  if (articles.length >= 4 && laws.length >= 1) {
    for (let k = 0; k < 2 && k < laws.length; k++) {
      const law = shuffle(laws, r)[k % laws.length];
      const arts = shuffle(articles, r).slice(0, 4);
      const options = shuffle([law.text, ...arts], r);
      qE.push({
        stem: "다음 중 우리 반 헌법 조항이 <u>아니라</u> 부서에서 만든 '법률'인 것은 무엇입니까?",
        options,
        answer: options.indexOf(law.text),
        inline: false,
      });
    }
  }
  if (laws.length >= 4 && articles.length >= 1) {
    for (let k = 0; k < 2 && k < articles.length; k++) {
      const art = shuffle(articles, r)[k % articles.length];
      const ls = shuffle(laws, r).slice(0, 4);
      const options = shuffle([art, ...ls.map((l) => l.text)], r);
      qE.push({
        stem: "다음 중 부서 법률이 <u>아니라</u> 우리 반 '헌법' 조항인 것은 무엇입니까?",
        options,
        answer: options.indexOf(art),
        inline: false,
      });
    }
  }

  // ── 30문항 배분: 기본 상한 A12·B8·C5·D5·E4 → 모자라면 A·B에서 보충, 넘치면 A부터 줄임 ──
  const TARGET = 30;
  const caps = [Math.min(qA.length, 12), Math.min(qB.length, 8), Math.min(qC.length, 5), Math.min(qD.length, 5), Math.min(qE.length, 4)];
  let total = caps.reduce((x, y) => x + y, 0);
  if (total < TARGET) {
    const extraA = Math.min(qA.length - caps[0], TARGET - total);
    caps[0] += extraA; total += extraA;
    const extraB = Math.min(qB.length - caps[1], TARGET - total);
    caps[1] += extraB; total += extraB;
  } else if (total > TARGET) {
    const cut = Math.min(total - TARGET, caps[0]);
    caps[0] -= cut; total -= cut;
  }
  const sections: { title: string; items: Mcq[] }[] = [
    { title: "다음 헌법과 법률의 빈칸에 들어갈 알맞은 말을 고르시오.", items: qA.slice(0, caps[0]) },
    { title: "다음 법률을 만든 부서로 알맞은 것을 고르시오.", items: qB.slice(0, caps[1]) },
    { title: "각 부서의 법률로 알맞은 것을 고르시오.", items: qC.slice(0, caps[2]) },
    { title: "우리 반 헌법 조항의 내용으로 알맞은 것을 고르시오.", items: qD.slice(0, caps[3]) },
    { title: "물음을 읽고 알맞은 것을 고르시오.", items: qE.slice(0, caps[4]) },
  ].filter((s) => s.items.length > 0);

  // ── 렌더 ──
  const ptsNote = total === 30
    ? "1~20번 각 3점, 21~30번 각 4점 (총 100점)"
    : `총 ${total}문항 (문항당 ${total ? Math.round(100 / total * 10) / 10 : 0}점)`;
  let qNo = 0;
  const answers: number[] = [];
  let html = EXAM_CSS + `<div class="exam">
    <div class="exhead">
      <div class="exmeta"><span>${year}학년도 2학기</span><span>학급 자치 (세트 ${setNo})</span></div>
      <h1>우리 반 헌법·법률 평가</h1>
      <div class="exsub">5학년 ― 객관식 ${total}문항</div>
    </div>
    <table class="nametbl"><tr>
      <td class="lab">반</td><td class="in"></td>
      <td class="lab">번호</td><td class="in"></td>
      <td class="lab">이름</td><td class="in wide"></td>
      <td class="lab">점수</td><td class="in"></td>
    </tr></table>
    <p class="direction">※ 문제를 잘 읽고 알맞은 답 <b>하나</b>를 골라 번호를 쓰시오. ${ptsNote}</p>
    <div class="qbody">`;

  for (const sec of sections) {
    const s0 = qNo + 1, s1 = qNo + sec.items.length;
    html += `<p class="sect">【${s0}~${s1}】 ${sec.title}</p>`;
    for (const q of sec.items) {
      qNo++;
      answers.push(q.answer);
      html += `<div class="qq"><span class="no">${qNo}.</span> ${q.stem}` +
        (q.quoted ? `<div class="qtext">${esc(q.quoted)}</div>` : "") +
        (q.inline
          ? `<div class="ch-in">${q.options.map((o, i) => `<span>${CIRCLED[i]} ${esc(o)}</span>`).join("")}</div>`
          : `<div class="ch-bl">${q.options.map((o, i) => `<div>${CIRCLED[i]} ${esc(o)}</div>`).join("")}</div>`) +
        `</div>`;
    }
  }
  html += `</div>`; // qbody

  if (withAnswers && total > 0) {
    html += `<div class="anspage"><div class="anshead">정답표 (세트 ${setNo} · 교사용)</div>`;
    for (let row = 0; row < total; row += 10) {
      const idx = Array.from({ length: Math.min(10, total - row) }, (_, k) => row + k);
      html += `<table class="anstbl"><tr><th>문항</th>${idx.map((i) => `<td style="background:#f8f8f8;font-weight:700">${i + 1}</td>`).join("")}</tr>` +
        `<tr><th>정답</th>${idx.map((i) => `<td style="font-size:15px">${CIRCLED[answers[i]]}</td>`).join("")}</tr></table>`;
    }
    html += `</div>`;
  }
  return html + `</div>`;
}

// ══════════════════════ ③ 법률 빈칸 시험지 (부서별 개별 인쇄) ══════════════════════
// 사용자 확정 2026-08-24 — 헌법 제외, 우리 반 '법률'만. 부서마다 목표 문항 수(기본 10)를
// 채우고, 부서별로 '완결된 시험지 한 장'을 만들어 페이지를 나눈다("각각 인쇄").
// 조항 수가 적어도 한 조항에서 서로 다른 낱말을 번갈아 뚫어 문항을 채운다(조항 순환).

/** 받침 유무로 조사 고르기 — "의장이 / 법무부가" (한글 종성 판정) */
function josa(word: string, withBatchim: string, without: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return without; // 한글이 아니면 기본형
  return (code - 0xac00) % 28 !== 0 ? withBatchim : without;
}

/** 끝 문장부호를 낱말에서 떼어낸다 — 정답에 마침표가 섞이면 채점이 애매해진다 */
function splitTrail(token: string): { word: string; trail: string } {
  const m = token.match(/^(.*?)([.,!?]+)$/);
  return m ? { word: m[1], trail: m[2] } : { word: token, trail: "" };
}

interface FillQ {
  tokens: string[]; // 조항 어절
  at: number; // 빈칸이 될 어절 위치
  answer: string; // 정답 낱말 (부호 제외)
  trail: string; // 빈칸 뒤에 남길 부호
}

/** 한 부서의 법률들로 목표 문항 수를 채운다 — 조항을 순환하며 서로 다른 낱말을 뚫는다.
 *  (법률이 3개뿐이어도 조항당 여러 낱말을 돌아가며 뚫어 10문항을 만든다) */
function fillQuestionsFor(laws: string[], want: number, r: () => number): FillQ[] {
  const perLaw = laws.map((text) => {
    const tokens = text.split(/\s+/).filter(Boolean);
    const cand = tokens
      .map((t, i) => ({ i, len: splitTrail(t).word.replace(/[^가-힣a-zA-Z0-9]/g, "").length }))
      .filter((x) => x.len >= 2)
      .sort((a, b) => b.len - a.len || (r() < 0.5 ? -1 : 1));
    return { tokens, cand };
  });
  const out: FillQ[] = [];
  // 라운드로빈 — 조항1의 1순위, 조항2의 1순위 … 그다음 각 조항의 2순위 (같은 문장 연속 방지)
  for (let round = 0; out.length < want; round++) {
    let added = 0;
    for (const L of perLaw) {
      if (out.length >= want) break;
      const pick = L.cand[round];
      if (!pick) continue;
      const { word, trail } = splitTrail(L.tokens[pick.i]);
      out.push({ tokens: L.tokens, at: pick.i, answer: word, trail });
      added++;
    }
    if (!added) break; // 더 뚫을 낱말이 없다 — 가능한 만큼만
  }
  return out;
}

const LAWFILL_CSS = `<style>
  .exam .fill { display:inline-block; min-width:88px; border-bottom:1.4px solid #000;
                text-align:center; font-size:11px; color:#888; }
  .exam .lawbank { border:1.2px solid #000; padding:6px 10px; font-size:12.5px; margin:0 0 10px;
                   line-height:2; }
  .exam .lawbank b { font-weight:800; margin-right:8px; }
  .exam .lawbank span { display:inline-block; padding:0 8px; }
  /* 부서별 시험지 — 한 장씩 페이지를 나눠 그대로 그 부서 학생에게 나눠줄 수 있게 */
  .exam .sheet { page-break-after: always; }
  .exam .sheet:last-of-type { page-break-after: auto; }
  .exam .sheet .qq { font-size:13.5px; line-height:2.2; }
  @media screen { .exam .sheet { border-bottom:2px dashed #bbb; padding-bottom:20px; margin-bottom:24px; } }
</style>`;

export function buildLawFillSheet(
  c: Constitution,
  setNo: number,
  withAnswers: boolean,
  opts?: { showBank?: boolean; perDept?: number; onlyDept?: string }
): string {
  const r = rng(20260824 + setNo * 6247);
  const showBank = opts?.showBank ?? true;
  const perDept = Math.min(Math.max(opts?.perDept ?? 10, 1), 30);
  const year = new Date().getFullYear();

  const byDept = new Map<string, string[]>();
  for (const l of flatLaws(c)) byDept.set(l.dept, [...(byDept.get(l.dept) ?? []), l.text]);
  const depts = [...byDept.keys()]
    .filter((d) => !opts?.onlyDept || d === opts.onlyDept)
    .sort(
      (a, b) =>
        (DEPTS.indexOf(a) < 0 ? 99 : DEPTS.indexOf(a)) -
        (DEPTS.indexOf(b) < 0 ? 99 : DEPTS.indexOf(b))
    );

  const sheets: string[] = [];
  const keysByDept: [string, string[]][] = [];
  const shortDepts: string[] = []; // 목표 문항을 못 채운 부서 (법률이 적어서)

  for (const dept of depts) {
    const qs = fillQuestionsFor(byDept.get(dept) ?? [], perDept, r);
    if (!qs.length) continue;
    if (qs.length < perDept) shortDepts.push(`${dept} ${qs.length}문항`);
    keysByDept.push([dept, qs.map((q) => q.answer)]);
    const each = Math.round((100 / qs.length) * 10) / 10;
    const rows = qs
      .map((q, k) => {
        const line = q.tokens
          .map((t, i) =>
            i === q.at ? `<span class="fill">(&nbsp;&nbsp;)</span>${esc(q.trail)}` : esc(t)
          )
          .join(" ");
        // 번호는 부서 안에서 1번부터 — 각 장이 독립된 시험지라 통번호는 오히려 혼란스럽다
        return `<div class="qq"><span class="no">${k + 1}.</span> ${line}</div>`;
      })
      .join("");
    const bank = showBank
      ? `<div class="lawbank"><b>&lt;보기&gt;</b>${shuffle([...new Set(qs.map((q) => q.answer))], r)
          .map((w) => `<span>${esc(w)}</span>`)
          .join("")}</div>`
      : "";
    sheets.push(`<div class="sheet">
      <div class="exhead">
        <div class="exmeta"><span>${year}학년도 2학기</span><span>학급 자치 (세트 ${setNo})</span></div>
        <h1>${deptEmoji(dept)} ${esc(dept)} 법률 평가</h1>
        <div class="exsub">5학년 ― ${esc(dept)}${josa(dept, "이", "가")} 만든 법률 ${qs.length}문항</div>
      </div>
      <table class="nametbl"><tr>
        <td class="lab">반</td><td class="in"></td>
        <td class="lab">번호</td><td class="in"></td>
        <td class="lab">이름</td><td class="in wide"></td>
        <td class="lab">점수</td><td class="in"></td>
      </tr></table>
      <p class="direction">※ 우리 반 <b>${esc(dept)}</b>${josa(dept, "이", "가")} 만든 법률입니다. 빈칸에 들어갈 말을 정확히 쓰시오. [각 ${each}점]</p>
      ${bank}${rows}
    </div>`);
  }

  let html = EXAM_CSS + LAWFILL_CSS + `<div class="exam">` + sheets.join("");

  if (withAnswers && keysByDept.length) {
    html += `<div class="anspage"><div class="anshead">정답 (세트 ${setNo} · 교사용)</div>`;
    // 부서별로 묶어서 — 각 장이 독립 시험지라 정답도 부서 단위로 봐야 채점이 빠르다
    for (const [dept, answers] of keysByDept) {
      html += `<p style="font-weight:800;font-size:13px;margin:12px 0 4px">${deptEmoji(dept)} ${esc(dept)}</p>`;
      for (let row = 0; row < answers.length; row += 10) {
        const chunk = answers.slice(row, row + 10);
        html += `<table class="anstbl"><tr><th>문항</th>${chunk
          .map((_, i) => `<td style="background:#f8f8f8;font-weight:700">${row + i + 1}</td>`)
          .join("")}</tr><tr><th>정답</th>${chunk
          .map((a) => `<td style="font-size:12px">${esc(a)}</td>`)
          .join("")}</tr></table>`;
      }
    }
    if (shortDepts.length)
      html += `<p style="font-size:11px;margin-top:10px">※ 법률 수가 적어 목표(${perDept}문항)를 못 채운 부서: ${esc(
        shortDepts.join(", ")
      )} — 해당 부서 법률을 더 등록하면 문항이 늘어납니다.</p>`;
    html += `</div>`;
  }
  return html + `</div>`;
}

// ══════════════════════ ④ 헌법·법률 전문 인쇄 (게시·배부용) ══════════════════════
// 사용자 요청 2026-08-24 — 학습지·시험지와 달리 '문서 그 자체'. 교실 뒷벽에 붙이거나
// 학기 초에 한 장씩 나눠 주고 파일에 끼워 두는 용도라 활동 칸·체크박스가 없다.
// size: "post"(게시용 — 큰 글씨, 멀리서 읽힘) / "hand"(배부용 — 보통 글씨, 장수 절약)

const DOC_CSS = (big: boolean) => `<style>
  .lawdoc { font-family: "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif; color:#191f28; }
  .lawdoc .cover { text-align:center; padding: ${big ? "18px 0 14px" : "10px 0 10px"};
                   border-bottom: 3px double #191f28; margin-bottom: ${big ? "20px" : "14px"}; }
  .lawdoc .cover .kicker { font-size:${big ? "13px" : "11.5px"}; font-weight:700; color:#6b7684;
                           letter-spacing:.22em; }
  .lawdoc .cover h1 { font-size:${big ? "38px" : "27px"}; margin:${big ? "8px 0 6px" : "5px 0 4px"};
                      letter-spacing:-.02em; }
  .lawdoc .cover .sub { font-size:${big ? "14px" : "12px"}; color:#6b7684; }
  .lawdoc .preamble { font-size:${big ? "15px" : "12.5px"}; line-height:1.85; text-align:center;
                      color:#333d4b; background:#f9fafb; border-radius:12px;
                      padding:${big ? "14px 18px" : "10px 14px"}; margin-bottom:${big ? "22px" : "16px"}; }
  .lawdoc h2 { font-size:${big ? "20px" : "15.5px"}; margin:${big ? "26px 0 12px" : "18px 0 8px"};
               padding-bottom:6px; border-bottom:2px solid #191f28; }
  .lawdoc h3 { font-size:${big ? "17px" : "13.5px"}; margin:${big ? "20px 0 8px" : "14px 0 6px"};
               color:#2272eb; }
  .lawdoc .art { display:flex; gap:${big ? "12px" : "9px"}; align-items:baseline;
                 margin:${big ? "9px 0" : "6px 0"}; line-height:1.75;
                 font-size:${big ? "16.5px" : "13px"}; page-break-inside:avoid; }
  .lawdoc .art .no { flex:none; font-weight:800; color:#2272eb; min-width:${big ? "56px" : "44px"};
                     font-size:${big ? "15px" : "12px"}; }
  .lawdoc .deptbox { border:1px solid #e5e8eb; border-radius:14px;
                     padding:${big ? "12px 16px 14px" : "9px 12px 10px"};
                     margin-bottom:${big ? "12px" : "9px"}; page-break-inside:avoid; }
  .lawdoc .deptbox h3 { margin:0 0 ${big ? "8px" : "5px"}; color:#191f28; }
  .lawdoc .sign { margin-top:${big ? "30px" : "20px"}; padding-top:${big ? "14px" : "10px"};
                  border-top:2px solid #191f28; text-align:center;
                  font-size:${big ? "14px" : "11.5px"}; color:#4e5968; line-height:1.9; }
  .lawdoc .sign b { color:#191f28; }
  .lawdoc .empty { font-size:13px; color:#8b95a1; padding:10px 0; }
</style>`;

/** 헌법·법률 전문 — 게시·배부용 문서 */
export function buildLawDocSheet(
  c: Constitution,
  opts?: { size?: "post" | "hand"; showConstitution?: boolean; showLaws?: boolean }
): string {
  const big = (opts?.size ?? "post") === "post";
  const showC = opts?.showConstitution ?? true;
  const showL = opts?.showLaws ?? true;
  const articles = (c.articles ?? []).filter((a) => a.trim());
  const laws = flatLaws(c);
  const byDept = new Map<string, string[]>();
  for (const l of laws) byDept.set(l.dept, [...(byDept.get(l.dept) ?? []), l.text]);
  const depts = [...byDept.keys()].sort(
    (a, b) =>
      (DEPTS.indexOf(a) < 0 ? 99 : DEPTS.indexOf(a)) - (DEPTS.indexOf(b) < 0 ? 99 : DEPTS.indexOf(b))
  );
  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
  }).format(new Date());

  let html = DOC_CSS(big) + `<div class="lawdoc">
    <div class="cover">
      <p class="kicker">2학기 학급 자치</p>
      <h1>우리 반 헌법과 법률</h1>
      <p class="sub">우리가 함께 정하고, 우리가 함께 지킵니다</p>
    </div>
    <p class="preamble">
      우리 반은 서로를 존중하고 스스로 책임지는 교실을 만들기 위해<br />
      다음과 같이 헌법을 정하고, 각 부서가 법률을 만들어 지키기로 약속합니다.
    </p>`;

  if (showC) {
    html += `<h2>📜 우리 반 헌법</h2>`;
    html += articles.length
      ? articles
          .map((a, i) => `<div class="art"><span class="no">제${i + 1}조</span><span>${esc(a)}</span></div>`)
          .join("")
      : `<p class="empty">아직 등록된 헌법 조항이 없어요.</p>`;
  }

  if (showL) {
    html += `<h2>⚖️ 부서별 법률</h2>`;
    html += depts.length
      ? depts
          .map((dept) => {
            const items = (byDept.get(dept) ?? []).filter((t) => t.trim());
            return `<div class="deptbox"><h3>${deptEmoji(dept)} ${esc(dept)}</h3>${items
              .map((t, i) => `<div class="art"><span class="no">${i + 1}</span><span>${esc(t)}</span></div>`)
              .join("")}</div>`;
          })
          .join("")
      : `<p class="empty">아직 등록된 법률이 없어요.</p>`;
  }

  html += `<div class="sign">
      위 헌법과 법률은 <b>우리 반 학급 회의</b>에서 함께 정한 것입니다.<br />
      <b>${esc(today)}</b> · 5학년 우리 반 모두
    </div></div>`;
  return html;
}
