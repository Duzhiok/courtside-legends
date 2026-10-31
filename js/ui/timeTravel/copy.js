/**
 * Copy for the time-travel screen's static slots (the `data-tt="..."` elements in index.html) and
 * the opening future-knowledge decision. One place, zh + en side by side, so a translator (or the
 * next agent) sees the whole screen's wording at once. JS-rendered copy lives next to its view.
 */
import { tr } from "./format.js";

const TEXT = {
  "w1-title": ["回到哪一年？", "Which year do you land in?"],
  "w2-title": ["执教理念", "Coaching philosophy"],
  "w2-note": ["理念决定哪三支球队会邀请你面试。", "Your philosophy decides which three teams call you in."],
  "w3-title": ["教练出身", "Your background"],
  "offers-kicker": ["面试邀请", "Interview invitations"],
  "offers-title": ["三支球队想见你。选一个，开启你的历史起点。", "Three teams want to meet you. Pick one to start your history."],
  urgent: ["需要你的决定", "Your call"],
  "intro-kicker": ["序章 · 未来知识", "Prologue · Foresight"],
  "intro-title": ["第一次使用未来知识", "Using foresight for the first time"],
  "intro-text": [
    "新工作刚开始，你必须决定是否提前透露一些超越时代的判断。每次干预都会消耗筹码，也可能改变管理层与媒体的态度。",
    "Your new job has just begun, and you must decide whether to share a judgement from beyond your era. Every intervention costs a chip and can change how the front office and press see you.",
  ],
  "contract-kicker": ["合同谈判", "Contract talks"],
  decline: ["不接受续约，离开球队", "Decline and leave the team"],
  "stints-title": ["执教履历", "Coaching record"],
  "jobs-badge": ["求职期", "Job search"],
  "jobs-kicker": ["再就业面试", "Re-employment interviews"],
  "jobs-title": ["下一站去哪？", "Where next?"],
  "report-title": ["历史改写记录", "Timeline record"],
  "share-title": ["结局分享卡 · 可直接截图", "Ending card · screenshot-ready"],
  "share-copy": ["复制战报文字", "Copy recap text"],
  housing: ["住房", "Housing"],
  investing: ["投资", "Investing"],
  "investing-note": [
    "本年代开放的资产类别。未来知识只能模糊预测趋势，实际输赢总是真正随机。",
    "Asset classes open in this era. Foresight only blurs a forecast; real outcomes are always genuinely random.",
  ],
};

export const staticText = (key, lang) => {
  const pair = TEXT[key];
  return pair ? tr(lang, pair[0], pair[1]) : "";
};

/** Fill every `[data-tt]` element under `root` with its text for `lang`. */
export function paintStaticText(root, lang) {
  root.querySelectorAll("[data-tt]").forEach((el) => {
    el.textContent = staticText(el.dataset.tt, lang);
  });
}

/** The opening decision. Effects come from the engine (see futureKnowledgeEffects), not from here. */
export const INTRO_CHOICES = [
  {
    id: "share-draft-sleeper",
    label: ["分享一名选秀遗珠", "Share a draft sleeper"],
    description: ["可能快速赢得管理层信任，但越精准的预言越会推动时间线偏离。", "Could win the front office's trust fast, but the sharper the prophecy, the further the timeline drifts."],
  },
  {
    id: "introduce-load-management",
    label: ["引入负荷管理", "Introduce load management"],
    description: ["有望保护核心球员并建立信任，却可能被媒体质疑你在回避竞争。", "May protect your core and build trust, but the press may say you are dodging competition."],
  },
  {
    id: "keep-quiet",
    label: ["暂时保持沉默", "Stay quiet for now"],
    description: ["保留未来知识且不扰动历史，但管理层可能怀疑你缺少明确主张。", "Keeps your foresight and leaves history alone, but the front office may doubt you have a stance."],
  },
];

/** finance.js owns the Chinese labels; these are the English counterparts, keyed by the same ids. */
export const HOUSE_LABELS_EN = { apartment: "Apartment", house: "Villa", mansion: "Mansion" };
export const ASSET_LABELS_EN = {
  bonds: "Government bonds",
  "blue-chip": "Blue-chip stocks",
  "tech-stocks": "Tech stocks",
  crypto: "Crypto",
};
