"use client";
// 일간/주간/월간 기록 인쇄 (요구사항 v2 §6 + v3 §5) — 새 창에 인쇄용 문서를 열어
// 브라우저 인쇄 → "PDF로 저장"으로 알림장에 바로 첨부할 수 있게 한다.
// 읽기 예산: 기간 내 집계 문서(dailyScores, 하루 1개) + 그날 건의만 읽는다.
// 오늘처럼 아직 집계 전인 날짜는 원시 평가를 대신 읽어 보완한다(교사 전용).
import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
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

const name = (id: number | string) => studentById.get(Number(id))?.name ?? `?${id}`;

// 화면 리포트와 결을 맞춘 카드형 인쇄 스타일 (배경색은 print-color-adjust로 강제)
// 촘촘하게: A4 한두 장 안에 담기도록 여백·글자를 조이되, 표 선·볼드로 가독성 유지
const PRINT_CSS = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif; margin: 12px 14px; color: #191f28; background:#fff; }
  h1 { font-size: 17px; margin: 0 0 1px; }
  .sub { color: #8b95a1; font-size: 11px; margin-bottom: 8px; }
  .card { border: 1px solid #e5e8eb; border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; page-break-inside: avoid; }
  .card > .t { font-size: 12.5px; font-weight: 800; margin: 0 0 5px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .stats { display: flex; gap: 8px; text-align: center; }
  .stats > div { flex: 1; }
  .stats .l { font-size: 10px; color: #8b95a1; }
  .stats .v { font-size: 15px; font-weight: 800; }
  .green { color: #12b886; } .blue { color: #2272eb; } .amber { color: #ff9f1c; }
  ul { margin: 4px 0 0; padding-left: 16px; }
  li { margin: 1.5px 0; line-height: 1.35; font-size: 11.5px; }
  table { border-collapse: collapse; margin-top: 4px; width: 100%; }
  th, td { border: 1px solid #e5e8eb; padding: 1.5px 5px; font-size: 11px; text-align: center; }
  th { background: #f2f4f6; font-size: 10.5px; }
  td b { font-size: 11.5px; }
  .cols { display: flex; gap: 8px; align-items: flex-start; }
  .cols > table { flex: 1; }
  .grps { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .muted { color: #8b95a1; font-size: 11px; margin: 4px 0 0; }
  .warn { color: #f76707; font-weight: 600; }
  .grp { border: 1px solid #e5e8eb; border-radius: 8px; padding: 6px 8px; page-break-inside: avoid; }
  .grp .h { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; flex-wrap: wrap; }
  .grp .gname { font-weight: 800; font-size: 12px; }
  .grp .mem { font-size: 10.5px; color: #4e5968; }
  .grp .mem b { color: #191f28; }
  .badge { display: inline-block; border-radius: 999px; padding: 0 6px; font-size: 9.5px; font-weight: 700; background: #fff4e6; color: #f76707; margin-left: 3px; }
  @media print { .noprint { display: none; } }
`;

/** 인쇄 문서를 새 창에 연다 (공용 래퍼). body는 카드형 HTML. */
export function openPrintWindow(title: string, bodyHtml: string): void {
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
<button class="noprint" onclick="window.print()" style="padding:8px 16px;font-weight:bold;border-radius:8px;border:1px solid #d1d6db;background:#fff;cursor:pointer;margin-bottom:12px">🖨️ 인쇄 / PDF 저장</button>
${bodyHtml}
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
    // 25명 표를 2단으로 나눠 세로 공간 절약
    const half = Math.ceil(scoreRows.length / 2);
    const tbl = (rows: typeof scoreRows, offset: number) =>
      `<table><thead><tr><th>순위</th><th>이름</th><th>합계</th></tr></thead><tbody>${rows
        .map(
          (r, i) => `<tr><td>${offset + i + 1}</td><td>${esc(r.name)}</td><td><b>${r.sum}</b>점</td></tr>`
        )
        .join("")}</tbody></table>`;
    sections.push(
      card(
        `🏅 점수 요약 (집계된 ${daySnap.size}일 합산)`,
        `<div class="cols">${tbl(scoreRows.slice(0, half), 0)}${tbl(scoreRows.slice(half), half)}</div>`
      )
    );
  }

  sections.push(
    card(
      `💌 칭찬 (${allCompliments.length}건)`,
      (allCompliments.length
        ? dates
            .map((dt) => {
              const cs = byDate.get(dt)!.compliments;
              if (!cs.length) return "";
              return `<ul>${cs
                .map(
                  (c) =>
                    `<li><b>${esc(name(c.from))}</b> → <b>${esc(name(c.to))}</b>: ${esc(c.text)}</li>`
                )
                .join("")}</ul>`;
            })
            .join("")
        : `<p class="muted">칭찬 기록이 없습니다.</p>`) +
        (allCompliments.length && notPraised.length
          ? `<p class="muted warn">📌 이 기간에 칭찬을 못 받은 친구: ${notPraised.join(", ")}</p>`
          : "")
    )
  );

  const allPeerSug = dates.flatMap((dt) =>
    byDate.get(dt)!.peerSuggestions.map((c) => ({ ...c, date: dt }))
  );
  sections.push(
    card(
      `🙋 모둠원 건의 (${allPeerSug.length}건)`,
      allPeerSug.length
        ? `<ul>${allPeerSug
            .map(
              (c) =>
                `<li><b>${esc(name(c.from))}</b> → <b>${esc(name(c.to))}</b>: ${esc(c.text)}</li>`
            )
            .join("")}</ul>`
        : `<p class="muted">모둠원 건의 기록이 없습니다.</p>`
    )
  );

  const allToTeacher = dates.flatMap((dt) => byDate.get(dt)!.toTeacher.map((t) => ({ ...t, date: dt })));
  sections.push(
    card(
      `📨 선생님에게 바라는 점 (${allToTeacher.length}건)`,
      allToTeacher.length
        ? `<ul>${allToTeacher.map((t) => `<li><b>${esc(name(t.from))}</b>: ${esc(t.text)}</li>`).join("")}</ul>`
        : `<p class="muted">기록이 없습니다.</p>`
    )
  );

  sections.push(
    card(
      `📬 건의 게시판 (${suggestions.length}건)`,
      suggestions.length
        ? `<ul>${suggestions.map((s) => `<li>[${s.date}] <b>${esc(s.name)}</b>: ${esc(s.content)}</li>`).join("")}</ul>`
        : `<p class="muted">건의 기록이 없습니다.</p>`
    )
  );

  openPrintWindow(
    `${label} 학급 기록 (${start} ~ ${end})`,
    `<h1>📋 ${esc(label)} 학급 기록</h1><div class="sub">${start} ~ ${end}</div>${sections.join("\n")}`
  );
  return { days: byDate.size, compliments: allCompliments.length, suggestions: suggestions.length };
}
