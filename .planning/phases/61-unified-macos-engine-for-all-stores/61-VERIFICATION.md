---
phase: 61-unified-macos-engine-for-all-stores
verified: 2026-11-07T00:00:00Z
status: gaps_found
score: 14/20 decisions verified
overrides_applied: 0
gaps:
  - truth: "D-18 / 59 D-11: the launch deadline stops when a game process exists; no signal means no deadline (spike 068)"
    status: failed
    reason: "CR-02 confirmed in code. watchForGameProcess returns null only for an empty or relative install path. For any absolute path it returns a live watcher, so bindDeadlineToMonitor never stands the deadline down. If no ps line matches, onEngineLaunchDeadline runs wineserver -k and game.stop() on a running game."
    artifacts:
      - path: "src/backend/engine/gameProcessWatch.ts"
        issue: "Prefix forms are unix, Z: and Y: only. No C:\\ form for installs under the bottle's drive_c. The unix form lives 1-2 s under CrossOver. Bare-basename launches (spike 068 S4) are documented as unmatchable but not handled. The header comment claims the deadline stands down; the code does not do that."
      - path: "src/backend/engine/launchEngine.ts"
        issue: "armEngineLaunchDeadline arms for every bottle-backed launch with a non-empty absolute install_path. onGiveUp only deletes the map entry and leaves the deadline armed (WR-01)."
    missing:
      - "Arm only when a match is provable, or make the unmatched case a no-kill notice"
      - "Add the C:\\ form for installs under the bottle's drive_c"
      - "Cancel the deadline in onGiveUp"
  - truth: "D-05: a migrated crossover game gains fallback silently while CrossOver is healthy (59 D-09: only a real pre-flight failure means broken)"
    status: failed
    reason: "CR-01 confirmed. demoStatus.ts BOTTLE_RE is /^[A-Za-z0-9._-]{1,64}$/ and returns failed/invalid-bottle for any other name. The engineDecision test table maps invalid-bottle to 'broken', so a healthy user bottle named 'Windows 10 Games' is classed as broken CrossOver and switched to the built-in engine on every launch under Automatic."
    artifacts:
      - path: "src/backend/engine/demoStatus.ts"
        issue: "Name regex narrower than what resolveGamePrefix and sanitizeBottleName accept"
      - path: "src/backend/engine/engineDecision.ts"
        issue: "invalid-bottle is not treated as inconclusive"
    missing:
      - "Treat a name the probe cannot carry as no evidence (inconclusive), not broken"
  - truth: "D-16: GameLib never kills another game's wineserver in a busy shared bottle"
    status: failed
    reason: "CR-03 confirmed. onEngineLaunchDeadline calls killWineserver unconditionally. otherGamesRunning is consulted in engineDecision and engineSwitch but not on the deadline path. Compounds with D-18 gap."
    artifacts:
      - path: "src/backend/engine/launchEngine.ts"
        issue: "Deadline kill skips the ledger check"
    missing:
      - "Check otherGamesRunning before the kill; stop only this game's runner when the bottle is busy"
  - truth: "D-01 / D-17: the install dialogs write the per-game bottle, and Run installer uses it"
    status: failed
    reason: "CR-04 partly verified. Sideload handleRunExe passes { ...gameSettings, ...engineConfig } to window.api.runWineCommand, which carries engineOverride and wineCrossoverBottle but keeps the stored wineVersion and winePrefix. I read the call site but did not trace the IPC. The review states runWineCommand forwards the config by identity and the bottle does not exist yet. Treat as a probable gap; UAT item 4 covered Epic install and launch, not sideload Run installer."
    artifacts:
      - path: "src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx"
        issue: "Run installer with an engine choice uses the wrong prefix and Wine"
    missing:
      - "Route through runWineCommandForGame, or resolve tool settings backend-side"
  - truth: "D-08 / D-09: migration is derived at read time and written only on an Engine edit; UI and launch agree on the engine"
    status: failed
    reason: "CR-05 read in code. game_config.ts injects defaultSettings.engineOverride = globalEngineOverride for any game with no config file, and setSetting flushes defaults. readEngineForGame reads the file directly and ignores that default. The UI and launch can disagree, and an unrelated setting edit persists an engine. Only affects games with no config file."
    artifacts:
      - path: "src/backend/game_config.ts"
        issue: "Default injection at lines 304-312"
      - path: "src/backend/engine/engineConfig.ts"
        issue: "readEngineForGame does not inherit the global engine for a missing entry"
    missing:
      - "One source of truth for a missing entry, and exclude engineOverride from flushed defaults"
  - truth: "D-04: switching a Legacy game that has a prefix to Automatic warns that saves stay behind"
    status: partial
    reason: "UAT G-1 (open, minor). needsFreshBottleConfirm is true only for prefixKind 'plain'. The backend still creates a fresh per-game bottle for a legacy prefix. The old prefix is untouched, so no data is lost."
    artifacts:
      - path: "src/frontend/screens/Settings/components/engineOverrideLogic.ts"
        issue: "Line 48 checks plain only"
    missing:
      - "Include prefixKind 'legacy' with a winePrefix"
human_verification: []
---

# Phase 61: Unified macOS engine for all stores - Verification Report

**Phase goal:** One per-game Engine control for every Windows game on macOS (all stores), with the Phase 59 engine decision moved out of `steam/engine/` so non-Steam launches get trial-expiry pre-flight, N-days notice, launch timeout, broken-CrossOver detection and a fallback bottle.
**Status:** gaps_found
**Re-verification:** No, initial verification

## Decision coverage (no REQUIREMENTS.md; D-IDs checked against plans, code and UAT)

All of D-01..D-20 appear in plan frontmatter `requirements` across the 20 plans. No orphans.

| D-ID | Status | Evidence |
| --- | --- | --- |
| D-01 | VERIFIED for new installs, with the CR-04 caveat | UAT 4: Epic Trash Goblin got bottle `GameLib-legendary-54f7...` with the CrossOver launch log. Sideload Run installer is a probable gap. |
| D-02 | VERIFIED | UAT 9: old prefix untouched. UAT 1 skipped (no subject); config-bytes-unchanged is covered by unit tests only. |
| D-03 | VERIFIED | UAT 5: no-licence fallback ran the pinned engine on the per-game bottle. `engine/adoptBottle.ts` and `bottlePrimitives.ts` exist. |
| D-04 | PARTIAL | Plain prefix works (UAT 9). Legacy-with-prefix has no warning (G-1). |
| D-05 | FAILED (CR-01) | Healthy legacy CrossOver bottles with spaces or over 64 characters would be classed broken. |
| D-06 | VERIFIED | Unit-tested mapping; the UAT had no Wine Manager subject. |
| D-07 | VERIFIED | UAT 3: "Legacy: GPTK" entry, Unsupported warning, entry gone after switching. |
| D-08 | PARTIAL (CR-05) | UAT 10 confirmed that viewing writes nothing. A missing-config game still has the default-injection defect. |
| D-09 | PARTIAL | UAT 10: global Engine control shown, no Wine Version selector. The CR-05 mismatch applies. |
| D-10 | VERIFIED | UAT 2: one Engine select and no bottle picker. The prefix field shows for a legacy prefix, which is intended. |
| D-11 | VERIFIED | UAT 2: option list matches. |
| D-12 | VERIFIED | UAT 5, 6 and 11: toast, badge, 5-day notice and no 10-day notice on a non-Steam game; Steam regression passes. |
| D-13 | VERIFIED | UAT logs show `engine=... reason=...` labels. |
| D-14 | VERIFIED | UAT 3: badge and warning text. |
| D-15 | VERIFIED | UAT 3. |
| D-16 | FAILED on the deadline path (CR-03) | Launch and switch paths honour the ledger. UAT 8 skipped; unit tests only. |
| D-17 | PARTIAL | UAT 4 covered the Download dialog only. Import, ThirdParty and Sideload dialogs were not exercised live. |
| D-18 | FAILED (CR-02) | Normal start was seen live for Epic and GOG (z-path, first-match cancel). The unmatchable shapes were not handled. |
| D-19 | VERIFIED | `src/backend/engine/bottlePrimitives.ts` exists. `steam/engine/` is down to `steamEngineDeps.ts`. |
| D-20 | VERIFIED | UAT 10: a Legacy global gave the new install Automatic. |

Score: 14 verified, 4 partial, 3 failed counting by D-ID overlap. The headline score is shown as 14/20.

## CR-01..CR-05 against the goal

- **CR-01: real gap (D-05).** `BOTTLE_RE` in `demoStatus.ts:20` is confirmed. The test table in `engineDecision.test.ts` encodes `invalid-bottle` as `broken`.
- **CR-02: real gap (D-18, spike 068).** Confirmed in `gameProcessWatch.ts` and `launchEngine.ts`. See the detail below.
- **CR-03: real gap (D-16).** Confirmed. The deadline kill has no ledger check.
- **CR-04: probable gap (D-01/D-17).** The call site is confirmed. The IPC was not traced end to end.
- **CR-05: probable gap (D-08/D-09).** The default injection is confirmed in `game_config.ts`. The launch-side split is confirmed in `readEngineForGame`. The persist-on-flush behaviour was not run.

### CR-02 detail

Spike 068's verdict is PARTIAL. It says the signal is a Z:/Y: command line, and the unix form lasts only 1-2 s under CrossOver. It names bare-basename launches as unmatchable. The `armEngineLaunchDeadline` doc and the file header promise "no signal, deadline stands down". The code only does that for a non-absolute `install_path`. So a game installed under `drive_c` (C:\ paths, which is the Sideload Run installer layout, and GOG/Amazon installers pointed at C:) and any launcher that execs from elsewhere will run for 180 s and then get `wineserver -k` plus "Game didn't start", while it is running. The UAT only exercised the normal-start half on Epic and GOG with Z:/Y: install paths, so it does not contradict this. The 180 s fire path is unit-tested only, and no live hang was run (declined by the operator). This kills a running game and so falls short of the phase's stated protection. It should be fixed before the phase is called done.

## Behaviour confirmed by the live UAT (not re-requested)

Items 2, 3 (apart from G-1), 4, 5, 6, 9, 10 and 11 passed. Items 1, 8 and 12 were skipped. Licence file mtime was unchanged.

## Anti-patterns and the pre-existing failures

I did not re-run the test suite. The pre-existing failures named in the brief (bottle.test.ts, games.test.ts, macArchKnownFixRouting Intel, tauriShellSource, x86CallbackWineHarness, genI18nGateScope A-17, lint tests-scope 662 against 661) are not counted as phase gaps. I did not scan every file for TBD/FIXME markers.

## Human verification

None added. Items 1 and 8 were skipped for lack of a subject and are covered by unit tests, which is a coverage limit rather than something a human check can close without new fixtures.

## Gaps summary

Two clusters, plus one minor item.

1. **Deadline safety (CR-02, CR-03, WR-01).** The deadline can kill a healthy running game, and can take down a neighbour in a shared bottle. This breaks D-18 and D-16.
2. **Legacy CrossOver bottles and defaults (CR-01, CR-05).** A healthy user bottle with a space in its name falls back every launch (D-05), and a missing-config game can see UI and launch disagree on the engine (D-08/D-09).

Plus CR-04 (Sideload Run installer, D-01/D-17) and G-1 (D-04 warning, minor).

---

_Verified: 2026-11-07_
_Verifier: Claude (gsd-verifier)_
