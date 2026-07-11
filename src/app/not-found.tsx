import Link from "next/link";

// 404 — 주소를 잘못 치거나 지워진 링크로 들어온 학생을 위한 안내 (기본 영문 페이지 대체)
export default function NotFound() {
  return (
    <section className="rounded-card border border-ink-200 bg-white px-6 py-14 text-center shadow-card">
      <p className="text-5xl">🐢💨</p>
      <h1 className="mt-4 text-xl font-extrabold text-ink-900">이 페이지는 없어요!</h1>
      <p className="mt-2 text-sm text-ink-500">
        주소가 잘못됐거나 옮겨진 페이지예요. 홈으로 돌아가서 다시 찾아봐요.
      </p>
      <Link
        href="/"
        className="press mt-6 inline-block rounded-btn bg-brand px-6 py-2.5 text-sm font-bold text-white"
      >
        🏠 홈으로 가기
      </Link>
    </section>
  );
}
