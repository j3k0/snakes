# learn overlay

## instruction-files
- primary: AGENTS.md
- notes: Single-file project; all learnings belong at root

## directory-scoping
- root: Everything — this project is a single `snake.html` with no packages, modules, or feature directories
- `docs/superpowers/specs/`: Design documents, versioned by date (e.g., `2026-05-17-snake-next-level-v4-design.md`)
- `docs/superpowers/plans/`: Implementation plans matching design specs

## known-conventions
- No build system, no dependencies — all logic lives in one HTML file
- Canvas-based game using dual render loops: `setInterval` for game logic (50-120ms) + `requestAnimationFrame` for visuals (60fps)
- `FOOD_TIERS` replaced per-mode `foodProbs` — all modes use the same global food distribution
- Hat Trick achievement requires >= 4 distinct food types (was === 3 before food tiers expansion)
- Touch controls bridge through synthetic `KeyboardEvent('keydown')` dispatched to `document` — D-pad doesn't call game functions directly
- Toast timers (`achToastTimer`, `lvlToastTimer`) are shared across achievement, level-up, daily-completion, and cosmetic-unlock systems — sequential toast triggers can suppress each other
- All localStorage keys use `snake_` prefix (e.g., `snake_xp`, `snake_daily_date`, `snake_streak_count`)
- Current codebase is v4 — earlier versions (v1-v3) were superseded by incremental design specs in `docs/superpowers/specs/`
