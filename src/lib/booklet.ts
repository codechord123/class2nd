"use client";
// 감상문 모음집(출판용) — 학생 한 명의 2학기 감상문 전체를 '책' 레이아웃으로 엮는다.
// 30권 넘은 아이들의 감상문을 모아 실제 책으로 출판하려는 계획 대비:
//   표지 → 차례 → 감상문(장별, 인쇄 페이지 나눔) → 판권 페이지.
//   명조(바탕) 계열 + 넉넉한 행간 + 양쪽 정렬 = 단행본 본문 조판 문법.
// 읽기 예산: 교사가 버튼을 누를 때만 해당 학생 감상문 쿼리 1회 (등호 필터만 — 복합 색인 불필요).
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { esc } from "@/lib/exportDoc";
import type { ReadingReport2 } from "@/lib/query/reading";

/** 한 학생의 정식 감상문 전체 (작성순) — 정렬은 클라이언트에서 (색인 불필요) */
export async function fetchStudentReports(sid: number): Promise<ReadingReport2[]> {
  const snap = await getDocs(
    query(collection(db(), "readingReports"), where("studentId", "==", sid))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ReadingReport2, "id">) }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

// 책 조판 CSS — 화면(미리보기)과 인쇄가 같은 결이 되도록 단일 스타일
const BOOK_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Noto Serif KR", "Batang", "바탕", "Apple SD Gothic Neo", serif;
         color: #222; margin: 0; background: #fff; line-height: 1.95; }
  .sheet { max-width: 660px; margin: 0 auto; padding: 24px 22px 48px; }
  /* 표지 */
  .cover { text-align: center; padding: 110px 0 70px; page-break-after: always; }
  .cover .cls { font-size: 13px; letter-spacing: .35em; color: #888; }
  .cover h1 { font-size: 33px; margin: 20px 0 10px; letter-spacing: .04em; line-height: 1.5; }
  .cover .subtitle { font-size: 15px; color: #555; }
  .cover .stats { display: inline-block; margin-top: 30px; padding: 8px 22px; font-size: 13.5px;
                  color: #333; border-top: 1px solid #222; border-bottom: 1px solid #222; }
  .cover .turtle { font-size: 46px; margin-top: 46px; }
  /* 차례 */
  .toc { page-break-after: always; }
  .toc h2 { font-size: 20px; letter-spacing: .2em; border-bottom: 2px solid #222; padding-bottom: 8px; }
  .toc ol { list-style: none; padding: 0; margin: 18px 0 0; }
  .toc li { display: flex; gap: 10px; align-items: baseline; font-size: 14px; margin: 8px 0; }
  .toc .n { font-weight: 700; min-width: 26px; }
  .toc .dots { flex: 1; border-bottom: 1px dotted #bbb; min-width: 24px; }
  .toc .d { color: #888; font-size: 12px; white-space: nowrap; }
  /* 감상문 장(章) */
  .chapter { page-break-before: always; padding-top: 26px; }
  .chnum { font-size: 12px; letter-spacing: .3em; color: #999; margin: 0; }
  .chapter h2 { font-size: 24px; margin: 8px 0 4px; line-height: 1.45; word-break: keep-all; }
  .chmeta { font-size: 13px; color: #777; margin: 0; }
  hr.rule { border: 0; border-top: 1px solid #ddd; margin: 16px 0 4px; }
  .sec h3 { font-size: 12.5px; color: #555; letter-spacing: .18em; margin: 22px 0 6px; font-weight: 700; }
  .sec p { font-size: 14.5px; margin: 0; white-space: pre-wrap; word-break: break-word;
           text-align: justify; }
  blockquote { margin: 24px 12px; padding: 2px 18px; border-left: 3px solid #222;
               font-style: italic; font-size: 15px; color: #333; white-space: pre-wrap;
               word-break: break-word; }
  /* 판권 */
  .colophon { page-break-before: always; text-align: center; padding: 150px 0; color: #777;
              font-size: 13px; line-height: 2.2; }
  @media print { .noprint { display: none; } }
`;

/** 학기 구분 없이 감상문 한 편을 책의 한 장(章)으로 — 1·2학기를 함께 엮기 위한 정규형 */
export interface BookletEntry {
  title: string;
  author?: string;
  publisher?: string;
  dateStr: string; // 표시용 날짜 (예: "1학기 · 6월 11일", "2026년 9월 3일")
  summary?: string;
  scene?: string;
  quote?: string;
  thoughts?: string;
}

export function s2ReportToEntry(r: ReadingReport2): BookletEntry {
  const d = new Date(r.createdAt);
  return {
    title: r.title, author: r.author, publisher: r.publisher,
    dateStr: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
    summary: r.summary, scene: r.scene, quote: r.quote, thoughts: r.thoughts,
  };
}

/** 감상문집을 새 창에 연다 → 브라우저 인쇄/PDF 저장 (출판 원고로 바로 사용 가능) */
export function openBooklet(
  studentName: string,
  entries: BookletEntry[],
  counts: { s1: number; s2: number; totalBooks: number }
): void {
  const num = (i: number) => String(i + 1).padStart(2, "0");

  const toc = entries
    .map(
      (r, i) =>
        `<li><span class="n">${num(i)}</span><span>${esc(r.title)}</span><span class="dots"></span><span class="d">${esc(r.dateStr)}</span></li>`
    )
    .join("");

  const sec = (label: string, text?: string) =>
    text?.trim() ? `<div class="sec"><h3>${label}</h3><p>${esc(text)}</p></div>` : "";

  const chapters = entries
    .map((r, i) => {
      const meta = [
        r.author?.trim() && `${esc(r.author)} 지음`,
        r.publisher?.trim() && esc(r.publisher),
        esc(r.dateStr),
      ]
        .filter(Boolean)
        .join(" · ");
      return `<div class="chapter">
  <p class="chnum">${num(i)}</p>
  <h2>${esc(r.title)}</h2>
  <p class="chmeta">${meta}</p>
  <hr class="rule">
  ${sec("줄거리", r.summary)}
  ${sec("인상 깊은 장면", r.scene)}
  ${r.quote?.trim() ? `<blockquote>“${esc(r.quote)}”</blockquote>` : ""}
  ${sec("읽고 난 생각", r.thoughts)}
</div>`;
    })
    .join("\n");

  const title = `${studentName}의 독서 감상문집`;
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${BOOK_CSS}</style></head><body>
<div class="sheet">
<button class="noprint" onclick="window.print()" style="padding:8px 16px;font-weight:bold;border-radius:8px;border:1px solid #d1d6db;background:#fff;cursor:pointer;margin-bottom:12px">🖨️ 인쇄 / PDF 저장</button>
<div class="cover">
  <p class="cls">거 북 이 독 서</p>
  <h1>${esc(studentName)}의<br>독서 감상문집</h1>
  <p class="subtitle">거북이처럼 꾸준히, 한 권 한 권</p>
  <div class="stats">감상문 ${entries.length}편 (1학기 ${counts.s1} · 2학기 ${counts.s2}) — 읽은 책 모두 ${counts.totalBooks}권</div>
  <div class="turtle">🐢</div>
</div>
<div class="toc"><h2>차 례</h2><ol>${toc}</ol></div>
${chapters}
<div class="colophon">
  이 책은 ${esc(studentName)} 학생이 한 해 동안 쓴<br>
  감상문 ${entries.length}편을 모아 엮었습니다.<br><br>
  🐢
</div>
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("팝업이 차단되었어요. 팝업 허용 후 다시 시도해주세요.");
  win.document.write(html);
  win.document.close();
}
