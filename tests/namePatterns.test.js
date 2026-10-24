import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Rules that pick a player by NAME (/fox/.test(name)) silently hit everyone who shares the
 * fragment: Jim and Rick Fox got De'Aaron Fox's "高薪低能", Luka Šamanić got Dončić's ball-hog
 * rating, Kobe Bufkin got Kobe's iron lungs. A pattern that matches more than one person must
 * be listed here on purpose (it names several stars); anything else is a bug.
 */
const INTENDED_LISTS = new Set(["jokic|约基奇|lebron|詹姆斯|giannis antetokounmpo|字母|donci|东契奇"]);

const root = new URL("../", import.meta.url);
const SKIP = /roster|photos\.scraped|photoCredits|nameAliases/;
const files = ["js", "js/data", "js/engine", "js/modes", "js/ui"]
  .flatMap((dir) => readdirSync(new URL(`${dir}/`, root)).filter((f) => f.endsWith(".js") && !SKIP.test(f)).map((f) => `${dir}/${f}`));

const rows = JSON.parse(readFileSync(new URL("js/data/roster.json", root), "utf8")).players;
const people = new Map();
for (const row of rows) if (!people.has(row.bref)) people.set(row.bref, row.name);

const NAME_TEST = /\/((?:\\\/|[^/\n])+)\/([a-z]*)\.test\((?:name|n|nm|nameEn|player\.name|p\.name)\)/g;

function patternsIn(source) {
  const found = [];
  for (const match of source.matchAll(NAME_TEST)) {
    const line = source.slice(0, match.index).split("\n").length;
    found.push({ body: match[1], flags: match[2], line });
  }
  return found;
}

test("the audit really finds name patterns (not an empty loop)", () => {
  const all = files.flatMap((file) => patternsIn(readFileSync(new URL(file, root), "utf8")));
  assert.ok(all.length >= 30, `only ${all.length} patterns found`);
  assert.ok(all.some((p) => p.body.includes("de'?aaron fox")), "the Fox pattern is among them");
});

test("no name pattern matches more than one player, except the listed star lists", () => {
  const problems = [];
  for (const file of files) {
    for (const { body, flags, line } of patternsIn(readFileSync(new URL(file, root), "utf8"))) {
      if (INTENDED_LISTS.has(body)) continue;
      let re;
      try {
        re = new RegExp(body, flags);
      } catch (_) {
        continue;
      }
      const hits = [...people].filter(([, name]) => re.test(name) || re.test(name.toLowerCase()));
      if (hits.length > 1) problems.push(`${file}:${line} /${body}/ → ${hits.slice(0, 5).map(([, n]) => n).join(", ")}${hits.length > 5 ? ", …" : ""}`);
    }
  }
  assert.deepEqual(problems, [], "a bare surname or first name matches other people; use the full name or the bref");
});

test("the listed star lists still exist (a stale allow-list entry hides nothing)", () => {
  const all = files.flatMap((file) => patternsIn(readFileSync(new URL(file, root), "utf8")).map((p) => p.body));
  for (const list of INTENDED_LISTS) assert.ok(all.includes(list), `allow-listed pattern is gone: ${list}`);
});
