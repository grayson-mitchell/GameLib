---
phase: quick-260816-hdg
plan: 01
subsystem: steam
tags: [steam, metadata-cache, install-form, depot-signal, source-gate]
requires:
  - "Phase 34.14 D-04 fail-open (install-form platform row)"
  - "games.ts getGameInfo self-heal refetch (DETAIL-01)"
provides:
  - "depotSignalCaptured — the single predicate that decides whether a steamMetadataStore entry actually captured the D-17 depot signal"
  - "Read-boundary normalization at the three depot-signal sites"
  - "Source gate pinning all five read sites plus the steamPlatformRow.ts prohibition"
affects:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/installFormIpc.ts
  - src/backend/storeManagers/steam/games.ts
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
tech-stack:
  added: []
  patterns:
    - "Structural-parameter, dependency-free predicate module (the steamPlatformRow.ts extraction pattern, backend side)"
    - "Comment-stripped source gate over production files (stripSourceComments), RED-proven against known-bad input"
key-files:
  created:
    - src/backend/storeManagers/steam/metadataCapture.ts
    - src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/installFormIpc.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts
decisions:
  - "Read-boundary normalization, not a startup migration — applyMigrations() is wired only into Electron's app.whenReady(); the Tauri sidecar never runs it, so a Migration class would be dead code in the shipping runtime"
  - "The two mac-nativeness gates and ensurePlatformsCaptured's alreadyCaptured() deliberately keep the raw read — a residue entry genuinely captured its mac answer, and narrowing them would de-route bottle/bridge-eligible games for a fact already cached"
  - "Fixture repairs ADD is_windows_native; the predicate is never weakened and no call site is ever reverted to make a test go green"
metrics:
  duration: ~55 min
  completed: 2026-08-16
  tasks: 3
  commits: 4
---

# Quick Task 260816-hdg: Normalize the Steam metadata depot-signal read — Summary

`depotSignalCaptured` now clears the false "captured" claim carried by 370 of 380 real
on-disk cache entries at exactly three read boundaries, so the installed base gets Phase
34.14's fix instead of only fresh-fetch tests — while the two mac-nativeness gates and the
`steamPlatformRow.ts` `=== true` fence are provably untouched.

## What shipped

**One predicate, one module.** `src/backend/storeManagers/steam/metadataCapture.ts` (99
lines) exports `depotSignalCaptured(entry)`:

```ts
entry?.platformsCaptured === true && entry?.is_windows_native !== undefined
```

The parameter is structural (`{ platformsCaptured?: boolean; is_windows_native?: boolean }
| null | undefined`), not `SteamMetadataCacheEntry`, so the module pulls nothing into the
Backend jest project. Its header carries all four required sections: the 370/380 survey,
the uniqueness proof (`games.ts:647`'s `!!` coercion always yields a boolean, and
`games.ts:704-707` persists it in the same object literal as `platformsCaptured: true`, so
the conjunction cannot false-positive on a legitimately-written entry), the explicit
disclaimer that this is NOT the forbidden `hasSteamWindowsDepot` loosening (naming the
`treatsAbsentAsAvailable` saboteur and its three shipped gates), and the convergence
argument.

**Three read sites normalized:**

| File | Before | After |
|---|---|---|
| `library.ts:791` | `steamPlatformsCaptured: cachedMeta?.platformsCaptured ?? false,` | `steamPlatformsCaptured: depotSignalCaptured(cachedMeta),` |
| `installFormIpc.ts:109` | `const platformsCaptured = cached?.platformsCaptured === true` | `const platformsCaptured = depotSignalCaptured(cached)` |
| `games.ts:538` | `!existing.is_delisted && cached?.platformsCaptured !== true` | `!existing.is_delisted && !depotSignalCaptured(cached)` |

Each got a WHOLE-LINE rationale comment (never a trailing `// ...`, which
`stripSourceComments` deliberately does not strip — that would have let the gate match its
own explanatory prose). Two pieces of adjacent prose that the change falsified were
rewritten: `installFormIpc.ts`'s "Both comparisons are `=== true`" and `library.ts`'s
"mirrors platformsCaptured so the frontend bottle indicator matches the backend D-11
routing gate" (it now states the divergence and why — this field seeds the DEPOT question,
the D-11 gate asks the MAC question).

**Three deliberate non-changes, comment-pinned and source-asserted:** `games.ts`
`isBottleEligibleFromPlatforms()` (~1561), `library.ts`
`isBridgeAuthoritativeForInstallState()` (~232), and `games.ts` `ensurePlatformsCaptured()`'s
`alreadyCaptured()` (~1688 — the fourth site the locked brief's table did not enumerate).
The `alreadyCaptured()` pin carries the full three-point reasoning, including that
convergence does not depend on it.

**Verification step 6 result** — surviving raw reads of `platformsCaptured` across the
three files:

```
library.ts:232       mac gate            (pinned non-change)
games.ts:1561        mac gate            (pinned non-change)
games.ts:1688        alreadyCaptured()   (pinned non-change)
games.ts:716         steamMetadataStore.set payload  (write path)
installFormIpc.ts:97 rejected-request literal        (constructed return, not a read)
installFormIpc.ts:118 depotSignalCaptured(cached)    (normalized)
installFormIpc.ts:128 property shorthand             (normalized value)
```

Every read that is not one of the three pins now goes through the helper.

## Test counts — actual output

| Run | Result |
|---|---|
| Backend baseline, BEFORE any change | **151 suites passed / 151; 3437 tests passed / 3437** |
| Frontend gates baseline (`steamPlatformRow` + `steamEligibilityProbe` + `steamSectionGating`) | **3 suites passed / 3; 99 tests passed / 99** |
| Task 1 RED (module absent) | `FAIL … Cannot find module '../metadataCapture'` — 1 suite failed, 0 tests |
| Task 1 GREEN | 1 suite passed; **13 tests passed / 13** (11 truth-table + 2 saboteur) |
| Task 2 GREEN (`metadataCapture.test.ts` with the source gate) | 1 suite passed; **24 tests passed / 24** |
| Task 3 (1) `npx jest --selectProjects Backend` | **152 suites passed / 152; 3466 tests passed / 3466** |
| Task 3 (2) the three shipped 34.13/34.14 frontend gates | **3 suites passed / 3; 99 tests passed / 99** |
| Task 3 (3) `steamInstallFormContracts.test.ts` | **1 suite passed / 1; 17 tests passed / 17** |
| Task 3 (4) `pnpm codecheck` / `npx tsc --noEmit` | **exit 0, zero diagnostic lines** |
| Task 3 (5) `git diff --exit-code steamPlatformRow.ts` | **exit 0 — byte-identical** |

The frontend gate counts are identical to the baseline (99/99 before and after) and those
three files were not modified — confirming they are green AND unmodified, not green because
they were adjusted.

### The one flake, and why it is not this plan's

One full Backend run reported `FAIL src/backend/sidecar/__tests__/bootstrapWirings.test.ts`
(1 failed / 3465 passed). Re-run in isolation: **1 suite passed, 13 tests passed / 13**. The
immediately following full run: **152/152 suites, 3466/3466 tests**. This is the known
cross-test flake the plan named in advance; it touches nothing this plan changed.

## RED proofs

**Gate 1 — the predicate (Task 1).** The test file was written first and run against the
absent module: `Cannot find module '../metadataCapture'`, 1 suite failed, 0 tests
collected. Recorded before `metadataCapture.ts` was created.

**Gate 2 — the source gate (Task 2), all 11 assertions.** A gate that has never failed
proves nothing, so each assertion was run against a known-bad input and had to fail. Two
families, because the two halves have different falsifiers:

- The 6 NORMALIZATION assertions were run against the PRE-EDIT text, taken from git at
  `a57849b3b` (the Task-1 commit, before any call site moved).
- The 5 PRESERVATION/ABSENCE pins already hold on the pre-edit tree, so pre-edit text
  cannot falsify them. They were run against MUTATED current text carrying exactly the
  "correction" each pin exists to reject: the mac gates routed through the helper, the
  fourth site routed through the helper, and `steamPlatformRow.ts`'s
  `is_windows_native === true` rewritten to the inverted `!== false` form.

```
RED    normalize: library steamPlatformsCaptured
RED    normalize: library imports helper
RED    normalize: installFormIpc platformsCaptured
RED    normalize: installFormIpc imports helper
RED    normalize: games self-heal gate
RED    normalize: games imports helper
RED    pin: games mac gate stays raw
RED    pin: library mac gate stays raw
RED    pin: games fourth site stays raw
RED    prohibition: row keeps strict equality
RED    prohibition: row has no inverted comparison

ALL ASSERTIONS RED against known-bad input
```

**Gate 3 — the new behavioral tests.** `depotSignalCaptured`'s body was temporarily mutated
to the raw read (i.e. exactly the pre-change behavior) and the four affected suites re-run:
**4 suites failed, 5 tests failed / 505**. The failures were precisely:

```
● 260816-hdg self-heal: getGameInfo re-fetches a PRE-D-17 RESIDUE entry …
● 260816-hdg: synced GameInfo carries steamPlatformsCaptured:FALSE for a pre-D-17 residue entry …
● 260816-hdg: a PRE-D-17 RESIDUE entry … yields platformsCaptured: FALSE, so D-04 fail-open can offer Windows
● THE 370-ENTRY RESIDUE SHAPE: returns false for platformsCaptured:true with no is_windows_native
● DISAGREES with the raw flag read on the residue shape …
```

The convergence test and the mac non-change test correctly passed under BOTH the mutant and
the real predicate — they are preservation assertions, and a preservation assertion that
went red under the mutant would have meant the change was not behaviour-preserving. The
mutation was reverted and confirmed byte-identical to the committed module
(`git diff --stat` empty).

## Fixture repairs — a field was added, nothing was weakened

Only ONE existing test actually failed after the change:

- **`library.test.ts` `D-08 reconciliation: … steamPlatformsCaptured:true`** — mocked
  `{ platformsCaptured: true, is_mac_native: false }` and asserted `true`. Its name says
  "cachedMeta.platformsCaptured is true", i.e. a legitimately-written entry, so it GAINED
  `is_windows_native: true`. A residue counterpart asserting `false` was added beside it.

The plan's other named fixture behaved differently than predicted, and the difference is
worth recording:

- **`games.test.ts` `LIB-04: getGameInfo returns the existing library entry synchronously`**
  — mocks `{ platformsCaptured: true }` and asserts `axios.get` was NOT called. It did NOT
  fail. The self-heal does now fire for that fixture, but `fetchMetadataIfNeeded` awaits
  before reaching `axios.get`, so nothing has been called at the synchronous assertion
  point. The assertion is about synchronicity and remains valid; its stated INTENT ("a
  fully-enriched cache entry") was nonetheless false, so `is_windows_native: true` was added
  to make the fixture mean what it says.

Sweep of `games.test.ts`, `library.test.ts`, `installFormIpc.test.ts` and
`sidecar/__tests__/steamAuthFlows.test.ts` found no other fixture whose intent is "fully
captured" but which omits `is_windows_native` in a load-bearing way. Notably the three
34.14 `installFormIpc.test.ts` depot-pair fixtures already carry an explicit
`is_windows_native`, so they were correct as written and needed nothing.

**No test was made to pass by weakening `depotSignalCaptured` or reverting a call site.**

## New coverage added (each maps to a must-have truth)

| Test | Truth |
|---|---|
| `library.test.ts` — residue entry seeds `steamPlatformsCaptured: false` | 1 |
| `installFormIpc.test.ts` — residue entry yields `platformsCaptured: false`, `hasWindowsDepot: false` | 1, 4 |
| `games.test.ts` — self-heal re-fetches a residue entry | 1, 3 |
| `games.test.ts` — no re-fetch once `is_windows_native` is written (one fetch per game, no loop) | 3 |
| `games.test.ts` — residue entry still routes to the bottle via `isNative()` | 5 |
| `metadataCapture.test.ts` source gate — the two mac gates + `alreadyCaptured()` still raw | 5 |
| `metadataCapture.test.ts` source gate — `steamPlatformRow.ts` keeps `=== true`, never `!== false` | 6, 7 |

## Accepted consequence

Narrowing `library.ts:791` narrows `GameInfo.steamPlatformsCaptured`, whose second consumer
is `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:67`
(`gameInfo.steamPlatformsCaptured === true`). For a residue game that section hides until the
self-heal refetch lands. This is benign, temporary and self-healing — one fetch per game on
the next library render. Per the plan, no second field and no carve-out were added to avoid
it, and the tradeoff is recorded in the `library.ts` call-site comment.

## Not closed by this plan

The sibling todo
`.planning/todos/pending/2026-08-16-absent-is-mac-native-treated-as-no-mac-build-mirror-of-34-14.md`
is the MIRROR problem on the mac axis. It is deliberately still open: this plan's §3
explicitly preserves the exact two mac gates that todo concerns, so closing it here would
have contradicted the locked decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `isBottleEligible()` is private — `tsc --noEmit` rejected a new assertion**
- **Found during:** Task 3, step 4
- **Issue:** The new `260816-hdg non-change` test asserted `game.isBottleEligible()`. That
  method is `private`, producing `TS2341` under `pnpm codecheck`. ts-jest is transpile-only
  in this repo (`isolatedModules: true`), so the whole Backend suite was green while the
  type gate was red — exactly the trap the plan's `<executor_constraints>` names.
- **Fix:** Assert through the public `isNative()` wrapper instead, whose body is
  `!this.isBottleEligible()` and therefore proves the same routing verdict. Comment added
  explaining why the private method must not be called from a test.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`
- **Commit:** `7367dfaea`

**2. [Rule 2 - Missing coverage] No behavioral test proved must-have truths 1, 3, 4 or 5**
- **Found during:** Task 2d
- **Issue:** The plan specified a unit gate and a source gate, but nothing asserted the
  end-to-end consequence at the three read boundaries — a source gate proves a call site
  moved, not that the behavior changed.
- **Fix:** Added five behavioral tests (table above), each RED-proven by the predicate
  mutation described under Gate 3.
- **Commit:** `61ba95426`

### Environment note — a concurrent session

A concurrent session was closing Phase 34.14 in the same working tree throughout this
execution (its commits `9217b3807` and `8d53e4484` are interleaved with this plan's in
`git log`). At the moment of the Task-1 commit that session had just `git add`-ed
`.planning/phases/34.14-…/34.14-VERIFICATION.md`, and it was swept into commit `a57849b3b`
alongside the two intended files.

**No work was lost and nothing was stashed, reset or checked out.** The file is committed
intact on the correct branch; only the commit message attributing it is wrong. History was
deliberately NOT rewritten to un-commit it, because amending while another session is
actively committing to the same branch is how the two prior data-loss events in this repo
happened. Every subsequent commit in this plan used pathspec-scoped
`git commit -m … -- <files>`, which commits only the named paths regardless of index state,
and each was verified by its own `--stat` (7 files, 1 file, 1 file).

## Self-Check

Files created:
- FOUND: `src/backend/storeManagers/steam/metadataCapture.ts` (99 lines, ≥ 40 required)
- FOUND: `src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts` (219 lines, ≥ 120 required)
- FOUND: `.planning/todos/completed/2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue.md`
- ABSENT (as required): `.planning/todos/pending/2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue.md`

Commits:
- FOUND: `a57849b3b` feat(quick-260816-hdg-01)
- FOUND: `61ba95426` fix(quick-260816-hdg-02)
- FOUND: `7367dfaea` fix(quick-260816-hdg-03)
- FOUND: `2e20cf02c` docs(quick-260816-hdg-03)

Key links (all asserted by the source gate, all RED-proven):
- FOUND: `steamPlatformsCaptured: depotSignalCaptured(cachedMeta)` in `library.ts`
- FOUND: `platformsCaptured = depotSignalCaptured(cached)` in `installFormIpc.ts`
- FOUND: `!depotSignalCaptured(cached)` in `games.ts`

## Self-Check: PASSED
