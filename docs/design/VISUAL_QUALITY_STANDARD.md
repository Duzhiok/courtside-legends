# Visual Quality Standard — Courtside Legends

Status: **APPROVED 2026-11-11 (user ruling)** — the acceptance standard for all visual work.
Applies to every Coding Agent (Code, Luna, Cursor, and any new agent).

## 1. Two acceptance states (never one)

| State | Who decides | Meaning |
|---|---|---|
| **Functionally Ready** | The Coding Agent | Code + interaction + saves + tests pass. The feature works. |
| **Visually Approved** | The product owner (the user) | Actual screenshots reach the target art quality. The feature looks right. |

An agent may judge a feature Functionally Ready. **An agent may never declare a major visual design finally approved.** Only the user does that, from real screenshots.

**The states do not block each other.** While visual approval is pending, agents keep doing unrelated approved work. Never stop all development waiting for a screenshot review.

## 2. What needs the user's visual approval

Major visual changes only — the user reviews screenshots and approves:

- Character models: Stylized, Bobblehead.
- Player-card templates and rarity treatments.
- Main page layouts (My World, My Team, My Home).
- Home environments (room showcase, furniture, trophies).
- Art-direction changes (palette, type, lighting direction).

Routine UI fixes (spacing, copy, a misaligned button, a broken hover state) do **not** need separate approval.

## 3. Screenshot pack (every major visual slice delivers this)

1. Desktop 1440px — actual game screenshot (not a mock).
2. Mobile Web 390px — actual game screenshot.
3. Close-up of the character or card.
4. Before/After comparison — same character / same outfit / same camera angle.
5. A short list of remaining gaps vs the target reference image.

**If the agent's environment has no browser, report `Visual QA Pending`.** Never claim visual approval without reviewing rendered output. An agent with a browser renders the screenshots; an agent without one marks the slice pending and hands it over.

## 4. Composition checklist

- **Character stage**: the character occupies ~75–85% of the stage height; three-quarter angle by default; feet touch the floor (visible contact shadow); no floating, no clipping, no tiny figure in a large empty container.
- **Player card**: the portrait is the dominant element (top ~70% of the card); name / OVR / position readable at a glance; rarity frame clearly distinct per tier; shine/animation only on rare+ cards, draw reveals, and the card the player is actively viewing — never on every card at once.
- **My World**: one large Character & Identity Hero; no duplicated "my avatar" sections; no large empty white dashboard panels; identity, level/XP, titles and quick actions visible without scrolling past whitespace.
- **My Home**: real spatial depth (not a flat CSS diagram); furniture, trophies and cards read as objects in a room; the avatar appears in the room.
- **Text**: bilingual (zh/en); no Chinese residue on the English UI, no English residue on the Chinese UI; contrast readable on dark green/gold backgrounds.
- **Motion**: respect `prefers-reduced-motion` (disable shine/parallax animations when set).

## 5. Technical baselines

- Keep the existing stack: HTML/CSS/JavaScript + Three.js + Blender pipeline + GameSim/DuelSim. No framework rewrite.
- Character renders: PBR materials, ACES tone mapping, key/fill/rim lighting, environment reflections where appropriate, bounding-box camera framing.
- Player cards: layered structure (background / portrait / lighting-gradient overlay / rarity frame / identity info / optional effect). Card visuals never change OVR, skills, or draw probabilities.
- Design tokens (`css/tokens.css`): refine lightly where a task needs it; do **not** start a large standalone design-system rewrite.
- Card portraits currently hotlink real photos (`HOTLINK_HEADSHOTS=true`): keep the portrait source swappable so it can be localized before public release.
- Performance: richer rendering (PBR + HDR + shadows) must be checked on Mobile Web 390px — frame rate and heat matter, not just the desktop screenshot.

## 6. Delivery checklist (per visual slice)

- [ ] Working implementation, merged to main.
- [ ] Real game screenshots (desktop + mobile + close-up + Before/After).
- [ ] Remaining visual limitations listed honestly.
- [ ] Focused functional tests green; full suite green for shared/engine changes (the 9 `online*` missing-`ws` failures are a known environment gap, not a regression).
- [ ] Commit SHA(s) recorded.
- [ ] Status marked `Implemented`, `Visual QA Pending`, or `Visually Approved` — with the user as the only approver of the last one.
