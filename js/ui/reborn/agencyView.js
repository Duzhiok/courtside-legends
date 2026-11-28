/**
 * Player Agency PA1 view: the takeover dialog with the coach's call, your read and four choices, and the coach's
 * feedback line after the game. Pure HTML / strings. No odds and no expected values are shown: the read is what
 * the player believes he sees (blurred by his basketball IQ), never the grader's numbers.
 */
import { esc } from "../../core/html.js";
import { SKILL_PACKS } from "../../data/skills.js";
import { skillNameL } from "../../i18n.js";
import { SIGNATURE_BUDGET } from "../../reborn/signature.js";
import { autonomyTier } from "../../reborn/agency.js";
import { MODE_LABELS, MODE_PACING, PARTICIPATION_MODES, sanitizeMode } from "../../reborn/participation.js";

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
  // Seeing clearly that nothing is open is a read too, not "clearly seeing nothing".
  if (obs.pick === "pass" && obs.clarity === "sharp") return T("你看清楚了：现在没有明显的机会，再等一等", "You see it clearly: nothing is open yet, be patient", lang);
  const prefix = obs.clarity === "cloudy" ? T("你看得不太清楚：", "You can't quite tell: ", lang) : obs.clarity === "sharp" ? T("你看得很清楚：", "You see it clearly: ", lang) : "";
  const text = T(zh, en, lang);
  return prefix && lang === "en" ? prefix + text[0].toLowerCase() + text.slice(1) : prefix + text;
}

const AFTER_ZH = { roll: "掩护后顺下切篮", pop: "掩护后外拆投篮" };
const AFTER_EN = { roll: "rolls to the rim after the screen", pop: "pops out for the jumper after the screen" };

/** What the teammate says. The only fact he quotes is one the engine really counted (the opposing big's personal fouls). */
function mateLine(offer, lang) {
  const f = offer.fact;
  if (!f) return T("我来给你挡拆。", "I'll set the screen for you.", lang);
  const who = esc(lang === "en" ? f.nameEn || f.name : f.name);
  return T(`${who} 已经 ${f.pf} 次犯规了，我来给你挡拆，逼他防守。`, `${who} already has ${f.pf} fouls: I'll screen for you, make him defend.`, lang);
}

function mateCard(offer, lang) {
  if (!offer) return "";
  const name = esc(lang === "en" ? offer.nameEn || offer.name : offer.name);
  return `<div class="reborn-agency-card reborn-agency-mate" data-testid="teammate-offer"><b>${T("队友交流", "Teammate", lang)} · ${name}${T(`（${esc(offer.pos || "")}）`, ` (${esc(offer.pos || "")})`, lang)}</b><p>「${mateLine(offer, lang)}」</p><small>${T("他愿意为你掩护；也可以提出另一种打法，但他不一定答应。", "He is ready to screen for you; you can ask for another way, but he may say no.", lang)}</small></div>`;
}

/** What a big says when his post matchup beats the rest of the floor's. The only "why" is a rating comparison against his actual defender. */
function feedLine(offer, lang) {
  const against = offer.against ? esc(lang === "en" ? offer.against.nameEn || offer.against.name : offer.against.name) : null;
  return against ? T(`${against} 防我吃力，禁区这边我占优，把球给我。`, `${against} struggles with me inside - give me the ball.`, lang) : T("禁区对位我占优，把球给我。", "I've got the matchup inside - give me the ball.", lang);
}
function feedCard(offer, lang) {
  if (!offer) return "";
  const name = esc(lang === "en" ? offer.nameEn || offer.name : offer.name);
  return `<div class="reborn-agency-card reborn-agency-mate" data-testid="feed-offer"><b>${T("队友要球", "A teammate wants it", lang)} · ${name}${T(`（${esc(offer.pos || "")}）`, ` (${esc(offer.pos || "")})`, lang)}</b><p>「${feedLine(offer, lang)}」</p><small>${T("给他球，他的出手机会会多很多；不保证进，也不保证全队得分更高。", "Give it to him and he shoots far more; it is no promise it falls, or that the team scores more.", lang)}</small></div>`;
}

const ZONE_WORD = { paint: ["禁区", "the paint"], mid: ["中距离", "mid-range"], three: ["三分", "the three"] };
const zoneWord = (zone, lang) => T(...(ZONE_WORD[zone] || ["进攻", "offense"]), lang); // a few moves carry no zone: claim none

/** Skills M1b: the move he may fire. Plain about what firing does: the engine's real boost, never a promise, a miss still costs the use. */
function signatureCard(sig, lang) {
  if (!sig) return "";
  const name = esc(skillNameL(sig.name, lang));
  return `<div class="reborn-agency-card reborn-agency-signature" data-testid="signature-offer"><b>${T("招牌动作", "Signature move", lang)} · ${sig.left}/${SIGNATURE_BUDGET}</b>`
    + `<p>${T(`「${name}」· ${zoneWord(sig.zone, lang)}。发动后这一回合由你来打，用它的真实命中和空位加成；不保证进球，投丢也算一次。`, `"${name}" · ${zoneWord(sig.zone, lang)}. Firing it hands you this possession with the move's real shooting and openness boost; it is no promise, and a miss still spends the use.`, lang)}</p></div>`;
}

function optionLabel(id, context, lang) {
  const offer = context.offer;
  if (id === "signature") {
    const sig = context.signature;
    return [T("招牌动作", "Signature move", lang), T(`发动「${esc(skillNameL(sig.name, lang))}」（${zoneWord(sig.zone, lang)}）· 本场还剩 ${sig.left}/${SIGNATURE_BUDGET} 次，不保证进`, `Fire "${esc(skillNameL(sig.name, lang))}" (${zoneWord(sig.zone, lang)}) · ${sig.left}/${SIGNATURE_BUDGET} left this game, no promise it falls`, lang)];
  }
  if (id === "feed") {
    const who = esc(lang === "en" ? context.feedOffer.nameEn || context.feedOffer.name : context.feedOffer.name);
    return [T("队友要球", "A teammate wants it", lang), T(`把球交给 ${who}（禁区对位占优），不保证进`, `Get the ball to ${who} (he has the matchup inside), no promise it falls`, lang)];
  }
  if (id === "spot") {
    const who = esc(lang === "en" ? context.spotOffer.nameEn || context.spotOffer.name : context.spotOffer.name);
    return [T("无球要球", "Off the ball", lang), T(`站到外线要球，请 ${who} 找你（他可能不答应，也不保证传给你）`, `Spot up and ask ${who} to find you (he may say no, and the ball is not guaranteed)`, lang)];
  }
  const mate = offer ? esc(lang === "en" ? offer.nameEn || offer.name : offer.name) : "";
  if (id === "screen") return [T("队友配合", "With a teammate", lang), T(`接受 ${mate} 的挡拆：${AFTER_ZH[offer.afterScreen]}`, `Take ${mate}'s screen: he ${AFTER_EN[offer.afterScreen]}`, lang)];
  if (id === "screenAlt") return [T("提出另一种打法", "Ask for another way", lang), T(`要求 ${mate}：${AFTER_ZH[offer.alt]}（他可能不答应）`, `Ask ${mate}: ${AFTER_EN[offer.alt]} (he may say no)`, lang)];
  if (id === "follow") return [T("执行教练战术", "Run the coach's call", lang), callLabel(context.coachInstruction, lang)];
  if (id === "setup") return [T("自己布置", "Call your own play", lang), T(`把球交给 ${esc(context.audible.targetName)}，他现在机会最好`, `Get the ball to ${esc(context.audible.targetName)}, he has the best look`, lang)];
  if (id === "drive") return [T("自主判断", "Your own read", lang), T("突破上篮", "Drive to the rim", lang)];
  if (id === "pullup") return [T("自主判断", "Your own read", lang), T("急停跳投", "Pull-up jumper", lang)];
  return [T("继续阅读防守", "Keep reading", lang), T("让进攻流动，找更好的机会", "Let the offense flow for a better look", lang)];
}

/** The agency version of the takeover dialog. */
/** The four participation modes as a switch (used in the dialog footer and on the Reborn screen). Pure HTML. */
export function participationBarHtml(mode, lang = "zh") {
  const m = sanitizeMode(mode);
  const chips = Object.values(PARTICIPATION_MODES).map((id) => `<button type="button" class="reborn-mode-chip" data-mode="${id}" aria-pressed="${id === m}">${T(MODE_LABELS[id].zh, MODE_LABELS[id].en, lang)}</button>`).join("");
  return `<div class="reborn-mode" role="group" aria-label="${T("比赛参与程度", "Match involvement", lang)}">${chips}`
    + `<small class="reborn-mode-desc">${T(MODE_LABELS[m].descZh, MODE_LABELS[m].descEn, lang)} ${T("每场预计决策", "Decisions per game", lang)}: ${MODE_PACING[m].target}</small></div>`;
}

const STEAL_WORD = { high: ["出色", "strong"], mid: ["一般", "average"], low: ["偏弱", "weak"] };

/** Real fields only: fouls, stamina, steal skill. */
function defenseFactsLine(f, lang) {
  const [zhWord, enWord] = STEAL_WORD[f.stealRating >= 70 ? "high" : f.stealRating < 45 ? "low" : "mid"];
  return T(`你已犯规 ${f.fouls} 次 · 体力 ${Math.max(0, 100 - f.fatigue)}% · 抢断能力${zhWord}`, `Fouls ${f.fouls} · stamina ${Math.max(0, 100 - f.fatigue)}% · steal skill ${enWord}`, lang);
}
const defenseOptionList = (lang) => [
  ["gamble", T("赌抢断", "Gamble", lang), T("抢断更多，但犯规和体力代价也更大", "More steals, but more fouls and more stamina spent", lang)],
  ["stay", T("稳守", "Stay home", lang), T("守住位置，不冒险（球队默认防守）", "Hold your position, no risk (the team's own defense)", lang)],
];

/** S3a: the compact panel for THEIR possession - facts that are real fields, two options, and a plain warning about the price. */
function defenseDialogHtml({ sim, lang, context, mode }) {
  const f = context.facts;
  const youSide = sim?.youSide || "home";
  const oppSide = youSide === "home" ? "away" : "home";
  const score = sim?.score || { home: 0, away: 0 };
  const clock = Number(sim?.clock) || 0;
  const mmss = `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, "0")}`;
  const q = Number(sim?.quarter) || 4;
  const facts = defenseFactsLine(f, lang);
  const buttons = defenseOptionList(lang).map(([id, kind, label], i) => `<button type="button" class="reborn-takeover-option" data-option="${id}" data-key="${i + 1}"><span class="reborn-takeover-key">${i + 1}</span> <span class="reborn-takeover-desc">${kind}</span> <span class="reborn-takeover-label">${label}</span></button>`).join("");
  return `<div class="reborn-takeover-dialog reborn-agency reborn-agency-defense" role="dialog" aria-modal="true" aria-label="${T("防守选择", "Defensive choice", lang)}">`
    + `<h2>${T("对手进攻：你怎么防", "Their ball: how do you defend?", lang)}</h2>`
    + `<p class="reborn-takeover-situation">${q <= 4 ? `Q${q}` : `OT${q - 4}`} ${mmss} · ${score[youSide]} – ${score[oppSide]}</p>`
    + `<div class="reborn-agency-card reborn-agency-read" data-testid="defense-facts"><b>${T("你的状态", "Your state", lang)}</b><p>${facts}</p></div>`
    + `<div class="reborn-takeover-options">${buttons}</div>`
    + (mode ? participationBarHtml(mode, lang) : "")
    + `<p class="reborn-takeover-hint">${T("赌抢断不会让对手少得分：它换来更多抢断，也会换来更多犯规。", "A gamble does not stop the other team scoring: it buys steals and costs fouls.", lang)}</p>`
    + `</div>`;
}

export function agencyDialogHtml({ sim, lang = "zh", context, mode = null, compact = false }) {
  if (context.side === "defense") return defenseDialogHtml({ sim, lang, context, mode });
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
    + `<h2>${context.routine ? T("这一回合，你想怎么打", "This possession: your call", lang) : T("关键回合，你决定怎么打", "Clutch possession: your call", lang)}</h2>`
    + `<p class="reborn-takeover-situation">${q <= 4 ? `Q${q}` : `OT${q - 4}`} ${mmss} · ${score[youSide]} – ${score[oppSide]}</p>`
    + (compact ? `<p class="reborn-agency-readline">${observationLine(context.observation, lang)}</p>` : coachCard) + mateCard(context.offer, lang) + feedCard(context.feedOffer, lang) + signatureCard(context.signature, lang) + (compact ? "" : readCard)
    + `<div class="reborn-takeover-options">${buttons}</div>`
    + (mode ? participationBarHtml(mode, lang) : "")
    + (compact ? "" : `<p class="reborn-takeover-hint">${T(`你的战术自主权：${tier.zh}。好判断会赢得更多自由；盲目出手失败会让教练收紧。`, `Your autonomy: ${tier.en}. Good reads earn freedom; reckless misses make the coach tighten up.`, lang)}</p>`)
    + `</div>`;
}

const BUBBLE_SHORT = {
  follow: ["执行战术", "Run the call"], drive: ["突破", "Drive"], pullup: ["跳投", "Pull-up"], pass: ["传球", "Pass"],
  setup: ["自己布置", "Set one up"], feed: ["给他球", "Feed him"], signature: ["发动招牌", "Signature"], screen: ["接受挡拆", "Take the screen"], screenAlt: ["换种打法", "Another way"], spot: ["要球", "Ask for it"],
  gamble: ["赌抢断", "Gamble"], stay: ["稳守", "Stay home"],
};

/**
 * L1: the bubble. One line of real context and a chip per option; it never covers the court and an unanswered one just lets him play it
 * on his own (the caller times it out). The teammate's offer, when there is one, is the line; a defensive one shows his own facts.
 */
export function agencyBubbleHtml({ lang = "zh", context }) {
  const defense = context.side === "defense";
  const line = defense ? defenseFactsLine(context.facts, lang) : context.feedOffer ? `「${feedLine(context.feedOffer, lang)}」` : context.offer ? `「${mateLine(context.offer, lang)}」` : observationLine(context.observation, lang);
  const chips = context.options.map((id, i) => {
    const [zh, en] = BUBBLE_SHORT[id] || [id, id];
    const label = defense ? defenseOptionList(lang).find(([k]) => k === id)?.[2] : optionLabel(id, context, lang)[1];
    // A bubble has no hover on a phone, so the signature chip itself must say WHICH move and how many uses are left.
    const sig = id === "signature" ? context.signature : null;
    const text = sig ? `${T("招牌", "Signature", lang)} ${esc(skillNameL(sig.name, lang))} ${sig.left}/${SIGNATURE_BUDGET}` : T(zh, en, lang);
    return `<button type="button" class="reborn-bubble-option" data-option="${id}" data-key="${i + 1}" title="${label || ""}"><kbd>${i + 1}</kbd> ${text}</button>`;
  }).join("");
  return `<div class="reborn-bubble" role="status" aria-live="polite" data-tier="L1">`
    + `<p class="reborn-bubble-line">${line}</p>`
    + `<div class="reborn-bubble-options">${chips}</div>`
    + `<span class="reborn-bubble-timer" aria-hidden="true"></span>`
    + `<small class="reborn-bubble-hint">${T("不回应就按你自己的判断打。悬停可暂停。", "No answer: he plays it on his own read. Hover to pause.", lang)}</small>`
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

const VERDICT_DEFENSE = {
  free_good_scored: ["你赌对了：抢下了球。", "You read it right and took the ball."],
  free_good_missed: ["赌的时机是对的，这回合没抢到。", "Right moment to gamble; it just did not come off."],
  free_poor_scored: ["抢到了，但那不是个好时机。", "You got it, but it was not the moment to gamble."],
  free_poor_missed: ["不该赌的时候赌了，球队为此买单。", "You gambled when you should not have, and the team paid for it."],
  free_neutral: ["你按自己的判断防完了这个回合。", "You defended the possession on your own read."],
};

/** The coach's line after the game, with what it did to trust and autonomy. */
export function describeAgencyFeedback(agency, lang = "zh") {
  if (!agency) return null;
  const [zh, en] = (agency.side === "defense" ? VERDICT_DEFENSE : VERDICT)[agency.verdict] || VERDICT.free_neutral;
  const many = agency.decisions > 1 ? T(`本场 ${agency.decisions} 个决定 · `, `${agency.decisions} decisions · `, lang) : "";
  const t = agency.trustApplied ?? Math.round(agency.trustDelta);
  const a = (agency.autonomyAfter ?? 0) - (agency.autonomyBefore ?? 0);
  const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
  return T(`教练点评：${zh}（${many}信任 ${sign(t)} · 自主权 ${sign(a)}）`, `Coach: ${en} (${many}trust ${sign(t)} · autonomy ${sign(a)})`, lang);
}

/** The lines after the game about the screens you called: what GameSim did, then who moved and by how much. Pure strings (HTML-escaped). */
export function describeTeamplayFeedback(teamplay, lang = "zh") {
  if (!teamplay?.items?.length) return [];
  const nameOf = (x) => esc(lang === "en" ? x.nameEn || x.name : x.name);
  const lines = teamplay.items.map((i) => {
    const who = nameOf(i);
    if (i.kind === "feed") {
      if (i.reason === "scored") return T(`你把球交给了 ${who}，他打成了（${i.points} 分）。`, `You got the ball to ${who} and he finished it (${i.points} pts).`, lang);
      if (i.reason === "missed") return T(`你把球交给了 ${who}，他没有投进，这个判断本身没有问题。`, `You got the ball to ${who}; it did not fall, but it was a fair read.`, lang);
      return T(`你把球交给了 ${who} 的位置，这一回合他没有拿到出手机会。`, `You went to ${who}; he did not get a shot off this possession.`, lang);
    }
    if (i.kind === "spot" && !i.rejected) {
      if (i.reason === "fed") return T(`你站好位置，${who} 把球给了你，打成了（${i.points} 分）。`, `You spotted up, ${who} found you and it fell (${i.points} pts).`, lang);
      if (i.reason === "shot") return T(`你要到了球，拿到出手机会，${i.made ? `打成了（${i.points} 分）` : "没有投进"}。`, `You got the ball and a shot${i.made ? ` (${i.points} pts)` : ", it did not fall"}.`, lang);
      return T("你站位要球，这一回合队友没有找到你。", "You spotted up; the team did not find you this possession.", lang);
    }
    if (i.rejected) return T(`${who} 没有接你的要求，这一回合按球队的原则打了。`, `${who} did not go along with your request; the possession played on the team's principles.`, lang);
    if (i.reason === "turnover") return T(`和 ${who} 的挡拆出现了失误。`, `The screen with ${who} ended in a turnover.`, lang);
    if (i.points > 0) return T(`和 ${who} 的挡拆打成了（${i.points} 分）。`, `The screen with ${who} paid off (${i.points} pts).`, lang);
    return T(`和 ${who} 的挡拆没投进，配合本身没有问题。`, `The screen with ${who} did not fall, but the play itself was fine.`, lang);
  });
  const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
  for (const m of teamplay.moved || []) lines.push(T(`你和 ${nameOf(m)} 的默契 ${sign(m.delta)}`, `Chemistry with ${nameOf(m)} ${sign(m.delta)}`, lang));
  return lines;
}

/**
 * After the game: the signature moves fired, from the engine's own shot result. Says what really happened: a miss still spent the use,
 * an autopilot use was not his choice, a refused attempt spent nothing, and an unused budget does not carry to the next game.
 */
export function describeSignatureFeedback(signature, lang = "zh") {
  if (!signature) return [];
  const nm = (id) => esc(skillNameL(SKILL_PACKS[id]?.name || id, lang));
  const lines = (signature.runs || []).map((r) => {
    if (!r.fired) return T(`「${nm(r.id)}」这次没能发动（球没到你手里），次数没扣。`, `"${nm(r.id)}" could not be fired (the ball never reached you); nothing was spent.`, lang);
    const how = r.auto ? T("这一回合没问你，自动用了", "Nobody asked you this possession; the autopilot used", lang) : T("你发动了", "You fired", lang);
    const result = r.made ? T(`，打成了（${r.points} 分）`, `, and it fell (${r.points} pts)`, lang) : T("，没有投进，次数照扣", ", it did not fall, and the use is spent", lang);
    return `${how}${lang === "en" ? ` "${nm(r.id)}"` : `「${nm(r.id)}」`}${result}。`;
  });
  if (!lines.length && signature.left > 0) lines.push(T(`本场没有用招牌动作（${signature.left}/${SIGNATURE_BUDGET}）。没用的次数不会带到下一场。`, `No signature move this game (${signature.left}/${SIGNATURE_BUDGET}). Unused uses do not carry over.`, lang));
  return lines;
}

/** After the game: what each defensive gamble did, from his own steal / foul and the team's forced turnover. Plain, never a promise. */
export function describeDefenseFeedback(defense, lang = "zh") {
  return (defense || []).map((d) => {
    if (d.steal && d.foul) return T("你赌抢断断下了球，但也犯了一次规。", "Your gamble took the ball, and cost a foul.", lang);
    if (d.steal) return T("你赌抢断成功，断下了球。", "Your gamble paid off: you took the ball.", lang);
    if (d.foul) return T(`你赌抢断没成，还犯了一次规（累计 ${d.fouls} 次）。`, `Your gamble missed and cost a foul (${d.fouls} now).`, lang);
    if (d.forcedTurnover) return T("你没断下球，但逼出了对手的失误。", "You did not take it, but the pressure forced a turnover.", lang);
    return T("你赌抢断没有结果，对手正常完成了这次进攻。", "Your gamble came to nothing; they ran their possession as normal.", lang);
  });
}
