// Validate assets/avatar2d against the art spec. Usage: node scripts/avatar/validate-avatar2d.mjs [assets/avatar2d]
// Exit 0 = no FAIL (WARN allowed), 1 = at least one FAIL, 2 = folder missing.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { validateSet } from "./avatar2dValidate.mjs";

const root = resolve(process.argv[2] || "assets/avatar2d");
if (!existsSync(root)) { console.error(`no art folder at ${root}`); process.exit(2); }

const files = new Map();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name !== ".DS_Store") files.set(relative(root, full).split("\\").join("/"), readFileSync(full));
  }
};
walk(root);

const findings = validateSet(files);
const order = { FAIL: 0, WARN: 1, PASS: 2 };
for (const f of [...findings].sort((a, b) => order[a.level] - order[b.level])) console.log(`${f.level.padEnd(4)} ${f.id.padEnd(5)} ${f.msg}`);
const count = (level) => findings.filter((f) => f.level === level).length;
console.log(`\n${count("PASS")} passed, ${count("WARN")} warnings, ${count("FAIL")} failures (${files.size} files in ${root})`);
console.log("Not checked here (human review): V5 baked backgrounds, V7 Shaved seam, V8 dark colourways, V11 licensing; V9 portrait size is a renderer property.");
process.exit(count("FAIL") ? 1 : 0);
