/**
 * Legend Duel D3.2 follow-up — the court sprite wears the avatar
 * challenger's own skin/hair (presentation only).
 *
 * Pins: appearanceFromLook() maps a sanitized avatar look to the exact
 * { skin, hair } hex pair the sprite takes (shaved style maps hair to the
 * skin hex, like the 3D renderer); no look -> null, so the caller keeps
 * the generic figure. spriteAppearance() still falls back to the generic
 * skin/hair for anything missing, and the jersey still comes from the
 * team — appearance never overrides it. The avatar duelist itself is
 * unchanged (kind "avatar", ratings from the body preset); only the
 * display-time look feeds the sprite.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readLook, sanitizeLook } from "../js/data/avatarLook.js";
import { avatarToDuelist } from "../js/duel/duelAvatar.js";
import {
  appearanceFromLook,
  duelSpriteHtml,
  spriteAppearance,
  DEFAULT_SKIN,
  DEFAULT_HAIR,
} from "../js/ui/duelSprites.js";

const LOOK = {
  skin: "deep",
  hair: "blond",
  outfit: "forest",
  style: "short",
  body: "standard",
  figure: "stylized",
};

test("appearanceFromLook maps skin/hair ids to their hex colours", () => {
  assert.deepEqual(appearanceFromLook(LOOK), { skin: "#5b3a22", hair: "#c9a23a" });
});

test("appearanceFromLook maps shaved hair to the skin hex, like the 3D renderer", () => {
  assert.deepEqual(
    appearanceFromLook({ ...LOOK, style: "shaved" }),
    { skin: "#5b3a22", hair: "#5b3a22" },
  );
});

test("appearanceFromLook returns null with no look, so the generic figure stays", () => {
  assert.equal(appearanceFromLook(null), null);
  assert.equal(appearanceFromLook(undefined), null);
  assert.equal(appearanceFromLook("warm"), null);
});

test("appearanceFromLook falls back to the default look for unknown ids", () => {
  assert.deepEqual(
    appearanceFromLook({ skin: "nope", hair: "nope", style: "short" }),
    { skin: "#d9a477", hair: "#1b1b1b" },
  );
});

test("appearanceFromLook reads the account's stored look via readLook", () => {
  const account = { id: "a1", avatar: { ...LOOK } };
  assert.deepEqual(appearanceFromLook(readLook(account)), { skin: "#5b3a22", hair: "#c9a23a" });
});

test("spriteAppearance with an appearance overrides skin/hair but keeps the team jersey", () => {
  const duelist = { team: "CHI" };
  const ap = spriteAppearance(duelist, { appearance: appearanceFromLook(LOOK) });
  assert.equal(ap.skin, "#5b3a22");
  assert.equal(ap.hair, "#c9a23a");
  // The jersey still comes from the team, not the look.
  assert.equal(ap.primary, spriteAppearance(duelist).primary);
  assert.equal(ap.secondary, spriteAppearance(duelist).secondary);
});

test("spriteAppearance without an appearance keeps the generic figure", () => {
  const ap = spriteAppearance({ team: "CHI" });
  assert.equal(ap.skin, DEFAULT_SKIN);
  assert.equal(ap.hair, DEFAULT_HAIR);
});

test("duelSpriteHtml draws the avatar's skin and hair, not the generic ones", () => {
  const duelist = { name: "Me", team: "CHI" };
  const html = duelSpriteHtml(duelist, { action: "idle", appearance: appearanceFromLook(LOOK) });
  assert.match(html, /fill="#5b3a22"/);
  assert.match(html, /fill="#c9a23a"/);
  assert.doesNotMatch(html, new RegExp(`fill="${DEFAULT_SKIN}"`));
});

test("duelSpriteHtml without an appearance draws the generic figure", () => {
  const html = duelSpriteHtml({ name: "MJ", team: "CHI" }, { action: "idle" });
  assert.match(html, new RegExp(`fill="${DEFAULT_SKIN}"`));
  assert.match(html, new RegExp(`fill="${DEFAULT_HAIR}"`));
});

test("the avatar duelist is unchanged: kind avatar, ratings from the body preset", () => {
  const duelist = avatarToDuelist(sanitizeLook(LOOK), { ownerId: "a1", name: "Me" });
  assert.equal(duelist.kind, "avatar");
  assert.equal(duelist.body, "standard");
  // The look is not stored on the duelist: the sprite resolves it at
  // display time from the current account look, so a look change shows
  // on the court without touching the stored Duel Profile.
  assert.equal(duelist.appearance, undefined);
  assert.equal(duelist.skin, undefined);
  assert.equal(duelist.hair, undefined);
});
