---
phase: 86-pure-leaf-services
verified: 2026-11-23T00:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/86-pure-leaf-services/86-01-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-01-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-02-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-02-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-03-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-03-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-04-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-04-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-05-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-05-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-06-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-06-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-07-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-07-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-08-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-08-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-09-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-09-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-10-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-10-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-11-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-11-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-12-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-12-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-13-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-13-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-14-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-14-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-15-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-15-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-16-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-16-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-17-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-17-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-18-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-18-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-19-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-19-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-20-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-20-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-21-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-21-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-22-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-22-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-23-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-23-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-24-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-24-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-25-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-25-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-26-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-26-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-27-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-27-SUMMARY.md"
  - "src-tauri/crates/gamelib-info/src/lib.rs"
  - "src-tauri/crates/gamelib-info/src/recent.rs"
  - "src-tauri/crates/gamelib-info/src/umu.rs"
  - "src-tauri/src/info_dispatch.rs"
  - "src/backend/__tests__/clearCacheWiki.test.ts"
  - "src/backend/__tests__/infoPortComplete.test.ts"
  - "src/backend/__tests__/infoShimSchedule.test.ts"
  - "src/backend/__tests__/launcher_launchSingleFlight.test.ts"
  - "src/backend/gamedetails/__tests__/gameDetailsModules.test.ts"
  - "src/backend/gamedetails/dispatch.ts"
  - "src/backend/info/recentGames.ts"
  - "src/backend/info/wiki.ts"
  - "src/backend/launcher.ts"
  - "src/backend/shortcuts/nonesteamgame/__tests__/nonesteamgame.test.ts"
  - "src/backend/shortcuts/nonesteamgame/nonesteamgame.ts"
  - "src/backend/sidecar/__tests__/runnerAuthFlows.test.ts"
  - "src/backend/sidecar/handlers.ts"
  - "src/backend/sidecar/runnerAuthFlowRegistration.ts"
  - "src/backend/storeManagers/gog/games.ts"
  - "src/backend/storeManagers/legendary/games.ts"
  - "src/backend/storeManagers/nile/games.ts"
  - "src/backend/storeManagers/storeManagerCommon/__tests__/umuGameId.test.ts"
  - "src/backend/storeManagers/storeManagerCommon/umuGameId.ts"
  - "src/backend/utils.ts"
covered_digest: "v4:sha256:b818916b3055cd5cc35aae063e555b56fd0086017e132f124387be636ae8c9ca"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "The ported services behave as before, including on the launch, game-page and shortcut paths that call them through the rustInvoke shims (CR-41, WR-41, WR-42, sign-out wiki-cache clear; plan 86-27)"
  gaps_remaining: []
  regressions: []
deferred: []
advisory: []
behavior_unverified_items: []
coincidental_reliance_items: []
human_verification: []
---

# Phase 86: Pure leaf services Verification Report

**Phase Goal:** The self-contained information and cache services run in Rust and behave as before.
**Requirement:** SVC-01 (declared by all 27 PLAN files, including gap plan 86-27; the milestone requirements file maps only SVC-01 to Phase 86; no orphans)
**Verified:** 2026-11-23
**Status:** passed
**Re-verification:** Yes, after gap closure plan 86-27 (prior status `gaps_found`, 4/5)

## Verdict in one paragraph

The one open gap (truth G, failure-path parity on the shim callers) is closed. I read each call site at HEAD, not the SUMMARY:
`launcher.ts:474-478` guards the recent-games write, the three store-manager `launch()` bodies call the new best-effort
`resolveLaunchUmuId`, `dispatch.ts:113-125` falls back to `tempGameInfo`, `nonesteamgame.ts:261-272` catches the wiki lookup, and the
runner sign-outs now carry `requestRustInvoke`. A grep of every non-test caller of the five shims finds no unguarded call left.
SC1-SC4 were verified in the prior report and nothing they rest on changed: the 86-27 diff (`git diff 409463f5e HEAD`) touches 17
files, all TypeScript under `src/backend`, plus the review disposition; no Rust, no `src/backend/info/*`. Score 5/5, no human items.

## Re-verification scope

Prior gaps (Step 0): truth G only, status partial. SC1-SC4 were VERIFIED. Regression check on those: `git diff 409463f5e HEAD --
src-tauri` is empty and `src/backend/info/` is byte-unchanged, so the Rust goldens, data-file parity and delete gate they rest on
are untouched; I re-ran `infoPortComplete` and `infoShimSchedule` (below) as the sanity check. Truth G got the full three-level check.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Wiki game info, CrossOver index, store search and discounts, anti-cheat return the same results for the recorded fixtures as the TS did | VERIFIED (regression-checked) | Unchanged since the prior report: no file under `src-tauri` is in the 86-27 diff, so the `gamelib-info` goldens (CI 364/363/364 incl. 118 golden tests on three OSes, and my own run in the prior verification) still stand. |
| SC2 | Recent games, overrides and the artwork caches read and write the existing files with no data change after upgrade | VERIFIED (regression-checked) | Live gate item 3 and 4 evidence unchanged; 86-27 adds no store write and changes no file format. |
| SC3 | Recorded fixtures exist for each previously untested slice before it is ported | VERIFIED (regression-checked) | Commit order and fixture dirs unchanged. |
| SC4 | Each ported slice's TS and sidecar registrations are deleted (delete gate passes) | VERIFIED | `infoPortComplete.test.ts` and `infoShimSchedule.test.ts` pass at HEAD (part of the 13-suite run below). `src/backend/info/*` byte-unchanged by 86-27, so D-06/D-24 (shim and resolver bodies are one typed call) hold. |
| G | The ported services behave as before, including on the launch, game-page and shortcut paths that call them through the rustInvoke shims | VERIFIED | See "Gap closure evidence" below: all four unguarded callers fixed, each with a test that makes the Rust call reject; no unguarded caller remains. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified).

### Gap closure evidence (truth G)

| Finding | Fix at HEAD (read by me) | Behavioral proof |
|---------|--------------------------|------------------|
| CR-41 | `src/backend/launcher.ts:474-478`: `try { await addRecentGame(deps, gameInfo) } catch (error) { logWarning(['Recording recent game failed:', error], LogPrefix.Backend) }`, positioned before the save-upload block, so the 'done' status, the save sync and the CLI exit all follow. | `launcher_launchSingleFlight.test.ts` CR-41 cases (lines 154-196): `addRecentGame` made to reject with `info_recent_add:write-failed`; offline case asserts `{status:'done'}`, one 'done' update and one `logWarning` carrying that error; online case asserts `syncSaves('--skip-download','/saves',[])` ran and two 'done' updates. Both pass. SUMMARY records the RED run (callback rejected). |
| WR-41 | New `storeManagerCommon/umuGameId.ts`: `resolveLaunchUmuId` awaits the `getUmuId` shim in try/catch, warns, returns `null`. `gog/games.ts:747`, `legendary/games.ts:1073`, `nile/games.ts:459` call it; none imports `info/wiki` or calls the shim directly. | `umuGameId.test.ts` (rejection with `:store-unavailable` and with the 60 s transport text both resolve null and warn once; source gate over the three managers with a vacuous-pass self-test). `infoShimSchedule` `WIKI_CALLERS` now names the helper; the `getUmuId` row is unchanged (shape shim, deletedBy 92). Passes. |
| WR-42 (game page) | `gamedetails/dispatch.ts:113-125`: `attachOverrides` in try/catch, returns `tempGameInfo` after a warning. The round-2 review confirms Rust `attach` returns the game unchanged when no override applies, so this equals the old result. | `gameDetailsModules.test.ts` WR-42 case (rejects `info_overrides_attach:not-ready`, expects the raw object and one warning). Passes. |
| WR-42 (shortcut) | `nonesteamgame.ts:260-272`: `getWikiGameInfo(deps, game).catch(...)` logs a warning at `LogPrefix.Shortcuts` and yields `null`, so `steamID` is `undefined` and the shortcut is still written. | `nonesteamgame.test.ts` WR-42 case (rejects `info_wiki_get:not-ready`, still sends the add mutation and the success log). Passes. |
| Sign-out wiki-cache clear | `handlers.ts` passes `requestRustInvoke: deps.services.host.requestRustInvoke` to `registerRunnerAuthFlows`; `RunnerAuthFlowDeps` declares it and `userDeps()` forwards it; `logoutLegendary` (L176), `logoutAmazon` (L260) and `logoutGOG` (L276) all build deps with `userDeps()`, and each user module's `logout` calls `clearCache(deps, ...)` (legendary/user.ts:710, nile/user.ts:287, gog/user.ts:425). `utils.ts` stale OWED doc refreshed (comment only). | `runnerAuthFlows.test.ts` extended pass-through case plus the "86-27" case assert the three sign-outs receive the registered `requestRustInvoke`. Passes. The prior report's "NOT WIRED" key link is now WIRED. |

Exhaustive caller sweep (`grep -rnE '\b(addRecentGame|getUmuId|attachOverrides|getWikiGameInfo|removeRecentGame)\(' src/backend`, non-test, outside
`src/backend/info/`): `launcher.ts:475` guarded; `dispatch.ts:114` guarded; `nonesteamgame.ts:261` guarded; `steam/launchDispatch.ts:105` and `:176`
guarded (try/catch, read by me); `umuGameId.ts:26` is the guard itself; `sideload/games.ts:234` `.catch`-guarded. No unguarded caller.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/storeManagers/storeManagerCommon/umuGameId.ts` | `resolveLaunchUmuId` best-effort lookup | VERIFIED | 34 lines, substantive, imported and called by gog, legendary and nile `games.ts`; FLOWING (returns the Rust answer or null) |
| `.../storeManagerCommon/__tests__/umuGameId.test.ts` | WR-41 rejection cases and source gate | VERIFIED | 131 lines, passes |
| `src/backend/launcher.ts` | guarded recent-games write | VERIFIED | L474-478 |
| `src/backend/__tests__/launcher_launchSingleFlight.test.ts` | CR-41 cases | VERIFIED | 2 cases, pass |
| `src/backend/gamedetails/dispatch.ts` | attachOverrides fallback | VERIFIED | L113-125 |
| `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts` | tolerant wiki lookup | VERIFIED | L260-272 |

Key links from the 86-27 plan (`resolveLaunchUmuId` imported and called in each of the three managers; helper imports `backend/info/wiki`;
`launcher.ts` to `recentGames`; `handlers.ts` to `registerRunnerAuthFlows` with `requestRustInvoke`): all WIRED by grep at HEAD.

### Behavioral Spot-Checks (run by me)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Gap-closure suites plus the D-06 schedule and delete gate | `pnpm exec jest --selectProjects Backend --runTestsByPath <the 13 suites listed in the 86-27 plan verification>` | `Test Suites: 13 passed, 13 total; Tests: 459 passed, 459 total` | PASS |
| Type check | `pnpm -s codecheck` | exit 0, no output | PASS |
| `git diff 409463f5e HEAD -- src-tauri src/backend/info` | empty | no Rust, no shim body changed | PASS |
| Caller sweep (above) | `grep -rnE ...` | every caller guarded | PASS |

Probe execution: none declared by the phase (Step 7c not applicable).

### Regression gate

The orchestrator reports a full jest run in this worktree: 1142 suites passed, 3 failed. I did not repeat it. I checked the claim that
the three failures are outside the 86-27 diff: the diff's 17 files are the ones listed in the plan frontmatter, and none is
`meta/__tests__/shimAbiGate.test.ts`, `meta/__tests__/genI18nGateScope.test.ts` or
`src/backend/wine/__tests__/oracle/wineManager.oracle.test.ts` (nor anything they import from this diff beyond the listed backend files; the
wine oracle failure is Phase 87-20's native `installWineVersion` at base `409463f5e`). `shimAbiGate` is a spawn error (-88) from a
cross-compiler unavailable in the environment; `genI18nGateScope` A-17 is R5, the operator-deferred stale `meta/i18nForkTouchedFiles.json`.
Treated as pre-existing and not attributable to Phase 86 goal achievement; recorded as known reds.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| SVC-01 | 86-01 .. 86-27 (all 27 declare `[SVC-01]`) | Wiki game info, the CrossOver index, store search and discounts, anti-cheat info, recent games, per-game overrides and the artwork caches work as before | SATISFIED | SC1-SC4 and the failure-path closure (G). Note: in this worktree `.planning/REQUIREMENTS-v0.11.md` still reads `SVC-01 | Phase 86 | Pending` with the checkbox unticked (the prior report saw it Complete on the main checkout); updating that tracker is the orchestrator's close-out step, not a code gap. No other ID maps to Phase 86: no orphans. |

### Anti-Patterns Found

None blocking. Debt-marker scan (TBD/FIXME/XXX/TODO/HACK) over the files 86-27 changed or created: none added. The catch blocks all log
(no silent swallow, T-86-68).

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/backend/utils.ts` / `storeManagers/legendary/user.ts` | 334-349 / 122-132 | `ClearCacheDeps.requestRustInvoke` still optional (WR-64) | Warning | Not a goal failure; every production construction now passes it. Type hole could let the regression recur. Recorded open in 86-REVIEW-DISPOSITION.md. |
| `launcher.ts`, `dispatch.ts` | 475-477, 113-125 | warning lines omit the app name (IN-69) | Info | Log diagnosability only |
| `umuGameId.test.ts` | 78-125 | `launch()` bodies covered by a source gate, not a driven launch (IN-70) | Info | Helper behaviour is tested directly |

### Human Verification Required

None. Every behavior-dependent truth in G has a passing behavioral test that makes the Rust call reject. The live gate (86-HUMAN-UAT.md) was
run earlier; item 1's `issue` was adjudicated not-a-gap in the prior report and is unchanged.

## Warnings (non-blocking, track)

- **WR-64** (round-2 review, open): make `requestRustInvoke` required on `ClearCacheDeps` and `LegendaryUserDeps` and drop `canClearWikiCache`, so a missing transport is a compile error. IN-69 and IN-70 open. All three are in `86-REVIEW-DISPOSITION.md` (open count 42: 39 round-1 plus these 3).
- R5 stale `meta/i18nForkTouchedFiles.json` (local A-17 red), operator-deferred.
- The round-1 review ledger still lists 39 findings `open`; they need owners but none contradicts a success criterion.
- Items from the prior report that stand: item 4's artwork-file half was vacuous (URL-only override); item 2's ownership badges were not separately observed.
- `shimAbiGate` (environment) and the wine oracle test (Phase 87 work) are red in the full run and outside Phase 86.

## Gaps Summary

None. Truth G moved from partial to VERIFIED: the four rejection-hazard callers and the sign-out wiring are fixed in the code, each with a
test that forces the Rust call to reject, and a sweep finds no remaining unguarded caller. Phase 86 goal ("run in Rust and behave as before")
holds on the happy path (SC1-SC4) and the failure path (G).

---

_Verified: 2026-11-23_
_Verifier: Claude (gsd-verifier)_
