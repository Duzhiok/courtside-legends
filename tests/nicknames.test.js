import test from "node:test";
import assert from "node:assert/strict";
import { nicknamesFor, nicknameBadgeHtml, primaryNickname } from "../js/data/nicknames.js";

const athlete = (bref, name = "") => ({ bref, name });

test("known legends resolve to their nickname by bref", () => {
  assert.deepEqual(nicknamesFor(athlete("jordami01")), ["飞人"]);
  assert.deepEqual(nicknamesFor(athlete("onealsh01")), ["鲨鱼", "大鲨鱼"]);
  assert.equal(primaryNickname(athlete("westje01")), "Logo Man");
  assert.equal(primaryNickname(athlete("gervige01")), "冰人");
  assert.equal(primaryNickname(athlete("rodmade01")), "大虫");
});

test("name fallback works when bref is missing (same lookup as signature skills)", () => {
  assert.equal(primaryNickname({ name: "Michael Jordan" }), "飞人");
  assert.equal(primaryNickname({ nameEn: "George Gervin" }), "冰人");
});

test("unknown players get no nickname, no crash", () => {
  assert.deepEqual(nicknamesFor(athlete("nobody01", "Nobody Noname")), []);
  assert.equal(primaryNickname(null), null);
  assert.equal(nicknameBadgeHtml(undefined), "");
});

test("badge html embeds the nickname and is empty when there is none", () => {
  const html = nicknameBadgeHtml(athlete("jordami01"));
  assert.ok(html.includes("飞人"));
  assert.ok(html.includes("nickname-badge"));
  assert.equal(nicknameBadgeHtml(athlete("nobody02")), "");
});

test("multi-nickname players expose all of them in the tooltip title", () => {
  const html = nicknameBadgeHtml(athlete("onealsh01"));
  assert.ok(html.includes("鲨鱼"));
  assert.ok(html.includes("大鲨鱼"));
});
