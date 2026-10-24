import test from "node:test";
import assert from "node:assert/strict";
import { primaryNickname, nicknameBadgeHtml, NICKNAMES } from "../js/data/nicknames.js";

const athlete = (bref, name = "") => ({ bref, name });

test("known legends resolve to exactly one nickname by bref", () => {
  assert.equal(primaryNickname(athlete("jordami01")), "飞人");
  assert.equal(primaryNickname(athlete("onealsh01")), "鲨鱼");
  assert.equal(primaryNickname(athlete("westje01")), "Logo Man");
  assert.equal(primaryNickname(athlete("gervige01")), "冰人");
  assert.equal(primaryNickname(athlete("rodmade01")), "大虫");
});

test("every nickname entry is a single string, never a list", () => {
  for (const [bref, value] of Object.entries(NICKNAMES)) {
    assert.equal(typeof value, "string", `${bref} nickname should be one string`);
  }
});

test("name fallback works when bref is missing (same lookup as signature skills)", () => {
  assert.equal(primaryNickname({ name: "Michael Jordan" }), "飞人");
  assert.equal(primaryNickname({ nameEn: "George Gervin" }), "冰人");
});

test("unknown players get no nickname, no crash", () => {
  assert.equal(primaryNickname(athlete("nobody01", "Nobody Noname")), null);
  assert.equal(primaryNickname(null), null);
  assert.equal(nicknameBadgeHtml(undefined), "");
});

test("badge html embeds the single nickname and is empty when there is none", () => {
  const html = nicknameBadgeHtml(athlete("jordami01"));
  assert.ok(html.includes("飞人"));
  assert.ok(html.includes("nickname-badge"));
  assert.equal(nicknameBadgeHtml(athlete("nobody02")), "");
});
