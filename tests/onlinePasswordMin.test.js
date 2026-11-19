// S-P2-6 (2026-11-13 review): the online account password minimum was 4 characters —
// too small a guessing space even with the login lock and registration rate limit.
// New accounts need 8; accounts registered under the old 4-character rule still log in
// (there is no password-change flow yet), and login flags them for a one-time upgrade hint.
// Store-level only (no `ws` import) so this file also runs on machines without the package.
import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, writeFileSync, readFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
import {
  createAccountStore,
  MIN_PASSWORD_LENGTH,
  passwordNeedsUpgrade,
  START_RATING,
} from "../server/online-accounts.mjs";

const tmpFile = (tag) =>
  join(tmpdir(), `courtside-pwmin-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

test("S-P2-6: new accounts need an 8-character password", () => {
  const file = tmpFile("min");
  try {
    const store = createAccountStore({ file });
    assert.equal(MIN_PASSWORD_LENGTH, 8);
    const seven = store.register("Seven", "1234567");
    assert.equal(seven.ok, false, "7 characters is still too short");
    assert.match(seven.reason, /8 位/);
    const four = store.register("Four", "abcd");
    assert.equal(four.ok, false, "the old 4-character minimum no longer registers");
    assert.match(four.reason, /8 位/);
    assert.equal(store.register("Empty", "").ok, false);
    assert.equal(store.register("Null", null).ok, false);
    assert.equal(store.register("Eight", "12345678").ok, true, "exactly 8 registers");
    assert.equal(store.verify("Eight", "12345678"), true);
  } finally {
    rmSync(file, { force: true });
  }
});

test("S-P2-6: an account registered under the old 4-character rule still logs in", () => {
  const file = tmpFile("legacy");
  try {
    // Seed the accounts file directly, the way the old server wrote it.
    const salt = randomBytes(16).toString("hex");
    writeFileSync(
      file,
      JSON.stringify([
        {
          name: "OldTimer",
          salt,
          hash: scryptSync("abcd", salt, 64).toString("hex"),
          rating: START_RATING,
          wins: 0,
          losses: 0,
          createdAt: Date.now(),
        },
      ])
    );
    const store = createAccountStore({ file });
    assert.equal(store.verify("OldTimer", "abcd"), true, "legacy short password still verifies");
    assert.equal(passwordNeedsUpgrade("abcd"), true, "and it is flagged for the upgrade hint");
    assert.equal(passwordNeedsUpgrade("secret99"), false);
    assert.equal(passwordNeedsUpgrade(""), false);
    assert.equal(passwordNeedsUpgrade(null), false);
  } finally {
    rmSync(file, { force: true });
  }
});

test("S-P2-6: the upgrade flag is wired through login into the client hint", () => {
  const root = new URL("..", import.meta.url).pathname;
  const serverSrc = readFileSync(join(root, "server/online-server.mjs"), "utf8");
  assert.match(
    serverSrc,
    /passwordUpgrade: passwordNeedsUpgrade\(msg\.password\)/,
    "logged_in carries the flag"
  );
  const clientSrc = readFileSync(join(root, "js/online/client.js"), "utf8");
  assert.match(clientSrc, /msg\.passwordUpgrade/, "client reads the flag");
  assert.match(clientSrc, /不足 8 位/, "client shows the upgrade hint");
  const pageSrc = readFileSync(join(root, "online.html"), "utf8");
  assert.match(pageSrc, /placeholder="至少 8 位"/, "registration form states the new minimum");
});
