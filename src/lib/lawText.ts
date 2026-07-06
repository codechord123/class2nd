// 학급 법률(대한민국 법령 형식) 텍스트 헬퍼 — 헌법 탭·건의 게시판 공용.
// 저장 문자열: "제N조(부제) ① … ② …" · 편집 구조: { title, clauses[] }

export const CIRCLED_NUMS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".split("");

export interface LawEdit {
  title: string; // 조 제목(괄호 부제)
  clauses: string[]; // 항별 내용 (① ② …)
}

/** 저장 문자열 "제N조(부제) ① … ② …" → 편집 구조 {title, clauses}.
 *  <개정…>·[메타]는 편집 폼에서 다루지 않으므로 버린다 (표시엔 영향 없음). */
export function toLawEdit(text: string): LawEdit {
  const main = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
  const first = main.search(/[①-⑳]/);
  const head = (first >= 0 ? main.slice(0, first) : main).trim();
  const title = head.match(/\(([^)]*)\)/)?.[1] ?? head.replace(/^제\s*\d+\s*조\s*/, "").trim();
  const clauses =
    first >= 0
      ? main
          .slice(first)
          .split(/(?=[①-⑳])/)
          .map((s) => s.replace(/^[①-⑳]\s*/, "").trim())
          .filter(Boolean)
      : [];
  return { title, clauses: clauses.length ? clauses : [""] };
}

/** 항 내용 배열 → "① … ② …" (조 번호·제목 없이 항만) */
export function serializeClauses(clauses: string[]): string {
  return clauses
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c, i) => `${CIRCLED_NUMS[i] ?? "①"} ${c}`)
    .join(" ");
}

/** 편집 구조 → 저장 문자열 (조 번호는 순서대로 자동) */
export function fromLawEdit(law: LawEdit, idx: number): string {
  const head = `제${idx + 1}조(${law.title.trim() || "제목"})`;
  const body = serializeClauses(law.clauses);
  return body ? `${head} ${body}` : head;
}

/** 조 제목 + 항 배열을 완전한 조문으로 조합 (건의 채택 시 조 번호 부여) */
export function composeClause(num: number, title: string, clausesOrText: string): string {
  const head = `제${num}조(${title.trim() || "제목"})`;
  const body = clausesOrText.trim();
  return body ? `${head} ${body}` : head;
}

export const isEmptyLaw = (l: LawEdit) => !l.title.trim() && !l.clauses.some((c) => c.trim());
