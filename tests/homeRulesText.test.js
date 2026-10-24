import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_STARS, SOULS_PER_STAR } from "../js/data/gacha.js";
import { SOULS_AT_MAX_STAR } from "../js/data/accountGacha.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ruleLine = (needle) => html.split("\n").find((line) => line.includes(needle)) || "";

test("the home page no longer promises random skills from duplicates or a 20-merge cap", () => {
  assert.doesNotMatch(html, /并随机领悟技能|单卡最多合并 20 次|自动合并/);
});

test("the duplicate-card rule on the home page quotes the numbers the code really uses", () => {
  const line = ruleLine("重复卡：");
  assert.ok(line, "the duplicate-card rule is missing from the home page");
  assert.ok(line.includes(`★1–★${MAX_STARS}`), "max stars");
  assert.ok(line.includes(`转成 ${SOULS_AT_MAX_STAR} 个球魂`), "souls from a maxed duplicate");
  assert.ok(line.includes(`${SOULS_PER_STAR} 个球魂可给该球员`), "souls per star");
});

test("the home page names the three skill sources and says awards give none", () => {
  const line = ruleLine("重复卡：");
  for (const phrase of ["比赛表现领悟", "技能碎片购买", "★5 礼物", "奖项只是荣誉，不送技能"]) assert.ok(line.includes(phrase), phrase);
});

test("the home page points players at the credits page, which exists", () => {
  assert.match(html, /id="btn-open-credits"/);
  assert.match(html, /id="screen-credits"/);
  assert.match(html, /id="credits-body"/);
  assert.match(html, /id="btn-credits-back"/);
});
