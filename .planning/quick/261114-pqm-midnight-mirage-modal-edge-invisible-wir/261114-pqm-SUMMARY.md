# Quick 261114-pqm: Midnight Mirage modal edge Summary

Midnight Mirage dialogs now have a lighter surface (#161c1e) and a 1px translucent-white edge, via `--modal-border` finally being consumed by the shared Dialog paper.

## Commits
- 1e5b63f65: Midnight Mirage tokens (`--modal-background: var(--background)`, `--modal-border: rgba(255, 255, 255, 0.1)`) + themeTokens assertions (observed RED, then GREEN; full suite 282 passed)
- second commit (see git log): `border: '1px solid var(--modal-border, transparent)'` on StyledPaper + dialogWindowChrome source gate (observed RED, then GREEN; Dialog tests 15 passed, tsc clean, prettier clean)

## Deviations
None. New themeTokens describe was appended at end of file rather than adjacent to the border-color describe.

## Deferred
Translucent border for the other equal-surface dark themes (gruvbox_dark, dracula, nord-dark, marine, zombie, sweet) - not warranted now; their borders equal the surface so they are visually unchanged. high-contrast now shows a white edge (intentional).

## Live check (operator)
`pnpm tauri:dev`, Midnight Mirage, open a dialog; spot-check high-contrast and dracula.
