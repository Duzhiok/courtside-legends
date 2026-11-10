import test from "node:test";
import assert from "node:assert/strict";
import { FEEDBACK_URL, MODULE_LABEL, attachCountText, attachReasonText, feedbackTemplate, mediaListHtml, moduleLabel, notePlaceholder, playerVoiceHtml, ratingStateText } from "../js/ui/playerVoiceView.js";
import { FEEDBACK_MODULES } from "../js/data/feedbackDraft.js";

const CJK = /[\u4e00-\u9fff]/;
const attrs = (html, name) => [...html.matchAll(new RegExp(`${name}="([^"]+)"`, "g"))].map((m) => m[1]);

test("Player Voice: submit is disabled and says why until a real submit exists; nothing claims 'sent'", () => {
  const closed = playerVoiceHtml("zh", {}, { canSubmit: false });
  assert.match(closed, /data-pv-action="submit" disabled aria-disabled="true"/);
  assert.match(closed, /反馈服务还没有上线/);
  assert.match(closed, /草稿/);
  assert.doesNotMatch(closed, /已提交|已发送|感谢你的反馈/);
  const open = playerVoiceHtml("zh", {}, { canSubmit: true });
  assert.doesNotMatch(open, /data-pv-action="submit" disabled/);
  assert.doesNotMatch(open, /反馈服务还没有上线/);
  assert.match(playerVoiceHtml("en", {}, { canSubmit: false }), /not online yet/);
});

test("Player Voice: a draft restores type, module, rating and note; the note is escaped; GitHub is a small fallback link", () => {
  const html = playerVoiceHtml("zh", { category: "bug", module: "career", stars: 3, note: "</textarea><img src=x onerror=1>" });
  assert.match(html, /name="pv-category" value="bug" checked/);
  assert.match(html, /<option value="career" selected>/);
  assert.match(html, /name="pv-stars" value="3" checked/);
  assert.equal((html.match(/class="pv-star on"/g) || []).length, 3, "stars 1-3 are lit");
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /已恢复你在这台设备上的草稿/);
  assert.equal(playerVoiceHtml("zh", {}).includes("已恢复"), false, "no draft, no restore notice");
  assert.match(html, /class="pv-link"/);
  assert.ok(html.includes(FEEDBACK_URL));
  assert.doesNotMatch(html, /btn[^"]*"[^>]*href=/, "GitHub is a plain text link, not a button");
  for (const bad of [{ category: "admin", stars: 9, module: "<x>" }, { category: null, stars: "x" }]) {
    const safe = playerVoiceHtml("zh", bad);
    assert.match(safe, /value="suggestion" checked/);
    assert.match(safe, /<option value="game" selected>/, "an unknown module falls back to the whole game");
    assert.doesNotMatch(safe, /pv-star on/);
  }
});

test("rating: unrated shows hollow stars and says 'Not rated'; the block is collapsed unless it is a rating or already rated", () => {
  const blank = playerVoiceHtml("en", {});
  assert.doesNotMatch(blank, /pv-star on/);
  assert.match(blank, /Not rated/);
  assert.match(blank, /Rate Your Game Experience \(Optional\)/);
  assert.doesNotMatch(blank, /<details class="pv-rate" id="pv-rate" open>/, "an idea/bug does not push the rating");
  assert.match(playerVoiceHtml("en", { category: "rating" }), /<details class="pv-rate" id="pv-rate" open>/);
  assert.match(playerVoiceHtml("en", { category: "bug", stars: 2 }), /<details class="pv-rate" id="pv-rate" open>/, "an existing rating is never hidden");
  assert.match(playerVoiceHtml("zh", { stars: 5 }), /5\/5/);
  assert.equal(ratingStateText(0, "zh"), "未评分");
  assert.equal(ratingStateText(4, "en"), "4/5");
  assert.match(playerVoiceHtml("zh", {}), /游戏体验评分（可选）/);
  assert.match(playerVoiceHtml("zh", {}), /data-pv-action="clear-stars"/);
});

test("module picker: every module is offered once, labelled in both languages, and the context hint only shows when asked", () => {
  const html = playerVoiceHtml("zh", {});
  assert.deepEqual(attrs(html.match(/<select id="pv-module">[\s\S]*?<\/select>/)[0], "value"), FEEDBACK_MODULES);
  assert.deepEqual(Object.keys(MODULE_LABEL), FEEDBACK_MODULES, "no module without a label");
  assert.equal(moduleLabel("myteam", "zh"), "My Team");
  assert.equal(moduleLabel("gameplay", "en"), "Gameplay");
  assert.equal(moduleLabel("nope", "en"), "Entire Game");
  assert.match(playerVoiceHtml("zh", { module: "world" }, { context: { suggested: true } }), /id="pv-ctx">已按你当前所在的页面选了「My World」/);
  assert.match(playerVoiceHtml("zh", {}), /id="pv-ctx" hidden>/);
  for (const [cat, re] of [["bug", /怎么复现/], ["rating", /整体感受/], ["suggestion", /还能做什么/]]) assert.match(notePlaceholder(cat, "zh"), re);
});

test("attachments: screenshots and ONE video are separate, the video has a real player, names are escaped, counts say both", () => {
  const list = [
    { id: "i1", kind: "image", name: "<img src=x onerror=1>.png", size: 300 * 1024 },
    { id: "v1", kind: "video", name: "run.mp4", size: 2.5 * 1048576 },
  ];
  const html = mediaListHtml(list, ["blob:1", "blob:2"], "en");
  assert.ok(!html.includes("<img src=x"), "name escaped");
  assert.match(html, /300 KB/);
  assert.match(html, /2\.5 MB/);
  assert.equal((html.match(/<video class="pv-player" controls/g) || []).length, 1, "only the video gets a player");
  assert.match(html, /data-pv-action="pick-video" data-id="v1"/, "replacing the video reuses the video picker");
  assert.match(html, /data-pv-action="replace-image" data-id="i1"/);
  assert.equal((html.match(/data-pv-action="remove-media"/g) || []).length, 2);
  assert.doesNotMatch(html, CJK);
  assert.equal(attachCountText(list, "en"), "Images 1/3 · Video 1/1");
  assert.equal(attachCountText([], "zh"), "图片 0/3 · 视频 0/1");
  const panel = playerVoiceHtml("zh", {});
  assert.match(panel, /id="pv-image-input"[^>]*accept="image\/png,image\/jpeg,image\/webp"[^>]*multiple/);
  assert.match(panel, /id="pv-video-input"[^>]*accept="video\/mp4,video\/webm"/);
  assert.match(panel, /id="pv-drop"/);
  assert.match(panel, /MP4\/WebM[^<]*20MB/);
});

test("refusal reasons exist for images and videos, in both languages, with no Chinese leaking into English", () => {
  for (const r of ["limit", "type", "empty", "huge", "toobig", "unreadable", "whatever"]) assert.ok(attachReasonText(r, "zh").length > 0 && !CJK.test(attachReasonText(r, "en")), r);
  for (const r of ["type", "empty", "huge", "whatever"]) assert.ok(attachReasonText(r, "zh", "video").length > 0 && !CJK.test(attachReasonText(r, "en", "video")), r);
  assert.match(attachReasonText("huge", "en", "video"), /20 MB/);
  assert.match(attachReasonText("huge", "en", "image"), /30 MB/);
  assert.match(attachReasonText("type", "zh", "video"), /MP4/);
});

test("copy template: type, module, screen, rating only when given, and it says attachments are not included", () => {
  const t = feedbackTemplate({ note: "  加一个投篮训练小游戏 ", lang: "zh", userAgent: "UA/1", module: "myteam", screen: "screen-my-team-lineup" });
  assert.match(t, /我的想法: 加一个投篮训练小游戏/);
  assert.match(t, /反馈模块: My Team/);
  assert.match(t, /所在页面: screen-my-team-lineup/);
  assert.match(t, /UA\/1/);
  assert.doesNotMatch(t, /评分/, "no rating line when unrated");
  assert.match(feedbackTemplate({ note: "n", category: "bug", stars: 4, lang: "zh" }), /类型: 问题[\s\S]*游戏体验评分: 4\/5/);
  assert.match(feedbackTemplate({ category: "rating", stars: 5, lang: "en" }), /Type: Rating\nModule: Entire Game\nGame experience rating: 5\/5/);
  assert.match(feedbackTemplate({ lang: "en" }), /write your feedback here/);
  assert.match(feedbackTemplate({ note: "x", imageCount: 2, videoCount: 1, lang: "en" }), /2 screenshot\(s\), 1 video\(s\) \(copied text does not include files/);
  assert.doesNotMatch(feedbackTemplate({ note: "x", lang: "en" }), /Attachments/);
});

test("the whole English dialog has no Chinese left, in every state", () => {
  for (const draft of [{}, { category: "bug", stars: 2, note: "hi", module: "career" }, { category: "rating" }]) {
    for (const canSubmit of [false, true]) assert.doesNotMatch(playerVoiceHtml("en", draft, { canSubmit, context: { suggested: true } }), CJK);
  }
});

test("accessibility: a labelled dialog title, close button, named radios, and the note has a label", () => {
  const html = playerVoiceHtml("zh", {});
  assert.match(html, /<h2 id="pv-title">/);
  assert.match(html, /class="pv-close" data-pv-action="close" aria-label="关闭"/);
  assert.match(html, /<label class="pv-sr" for="pv-note">/);
  const radios = html.match(/<label class="pv-(seg-opt|star)[^>]*>[\s\S]*?<\/label>/g);
  assert.equal(radios.length, 8, "3 types + 5 stars");
  for (const r of radios) assert.match(r, /<span[^>]*>[^<]+<\/span>\s*(<\/label>|<span class="pv-sr">[^<]+<\/span><\/label>)/, "each radio carries visible or screen-reader text");
});
