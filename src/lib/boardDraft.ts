// ✏️ 건의 게시판 임시저장 — 쓰다 만 글을 '이 기기에' 남긴다.
//
// 왜 Firestore가 아니라 localStorage인가:
//   막으려는 사고는 "길게 썼는데 탭을 잘못 눌러서·새로고침돼서 날아갔다" 하나다.
//   그건 기기 안에서 끝나는 문제라 localStorage로 100% 막히고, 읽기·쓰기가 0이다.
//   감상문(readingDrafts)은 여러 날에 걸쳐 쓰는 긴 글이라 서버 초안이 맞지만,
//   건의글은 대개 한자리에서 쓰고 끝내므로 서버 초안은 읽기 예산만 축낸다.
//   (기기를 옮겨 이어 쓰는 요구가 생기면 그때 서버 초안으로 올리면 된다)
//
// 🔒 디벗은 여러 아이가 돌려 쓰므로 키에 반드시 작성자를 넣는다 — 안 그러면
//    다음에 쓰는 아이 화면에 남의 초안이 복원된다.
export interface BoardDraft {
  at: number; // 마지막 저장 시각
  kind: "general" | "law" | "hidden";
  title: string;
  content: string;
  teacherOnly: boolean;
  announce: boolean;
  dept: string | null;
  lawTitle: string;
  lawClauses: string[];
  hiddenTarget: number | null;
}

const PREFIX = "class2nd-board-draft-";
const KEEP_DAYS = 7; // 일주일 지난 초안은 되살리지 않는다 (엉뚱한 글이 튀어나오는 걸 방지)

export function draftKeyOf(role: string | null, studentId: number | null): string | null {
  if (role === "teacher") return `${PREFIX}teacher`;
  if (role === "student" && studentId != null) return `${PREFIX}s${studentId}`;
  return null; // 로그인 전에는 저장하지 않는다
}

/** 되살릴 내용이 있는가 — 빈 초안을 저장·복원하지 않기 위한 단일 판정 */
export function hasDraftContent(d: BoardDraft | null): d is BoardDraft {
  if (!d) return false;
  return !!(
    d.title.trim() ||
    d.content.trim() ||
    d.lawTitle.trim() ||
    d.lawClauses.some((c) => c.trim())
  );
}

export function loadBoardDraft(key: string | null): BoardDraft | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<BoardDraft>;
    if (typeof d.at !== "number" || Date.now() - d.at > KEEP_DAYS * 86400000) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      at: d.at,
      kind: d.kind === "law" || d.kind === "hidden" ? d.kind : "general",
      title: typeof d.title === "string" ? d.title : "",
      content: typeof d.content === "string" ? d.content : "",
      teacherOnly: !!d.teacherOnly,
      announce: !!d.announce,
      dept: typeof d.dept === "string" ? d.dept : null,
      lawTitle: typeof d.lawTitle === "string" ? d.lawTitle : "",
      lawClauses: Array.isArray(d.lawClauses) ? d.lawClauses.map(String) : [""],
      hiddenTarget: typeof d.hiddenTarget === "number" ? d.hiddenTarget : null,
    };
  } catch {
    return null; // 사파리 프라이빗 등 localStorage가 막힌 환경 — 임시저장만 조용히 포기
  }
}

export function saveBoardDraft(key: string | null, d: Omit<BoardDraft, "at">): number | null {
  if (!key) return null;
  const at = Date.now();
  try {
    if (!hasDraftContent({ ...d, at })) {
      localStorage.removeItem(key);
      return null;
    }
    localStorage.setItem(key, JSON.stringify({ ...d, at }));
    return at;
  } catch {
    return null;
  }
}

export function clearBoardDraft(key: string | null): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
}

/** "오후 3:20" 같은 짧은 시각 — 같은 날이 아니면 날짜까지 */
export function draftTimeLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`;
}
