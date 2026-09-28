"use client";
// ✍️ 쓴 만큼 자라는 입력칸.
// 고정 rows는 칸 '안에서' 스크롤이 생겨, 아이 입장에선 방금 쓴 문장이 위로 사라진다
// ("칸이 작아서 쓰기 어렵다" — 2026-09-28 현장 피드백). 높이를 내용에 맞춰 늘리면
// 쓴 글이 항상 통째로 보이고, 남은 화면도 낭비하지 않는다.
// maxRows를 넘어가면 그때부터만 스크롤 — 화면을 다 잡아먹지 않게.
import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  value: string;
  minRows?: number;
  maxRows?: number;
};

export default function AutoTextarea({
  value,
  minRows = 5,
  maxRows = 18,
  className = "",
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 레이아웃 단계에서 높이를 맞춘다 — paint 뒤에 하면 한 프레임 깜빡인다.
  // value 의존이라 임시저장 복원처럼 '내가 타이핑하지 않은' 변경도 함께 따라온다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 24;
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const minH = line * minRows + padY + borderY;
    const maxH = line * maxRows + padY + borderY;
    el.style.height = "auto"; // 줄어들 때도 다시 재려면 먼저 풀어야 한다
    const want = el.scrollHeight + borderY; // scrollHeight = 내용 + 안쪽 여백 (테두리 제외)
    el.style.height = `${Math.min(Math.max(want, minH), maxH)}px`;
    el.style.overflowY = want > maxH ? "auto" : "hidden";
  }, [value, minRows, maxRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={`resize-none ${className}`}
      {...rest}
    />
  );
}
