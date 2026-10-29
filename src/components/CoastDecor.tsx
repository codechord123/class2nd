// 🌊 바닷마을 테마의 헤더 장식 띠 — 언덕 위 파스텔 집들 · 테라코타 지붕 · 종탑 · 바다 · 작은 배 · 레몬.
// 테마가 꺼져 있으면 CSS로 숨는다(.coast-decor) — 서버 렌더 그대로, 상태·읽기 없음.
// 작은 화면에선 가운데(바다·배)를 중심으로 양옆이 잘린다(preserveAspectRatio slice).

const PASTEL = ["#F6BD94", "#F4A6A6", "#F7DC6F", "#A8D5BA", "#9CC9E4", "#F3C9A8", "#E9A9C0", "#FBE3A1"];
const ROOF = "#C2553A";
const SHUTTER = "#2F7E79";

/** 집 한 채 — x(왼쪽), base(바닥 y), w·h, 색 */
function House({ x, base, w, h, fill }: { x: number; base: number; w: number; h: number; fill: string }) {
  const y = base - h;
  const winRows = h > 20 ? 2 : 1;
  const winCols = w > 26 ? 2 : 1;
  const wins = [];
  for (let r = 0; r < winRows; r++)
    for (let c = 0; c < winCols; c++)
      wins.push(
        <g key={`${r}-${c}`}>
          <rect x={x + 5 + c * ((w - 10) / Math.max(1, winCols)) } y={y + 6 + r * 9} width={3.2} height={4.4} fill="#FFFDF8" />
          <rect x={x + 3.6 + c * ((w - 10) / Math.max(1, winCols))} y={y + 6 + r * 9} width={1.2} height={4.4} fill={SHUTTER} />
          <rect x={x + 8.4 + c * ((w - 10) / Math.max(1, winCols))} y={y + 6 + r * 9} width={1.2} height={4.4} fill={SHUTTER} />
        </g>,
      );
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} />
      <rect x={x - 1} y={y - 2.4} width={w + 2} height={2.8} fill={ROOF} />
      {wins}
    </g>
  );
}

// 결정적인(매번 같은) 집 배치 — 랜덤이면 서버/클라이언트 렌더가 달라진다
function row(from: number, to: number, base: number, seed: number) {
  const out: { x: number; w: number; h: number; fill: string; base: number }[] = [];
  let x = from;
  let i = seed;
  while (x < to) {
    const w = 20 + ((i * 7) % 15);
    const h = 14 + ((i * 11) % 17);
    out.push({ x, w, h, base, fill: PASTEL[i % PASTEL.length] });
    x += w + 1;
    i++;
  }
  return out;
}

const BACK_L = row(30, 470, 30, 3);
const FRONT_L = row(60, 500, 37, 0);
const BACK_R = row(770, 1150, 30, 5);
const FRONT_R = row(745, 1170, 37, 2);

export default function CoastDecor() {
  return (
    <div className="coast-decor" aria-hidden>
      <svg viewBox="0 0 1200 48" preserveAspectRatio="xMidYMax slice" className="block h-10 w-full sm:h-12">
        {/* 언덕 */}
        <path d="M0 48 L0 24 Q120 12 260 16 Q420 20 520 34 L540 48 Z" fill="#EBDCC2" />
        <path d="M1200 48 L1200 22 Q1080 10 940 16 Q800 22 720 36 L700 48 Z" fill="#EBDCC2" />
        {/* 뒷줄 집 (옅게) */}
        <g opacity={0.75}>
          {BACK_L.map((h, i) => <House key={`bl${i}`} {...h} />)}
          {BACK_R.map((h, i) => <House key={`br${i}`} {...h} />)}
        </g>
        {/* 종탑 */}
        <g>
          <rect x={255} y={4} width={12} height={30} fill="#E8B57A" />
          <path d="M253 5 Q261 -3 269 5 Z" fill={ROOF} />
          <rect x={259} y={9} width={4} height={5} fill="#7A4B2A" />
        </g>
        {/* 앞줄 집 */}
        {FRONT_L.map((h, i) => <House key={`fl${i}`} {...h} />)}
        {FRONT_R.map((h, i) => <House key={`fr${i}`} {...h} />)}
        {/* 바다 */}
        <rect x={0} y={37} width={1200} height={11} fill="#7CC8D2" />
        <rect x={0} y={42} width={1200} height={6} fill="#4FAFBE" />
        <path
          d="M0 37.5 q15 -2.5 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1}
          opacity={0.8}
        />
        {/* 작은 고깃배 */}
        <g transform="translate(600 33)">
          <path d="M-14 5 L14 5 L10 10 L-10 10 Z" fill="#FFFDF8" />
          <rect x={-10} y={7} width={20} height={1.4} fill="#C2553A" />
          <rect x={-0.6} y={-8} width={1.2} height={13} fill="#7A4B2A" />
          <path d="M0.6 -7 L9 3 L0.6 3 Z" fill="#F7DC6F" />
        </g>
        {/* 레몬 가지 */}
        <g transform="translate(1176 14)">
          <path d="M-14 -6 Q-4 -2 4 8" stroke="#5C7F3B" strokeWidth={1.2} fill="none" />
          <ellipse cx={-6} cy={1} rx={4.2} ry={3} fill="#F2C94C" />
          <ellipse cx={2} cy={6} rx={4.2} ry={3} fill="#F2C94C" />
          <ellipse cx={-10} cy={-6} rx={3.6} ry={1.6} fill="#6E9A45" transform="rotate(-25 -10 -6)" />
        </g>
      </svg>
    </div>
  );
}
