import assert from "node:assert/strict";
import test from "node:test";
import { foldBatch, settleGame } from "../js/career/gameRewards.js";
import { SKILL_PACKS } from "../js/data/skills.js";
import { skillNameL } from "../js/i18n.js";
import { EPIPHANY_RULES } from "../js/engine/epiphany.js";
import { FOCUS_ATTRIBUTES } from "../js/modes/playerDevelopment.js";
import { highlightTags } from "../js/career/buzz.js";
import { ATTRIBUTE_LABELS, HIGHLIGHT_LABELS, STREAK_UNITS, batchHtml, postGameHtml } from "../js/ui/careerPostGameView.js";

const CJK = /[\u3400-\u9fff]/;
const visible = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const player = (id, name, stats) => ({ id, name, stats });
const snap = (score = { home: 104, away: 99 }, home = null) => ({
  score,
  home: { name: "Denver", roster: home || [
    player("a", "Nikola Jokic", { min: 36, pts: 28, reb: 12, ast: 9, fgm: 10, fga: 17 }),
    player("b", "Jamal Murray", { min: 34, pts: 21, reb: 3, ast: 6, fgm: 8, fga: 18 }),
    player("c", "Aaron Gordon", { min: 30, pts: 11, reb: 8, ast: 2, fgm: 4, fga: 7 }),
    player("d", "Bench Guy", { min: 8, pts: 2, fgm: 1, fga: 3 }),
  ] },
  away: { name: "Boston", roster: [player("x", "Jayson Tatum", { min: 38, pts: 30, reb: 7, ast: 4, fgm: 11, fga: 24 })] },
});

test("a single game card: verdict, opponent, and the three stars with their lines", () => {
  const html = postGameHtml(settleGame(snap(), "home"), "zh");
  assert.match(html, /赛后结算/);
  assert.match(html, /pg-win/);
  assert.match(html, /胜 104-99/);
  assert.match(html, /对阵 Boston/);
  assert.equal((html.match(/class="pg-star"/g) || []).length, 3, "three stars, not the whole bench");
  assert.match(html, /Nikola Jokic/);
  assert.match(visible(html), /36 分钟 · 28 分 12 板 9 助/);
  assert.doesNotMatch(html, /Bench Guy/);
});

test("a loss and a tie get their own tone, from the user's side", () => {
  assert.match(postGameHtml(settleGame(snap({ home: 90, away: 99 }), "home"), "zh"), /pg-loss[\s\S]*负 90-99/);
  assert.match(postGameHtml(settleGame(snap({ home: 90, away: 90 }), "home"), "zh"), /pg-even[\s\S]*战平 90-90/);
  assert.match(postGameHtml(settleGame(snap({ home: 90, away: 99 }), "away"), "zh"), /pg-win[\s\S]*胜 99-90/, "the same box score is a win for the other side");
});

test("English mode has no Chinese in the card", () => {
  const html = postGameHtml(settleGame(snap(), "home"), "en");
  assert.match(html, /Post-game/);
  assert.match(html, /Win 104-99/);
  assert.match(visible(html), /36 min · 28 pts 12 reb 9 ast/);
  assert.doesNotMatch(html, CJK);
  const batch = batchHtml(foldBatch([settleGame(snap(), "home"), settleGame(snap({ home: 90, away: 99 }), "home")]), "en");
  assert.match(batch, /This stretch/);
  assert.match(batch, /2 games · 1-1/);
  assert.match(batch, /Point diff \+?-?\d+/);
  assert.doesNotMatch(batch, CJK);
});

test("team and player names are escaped, not injected", () => {
  const evil = settleGame({ ...snap(), away: { name: "<img src=x onerror=alert(1)>", roster: [] }, home: { name: "H", roster: [player("e", "<script>alert(1)</script>", { min: 20, pts: 9 })] } }, "home");
  const html = postGameHtml(evil, "zh") + batchHtml(foldBatch([evil, evil]), "zh");
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});

test("the batch card: record, point differential, best night, and who carried the team", () => {
  const html = batchHtml(foldBatch([settleGame(snap(), "home"), settleGame(snap({ home: 90, away: 99 }), "home"), settleGame(snap(), "home")]), "zh");
  assert.match(html, /本段收获/);
  assert.match(html, /3 场 · 2 胜 1 负/);
  assert.match(html, /净胜分 \+1\b/, "(+5) + (-9) + (+5) = +1");
  assert.match(html, /单场最佳：Nikola Jokic 28 分 12 板 9 助，对阵 Boston（胜 104-99）/);
  assert.match(html.replace(/<[^>]+>/g, ""), /场均 28\.0 分 12\.0 板 9\.0 助 · 出场 3 场/, "the visible line reads as one sentence");
  assert.match(html, /<span class="pg-nowrap">出场 3 场<\/span>/, "...and '出场 3 场' can't break in half on a phone");
  assert.equal((html.match(/class="pg-star"/g) || []).length, 3);
});

test("a losing stretch is tinted as a loss, a negative differential has its minus sign", () => {
  const html = batchHtml(foldBatch([settleGame(snap({ home: 80, away: 99 }), "home"), settleGame(snap({ home: 80, away: 99 }), "home")]), "zh");
  assert.match(html, /pg-loss/);
  assert.match(html, /净胜分 -38/);
});

test("nothing to show means no markup at all (the container stays hidden)", () => {
  assert.equal(postGameHtml(null), "");
  assert.equal(batchHtml(null), "");
  assert.equal(batchHtml(foldBatch([])), "");
  assert.equal(postGameHtml(settleGame({ score: { home: 1, away: 0 }, home: { name: "x" }, away: { name: "y" } }, "home")), "");
});

test("a card for a game where nobody has stats still says who won (no empty stars list)", () => {
  const html = postGameHtml(settleGame(snap({ home: 90, away: 80 }, []), "home"), "zh");
  assert.match(html, /胜 90-80/);
  assert.doesNotMatch(html, /pg-stars|本场最佳/);
});

test("a figure and its unit are one unbreakable segment, so a phone can never wrap between them", () => {
  const segments = (html) => [...html.matchAll(/<span class="pg-nowrap">([^<]*)<\/span>/g)].map((m) => m[1]);
  const single = segments(postGameHtml(settleGame(snap(), "home")));
  for (const piece of ["36 分钟", "28 分", "12 板", "9 助"]) assert.ok(single.includes(piece), `single card: ${piece}`);
  const english = segments(postGameHtml(settleGame(snap(), "home"), "en"));
  for (const piece of ["36 min", "28 pts", "12 reb", "9 ast"]) assert.ok(english.includes(piece), `english: ${piece}`);
  const batch = segments(batchHtml(foldBatch([settleGame(snap(), "home")])));
  for (const piece of ["场均 28.0 分", "12.0 板", "9.0 助", "出场 1 场"]) assert.ok(batch.includes(piece), `batch: ${piece}`);
  // ...and no bare "<number> <unit>" is left outside a segment (that is where the orphan "助" came from).
  const bare = visible(postGameHtml(settleGame(snap(), "home")).replace(/<span class="pg-nowrap">[^<]*<\/span>/g, ""));
  assert.doesNotMatch(bare, /\d\s*(分|板|助)/);
});

// ---------------------------------------------------------------- C2: player growth section
const withGrowth = (entries) => {
  const report = settleGame(snap(), "home");
  report.rewards.playerXp = entries;
  return report;
};
const xpEntry = (over = {}) => ({ id: "a", name: "Nikola Jokic", xp: 45, total: 600, progress: 0.5, levels: 0, levelCap: 2, capped: false, leveled: [], ...over });

test("growth: no data renders no section at all (a quick season, or a game viewed from the schedule)", () => {
  const html = postGameHtml(settleGame(snap(), "home"), "zh");
  assert.doesNotMatch(html, /球员成长|pg-grow/);
  assert.doesNotMatch(postGameHtml(withGrowth([]), "en"), /Player growth|pg-grow/);
});

test("growth: shows XP and progress; a level-up names the attribute and the change", () => {
  const html = postGameHtml(withGrowth([
    xpEntry({ leveled: [{ attribute: "three", from: 60, to: 61 }], progress: 0.1 }),
    xpEntry({ id: "b", name: "Jamal Murray", xp: 38, progress: 0.3 }),
  ]), "zh");
  assert.match(html, /球员成长/);
  assert.match(visible(html), /Nikola Jokic\+45 XP · 升级 三分 60→61/);
  assert.match(visible(html), /Jamal Murray\+38 XP · 30%/);
  assert.equal((html.match(/class="pg-grow"/g) || []).length, 2);
  assert.match(html, /aria-label="XP 10%"/);
  assert.match(html, /style="width:10%"/);
});

test("growth: English card is English, and a capped player says so instead of a stuck bar", () => {
  const html = postGameHtml(withGrowth([
    xpEntry({ leveled: [{ attribute: "mid", from: 70, to: 71 }] }),
    xpEntry({ id: "b", name: "Old Vet", capped: true, progress: 1 }),
  ]), "en");
  assert.match(visible(html), /Player growth/);
  assert.match(visible(html), /Level up Mid-range 70→71/);
  assert.match(visible(html), /No more growth this season/);
  assert.doesNotMatch(visible(html), CJK);
});

test("growth: at most four rows, and the cut never hides a level-up (entries arrive level-ups first)", () => {
  const entries = [
    xpEntry({ id: "u", name: "Leveller", leveled: [{ attribute: "pass", from: 50, to: 51 }] }),
    ...["p", "q", "r", "s", "t"].map((id) => xpEntry({ id, name: `P-${id}`, xp: 40 })),
  ];
  const html = postGameHtml(withGrowth(entries), "zh");
  assert.equal((html.match(/class="pg-grow"/g) || []).length, 4);
  assert.match(html, /Leveller/);
});

test("growth: every attribute a development focus can train has a label in both languages", () => {
  const trained = new Set(Object.values(FOCUS_ATTRIBUTES).flat());
  for (const attribute of trained) {
    assert.ok(ATTRIBUTE_LABELS[attribute], `${attribute} has a label`);
    const [zh, en] = ATTRIBUTE_LABELS[attribute];
    assert.match(zh, CJK);
    assert.doesNotMatch(en, CJK);
  }
});

test("growth: names are escaped and every figure+unit is one unbreakable segment", () => {
  const html = postGameHtml(withGrowth([xpEntry({ name: "<img src=x onerror=1>", leveled: [{ attribute: "speed", from: 70, to: 71 }] })]), "zh");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /<span class="pg-nowrap">\+45 XP<\/span>/);
  assert.match(html, /<span class="pg-nowrap">速度 70→71<\/span>/);
});

test("growth: a stretch card folds the same section, with merged level-ups and summed XP", () => {
  const report = (xp, leveled) => {
    const r = settleGame(snap(), "home");
    r.rewards.playerXp = [xpEntry({ xp, leveled })];
    return r;
  };
  const html = batchHtml(foldBatch([
    report(40, [{ attribute: "three", from: 60, to: 61 }]),
    report(30, []),
    report(50, [{ attribute: "three", from: 61, to: 62 }]),
  ]), "zh");
  assert.match(visible(html), /球员成长/);
  assert.match(visible(html), /Nikola Jokic\+120 XP · 升级 三分 60→62/);
  assert.doesNotMatch(batchHtml(foldBatch([settleGame(snap(), "home"), settleGame(snap(), "home")]), "zh"), /球员成长/, "no growth data, no section");
});

// ---------------------------------------------------------------- C3: epiphany + heating up
const rule = (id = "playmaker", stat = "ast", min = 9) => ({ id, stat, min });
const learned = (id, name, skill = "传球魔术", over = {}) => ({ id, name, skillId: "dime_dropper", skill, rule: rule(), games: 3, ...over });
const heat = (id, name, games = 2, over = {}) => ({ id, name, rule: rule(), games, of: 3, ...over });
const withRewards = (rewards, side = "home") => {
  const report = settleGame(snap(), side);
  report.rewards = { ...report.rewards, ...rewards };
  return report;
};

test("epiphany: names who, which skill and why; a card with nothing to say has no section", () => {
  const html = postGameHtml(withRewards({ epiphanies: [learned("a", "Nikola Jokic")] }), "zh");
  assert.match(html, /pg-epiphany/);
  assert.match(visible(html), /领悟新技能 Nikola Jokic ?连续 3 场 9\+ 助攻 传球魔术/);
  assert.doesNotMatch(postGameHtml(settleGame(snap(), "home"), "zh"), /pg-epiphany|手感正热/);
});

test("epiphany: it is the first thing under the verdict, ahead of the stars; heating up comes last", () => {
  const html = postGameHtml(withRewards({
    epiphanies: [learned("a", "Nikola Jokic")],
    playerXp: [{ id: "a", name: "Nikola Jokic", xp: 40, progress: 0.4, leveled: [], capped: false }],
    heat: [heat("b", "Jamal Murray")],
  }), "zh");
  const at = (needle) => html.indexOf(needle);
  assert.ok(at("pg-verdict") < at("pg-epiphany") && at("pg-epiphany") < at("本场最佳") && at("本场最佳") < at("球员成长") && at("球员成长") < at("手感正热"), "verdict > epiphany > stars > growth > heat");
});

test("epiphany: English card is English (skill name included)", () => {
  const html = postGameHtml(withRewards({ epiphanies: [learned("a", "Nikola Jokic")], heat: [heat("b", "Jamal Murray")] }), "en");
  assert.doesNotMatch(visible(html), CJK, visible(html));
  assert.match(visible(html), /New skill learned Nikola Jokic ?3 straight games with 9\+ assists/);
  assert.match(visible(html), /Heating up/);
});

test("epiphany: every streak rule has a unit in both languages, and every skill it can teach has an English name", () => {
  for (const r of EPIPHANY_RULES) {
    assert.ok(STREAK_UNITS[r.stat], `unit for ${r.stat}`);
    assert.ok(STREAK_UNITS[r.stat].every((unit) => unit && unit.trim()));
    for (const id of r.skills) {
      const zh = SKILL_PACKS[id]?.name;
      if (!zh) continue;
      assert.doesNotMatch(skillNameL(zh, "en"), CJK, `${id} (${zh}) has no English name`);
    }
  }
});

test("epiphany: at most four rows, the rest are counted, not hidden", () => {
  const many = ["a", "b", "c", "d", "e", "f"].map((id) => learned(id, `Player ${id}`));
  const html = postGameHtml(withRewards({ epiphanies: many }), "zh");
  assert.equal((html.match(/class="pg-learn"/g) || []).length, 4);
  assert.match(visible(html), /还有 2 位也领悟了新技能/);
  assert.doesNotMatch(visible(postGameHtml(withRewards({ epiphanies: many.slice(0, 4) }), "zh")), /还有/);
});

test("heating up: progress dots, one explanation line, never the skill itself", () => {
  const html = postGameHtml(withRewards({ heat: [heat("b", "Jamal Murray", 2), heat("c", "Aaron Gordon", 3, { rule: rule("rebounder", "reb", 12) })] }), "zh");
  assert.match(visible(html), /手感正热 再来一场达标，就有机会领悟新技能。/);
  assert.equal((html.match(/pg-dots/g) || []).length, 2);
  assert.match(html, /aria-label="2\/3"/);
  assert.match(html, /aria-label="3\/3"/);
  assert.equal((html.match(/<i class="on">/g) || []).length, 5, "2 + 3 lit dots");
  assert.equal((html.match(/<i>/g) || []).length, 1, "and one dark one");
  assert.match(visible(html), /连续 3 场 12\+ 篮板/);
  assert.doesNotMatch(html, /传球魔术|dime_dropper/, "the skill stays a surprise");
});

test("heating up: a streak longer than a full set never overflows the dots, and at most three rows show", () => {
  const html = postGameHtml(withRewards({ heat: ["a", "b", "c", "d"].map((id) => heat(id, `P ${id}`, 5)) }), "zh");
  assert.equal((html.match(/class="pg-heat"/g) || []).length, 3);
  assert.equal((html.match(/<i class="on">/g) || []).length, 9, "3 rows x 3 dots, never more");
  assert.match(visible(html), /连续 5 场/);
  assert.doesNotMatch(html, /aria-label="5\/3"/);
  assert.equal((html.match(/aria-label="3\/3"/g) || []).length, 3, "the spoken progress is capped too, not just the dots");
});

test("heating up rows are their own thing: they never count as growth rows (and vice versa)", () => {
  const html = postGameHtml(withRewards({
    playerXp: [{ id: "a", name: "Nikola Jokic", xp: 40, progress: 0.4, leveled: [], capped: false }],
    heat: [heat("b", "Jamal Murray")],
  }), "zh");
  assert.equal((html.match(/class="pg-grow"/g) || []).length, 1, "one growth row");
  assert.equal((html.match(/class="pg-heat"/g) || []).length, 1, "one heat row");
});

test("epiphany + heat: names are escaped and a figure with its unit never splits across lines", () => {
  const html = postGameHtml(withRewards({ epiphanies: [learned("a", "<img src=x onerror=alert(1)>")], heat: [heat("b", "<b>Evil</b>")] }), "zh");
  assert.doesNotMatch(html, /<img src=x|<b>Evil/);
  assert.match(html, /&lt;img/);
  assert.match(html, /<span class="pg-nowrap">连续 3 场 9\+ 助攻<\/span>/);
});

test("a stretch card shows every epiphany of the stretch and the final heat, in either language", () => {
  const report = (rewards) => withRewards(rewards);
  const batch = foldBatch([
    report({ epiphanies: [learned("a", "Nikola Jokic")], heat: [heat("x", "Gone Cold")] }),
    report({ epiphanies: [learned("b", "Jamal Murray", "三分雨", { rule: rule("shooter", "tpm", 4) })], heat: [heat("c", "Aaron Gordon")] }),
  ]);
  const zh = visible(batchHtml(batch, "zh"));
  assert.match(zh, /领悟新技能 Nikola Jokic[\s\S]*Jamal Murray ?连续 3 场 4\+ 记三分 三分雨/);
  assert.match(zh, /手感正热 再来一场达标，就有机会领悟新技能。 Aaron Gordon/);
  assert.doesNotMatch(zh, /Gone Cold/, "last game's heat only");
  assert.doesNotMatch(visible(batchHtml(batch, "en")), CJK);
});

// ---------------------------------------------------------------- C4: highlights + market buzz
const night = (over = {}) => ({ id: "a", name: "Nikola Jokic", tags: [{ id: "pts40", value: 41 }, { id: "tripleDouble", value: null }], gain: 7, ...over });
const withBuzz = (highlights, hot = []) => {
  const report = settleGame(snap(), "home");
  report.rewards.highlights = highlights;
  report.rewards.hot = hot;
  return report;
};

test("highlights: nothing earned, nothing drawn", () => {
  assert.doesNotMatch(postGameHtml(settleGame(snap(), "home"), "zh"), /pg-highlights|pg-hotnote|高光|热度/);
});

test("highlights: who, what (figure + unit as one piece), and the buzz it earned", () => {
  const html = postGameHtml(withBuzz([night()], [{ id: "a", name: "Nikola Jokic", buzz: 4 }]), "zh");
  assert.match(html, /本场高光/);
  assert.match(visible(html), /Jokic41 分 · 三双/);
  assert.match(html, /<span class="pg-nowrap">41 分<\/span>/, "the figure and its unit cannot split across lines");
  assert.match(html, /pg-buzz[^>]*>[\s\S]*\+7/);
  assert.match(visible(html), /交易市场热度：Nikola Jokic 4\.0。趁热出手报价更高/);
});

test("highlights: the card order is verdict, stars, highlights, growth", () => {
  const report = withBuzz([night()]);
  report.rewards.playerXp = [{ id: "a", name: "Nikola Jokic", xp: 40, progress: 0.4, total: 400, leveled: [], capped: false }];
  const html = postGameHtml(report, "zh");
  const at = (needle) => html.indexOf(needle);
  assert.ok(at("本场最佳") < at("本场高光") && at("本场高光") < at("球员成长"), "stars < highlights < growth");
});

test("highlights: English has no Chinese in it, and the unit reads right", () => {
  const html = postGameHtml(withBuzz([night({ tags: [{ id: "blk5", value: 6 }, { id: "tpm8", value: 9 }] })], [{ id: "a", name: "Nikola Jokic", buzz: 2.4 }]), "en");
  assert.doesNotMatch(visible(html), CJK);
  assert.match(visible(html), /Highlights/);
  assert.match(visible(html), /6 blocks · 9 threes/);
  assert.match(visible(html), /Trade-market buzz: Nikola Jokic 2\.4/);
});

test("highlights: every highlight id the engine can produce has a label in both languages", () => {
  const ids = ["pts40", "pts30", "tripleDouble", "blk5", "tpm8"];
  for (const id of ids) {
    const [zh, en] = HIGHLIGHT_LABELS[id] || [];
    assert.ok(zh && en, `no label for ${id}`);
    assert.doesNotMatch(en, CJK, id);
  }
  // and the engine really emits exactly these (so a new highlight cannot ship unlabelled)
  const emitted = new Set(highlightTags({ pts: 41, reb: 12, ast: 10, blk: 5, tpm: 8 }).map((tag) => tag.id));
  emitted.add(highlightTags({ pts: 30 })[0].id);
  assert.deepEqual([...emitted].sort(), [...ids].sort());
});

test("highlights: at most four rows, at most three tags a row, and the rest is counted, not hidden", () => {
  const many = Array.from({ length: 6 }, (_, i) => night({ id: `p${i}`, name: `Player ${i}`, gain: 6 - i }));
  const html = postGameHtml(withBuzz(many), "zh");
  assert.equal((html.match(/class="pg-hl"/g) || []).length, 4);
  assert.match(visible(html), /还有 2 位也有高光/);
  const tags = ["pts40", "tripleDouble", "blk5", "tpm8", "pts30"].map((id) => ({ id, value: 9 }));
  assert.match(visible(postGameHtml(withBuzz([night({ tags })]), "zh")), /\+2/);
});

test("highlights: a player who is still hot but had a quiet night still shows up, under a market-buzz title", () => {
  const html = postGameHtml(withBuzz([], [{ id: "a", name: "Nikola Jokic", buzz: 3.2 }]), "zh");
  assert.doesNotMatch(html, /pg-highlights/);
  assert.match(html, /市场热度/);
  assert.match(visible(html), /Nikola Jokic 3\.2/);
});

test("highlights: names are escaped", () => {
  const html = postGameHtml(withBuzz([night({ name: "<img src=x onerror=1>" })], [{ id: "a", name: "<b>x</b>", buzz: 3 }]), "zh");
  assert.doesNotMatch(html, /<img src=x|<b>x/);
});

test("highlights: the stretch card shows the whole stretch's highlights and who is hot at the end", () => {
  const first = settleGame(snap(), "home");
  first.rewards.highlights = [night({ gain: 4, tags: [{ id: "pts40", value: 41 }] })];
  first.rewards.hot = [{ id: "a", name: "Nikola Jokic", buzz: 4 }];
  const last = settleGame(snap(), "home");
  last.rewards.highlights = [night({ gain: 3, tags: [{ id: "tripleDouble", value: null }] })];
  last.rewards.hot = [{ id: "a", name: "Nikola Jokic", buzz: 5.2 }];
  const html = batchHtml(foldBatch([first, last]), "zh");
  assert.match(html, /这段时间的高光/);
  assert.match(visible(html), /Jokic41 分 · 三双/);
  assert.match(visible(html), /热度：Nikola Jokic 5\.2/);
  assert.match(batchHtml(foldBatch([settleGame(snap(), "home")]), "zh"), /^(?![\s\S]*高光)/);
});

// ---------------------------------------------------------------- C5: coach XP
const coachXp = (over = {}) => ({ xp: 14, parts: [{ id: "win", xp: 8 }, { id: "upset", xp: 6 }], playoff: false, level: 2, leveledUp: 0, progress: 0.35, perkPoints: 0, ...over });
const withCoachXp = (entry) => {
  const report = settleGame(snap(), "home");
  report.rewards.coachXp = entry;
  return report;
};

test("coach XP: no career coach, no section", () => {
  assert.doesNotMatch(postGameHtml(settleGame(snap(), "home"), "zh"), /pg-coach|教练成长/);
});

test("coach XP: says how much and why, with the level bar", () => {
  const html = postGameHtml(withCoachXp(coachXp()), "zh");
  assert.match(html, /教练成长/);
  assert.match(visible(html), /\+14 XP/);
  assert.match(visible(html), /赢球 \+8 · 爆冷 \+6/);
  assert.match(visible(html), /Lv\.2/);
  assert.match(html, /width:35%/);
});

test("coach XP: a playoff game says it counted double", () => {
  assert.match(visible(postGameHtml(withCoachXp(coachXp({ xp: 28, playoff: true })), "zh")), /季后赛 ×2/);
  assert.match(visible(postGameHtml(withCoachXp(coachXp({ xp: 28, playoff: true })), "en")), /Playoffs ×2/);
});

test("coach XP: a level-up says so and points at where the perk point is spent; unspent points are a reminder", () => {
  const up = visible(postGameHtml(withCoachXp(coachXp({ level: 3, leveledUp: 1, perkPoints: 1 })), "zh"));
  assert.match(up, /升到 Lv\.3/);
  assert.match(up, /1 点天赋点/);
  const waiting = visible(postGameHtml(withCoachXp(coachXp({ perkPoints: 2 })), "zh"));
  assert.match(waiting, /2 点天赋点未分配/);
});

test("coach XP: English card is English", () => {
  const html = visible(postGameHtml(withCoachXp(coachXp({ level: 3, leveledUp: 1, perkPoints: 1 })), "en"));
  assert.doesNotMatch(html, CJK);
  assert.match(html, /Coach growth/);
  assert.match(html, /Win \+8 · Upset \+6/);
  assert.match(html, /Reached Lv\.3/);
});

test("coach XP: the stretch card sums it, counts upsets and level-ups", () => {
  const games = [coachXp({ xp: 8, parts: [{ id: "win", xp: 8 }] }), coachXp(), coachXp({ xp: 3, parts: [{ id: "loss", xp: 3 }], level: 3, leveledUp: 1, perkPoints: 1, progress: 0.01 })]
    .map(withCoachXp);
  const html = visible(batchHtml(foldBatch(games), "zh"));
  assert.match(html, /教练成长/);
  assert.match(html, /\+25 XP/);
  assert.match(html, /爆冷 1 场/);
  assert.match(html, /升到 Lv\.3/);
  assert.doesNotMatch(visible(batchHtml(foldBatch(games), "en")), CJK);
});

// ---------------------------------------------------------------- C6: per-game goals
const goal = (over = {}) => ({ handPlayed: false, goals: [{ id: "margin", n: 10, done: true }], done: 1, multiplier: 1, ...over });
const withGoal = (entry) => {
  const report = settleGame(snap(), "home");
  report.rewards.goal = entry;
  return report;
};

test("goal: no data, no section (a quick season, or any game before C6 existed)", () => {
  assert.doesNotMatch(postGameHtml(settleGame(snap(), "home"), "zh"), /本场目标|pg-goal/);
});

test("goal: a met and a missed goal, each with its own mark, in the order they were judged", () => {
  const html = visible(postGameHtml(withGoal(goal({
    goals: [{ id: "margin", n: 10, done: true }, { id: "assists", n: 35, done: false }],
    done: 1,
  })), "zh"));
  assert.match(html, /本场目标/);
  assert.match(html, /✓赢下 10 分以上[\s\S]*✗全队 35 次助攻/, "met goal first, then the missed one, exactly as judged");
});

test("goal: a sim's judgment (handPlayed: false) never claims the hand-play bonus, and says what coaching it would add", () => {
  const html = postGameHtml(withGoal(goal({ handPlayed: false, done: 0, multiplier: 1 })), "zh");
  assert.doesNotMatch(visible(html), /亲自指挥 ×/);
  assert.match(visible(html), /模拟只计第一个目标/, "the nudge towards hand-coaching is there");
  // The bug this pins: that nudge is a full sentence, not a number+unit figure -- it must never be
  // wrapped in the unbreakable .pg-nowrap span (that forces one line and overflows a phone).
  assert.doesNotMatch(html, /<span class="pg-nowrap">[^<]*模拟只计[^<]*<\/span>/, "the nudge sentence must be allowed to wrap");
});

test("goal: hand-played claims the ×1.5 bonus and drops the nudge", () => {
  const html = visible(postGameHtml(withGoal(goal({ handPlayed: true, done: 2, multiplier: 1.5 * 1.5 })), "zh"));
  assert.match(html, /亲自指挥 ×1\.5/);
  assert.match(html, /达成 2 个 \+50%/);
  assert.match(html, /XP ×2\.25/);
  assert.doesNotMatch(html, /模拟只计第一个目标/, "a hand-played game has nothing to be nudged towards");
});

test("goal: English card is English, and the nudge sentence still isn't nowrap'd", () => {
  const html = postGameHtml(withGoal(goal({ goals: [{ id: "margin", n: 10, done: false }], done: 0 })), "en");
  assert.doesNotMatch(visible(html), CJK);
  assert.match(html, /Game goals/);
  assert.match(visible(html), /Win by 10\+/);
  assert.doesNotMatch(html, /<span class="pg-nowrap">[^<]*A sim counts[^<]*<\/span>/);
});

test("goal: the stretch card folds done/total across games, not just the last one", () => {
  const games = [
    withGoal(goal({ done: 1 })),
    withGoal(goal({ goals: [{ id: "margin", n: 10, done: false }], done: 0 })),
    withGoal(goal({ handPlayed: true, goals: [{ id: "margin", n: 10, done: true }, { id: "steals", n: 11, done: true }], done: 2 })),
  ];
  const html = visible(batchHtml(foldBatch(games), "zh"));
  assert.match(html, /本段目标/);
  assert.match(html, /达成 3 \/ 4/, "1 + 0 + 2 met, out of 1 + 1 + 2 judged");
  assert.match(html, /3 场/);
});

test("goal: a stretch with nobody's goals judged (every game from before C6, or a quick season) shows no section", () => {
  const games = [settleGame(snap(), "home"), settleGame(snap(), "home")];
  assert.doesNotMatch(visible(batchHtml(foldBatch(games), "zh")), /本段目标/);
});
