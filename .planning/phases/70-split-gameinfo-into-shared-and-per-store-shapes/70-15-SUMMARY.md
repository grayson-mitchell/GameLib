---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 15
subsystem: store-migrations
tags: [migration, gameinfo, zod, d-12, phase-68-chain]
requires: [70-13]
provides:
  - "src/backend/storeMigrations/gameInfoLibraries.ts: steamLibraryChain, gogLibraryChain, gogInstalledChain, legendaryLibraryChain, nileLibraryChain, sideloadLibraryChain, downloadManagerChain (v1 -> v2 delete-only strip)"
  - "STORE_MIGRATIONS entries for the seven chain keys (currentVersionOf = 2)"
key-files:
  created:
    - src/backend/storeMigrations/gameInfoLibraries.ts
    - src/backend/storeMigrations/__tests__/gameInfoLibraries.test.ts
    - src/backend/storeVersioning/__tests__/gameInfoLibrariesEngine.test.ts
    - src/backend/storeMigrations/__tests__/fixtures/*-gameinfo-v{0,1}.json (7)
    - src/backend/storeMigrations/__tests__/fixtures/*-real-keys.json (7)
  modified:
    - src/backend/storeMigrations/index.ts
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 15: GameInfo library strip migrations Summary

Seven pure, total, delete-only Phase 68 v1 -> v2 chains strip keys no strict per-runner schema declares from the steam/gog/legendary/nile library caches, gog installed, sideload library and download-manager queue/finished `params.gameInfo`. Key sets are derived at module load from the 70-13 schemas' `.shape` (nothing hand-copied); recursion is only into declared nested objects, never `dlcList`.

## Commits

- b8d142fd7 test(70-15): redacted real-key fixtures
- f92e9524f test(70-15): keep runner un-redacted in real-key fixtures
- 8868effa5 feat(70-15): strip chains, registration, chain tests, synthetic fixtures
- d158630df test(70-15): engine-level behaviour

## Pre-gate snapshot (for 70-16)

`~/gamelib-phase70-pregate/` (mode 700, files 600, plus MANIFEST.txt). Taken from `~/Library/Application Support/gamelib` before any migration code existed. Counts only, no values:

| file | schemaVersion | entries |
|---|---|---|
| store_cache/steam_library | 1 | games=401 |
| store_cache/gog_library | 1 | games=10 |
| gog_store/installed | 1 | installed=3 |
| store_cache/legendary_library | 1 | library=19 |
| store_cache/nile_library | 1 | library=2 |
| sideload_apps/library | unstamped | games=2 |
| store/download-manager | 1 | queue=0, finished=17 |

Avoid `pnpm tauri:dev` on this profile before 70-16 so the gate sees a first-launch migration.

## Real-key fixtures

Key-path counts per fixture: steam 32, gog 31, gog-installed 16, legendary 113, nile 27, sideload 17, download-manager 251. `grep -c "$USER"` total 0. The strip leaves all seven unchanged, so the 70-13 schemas forgot no key present on this profile. Mutation check: adding `bogusKey` to the nile fixture made the real-key test fail; reverted.

## Deviations from Plan

1. **[Rule 1 - Bug] Real-key fixtures redacted `runner`.** My first generation redacted the discriminator too, so every entry was an unknown runner and the real-key test was vacuous (the first mutation check exposed it: still green). `runner` is now kept verbatim (it is a store name, not data); fixtures regenerated and the mutation check re-run (fails as intended). Commit f92e9524f.
2. **[Rule 1] `stripUndeclaredGameInfoKeys` is not exported.** The plan's artifact list exports only the seven chains; exporting it tripped the knip ratchet (`pnpm find-deadcode`).
3. Hostile-input totality: gog/sideload `installed` items are installed-info objects with no `runner`, so a plain object there is stripped to its declared keys by design. The test excludes the unknown-runner item from the `installed` arrays; runner-keyed arrays still assert unknown runners are untouched.
4. No `@public` tags existed in gameInfoSchema.ts (grep was 0 before and after) and the file was not modified; the acceptance count of 0 is not evidence of removal.
5. Install-less schema levels: only `z.ZodObject` members are recursed (install, extra, extra.about, overrides, install.manifest, install.cyberpunk); `reqs`, `gog_save_location` and `dlcList` array elements are left alone.

## Verification

- `npx jest src/backend/storeMigrations src/backend/storeVersioning`: 127 passed
- `npx tsc --noEmit` clean, `pnpm boundaries` clean, `pnpm find-deadcode` PASS, `pnpm gameinfo-narrowing-ceiling` PASS, eslint on touched paths clean, prettier check clean
- Acceptance greps: registered keys in index.ts = 7; `throw|readFileSync|writeFileSync|logger` in gameInfoLibraries.ts = 0; `.shape` uses >= 1
- `pnpm lint` full-repo not re-run (known unrelated error in depotRust/updateEstimate.ts)

## Known Stubs

None.

## Self-Check: PASSED
