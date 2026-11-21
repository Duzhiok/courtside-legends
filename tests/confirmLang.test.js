import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("English mode gets the import, break-down, and sim-the-season confirms", () => {
  assert.equal(app.includes("十幾"), false, "the season confirm uses simplified 几");
  assert.match(app, /导入将替换当前长期生涯存档，确定继续？",\s*"Importing replaces your current long career save/);
  assert.match(app, /Break down \$\{names\}\? This can't be undone/);
  assert.match(app, /These cards are probably worth keeping/);
  assert.match(app, /This sims the rest of the regular season/);
  assert.match(app, /整赛季大约十几秒/);
});
