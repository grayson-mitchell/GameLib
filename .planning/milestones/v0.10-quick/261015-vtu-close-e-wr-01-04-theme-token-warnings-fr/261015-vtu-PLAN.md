---
quick_id: 261015-vtu
description: Close 34.4.1 cycle-2 warnings E-WR-01..04 (dead theme tokens) and declare review dispositions
date: 2026-10-15
---

# Quick Task 261015-vtu

Run inline by the orchestrator (5 source files, CSS/token only). WR-01 and D-WR-01 were re-read at
HEAD and were already fixed by `260929-k5e`; untouched.

1. `App.css` `.warning`/`.danger` -> `--status-warning`/`--status-danger`.
2. Settings `.warning` -> `.settingsWarning` (css + `WrappersTable.tsx`).
3. `muiTheme.ts` Tooltip `--text-primary` -> `--text-default`; update the pin in `muiTheme.test.ts`.
4. IN-01 doc comment in `sidecarTransport.ts`.
5. `34.4.1-REVIEW-FIX.md` (new) + `disposition:` on `34.4.1-REVIEW-CYCLE2.md`.

<verify>
npx prettier --check on the six src paths (all non-ignored per --file-info); jest muiTheme,
themeTokens, Settings; pnpm planning-gates. The review docs are prettier-ignored, so no check is
carried for them.
</verify>
