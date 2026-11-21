---
phase: 84-logger
plan: 13
subsystem: logging
tags: [uat, live-contract, gap-closure, G-84-3]
status: complete

requires:
  - phase: 84-logger
    provides: 84-HUMAN-UAT.md as run by 84-11, and the G-84-3 gap recorded in 84-UAT.md
provides:
  - 84-HUMAN-UAT.md amended so items 4, 7 and 8 state what the code emits
  - items 4 and 7 re-scored pass with named evidence, no new live run; Summary 8 passed, 0 issues
affects: [84-verification, 84-HUMAN-UAT]

actuals:
  tokens: 3960
  tasks: 2
  commits: 2

plan_head_before: 778eab80adf1b8030a30d0d87e2b408db62b1ef2
plan_head_after: b937ca7bec8088eb0543025bf87df306d87e308c

tech-stack:
  added: []
  patterns:
    - "A live-contract origin rule is a positive emitter list at the lockfile version, never a negative grep"

key-files:
  created: []
  modified:
    - .planning/phases/84-logger/84-HUMAN-UAT.md

key-decisions:
  - "Item 4 stays on the GOG runRunnerCommand path; the Wine Command: header ordering is cited to the gamelib-log golden case chunks-wine-header, not scored live"
  - "Item 7 re-score verifies the eleven recorded message families against crate source at the locked versions, not each of the 120 lines (the copies were deleted at the run's close); stated in the result"
  - "Authoring-time Structural Reachability verdict cells are not rewritten; an Amendment (G-84-3) paragraph records the change"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "Item 4 expected names the engine line and Launching preamble, rowed in Required literals, and is re-scored pass from the launch-2 files verified unchanged by stat"
    requirement: FND-05
    verification:
      - kind: command
        ref: "84-13-PLAN.md Task 1 <verify> (node item parse of 84-HUMAN-UAT.md plus grep citation counts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Item 7 crate-origin rule is a positive emitter list; re-scored pass with each sample's emitter file:line at the Cargo.lock version"
    requirement: FND-05
    verification:
      - kind: command
        ref: "84-13-PLAN.md Task 2 <verify> (node item parse, parseUatItemsWithStats 0/0, grep counters, pnpm planning-gates 12/12)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Item 8 order clause states the code's order; score unchanged"
    requirement: FND-05
    verification:
      - kind: command
        ref: "84-13-PLAN.md Task 2 <verify>"
        status: pass
    human_judgment: false
---

# Phase 84 Plan 13: UAT live-contract amendment (G-84-3) Summary

**84-HUMAN-UAT.md amended for items 4, 7 and 8 so the live contract states what the code emits, with items 4 and 7 re-scored pass from existing evidence; the file now reads 8 of 8 pass.**

## Accomplishments

- **Item 4:** the header clause demanded `Wine Command:`, which no store launch writes. It now names the Wine-engine
  preamble (the `engineLogLabel` engine line, then `Launching "<title>" (<runner>)`) and cites the gamelib-log golden case
  `chunks-wine-header` as the byte-exact proof of `Wine Command:` header ordering. Preflight P4 states the real emitters
  (`engineTypes.ts:46`, `launchEngine.ts:198-205`, `launcher.ts:727-730`) and that the only `runWineCommand` caller passing
  `logWriters` at HEAD is the sideloaded non-native Wine launch (`storeManagerCommon/games.ts:222`). Three rows were added to
  Required literals (engine line, `Launching "`, `Wine Command:` with the golden as its sink). The clauses for `Logging to
  file(s)`, End of log, the `cmp` rotation and `lines dropped` are unchanged byte for byte.
- **Item 4 re-score evidence source:** the run's own launch-2 files, still in place and verified unchanged by `stat -f '%Sm %z'`:
  `launch.log.old` = `Nov 21 22:04:44 2026 9042` (9042 bytes equals `game-launch-1.log` in the Capture inventory) and
  `launch.log` = `Nov 21 22:09:06 2026 8968`. `head -2` of each gave the CrossOver engine line
  (`engine=crossover build=26.3.0.39832 reason=cx-healthy`) then `Launching "Racine" (gog)`, at 22:03:57 and 22:08:35. The
  writer-half evidence of the original result is kept verbatim.
- **Item 7:** the negative `grep -rnF` origin rule is now a positive emitter list (steam_vent, gamelib_steamcm, gamelib_depot
  for [Steam]; hyper_util, hyper, h2, rustls, reqwest for [Backend]) at the Cargo.lock version, with the three TS
  `[steampoll|steamfiles|steamcm] rust <channel>` templates excluded by construction. Re-scored pass; emitter table:

  | Recorded sample | Emitter at the locked version |
  |---|---|
  | `picked websocket server from list` | steam-vent@767481a `src/serverlist.rs:126` |
  | `connected to websocket server` | steam-vent@767481a `src/transport/websocket.rs:32` |
  | `writing raw {:?} message` | steam-vent@767481a `src/net.rs:265` |
  | `session started` | steam-vent@767481a `src/session.rs:259` |
  | `Setting up heartbeat with interval` | steam-vent@767481a `src/connection/raw.rs:82` |
  | `Reading child message` | steam-vent@767481a `src/message.rs:207` |
  | `connecting to` | hyper-util@0.1.20 `src/client/legacy/connect/http.rs:767` |
  | `connected to` | hyper-util@0.1.20 `src/client/legacy/connect/http.rs:770` |
  | `pooling idle connection for` | hyper-util@0.1.20 `src/client/legacy/pool.rs:401` |
  | `No cached session for` | rustls@0.23.46 `src/client/hs.rs:1151` |
  | `Using ciphersuite` | rustls@0.23.46 `src/client/hs.rs:817` |

  All eleven have an emitter and are counted. Launch 4's 39 [Steam] DEBUG lines are all TS templates, so it adds 0
  crate-origin lines. The re-score verifies the recorded message families, not each of the 120 lines (the copies were
  deleted at the run's close); the result says so.
- **Item 8:** the order clause now states the code's order (`exit finished in` first, `main.rs:892`; `still running at exit
  deadline:` after it, `:895`). Result stays pass (no launch had a deadline line); the Required literals ORDER NOTE and the
  Pre-run re-check finding each gained a "resolved by G-84-3" sentence.
- **Record:** an `Amendment (G-84-3, 2026-11-22).` paragraph follows the Run-time count; `## Current Test` reads
  `[complete — 8 pass after amendment G-84-3, 2026-11-22]`; Summary is `passed: 8`, `issues: 0`; frontmatter `status:
  complete`, `updated: 2026-11-22`. Authoring-time Structural Reachability verdicts are untouched.

## Task Commits

1. Task 1 (tracer): `c84698110` — item 4 amended, literals rowed, re-scored
2. Task 2: `b937ca7be` — items 7 and 8, re-scores, counters, amendment record

## Deviations from Plan

None - plan executed exactly as written.

The tracer feedback gate ran as an automated re-run of Task 1's `<verify>` (passed) before Task 2.

## Verification

- Task 1 and Task 2 `<verify>` commands pass; `parseUatItemsWithStats` reports 0 outstanding items and `headingsSeen` 0.
- `pnpm planning-gates`: 12/12 passed.
- `.planning` is prettier-ignored; no prettier check (convention 5).
- Commits touch only `.planning/phases/84-logger/84-HUMAN-UAT.md`. STATE.md, state.json and ROADMAP.md were not touched
  (orchestrator override; the orchestrator updates ROADMAP plan progress).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- 84-HUMAN-UAT.md present; commits `c84698110` and `b937ca7be` are ancestors of HEAD.
