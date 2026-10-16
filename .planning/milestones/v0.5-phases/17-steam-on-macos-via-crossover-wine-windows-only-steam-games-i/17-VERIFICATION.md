---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
verified: 2026-07-13T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: Initial goal-backward verification (no prior VERIFICATION.md)
gaps: []
deferred:
  - truth: "library.ts pollInstallOnce→readAcfState poll-timer leak (pre-existing, causes one Jest 'worker failed to exit gracefully' warning on full suite; exit code still 0)"
    addressed_in: "deferred-items.md (tracked); unref'd in 17-17 for the isolated steam suite"
    evidence: "Documented in 17-VALIDATION.md and deferred-items.md as pre-existing/out-of-scope; full-suite exit code 0"
---

# Phase 17: Steam on macOS via CrossOver/Wine — Verification Report

**Phase Goal:** Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle, instead of native steam:// delegation.
**Verified:** 2026-07-13
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Confirmed Windows-only Steam game installs & launches through a dedicated GameLib-managed bottle running Windows Steam | ✓ VERIFIED | `provisionBottle()` (bottle.ts:540), `tellBottledSteamToInstall/Launch/Uninstall` (888/894/900); games.ts install() routes bottle-eligible games via `tellBottledSteamToInstall` (549) gated on `isBottleReady()` (530). Runtime install/launch human-verified in 17-VALIDATION.md (approved, 7/7 UAT steps). |
| 2 | First Install/Play with no bottle triggers guided setup + consent flow (create, engine choice, SteamSetup click-through, one-time login) — never a failing native steam://install | ✓ VERIFIED | games.ts:530-544 sends `steamBottleSetupRequired` + returns `deferredToSetup` (no native fallthrough); SteamBottleSetup.tsx guided surface w/ WineSelector engine choice + login prompt + `uncheckRunSteam` copy; App.tsx:97 top-level mount. UAT verified. |
| 3 | `isNative()` per-OS & confirmed-not-native-gated (platformsCaptured && !is_mac_native) — not-yet-synced game NOT force-bottled (D-11) | ✓ VERIFIED | games.ts `isNative() = !isBottleEligible()`; `isBottleEligible()` (601-624): `false` when `!isMac`, else `platformsCaptured===true && is_mac_native===false` (or confirmed mac_arch==='32'). `ensurePlatformsCaptured()` awaited before routing (528). |
| 4 | Bottle-installed game's badge reads from the bottle's own steamapps ACF as a Windows install | ✓ VERIFIED | library.ts `buildBottleInstalledMap()`, source-parameterized scan; `source==='bottle' → platform 'Windows'` (73); bottle root resolved via `getBottleSteamappsDir()` distinct from native `defaultSteamPath`. |
| 5 | Game page shows a "runs via the Windows Steam bottle" indicator | ✓ VERIFIED | AppleWikiInfo.tsx `showBottle` (62) gated on `gameInfo.steamPlatformsCaptured===true`, matching backend routing gate; rendered at :98. `steamPlatformsCaptured` passthrough on GameInfo (common/types.ts). |
| 6 | Native-Mac Steam, Windows, Linux (Proton), GOG/Epic shared-bottle behavior all unchanged | ✓ VERIFIED | `isBottleEligible()` returns false for `!isMac` (Linux/Windows native path intact); tools/index.ts:884 `runner==='steam'` guard keeps `runWineCommandOnGame` unreachable; CR-01 shared-bottle guard (bottle.ts:567-582) protects GOG/Epic bottle. Scope-fence non-regression human-verified in 17-VALIDATION.md. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/storeManagers/steam/bottle.ts` | paths/guards/provisioning/dispatch, both-root resolver, win10_64, wineserver kill, CR-01 guard | ✓ VERIFIED | All exports present (getBottleSteamappsDir, isBottleProvisioned, sanitizeBottleName, getSteamBottleSettings, provisionBottle, tellBottledSteamTo*, isBottleReady, bottleWineArch, getBottleSteamExePath); both-root candidates (89-90); win10_64 (5 refs); wineserver (6 refs) |
| `src/backend/storeManagers/steam/library.ts` | bottle-aware ACF scan, Windows platform, source-parameterized pollers, progress percent | ✓ VERIFIED | buildBottleInstalledMap, source='bottle'→'Windows' (73), progressUpdate byte-derived percent |
| `src/backend/storeManagers/steam/games.ts` | per-OS isNative, bottle routing, ensurePlatformsCaptured, isBottleReady gate, WR-01 dispatch guard | ✓ VERIFIED | isBottleEligible (601), ensurePlatformsCaptured (528), WR-01 `result.status!=='done'→error before poller` (555-561) |
| `src/backend/tools/index.ts` | runner==='steam' guard on runWineCommandOnGame | ✓ VERIFIED | :884 |
| `src/backend/main.ts` | IPC: steamBottleProvision/isSteamBottleProvisioned/steamBottleStatus | ✓ VERIFIED | :896/899/900; loggedIn removed (WR-02, :895 comment) |
| `src/preload/api/steam.ts` | preload invokers | ✓ VERIFIED | steamBottleProvision present |
| `src/frontend/state/SteamBottleSetup.ts` | store + isSteamBottleSetupActiveFor selector | ✓ VERIFIED | selector (45), settingUpBottle plumbing |
| `src/frontend/state/GlobalState.tsx` | handleSteamBottleSetupRequired listener | ✓ VERIFIED | 3 refs |
| `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` | guided consent/engine/login surface + hideSharedPrefixToggle + uncheckRunSteam | ✓ VERIFIED | hideSharedPrefixToggle passed (:184), uncheckRunSteam rendered (:234) |
| `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.scss` | banner styling | ✓ VERIFIED | .steamBottleSetupToast present + imported |
| `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` | D-08 indicator | ✓ VERIFIED | showBottle gated on steamPlatformsCaptured |
| `MainButton.tsx` / `GameStatus.tsx` | settingUpBottle label/status | ✓ VERIFIED | settingUpBottle refs in both |
| `WineSelector/index.tsx` | hideSharedPrefixToggle prop | ✓ VERIFIED | prop hides shared toggle (:38/53/159) |
| `spike/steam-bottle/FINDINGS.md` + probe | locked mechanism + win10_64 | ✓ VERIFIED | MECHANISM DECISION + win10_64 present |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| provisionBottle scope guard | GlobalConfig shared wineCrossoverBottle | reject before any destructive op | ✓ WIRED (bottle.ts:567-582, ordered before store.set:585 and win32-recreate branch) |
| games.ts install (bottle) | startInstallPolling | guarded on tellBottledSteamToInstall success | ✓ WIRED (games.ts:555-561) |
| SteamBottleSetup | WineSelector hideSharedPrefixToggle | prop removes shared-prefix toggle | ✓ WIRED |
| GlobalState | steamBottleSetupRequired | handleSteamBottleSetupRequired → open(appName) | ✓ WIRED |
| main.ts | bottle.ts provisionBottle | addHandler('steamBottleProvision') | ✓ WIRED |
| library.ts | bottle.ts getBottleSteamappsDir | bottle-rooted ACF scan | ✓ WIRED |

### CR-01 / WR-01 / WR-02 Closure Verification (from 17-REVIEW.md, resolved by 17-17)

| Finding | Fix Required | Status | Evidence |
|---------|--------------|--------|----------|
| CR-01 (BLOCKER, data loss) | provisionBottle rejects shared bottle name before any destructive op | ✓ VERIFIED IN CODE | bottle.ts:567-582 — guard AFTER sanitize, BEFORE store.set (585) / win32-recreate delete (2b). Compared against trimmed shared value. Regression tests: rejects, whitespace-padded, no over-fire, inert-when-unset, asserts NO set/spawn/rmSync (bottle.test.ts:419-528) |
| CR-01 defense-in-depth | remove shared-prefix toggle from Steam setup path | ✓ VERIFIED | hideSharedPrefixToggle in WineSelector + passed by SteamBottleSetup.tsx |
| WR-01 | ACF poller starts only on successful dispatch | ✓ VERIFIED | games.ts:555-561 |
| WR-02 | remove dead always-false loggedIn signal | ✓ VERIFIED | Removed from steam.ts/ipc.ts/main.ts (0 live refs, replaced by removal comments) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Steam bottle/games/library + frontend setup suites pass | `npx jest --testPathPattern="steam.*(bottle\|games\|library)"` + frontend | 6 suites / 308 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|-------------|--------|----------|
| MACSTEAM-01 | 17-05, 17-07 | ✓ SATISFIED | per-OS confirmed-not-native isNative (D-11) — games.ts isBottleEligible |
| MACSTEAM-02 | 17-01,02,04,07,08,10,11,13,15,16,17 | ✓ SATISFIED | guided bottle provisioning (create + SteamSetup non-silent), WineSelector engine, shared bottle untouched (CR-01) |
| MACSTEAM-03 | 17-04,07,13 | ✓ SATISFIED | one-time bottled login during setup, opaque auth (D-04), gated on provisioned/ready |
| MACSTEAM-04 | 17-04,05,07,08,09,11,12,14,15,16,17 | ✓ SATISFIED | install/launch/uninstall route through bottled Steam; native path unchanged for non-eligible |
| MACSTEAM-05 | 17-02,03,07,12,14 | ✓ SATISFIED | bottle's own steamapps ACF, platform 'Windows', ACF progress polling |
| MACSTEAM-06 | 17-06,07,09 | ✓ SATISFIED | D-08 game-page indicator gated on steamPlatformsCaptured |

All 6 requirement IDs from PLAN frontmatter accounted for. No orphaned requirements (REQUIREMENTS.md maps exactly MACSTEAM-01..06 to Phase 17).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX debt markers in phase-modified source | — | library.ts "bytesToDownload" matched a case-insensitive TODO grep — false positive, not a marker |

### Human Verification Required

None. The genuinely runtime/manual surface (real CrossOver bottle creation, bottled login, install/launch through the bottle, D-08 visual indicator, scope-fence non-regressions) was validated by human UAT and signed off in 17-VALIDATION.md (status: approved, 2026-07-13, all 7 UAT steps + scope fences pass). No NEW untested runtime claims were found during code verification.

### Gaps Summary

No gaps. All 6 ROADMAP success criteria are observably enabled in the codebase, all merged plan artifacts exist / are substantive / are wired, and the CR-01 data-loss BLOCKER plus WR-01/WR-02 warnings from 17-REVIEW.md are confirmed CLOSED in code (not just claimed). The CR-01 backend scope guard is correctly ordered before every destructive operation and backed by RED-first regression tests asserting no set/spawn/rmSync against the shared bottle name. The automated suite is green (steam suites 308/308 verified here; full suite 50/1048 per phase context). One pre-existing library.ts poll-timer leak is deferred and tracked — exit code 0, not a phase gap.

---

_Verified: 2026-07-13_
_Verifier: Claude (gsd-verifier)_
