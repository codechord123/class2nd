// 🌊 바닷마을 테마의 머리 풍경 — 언덕을 타고 오르는 파스텔 마을 · 종탑 · 사이프러스 · 빨랫줄 · 항구,
// 태양 · 구름 · 갈매기 · 출렁이는 바다 · 흔들리는 돛배. 움직임은 globals.css의 CSS 애니메이션.
// 테마가 꺼져 있으면 CSS로 숨는다(.coast-decor) — 서버 렌더 그대로, 상태·읽기 없음.
// 좁은 화면에선 가운데(언덕 마을 꼭대기 ~ 항구 ~ 돛배)가 남고 양옆이 잘린다(preserveAspectRatio slice).

const PASTEL = ["#F6BD94", "#F4A6A6", "#F7DC6F", "#A8D5BA", "#9CC9E4", "#F3C9A8", "#E9A9C0", "#FBE3A1", "#C9B6E4"];
const ROOF = "#C2553A";
const SHUTTER = "#2F7E79";
const CYPRESS = "#3F6B3A";

type H = { x: number; w: number; h: number; fill: string; base: number; arch: boolean };

/** 집 한 채 — 덧창 달린 창문(가끔 아치 창), 테라코타 지붕 */
function House({ x, base, w, h, fill, arch }: H) {
  const y = base - h;
  const cols = w > 24 ? 2 : 1;
  const rows = h > 22 ? 2 : 1;
  const gap = (w - 8) / cols;
  const wins = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const wx = x + 4 + c * gap + gap / 2 - 1.8;
      const wy = y + 5 + r * 10;
      wins.push(
        <g key={`${r}-${c}`}>
          <rect x={wx} y={wy} width={3.6} height={5} fill="#FFFDF8" />
          {arch && r === rows - 1 && <circle cx={wx + 1.8} cy={wy} r={1.8} fill="#FFFDF8" />}
          <rect x={wx - 1.5} y={wy} width={1.3} height={5} fill={SHUTTER} />
          <rect x={wx + 3.8} y={wy} width={1.3} height={5} fill={SHUTTER} />
        </g>,
      );
    }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} />
      <rect x={x - 1.2} y={y - 2.6} width={w + 2.4} height={3} rx={0.6} fill={ROOF} />
      {wins}
    </g>
  );
}

// 결정적인(매번 같은) 집 배치 — 랜덤이면 서버/클라이언트 렌더가 달라진다
function row(from: number, to: number, base: number, seed: number, hMin = 16): H[] {
  const out: H[] = [];
  let x = from;
  let i = seed;
  while (x < to) {
    const w = 18 + ((i * 7) % 14);
    const h = hMin + ((i * 11) % 14);
    out.push({ x, w, h, base, fill: PASTEL[i % PASTEL.length], arch: i % 3 === 0 });
    x += w + 1;
    i++;
  }
  return out;
}

// 언덕을 타고 층층이 — 뒤(위)에서 앞(아래) 순서로 그린다
const HILL_ROWS = [
  row(352, 500, 42, 4, 14),
  row(282, 572, 57, 1, 15),
  row(206, 628, 72, 6),
  row(128, 652, 87, 2, 18),
];
const CLIFF_ROW = row(1018, 1200, 60, 3, 14);

function Cypress({ x, base, h }: { x: number; base: number; h: number }) {
  return <ellipse cx={x} cy={base - h / 2} rx={h / 6.5} ry={h / 2} fill={CYPRESS} />;
}

/** 집 사이 빨랫줄 */
function Laundry({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const mid = (x1 + x2) / 2;
  const cloth = ["#F4A6A6", "#FFFFFF", "#9CC9E4", "#F7DC6F"];
  return (
    <g>
      <path d={`M${x1} ${y} Q${mid} ${y + 4} ${x2} ${y}`} stroke="#8a7560" strokeWidth={0.5} fill="none" />
      {cloth.map((c, i) => {
        const cx = x1 + ((x2 - x1) * (i + 1)) / (cloth.length + 1);
        return <rect key={i} x={cx - 1.6} y={y + 1.6} width={3.2} height={i % 2 ? 4 : 3} fill={c} />;
      })}
    </g>
  );
}

const Gull = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path
    className="riv-gull-wing"
    d={`M${x - 5 * s} ${y} q${2.5 * s} ${-3 * s} ${5 * s} 0 q${2.5 * s} ${-3 * s} ${5 * s} 0`}
    stroke="#4a4a4a"
    strokeWidth={0.9}
    fill="none"
    strokeLinecap="round"
  />
);

// 물결 한 줄 — 주기 40, 바깥으로 넉넉히 그려서 옆으로 흘려도 빈틈이 없다
const wave = (y: number, amp: number) =>
  `M-80 ${y} ` + Array.from({ length: 35 }, () => `q10 ${-amp} 20 0 t20 0`).join(" ") + ` V120 H-80 Z`;

export default function CoastDecor() {
  return (
    <div className="coast-decor" aria-hidden>
      <svg
        viewBox="0 0 1200 110"
        preserveAspectRatio="xMidYMax slice"
        className="coast-scene block w-full"
      >
        {/* 태양 · 구름 */}
        <circle cx={872} cy={34} r={26} fill="#FFE3A3" opacity={0.45} />
        <circle cx={872} cy={34} r={14} fill="#FFD27A" />
        <g className="riv-cloud">
          <g fill="#FFFFFF" opacity={0.92}>
            <ellipse cx={180} cy={26} rx={22} ry={7} />
            <ellipse cx={194} cy={21} rx={13} ry={8} />
            <ellipse cx={720} cy={18} rx={18} ry={6} />
            <ellipse cx={731} cy={14} rx={10} ry={6} />
            <ellipse cx={1080} cy={24} rx={20} ry={6} />
          </g>
        </g>
        {/* 갈매기 — 이따금 하늘을 가로지른다 */}
        <g className="riv-gulls riv-gulls-a">
          <Gull x={0} y={30} />
          <Gull x={16} y={24} s={0.8} />
        </g>
        <g className="riv-gulls riv-gulls-b">
          <Gull x={0} y={44} s={0.9} />
        </g>

        {/* 언덕 · 곶 */}
        <path d="M0 110 L0 74 Q90 64 170 58 Q300 34 430 28 Q540 32 618 62 Q648 76 680 90 L680 110 Z" fill="#E9D6B4" />
        <path d="M940 110 L960 84 Q990 64 1040 60 Q1110 52 1200 48 L1200 110 Z" fill="#DCC29C" />
        <Cypress x={190} base={72} h={26} />
        <Cypress x={200} base={73} h={20} />
        <Cypress x={1004} base={74} h={24} />
        <Cypress x={600} base={64} h={22} />

        {/* 마을 — 뒷줄은 살짝 옅게 */}
        {HILL_ROWS.map((r, ri) => (
          <g key={ri} opacity={0.8 + ri * 0.07}>
            {r.map((h, i) => (
              <House key={i} {...h} />
            ))}
            {ri === 0 && (
              // 종탑 — 마을 꼭대기
              <g>
                <rect x={418} y={6} width={14} height={36} fill="#E8B57A" />
                <path d="M416 7 L425 -3 L434 7 Z" fill={ROOF} />
                <rect x={422} y={11} width={6} height={7} rx={3} fill="#7A4B2A" />
                <circle cx={425} cy={26} r={2.6} fill="#FFFDF8" />
              </g>
            )}
          </g>
        ))}
        {CLIFF_ROW.map((h, i) => (
          <House key={`c${i}`} {...h} />
        ))}
        <Laundry x1={262} x2={300} y={62} />
        <Laundry x1={470} x2={508} y={77} />
        <Laundry x1={1070} x2={1102} y={50} />

        {/* 항구 둑 · 매어 둔 배 */}
        <rect x={110} y={86} width={560} height={5} fill="#D9C6A5" />
        <rect x={110} y={86} width={560} height={1.2} fill="#C7B08A" />
        <g>
          <path d="M300 92 L318 92 L315 96 L303 96 Z" fill="#E8684A" />
          <path d="M340 92 L356 92 L353 96 L343 96 Z" fill="#4FAFBE" />
          <path d="M620 92 L637 92 L634 96 L623 96 Z" fill="#F7DC6F" />
        </g>
        {/* 작은 바위섬 */}
        <path d="M806 92 Q816 80 830 82 Q842 84 850 92 Z" fill="#B9A27E" />

        {/* 바다 — 두 겹의 물결이 서로 다른 속도로 흐른다 */}
        <rect x={0} y={89} width={1200} height={21} fill="#7CC8D2" />
        <g className="riv-wave riv-wave-back">
          <path d={wave(90, 2.4)} fill="#93D3DB" />
        </g>
        <g className="riv-wave riv-wave-front">
          <path d={wave(97, 2)} fill="#4FAFBE" />
        </g>

        {/* 돛배 — 물결 따라 까딱까딱 */}
        <g transform="translate(740 88)">
          <g className="riv-boat">
            <path d="M-16 4 L16 4 L11 10 L-11 10 Z" fill="#FFFDF8" />
            <rect x={-11} y={6.5} width={22} height={1.4} fill={ROOF} />
            <rect x={-0.6} y={-12} width={1.2} height={16} fill="#7A4B2A" />
            <path d="M0.6 -11 L11 2 L0.6 2 Z" fill="#F7DC6F" />
            <path d="M-0.6 -8 L-8 2 L-0.6 2 Z" fill="#F4A6A6" />
          </g>
        </g>

        {/* 레몬 가지 */}
        <g transform="translate(1172 10)">
          <path d="M-18 -8 Q-6 -2 4 10" stroke="#5C7F3B" strokeWidth={1.3} fill="none" />
          <ellipse cx={-7} cy={1} rx={5} ry={3.6} fill="#F2C94C" />
          <ellipse cx={2} cy={8} rx={5} ry={3.6} fill="#F2C94C" />
          <ellipse cx={-13} cy={-7} rx={4.2} ry={1.8} fill="#6E9A45" transform="rotate(-25 -13 -7)" />
          <ellipse cx={-2} cy={-3} rx={3.6} ry={1.6} fill="#6E9A45" transform="rotate(30 -2 -3)" />
        </g>
      </svg>
    </div>
  );
}
