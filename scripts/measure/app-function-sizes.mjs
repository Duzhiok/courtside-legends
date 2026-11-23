// How long are the top-level functions in js/app.js? (B61: pick the next extraction by real size.)
// Measured from the AST (ESLint's espree), so a function's length is its own braces -- NOT "the distance to the next
// function", which also counts the top-level statements that follow it and overstated e.g. syncSeasonStartButtonLabel (14 lines, not 142).
// Usage: node scripts/measure/app-function-sizes.mjs [top=14] [file=js/app.js]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../node_modules/eslint/package.json", import.meta.url));
const espree = require("espree");
const top = Number(process.argv[2]) || 14;
const file = process.argv[3] || new URL("../../js/app.js", import.meta.url).pathname;
const src = readFileSync(file, "utf8");
const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module", loc: true });
const sizes = [];
for (const node of ast.body) {
  const fn = node.type === "FunctionDeclaration" ? node : node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration" ? node.declaration : null;
  if (fn) sizes.push([fn.loc.end.line - fn.loc.start.line + 1, fn.id.name, fn.loc.start.line]);
}
sizes.sort((a, b) => b[0] - a[0]);
console.log(`${sizes.length} top-level functions, ${src.split("\n").length} lines in total`);
for (const [lines, name, at] of sizes.slice(0, top)) console.log(`${String(lines).padStart(5)}  ${name}  (line ${at})`);
