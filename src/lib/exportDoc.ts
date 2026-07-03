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

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const name = (id: number | string) => studentById.get(Number(id))?.name ?? `?${id}`;

/** 아직 집계 전인 날짜의 칭찬/바라는점을 원시 평가에서 직접 수집 */
async function liveDayExtras(date: string) {
  const snap = await getDocs(collection(db(), "evaluations", date, "entries"));
  const compliments: Compliment[] = [];
  const toTeacher: ToTeacher[] = [];
  snap.forEach((entry) => {
    const d = entry.data();
    const c = d._compliment as { to: number; text: string } | undefined;
    if (c?.text) compliments.push({ from: Number(entry.id), to: c.to, text: c.text });
    if (typeof d._toTeacher === "string" && d._toTeacher)
      toTeacher.push({ from: Number(entry.id), text: d._toTeacher });
  });
  return { compliments, toTeacher };
}

export async function openRangePrintDoc(
  start: string,
  end: string,
  label: string
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
    { compliments: Compliment[]; toTeacher: ToTeacher[]; rows?: Record<string, DailyScoreRow> }
  >();
  const scoreSum: Record<string, number> = {};
  daySnap.forEach((day) => {
    const data = day.data();
    const meta = (data._meta ?? {}) as { compliments?: Compliment[]; toTeacher?: ToTeacher[] };
    byDate.set(day.id, {
      compliments: meta.compliments ?? [],
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
    if (extras.compliments.length || extras.toTeacher.length) byDate.set(today, extras);
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

  const sections: string[] = [];

  if (hasScores) {
    sections.push(`<h2>점수 요약 (집계된 ${daySnap.size}일 합산)</h2>
<table><thead><tr><th>순위</th><th>이름</th><th>합계</th></tr></thead><tbody>
${scoreRows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.sum}점</td></tr>`).join("")}
</tbody></table>`);
  }

  sections.push(`<h2>💌 칭찬 (${allCompliments.length}건)</h2>
${
  allCompliments.length
    ? dates
        .map((dt) => {
          const cs = byDate.get(dt)!.compliments;
          if (!cs.length) return "";
          return `<h3>${dt}</h3><ul>${cs
            .map((c) => `<li><b>${esc(name(c.from))}</b> → <b>${esc(name(c.to))}</b>: ${esc(c.text)}</li>`)
            .join("")}</ul>`;
        })
        .join("")
    : `<p class="muted">칭찬 기록이 없습니다.</p>`
}
${allCompliments.length && notPraised.length ? `<p class="muted">📌 이 기간에 칭찬을 못 받은 친구: ${notPraised.join(", ")}</p>` : ""}`);

  const allToTeacher = dates.flatMap((dt) => byDate.get(dt)!.toTeacher.map((t) => ({ ...t, date: dt })));
  sections.push(`<h2>🙏 선생님에게 바라는 점 (${allToTeacher.length}건)</h2>
${
  allToTeacher.length
    ? `<ul>${allToTeacher.map((t) => `<li>[${t.date}] <b>${esc(name(t.from))}</b>: ${esc(t.text)}</li>`).join("")}</ul>`
    : `<p class="muted">기록이 없습니다.</p>`
}`);

  sections.push(`<h2>📬 건의 (${suggestions.length}건)</h2>
${
  suggestions.length
    ? `<ul>${suggestions.map((s) => `<li>[${s.date}] <b>${esc(s.name)}</b>: ${esc(s.content)}</li>`).join("")}</ul>`
    : `<p class="muted">건의 기록이 없습니다.</p>`
}`);

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(label)} 학급 기록 (${start} ~ ${end})</title>
<style>
  body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; margin: 32px; color: #222; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 24px; border-bottom: 2px solid #eee; padding-bottom: 4px; }
  h3 { font-size: 13px; color: #555; margin: 12px 0 4px; }
  li { margin: 5px 0; line-height: 1.5; }
  table { border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ddd; padding: 4px 12px; font-size: 13px; text-align: center; }
  .muted { color: #888; font-size: 13px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<button class="noprint" onclick="window.print()" style="padding:8px 16px;font-weight:bold">🖨️ 인쇄 / PDF 저장</button>
<h1>📋 ${esc(label)} 학급 기록 <span style="font-size:13px;color:#888">(${start} ~ ${end})</span></h1>
${sections.join("\n")}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("팝업이 차단되었어요. 팝업 허용 후 다시 시도해주세요.");
  win.document.write(html);
  win.document.close();
  return { days: byDate.size, compliments: allCompliments.length, suggestions: suggestions.length };
}
