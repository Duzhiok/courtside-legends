// Minimal lint config: catch real bugs (undefined vars, unreachable code,
// unused vars) without imposing a style war. No stylistic rules on purpose —
// this project has no prettier/formatter and we don't want lint noise to
// drown out the handful of real findings.
import globals from "globals";

const browserSource = {
  ecmaVersion: 2022,
  sourceType: "module",
  globals: { ...globals.browser },
};

const nodeSource = {
  ecmaVersion: 2022,
  sourceType: "module",
  globals: { ...globals.node },
};

// QA scripts drive a real browser (Playwright): most of the file is Node,
// but page.evaluate() callbacks are literally executed in the browser, so
// both global sets are legitimately in play in the same file.
const qaSource = {
  ecmaVersion: 2022,
  sourceType: "module",
  globals: { ...globals.node, ...globals.browser },
};

const rules = {
  "no-unused-vars": [
    "warn",
    { args: "none", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
  ],
  "no-undef": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-duplicate-case": "error",
  "no-unreachable": "error",
  "no-const-assign": "error",
  "no-self-compare": "error",
  "no-fallthrough": "error",
  "no-case-declarations": "warn",
  "use-isnan": "error",
  "valid-typeof": "error",
};

export default [
  {
    ignores: ["node_modules/**", "js/data/roster.json", "docs/superpowers/**"],
  },
  {
    files: ["js/**/*.js"],
    languageOptions: browserSource,
    rules,
  },
  {
    // The online server and its tests run on Node only. It was never listed here, so it was
    // linted with NO rules at all -- an undefined variable in server/ passed silently.
    files: ["server/**/*.mjs"],
    languageOptions: nodeSource,
    rules,
  },
  {
    files: ["scripts/qa/**/*.mjs"],
    languageOptions: qaSource,
    rules,
  },
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.js", "tests/**/*.js"],
    languageOptions: nodeSource,
    rules,
  },
];
