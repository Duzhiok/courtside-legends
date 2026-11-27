# Stitch design integration: Phase 1 audit (current theme + the lineup/tactics screen)

Status: audit done; **partially unblocked 2026-11-26** — the Stitch token export is now in the repo (`docs/design/stitch-tokens.json` v2.8.0 + `STITCH-TOKENS-README.md`, 8fedc1c7; reference only, not loaded by the app — see the README's colour-roles ruling), so Phase 1 token mapping can start. Still blocked on the visual reference: the Stitch screens as PNG / the Figma file or link are not in the repo, so no side-by-side restyle check yet. Nothing in CSS changed yet.

## What exists
- **One token file**: `css/tokens.css` (44 custom properties). `style.css` and `home.css` both say "do not re-declare :root
  here" and comply. `timeTravel.css` (22) / `timeTravelViews.css` (5) / `matchBroadcast.css` (1) / `arena.css` (3) define
  local scoped variables (counts = distinct `--name:` declarations per file at baseline 1ed09d1; corrected 2026-11-26 —
  the audit first wrote 4/2/1, missing `--v`, and `--tab-ico` / `--tabbar-pad` / `--tabbar-h`; `matchBroadcast.css`
  had counted a `var(--accent)` use, not a definition). Good base: Stitch tokens go **into tokens.css**, no second file.
- **Two token generations live side by side** in tokens.css:
  - light "paper" set: `--paper --ink --line --court --wood --accent --muted --good --warn --bad --shadow`
  - dark "arena" set: `--arena-* --surface-1/2/3 --surface-line(-strong) --text-hi/mid/low --gold --orange --glow-gold --shadow-deep`
  Screens marked `.arena` are dark, but many panels still paint `--paper` backgrounds with `--ink` text, and some override
  only one of the two. That mix is the root of the white-on-white bugs fixed in B133/B137. **Consolidation = one semantic
  layer** (surface / text / accent / border / state) both themes map onto, not more raw colours.
- **Fonts**: `--font-display` (Bebas Neue, the only web font) and `--font-body` (system CJK stack). Keep; Noto SC was removed
  for perf (d581626) and must not come back via Stitch's font picks; map them to these two.
- **Spacing/radius**: `--space-xs..lg` (4/8/16/24), `--radius-sm/md/lg/pill` exist but most CSS hardcodes px.
- **Hardcoded colours**: ~1,300 hex literals; worst `style.css` 345, `arena.css` 110, `myTeamClubhouse.css` 105,
  `myWorld.css` 104, `home.css` 63. Migrate only what a redesigned screen touches (no repo-wide sweep).
- **Components**: buttons = `.btn` (+ `.primary/.ghost`...) plus ~14 screen-local button families (`.tt-btn`, `.pg-gbtn`,
  `.voice-btn`, `.career-era-btn`, ...). 78 distinct `*card*` class selectors in CSS (counting method: distinct class
  selectors containing `card` across `css/*.css` at baseline 1ed09d1; BEM `--` modifiers folded: 76; names ending in
  `-card` / `card`: 42; used in markup: 74 — the audit first wrote 55, which no counting method reproduces). 12 dialog/sheet families (`.screen-shell-modal`,
  `.app-confirm-dialog`, `.mev-sheet`, `.shop-dialog`, `.reborn-takeover-dialog`, ...). Phase 1 target: `.btn` variants,
  one card shell, one dialog shell from tokens; screen-local families adopt them only when their screen is redesigned.

## First screen: Starting Lineup + Tactics (`#screen-setup`)
Contracts to preserve (JS reads them): `#setup-roster`, `#setup-pos-note`, `#setup-ball-note`, `#setup-scout-wrap`,
`#setup-goals`, `#setup-matchup-board`, `#setup-rotation-bar`, `#setup-skill-panel` (+ shop/inventory/hint),
`#setup-tactics-board` (mounted by `app.js` `mountSetupTacticsBoard()` — gold gate + `#setup-tactics-board` lookup + destroy/re-mount + `syncStarters` — which calls `mountTacticsBoard(root, …)` from `js/ui/tactics/tacticsBoardView.js`; styled by `css/tacticsBoard.css`, 69 lines),
`#btn-start-game` / confirm bar, drag/drop seat targets, `data-*` hooks of `setupRosterView.js`. Seating logic
(`lineupSlots.js`), tactical draft state (`tacticalDraft.js`), PnR plan (`gameplan.pnr`) and GameSim are untouched by a
visual pass. All numbers on screen (OVR, fit/"化学反应", minutes, prices) come from the live model, never from Stitch samples.

Baseline (origin/main 1ed09d1, `node scripts/qa/gold-tactics-board.mjs`): `/tmp/cls-qa/stitch-baseline/{desktop,mobile}-board.png`.
Observed: ~2,000px tall single column of equal-weight panels; the tactics board sits at the bottom, far from the lineup;
the starting five is drawn twice (dark cards + light wood court) in two visual languages; dense small text in cards.

## Needed to start Phase 1 tokens / Phase 2
Token export: **in the repo** (`docs/design/stitch-tokens.json` v2.8.0 + `STITCH-TOKENS-README.md`; reference only — the
README's colour-roles ruling and hard rules apply). Still missing: the Stitch screens as PNG, or the Figma file/link
(the JSON names figma frames, e.g. `Lineup_Tactics_Desktop_Zone23`, but no file/link is in the repo). Then: map tokens onto
tokens.css semantics, restyle `#screen-setup` against it, viewport screenshots desktop 1440 + mobile 390 side by side
with the reference.
