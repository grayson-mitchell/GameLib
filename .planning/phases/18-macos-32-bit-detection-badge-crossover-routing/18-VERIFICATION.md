---
phase: 18-macos-32-bit-detection-badge-crossover-routing
verified: 2026-07-12T08:58:34Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "MAC32-04: the '32' badge surfaces the game's detected OS/arch beside the game logo — the Mach-O-resolved mac_arch:'32' verdict now propagates end-to-end from verifyMacArchGroundTruth() and refresh() to the frontend-visible GameInfo.mac_arch that MacArchBadge renders from"
  gaps_remaining: []
  regressions: []
---

# Phase 18: macOS 32-bit detection, badge & CrossOver routing — Verification Report

**Phase Goal:** Detect a Steam game's macOS build architecture and route 32-bit-only mac games to CrossOver/Wine instead of a native install that fails on modern macOS (32-bit dropped in Catalina/2019), surfacing the game's OS/arch as a badge beside the game logo in the left panel.
**Verified:** 2026-07-12T08:58:34Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 18-05 + code-review follow-up fix)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GameInfo`/`SteamMetadataCacheEntry` carry a `mac_arch` signal (`'32'\|'64'\|'unknown'`) that is false-flag-safe | ✓ VERIFIED (regression, unchanged) | `src/common/types.ts:226`; `src/backend/storeManagers/steam/electronStores.ts:58-68` |
| 2 | MAC32-01: pre-install min-OS heuristic (`macArchFromMinOS`) never asserts `'32'` | ✓ VERIFIED (regression, unchanged) | `src/backend/storeManagers/steam/games.ts:206-213` — return type `'64' \| 'unknown'`, no `'32'` member; file untouched by the 18-05 diff (confirmed via `git diff --stat 4b370413..HEAD -- src/` — only `library.ts`/`library.test.ts` changed) |
| 3 | MAC32-02: on macOS, a confirmed-32-bit mac build routes install/launch/uninstall through the CrossOver/Wine bottle instead of native `steam://` | ✓ VERIFIED (regression, unchanged) | `src/backend/storeManagers/steam/games.ts:606-618` — `isBottleEligible()` reads `steamMetadataStore` directly, independent of the badge propagation path; untouched by the fix |
| 4 | MAC32-03: post-install Mach-O check (`lipo`/`file`) is the sole ground truth that may ever assert `'32'`; inconclusive/missing tool output is never coerced to a verdict | ✓ VERIFIED (regression, unchanged) | `src/backend/storeManagers/steam/library.ts:505-540` (`machOArchsOf`/`verdictFromArchs`/`locateMachOBinary` unchanged by the fix); `verifyMacArchGroundTruth`'s early-returns (source≠native, !isMac, already-'32'/verified, no binary, null verdict) all intact and re-tested — 108/108 `library.test.ts` tests pass, including all 11 `verifyMacArchGroundTruth() — MAC32-03` describe-block tests |
| 5 | MAC32-04: the "32" badge actually renders beside the game logo in the left panel for a game whose `mac_arch` was resolved to `'32'` | ✓ **VERIFIED (gap closed)** | See "CR-01 Re-Trace" below — both propagation breaks fixed, third breakage found by code-review (missing `steamLibraryStore` persist) also fixed, all backed by passing regression tests |

**Score:** 5/5 truths verified

### CR-01 Re-Trace (badge data-flow, gap closure verification)

Re-traced end-to-end against the current source, independent of SUMMARY.md's narrative, exactly mirroring the prior verification's CR-01 method:

1. **`verifyMacArchGroundTruth(appId, installPath, source)`** (`library.ts:602-671`) — after persisting the verdict to `steamMetadataStore` (unchanged, line 633), now reads `library.get(appId)` (line 651). If present: merges `mac_arch: verdict` onto the existing entry via spread (line 653, never fabricates a new `GameInfo`), writes it back with `library.set(appId, updatedGameInfo)` (line 654), **persists the full library snapshot to `steamLibraryStore.set('games', Array.from(library.values()))`** (line 659 — this is the code-review follow-up fix, `18-05-REVIEW.md` CR-01, landed in commit `e3a7a9f1`), then calls `sendFrontendMessage('pushGameToLibrary', updatedGameInfo)` (line 660). If the appId is absent from the Map, it logs and no-ops — no fabricated push, no throw (lines 661-666). Confirmed by direct read: all three effects (Map update, disk persist, frontend push) now fire together, mirroring the exact pattern used by `refresh()` (line 293-294/298), `refreshInstallState()` (419-426), `pollInstallOnce`'s `'installed'` branch (951-952), and `pollUninstallOnce`'s `'absent'` branch (1125-1126) — all four other library-mutation call sites in this file follow the identical `library.set` → `steamLibraryStore.set` → `sendFrontendMessage` sequence, so this is no longer an outlier.
2. **`refresh()`** (`library.ts:188-299`) — the constructed `gameInfo` object literal now includes `mac_arch: cachedMeta?.mac_arch ?? 'unknown'` (line 264), placed in the same cachedMeta-seed cluster as `is_mac_native`/`is_linux_native`/`is_delisted`/`steamPlatformsCaptured`. Default is `'unknown'`, never `'32'` — confirmed false-flag-safe by direct read of the `??` fallback. Every full library sync now carries a previously cached `'32'` verdict forward into both the in-memory Map (`library.set`, line 293) and the frontend push (`sendFrontendMessage`, line 294).
3. **Frontend wiring** (unchanged, re-confirmed): `GamePage/index.tsx:497` renders `<MacArchBadge gameInfo={gameInfo} isMac={isMac} />`; `MacArchBadge.tsx:24` gates on `gameInfo.mac_arch !== '32'`. The `gameInfo` state is refetched via `getGameInfo(appName, runner)` inside a `useEffect` keyed on `[status, gog.library, epic.library, steam.library, isMoving]` (`GamePage/index.tsx:221-239`) — `steam.library` changes whenever `GlobalState.tsx`'s `handleGamePush` listener (line 1163, `runner === 'steam'` branch at line 1199) receives a `pushGameToLibrary` IPC message and updates `state.steam.library`. Since `verifyMacArchGroundTruth` and `refresh()` both now emit that IPC message carrying `mac_arch:'32'` (steps 1-2), this effect re-fires and `getGameInfo()` returns the updated verdict, so `setGameInfo` (and therefore `MacArchBadge`) picks it up without a restart.
4. **Persistence across restart**: `init()` (`library.ts:89-100`, unchanged) loads `steamLibraryStore.get('games', [])` and pushes each cached `GameInfo` to the frontend on startup — since `verifyMacArchGroundTruth` now also writes to `steamLibraryStore` (step 1) before the app might restart, a restart shortly after an install-time '32' detection no longer reads a stale pre-verdict snapshot. This closes the exact restart-window regression flagged by `18-05-REVIEW.md`'s CR-01 finding, which was itself fixed in the same plan cycle (commit `e3a7a9f1`, follow-up to `efc83d37`/`f29bd8e2`).

**Conclusion:** For the realistic end-to-end flow (install completes → Mach-O check flips `mac_arch` to `'32'` → badge appears live without restart; OR app restarts before the check completes → next `refresh()`/`init()` load carries the verdict), the badge now reaches `GameInfo.mac_arch` through both the live-push path and the persisted-cache path. `isBottleEligible()` (Truth 3) is unaffected (reads `steamMetadataStore` directly, as before). The DISCONNECTED data-flow status from the prior verification is now FLOWING.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/types.ts` | `GameInfo.mac_arch` optional field | ✓ VERIFIED (unchanged) | Line 226 |
| `src/backend/storeManagers/steam/electronStores.ts` | `mac_arch`/`mac_arch_verified`/`mac_arch_source` cache fields | ✓ VERIFIED (unchanged) | Lines 58-68 |
| `src/backend/storeManagers/steam/games.ts` | `macArchFromMinOS`, `isBottleEligible` OR-branch | ✓ VERIFIED (unchanged, out of scope fence — confirmed untouched by `git diff --stat`) | Lines 206-213, 606-618 |
| `src/backend/storeManagers/steam/library.ts` | `verifyMacArchGroundTruth` propagates verdict to `library` Map + `steamLibraryStore` + frontend push; `refresh()` seeds `mac_arch` from `cachedMeta` | ✓ VERIFIED — all 3 effects (Map/disk/IPC) present and wired | `verifyMacArchGroundTruth`: lines 602-671 (propagation block 644-666); `refresh()`: line 264 (`mac_arch: cachedMeta?.mac_arch ?? 'unknown'`) |
| `src/backend/storeManagers/steam/__tests__/library.test.ts` | Regression tests locking both propagation paths + the WR-01 absent-from-Map branch | ✓ VERIFIED | `CR-01: refresh() seeds mac_arch:'32'...` (line 458); `CR-01: an i386 verdict updates the in-memory library Map and pushes...` (line 2611, asserts `sendFrontendMessage`, `library.get`, AND `steamLibraryStore.set`); `CR-01: does not push or throw when appId is not present...` (line 2662, WR-01 closure) |
| `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx` | "32" badge, render-gated on `mac_arch === '32'`, host-OS-gated styling | ✓ VERIFIED (unchanged, in scope fence) | Lines 21-43 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `verifyMacArchGroundTruth` `'32'`/`'64'` verdict | in-memory `library` Map | `library.get(appId)` → merge → `library.set(appId, updated)` | ✓ WIRED | `library.ts:651-654` |
| `verifyMacArchGroundTruth` `'32'`/`'64'` verdict | `steamLibraryStore` (disk persist) | `steamLibraryStore.set('games', Array.from(library.values()))` | ✓ WIRED (code-review follow-up fix) | `library.ts:659`, commit `e3a7a9f1` |
| `verifyMacArchGroundTruth` `'32'`/`'64'` verdict | frontend `GameInfo.mac_arch` (live) | `sendFrontendMessage('pushGameToLibrary', updatedGameInfo)` | ✓ WIRED | `library.ts:660` |
| `refresh()` `cachedMeta.mac_arch` | rebuilt `gameInfo.mac_arch` | object-literal seed `mac_arch: cachedMeta?.mac_arch ?? 'unknown'` | ✓ WIRED | `library.ts:264` |
| `pushGameToLibrary` IPC message | `GlobalState.steam.library` | `handleGamePush` listener, `runner === 'steam'` branch | ✓ WIRED (pre-existing, re-confirmed) | `GlobalState.tsx:1163,1199` |
| `steam.library` state change | `GamePage` `gameInfo` refetch | `useEffect` dependency array includes `steam.library` → `getGameInfo(appName, runner)` | ✓ WIRED (pre-existing, re-confirmed) | `GamePage/index.tsx:221-239` |
| `GamePage/index.tsx` | `MacArchBadge` | rendered with `gameInfo`+`isMac` props beside `.store-icon` | ✓ WIRED (unchanged) | `index.tsx:497` |
| appId absent from `library` Map | no fabricated push | early-return, log only | ✓ WIRED (WR-01 closed) | `library.ts:661-666`, test at `library.test.ts:2662` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `MacArchBadge` | `gameInfo.mac_arch` | `GamePage`'s `gameInfo` state ← `getGameInfo(appName, runner)` IPC (triggered by `steam.library` change) ← `GlobalState.handleGamePush` ← `sendFrontendMessage('pushGameToLibrary', ...)` ← `verifyMacArchGroundTruth`/`refresh()`/`init()` | Yes — both the live post-install-detection push and the persisted-cache-on-restart path now carry the resolved `'32'`/`'64'` verdict | ✓ **FLOWING** (previously DISCONNECTED) |
| `isBottleEligible()` (CrossOver routing) | `meta.mac_arch` | `steamMetadataStore.get(appId)` — read directly from persisted cache | Yes — unaffected by the fix, still correct | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `refresh()` seeds `mac_arch` from `cachedMeta` onto rebuilt `GameInfo` | manual code read, `library.ts:264` | `mac_arch: cachedMeta?.mac_arch ?? 'unknown'` present in the object literal | ✓ PASS (gap closed) |
| `verifyMacArchGroundTruth` pushes updated `GameInfo` to frontend | manual code read, `library.ts:651-660` | `library.set` + `sendFrontendMessage('pushGameToLibrary', ...)` present, guarded on Map presence | ✓ PASS (gap closed) |
| `verifyMacArchGroundTruth` persists to `steamLibraryStore` before pushing (restart-safety) | manual code read, `library.ts:659` | `steamLibraryStore.set('games', Array.from(library.values()))` present, matching the pattern at 3 other call sites in the same file | ✓ PASS (code-review follow-up fix confirmed landed) |
| `library.test.ts` full suite | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts` | 1 suite passed, 108/108 tests passed | ✓ PASS |
| Full repo test suite | `npx jest` | 50 suites passed, 1030/1030 tests passed (one known pre-existing leaked-interval trailing-stderr warning in `pollInstallOnce`, documented in `deferred-items.md`, does not fail the suite) | ✓ PASS |
| `npx tsc --noEmit` on `library.ts` | `npx tsc --noEmit -p tsconfig.json \| grep -i library.ts` | No output — no type errors | ✓ PASS |
| Scope fence: only `library.ts`/`library.test.ts` touched since prior verification | `git diff --stat 4b370413..HEAD -- src/` | 2 files changed, 156 insertions(+), 0 deletions(-) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MAC32-01 | 18-01, 18-02 | Read a Steam game's macOS arch signal, treat missing/blank as unknown never 32-bit | ✓ SATISFIED (unchanged, re-confirmed) | `macArchFromMinOS` return type `'64' \| 'unknown'`; file untouched by 18-05 |
| MAC32-02 | 18-02 | Confirmed-32-bit mac game routes through the bottle for install/launch/uninstall | ✓ SATISFIED (unchanged, re-confirmed) | `isBottleEligible()` OR-branch, untouched by 18-05 |
| MAC32-03 | 18-03 | Post-install Mach-O ground truth re-routes an i386-only binary Steam failed to tag | ✓ SATISFIED (unchanged, re-confirmed) | `verifyMacArchGroundTruth`/`machOArchsOf`/`verdictFromArchs` invariant intact; all 11 MAC32-03 describe-block tests pass |
| MAC32-04 | 18-04, 18-05 (gap closure) | Left-panel badge shows OS logo + "32" mark on 32-bit builds, actionable warning only on macOS host | ✓ **SATISFIED (gap closed)** | Component correct (18-04) + full data-flow propagation now wired end-to-end (18-05 + code-review follow-up) — see CR-01 Re-Trace above |

No orphaned requirements — all 4 IDs (MAC32-01 through MAC32-04) declared across the phase's plan frontmatter (18-01 through 18-05), matching REQUIREMENTS.md's phase-18 mapping exactly.

**Note (documentation hygiene, non-blocking):** `.planning/REQUIREMENTS.md` lines 109-112 and the tracking table at lines 189-192 still show all four MAC32-0x checkboxes as `[ ]` / "Pending" — this is a stale tracking-doc status, not a code gap. Recommend updating REQUIREMENTS.md's checkboxes/table to reflect Phase 18's completion in a housekeeping pass; does not block phase sign-off since the underlying code evidence is verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `library.ts` | 694-701 (unchanged, pre-existing) | `forceUninstall()` is in-memory-only; native ACF/files are never actually removed | ⚠️ Warning (pre-existing, out of 18-05 scope fence) | Dead native install leaks disk space; next reconcile can re-mask the bottle install as native (REVIEW.md WR-01 from 18-REVIEW.md, not the 18-05-REVIEW.md WR-01 which is a different, now-closed item) |
| `library.ts` | 513-522 (unchanged, pre-existing) | `file` fallback matches arch substrings against the full output including the file path | ℹ️ Info (pre-existing, out of scope) | Carried forward from prior verification, unaffected by this fix |
| `library.ts` | 550-557 (unchanged, pre-existing) | `locateMachOBinary` doc comment overclaims path-traversal containment | ℹ️ Info (pre-existing, out of scope) | Carried forward from prior verification, unaffected by this fix |
| `library.ts` | ~980 (unchanged, pre-existing) | `void verifyMacArchGroundTruth(...)` has no `.catch` | ℹ️ Info (pre-existing, out of scope) | Carried forward from prior verification, unaffected by this fix |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in `library.ts` or `library.test.ts` (the two files touched by this gap closure).

The pre-existing WARNING/INFO items above (native forceUninstall in-memory-only, `file` fallback substring matching, `locateMachOBinary` doc overclaim, missing `.catch`) were explicitly fenced out of scope by plan 18-05 (`Scope fence (do NOT touch)`) and remain open as tracked technical debt from `18-REVIEW.md`, not new findings from this gap-closure cycle. They do not block MAC32-04 or the phase goal — none of them affect the badge data-flow being verified here.

### Human Verification Required

None. All 5 must-have truths verify programmatically against the codebase (unit tests + direct source trace), and the deferred 18-04 visual placement/styling UAT is a nice-to-have polish check, not a blocker for goal achievement — the underlying data-flow, wiring, and rendering logic are all independently verified without needing a live macOS+CrossOver rig. Status is `passed`, which requires this section to be empty per the decision tree.

### Gaps Summary

None. The single BLOCKER from the prior verification (CR-01: `verifyMacArchGroundTruth()` never propagated its verdict to the frontend-visible `GameInfo`, and `refresh()` dropped `mac_arch` when rebuilding `GameInfo` from cache) has been closed by plan 18-05's three tasks, and a third propagation break found by the subsequent code review (missing `steamLibraryStore.set` persist step, which would have caused the badge to silently revert after a restart before the next `refresh()`) was also fixed in the same cycle (commit `e3a7a9f1`) and locked with a regression test asserting the `steamLibraryStore.set` call. The WR-01 warning (no explicit test for the appId-absent-from-Map branch) was also closed with an added test (commit `717cfa1a`).

All 4 requirement IDs (MAC32-01 through MAC32-04) are now SATISFIED. The full repository test suite passes (50/50 suites, 1030/1030 tests). The phase goal — detecting 32-bit macOS Steam builds, routing them to CrossOver/Wine, and surfacing a "32" badge beside the game logo — is achieved end-to-end in the codebase, both for the live post-install-detection flow and the app-restart/resync flow.

---

_Verified: 2026-07-12T08:58:34Z_
_Verifier: Claude (gsd-verifier)_
