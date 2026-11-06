// Role classification for clutch delivery: derived from existing card fields only (no new player data).
import test from "node:test";
import assert from "node:assert/strict";
import { classifyClutchRole, deliveryOf, CLUTCH_ROLES, CLUTCH_DELIVERY } from "../js/engine/clutchRole.js";

const p = (o) => ({ handle: 50, offDribble: 50, catchShoot: 50, threeTend: 30, paint: 50, pass: 50, offenseStyle: "balanced", ...o });

test("each archetype resolves to its role", () => {
  assert.equal(classifyClutchRole(p({ handle: 97, offDribble: 96, catchShoot: 99, threeTend: 99 })), "creator");
  assert.equal(classifyClutchRole(p({ handle: 62, offDribble: 94, catchShoot: 99, threeTend: 99 })), "catch_shoot");
  assert.equal(classifyClutchRole(p({ offenseStyle: "post", paint: 96, threeTend: 1 })), "post");
  assert.equal(classifyClutchRole(p({ paint: 83, threeTend: 1 })), "post", "a paint big without the style tag is still post");
  assert.equal(classifyClutchRole(p({ pass: 82 }), 0.22), "playmaker");
  assert.equal(classifyClutchRole(p({ pass: 82 }), 0.55), "role_player", "a passer with normal appetite is not forced into the playmaker role");
  assert.equal(classifyClutchRole(p({ pass: 57, catchShoot: 87, threeTend: 53 }), 0.28), "catch_shoot", "low appetite alone does not make a playmaker");
  assert.equal(classifyClutchRole(p({})), "role_player");
  assert.equal(classifyClutchRole(null), "role_player");
});

test("every role maps to a delivery mode; only creators and playmakers are promoted to ball handler", () => {
  for (const r of CLUTCH_ROLES) assert.ok(["on_ball", "off_ball", "entry"].includes(CLUTCH_DELIVERY[r]), r);
  assert.deepEqual(CLUTCH_ROLES.filter((r) => deliveryOf(r) === "on_ball").sort(), ["creator", "playmaker"]);
  assert.equal(deliveryOf("post"), "entry");
  assert.equal(deliveryOf("nonsense"), "off_ball", "unknown role fails safe: fed, not handed the ball");
});
