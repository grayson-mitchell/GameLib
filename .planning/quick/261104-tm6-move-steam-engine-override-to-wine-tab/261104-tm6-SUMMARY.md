---
quick: 261104-tm6
status: complete
completed: 2026-11-04
commits: [4820bd8f3, a03e2232c]
---

# Quick 261104-tm6: Move Steam Engine override to the Wine tab

For macOS Steam titles, the per-game Wine tab now shows a one-line hint plus the collapsed "Engine (advanced)" control. The Steam overlay override stays on Advanced.

## Commits
- 4820bd8f3: Task 1. Placement move, test, locale hint, docblock.
- a03e2232c: Task 2. Copy changed from "Advanced settings" to "Wine settings" (EngineBadge, SteamEngineNotices, games.ts, en catalogue).

## Deviations
**D-14 deviation (planned):** the override moved from the Advanced tab to the Wine tab. Collapsed (`<details>`), unsupported warning, backend `overrideEligible` gate (WR-04) and the render gate `!isDefault && isMac && runner === 'steam'` (now `isMacSteamTitle`) are unchanged. D-08 still holds.

**Hidden controls:** for `isMacSteamTitle`, Wine Version, Wine Prefix and CrossOver Bottle are not rendered. Evidence (from the plan's investigation):
- `TITLE_AUTHORITATIVE_KEYS` in `steam/titleSettings.ts` excludes `wineVersion`, `wineCrossoverBottle` and `winePrefix` (LD-2).
- The bridge launch resolves its Wine through `getBridgeBottleSettings` in `steam/bottle.ts`, and none of its branches reads the title's `wineVersion`.
- `engineDecision.ts` never references `wineVersion`.
- The tab was also showing the shared Steam bottle's values, not the game's real per-game bridge bottle.

**Left unchanged:** the `!isCrossover` block (DXVK/esync/msync toggles and Tools) in the Wine tab. Its toggles are inert for bridged titles by the same evidence. Tools acts on the shared Steam bottle.

No other deviations.

## Verify
- Placement test, SteamEngineOverride and SteamOverlayOverride tests: 27 passed.
- `tsc --noEmit`: clean.
- gamelib.json parses.
- Prettier is clean on the touched files. gamelib.json is prettier-ignored.
- `pnpm i18n` changed only `en/gamelib.json`. `i18n-churn-guard` reported clean.
- SteamEngineNotices, engineState, hardcodedStringGate and i18nCatalogChurnGuard tests: 244 passed.
- Not done: the optional live check in the running app.

## Self-Check: PASSED
