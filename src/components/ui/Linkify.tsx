"use client";
// 본문 텍스트의 URL을 자동으로 클릭 가능한 링크로 렌더 (1학기 차용 — 레드팀 4인 합의).
// 순수 클라이언트 렌더 함수라 비용 0. 패들렛·설문 링크가 죽은 텍스트가 되지 않게 한다.
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']{2,})/g;

export default function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const href = part.startsWith("http") ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}
