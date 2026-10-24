# Courtside Legends

> [中文版](README.md) · Chinese version

Draft season cards by year, build a team, and let the engine simulate the games — while you sit courtside as the coach: call timeouts, shout, set tactics, sub players, talk to them, equip skills, and set matchups.

> Even wide-open looks clang. Stacking superstars does not make you invincible. Chemistry, roster fit, tactics, and personality decide what happens on the floor.

**Repository:** [github.com/Duzhiok/courtside-legends](https://github.com/Duzhiok/courtside-legends)

### Latest highlights

- **Time-travel career, five chapters**: go back in time as a manager-coach and live five years of front-office direction, trade pressure, timeline divergence, and title windows; a bad record gets you fired, and you negotiate an extension when the term ends
- **Ending share card**: when the five-year term ends, a screenshot-ready summary card is generated (record, titles, signature trades, extension outcome), plus one-tap copy of the recap text
- **Front-office decision tools**: team evaluation, inbound offers from other teams, a "keep / trade / waive-and-sign" three-way comparison, and draft-pick OVR value conversion
- **New home page**: arena-style banner + a photo wall of all-time legends, each mode paired with a representative star
- **Real headshots**: local illustrations → attributed Wikimedia photos → Basketball-Reference headshot hotlinks → procedurally generated silhouette avatars, a four-level fallback, so cartoon letter avatars are almost gone
- **Three separate autopilot switches**: offensive autopilot / defensive autopilot / keep-current-strategy (fatigue subs only, tactics untouched), instead of a single "smart autopilot" toggle
- **Soul development**: duplicate pulls only bank "Souls"; spending Souls to raise a card to ★5 grants one skill (pulling itself grants none); duplicates never stack into an endless progression trap
- **Coach's bench redesign**: wider and taller on desktop, so tactics / pace / subs / matchups no longer need endless scrolling
- **Position assignment fix**: when a roster overflows, the game finds a fitting backup slot by size and skill instead of forcing a big center to play guard

---

## Install & run

### Requirements

- [Git](https://git-scm.com/) (optional — a zip download works too)
- [Python 3](https://www.python.org/) (recommended) or Node.js (optional)
- A modern browser (Chrome / Edge / Safari / Firefox)

> ⚠️ Do **not** open `index.html` directly with `file://` — ES Modules and roster loading will fail. Serve it over local HTTP.

### Option 1: Clone from GitHub (recommended for friends)

```bash
git clone https://github.com/Duzhiok/courtside-legends.git
cd courtside-legends
python3 scripts/serve_nocache.py
```

Open in your browser: **http://127.0.0.1:5173/**

`serve_nocache.py` disables cache headers, so edits show up on refresh.

### Option 2: Standard static server

```bash
cd courtside-legends
python3 -m http.server 5173
# or
npx --yes serve -p 5173
```

Then open http://127.0.0.1:5173/

### Option 3: ZIP package

1. On the GitHub page, click **Code → Download ZIP**, or zip the repo and send it to someone
2. Unzip, enter the directory, and run any of the `python3` / `npx` commands above
3. Open http://127.0.0.1:5173/ in your browser

### Update to the latest version

```bash
cd courtside-legends
git pull
python3 scripts/serve_nocache.py
```

If the UI still looks like the old version: hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`), or click "Clear roster local cache" on the home page and re-enter.

### Optional: Rebuild the roster data

Requires internet access to sources like Basketball-Reference:

```bash
python3 scripts/build_full_roster.py
```

Output: `js/data/roster.json` (loaded asynchronously at game start and written to the browser's local cache).

---

## Game modes

| Mode | Description |
|------|------|
| **Custom matchup** | 15-gold budget draft of peak cards → a 32-team historical-team knockout; the same entry also hosts two-player bidding and the Legendary Eight |
| **Ranked** | Play with your local account's roster + coach / tactics; wins and losses count toward your record, and your card pool is saved permanently |
| **Draft build** | Draft players and a coach, then play one full simulated game (locked to real-time pace) |
| **Regular-season journey** | A 32-team league, or relive one full historical year (e.g. 1991: that year's full regular season → playoffs); name your own Las Vegas team; awards |
| **Gold promotion** | Win a 32-random-team title → challenge 15 historical playoff teams → then 7 historical champions; progress auto-saves |
| **Multiplayer knockout** | 2–8 players locally; one extra pick per round survived, all the way to the Finals |
| **Quick demo** | The system auto-builds two teams and tips off immediately so you can watch the coaching |
| **League manager** | Build a long-term league straight from the home page, reusing the season-build flow, and run 15+ years of games, markets, drafts, development, and history |
| **Time-travel career** | Pick a historical year and a coaching philosophy, interview with teams, and rewrite five years of history with limited future knowledge; renew or walk away based on performance |

### Custom sub-modes

- **Budget draft**: spend 15 gold on 5→1 priced peak cards plus 0-gold bench fillers, then play the historical 32-team knockout
- **Two-player bidding**: two local players bid against each other for free agents
- **Legendary Eight**: eight random legendary teams; draft that team's historical players and assign positions

---

## Feature overview

### Accounts & card pool

- Local multi-account support; the system deals 7 cards at the start, then you pick 5 more to form your core
- **Gacha economy**: 7 OVR tiers of odds (Common → Myth+), All-Star pity every 10 pulls, Legend pity every 50 pulls, and a guaranteed 85+ within your first 5 pulls; era/team-limited pools tier by in-pool relative rank, so weak eras can still yield top in-pool cards
- One free daily pull + tickets earned from tasks / ranked play + extra gold pulls (¤200 each, 2 per day); coach cards also count toward pity
- **Collection cap of 60 cards** (keep at least 12); recycle redundant cards for gold and skill shards; the catalog remembers every card you have ever owned (recycling does not erase it)
- **Soul star-up**: duplicate cards only bank Souls for that player; spend Souls to raise a card to ★5 (the cap); only that ★5 promotion grants one skill, drawn from common / rare / epic skills — auto star-up from pulling grants none
- "My player cards" favorites (search / sort / rarity / grade / era filters); your ranked core plays in ranked games

### Roster & player cards

- **Full historical roster**: ~23,000+ season cards / 4,300+ players (from 1950, single seasons with GP ≥ 5)
- Every card is tied to a **season year** and that season's tendencies (Celtics Shaq ≠ peak Lakers Shaq)
- Avatar priority: local illustrations → attributed Wikimedia photos → Basketball-Reference headshot hotlinks (`HOTLINK_HEADSHOTS` toggle, recommended for local private use only — turn it off or localize downloads before any public release) → procedurally generated team-color silhouette avatars as the fallback
- Team-abbreviation badge sits outside the avatar's bottom-left corner, never covering the face
- Age curve: rookies are quicker and springier; veterans are better at judgment, strength, passing, feel, leadership, and clutch play
- Hidden rarity (end-of-bench → superstar, etc.) only affects pull weights and **is never shown in the UI**
- Ratings are derived from season stats on the NBA 2K scale; landmark seasons are calibrated to published 2K anchors

### Courtside coaching (during games)

- **Live ball**: you can only "shout" or "call timeout"
- **Timeouts / between quarters / halftime / opponent timeouts**: change tactics, talk, sub, positioning, philosophy, pace, matchups, and equip skills
- A timeout can break an opponent's scoring run
- Subs: on-court / bench cards show avatars and ratings; tap to confirm; injured players are restricted
- On-court PG–C slots can be swapped (swap with the occupant)
- Individual offense/defense orders: ball-handler initiator, play style, usage, aggressiveness, defensive focus, and more
- Game pace: slow down to protect efficiency / normal / speed up to grab possessions
- Speed: 1x real-time / 2x / 3x (draft mode locks real-time pace)
- "Sim the whole game": finish immediately with the current lineup and tactics

### Pre-game setup

- Pick your own starting five; roles and target minutes (allocated by stamina)
- Custom coaching philosophy (offense / defense / morale / load) + tactic checkboxes
- **Lineup packages**: a five-man unit in one tap, switchable during timeouts
- **Matchup table**: same-position defense by default (PG↔PG…), manually adjustable; plus shadow / double-team / deny-the-post options
- Designate the ball-handler initiator and their play style

### Gold promotion & market

- Format: groups of four, repechage, double elimination; stages 32→16→8→4→2→1
- Wins earn gold; buy and sell players on the market (max 12 players, at least 8 dressed)
- When gold is short, the buy button greys out with "short" and shows how far over budget you are
- Refresh the free-agent market / coach shelf / skill-pack shelf (costs gold)
- **Scout packs**: roll randomly and flag value gems and bench bandits
- Hire a head coach (famous coaches cost more); with a vacancy, the system fills a random coaching staff for games
- After winning the title, keep challenging the 15 historical playoff teams and the 7 historical champions
- **Auto-save**; resume or discard progress from the home page
- **Injury balance**: in-game and between-games injury rolls are both capped (≤ 2% per single possession, ≤ 16% between games) — ordinary players almost never get hurt in round one; only high-risk "glass" players in deep rounds need worrying about

### Skill system

- **Skills come from only three sources**: epiphanies triggered by in-game performance (streak benchmarks, chance-based, capped attempts), skill-shard purchases (from recycled cards), and the one-time grant when Souls raise a card to ★5; **awards (MVP / All-NBA, etc.) are honors only and no longer grant skills**
- **Signature moves**: e.g. Euro step (Wade), logo range (Curry / Thompson / Lillard, etc.), splash spot-ups, step-backs, one-leg fades… they trigger randomly and are never guaranteed buckets
- **Role traits**: clingy wrap defense, on-ball stopper · 3&D, hot temper, etc., and they can sit on non-stars
- **Duo skills**: Splash Bros, Lob City, Wade-to-LeBron, etc. — they only attach **when both partners share the floor** and cannot be bought or learned
- **Auras**: Potential Unleashed lifts teammates; Defensive Captain lifts the whole team's defense
- **Stamina skills**: Iron Lungs, Everlasting Motor; **Iron Man** lowers injury risk
- Buy skills from the skill library with shards → equip on a player; **each card can hold at most 2 purchased skills** (built-in / epiphany / Soul-granted skills don't count toward the cap); a full card can unequip to swap, and unequipped purchases return to the library
- Selling a player converts their equipped purchased skills at ~55%
- Shelf refreshes improve variety and raise the exposure of Iron Lungs / Everlasting Motor / Iron Man
- Skills can be installed from the market, the starter-selection page, and in-game timeouts

### Simulation & performance

- Possession-based simulation; full box score (MIN/PTS/REB/OREB/DREB/AST/STL/BLK/TOV/PF/FG/3PT/FT/+/-)
- Shot logic: shot / three **tendencies** decide whether he shoots; ratings decide whether it goes in
- Wide-open looks can still miss; the log shows expected-make-probability info
- Chemistry, roster fit, personality, fatigue, momentum, injury risk (glass / iron man)
- Ordinary players fatigue to ~60 after about 8 straight minutes; Iron Lungs / Everlasting Motor last longer; between quarters / halftime / timeouts recover differently
- Dynamic court: avatar positioning, offense/defense flow, score badges; dunk highlight popups

### Coaches & tactics

- Coaches carry style buffs (offense / defense / morale / stamina) and special tactic boards
- Example tactics: triangle offense, small ball, iron defense, horns, Princeton, five-out, pick-and-roll barrage, switching, and more
- Lineup conditions can unlock extra tactics; famous coaches come from pulls

### Misc

- **Nickname badges**: Air Jordan, Black Mamba, The Answer, The Big Fundamental, etc. only appear on player profile cards in team evaluation — never in the quick-browse lists for candidates / markets
- **Value tags**: labels like "gem" or "overpaid" are never spoiled for unscouted candidates / pulls; they only appear once a scout pack is active or you already own the card
- BGM toggle (bring your own licensed audio to `assets/audio/basketball-bgm.mp3`, or click "Pick a track" to load one from your machine)
- Home-page save bar: resume progress / discard save
- Clear roster local cache (Cache Storage + IndexedDB)

---

### Time-travel career: five chapters (implemented)

- **Prologue**: pick a 1976–2025 historical year and a coaching philosophy, interview with three teams, and make one "future knowledge" decision.
- **Five-year event chain**: year one front-office direction and franchise-player promises → year two trade pressure → year three timeline divergence → year four the price of a title window → year five the final phone call. Every choice shifts front-office trust, media pressure, and timeline divergence.
- **Getting fired**: two straight seasons under 40% win rate gets you fired; a single bad season is pressure only, not an exit.
- **Extension talks**: after five years the team offers different deals (years, salary, authority, perks) based on performance, or you can decline and leave with your record.
- **Endings**: Dynasty Builder / History Rewriter / Departing Under Pressure / Unfinished Revolution, etc. Once an ending locks, it cannot be altered.
- **Ending share card**: auto-generates a 420px-wide summary card with total record, win rate, titles, timeline rewrites, season-by-season records, up to 3 signature trades, and the contract outcome; one-tap copy of the recap text.

### Front-office decision tools (recommendations only — never decide for you)

- **Team evaluation**: every player's avatar, age, OVR, ratings, potential, skills, historical performance, and salary, with "core keep / rotation keep / trade asset / waive candidate / watch" advice and reasons.
- **Inbound trade offers**: players who perform well attract offers from other teams, possibly including players, prospect rookies, and future picks; you can accept or decline.
- **Three-way comparison**: side-by-side "keep as-is / accept trade / waive then sign a free agent" impact on salary, OVR, and roster size. Only real received offers are shown — nothing is invented.
- **Draft-pick value conversion**: by round, protections, and year, estimate expected slot, rookie current OVR / potential, and hit probability, converted to OVR value (e.g. next year's unprotected first ≈ +4.5, lottery-protected first ≈ +1.9, second ≈ +0.8), with "total value change = player rating difference + pick conversion".
- **Playoff data**: playoff cumulative player stats, kept separate from regular-season leaderboards; skill rewards distinguish "newly learned this time" from "already owned before claiming".

### League manager & long-term leagues (implemented)

- The home-page "League Manager" is the direct entry to a full long-term league, reusing the regular season's year, team-name, and roster-build flow; the standalone "Regular-Season Journey" stays single-season and shows no long-term management labels.
- You play as manager/coach, pick a 1976–2025 historical year and coaching philosophy, interview with three teams, and make one limited-future-knowledge decision; the playable story content so far is the prologue.
- After accepting a team you enter a shared long-term league loop with deterministic weighted lottery and first-round drafts, four-year rookie-scale contracts, and a phased offseason of draft → development → new season.
- 1976–2025 uses players' NBA **historical debut-year classes**, not real exact draft orders, draft teams, or complete draft data; after 2025 it uses generated fictional rookies.
- Player development lets you set focus, role, mentor, and load manually; manual plans beat auto suggestions and persist with the long-term career save.
- Players without future historical cards retire deterministically: at age 40, or at age 36 with OVR below 45; rookie protection lasts only the first season.
- The "Career History" page shows a compact per-year record, playoff results, awards, your first-round rookies, trades, and major events — it does not store full schedules, box scores, or playoff trees.
- 25-year auto-regression covers generated rookies, roster caps, draft / season history length, compact history projection, and root-save round trips; the trade timeline has its own focused regression tests.
- Key choices and long-term league state go into an importable / exportable root save, so a page refresh lets you continue.

### Portable long-term career saves

- The home-page long-term career bar offers continue, export, and import.
- The export file is named `courtside-legends-save.json`.
- Imported content replaces the local long-term career slot only after passing validation.
- Legacy browser saves `cls_savegame_v1` and `cls_season_v1` are migrated; the originals are not deleted.
- Saves still live only on your machine by default — no cloud sync yet.
- Old season data is compressed before writing (game snapshots and other transient content are dropped); if browser storage runs short, startup says so explicitly and offers "clear cache and restart".

---

## Hidden pull tiers (invisible to players)

They only affect pull weights and growth logic, and are never shown in the UI:

| Hidden tier | Description |
|---------|------|
| Undrafted + short contract + G League | Fringe candidates |
| Bench warmer | Deep bench |
| bench player | Rotation spare |
| starters | Starter-level |
| Star | Team core |
| All-Star | All-Star |
| Hall of Fame | Hall of Fame |
| NBA Top 50 | All-time great |
| Superstar | Today's elite |

---

## Pool data notes

| Range | Source |
|------|------|
| 1950–2011 | TallData `basketball_players` historical library |
| 2012–2025 | Basketball-Reference season Per Game |

The same player can hold multiple season cards (rookie / peak / late-career enter the pool independently). Ratings are derived from that season's averages and shooting percentages, with 2K anchors correcting landmark seasons.

---

## Project structure

```
courtside-legends/
├── index.html                 # Pages and mode entries
├── css/
│   ├── style.css              # Global styles
│   └── home.css               # Home arena banner and legend photo wall
├── assets/
│   ├── audio/                 # Bring your own BGM: basketball-bgm.mp3
│   └── photos/                # Optional local avatars
├── js/
│   ├── app.js                 # UI, mode flows, coaching actions
│   ├── data/
│   │   ├── players.js         # Season card construction
│   │   ├── roster.json        # Full historical roster
│   │   ├── skills.js          # Skill packs / duo skills / auras
│   │   ├── coaches.js         # Coaches and tactics
│   │   ├── intangibles.js     # Hidden traits, injury odds
│   │   ├── saveRoot.js        # Long-term career root save and compression
│   │   └── …                  # 2K anchors, historical seasons, photo maps, etc.
│   ├── engine/
│   │   ├── sim.js             # Game simulation
│   │   ├── season*.js         # Regular season, playoffs, market
│   │   ├── tradeProposals.js  # Inbound offers from other teams
│   │   ├── tradeComparison.js # Keep / trade / waive-and-sign comparison
│   │   ├── draftPickValue.js  # Draft-pick OVR value conversion
│   │   └── …
│   ├── modes/                 # League manager, time-travel career, contracts, player development
│   ├── story/                 # Five-year event engine, ending share card
│   └── ui/                    # Home display, team evaluation, league management, confirm dialogs
├── tests/                     # node:test automated tests (npm test)
├── scripts/                   # Roster / 2K / photo builders and local server
├── README.md
├── README_EN.md
└── LICENSE
```

---

## Technical notes

- Pure frontend static pages (ES Modules), **no build, no backend** (single-player); online duels need a separate Node server, `node server/online-server.mjs` (see `online.html`, P0 room-code 1v1, R60)
- Saves and accounts live in the browser's `localStorage` / IndexedDB (not synced across machines)
- Automated tests: `npm test` (Node built-in `node:test`, currently 710 tests, all passing)
- Static checks: `npm run lint` (eslint flat config, only real-bug rules like no-undef / no-unused-vars / no-unreachable — no style rules, no prettier)
- MIT License

## Original requirements cross-check (audited 2026-10-23, details in docs/WORKNOTE.md R43)

The launch requirements, checked against the code one by one:

- ✅ Pick your own starters; coach strategies selectable, coaching philosophy customizable (four-dimension philosophy + tactic checkboxes)
- ✅ Dynamic court: avatar positions move with possessions, including offensive/defensive formations (coordinate structures reserved for future real-player motion)
- ✅ Hidden traits: gravity, leadership aura, killer instinct, chemistry core, hidden ceiling, and 20+ more off-ratings attributes
- ✅ Promotion format as the core: wins earn gold, market trading after every round, max 12-man roster, lose and you're out
- ✅ Gold promotion Finals series: changed per user decision to **best-of-3** (replacing the original best-of-7 idea), with market access between games to adjust the roster (T8, see docs/WORKNOTE.md R44; the regular-season mode's playoffs stay best-of-7)
- ✅ Promotion group-stage format: per the user's 2026-10-24 decision, **double elimination + repechage is kept** (superseding the original "lose once and you're out" idea; T9 decided, see docs/WORKNOTE.md R58)
- ✅ Two-player bidding mode; two-player random picks; multiplayer knockout grants one extra pick per round survived, through the Finals
- ✅ Ratings generated from that season's data and labeled by year (verified: Shaq 2000 Lakers OVR 98 / speed 68 / strength 99 → 2011 Celtics OVR 74 / speed 28 / strength 92)
- ✅ Watch + coach live: shout, timeouts, set tactics, subs, communication
- ✅ Nine hidden pull tiers (undrafted + short contract + G League → superstar), weights only, never shown in the UI
- ✅ Chemistry, roster fit, tactics, and personality jointly affect performance; superstar stacking is not invincible
- ✅ True shooting percentages: starts from that season's real zone percentages; wide-open looks can still miss
- ✅ Coaches are pullable, carry years, give team-wide buffs, and signature tactics have special bonuses (Jackson's triangle / Kerr's small ball / Rivers' morale boost / Thibodeau's iron defense that wears starters down)
- ✅ Draft cards carry growth potential (verified: rookie Jokić OVR 79, growth 95 / growth speed 90)

## Not yet done (roadmap)

- Second-term storylines after an extension, and the actual gameplay effects of contract perks
- Full multi-year veteran contract talks and restricted free agency (RFA)
- Deeper CPU free agency, trading, and team-building strategy
- Exporting the ending share card as an image
- Integrating the home page's three main threads and a four-tab in-game coach panel
- Online multiplayer P1–P3 (reconnect/spectating, matchmaking pool, accounts/ranked) and cloud saves (P0 room-code 1v1 is live, see R60)
- Full sync with an official live-stats API
- Finer on-court motion animation
- Avatar localization: B-Ref headshots are currently live hotlinks — they fall back to generated avatars when offline / rate-limited; consider downloading them at build time into `assets/avatars/` permanently
- Era-matched historical photos: a player's cards across eras currently share one headshot, not matched per bref:year
- `js/app.js` is still 10,000+ lines carrying nearly all modes' UI wiring; incremental migration has started with a "pure logic with zero DOM coupling first" approach (e.g. `js/engine/careerEconomy.js`), but the UI rendering / event-binding part is untouched — a long-term project
- eslint exists (minimal config, real bugs only), but no prettier for consistent style

## Content & licensing notes

- Background music must be provided by the user from a legal source; the repo grants no third-party music license.
- Home-page and player-card era photos prefer freely licensed images from Wikimedia Commons (each under its original license, referenced by link, not distributed with the repo).
- NBA, team names / marks, player names and photos, etc. belong to their respective rights holders. This is an unofficial fan project; the MIT code license does not cover those third-party brands, likenesses, or data.

## Author

Published for [github.com/Duzhiok](https://github.com/Duzhiok).
