"use client";
// 📖 안내 — 학급 자치 시스템 사용 설명서 (5학년 눈높이).
// 정적 콘텐츠라 DB 읽기 0 — 설정값(자리 비용·주간 권수·상점 시간 등)만
// 이미 캐시되는 settings 문서에서 가져와 화면과 숫자가 어긋나지 않게 한다.
// ⚠️ 거북이 응원 깜짝 이벤트는 서프라이즈라 여기에 쓰지 않는다 (사용자 확정).
import { useSettings } from "@/lib/query/settings";
import { requestWindowLabel } from "@/lib/requestWindow";
import { todayKST } from "@/lib/date";
import { SEMESTER_START } from "@/lib/schedule";

function Section({
  icon,
  title,
  tint,
  defaultOpen,
  children,
}: {
  icon: string;
  title: string;
  tint: string; // 아이콘 배경 (탭 시그니처 컬러와 동일 계열)
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-card border border-ink-200 bg-white shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3.5 text-[15px] font-extrabold text-ink-900 [&::-webkit-details-marker]:hidden">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${tint}`}
        >
          {icon}
        </span>
        {title}
        <span className="ml-auto shrink-0 text-xs text-ink-400 transition-transform group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="space-y-2.5 border-t border-ink-100 px-4 py-3.5 text-sm leading-relaxed text-ink-700">
        {children}
      </div>
    </details>
  );
}

function Row({ label, pts, desc }: { label: string; pts: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 rounded-btn bg-ink-50 px-3 py-2">
      <span className="w-24 shrink-0 font-bold text-ink-800">{label}</span>
      <span className="w-16 shrink-0 font-extrabold text-brand-strong tnum">{pts}</span>
      <span className="min-w-0 text-xs text-ink-600">{desc}</span>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-extrabold text-white tnum">
        {n}
      </span>
      <span>
        <b className="text-ink-900">{title}</b>{" "}
        <span className="text-xs text-ink-600">{desc}</span>
      </span>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div className="rounded-btn bg-ink-50 px-3 py-2.5">
      <p className="font-bold text-ink-800">Q. {q}</p>
      <p className="mt-1 text-xs text-ink-600">A. {a}</p>
    </div>
  );
}

export default function GuidePage() {
  const { data: settings } = useSettings();
  const quota = settings?.weeklyReadingQuota ?? 3;
  const charLimit = settings?.readingCharLimit ?? 700;
  const seatCost = settings?.seatChangeCost ?? 10;
  const windowLabel = requestWindowLabel(
    settings?.requestOpenHour ?? 16,
    settings?.requestCloseHour ?? 24
  );
  const vacation = todayKST() < SEMESTER_START;
  const startLabel = `${Number(SEMESTER_START.slice(5, 7))}월 ${Number(SEMESTER_START.slice(8, 10))}일`;

  return (
    <div className="space-y-3">
      {/* 히어로 — 이 페이지가 무엇인지 3초 안에 */}
      <section className="rounded-card bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-4 text-white shadow-card">
        <p className="text-xs font-medium opacity-90">우리 반이 어떻게 돌아가는지 궁금할 때</p>
        <h1 className="mt-0.5 text-xl font-extrabold">📖 학급 자치 시스템 사용 설명서</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed opacity-95">
          우리 반은 여러분이 <b>스스로 평가하고, 뽑고, 벌고, 쓰는</b> 작은 사회예요. 아래
          카드를 눌러 하나씩 읽어보세요 — 규칙을 아는 사람이 게임을 잘하는 법!
        </p>
      </section>

      <Section icon="🌅" title="하루는 이렇게 흘러가요" tint="bg-brand-weak" defaultOpen>
        <ol className="space-y-2">
          <Step n={1} title="낮 — 열심히 활동!" desc="부서 역할을 지키고, 친구를 돕고, 책을 읽어요." />
          <Step
            n={2}
            title="저녁 — Team 탭에서 3가지"
            desc="① 부서장 평가(내 부서 기준으로 모둠원 평가) ② 오늘의 부서장 투표 ③ 칭찬 보내기."
          />
          <Step
            n={3}
            title={`저녁 ${windowLabel} — 상점 신청`}
            desc="실버로 사고 싶은 것을 신청해요. 시간이 지나면 '예약 담기'로 미리 담을 수 있어요."
          />
          <Step
            n={4}
            title="다음 날 아침 — 선생님이 확인"
            desc="어제 점수가 집계되고, 상점 신청이 승인돼요. 점수·실버가 아침에 들어오는 이유예요!"
          />
        </ol>
        <p className="rounded-btn bg-brand-weak/60 px-3 py-2 text-xs text-brand-strong">
          💡 평가 점수와 실버는 보통 <b>다음 날 아침</b>에 들어와요 — 안 들어왔다고 걱정하지
          마세요! (🐢 독서 점수는 선생님이 그날 집계하면 바로 보여요)
        </p>
      </Section>

      <Section icon="🏅" title="점수는 어떻게 쌓여요?" tint="bg-indigo-100">
        <p>
          하루 점수(총점)는 아래를 <b>전부 더한 값</b>이에요. 매일 쌓여서 <b>누적 점수</b>가
          되고, 누적 점수가 상으로 이어져요.
        </p>
        <div className="space-y-1.5">
          <Row label="🤝 부서장 평가" pts="O/X" desc="부서장이 내 부서 O/X 기준으로 평가 — 미션 하나당 +0.5점 (둘 다 O면 +1, 마이너스 없음). 내 이름이 친구에게 보여요 (억울하면 이의제기!)" />
          <Row label="💌 칭찬하기" pts="최대 +2" desc="우리 모둠 친구를 칭찬하면 내 개인 점수! 전원 칭찬해야 만점 — 몰아주기로는 못 채워요" />
          <Row label="👑 부서장 표" pts="+1점" desc="'오늘의 부서장' 투표 최다 득표자에게 고정 +1 (이유를 꼭 적어요)" />
          <Row label="🏆 모둠 순위" pts="순위별" desc="선생님이 매긴 모둠 순위 점수 — 모둠원 전원 같이 받아요" />
          <Row label="🐢 독서" pts="1권 +2점" desc="그날 쓴 감상문 1권당 +2점 (하루 2권까지 점수)" />
          <Row label="🎯 칭찬 미션" pts="+1점" desc="우리 모둠 전원이 칭찬을 1개 이상 받으면 모둠 전체 +1" />
          <Row label="🎁 보너스" pts="±" desc="선생님이 특별히 주는(또는 빼는) 점수" />
        </div>
        <div className="space-y-1.5 rounded-btn border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-xs">
          <p>
            ⭐ <b>오늘의 MVP</b>: 총점으로 모둠 1위면 <b>+1점</b>, 학급 전체 1위면 <b>+1점
            더</b> (합 +2점)! (동점이면 모두 인정)
          </p>
          <p>
            👑 <b>오늘의 모둠</b>: 최종 총점의 모둠 합계 1위가 자동으로 타이틀을 가져가요 —
            모둠원 전원 <b>+1점</b>!
          </p>
          <p>
            🔥 <b>칭찬 연속 보너스</b>: 학교 오는 날 기준 <b>5일 연속</b> 칭찬을 보내면 +1점,{" "}
            <b>10일 연속</b>이면 +2점!
          </p>
        </div>
      </Section>

      <Section icon="💰" title="실버와 골드 — 우리 반 경제" tint="bg-pink-100">
        <p className="font-bold text-ink-900">실버 버는 법 (자동!)</p>
        <ul className="list-inside list-disc space-y-1 text-xs text-ink-600">
          <li>
            🏅 <b>누적 점수 25점</b>이 모일 때마다 실버 1개 — 점수는 그대로 있고 실버만 추가!
          </li>
          <li>🏆 2주(한 기)마다 세션 보상 — 아래 '세션과 보상' 카드에서 확인</li>
          <li>🎁 선생님이 특별히 잘한 일에 직접 지급</li>
          <li>
            💰 <b>저축 이자</b> — 세션이 끝날 때 남은 실버의 <b>10%</b>(최대 2개)를 이자로!
            아껴 모으면 돈이 돈을 벌어요
          </li>
        </ul>
        <p className="mt-1 font-bold text-ink-900">실버 쓰는 법</p>
        <ul className="list-inside list-disc space-y-1 text-xs text-ink-600">
          <li>
            🛒 상점 탭에서 메뉴 신청 → <b>다음 날 아침 선생님 승인</b> 후 사용
          </li>
          <li>💺 자리 바꾸기 (자리 탭, {seatCost}실버)</li>
          <li>
            🎒 1학기에서 가져온 <b>이월 실버</b>는 따로 보관돼요 — 2학기 실버와 절대 안 섞여요
          </li>
        </ul>
        <div className="rounded-btn border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          🥇 <b>골드는 학급 공용 재화</b>예요. 반 전체가 번 실버 25개마다 1개씩 자동으로
          쌓이고, 쓰는 건 <b>학급 회의로 정한 뒤 회장만 신청</b>할 수 있어요 (영화 시간
          같은 반 전체 보상용!).
        </div>
      </Section>

      <Section icon="🏆" title="세션(2주)과 보상" tint="bg-amber-100">
        <p>
          우리 반은 <b>2주를 한 '기(세션)'</b>로 살아요. 모둠도 2주마다 바뀌고, 기가 끝나면
          자동으로 보상이 지급돼요.
        </p>
        <div className="space-y-1.5">
          <Row label="⭐ 세션 MVP" pts="실버 1" desc="2주 동안 오늘의 MVP에 가장 많이 뽑힌 친구" />
          <Row label="👑 최고 모둠" pts="전원 1" desc="오늘의 모둠 타이틀을 가장 많이 딴 모둠 전원" />
          <Row label="🐢 최다 독서" pts="실버 1" desc="2주 동안 감상문을 가장 많이 쓴 친구" />
          <Row label="📚 독서 모둠" pts="전원 1" desc="매주, 그 주에 감상문 합계 1위인 모둠 전원 (주마다!)" />
          <Row label="🎯 미션 모둠" pts="전원 1" desc="칭찬 미션을 가장 많이 성공한 모둠 전원" />
          <Row label="📈 성장상" pts="실버 1" desc="지난 기보다 총점이 가장 많이 오른 친구 (2기부터)" />
          <Row label="🔥 스트릭" pts="점수" desc={`주간 독서 목표(${quota}권)를 연속 달성하면 1·2·3점 보너스`} />
        </div>
        <p className="text-xs text-ink-500">동점이면 모두 받아요. 지급은 기가 끝난 다음 주에 자동!</p>
      </Section>

      <Section icon="🐢" title="거북이 독서 마라톤" tint="bg-emerald-100">
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            감상문 <b>1권 = 그날 점수 +2점 + 학급 권수 +1권</b> (점수는 하루 2권까지, 권수는
            제한 없이 쓴 만큼 인정!)
          </li>
          <li>
            정식 등록은 본문 네 칸을 합쳐 <b>{charLimit}자 이상</b> — 정성이 기준이에요.
          </li>
          <li>
            개요 탭의 <b>학급 마라톤 바</b>는 1학기부터 이어지는 우리 반 전체 기록이에요.
            목표를 채우면… 짜파게티 파티! 🍜
          </li>
          <li>
            내가 쓴 글은 작성한 날에만 스스로 지울 수 있어요. 지우면 권수·점수도 같이
            돌아가요.
          </li>
          {vacation ? (
            <li>
              🏖️ <b>지금은 방학 모드</b> — 쓴 만큼 계속 쌓여요! 주간 미션({quota}권)과 연속
              보너스는 개학({startLabel})부터 시작돼요.
            </li>
          ) : (
            <li>
              📅 매주 <b>{quota}권</b>이 주간 미션 — 연속으로 채우면 스트릭 보너스 점수가
              커져요 (1주 1점 → 2주 2점 → 3주부터 3점).
            </li>
          )}
        </ul>
      </Section>

      <Section icon="💺" title="자리 바꾸기" tint="bg-amber-100">
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            자리는 <b>2주(한 기) 단위</b>로만 바꿀 수 있어요 — 비용은 <b>{seatCost}실버</b>.
          </li>
          <li>
            신청 마감은 <b>자리가 바뀌는 주의 전주 수요일 자정</b>까지. 늦으면 다음 기회에!
          </li>
          <li>같은 자리를 여러 명이 원하면 <b>먼저 신청한 사람</b>이 가져가요 (선착순).</li>
          <li>
            승인될 때 실버가 나가니 <b>{seatCost}실버는 남겨두고</b> 상점을 쓰는 게 요령!
          </li>
        </ul>
      </Section>

      <Section icon="🤝" title="모둠과 부서 — 평가는 왜 할까?" tint="bg-orange-100">
        <ul className="list-inside list-disc space-y-1.5">
          <li>모둠은 2주마다 새로 짜여요. 모둠 안에서 각자 <b>부서(역할)</b>를 맡아요.</li>
          <li>
            <b>부서장 평가</b>는 점수 주기 놀이가 아니에요. 부서장으로서{" "}
            <b>"내 부서 O/X 기준을 친구가 지켰나"</b>를 사실대로 체크해요 — 미션 하나당
            +0.5점 (둘 다 O면 +1, 마이너스 없음). <b>내가 준 평가는 친구에게 실명으로
            보여요.</b> 사실과
            다르면 친구가 <b>이의제기</b>할 수 있으니, 좋고 싫음이 아니라 기준대로!
          </li>
          <li>
            <b>오늘의 부서장 투표</b>는 오늘 부서 일을 가장 잘한 사람에게! 최다 득표자에게
            고정 +1점이고, <b>이유를 꼭 적어요</b>.
          </li>
          <li>
            <b>칭찬</b>은 두 가지로 점수가 돼요: ① 내가 <b>우리 모둠 친구를 칭찬하면</b> 내
            개인 점수(전원 칭찬해야 +2 만점!) ② 우리 모둠 <b>전원이 칭찬받으면</b> 모둠 전체
            +1점. 그래서 한 명도 빼놓지 않고 챙길수록 이득이에요.
          </li>
          <li>부서별 역할이 궁금하면 <b>헌법 탭 → 역할</b>에서 확인!</li>
        </ul>
      </Section>

      <Section icon="📝" title="게시판·투표로 학급 바꾸기" tint="bg-sky-100">
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <b>건의 탭</b>: 학급에 바라는 점을 올려요. <b>🔒 선생님만 보기</b>를 켜면 친구들
            모르게 선생님께만 전할 수 있어요.
          </li>
          <li>
            <b>📜 법률 제안</b>: 건의 탭에서 우리 부서 법을 직접 만들어 올려요 — 채택되면
            헌법 탭의 그 부서 법이 돼요.
          </li>
          <li>
            <b>🕵️ 숨은 기여 추천</b>: 티 안 나게 좋은 일을 한 친구를 건의 탭에서 추천해요.
            친구들이 👍로 공감하면 선생님이 금요일에 실버로 보상해요.
          </li>
          <li>
            <b>투표 탭</b>: 학급 규칙·행사를 우리 손으로 정해요. 투표로 정한 건 헌법 탭에
            기록돼요.
          </li>
          <li>
            <b>독서 탭 게시판</b>: 친구들 감상문을 읽고 응원 댓글을 달 수 있어요 (1학기 글은
            보관용이라 댓글이 안 달려요).
          </li>
        </ul>
      </Section>

      <Section icon="❓" title="자주 묻는 질문" tint="bg-ink-100">
        <div className="space-y-2">
          <Faq
            q="어제 점수가 아직 안 보여요!"
            a="점수는 선생님이 접속할 때 자동으로 집계돼요 — 보통 다음 날 아침이면 들어와요."
          />
          <Faq
            q="상점 신청했는데 실버가 그대로예요."
            a="신청은 '대기' 상태예요. 다음 날 아침 선생님이 승인하면 그때 실버가 나가요. 대기 중인 만큼은 미리 잡아둬서 이중으로 못 써요."
          />
          <Faq
            q="감상문을 지우면 어떻게 돼요?"
            a="권수와 점수가 같이 돌아가요. 내가 지울 수 있는 건 그날 쓴 글뿐이에요."
          />
          <Faq
            q="골드는 왜 나 혼자 못 써요?"
            a="골드는 반 전체가 함께 모은 공용 재화라서요. 학급 회의에서 쓸 곳을 정한 뒤 회장이 대표로 신청해요."
          />
          <Faq
            q="비밀번호를 까먹었어요."
            a="로그인 화면에서 '비밀번호를 잊었어요'를 누르면 선생님께 재설정 요청이 가요."
          />
          <Faq
            q="더 궁금한 게 있어요!"
            a={
              <>
                <b>건의 탭</b>에 올려주세요 — 좋은 질문은 이 설명서에도 추가할게요! 😊
              </>
            }
          />
        </div>
      </Section>

      <p className="pb-2 text-center text-[11px] text-ink-400">
        이 설명서는 우리 반 설정이 바뀌면 숫자도 함께 바뀌어요 (자리 비용·독서 목표 등)
      </p>
    </div>
  );
}
