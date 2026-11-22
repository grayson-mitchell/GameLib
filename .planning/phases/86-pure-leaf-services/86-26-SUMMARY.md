---
phase: 86-pure-leaf-services
plan: 26
subsystem: live-macos-gate
tags: [live-gate, svc-01, d-14, d-15, d-16, keychain, signed-build, uat, macos]
status: complete

requires:
  - phase: 86-pure-leaf-services
    provides: "86-02's gate contract (86-HUMAN-UAT.md); 86-25's CI proof; the signed v0.12.0 build recorded in 86-VALIDATION.md '## Signed builds (D-15)'"
provides:
  - "86-HUMAN-UAT.md scored on the operator's Mac with signed builds: item 1 issue, items 2-4 pass; Pre-run re-check, Run record, Closing inventory"
  - "86-VALIDATION.md '## Signed builds (D-15)': v0.12.0 identity matches v0.11.0 (Gate item 4: pending -> run)"
affects: [86-verification, phase-99]

actuals:
  tokens: 11500
  tasks: 3
  commits: 12

plan_head_before: a02b341e1aac221e55397d0371479e2369fdb18b
plan_head_after: afa1dc33b1c68658d31f5601bd107fcd92bb3a6d
commits: 12

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/86-pure-leaf-services/86-26-SUMMARY.md
  modified:
    - .planning/phases/86-pure-leaf-services/86-HUMAN-UAT.md
    - .planning/phases/86-pure-leaf-services/86-VALIDATION.md

key-decisions:
  - "Item 1 scored issue, not pass: Alan Wake's GOG page shows the 'Couldn't load extra info' empty state in place of PCGamingWiki and HowLongToBeat (pcgamingwiki lookup failed (shape), fetchStatus pcgamingwiki error). It is the pre-existing PCGamingWiki cargoquery permissiondenied defect (todo 2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md), which the 85 build's TS hits identically and golden live-gog-linux pins, so it is as-before behaviour, not a Phase 86 regression. The contract scores an expected text that is not fully met as issue."
  - "Item 4's artwork-file half is vacuous but consistent, not blocked: the P5 override was set from the SteamGridDB picker, which stores URLs, so game_overrides_images/ was absent before and after launch 1."
  - "SVC-01's live half is proven on macOS: wiki and CrossOver, anticheat, store search and discounts, SteamGridDB artwork, recent games and the overrides behave as on the 85 build, and the upgrade keeps the data byte-equal with no Keychain prompt. SVC-01 is marked complete; the one issue is the pre-existing upstream PCGamingWiki refusal, carried by its own todo."
  - "The session captures were not deleted: the profile copies are the operator's only restore path and the verifier may want the logs. Their location is recorded in 86-HUMAN-UAT.md '## Closing inventory'."
  - "No todo filed: 'itad key source: baked' with a user ITAD key in the Keychain is by design (the boot line names the built-in key only; the user key wins per request, gamelib-info/src/secrets.rs:294)."

requirements-completed: [SVC-01]

duration: 36min
completed: 2026-11-23
---

# Phase 86 Plan 26: Live macOS gate Summary

**The Phase 86 gate ran on the operator's Mac. The signed v0.12.0 build went in over v0.11.0 with no Keychain prompt and no data change, and wiki, anticheat, search, discounts, SteamGridDB and recent games all behaved as before. Of the four items, three pass. Item 1 is an issue, because GOG pages still have no PCGamingWiki info. That breakage was already there upstream before Phase 86.**

## Performance

- **Duration:** about 36 min (Task 1 at 2026-11-22T19:03:45Z to the scored commit at 19:39Z)
- **Tasks:** 3 of 3 (Task 1 re-check, Task 2 operator run, Task 3 scoring)
- **Files modified:** 2 (86-HUMAN-UAT.md, 86-VALIDATION.md), plus this SUMMARY

## Scores

| Item | Launch | Result | Key evidence |
|---|---|---|---|
| 4. Upgrade with no data change | 1 | **pass** | `keychain-1.log` 0 prompt events for GameLib across the whole launch; both `keyring info_secret_get account=<itad-api-key / steamgrid-api-key> outcome=found` at 08:17:54; `games.recent` sha256 `4c7eb5ac...` and `game-overrides.json` `21aa549b...` byte-equal; `game_overrides_images/` absent both sides |
| 1. Game page info | 2 | **issue** | ARK (Epic): ratings, HLTB, CrossOver, anticheat badge. Ara (Steam): ratings, HLTB, CrossOver. Alan Wake (GOG): CrossOver 4 stars, but "Couldn't load extra info" (`pcgamingwiki lookup failed (shape)`, Retry gave 4 forced refetches, all failing the same way). This is the pre-existing PCGW cargoquery refusal |
| 2. Store search and discounts | 2 | **pass** | 20 results with prices, `itad_prices.json` changed; GOG and ITAD discounts with prices; ITAD key saved, no "unavailable" |
| 3. Artwork and recent games | 3 | **pass** | SteamGridDB picker covers and heroes; SOMA (Epic, non-Steam) first in tray and Library recent, last played updated without restart; `games.recent[0]` = SOMA, `timestamp.json` changed |

Summary counters: total 4, passed 3, issues 1, pending 0, skipped 0, blocked 0. Frontmatter `status: partial`.

## SVC-01's live half

**Proven on macOS.** Every Phase 86 surface the gate exercised behaves as it did on the 85 build: wiki and CrossOver, the
anticheat badge, store search, discounts with the ITAD key, the SteamGridDB picker, recent games in the tray and Library, and
the overrides file. The upgrade keeps `games.recent` and `game-overrides.json` byte-equal, raises no Keychain prompt, and
reads both keys found. Item 1 is `issue` because a GOG page shows no PCGamingWiki or HowLongToBeat info. That comes from
PCGamingWiki's API refusing the cargo query, a pre-existing upstream defect. The 85 build's TS fails the same way, and the
`live-gog-linux` golden pins it. Its fix has its own todo,
`.planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md`. Windows and Linux are not live-proven
here; that rides with Phase 99 (D-16).

## Task Commits

1. **Task 1: pre-run re-check** - `c77d60509` (signed-build record in 86-VALIDATION.md) and `73c354d89` (re-check in 86-HUMAN-UAT.md)
2. **Task 2: operator run** - no commit (evidence in the session directory under `/private/tmp`, never committed)
3. **Task 3: scoring** - `afa1dc33b` (docs(86-26): score the Phase 86 live macOS gate)

The measured `commits: 12` (`git rev-list --count a02b341e1..afa1dc33b`) includes 9 commits that parallel quick sessions
landed on `main` during the run: quick-261123-bax and quick-261123-bbi, and a todo close. Three of the 12 belong to this plan.

## Deviations from Plan

### Verify-block defect

**1. [Rule 3 - Blocking] The Task 3 parse check cannot pass when any item passes**
- **Found during:** Task 3
- **Issue:** the automated verify requires `parseUatItemsWithStats(...).items.length === 4`. Under gsd-core 1.21.0 the parser
  drops pass results (`UAT_PASS_RESULTS`) from `items`, so a correctly scored file with 3 passes returns 1 item. The check
  could only succeed if every item were non-pass.
- **Fix:** ran an equivalent check instead. The real file gives `headingsSeen 0` with 1 non-pass item. An in-memory copy
  with `result: pass` rewritten to `result: issue` gives `headingsSeen 0` with 4 items, so all four items parse. `grep -c
  '^### [0-9]'` gives 4, no `result: pending` remains, and `pnpm planning-gates` passes 12/12. The plan file was not edited.
- **Files modified:** none (the check only)

### Evidence-capture deviations (Task 2, recorded in 86-HUMAN-UAT.md '## Run record')

- The per-launch instance count was not written to `shell-pid-N.txt`. As substitute evidence, each launch log has exactly
  one `reaper started` and one `store boot:` line, and each Keychain capture names a single gamelib-shell pid (13443, 14993,
  23839).
- The pre-existing log was archived as `gamelib-seed-p5.log` rather than `preexisting-gamelib.log`.
  `gamelib-launch-1.log.old` is byte-equal to it.
- The SteamGridDB tile counts were not recorded. The operator confirmed that covers and heroes both returned.
- No Refresh was clicked inside a populated AppleGamingWiki block. The forced-refresh path was exercised only through the
  empty state's Retry on the GOG page.
- The Store Search ownership badges were not reported separately. They render only on owned results.

### Captures retained

Task 3 offers deleting the copies or recording where they are. The location was recorded and nothing was deleted. The
copies are `profile-before/` and `profile-preseed/`, 5.6G each, mode 0700, plus the logs. All of it is in the session
scratchpad under `/private/tmp`, which is mode 0700. Delete it once Phase 86 is verified.

## Observed outside the four items (for the verifier)

- Each 0.12.0 launch logs `[Backend] Epic is Offline right now, cannot update game list!` (`isEpicServiceOffline`). The 85
  build's P5 log does not. Neither that function nor the legendary refresh changed between `ffb8573d2` (v0.11.0) and
  `7c50262f4` (v0.12.0), and Epic pages and the Epic store embed loaded. So it reads as the Epic status API's state at the
  time. It is not scored and no todo was filed.
- `games.recent` holds 52 entries on this profile. Quick task 261123-bax (on main after the signed build) caps the list at
  50 when an entry is added, so the next add on a build with that change trims it. That build was not under test here.

## Issues Encountered

None that blocked scoring. The `.planning/state.json` dirt in the shared tree was left alone. It is byte-equal to the
session's start snapshot.

## Known Stubs

None. This plan wrote only planning artifacts.

## Next Phase Readiness

All 26 plans of Phase 86 have SUMMARYs. The phase is ready for `/gsd-verify-work 86`. The one UAT issue is not a
Phase 86 regression: it is carried by its own todo, and `/gsd-plan-phase 86 --gaps` is needed only if the verifier wants it
fixed inside Phase 86.

## Self-Check: PASSED

- FOUND: .planning/phases/86-pure-leaf-services/86-HUMAN-UAT.md (4 scored items, Summary 3/1/0/0/0)
- FOUND: .planning/phases/86-pure-leaf-services/86-26-SUMMARY.md
- FOUND commits (ancestors of HEAD): c77d60509, 73c354d89, afa1dc33b
