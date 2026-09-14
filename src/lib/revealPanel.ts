// 🔎 교사 화면 딥링크 — 탭을 바꾼 뒤 '그 패널까지' 데려다준다.
// 탭만 바꾸면 대상 패널이 접힌 <details> 안이나 스크롤 한참 아래에 있어서
// 교사 눈에는 아무 일도 안 일어난 것처럼 보인다 (2026-09-14 사용자 지적:
// "교사가 클릭하면 보이지 않아. 뜨지 않아"). 그래서 ① 조상 <details>를 모두 펼치고
// ② 스크롤해서 보여준 뒤 ③ 잠깐 테두리를 빛나게 해 시선을 붙잡는다.
export function revealPanel(id: string, tries = 0): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  // 탭 전환 직후엔 아직 렌더 전일 수 있다 — 다음 프레임에 몇 번 다시 시도
  if (!el) {
    if (tries < 20) requestAnimationFrame(() => revealPanel(id, tries + 1));
    return;
  }
  for (let p = el.parentElement; p; p = p.parentElement)
    if (p instanceof HTMLDetailsElement) p.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("reveal-flash");
  window.setTimeout(() => el.classList.remove("reveal-flash"), 2200);
}
