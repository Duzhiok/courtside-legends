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
- 20 % of draws are coach cards: never assume every reveal is a player.
- Seed fixed 成色 rolls (see `bSeed`) — a random roll can protect every "junk" card and skip checks.

| script | covers |
|---|---|
| `gacha-ui.mjs` | home lanes, banners, pity counters, wishlist, collection, sandbox |
| `collection-recycle.mjs` | capacity, recycling + confirms, 技能碎片 shop, full binder, sandbox ×N |
| `tickets-tasks.mjs` | welcome tickets, 新手保底, task board |
| `era-banner.mjs` | 池内档位 flag on era banners |
| `collection-filter.mjs` | search / sort / filters, focus, persistence, chip layout |
