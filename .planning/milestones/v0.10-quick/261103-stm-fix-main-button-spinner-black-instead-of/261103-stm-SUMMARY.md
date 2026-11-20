---
status: complete
quick_id: 261103-stm
---

# Quick 261103-stm: main button spinner colour

Changed `.buttons .mainBtn svg` in `src/frontend/screens/Game/GamePage/index.css` from `color: var(--neutral-02)` (#161c1e) to `color: currentColor`, so the spinner and Play/Stop/Pause icons follow the button label colour in every theme. Todo retired to `.planning/todos/completed/` with a Result section.

Commits: 843d75b58 (CSS fix), todo move (see report).

## Deviations

- The plan's verify step `! grep neutral-02 index.css` cannot pass: three other legitimate `--neutral-02` uses exist elsewhere in the file (steamEngineNotice, gameInfoTabs). Only the main-button usage was removed.
- `pnpm planning-gates` reports 11/12: `planning-frontmatter-gate.py` fails on STATE.md frontmatter, unrelated to this change (todo-frontmatter-gate passes).
- No live visual check was run.
