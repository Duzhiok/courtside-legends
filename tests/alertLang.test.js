import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

/** Arguments of every alert(...) call. Strings are skipped so nested parens inside text don't end the call. */
function alertArguments(src) {
  const args = [];
  let i = 0;
  while ((i = src.indexOf("alert(", i)) !== -1) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let j = i + "alert".length;
    const start = j;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    args.push(src.slice(start + 1, j));
    i = j + 1;
  }
  return args;
}

test("every Chinese alert goes through L()", () => {
  const bare = alertArguments(app).filter((arg) => (
    /[\u4e00-\u9fff]/.test(arg)
    && !/\bL\(/.test(arg)
    && !/getLang\(\)\s*===\s*"en"/.test(arg)
  ));
  assert.deepEqual(bare, []);
});

test("English alerts cover saves, filler picks, and the offseason recap", () => {
  assert.match(app, /No save found\./);
  assert.match(app, /Filler picks have to be free/);
  assert.match(app, /Keep at least 8 players\./);
  assert.match(app, /Offseason notes:/);
  assert.match(app, /Couldn't clear the cache:/);
  assert.equal(app.includes("只能选 0 块球员"), false);
});
