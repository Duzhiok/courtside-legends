# Stitch tokens: reference only (user ruling 2026-11-25)

`stitch-tokens.json` is the token export from the user's Stitch project (v2.8.0), saved as a **design reference**. It is not
loaded by the app and is not a second theme. Global integration into `css/tokens.css` belongs to the UI Agent (see
`STITCH-INTEGRATION-AUDIT.md`, which was blocked on exactly this file).

Dropped from the export: its `mcp_verification_map` (DOM selectors such as `.cls-starting-grid`, `.cls-trade-radar-matrix`
and files such as `draft.css`, `cba_calc.js` that do not exist here). `meta.screens_covered` is kept only as a list of what
the Stitch boards show; the `css_file` names in it are Stitch's guesses, not repo files.

## Colour roles (the ruling)

Keep the current light gold. Do **not** globally replace `--gold`. Stitch's orange joins as the interaction colour.

| Colour | Hex | Use for |
| --- | --- | --- |
| Light gold (ours) | `#f6c870` | OVR, trophies, honours, legend cards, headline numbers |
| Interaction orange (Stitch) | `#f48225` | primary buttons, the selected state, key interactions |
| Tactical cyan | `#38bdf8` | tactics, data analysis, scouting |
| Positive green | `#22c55e` | growth, stamina, positive effects |
| Rare purple | `#c084fc` | rare skills, awakening, special collectibles |
| Danger red | `#ef4444` | defeat, injury, warnings, negative states |

Stitch surfaces (`#070b09` / `#0e1511` / `#16201a` / `#1b2620`) are close to the existing `--arena-*` / `--surface-*` set;
map them onto those, do not add parallel raw colours.

## Hard rules

- Stitch sample data and mechanics that the game does not have (salary cap $, CBA, three-team trades, synergy levels, zone
  "Lv.Max", counter-offer timers, mansion, soul breakthrough, ...) never enter the product. Unbuilt mechanics are backlog
  (B115); every number on screen comes from GameSim / the save.
- Fonts: Stitch's Space Grotesk / JetBrains Mono map onto the existing `--font-display` / `--font-body`; no new web fonts
  (Noto SC was removed for performance, d581626).
