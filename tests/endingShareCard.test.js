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
