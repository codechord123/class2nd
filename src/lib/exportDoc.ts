"use client";
// 오늘의 칭찬/건의 인쇄 (요구사항 v2 §6) — 새 창에 인쇄용 문서를 열어
// 브라우저 인쇄 → "PDF로 저장"으로 알림장에 바로 첨부할 수 있게 한다.
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { students, studentById } from "@/lib/roster";

interface Compliment {
  from: number;
  to: number;
  text: string;
}

export async function openDailyPrintDoc(date: string): Promise<{ compliments: number; suggestions: number }> {
  const d = db();
  // 칭찬: 그날 평가 문서들의 _compliment 필드 (교사만 실행 — 최대 25문서)
  const evalSnap = await getDocs(collection(d, "evaluations", date, "entries"));
  const compliments: Compliment[] = [];
  evalSnap.forEach((entry) => {
    const c = entry.data()._compliment as { to: number; text: string } | undefined;
    if (c) compliments.push({ from: Number(entry.id), ...c });
  });
  const praised = new Set(compliments.map((c) => c.to));
  const notPraised = students.filter((s) => !praised.has(s.id)).map((s) => s.name);

  // 건의: 그날 작성분
  const start = new Date(date + "T00:00:00+09:00").getTime();
  const sugSnap = await getDocs(
    query(
      collection(d, "suggestions"),
      where("createdAt", ">=", start),
      where("createdAt", "<", start + 86400000)
    )
  );
  const suggestions = sugSnap.docs.map((s) => {
    const v = s.data();
    return {
      name: v.isAnonymous ? "익명" : (studentById.get(v.studentId)?.name ?? "?"),
      content: String(v.content ?? ""),
    };
  });

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${date} 칭찬·건의 모음</title>
<style>
  body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; margin: 32px; color: #222; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 24px; border-bottom: 2px solid #eee; padding-bottom: 4px; }
  li { margin: 6px 0; line-height: 1.5; }
  .muted { color: #888; font-size: 13px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<button class="noprint" onclick="window.print()" style="padding:8px 16px;font-weight:bold">🖨️ 인쇄 / PDF 저장</button>
<h1>💌 ${date} 오늘의 칭찬 · 건의</h1>
<h2>칭찬 (${compliments.length}건)</h2>
${
  compliments.length
    ? `<ul>${compliments
        .map(
          (c) =>
            `<li><b>${esc(studentById.get(c.from)?.name ?? "?")}</b> → <b>${esc(
              studentById.get(c.to)?.name ?? "?"
            )}</b>: ${esc(c.text)}</li>`
        )
        .join("")}</ul>`
    : `<p class="muted">오늘 칭찬 기록이 없습니다.</p>`
}
${notPraised.length && compliments.length ? `<p class="muted">📌 아직 칭찬을 못 받은 친구: ${notPraised.join(", ")}</p>` : ""}
<h2>건의 (${suggestions.length}건)</h2>
${
  suggestions.length
    ? `<ul>${suggestions.map((s) => `<li><b>${esc(s.name)}</b>: ${esc(s.content)}</li>`).join("")}</ul>`
    : `<p class="muted">오늘 건의 기록이 없습니다.</p>`
}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("팝업이 차단되었어요. 팝업 허용 후 다시 시도해주세요.");
  win.document.write(html);
  win.document.close();
  return { compliments: compliments.length, suggestions: suggestions.length };
}
