# Roguelike Idle Game — Project Overview

## Concept

An idle roguelike inspired by Path of Achra. The core idea is combining "automated progression (idle)" with a visual logic editor: players design characters and behavior logic, then watch their builds run automatically.

Tagline: "Your logic keeps winning on its own."

## Tech stack

- HTML, CSS, and vanilla JavaScript (minimal libraries)
- Sortable.js for the logic editor drag-and-drop
- No frontend framework or build tools
- Filenames use ASCII only

## Repository structure

project-root/

  - CLAUDE.md          ← Project overview (this file)
  - pages/             ← Public HTML pages
    - index.html       Homepage / links to demos
    - game.html        Game view (map & demo)
    - build.html       Character Build UI
    - logic.html       Logic Editor (placeholder)
    - result.html      Result / stats view
  - css/
    - style.css
  - js/
    - dungeon.js       Dungeon generation
    - character.js     Character & build management
    - combat.js        Combat engine (placeholder)
    - logic-engine.js  Logic execution engine (placeholder)
    - effects.js       Visual effects (placeholder)
    - stats.js         Telemetry and stats (placeholder)
    - utils.js         Utility helpers (placeholder)
  - data/
    - cultures.json
    - classes.json
    - gods.json
    - skills.json
    - enemies.json
  - assets/
    - images/
    - sounds/

## Game design summary

1) Character Build (culture × class × god)
   - A character is defined by a combination of culture, class, and god. Each choice modifies starting stats and available skills.

2) Dungeon generation
   - Procedural floor generation (maze/carve approach). Each floor contains enemies, items, and an optional boss. Characters follow their logic rules to act automatically.

3) Logic editor (priority list)
   - Rules are evaluated top-to-bottom; the first matching rule executes. The editor supports drag-and-drop to reorder priorities.
   - Example rules: HP < 30% → use heal, enemy adjacent → attack, otherwise → move forward.

4) Auto combat loop (per turn)
   - Evaluate logic JSON from top to bottom
   - Execute first matching action
   - Process passive skill chains
   - Update combo/chain counters and play effects

5) Combo & chain system
   - Combos: multiple skill activations in the same turn
   - Chains: successive enemy defeats that link to the next enemy
   - FEVER: triggered at a high chain count (e.g., chain >= 10) to boost effects and damage

## UX / Visuals

- Emphasize satisfying feedback: damage numbers, large combo counters, and increasingly flashy visuals as chains rise. FEVER has a dedicated effect.

## Post-run statistics (example)

- Clear time: 12:34
- Total damage: 48,320
- Max combo: 15
- Max chain: 8
- Most-used skill: slash (47 uses)

Logic activation stats are tracked to help players refine their rules.

## Implementation plan (high level)

1. Dungeon generation + display (small iteration)
2. Character Build UI
3. Auto combat engine
4. Logic editor UI
5. Visual effects and combo/chain polish
6. Result / statistics screen

Estimated time: a few days for a working prototype, more to polish visuals and editor UX.

## GitHub / publishing

This repository is organized for public demo builds. Use the homepage pages for demos; do not include personal contact info in commits or pages.

## Coding rules

- Use ASCII-only filenames
- Keep single-responsibility per file
- Keep data in JSON files (avoid hardcoding in JS)


