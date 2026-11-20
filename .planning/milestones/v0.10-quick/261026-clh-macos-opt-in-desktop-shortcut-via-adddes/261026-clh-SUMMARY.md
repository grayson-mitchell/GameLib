---
phase: quick-261026-clh
plan: 01
status: complete
commits: [3f22e3059, 435e5c52c, 4651b5e25]
---

# Quick 261026-clh: macOS opt-in Desktop shortcut

On macOS the existing `addDesktopShortcuts` setting now writes a second `<title>.app` to `~/Desktop`, and its toggle is shown on every platform.

- `shortcutFiles` darwin branch returns `join(userHome,'Desktop',title.app)` as the desktop file and `~/Applications/title.app` as the menu file (distinct).
- `generateMacOsApp(gameInfo, appShortcut)` takes its destination. The Desktop copy is generated, not copied.
- `addShortcuts` darwin: Applications copy when `addStartMenuShortcuts || fromMenu`, Desktop copy only when `addDesktopShortcuts` (no `|| fromMenu`). Both go through `recordWrite`, so a Desktop failure does not stop the Applications copy and failures are reported together.
- `removeShortcuts` on mac removes both `.app` trees with recursive `rm`.
- The exists checks needed no change; the new test shows a Desktop-only copy yields true.
- pathShim comment, the exists-fallback premise test and the addShortcuts docblock were updated.
- `Shortcuts.tsx`: `supportsDesktopShortcut` removed; toggle always rendered.

## Verification
- `npx jest src/backend/shortcuts src/backend/sidecar`: 1611 passed, 1 failed (`testContainment.test.ts`, pre-existing, unclassified `steamNativeInstallDefault.test.ts`).
- RED run before implementation: 7 failures; all pass afterwards.
- `npx tsc --noEmit -p .` clean; eslint on Shortcuts.tsx clean; prettier clean on all six touched source/test paths.
- No test artifacts found in the real `~/Desktop` or `~/Applications`.

## Deviations
None.

## Operator gate (passed, via 261026-ctm)
Live Mac check: restart `pnpm tauri:dev` (check sidecar.js mtime), toggle "Add desktop shortcuts automatically" on in Settings > Shortcuts, Add shortcut on a game: `.app` on both ~/Desktop and ~/Applications; Remove: both gone; toggle off then Add: Applications only.

**Result 2026-10-26: PASS (operator).** Live on the Mac with Avernum 6: Add shortcut created `~/Applications/Avernum 6.app` and, with the Desktop toggle on, a `~/Desktop` link; macOS Apps lists the game once; the menu item flipped; launch and Remove worked.

## Open follow-up
The macOS success toast wording still says "...Applications folder" and does not mention the Desktop copy. Toast strings were deliberately not touched.
