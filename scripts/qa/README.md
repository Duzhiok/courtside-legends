# Browser regression scripts

Headless-Chromium checks for the gacha / collection / sandbox UI (desktop 1280×800 + phone 390×844).
They seed a throwaway account through the page's own modules, so no UI onboarding is needed.

```bash
# 1. serve the worktree
python3 scripts/serve_nocache.py 5173 &

# 2. one-time: a tiny Playwright client that reuses an already-downloaded Chromium
mkdir -p /tmp/cls-qa && cd /tmp/cls-qa && npm init -y && npm i playwright-core@1.58
cp <repo>/scripts/qa/*.mjs /tmp/cls-qa/        # scripts import "playwright-core" from here

# 3. run (arg = screenshot output dir)
node collection-recycle.mjs <repo>/.wibey-tasks/agent-browser
```

Notes
- Chromium path is `~/Library/Caches/ms-playwright/chromium_headless_shell-1208/...` (macOS); edit `EXE` elsewhere.
- Use `waitUntil: "domcontentloaded"` — remote player photos never finish loading offline.
- Images are `loading="lazy"`: scroll each into view before asserting on it (see `revealAll` in `photo-chain.mjs`), and print each check as it runs so a crash cannot hide what passed.
- 20 % of draws are coach cards: never assume every reveal is a player.
- Seed fixed 成色 rolls (see `bSeed`) — a random roll can protect every "junk" card and skip checks.

| script | covers |
|---|---|
| `gacha-ui.mjs` | home lanes, banners, pity counters, wishlist, collection, sandbox |
| `collection-recycle.mjs` | capacity, recycling + confirms, 技能碎片 shop, full binder, sandbox ×N |
| `tickets-tasks.mjs` | welcome tickets, 新手保底, task board |
| `era-banner.mjs` | 池内档位 flag on era banners |
| `collection-filter.mjs` | search / sort / filters, focus, persistence, chip layout |
| `banner-explain.mjs` | banner subtitles + explanation panel; panel follows the wishlist |
| `draw-fold.mjs` | where the pull button sits vs. the fold (phone + desktop) |
| `contrast.mjs` | WCAG AA contrast of the draw-page text, measured from real pixels |
| `photo-chain.mjs <out-dir>` | the whole picture chain in a real browser: home wall, credits page, collection avatars (photo + generated), a blocked photo falls back to the avatar, **no request to NBA.com / Basketball-Reference / ui-avatars**; desktop + 390px. Needs network for Wikimedia thumbnails |
| `legends-wall-dump.mjs <out.png>` | prints each tile's real image file + load state, saves a screenshot |
| `star-skill-gift.mjs <out-prefix>` | pins Math.random so every pull is the same card, then walks pull 1 (new) → 5th duplicate (★5 skill gift) → 6th (球魂); element screenshot of the reveal |
| `season-sim-continue.mjs <out-dir>` | season result screen: 模拟下一场 stays on the result screen instead of forcing a trip to the hub; 模拟整个赛季 shows live progress + disabled buttons during the ~15-20s run (not a frozen tab) and settles back to normal once the regular season ends; also guards the box-score table's overflow-x fix |
| `playoff-manual-play.mjs <out-dir>` | playoffs 亲自指挥/快速模拟本场 (previously the WHOLE playoffs only had 一键打完季后赛, no per-game control): patches the persisted `cls_season_v1` standings to force a top seed deterministically (everything after that is real UI), then clicks 亲自指挥 all the way into the real `#screen-game` live court, aborts via reload (season was saved pre-game, so the attempt cleanly resets), quick-sims the rest of the series via the result screen's 模拟下一场 loop, and checks both a win-continues and a loss-eliminates outcome |
| `court-panel-height.mjs <out-dir>` | R84: live-court left column (court+feed) vs right coach-panel are the same total height, top-aligned, and the heights do NOT drift as feed/coach-panel content changes over ~5s of real play (the actual "播报框和战术框一直在跳" bug) — desktop + 390px |

Visual checks
- **A passing "image loaded" check does not prove it is the right person.** The 1991 Jordan tile used to load fine — as a signed-basketball display case. Look at the screenshot, and print the file names (`legends-wall-dump.mjs`).
- Save every screenshot to a **fresh file name**. Re-reading a reused path once showed a stale image and led to a wrong conclusion.
- `cdn.nba.com` can be unreachable from a sandbox while `curl` works; treat those tiles as "unverified", not "broken".
- **Screenshot the element you are verifying, not the viewport.** A viewport shot of the draw page showed only the header; the gift message was below the fold and the check looked done when it was not.
- `node --check` does not catch a missing export — one removed name would blank the whole app in the browser. Boot the real page after deleting exports.
