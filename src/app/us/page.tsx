"use client";
// 🌈 나와 우리 — 사회정서학습(SEL) 탭. 위에서 아래로 '반 → 나 → 우리 → 다시 나' 흐름:
//   🌤️ 우리 반 마음 날씨(익명) → 🧭 내 마음 이름 붙이기 → 💗 오늘의 마음 담벼락 → 📅 나의 감정 달력
// 감정 체크 0~5(비공개)와는 별개다 — 여기서 나누는 건 아이가 '고른' 감정 단어뿐이다.
// 설계 근거는 src/lib/query/moodShare.ts 머리말 참고.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/stores/session";
import { useSettings, useSaveSettings } from "@/lib/query/settings";
import { students, studentById } from "@/lib/roster";
import { todayKST } from "@/lib/date";
import { friendlyWriteError } from "@/lib/auth";
import { useSendToTeacher } from "@/lib/query/letters";
import {
  MOOD_COLORS,
  NOTE_MAX,
  REACTIONS,
  WEATHER_MIN,
  checkNote,
  colorInfo,
  useDeleteCard,
  useHideCard,
  useMoodCards,
  useMoodSelf,
  usePostCard,
  useReact,
  useWeather,
  weatherSplit,
  type MoodCard,
  type MoodColor,
} from "@/lib/query/moodShare";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Collapsible from "@/components/ui/Collapsible";
import { useFeedback } from "@/components/ui/Feedback";
import MoodCalendar from "@/components/us/MoodCalendar";

const nm = (id: number) => studentById.get(id)?.name ?? `${id}번`;
const hhmm = (ts: number) => {
  const d = new Date(ts + 9 * 3600000);
  const h = d.getUTCHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export default function UsPage() {
  const { role, studentId } = useSession();
  const isTeacher = role === "teacher";
  const myId = role === "student" ? studentId : null;
  const today = todayKST();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const wallOpen = settings?.moodWallOpen !== false;

  const { data: weather } = useWeather(today, !!role);
  const { data: cards, isLoading, error, isFetching } = useMoodCards(today, !!role && (wallOpen || isTeacher));
  // 달력 주인: 학생은 본인, 선생님은 고른 학생 (선생님 모드에서 달력이 통째로 사라지던 문제 — 2026-10-09)
  const [calPick, setCalPick] = useState<number>(() => students.find((s) => !s.inactive)?.id ?? 1);
  const calId = myId ?? (isTeacher ? calPick : null);
  const { data: self } = useMoodSelf(calId);
  const post = usePostCard(today, myId);
  const react = useReact(today, myId);
  const del = useDeleteCard(today);
  const hide = useHideCard(today);
  const sendToTeacher = useSendToTeacher(myId);

  const mine = cards?.find((c) => c.sid === myId);
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState<MoodColor | null>(null);
  const [word, setWord] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [risk, setRisk] = useState(false);

  const w = weatherSplit(weather);
  const myMoodToday = self?.byDate?.[today]?.v;

  // 보이는 카드: 학생은 가려진 카드를 못 본다(본인 것은 '가려졌어요'로 보임). 최신이 위.
  const visible = useMemo(
    () =>
      [...(cards ?? [])]
        .filter((c) => isTeacher || !c.hidden || c.sid === myId)
        .sort((a, b) => b.at - a.at),
    [cards, isTeacher, myId]
  );

  if (!role) {
    return (
      <Card title="🌈 나와 우리">
        <EmptyState emoji="🔒" title="로그인하면 열려요" />
      </Card>
    );
  }

  function startEdit(c?: MoodCard) {
    setEditing(true);
    setColor(c?.color ?? null);
    setWord(c?.word ?? null);
    setNote(c?.note ?? "");
    setRisk(false);
  }

  async function share() {
    if (!word || !color || busy) return;
    const chk = checkNote(note, myId);
    if (!chk.ok) {
      if (chk.kind === "risk") return setRisk(true);
      if (chk.kind === "bad") return toast("고운 말로 바꿔 줄래요? 담벼락은 모두가 함께 보는 곳이에요.", "warn");
      return toast(`친구 이름(${chk.name})은 빼고 '내 마음'만 적어 주세요.`, "warn");
    }
    setBusy(true);
    try {
      await post(word, color, note);
      setEditing(false);
      toast("🌈 마음을 나눴어요. 친구들이 공감해 줄 거예요.", "success");
    } catch (e) {
      toast(friendlyWriteError(e, "올리지 못했어요."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toTeacher() {
    if (!word || busy) return;
    setBusy(true);
    try {
      await sendToTeacher(`[마음 카드] 오늘 내 마음은 "${word}"${note.trim() ? `\n${note.trim()}` : ""}`);
      setEditing(false);
      setRisk(false);
      setNote("");
      toast("💌 선생님께만 전했어요. 선생님이 꼭 읽어볼 거예요.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleWall() {
    if (!settings || busy) return;
    setBusy(true);
    try {
      await saveSettings({ ...settings, moodWallOpen: !wallOpen });
      toast(wallOpen ? "⏸️ 담벼락을 잠시 닫았어요." : "🌈 담벼락을 열었어요.", "success");
    } catch (e) {
      toast(friendlyWriteError(e, "저장 실패"), "error");
    } finally {
      setBusy(false);
    }
  }

  const composer = editing || (!mine && myId != null);

  return (
    <div className="space-y-4">
      {/* 🌤️ 우리 반 마음 날씨 — 이름도 숫자도 없이 '비율'만. 혼자가 아니라는 감각이 목적이다 */}
      <Card
        title="🌤️ 오늘 우리 반 마음 날씨"
        desc="모둠 탭에서 고른 기분이 이름 없이 모여요. 누가 어떤지는 아무도 몰라요."
      >
        {w.total < WEATHER_MIN ? (
          <p className="mt-3 rounded-btn bg-ink-50 px-3 py-3 text-sm text-ink-500">
            🌫️ 아직 날씨를 알 수 없어요 — {WEATHER_MIN}명 이상 기분을 고르면 보여요.
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-5xl leading-none">{w.icon}</span>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-ink-900">오늘은 {w.label}</p>
                <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                  <span className="bg-amber-300" style={{ width: `${(w.sun / w.total) * 100}%` }} />
                  <span className="bg-ink-300" style={{ width: `${(w.cloud / w.total) * 100}%` }} />
                  <span className="bg-sky-400" style={{ width: `${(w.rain / w.total) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-ink-400">☀️ 맑음 · ⛅ 구름 · 🌧️ 비</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-ink-600">
              {w.rain > 0
                ? "🌧️ 마음에 비가 오는 친구도 있어요. 오늘은 말 한마디를 조금 더 따뜻하게!"
                : w.cloud > w.sun
                  ? "⛅ 조금 흐린 하루예요. 서로 천천히, 부드럽게 대해요."
                  : "☀️ 반이 환해요! 이 기분을 친구에게도 나눠 볼까요?"}
            </p>
          </>
        )}
        {myId != null && myMoodToday == null && (
          <Link href="/team" className="mt-2 inline-block text-xs font-bold text-brand-strong underline">
            아직 오늘 기분을 안 골랐어요 → 모둠 탭에서 고르기
          </Link>
        )}
      </Card>

      {/* 🧭 내 마음 이름 붙이기 */}
      {myId != null && (
        <Card
          title="🧭 지금 내 마음에 이름을 붙여 볼까요?"
          desc="'좋다·나쁘다'보다 정확한 이름을 찾으면 마음이 한결 정리돼요."
        >
          {!wallOpen ? (
            <p className="mt-3 rounded-btn bg-ink-50 px-3 py-2.5 text-sm text-ink-500">
              ⏸️ 지금은 담벼락이 잠시 쉬고 있어요. 하고 싶은 말은{" "}
              <Link href="/letters" className="font-bold text-brand-strong underline">
                💌 우체통
              </Link>
              으로 선생님께 전해 주세요.
            </p>
          ) : !composer && mine ? (
            <div className="mt-3">
              <WallCard card={mine} myId={myId} isTeacher={false} />
              {mine.hidden ? (
                <p className="mt-2 text-xs text-ink-500">
                  선생님이 이 카드를 잠시 가렸어요. 궁금하면 선생님께 물어보세요.
                </p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => startEdit(mine)}
                    className="press min-h-11 flex-1 rounded-btn bg-ink-100 px-3 text-sm font-bold text-ink-700"
                  >
                    마음이 바뀌었어요 (고치기)
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("담벼락에서 내 카드를 내릴까요?")) return;
                      try {
                        await del(mine.sid);
                        toast("카드를 내렸어요.", "success");
                      } catch (e) {
                        toast(friendlyWriteError(e, "내리지 못했어요."), "error");
                      }
                    }}
                    className="press min-h-11 rounded-btn bg-white px-3 text-sm font-bold text-ink-500 ring-1 ring-ink-200"
                  >
                    내리기
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* 무드미터 2×2 — 위=에너지 높음, 오른쪽=편안·즐거움 */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {MOOD_COLORS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => {
                      setColor(c.key);
                      if (!c.words.includes(word ?? "")) setWord(null);
                    }}
                    className={`press rounded-card p-3 text-left ring-1 transition ${c.tile} ${
                      color === c.key ? "ring-2 ring-offset-1 ring-ink-800" : ""
                    } ${color && color !== c.key ? "opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                      <b className={`text-[15px] ${c.text}`}>{c.title}</b>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-500">{c.hint}</span>
                  </button>
                ))}
              </div>

              {color && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {colorInfo(color).words.map((x) => (
                    <button
                      key={x}
                      onClick={() => setWord(x)}
                      className={`press min-h-11 rounded-full px-3.5 text-sm font-bold ring-1 ${
                        word === x
                          ? `bg-white ring-2 ring-ink-800 ${colorInfo(color).text}`
                          : `bg-white ring-ink-200 ${colorInfo(color).text}`
                      }`}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              )}

              {word && (
                <>
                  <input
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value.slice(0, NOTE_MAX));
                      setRisk(false);
                    }}
                    placeholder="왜 그런 마음이 들었나요? (선택 · 친구 이름 말고 내 이야기만)"
                    className="mt-3 w-full rounded-btn border border-ink-300 px-3 py-2.5 text-[15px]"
                  />
                  <p className="mt-1 text-right text-[11px] text-ink-400 tnum">
                    {note.length}/{NOTE_MAX}
                  </p>

                  {risk ? (
                    <div className="mt-2 rounded-btn bg-rose-50 p-3 ring-1 ring-rose-200">
                      <p className="text-[13px] font-bold text-rose-800">
                        이 이야기는 선생님이 꼭 알고 싶어요. 담벼락 대신 선생님께만 전할게요.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void toTeacher()}
                          disabled={busy}
                          className="press min-h-11 flex-1 rounded-btn bg-rose-600 px-3 text-sm font-bold text-white disabled:opacity-40"
                        >
                          💌 선생님께만 보내기
                        </button>
                        <button
                          onClick={() => setRisk(false)}
                          className="press min-h-11 rounded-btn bg-white px-3 text-sm font-bold text-ink-600 ring-1 ring-ink-200"
                        >
                          다시 쓸게요
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void share()}
                        disabled={busy}
                        className="press min-h-11 flex-1 rounded-btn bg-brand px-3 text-sm font-bold text-white disabled:opacity-40"
                      >
                        {busy ? "올리는 중…" : "🌈 반에 나누기"}
                      </button>
                      <button
                        onClick={() => void toTeacher()}
                        disabled={busy}
                        className="press min-h-11 rounded-btn bg-pink-50 px-3 text-sm font-bold text-pink-700 ring-1 ring-pink-200 disabled:opacity-40"
                      >
                        💌 선생님께만
                      </button>
                    </div>
                  )}
                </>
              )}
              {editing && (
                <button
                  onClick={() => setEditing(false)}
                  className="press mt-2 w-full text-xs font-bold text-ink-400"
                >
                  취소
                </button>
              )}
              <p className="mt-2 text-[11px] text-ink-400">
                나누기는 자유예요. 안 나눠도 괜찮고, 점수와도 상관없어요.
              </p>
            </>
          )}
        </Card>
      )}

      {/* 💗 오늘의 마음 담벼락 */}
      <Card
        title="💗 오늘의 마음 담벼락"
        desc="오늘 나눈 마음만 보여요. 내일이 되면 새 담벼락이 열려요."
        action={
          <button
            onClick={() => void qc.invalidateQueries({ queryKey: ["moodCards", today] })}
            disabled={isFetching}
            className="press min-h-11 rounded-btn bg-ink-100 px-3 text-xs font-bold text-ink-600 disabled:opacity-50"
          >
            {isFetching ? "…" : "새로고침"}
          </button>
        }
      >
        {isTeacher && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-btn bg-ink-50 px-3 py-2">
            <span className="text-xs text-ink-600">
              갈등이 생기면 잠시 닫을 수 있어요 (날씨·감정 달력은 그대로)
            </span>
            <button
              onClick={() => void toggleWall()}
              disabled={busy || !settings}
              className={`press rounded-btn px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
                wallOpen ? "bg-ink-500" : "bg-rose-600"
              }`}
            >
              {wallOpen ? "⏸️ 열림 — 눌러서 닫기" : "🔒 닫힘 — 눌러서 열기"}
            </button>
          </div>
        )}

        {error ? (
          <p className="mt-3 rounded-btn bg-rose-50 px-3 py-2.5 text-[13px] font-bold text-rose-700">
            ⚠️ 담벼락을 불러오지 못했어요
            {isTeacher && " — Firebase 콘솔에 최신 firestore.rules를 게시해 주세요."}
          </p>
        ) : !wallOpen && !isTeacher ? (
          <EmptyState emoji="⏸️" title="담벼락이 잠시 쉬고 있어요" />
        ) : isLoading ? (
          <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>
        ) : visible.filter((c) => c.sid !== myId || isTeacher).length === 0 ? (
          <EmptyState
            emoji="🌱"
            title="아직 친구들이 나눈 마음이 없어요"
            desc={myId != null ? "첫 마음을 나눠 볼래요?" : "아이들이 마음을 나누면 여기에 모여요."}
          />
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {visible
              .filter((c) => c.sid !== myId)
              .map((c) => (
                <li key={c.sid}>
                  <WallCard
                    card={c}
                    myId={myId}
                    isTeacher={isTeacher}
                    onReact={async (k) => {
                      try {
                        await react(c, k);
                      } catch (e) {
                        toast(friendlyWriteError(e, "반응하지 못했어요."), "error");
                      }
                    }}
                    onHide={async () => {
                      try {
                        await hide(c.sid, !c.hidden);
                      } catch (e) {
                        toast(friendlyWriteError(e, "실패"), "error");
                      }
                    }}
                    onDelete={async () => {
                      if (!confirm(`${nm(c.sid)}의 카드를 지울까요? (되돌릴 수 없어요)`)) return;
                      try {
                        await del(c.sid);
                      } catch (e) {
                        toast(friendlyWriteError(e, "실패"), "error");
                      }
                    }}
                  />
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* 📅 감정 달력 — 학생은 본인 것, 선생님은 학생을 골라서. 접혀 있으면 '사라졌다'로 보여 기본 펼침 */}
      {calId != null && (
        <Collapsible title={isTeacher ? "📅 학생 감정 달력" : "📅 나의 감정 달력"} defaultOpen>
          {isTeacher && (
            <select
              value={calPick}
              onChange={(e) => setCalPick(Number(e.target.value))}
              className="mb-3 min-h-11 w-full rounded-btn border border-ink-300 px-3 text-sm font-bold"
              aria-label="달력을 볼 학생"
            >
              {students
                .filter((s) => !s.inactive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}번 {s.name}
                  </option>
                ))}
            </select>
          )}
          <MoodCalendar data={self} today={today} />
        </Collapsible>
      )}

      {/* 🤝 마음 나눔 약속 — 첫 주에 수업으로 다루는 기준선 */}
      <section className="rounded-card bg-ink-50 p-4 text-[13px] text-ink-600">
        <p className="font-bold text-ink-800">🤝 마음 나눔 약속</p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
          <li>
            <b>내 마음만</b> 적어요. 친구 이름은 쓰지 않아요.
          </li>
          <li>
            친구 마음엔 <b>공감 반응</b>만 해요. 놀리거나 따지지 않아요.
          </li>
          <li>
            힘든 이야기는 <b>💌 선생님께만</b> 보내도 돼요. 선생님이 꼭 도와줄게요.
          </li>
        </ol>
      </section>
    </div>
  );
}

function WallCard({
  card,
  myId,
  isTeacher,
  onReact,
  onHide,
  onDelete,
}: {
  card: MoodCard;
  myId: number | null;
  isTeacher: boolean;
  onReact?: (k: (typeof REACTIONS)[number]["key"]) => void;
  onHide?: () => void;
  onDelete?: () => void;
}) {
  const c = colorInfo(card.color);
  const mineCard = card.sid === myId;
  const myReaction = myId != null ? card.r[String(myId)] : undefined;
  const counts = REACTIONS.map((x) => ({
    ...x,
    who: Object.entries(card.r)
      .filter(([, k]) => k === x.key)
      .map(([id]) => Number(id)),
  }));
  const total = Object.keys(card.r).length;

  return (
    <div
      className={`overflow-hidden rounded-card border bg-white ${card.hidden ? "border-dashed border-ink-300 opacity-60" : "border-ink-200"}`}
    >
      <div className="flex">
        <span className={`w-1.5 shrink-0 ${c.dot}`} aria-hidden />
        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[12px] font-bold text-brand-strong">
              {nm(card.sid)}
            </span>
            <span className="text-[11px] text-ink-400">{hhmm(card.at)}</span>
            {card.hidden && <span className="text-[11px] font-bold text-ink-500">가려짐</span>}
          </div>
          <p className={`mt-1.5 text-[17px] font-extrabold ${c.text}`}>{card.word}</p>
          {card.note && (
            <p className="mt-0.5 break-words text-[14px] leading-relaxed text-ink-700">{card.note}</p>
          )}

          {/* 반응 — 내 카드엔 '누가' 공감했는지 이름까지(받는 기쁨), 남의 카드엔 개수만 */}
          {mineCard ? (
            total > 0 ? (
              <p className="mt-2 text-xs text-ink-600">
                {counts
                  .filter((x) => x.who.length)
                  .map((x) => `${x.emoji} ${x.who.map(nm).join(", ")}`)
                  .join("  ")}
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-400">아직 반응이 없어요</p>
            )
          ) : (
            <div className="mt-2 flex flex-wrap gap-1">
              {counts.map((x) => (
                <button
                  key={x.key}
                  onClick={() => onReact?.(x.key)}
                  disabled={myId == null || card.hidden}
                  title={isTeacher ? x.who.map(nm).join(", ") : undefined}
                  className={`press inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold ring-1 disabled:cursor-default ${
                    myReaction === x.key
                      ? "bg-brand-weak text-brand-strong ring-brand"
                      : "bg-white text-ink-600 ring-ink-200"
                  }`}
                >
                  <span>{x.emoji}</span>
                  <span>{x.label}</span>
                  {x.who.length > 0 && <span className="tnum">{x.who.length}</span>}
                </button>
              ))}
            </div>
          )}

          {isTeacher && (
            <div className="mt-2 flex gap-1.5 border-t border-ink-100 pt-2">
              <button
                onClick={onHide}
                className="press rounded-btn bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-600"
              >
                {card.hidden ? "다시 보이기" : "가리기"}
              </button>
              <button
                onClick={onDelete}
                className="press rounded-btn bg-white px-2.5 py-1 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200"
              >
                지우기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
