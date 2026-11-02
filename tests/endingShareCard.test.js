import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEndingShareCard,
  finishLabel,
  renderEndingShareCardHtml,
  shareCardText,
} from "../js/story/endingShareCard.js";

function rootFixture({ seasons = 5, employment = null, ending = { id: "history-maker", label: "历史改写者", tone: "success" } } = {}) {
  const seasonHistory = Array.from({ length: seasons }, (_, index) => ({
    year: 1994 + index,
    teamId: "BOS",
    teamName: "凯尔特人",
    record: { w: 40 + index * 5, l: 42 - index * 5 },
    finish: index === 4 ? "champion" : "playoffs",
    championId: index === 4 ? "BOS" : "CHI",
    transactions: index === 1
      ? [
          { type: "trade", year: 1995, day: 20, description: "送出 Dee Brown，换回 Rick Fox + 1996 首轮" },
          { type: "cut", year: 1995, day: 30, description: "裁掉替补" },
        ]
      : [],
  }));
  return {
    leagueCareer: {
      season: { year: 1994 + seasons, league: { labels: { BOS: "凯尔特人" } } },
      management: { seasonHistory },
    },
    story: {
      startYear: 1994,
      eventLog: [],
      ending,
      employment,
      frontOfficeTrust: 62,
      mediaPressure: 30,
      timelineDivergence: 18,
    },
  };
}

test("no share card until the tenure ending is locked", () => {
  assert.equal(buildEndingShareCard(rootFixture({ seasons: 3, ending: null })), null);
});

test("share card aggregates record, championships, best season, and span", () => {
  const card = buildEndingShareCard(rootFixture());
  assert.equal(card.teamName, "凯尔特人");
  assert.equal(card.yearSpan, "1994–1998");
  assert.deepEqual([card.record.w, card.record.l], [250, 160]);
  assert.equal(card.championships, 1);
  assert.equal(card.bestSeason.year, 1998);
});

test("signature trades only include actual trades, not cuts", () => {
  const card = buildEndingShareCard(rootFixture());
  assert.equal(card.signatureTrades.length, 1);
  assert.match(card.signatureTrades[0].description, /Rick Fox/);
});

test("contract result reflects renewal, departure, and firing", () => {
  const renewed = buildEndingShareCard(rootFixture({
    employment: {
      status: "renewed",
      offer: { title: "重建续约", years: 4, salary: 7, authority: 88, privileges: ["自定义训练计划"] },
    },
  }));
  assert.match(renewed.contract.text, /重建续约.*4 年.*薪资 7.*权限 88/);
  assert.deepEqual(renewed.contract.privileges, ["自定义训练计划"]);

  const departed = buildEndingShareCard(rootFixture({ employment: { status: "departed" } }));
  assert.match(departed.contract.text, /拒绝续约/);

  const fired = buildEndingShareCard(rootFixture({
    seasons: 2,
    employment: { status: "fired" },
    ending: { id: "fired-before-finale", label: "在低谷中下课", tone: "hard" },
  }));
  assert.equal(fired.contract.tone, "hard");
  assert.match(fired.contract.text, /解雇/);
});

test("season finishes are shown in Chinese, never raw enum values", () => {
  assert.equal(finishLabel({ finish: "playoffs" }), "季后赛");
  assert.equal(finishLabel({ finish: "lottery" }), "未进季后赛");
  assert.equal(finishLabel({ finish: "finals" }), "总决赛");
  assert.equal(finishLabel({ finish: "champion", champion: true }), "🏆 夺冠");
  const html = renderEndingShareCardHtml(buildEndingShareCard(rootFixture()));
  assert.doesNotMatch(html, />playoffs</);
});

test("rendered card escapes user-facing text and share text is copy-ready", () => {
  const root = rootFixture({ employment: { status: "departed" } });
  root.leagueCareer.management.seasonHistory[4].teamName = "<script>x</script>";
  const card = buildEndingShareCard(root);
  const html = renderEndingShareCardHtml(card);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /穿越生涯结局卡/);
  const text = shareCardText(card);
  assert.match(text, /总战绩 250胜160负/);
  assert.match(text, /合同结果：拒绝续约/);
});

// The fired branch used to print "two straight seasons under a 40% win rate" whatever actually got the
// coach fired -- so a coach whose front office lost faith was told it was his win rate.
const firedCard = (reason) => buildEndingShareCard(rootFixture({
  seasons: 3,
  employment: reason === undefined ? { status: "fired" } : { status: "fired", reason },
  ending: { id: "fired-before-finale", label: "下课", tone: "hard" },
}));

test("a fired coach's card names the real reason, in both languages", () => {
  const trust = firedCard("trust-collapsed").contract;
  assert.match(trust.text, /信任/);
  assert.match(trust.textEn, /trust/i);
  const goals = firedCard("missed-goals").contract;
  assert.match(goals.text, /目标/);
  assert.match(goals.textEn, /goal/i);
  const losing = firedCard("two-bad-seasons").contract;
  assert.match(losing.text, /40%/);
  assert.match(losing.textEn, /40%/);
});

test("only the losing-seasons firing talks about a 40% win rate", () => {
  for (const reason of ["trust-collapsed", "missed-goals"]) {
    const { text, textEn } = firedCard(reason).contract;
    assert.doesNotMatch(text + textEn, /40%/, `${reason} must not blame the win rate`);
  }
});

test("a firing with no reason (a save from before B2) keeps the one rule that existed then", () => {
  for (const reason of [undefined, "", "something-new", "constructor", "__proto__", "toString"]) {
    assert.match(firedCard(reason).contract.text, /40%/);
  }
});

test("the shared text for a trust firing reads in English without the old sentence", () => {
  const en = shareCardText(firedCard("trust-collapsed"), "en");
  assert.match(en, /Contract: .*trust/i);
  assert.doesNotMatch(en, /40%/);
  assert.match(shareCardText(firedCard("missed-goals"), "zh"), /合同结果：.*目标/);
});

test("every fired card is tone hard and still renders", () => {
  for (const reason of ["trust-collapsed", "missed-goals", "two-bad-seasons"]) {
    const card = firedCard(reason);
    assert.equal(card.contract.tone, "hard");
    assert.ok(renderEndingShareCardHtml(card).includes("share-card"));
  }
});

// The renewed branch built its English line from offer.title (Chinese) and translated only four of the
// seven perks, so a dynasty renewal showed Chinese perks on an English card.
const renewedCard = (offer) => buildEndingShareCard(rootFixture({ employment: { status: "renewed", offer } }));

test("a renewed card in English has no Chinese, whichever offer was signed", () => {
  for (const id of ["trial-extension", "rebuild-extension", "contender-extension", "dynasty-extension"]) {
    // the offer as an OLD save stored it: Chinese strings only, plus the id
    const stored = { id, title: "旧存档里的中文标题", years: 2, salary: 9, authority: 50, privileges: ["随便一条中文特权"] };
    const { textEn, privilegesEn } = renewedCard(stored).contract;
    assert.ok(!/[\u3400-\u9fff]/.test(textEn + privilegesEn.join(" ")), `${id}: ${textEn} | ${privilegesEn}`);
  }
});

test("the dynasty offer's three perks are translated (they used to fall back to Chinese)", () => {
  const dynasty = { id: "dynasty-extension", title: "x", years: 5, salary: 20, authority: 96, privileges: ["完全人事决定权", "顶薪续约优先权", "专属训练设施预算"] };
  const { privilegesEn } = renewedCard(dynasty).contract;
  assert.deepEqual(privilegesEn, ["Full personnel control", "Max-contract renewal priority", "Dedicated training-facility budget"]);
});

test("Chinese still reads the Chinese title; an offer the game doesn't know keeps its own words", () => {
  assert.match(renewedCard({ id: "rebuild-extension", years: 4, salary: 7, authority: 88 }).contract.text, /重建续约.*4 年/);
  const odd = renewedCard({ id: "mystery", title: "Mystery", years: 1, salary: 1, authority: 1, privileges: ["x"] }).contract;
  assert.match(odd.textEn, /Mystery/);
  assert.deepEqual(odd.privilegesEn, ["x"]);
});
