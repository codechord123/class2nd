// 🛡️ 친구가 읽는 글 검사 — 칭찬·건의·게시판 글/댓글·감상문 댓글에 공통 적용.
// 실사례(2026-10-26): 칭찬하기에 일본어로 욕을 써서 모둠원 4명에게 보냄 — "일본어라 모르겠지?"라고
// 쓴 것까지 있어, 선생님·친구가 못 읽는 글자를 '숨기는 수단'으로 썼다. 그래서 두 겹으로 막는다:
//   ① 외국 글자 차단: 한글·영어 알파벳·숫자·문장부호·이모지만 허용 (일본어·중국어·러시아어 등 차단)
//   ② 비속어 차단: 띄어쓰기·문장부호·숫자를 빼고 대조 — "시 발", "시.발", "시1발"도 잡는다
// 클라이언트 검사라 기기를 조작하면 우회할 수 있다 — 그래서 교사 '칭찬 점검'에도 🚩로 다시 표시한다.

/** 한글·라틴(영어) 외의 문자 체계 — 숫자·문장부호·이모지는 Common/Inherited라 허용된다 */
const FOREIGN = /[^\p{Script=Hangul}\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

// 학교에서 실제로 쓰이는 욕·비하 표현 (변형 포함). 칭찬에 정상적으로 들어갈 법한 말은 넣지 않는다
// (예: '장애인'은 "장애인 친구를 도와줘서"처럼 쓰일 수 있어 제외, '바보'는 장난 표현이라 제외).
const BAD_KO = [
  "시발", "씨발", "씨바", "시바", "쓰발", "씌발", "씨빨", "시빨", "ㅅㅂ", "ㅆㅂ", "ㅅㅃ",
  "병신", "븅신", "빙신", "ㅂㅅ", "등신", "애자", "찐따",
  "개새", "개색", "개세끼", "개쉐", "새끼", "쌔끼", "색끼", "ㅅㄲ",
  "존나", "졸라", "ㅈㄴ", "좆", "좃", "지랄", "ㅈㄹ",
  "꺼져", "꺼지라", "닥쳐", "ㄷㅊ", "미친", "ㅁㅊ", "또라이", "돌아이",
  "느금", "니애미", "니엄마", "애미", "애비", "엠창", "패드립",
  "뒤져", "뒤질", "죽을래", "죽여", "못생", "대머리", "급식충",
];
const BAD_EN = ["fuck", "shit", "bitch", "asshole", "stupid", "idiot", "ugly", "loser", "dumb", "shutup"];

const squash = (t: string) => t.toLowerCase().replace(/[\s\p{P}\p{S}\d]/gu, "");

export type TextFlag = "foreign" | "bad";

/** 문제 종류만 돌려준다 — 교사 점검 화면의 🚩 표시용 */
export function textFlag(text: string): TextFlag | null {
  if (!text) return null;
  if (FOREIGN.test(text)) return "foreign";
  const s = squash(text);
  if (BAD_KO.some((w) => s.includes(w)) || BAD_EN.some((w) => s.includes(w))) return "bad";
  return null;
}

export const FLAG_LABEL: Record<TextFlag, string> = { foreign: "🚩외국어", bad: "🚩비속어" };

/** 저장 전에 부른다 — 문제가 있으면 아이가 이해할 말로 Error를 던진다 */
export function guardText(text: string, what = "글"): void {
  const f = textFlag(text);
  if (f === "foreign")
    throw new Error(`${what}은(는) 우리말로 써 주세요 — 일본어·중국어 같은 외국 글자는 쓸 수 없어요.`);
  if (f === "bad")
    throw new Error(`친구에게 상처가 될 수 있는 말이 들어 있어요. 고운 말로 바꿔 주세요.`);
}
