/**
 * Player Agency PA1 view: the takeover dialog with the coach's call, your read and four choices, and the coach's
 * feedback line after the game. Pure HTML / strings. No odds and no expected values are shown: the read is what
 * the player believes he sees (blurred by his basketball IQ), never the grader's numbers.
 */
import { esc } from "../../core/html.js";
import { autonomyTier } from "../../reborn/agency.js";

const T = (zh, en, lang) => (lang === "en" ? en : zh);

function callLabel(call, lang) {
  const who = esc(call.targetName || "");
  if (call.action === "post_entry") return T(`把球交给内线 ${who}`, `Feed the post to ${who}`, lang);
  if (call.action === "find_shooter") return T(`找射手 ${who} 投三分`, `Find ${who} for three`, lang);
  return T(`交给 ${who} 单打`, `Clear out for ${who}`, lang);
}

function coachLine(coach, lang) {
  if (!coach) return "";
  const name = esc(lang === "en" ? coach.nameEn || coach.name : coach.name);
  const style = coach.tolerance < 0.35
    ? T("强调纪律，不轻易给新人自由", "big on discipline, slow to give a newcomer freedom", lang)
    : coach.tolerance > 0.6
      ? T("鼓励球员自己读比赛", "wants players to read the game themselves", lang)
      : T("看你的判断说话", "judges you by your reads", lang);
  return `${name} · ${style}`;
}

const READ_TEXT = {
  pullup: ["你的防守人退了半步，急停跳投有机会", "Your man sagged half a step: the pull-up is there"],
  drive: ["护框的人没站好位置，突破有空间", "The rim protector is out of position: there is room to drive"],
  follow: ["教练要的那个点确实有机会", "The coach's look is really there"],
  pass: ["看不出明显的机会，最好再读一读", "Nothing obvious yet: better to keep reading"],
};

function observationLine(obs, lang) {
  const [zh, en] = READ_TEXT[obs.pick] || READ_TEXT.pass;
  const prefix = obs.clarity === "cloudy" ? T("你看得不太清楚：", "You can't quite tell: ", lang) : obs.clarity === "sharp" ? T("你看得很清楚：", "You see it clearly: ", lang) : "";
  return prefix + T(zh, en, lang);
}

function optionLabel(id, context, lang) {
  if (id === "follow") return [T("执行教练战术", "Run the coach's call", lang), callLabel(context.coachInstruction, lang)];
  if (id === "drive") return [T("自主判断", "Your own read", lang), T("突破上篮", "Drive to the rim", lang)];
  if (id === "pullup") return [T("自主判断", "Your own read", lang), T("急停跳投", "Pull-up jumper", lang)];
  return [T("继续阅读防守", "Keep reading", lang), T("让进攻流动，找更好的机会", "Let the offense flow for a better look", lang)];
}

/** The agency version of the takeover dialog. */
export function agencyDialogHtml({ sim, lang = "zh", context }) {
  const youSide = sim?.youSide || "home";
  const oppSide = youSide === "home" ? "away" : "home";
  const score = sim?.score || { home: 0, away: 0 };
  const clock = Number(sim?.clock) || 0;
  const mmss = `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, "0")}`;
  const q = Number(sim?.quarter) || 4;
  const call = context.coachInstruction;
  const coachCard = call
    ? `<div class="reborn-agency-card reborn-agency-coach"><b>${T("教练指令", "Coach's call", lang)}</b><p>「${callLabel(call, lang)}」</p><small>${coachLine(context.coach, lang)}</small></div>`
    : `<div class="reborn-agency-card reborn-agency-coach reborn-agency-nocall"><b>${T("教练指令", "Coach's call", lang)}</b><p>${T("教练没有新的指令——按球队的原则，你自己判断。这不算违背教练。", "No new call from the bench: play the team's principles on your own read. That is not defying the coach.", lang)}</p></div>`;
  const readCard = `<div class="reborn-agency-card reborn-agency-read"><b>${T("你的观察", "Your read", lang)}</b><p>${observationLine(context.observation, lang)}</p><small>${T("观察的准确度取决于你的球商", "How sharp this is depends on your basketball IQ", lang)}</small></div>`;
  const tier = autonomyTier(context.playerState?.autonomy);
  const buttons = context.options.map((id, i) => {
    const [kind, label] = optionLabel(id, context, lang);
    return `<button type="button" class="reborn-takeover-option" data-option="${id}" data-key="${i + 1}"><span class="reborn-takeover-key">${i + 1}</span> <span class="reborn-takeover-desc">${kind}</span> <span class="reborn-takeover-label">${label}</span></button>`;
  }).join("");
  return `<div class="reborn-takeover-dialog reborn-agency" role="dialog" aria-modal="true" aria-label="${T("关键回合", "Takeover moment", lang)}">`
    + `<h2>${T("关键回合，你决定怎么打", "Clutch possession: your call", lang)}</h2>`
    + `<p class="reborn-takeover-situation">${q <= 4 ? `Q${q}` : `OT${q - 4}`} ${mmss} · ${score[youSide]} – ${score[oppSide]}</p>`
    + coachCard + readCard
    + `<div class="reborn-takeover-options">${buttons}</div>`
    + `<p class="reborn-takeover-hint">${T(`你的战术自主权：${tier.zh}。好判断会赢得更多自由；盲目出手失败会让教练收紧。`, `Your autonomy: ${tier.en}. Good reads earn freedom; reckless misses make the coach tighten up.`, lang)}</p>`
    + `</div>`;
}

const VERDICT = {
  followed: ["你执行了战术，教练满意。", "You ran the call. The coach is pleased."],
  followed_poor_call: ["你执行了战术。这个战术本身不太对，但这不怪你。", "You ran the call. It was not a great call, and that is on the bench, not you."],
  deviate_good_scored: ["你看到了教练没看到的机会，判断和执行都很出色。", "You saw what the bench didn't. Great read, great finish."],
  deviate_good_missed: ["选择是对的，执行还需要提高。", "Right choice. The finish needs work."],
  deviate_poor_scored: ["结果不错，但教练不鼓励你再这样打。", "It went in, but the coach does not want to see that again."],
  deviate_poor_missed: ["你放弃了战术，又打了一个不好的选择，球队为此买单。", "You ditched the call for a bad look, and the team paid for it."],
  deviate_neutral: ["你改了战术，结果平平。", "You changed the call; nothing much came of it."],
  free_good_scored: ["没有指令的回合，你读对了，打成了。", "No call from the bench: you read it right and finished."],
  free_good_missed: ["没有指令的回合，你的选择是对的，只是没进。", "No call from the bench: the right choice, it just didn't fall."],
  free_poor_scored: ["进了，但那不是一个好机会。", "It fell, but it was not a good look."],
  free_poor_missed: ["没有指令的回合，你选了一个不好的机会。", "No call from the bench, and you picked a poor look."],
  free_neutral: ["你按自己的判断打完了这个回合。", "You played the possession on your own read."],
};

/** The coach's line after the game, with what it did to trust and autonomy. */
export function describeAgencyFeedback(agency, lang = "zh") {
  if (!agency) return null;
  const [zh, en] = VERDICT[agency.verdict] || VERDICT.free_neutral;
  const t = agency.trustApplied ?? Math.round(agency.trustDelta);
  const a = (agency.autonomyAfter ?? 0) - (agency.autonomyBefore ?? 0);
  const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
  return T(`教练点评：${zh}（信任 ${sign(t)} · 自主权 ${sign(a)}）`, `Coach: ${en} (trust ${sign(t)} · autonomy ${sign(a)})`, lang);
}
