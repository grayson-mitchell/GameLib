---
phase: quick-261017-bqw
plan: 01
subsystem: steam-bridge-uninstall
tags: [steam, bridge, uninstall, legacy-bottle, manifest, jest]
status: complete
dependency-graph:
  requires: []
  provides:
    - "uninstallBridgeGame() legacy branch unlinks appmanifest_<appId>.acf"
  affects:
    - src/backend/storeManagers/steam/games.ts
tech-stack:
  added: []
  patterns:
    - "Single try/catch rmSync(installRoot) + rmSync(manifestPath, {force:true}) — mirrors uninstallBottleGameDirectly (games.ts) and removeSteamInstallCopy (library.ts)"
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - .planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md (moved to completed/)
    - .planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md (created via git mv)
    - .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md
decisions:
  - "No NUMERIC_APP_ID guard added (A-12 answered in a comment): unreachable given getBridgeBottleSettings()'s existing throw and the allowlist's ^\\d+$ zod regex."
  - "!exePath 'nothing to remove' branch left unchanged — a surviving manifest there keeps a game whose files likely still exist visible, which is correct."
metrics:
  duration: "~45 min"
  completed: 2026-10-17
actuals:
  tokens: 3262
  tasks: 2
  commits: 2
  plan_head_before: b6696d81f06ead039217d1398a9365a701f5d609
  plan_head_after: d17199a80e434db90fc35e50d22905e6b5f8ceba
---

# Phase quick-261017-bqw Plan 01: Unlink the legacy bridge bottle appmanifest on uninstall Summary

Legacy-bottle bridge uninstalls now delete the game's own `appmanifest_<appId>.acf` in the same
try block that removes the install root, stopping the refresh-triggered revert to
`is_installed:true` that was hiding uninstalled games from the Library grid.

## What changed

`uninstallBridgeGame()`'s legacy branch (the path taken when a bridge game still lives in the
shared `GameLibSteamBridge` bottle rather than its own per-game bottle) now:

1. Builds `manifestPath = join(getBottleSteamappsDir(bottleName), \`appmanifest_${this.appId}.acf\`)`
   — the exact path shape `resolveBridgeBottleName()`'s legacy arm probes.
2. Deletes it with `rmSync(manifestPath, { force: true })`, immediately after
   `rmSync(installRoot, { recursive: true, force: true })`, inside the existing single try/catch
   (mirrors `uninstallBottleGameDirectly()` at games.ts and `removeSteamInstallCopy()` at
   library.ts).
3. Extends the catch's warning and the success `logInfo` to name both paths.
4. Leaves the `!exePath` "nothing to remove" branch unchanged, with a new comment explaining why
   (see Open Observations below).
5. Documents in a comment why no new `NUMERIC_APP_ID` guard is added — it would be unreachable.
6. Updates the method's JSDoc to describe the new legacy-branch behavior and cite the live
   measurement (quick task 261016-wsq, Arm 2) that motivated this fix.

Two new real-filesystem jest cases were added to `games.test.ts`, nested inside
`describe('SteamGame.uninstall() — Phase 24 Plan 08 bridge routing (R4/R6)')` as
`describe('261017-bqw: legacy shared bottle — real filesystem manifest unlink')`:

- **Test A** proves the install root AND this appId's manifest are both removed from the legacy
  bottle, while a sibling legacy game's install dir + manifest, and the Phase 17 `GameLibSteam`
  bottle's own manifest for the same appId, all survive untouched.
- **Test B** proves a manifest already missing before uninstall still completes with empty
  stderr (pins the `force: true` semantics).

The source todo was moved to `.planning/todos/completed/` with a `## Closed` section, and the
sibling cleanup todo's item 1 was annotated as fixed (item 2 / LD-5 stays open).

## RED (recorded before the games.ts edit)

Test A failed on exactly the manifest-existence assertion, as the plan predicted:

```
SteamGame.uninstall() — Phase 24 Plan 08 bridge routing (R4/R6) › 261017-bqw: legacy shared
bottle — real filesystem manifest unlink › removes the install root AND this appId's own
appmanifest from the legacy bottle — the sibling legacy game and the Phase 17 bottle's own
manifest for the same appId survive untouched

expect(received).toBe(expected) // Object.is equality
Expected: false
Received: true

> 5872 |       expect(realExistsSync(manifestPath)).toBe(false)
```

Result at RED: `Tests: 1 failed, 274 skipped, 1 passed, 276 total` — exactly one failure, on the
manifest assertion only. Test B passed already at RED (it pins `force` semantics, not the
defect), as expected per the plan. This confirmed the fixture was correct before touching
production code.

## Verification — before/after

| Check | Before (baseline, HEAD `b6696d81f`) | After (this plan) |
|---|---|---|
| `npx jest --selectProjects Backend --runTestsByPath .../games.test.ts` | `Test Suites: 1 passed, 1 total`, `Tests: 274 passed, 274 total` | `Test Suites: 1 passed, 1 total`, `Tests: 276 passed, 276 total` |
| `pnpm codecheck` | exit 0 | exit 0 (no output) |
| `pnpm lint` | `production: PASS \| tests: PASS`, production 1089/1124, tests 638/638 | `production: PASS \| tests: PASS`, production 1089 warnings (unchanged, ceiling 1124), tests 638 warnings (unchanged, ceiling 638 — not bumped) |
| `npx prettier --check` (both source paths) | `All matched files use Prettier code style!` | `All matched files use Prettier code style!` (ran `--write` once on games.test.ts to fix the newly-added test's formatting, then re-verified `--check` clean and jest still 276/276) |
| `npx prettier --file-info` on `games.ts` / `games.test.ts` | `"ignored":false` | `"ignored":false` (unchanged) |
| `npx prettier --file-info` on the two `.planning/todos/**` paths touched | n/a | `"ignored":true`, `"inferredParser":null` (both) |
| `pnpm planning-gates` | `12/12 planning gates passed.` | `12/12 planning gates passed.` |
| non-comment `rmSync(` in `uninstallBridgeGame` slice | 1 | 2 |
| non-comment `appmanifest_` in `uninstallBridgeGame` slice | 0 | 1 |

Lint detail (tests scope, the zero-headroom one): `✖ 638 problems (0 errors, 638 warnings)` —
identical to the baseline count, no `eslint-disable` added, `TESTS_CEILING` untouched. Production
scope: `✖ 1089 problems (0 errors, 1089 warnings)` — also unchanged.

## Desk-verification statement

**This fix is desk-verified only, against a real-filesystem jest fixture (`mkdtempSync` +
`writeFileSync`/`mkdirSync`, asserted with `realExistsSync` after `afterEach` cleanup via
`realRmSync`). It has NOT been run on real CrossOver.** A live confirmation would mean
uninstalling one of the operator's remaining legacy-bottle games (Avernum 6 or HOARD on this
Mac), which is an operator decision, not part of this desk task — consistent with the plan's
explicit out-of-scope note.

## Commits

- `dbb87081b` — `fix(261017-bqw): unlink the legacy bridge bottle appmanifest on uninstall`
  (games.ts + games.test.ts, RED-then-GREEN, same commit per plan's "also acceptable" clause)
- `d17199a80` — `docs(quick-261017-bqw): close legacy-bottle uninstall revert todo`
  (todo move + annotation)

## Deviations from Plan

None — plan executed exactly as written. One minor housekeeping note: after adding Test A/Test B,
`npx prettier --check` flagged `games.test.ts` for formatting; ran `npx prettier --write` on that
single file (no production-code reformatting), then re-ran `--check` (clean) and the jest suite
(still 276/276) to confirm no behavior changed. This is routine formatting, not a deviation from
the plan's instructions, and is recorded here for completeness.

## Open Observations

**The `!exePath` branch's offline behavior** (Task 1, step 4): when `resolveBridgeLaunchExe()`
returns `undefined` — no CM client, a PICS failure, or no Windows launch entry for this appId —
`uninstallBridgeGame()` calls `markBridgeGameUninstalled()` and returns `{ stdout: '', stderr: '' }`
without touching the manifest or any files. This is deliberate and unchanged by this plan: in all
three cases the game's files are usually still on disk, so deleting only the manifest would orphan
an install GameLib can no longer see. A surviving manifest there means the NEXT successful refresh
(once the CM client/PICS answer returns) re-marks the game installed again, which is the intended
outcome — the files are still there. This is a known, accepted asymmetry: a user who uninstalls
while offline/PICS-degraded sees the "done" status fire, but the game may reappear as installed
later if files were never actually removed. No todo was filed for this because it is the designed
behavior, not a defect — flagging it here per the plan's explicit request.

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/games.ts` (modified, manifestPath + comments present)
- FOUND: `src/backend/storeManagers/steam/__tests__/games.test.ts` (modified, `261017-bqw` describe present)
- FOUND: `.planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md`
- MISSING (expected): `.planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md` (correctly moved away)
- FOUND: commit `dbb87081b` in `git log --oneline --all`
- FOUND: commit `d17199a80` in `git log --oneline --all`
