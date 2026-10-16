---
phase: 07-game-details-enrichment
plan: 02
status: complete
gap_closure: true
requirements: [DETAIL-01, DETAIL-02]
date: 2026-07-04
commits:
  - 51a1c08e fix(07): self-healing Steam platform-flag re-fetch (GAP 1)
  - c9dd267a fix(07): derive installed platform instead of hardcoding Windows (GAP 2)
  - 79af6cb4 fix(07): space out platform-support icons (GAP 3)
---

# Summary: Phase 07 Gap Closure (07-02)

Closed the 3 diagnosed gaps from `07-UAT.md`. All code-verified; **manual re-UAT on macOS still required** (tests 1, 3, 4, 5, 6, 7 — GAP 1's fix unblocks the DETAIL-02 overlay tests).

## GAP 1 (major, DETAIL-01) — self-healing platform re-fetch
`electronStores.ts`, `games.ts`

Root cause: `getGameInfo` gated the platform-capturing `fetchMetadataIfNeeded` on `!existing.art_cover`, so every game whose art was cached before Phase 7 skipped it and `is_mac_native`/`is_linux_native` stayed `false` → Windows-only, and the DETAIL-02 overlay (gated on `is_mac_native`) never rendered.

Fix: added a `platformsCaptured?: boolean` sentinel to `SteamMetadataCacheEntry` (undefined on pre-Phase-7 entries distinguishes "never captured" from a genuine Windows-only `false`). `fetchMetadataIfNeeded` now persists `platformsCaptured: true` on the successful capture path. `getGameInfo` re-fetches when `!art_cover` OR (`!is_delisted` AND `cached.platformsCaptured !== true`) — a one-time self-heal per game. The `!is_delisted` guard avoids a re-fetch loop (delisted games return before capturing platforms). T-2-03 `pendingFetches` dedup and the L230-231 `data.platforms` capture are unchanged. +2 regression tests (self-heal fires for un-captured cached game; does NOT fire for delisted).

## GAP 2 (major, DETAIL-01) — installed platform derivation
`library.ts`

Root cause: `platform: 'Windows' as const` hardcoded at all 3 install-info construction sites, so a Mac install read "Windows".

Fix: added a module-level `hostInstallPlatform(): InstallPlatform` helper (`isMac`→`'Mac'`, `isLinux`→`'linux'`, else `'Windows'`) and used it at all 3 sites. Added `isLinux` to the existing environment import. `InstalledInfo.tsx` reads `install.platform` directly, so the UI reflects it with no frontend change.

## GAP 3 (cosmetic, DETAIL-01) — icon spacing
`GamePage/index.css`

The existing flex `gap: var(--space-sm)` on `.platformSupport__icons` did not render visible separation (icons crowded — UAT test 2). Added a deterministic token-based inter-icon margin (`.platformSupport__icons > svg:not(:last-child) { margin-inline-end: var(--space-xs) }`, ~8px).

## Verification
- `pnpm tsc --noEmit` — PASS
- `eslint` on touched files — PASS
- Steam test suites — **161 passed** (159 + 2 new self-heal tests); updated 2 tests that asserted old behavior (hardcoded platform; pre-sentinel sync-return).
- Acceptance greps: `platformsCaptured` present in both files; zero `platform: 'Windows' as const` remaining; icon spacing present.

## No DETAIL-02 code change
The AppleGamingWiki overlay was built correctly; its UAT tests were blocked only because GAP 1 starved `is_mac_native`. Fixing GAP 1 unblocks re-testing — no DETAIL-02 change was needed.

## Next
Rebuild → resume the paused Phase 7 UAT: re-test 1 (platform icons), 3 (overlay on Mac game — now that is_mac_native populates), 4 (gating), 5 (Unrated pill), 6 (CrossOver↔Wine toggle), 7 (pill click-through). Note: existing cached games self-heal on next library open (one background re-fetch per game).
