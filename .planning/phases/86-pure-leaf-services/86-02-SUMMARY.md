---
phase: 86-pure-leaf-services
plan: 02
subsystem: planning
tags: [live-gate, uat, macos, structural-reachability-review, svc-01, d-14, d-15, d-22, d-30]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: the signed Phase 85 build and its recorded identity (85-VALIDATION.md Signed baseline), and the 85-HUMAN-UAT.md contract shape this one follows
provides:
  - "86-HUMAN-UAT.md: the Phase 86 live macOS gate contract, four items, authored before any port code and run by 86-26"
  - "A Structural Reachability Review (all seven tests, 64-pair pairing pass), a Required literals table, a Withdrawn section and the dual-sink evidence-capture standard"
affects: [86-26]

actuals:
  tokens: 7100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A forced-fresh observable per cache-backed item: a TTL cache can serve an item wholly from cache, so the contract names the file that must change as the proof the Rust fetch ran"
    - "A seed step (P5) for a premise the operator's profile does not hold, instead of scoring the item blocked up front"

key-files:
  created:
    - .planning/phases/86-pure-leaf-services/86-HUMAN-UAT.md
  modified: []

key-decisions:
  - "Item 4's no-prompt claim is scored only in a launch where both keys were actually read (Settings, Advanced, a Store Search query and the picker are driven in launch 1), because the ITAD and SteamGridDB reads are lazy and a bare boot reads neither"
  - "Item 4 runs first (launch 1) and its byte comparison is taken before items 1 to 3 mutate caches or recent games"

patterns-established:
  - "Live-gate contract: Required literals rows are all CONDITIONAL naming the runner's Task 1 re-check, including rows whose emitter already exists, because the port may move them"

requirements-completed: []

plan_head_before: afb0a4912a60a928f03ec59fcccc2d32b4f951c8
plan_head_after: 80423986eb07b652bf83eda873ee458ecb55247c

duration: ~25min
completed: 2026-11-22
status: complete
---

# Phase 86 Plan 02: Live macOS gate contract Summary

**86-HUMAN-UAT.md is committed: four UAT-shaped items (game page info, store search and discounts, artwork and recent games, signed upgrade with no data change), a Structural Reachability Review, and the evidence-capture standard, authored before any Phase 86 port code and left for 86-26 to run.**

## Performance

- **Duration:** about 25 min (estimated; the start time was not recorded)
- **Completed:** 2026-11-22
- **Tasks:** 2 of 2 (1 tracer, 1 auto)
- **Files modified:** 1 created

## Accomplishments

- Task 1 (tracer): the contract end to end. Frontmatter (`authored_by: 86-02`, `run_by: 86-26`), Builds under test (signed 85 baseline from 85-VALIDATION.md, signed Phase 86 build recorded by 86-25, identities must match, a dev or unsigned build scores item 4 `blocked`), Deliberate behaviour changes, Preflight P1 to P7, the four items and the Run order. `parseUatItemsWithStats` returns 4 items with `headingsSeen` 0.
- Task 2: `## Evidence capture`, `## Required literals` (five rows, all CONDITIONAL naming 86-26 Task 1), `## Structural Reachability Review` (Tests 1 to 7, a 64-pair pairing pass with nine flagged pairs F1 to F9), and `## Withdrawn from live scoring`. `pnpm planning-gates` passes 12 of 12.

## Task Commits

1. **Task 1 (tracer): the contract, four items, preflight, run order** - `8b5d74842` (docs)
2. **Task 2: Structural Reachability Review, required literals, withdrawn rows, evidence capture** - `80423986e` (docs)

**Plan metadata:** the SUMMARY commit and the final docs commit follow this file.

## What the review found (the value of authoring against the code)

- **ProtonDB and Steam Deck are Linux-only** (`wiki_game_info.ts` lines 176 to 192, under `isLinux`), so item 1 scores them absent as before and the live check is withdrawn to Phase 99 (D-30). AppleGamingWiki and CrossOver are `isMac` only; the anticheat badge needs an Epic namespace (null for Steam and GOG, null on Windows).
- **A 30-day cache would have made items 1 and 2 vacuous.** An unforced game page visit or repeat search is served from `store_cache/wikigameinfo.json` or `itad_prices.json`, so the Rust fetch would never run. Items 1 and 2 now require a forced refresh (the wiki block's Refresh control) and a query not searched before, with the cache file changing as the positive observable (Test 6).
- **The operator's profile does not hold item 4's premise.** At authoring there was no `store/game-overrides.json`, no `game_overrides_images/`, and `steamgrid-api-key` was absent from the Keychain at the end of the 85 gate. The plan said to score item 4 `blocked` in that case; this contract adds a P5 seed step (create a recent game, an override and a SteamGridDB key on the 85 build as ordinary use, before the baseline copy) and keeps `blocked` only for what cannot be seeded.
- **An absent Keychain prompt proves nothing unless the keys were read.** The ITAD and SteamGridDB reads are lazy, so launch 1 drives Settings, Advanced, a Store Search query and the picker, and the `keyring keyring_get ... outcome=found` lines (emitter `keyring_dispatch.rs:418`, which a Rust-internal read may bypass) or the saved-key placeholders are the positive evidence (Test 4).
- **Item 3 needs a non-Steam game.** Library last played reads `timestampStore` through `useNonSteamLastPlayed`; Steam reads `extra.steamLastPlayed`. The tray list is a native menu observed by hand, with no log line.
- **No `gamelib-info` crate exists yet**, so the Rust info-dispatch failure literal has no emitter; it is a CONDITIONAL row whose wording 86-26 Task 1 records.

## Decisions Made

The two `key-decisions` above: item 4 is scored only in a launch where both keys were read, and it runs first so its byte comparison precedes any cache or recent-games mutation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Seed step added for item 4's premise**
- **Found during:** Task 1
- **Issue:** the plan scores item 4 `blocked` when the profile lacks a recent game, an override or a SteamGridDB key. The operator's profile holds no overrides at all and no SteamGrid key, so item 4 would be blocked on arrival, which makes the gate vacuous for SC2.
- **Fix:** added preflight P5 (seed on the 85 build, before the P3 and P4 baseline), and the preflight numbering follows: P1 session, P2 instances, P3 profile copy, P4 item 4 baseline, P5 seed, P6 Keychain inventory, P7 network. The run order states the P5-before-P3 sequence. The plan's `blocked` outcome is kept for anything that still cannot be created.
- **Files modified:** `.planning/phases/86-pure-leaf-services/86-HUMAN-UAT.md`
- **Commit:** `8b5d74842`

**2. [Rule 2 - Missing critical functionality] Forced-fresh observables added to items 1 and 2**
- **Found during:** Task 2 (Test 6)
- **Issue:** the 30-day wiki cache and the 30-day ITAD caches can serve an unforced visit entirely from cache, so the ported fetch path would not run.
- **Fix:** items 1 and 2 name a forced refresh and the cache file that must change.
- **Files modified:** `.planning/phases/86-pure-leaf-services/86-HUMAN-UAT.md`
- **Commit:** `80423986e` (the item text was amended before this commit, so the change lands with it)

**Total deviations:** 2 auto-fixed (Rule 2). **Impact:** the gate asks for evidence the ported code can produce; no plan truth is dropped. The four items, the D-15 build rule, the D-22 and D-30 treatments and the section list are as planned.

## Issues Encountered

- The working tree held another session's edits (phase 85 review fixes, phase 100 docs, a GOG offline debug session). None of those files was touched or staged; only `86-HUMAN-UAT.md` was staged by explicit path. The `git status --porcelain` set at the end of this plan equals the set at the start, apart from this plan's own files.
- `actuals.commits` is the plan-scoped count (2), which here equals the raw `plan_head_before..HEAD` range count.

## Known Stubs

None. The contract's `started:` and `updated:` frontmatter and `result: pending` lines are the intended empty state of an unrun gate, filled by 86-26.

## Threat Flags

None. This plan writes one planning document and installs nothing. T-86-02 (captures stay under `/tmp`, never committed, `~` paths and counts only) and T-86-03 (P3 `ditto` copy before any item touches a file, per-item restore text, closing inventory) are written into the contract text; T-86-SC (package installs) is accepted, as nothing is installed.

## Self-Check: PASSED

- `8b5d74842` and `80423986e` are ancestors of HEAD.
- `86-HUMAN-UAT.md` exists with `## Structural Reachability Review`, `## Required literals`, `## Withdrawn from live scoring` and `## Evidence capture` (one each); `parseUatItemsWithStats` returns 4 items with `headingsSeen` 0; `pnpm planning-gates` passes 12 of 12.
