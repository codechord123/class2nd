"use client";
// 일간/주간/월간 기록 인쇄 (요구사항 v2 §6 + v3 §5) — 새 창에 인쇄용 문서를 열어
// 브라우저 인쇄 → "PDF로 저장"으로 알림장에 바로 첨부할 수 있게 한다.
// 읽기 예산: 기간 내 집계 문서(dailyScores, 하루 1개) + 그날 건의만 읽는다.
// 오늘처럼 아직 집계 전인 날짜는 원시 평가를 대신 읽어 보완한다(교사 전용).
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";
import type { DailyScoreRow } from "@/types";

interface Compliment {
  from: number;
  to: number;
  text: string;
}
interface ToTeacher {
  from: number;
  text: string;
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "2026-07-05" → "7월 5일 (일)" */
export function dateTitle(date: string): string {
  const dow = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(date + "T00:00:00+09:00").getDay()
  ];
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 (${dow})`;
}

/** 앱 헤더를 닮은 인쇄 문서 머리 — 파란 로고 칩 + 제목/서브 (인자는 이미 escape된 문자열) */
export function brandHeader(titleHtml: string, subHtml: string): string {
  return `<div class="brand"><span class="logo">학</span><div class="bt"><p class="app">${subHtml}</p><h1>${titleHtml}</h1></div></div>`;
}

const name = (id: number | string) => studentById.get(Number(id))?.name ?? `?${id}`;

// 인쇄 스타일 — 앱 화면과 같은 결(토스 문법)의 인쇄판:
//   브랜드 헤더(파란 로고 칩) · 둥근 카드 · 옅은 톤 스탯 타일 · 세로선 없는 미니멀 표 ·
//   점수 미니 바 · 말풍선 정성 기록. A4 밀도 유지 + print-color-adjust로 색 보존.
const PRINT_CSS = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
         margin: 0; color: #191f28; background: #fff; letter-spacing: -0.01em; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 20px 24px 28px; }
  /* 브랜드 헤더 — 앱 상단과 같은 문법 */
  .brand { display: flex; align-items: center; gap: 12px; padding-bottom: 14px;
           margin-bottom: 14px; border-bottom: 2px solid #f2f4f6; }
  .brand .logo { width: 40px; height: 40px; border-radius: 12px; background: #3182f6;
                 color: #fff; font-weight: 800; font-size: 18px; display: flex;
                 align-items: center; justify-content: center; flex: none; }
  .brand .app { margin: 0; font-size: 11.5px; font-weight: 700; color: #8b95a1; }
  .brand h1 { margin: 1px 0 0; font-size: 21px; letter-spacing: -0.02em; }
  /* 일반 헤더 (주간·세션 리포트 호환) */
  h1 { font-size: 21px; margin: 0; letter-spacing: -0.02em; }
  .sub { color: #6b7684; font-size: 12px; padding: 4px 0 12px;
         border-bottom: 2px solid #f2f4f6; margin-bottom: 14px; }
  /* 카드 */
  .card { border: 1px solid #eceef1; border-radius: 16px; padding: 14px 16px;
          margin-bottom: 12px; page-break-inside: avoid; }
  .card > .t { font-size: 14.5px; font-weight: 800; margin: 0 0 10px; }
  .card > .t::before { content: ""; display: inline-block; width: 4px; height: 13px;
                       border-radius: 2px; background: #3182f6; margin-right: 8px;
                       vertical-align: -1px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  /* 스탯 타일 — 앱의 옅은 톤 배경 + 컬러 숫자 */
  .stats { display: flex; gap: 10px; text-align: center; }
  .stats > div { flex: 1; border-radius: 12px; padding: 10px 4px; background: #f9fafb; }
  .stats > div:nth-child(1) { background: #e6f7f1; }
  .stats > div:nth-child(1) .v { color: #0ca678; }
  .stats > div:nth-child(2) { background: #e8f2fe; }
  .stats > div:nth-child(2) .v { color: #2272eb; }
  .stats > div:nth-child(3) { background: #fff4e0; }
  .stats > div:nth-child(3) .v { color: #f08c00; }
  .stats .l { font-size: 11px; color: #6b7684; }
  .stats .v { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  .green { color: #0ca678; } .blue { color: #2272eb; } .amber { color: #f08c00; }
  ul { margin: 4px 0 0; padding-left: 18px; }
  li { margin: 3px 0; line-height: 1.6; font-size: 12.5px; }
  /* 표 — 세로선 없는 미니멀 (가로 헤어라인만) */
  table { border-collapse: collapse; margin-top: 4px; width: 100%; }
  th { font-size: 10.5px; color: #8b95a1; font-weight: 700; text-align: center;
       padding: 3px 8px; border-bottom: 1.5px solid #e5e8eb; }
  td { font-size: 12px; text-align: center; padding: 4.5px 8px; border-bottom: 1px solid #f2f4f6; }
  tr:last-child td { border-bottom: 0; }
  td:first-child, th:first-child { text-align: left; }
  td b { font-size: 12.5px; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .cols > table { flex: 1; }
  /* 모둠 카드 — 1위(오늘의 모둠)는 금테 */
  .grps { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  /* 분해 표(열 8+)가 든 카드는 전폭 1열 — 반폭에선 이름이 두 줄로 꺾인다 */
  .grps.wide { grid-template-columns: 1fr; gap: 8px; }
  .grp { border: 1px solid #eceef1; border-radius: 14px; padding: 10px 12px;
         page-break-inside: avoid; }
  .grp.win { border: 1.5px solid #f59f00; background: #fffdf5; }
  .grp .h { display: flex; justify-content: space-between; align-items: center; gap: 6px;
            flex-wrap: wrap; }
  .grp .gname { font-weight: 800; font-size: 13.5px; }
  .grp .gsum { font-size: 11px; color: #8b95a1; }
  .grp .gsum b { color: #191f28; font-size: 12.5px; }
  .grp table { margin-top: 4px; }
  .grp th { font-size: 10px; padding: 2px 6px; white-space: nowrap; }
  .grp td { font-size: 11.5px; padding: 3px 6px; }
  /* 이름은 절대 두 줄로 꺾지 않는다 — 숫자 열이 대신 줄어들게 */
  .grp td:first-child, .grp th:first-child { white-space: nowrap; }
  .grps.wide .grp td:first-child { width: 72px; }
  .badge { display: inline-block; border-radius: 999px; padding: 1.5px 8px; font-size: 10px;
           font-weight: 700; background: #e8f2fe; color: #2272eb; margin-left: 4px; }
  .badge.gold { background: #f59f00; color: #fff; }
  /* 학부모용 뱃지 카드 (일간 리포트) — 숫자표 대신 '받은 것만' 뱃지로 */
  .hlrow { display: flex; gap: 8px; margin: 0 0 10px; }
  .hl { flex: 1; border-radius: 12px; padding: 9px 13px; display: flex; gap: 10px; align-items: center; }
  .hl .ic { font-size: 19px; line-height: 1; }
  .hl .k { font-size: 10.5px; color: #8b95a1; font-weight: 700; }
  .hl .v { font-size: 15px; font-weight: 800; margin-top: 1px; }
  .hl.gold { background: #fdf0d9; } .hl.gold .v { color: #e0850b; }
  .hl.star { background: #e8f1ff; } .hl.star .v { color: #3182f6; }
  .kids { display: flex; flex-direction: column; }
  .kid { display: flex; align-items: center; gap: 8px; padding: 5.5px 12px; border-top: 1px solid #f2f4f6; }
  .kid:first-child { border-top: 0; }
  .kid .nm { font-weight: 700; font-size: 12.5px; min-width: 60px; }
  .kid .pt { font-weight: 800; font-size: 12px; color: #3182f6; background: #e8f1ff; border-radius: 6px; padding: 1px 7px; }
  .kid .pt.z { color: #aab3bf; background: #f2f4f6; }
  .kid .bs { margin-left: auto; display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
  .kid .q { margin-left: auto; font-size: 11px; color: #aab3bf; }
  .bc { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
  .bc.mvp { background: #e8f1ff; color: #3182f6; }
  .bc.best { background: #fdf0d9; color: #e0850b; }
  .bc.boss { background: #ece7fb; color: #7257d4; }
  .bc.read { background: #e2f6ee; color: #0f9e6e; }
  .bc.praise { background: #fce6f0; color: #e24c8b; }
  .rsn { padding: 0 12px 6px; font-size: 10.5px; color: #8b95a1; }
  .rsn b { color: #7257d4; }
  /* 세션 리포트 — 화면 세션뷰처럼 하이라이트 타일 + 모둠 평균 바 + TOP5 */
  .hitiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .hitile { border: 1px solid #eceef1; border-radius: 12px; padding: 9px 12px; background: #fbfcfd; }
  .hitile .l { font-size: 10.5px; color: #8b95a1; font-weight: 700; margin-bottom: 2px; }
  .hitile .v { font-size: 13px; font-weight: 800; color: #191f28; line-height: 1.35; }
  .hitile .s { font-size: 10.5px; color: #aab3bf; margin-top: 1px; }
  .bars { display: flex; flex-direction: column; gap: 6px; }
  .bar { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
  .bar .bl { width: 56px; shrink: 0; font-weight: 700; color: #3a4250; }
  .bar .bt { flex: 1; height: 9px; background: #f2f4f6; border-radius: 999px; overflow: hidden; }
  .bar .bt > i { display: block; height: 100%; background: #3182f6; border-radius: 999px; }
  .bar .bt > i.win { background: #f59f00; }
  .bar .bv { width: 32px; text-align: right; font-weight: 800; color: #191f28; }
  .rank { display: flex; flex-direction: column; }
  .rk { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 4px 0; border-top: 1px solid #f2f4f6; }
  .rk:first-child { border-top: 0; }
  .rk .m { width: 20px; text-align: center; }
  .rk .rv { margin-left: auto; font-weight: 800; color: #3182f6; }
  /* 점수 미니 바 */
  .score { position: relative; }
  .score .sbar { position: absolute; left: 4px; top: 22%; bottom: 22%; border-radius: 4px;
                 background: #dbeafe; max-width: calc(100% - 8px); }
  .score b { position: relative; }
  /* 달성 게이지 */
  .gauge { position: relative; height: 18px; margin-top: 10px; border-radius: 10px;
           background: #f2f4f6; overflow: hidden; }
  .gauge i { display: block; height: 100%; background: linear-gradient(90deg, #34d399, #0ca678); }
  .gauge span { position: absolute; inset: 0; display: flex; align-items: center;
                justify-content: center; font-size: 10.5px; font-weight: 700; color: #065f46; }
  /* 말풍선 — 2페이지 정성 기록 */
  ul.bubs { list-style: none; padding: 0; margin: 6px 0 0; }
  .bub { background: #f2f4f6; border-radius: 10px; padding: 6px 10px; margin: 4px 0;
         font-size: 12px; line-height: 1.55; }
  .bub.sug { background: #e8f4fd; }
  .bub.none { color: #8b95a1; background: #f9fafb; }
  .muted { color: #6b7684; font-size: 11.5px; margin: 6px 0 0; line-height: 1.5; }
  .warn { color: #e8590c; font-weight: 600; }
  .pagebreak { page-break-before: always; margin-top: 26px; }
  .docfoot { margin-top: 14px; padding-top: 8px; border-top: 1px solid #eceef1;
             text-align: center; color: #b0b8c1; font-size: 10.5px; }
  @media print { .noprint { display: none; } }
`;

/** 인쇄 문서를 새 창에 연다 (공용 래퍼). body는 카드형 HTML. */
export function openPrintWindow(title: string, bodyHtml: string): void {
  const printed = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
  }).format(new Date());
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
<div class="wrap">
<button class="noprint" onclick="window.print()" style="padding:8px 16px;font-weight:bold;border-radius:8px;border:1px solid #d1d6db;background:#fff;cursor:pointer;margin-bottom:12px">🖨️ 인쇄 / PDF 저장</button>
${bodyHtml}
<div class="docfoot">2학기 학급 자치 시스템 · ${esc(printed)} 출력</div>
</div>
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) throw new Error("팝업이 차단되었어요. 팝업 허용 후 다시 시도해주세요.");
  win.document.write(html);
  win.document.close();
}

/** 아직 집계 전인 날짜의 칭찬/건의/바라는점을 원시 평가에서 직접 수집 */
async function liveDayExtras(date: string) {
  const snap = await getDocs(collection(db(), "evaluations", date, "entries"));
  const compliments: Compliment[] = [];
  const peerSuggestions: Compliment[] = [];
  const toTeacher: ToTeacher[] = [];
  snap.forEach((entry) => {
    const d = entry.data();
    const from = Number(entry.id);
    const c = d._compliment as { to: number; text: string } | undefined;
    if (c?.text) compliments.push({ from, to: c.to, text: c.text });
    const cmap = d._compliments as Record<string, string> | undefined;
    if (cmap)
      for (const [to, text] of Object.entries(cmap))
        if (text?.trim()) compliments.push({ from, to: Number(to), text });
    const smap = d._peerSuggestions as Record<string, string> | undefined;
    if (smap)
      for (const [to, text] of Object.entries(smap))
        if (text?.trim()) peerSuggestions.push({ from, to: Number(to), text });
    if (typeof d._toTeacher === "string" && d._toTeacher) toTeacher.push({ from, text: d._toTeacher });
  });
  return { compliments, peerSuggestions, toTeacher };
}

export async function openRangePrintDoc(
  start: string,
  end: string,
  label: string,
  extraHtml?: string // 리포트 상단에 붙일 추가 섹션(예: 독서 현황) — 호출부의 캐시 데이터로 구성
): Promise<{ days: number; compliments: number; suggestions: number }> {
  const d = db();

  // 1) 기간 내 집계 문서 (_cumulative는 "_"라 범위 밖)
  const daySnap = await getDocs(
    query(
      collection(d, "dailyScores"),
      where(documentId(), ">=", start),
      where(documentId(), "<=", end)
    )
  );

  const byDate = new Map<
    string,
    {
      compliments: Compliment[];
      peerSuggestions: Compliment[];
      toTeacher: ToTeacher[];
      rows?: Record<string, DailyScoreRow>;
    }
  >();
  const scoreSum: Record<string, number> = {};
  daySnap.forEach((day) => {
    const data = day.data();
    const meta = (data._meta ?? {}) as {
      compliments?: Compliment[];
      peerSuggestions?: Compliment[];
      toTeacher?: ToTeacher[];
    };
    byDate.set(day.id, {
      compliments: meta.compliments ?? [],
      peerSuggestions: meta.peerSuggestions ?? [],
      toTeacher: meta.toTeacher ?? [],
    });
    for (const s of students) {
      const row = data[String(s.id)] as DailyScoreRow | undefined;
      if (row) scoreSum[String(s.id)] = (scoreSum[String(s.id)] ?? 0) + row.total;
    }
  });

  // 2) 오늘(집계 전)이 기간에 포함되면 원시 평가로 보완
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  if (today >= start && today <= end && !byDate.has(today)) {
    const extras = await liveDayExtras(today);
    if (extras.compliments.length || extras.peerSuggestions.length || extras.toTeacher.length)
      byDate.set(today, extras);
  }

  // 3) 기간 내 건의
  const startMs = new Date(start + "T00:00:00+09:00").getTime();
  const endMs = new Date(end + "T00:00:00+09:00").getTime() + 86400000;
  const sugSnap = await getDocs(
    query(
      collection(d, "suggestions"),
      where("createdAt", ">=", startMs),
      where("createdAt", "<", endMs)
    )
  );
  const suggestions = sugSnap.docs
    .map((s) => s.data())
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((v) => ({
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
        new Date(v.createdAt)
      ),
      name: v.isAnonymous ? "익명" : name(v.studentId),
      content: String(v.content ?? ""),
    }));

  // 4) 문서 구성
  const dates = [...byDate.keys()].sort();
  const allCompliments = dates.flatMap((dt) => byDate.get(dt)!.compliments.map((c) => ({ ...c, date: dt })));
  const praised = new Set(allCompliments.map((c) => c.to));
  const notPraised = students.filter((s) => !praised.has(s.id)).map((s) => s.name);

  const scoreRows = students
    .map((s) => ({ name: s.name, sum: scoreSum[String(s.id)] ?? 0 }))
    .sort((a, b) => b.sum - a.sum);
  const hasScores = scoreRows.some((r) => r.sum !== 0);

  const card = (title: string, inner: string) =>
    `<div class="card"><div class="t">${title}</div>${inner}</div>`;
  const sections: string[] = [];

  if (extraHtml) sections.push(`<div class="card">${extraHtml}</div>`);

  if (hasScores) {
    // 25명 표를 2단으로 나눠 세로 공간 절약 + 점수 미니 바 (분포 시각화)
    const maxSum = Math.max(1, ...scoreRows.map((r) => r.sum));
    const half = Math.ceil(scoreRows.length / 2);
    const tbl = (rows: typeof scoreRows, offset: number) =>
      `<table><thead><tr><th>순위</th><th>이름</th><th>합계</th></tr></thead><tbody>${rows
        .map(
          (r, i) =>
            `<tr><td>${offset + i + 1}</td><td>${esc(r.name)}</td><td class="score"><span class="sbar" style="width:${Math.round((Math.max(r.sum, 0) / maxSum) * 100)}%"></span><b>${r.sum}</b></td></tr>`
        )
        .join("")}</tbody></table>`;
    sections.push(
      card(
        `점수 요약 (집계된 ${daySnap.size}일 합산)`,
        `<div class="cols">${tbl(scoreRows.slice(0, half), 0)}${tbl(scoreRows.slice(half), half)}</div>`
      )
    );
  }

  // ── 2페이지: 마음 기록 (정성) — 말풍선 문법으로 일간 리포트와 통일 ──
  sections.push(
    `<div class="pagebreak"></div>` +
      brandHeader(`${esc(label)} 마음 기록`, "기간 동안 주고받은 칭찬 · 건의 · 바라는 점")
  );
  const dLabel = (dt: string) => `${Number(dt.slice(5, 7))}/${Number(dt.slice(8, 10))}`;
  const bub = (cls: string, inner: string) => `<li class="bub ${cls}">${inner}</li>`;
  sections.push(
    card(
      `칭찬 (${allCompliments.length}건)`,
      (allCompliments.length
        ? `<ul class="bubs">${allCompliments
            .map((c) =>
              bub(
                "",
                `<b>${esc(name(c.from))}</b> → <b>${esc(name(c.to))}</b> · ${esc(c.text)} <span class="muted">(${dLabel(c.date)})</span>`
              )
            )
            .join("")}</ul>`
        : `<p class="muted">칭찬 기록이 없습니다.</p>`) +
        (allCompliments.length && notPraised.length
          ? `<p class="muted warn">※ 이 기간에 칭찬을 못 받은 친구: ${notPraised.join(", ")}</p>`
          : "")
    )
  );

  const allPeerSug = dates.flatMap((dt) =>
    byDate.get(dt)!.peerSuggestions.map((c) => ({ ...c, date: dt }))
  );
  sections.push(
    card(
      `모둠원 건의 (${allPeerSug.length}건)`,
      allPeerSug.length
        ? `<ul class="bubs">${allPeerSug
            .map((c) =>
              bub(
                "sug",
                `<b>${esc(name(c.from))}</b> → <b>${esc(name(c.to))}</b> · ${esc(c.text)} <span class="muted">(${dLabel(c.date)})</span>`
              )
            )
            .join("")}</ul>`
        : `<p class="muted">모둠원 건의 기록이 없습니다.</p>`
    )
  );

  const allToTeacher = dates.flatMap((dt) => byDate.get(dt)!.toTeacher.map((t) => ({ ...t, date: dt })));
  sections.push(
    card(
      `선생님에게 바라는 점 (${allToTeacher.length}건)`,
      allToTeacher.length
        ? `<ul class="bubs">${allToTeacher
            .map((t) =>
              bub("", `<b>${esc(name(t.from))}</b> · ${esc(t.text)} <span class="muted">(${dLabel(t.date)})</span>`)
            )
            .join("")}</ul>`
        : `<p class="muted">기록이 없습니다.</p>`
    )
  );

  sections.push(
    card(
      `건의 게시판 (${suggestions.length}건)`,
      suggestions.length
        ? `<ul class="bubs">${suggestions
            .map((s) => bub("sug", `<b>${esc(s.name)}</b> · ${esc(s.content)} <span class="muted">(${dLabel(s.date)})</span>`))
            .join("")}</ul>`
        : `<p class="muted">건의 기록이 없습니다.</p>`
    )
  );

  openPrintWindow(
    `${label} 학급 기록 (${start} ~ ${end})`,
    brandHeader(
      `${esc(label)} 학급 기록`,
      `${dateTitle(start)} ~ ${dateTitle(end)} · 2학기 학급 자치`
    ) + sections.join("\n")
  );
  return { days: byDate.size, compliments: allCompliments.length, suggestions: suggestions.length };
}

// ── 학생 개인 리포트 — 상담·가정통신 첨부용 1장 ─────────────────
// 그 아이의 점수 흐름 + 받은 칭찬(실명) + 독서 기록만 담는다.
// 읽기: 기간 내 집계 문서 + 본인 감상문(등호 쿼리 — 인덱스 불필요). 교사 필요 시에만.
export async function openStudentPrintDoc(
  sid: number,
  start: string,
  end: string,
  label: string
): Promise<{ days: number }> {
  const d = db();
  const sname = name(sid);

  const [daySnap, reportSnap] = await Promise.all([
    getDocs(
      query(
        collection(d, "dailyScores"),
        where(documentId(), ">=", start),
        where(documentId(), "<=", end)
      )
    ),
    getDocs(query(collection(d, "readingReports"), where("studentId", "==", sid))),
  ]);

  // 날짜별 내 행 + 받은 칭찬 수집
  const startMs = new Date(start + "T00:00:00+09:00").getTime();
  const endMs = new Date(end + "T00:00:00+09:00").getTime() + 86400000;
  const dayRows: { date: string; row: DailyScoreRow }[] = [];
  const received: (Compliment & { date: string })[] = [];
  let sentCount = 0;
  daySnap.forEach((day) => {
    const data = day.data();
    const row = data[String(sid)] as DailyScoreRow | undefined;
    if (row) dayRows.push({ date: day.id, row });
    const meta = (data._meta ?? {}) as { compliments?: Compliment[] };
    for (const c of meta.compliments ?? []) {
      if (c.to === sid) received.push({ ...c, date: day.id });
      if (c.from === sid) sentCount++;
    }
  });
  dayRows.sort((a, b) => (a.date < b.date ? -1 : 1));

  const books = reportSnap.docs
    .map((r) => r.data() as { title?: string; createdAt?: number })
    .filter((r) => (r.createdAt ?? 0) >= startMs && (r.createdAt ?? 0) < endMs)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  const totalScore = dayRows.reduce((a, r) => a + r.row.total, 0);
  const mvpDays = dayRows.filter((r) => (r.row.mvp ?? 0) > 0).length;
  const missionDays = dayRows.filter((r) => (r.row.mission ?? 0) > 0).length;

  const card = (title: string, inner: string) =>
    `<div class="card"><div class="t">${title}</div>${inner}</div>`;
  const dLabel = (dt: string) => `${Number(dt.slice(5, 7))}/${Number(dt.slice(8, 10))}`;
  const sections: string[] = [];

  // 요약 타일 3개 + 배지 줄
  sections.push(
    card(
      "기간 요약",
      `<div class="stats">
        <div><div class="l">기간 총점</div><div class="v blue">${totalScore}</div></div>
        <div><div class="l">독서</div><div class="v green">${books.length}권</div></div>
        <div><div class="l">받은 칭찬</div><div class="v amber">${received.length}</div></div>
      </div>
      <p class="muted">보낸 칭찬 ${sentCount}회 · 모둠 MVP ${mvpDays}회 · 칭찬 미션 달성 ${missionDays}회 (집계 ${dayRows.length}일)</p>`
    )
  );

  // 점수 흐름 — 날짜별 표 (합계는 미니 바)
  if (dayRows.length) {
    const maxTotal = Math.max(1, ...dayRows.map((r) => r.row.total));
    const rowsHtml = dayRows
      .map(
        ({ date, row }) =>
          `<tr><td>${dLabel(date)}</td><td>${row.peer}</td><td>${row.groupRank || "·"}</td><td>${
            row.mission ? "+1" : "·"
          }</td><td>${row.comp || "·"}</td><td>${row.mvp ? "★" : "·"}</td><td>${row.read || "·"}</td><td>${
            row.bonus || "·"
          }</td><td class="score"><span class="sbar" style="width:${Math.round(
            (Math.max(row.total, 0) / maxTotal) * 100
          )}%"></span><b>${row.total}</b></td></tr>`
      )
      .join("");
    sections.push(
      card(
        "날짜별 점수 흐름",
        `<table><thead><tr><th>날짜</th><th>부서장평가</th><th>순위</th><th>미션</th><th>칭찬</th><th>MVP</th><th>독서</th><th>보너스</th><th>합계</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
      )
    );
  } else {
    sections.push(card("날짜별 점수 흐름", `<p class="muted">이 기간에 집계된 점수가 없습니다.</p>`));
  }

  // 받은 칭찬 — 보낸 친구 실명 말풍선 (긍정 기록만 담는 문서)
  sections.push(
    card(
      `친구들이 보낸 칭찬 (${received.length}건)`,
      received.length
        ? `<ul class="bubs">${received
            .map(
              (c) =>
                `<li class="bub"><b>${esc(name(c.from))}</b> · ${esc(c.text)} <span class="muted">(${dLabel(c.date)})</span></li>`
            )
            .join("")}</ul>`
        : `<p class="muted">이 기간에 받은 칭찬 기록이 없습니다.</p>`
    )
  );

  // 독서 기록 — 감상문 제목 목록
  sections.push(
    card(
      `거북이 독서 기록 (${books.length}권)`,
      books.length
        ? `<ul>${books
            .map(
              (b) =>
                `<li><b>${esc(b.title ?? "(제목 없음)")}</b> <span class="muted">(${dLabel(
                  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
                    new Date(b.createdAt ?? 0)
                  )
                )})</span></li>`
            )
            .join("")}</ul>`
        : `<p class="muted">이 기간에 등록한 감상문이 없습니다.</p>`
    )
  );

  openPrintWindow(
    `${sname} 개인 리포트 (${start} ~ ${end})`,
    brandHeader(
      `${esc(sname)} 개인 리포트`,
      `${esc(label)} · ${dateTitle(start)} ~ ${dateTitle(end)} · 2학기 학급 자치`
    ) + sections.join("\n")
  );
  return { days: dayRows.length };
}
