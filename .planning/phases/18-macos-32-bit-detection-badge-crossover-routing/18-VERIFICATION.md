---
phase: 18-macos-32-bit-detection-badge-crossover-routing
verified: 2026-07-12T08:00:46Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "The '32' badge surfaces the game's detected OS/arch beside the game logo — MAC32-04 must actually render for a game whose mac_arch was resolved to '32'"
    status: failed
    reason: "MacArchBadge.tsx itself is correctly built and correctly wired (imported, rendered with gameInfo+isMac props beside .store-icon, CSS present, i18n key present, 7/7 RTL tests pass). But the mac_arch verdict never reaches the GameInfo object the component receives, in the realistic/common flow. Two independent propagation breaks confirmed by direct code trace: (1) verifyMacArchGroundTruth() (library.ts:596-643) — the ONLY function that ever asserts mac_arch:'32' — writes exclusively to steamMetadataStore.set(...) and never calls library.set(...) or sendFrontendMessage('pushGameToLibrary', ...); pollInstallOnce already pushed the 'installed' GameInfo before this fire-and-forget check runs, so no push ever carries the '32' verdict. (2) refresh() (library.ts:246-285) rebuilds every GameInfo from cachedMeta at every startup/resync and explicitly seeds is_mac_native/is_linux_native/is_delisted/steamPlatformsCaptured from the cache — but omits mac_arch entirely, even though cachedMeta.mac_arch is persisted (electronStores.ts:58). getGameInfo()'s lazy fetchMetadataIfNeeded (games.ts:298-317) — the only other path that writes mac_arch onto the in-memory library GameInfo — is gated off once art_cover exists and platformsCaptured is true (games.ts:310-313), which is already the case for any game that reached a post-install Mach-O check. No test exists asserting mac_arch survives refresh() or a post-verifyMacArchGroundTruth push (confirmed via grep across games.test.ts/library.test.ts), so the gap is silent and not caught by the green 360/360 test suite."
    artifacts:
      - path: "src/backend/storeManagers/steam/library.ts"
        issue: "verifyMacArchGroundTruth() (lines 596-643) writes only to steamMetadataStore; never updates the in-memory library Map or pushes the updated GameInfo to the frontend. refresh() (lines 246-285) rebuilds GameInfo from cachedMeta but never seeds mac_arch."
      - path: "src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx"
        issue: "Component itself is correct (render gate at line 24: gameInfo.mac_arch !== '32' → null) — included only because it is the observable end-point that stays empty as a result of the backend gap."
    missing:
      - "In verifyMacArchGroundTruth, after persisting to steamMetadataStore, also update the in-memory library Map (library.set) and push the updated GameInfo to the frontend (sendFrontendMessage('pushGameToLibrary', updated))."
      - "In refresh(), seed mac_arch onto each constructed GameInfo from cachedMeta (mac_arch: cachedMeta?.mac_arch ?? 'unknown'), mirroring the existing is_mac_native/is_linux_native/is_delisted/steamPlatformsCaptured seeding."
      - "A regression test asserting mac_arch survives (a) a refresh() cycle when cachedMeta.mac_arch is '32', and (b) a verifyMacArchGroundTruth '32' verdict actually reaching the pushed GameInfo (mock sendFrontendMessage and assert the payload's mac_arch)."
---

# Phase 18: macOS 32-bit detection, badge & CrossOver routing — Verification Report

**Phase Goal:** Detect a Steam game's macOS build architecture and route 32-bit-only mac games to CrossOver/Wine instead of a native install that fails on modern macOS, surfacing the game's OS/arch as a badge beside the game logo in the left panel.
**Verified:** 2026-07-12T08:00:46Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GameInfo`/`SteamMetadataCacheEntry` carry a `mac_arch` signal (`'32'\|'64'\|'unknown'`) that is false-flag-safe | ✓ VERIFIED | `src/common/types.ts:226` (`mac_arch?: '32' \| '64' \| 'unknown'`); `src/backend/storeManagers/steam/electronStores.ts:58-68` (`mac_arch`/`mac_arch_verified`/`mac_arch_source` fields, `'minos' \| 'macho'` provenance enum) |
| 2 | MAC32-01: pre-install min-OS heuristic (`macArchFromMinOS`) never asserts `'32'` | ✓ VERIFIED | `src/backend/storeManagers/steam/games.ts:206-213` — return type is structurally `'64' \| 'unknown'`, no `'32'` member exists; `isCatalinaOrNewer ? '64' : 'unknown'` is the only branch |
| 3 | MAC32-02: on macOS, a confirmed-32-bit mac build routes install/launch/uninstall through the CrossOver/Wine bottle instead of native `steam://` | ✓ VERIFIED | `src/backend/storeManagers/steam/games.ts:606-618` — `isBottleEligible()` reads `steamMetadataStore` directly (`if (meta?.mac_arch === '32') return true`) as an independent OR-branch above the existing D-11 check; `isNative()`/`getSettings()`/`install()`/`launch()`/`uninstall()` all reuse `isBottleEligible()`, so this reads the persisted verdict regardless of the badge-propagation gap (Truth 5) |
| 4 | MAC32-03: post-install Mach-O check (`lipo`/`file`) is the sole ground truth that may ever assert `'32'`; inconclusive/missing tool output is never coerced to a verdict | ✓ VERIFIED (see Warnings) | `src/backend/storeManagers/steam/library.ts:505-540` — `machOArchsOf` returns `[]` on tool failure (never a verdict); `verdictFromArchs([])` returns `null`; `verifyMacArchGroundTruth` (596-643) is the only call site setting `mac_arch_verified:true`/`mac_arch:'32'`, gated on `source==='native' && isMac`, skips when already `'32'`/verified. `promptI386Recovery` (library.ts) confirms via `dialog.showMessageBox` before `forceUninstall()`+`install()`. Robustness caveats: REVIEW.md WR-01 (forceUninstall is in-memory-only, native ACF can re-mask the bottle install on next reconcile), WR-02 (`file` fallback matches arch substrings in the binary path, not just tool output), WR-04 (`locateMachOBinary` doc claims path-traversal containment it doesn't enforce), WR-06 (fire-and-forget `void verifyMacArchGroundTruth(...)` has no `.catch`) — all independently confirmed against the code, none of which invalidate the core "only Mach-O asserts 32-bit" invariant |
| 5 | MAC32-04: the "32" badge actually renders beside the game logo in the left panel for a game whose `mac_arch` was resolved to `'32'` | ✗ **FAILED** | `MacArchBadge.tsx` is correctly built, wired, styled, and tested (see Artifacts/Key Links below) — but the `mac_arch` verdict never reaches the `GameInfo` it receives in the realistic flow. See gap details above and CR-01 trace below. |

**Score:** 4/5 truths verified

### CR-01 Independent Trace (badge data-flow)

Traced end-to-end, independent of REVIEW.md's narrative, by reading the actual source:

1. **`verifyMacArchGroundTruth(appId, installPath, source)`** (`library.ts:596-643`) — the only function in the entire phase that ever writes `mac_arch: '32'`. Persists via `steamMetadataStore.set(appId, {...})` only (line 627). No `library.set(...)` call. No `sendFrontendMessage('pushGameToLibrary', ...)` call anywhere in the function body. **Confirmed: writes to disk cache only, never touches the in-memory library Map or the frontend.**
2. **`pollInstallOnce`'s `'installed'` branch** (`library.ts:947`) calls `void verifyMacArchGroundTruth(...)` as a fire-and-forget hook placed *after* the install-completion `GameInfo` push already fired — so even the initial post-install push cannot carry a same-tick verdict.
3. **`refresh()`** (`library.ts:188-299`), which runs at startup and on mid-session resync, rebuilds every `GameInfo` from `ownedApps` + `cachedMeta` (lines 246-285). It explicitly seeds `is_mac_native`, `is_linux_native`, `is_delisted`, `steamPlatformsCaptured` from `cachedMeta` — **`mac_arch` is absent from this object literal.** Confirmed by direct read of lines 246-285: no `mac_arch` key anywhere in the constructed `gameInfo`. Every full library sync silently drops a previously cached `'32'` verdict from the in-memory Map and the pushed `GameInfo`.
4. **`getGameInfo()`** (`games.ts:298-317`) returns the in-memory `library.get(appId)` synchronously, and only triggers the lazy `fetchMetadataIfNeeded` (the other path that *can* write `mac_arch` onto `GameInfo`, at `games.ts:415-422`/`462`) when `!existing.art_cover || platformsNeverCaptured`. For any game that has already had its artwork/platforms captured (true for essentially every already-installed game reaching a post-install Mach-O check), this guard is `false`, so the lazy fetch — and therefore the only remaining path that could re-seed `mac_arch` onto the in-memory `GameInfo` — never fires again.
5. **Frontend** (`GamePage/index.tsx:221-239`) calls `getGameInfo(appName, runner)` (IPC → the backend method traced in step 4) on mount and on `steam.library` changes, and feeds the result into `setGameInfo`, which is what `MacArchBadge` renders from (`index.tsx:497`). Since the backend method never returns a `GameInfo` carrying the Mach-O-resolved `mac_arch` (per steps 1-4), the frontend `gameInfo` state can never carry it either.

**Conclusion:** For the realistic end-to-end flow (install completes → Mach-O check flips `mac_arch` to `'32'` → user later opens/reopens the game page or the app restarts/resyncs), the badge does **not** render. `isBottleEligible()` (Truth 3) reads `steamMetadataStore` directly and is unaffected — CrossOver routing works even though the badge does not. This is a genuine, code-confirmed BLOCKER against the phase goal's "surfacing the game's OS/arch as a badge" clause and against MAC32-04.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/types.ts` | `GameInfo.mac_arch` optional field | ✓ VERIFIED | Line 226, false-flag-safe doc comment present |
| `src/backend/storeManagers/steam/electronStores.ts` | `mac_arch`/`mac_arch_verified`/`mac_arch_source` cache fields | ✓ VERIFIED | Lines 58-68, `'minos' \| 'macho'` provenance enum |
| `src/backend/storeManagers/steam/games.ts` | `parseSteamMacMinOSVersion`/`macArchFromMinOS`, inline derivation in `fetchMetadataIfNeeded`, `isBottleEligible` OR-branch | ✓ VERIFIED | Lines 143-213 (parser), 399-459 (derivation), 606-618 (routing) |
| `src/backend/storeManagers/steam/library.ts` | `machOArchsOf`/`verdictFromArchs`/`locateMachOBinary`/`verifyMacArchGroundTruth`/`promptI386Recovery`, `pollInstallOnce` hook | ✓ VERIFIED (exists, substantive, wired to `pollInstallOnce`) — ⚠️ **HOLLOW at Level 4**: `verifyMacArchGroundTruth`'s output never propagates to `GameInfo`/frontend | See CR-01 trace |
| `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx` | "32" badge, render-gated on `mac_arch === '32'`, host-OS-gated styling | ✓ VERIFIED (component-level: exists, substantive, wired) — ⚠️ **HOLLOW at Level 4**: the `gameInfo` prop it receives never carries a resolved `'32'` in the realistic flow | `MacArchBadge.tsx:21-43`; wired at `GamePage/index.tsx:497`; barrel-exported `components/index.tsx:17`; CSS at `index.css:170-195`; i18n key `public/locales/en/gamepage.json:3` |
| `__tests__/fixtures/appinfo-*.json` (4 files) | Real captured appinfo, no-osarch/false-flag evidence | ✓ VERIFIED | All 4 present, confirmed JSON-parseable |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `fetchMetadataIfNeeded` | `macArchFromMinOS` | `mac_arch = macArchFromMinOS(data.mac_requirements?.minimum)` gated on `is_mac_native` | ✓ WIRED | `games.ts:412` |
| `isBottleEligible()` | `steamMetadataStore.mac_arch` | `if (meta?.mac_arch === '32') return true` | ✓ WIRED | `games.ts:616` — routing works independent of the badge gap |
| `pollInstallOnce` `'installed'` branch | `verifyMacArchGroundTruth` | fire-and-forget, gated `isMac && source==='native'` | ✓ WIRED | `library.ts:947` |
| `verifyMacArchGroundTruth` `'32'` verdict | `promptI386Recovery` → `forceUninstall`/`install` | `dialog.showMessageBox` confirm → `forceUninstall()` → `install()` | ✓ WIRED (see WR-01 caveat) | `library.ts:638-641`, `promptI386Recovery` body |
| `GamePage/index.tsx` | `MacArchBadge` | rendered with `gameInfo`+`isMac` props beside `.store-icon` | ✓ WIRED (structurally) | `index.tsx:497` |
| `verifyMacArchGroundTruth` `'32'` verdict | `GameInfo.mac_arch` (frontend-visible) | **none found** | ✗ **NOT WIRED** | No `library.set`/`sendFrontendMessage` call in `verifyMacArchGroundTruth`; `refresh()` omits `mac_arch` when rebuilding `GameInfo` from `cachedMeta` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `MacArchBadge` | `gameInfo.mac_arch` | `GamePage`'s `gameInfo` state ← `getGameInfo(appName, runner)` IPC ← backend `SteamGame.getGameInfo()` ← in-memory `library` Map | Only immediately after a same-session lazy `fetchMetadataIfNeeded` fetch (first-ever fetch, before `art_cover`/`platformsCaptured` are set) — never after `verifyMacArchGroundTruth` resolves `'32'`, and never survives a `refresh()` cycle | ✗ **DISCONNECTED** for the realistic post-install-detection case |
| `isBottleEligible()` (CrossOver routing) | `meta.mac_arch` | `steamMetadataStore.get(appId)` — read directly from persisted cache, not through `GameInfo`/library Map | Yes — persisted by both `fetchMetadataIfNeeded` and `verifyMacArchGroundTruth` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `macArchFromMinOS` never returns `'32'` (type-level + logic) | manual code read, `games.ts:206-213` | Return type `'64' \| 'unknown'` | ✓ PASS |
| `verdictFromArchs`/`machOArchsOf` never coerce inconclusive to `'32'` | manual code read, `library.ts:505-540` | `[]` on tool failure → `verdictFromArchs([])` → `null` | ✓ PASS |
| `isBottleEligible()` `'32'` OR-branch reads persisted store directly | manual code read, `games.ts:606-618` | Confirmed independent of `GameInfo`/library Map | ✓ PASS |
| Full Steam + MacArchBadge test suite | `npx jest --testPathPattern="steam\|MacArchBadge"` | 12 suites passed, 360/360 tests passed (one known pre-existing leaked-interval trailing-stderr crash, documented in `deferred-items.md`, does not fail the suite) | ✓ PASS |
| `refresh()` seeds `mac_arch` from `cachedMeta` onto rebuilt `GameInfo` | manual code read, `library.ts:246-285` | `mac_arch` key absent from the constructed object literal | ✗ **FAIL** (confirms gap) |
| `verifyMacArchGroundTruth` pushes updated `GameInfo` to frontend | manual code read, `library.ts:596-643` | No `library.set`/`sendFrontendMessage` call found | ✗ **FAIL** (confirms gap) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MAC32-01 | 18-01, 18-02 | Read a Steam game's macOS arch signal, treat missing/blank as unknown never 32-bit | ✓ SATISFIED | Direction-B pivot documented and implemented: store-API min-OS heuristic (`macArchFromMinOS`) replaces the dead PICS `osarch` approach (18-01 proved no signal exists); never asserts `'32'` |
| MAC32-02 | 18-02 | Confirmed-32-bit mac game routes through the bottle for install/launch/uninstall | ✓ SATISFIED | `isBottleEligible()` OR-branch, reads `steamMetadataStore` directly — functions regardless of the badge gap |
| MAC32-03 | 18-03 | Post-install Mach-O ground truth re-routes an i386-only binary Steam failed to tag | ✓ SATISFIED (with WARNING-level robustness gaps: WR-01/WR-02/WR-04/WR-06 in REVIEW.md, independently confirmed) | `verifyMacArchGroundTruth`/`machOArchsOf`/`verdictFromArchs` correctly implement the ground-truth invariant; recovery flow works but WR-01's in-memory-only `forceUninstall()` can let native-wins reconciliation re-mask the bottle install later |
| MAC32-04 | 18-04 | Left-panel badge shows OS logo + "32" mark on 32-bit builds, actionable warning only on macOS host | ✗ **BLOCKED** | Component built and structurally wired correctly, but the resolved `mac_arch` verdict never reaches it end-to-end (CR-01) — the badge is unreachable for a real detected 32-bit game outside of the narrow same-session first-fetch window |

No orphaned requirements — all 4 IDs (MAC32-01 through MAC32-04) declared across the phase's plan frontmatter, matching REQUIREMENTS.md's phase-18 mapping exactly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `library.ts` | 627-632 | `verifyMacArchGroundTruth` writes only to `steamMetadataStore`, never `library`/frontend | 🛑 Blocker | Badge (MAC32-04) unreachable — see gap above |
| `library.ts` | 246-285 | `refresh()` omits `mac_arch` when rebuilding `GameInfo` from `cachedMeta` | 🛑 Blocker | Every startup/resync silently drops a cached `'32'` verdict from the frontend-visible `GameInfo` |
| `library.ts` | 694-701 | `forceUninstall()` is in-memory-only; native ACF/files are never actually removed | ⚠️ Warning | Dead native install leaks disk space; next reconcile can re-mask the bottle install as native (REVIEW.md WR-01) |
| `library.ts` | 513-522 | `file` fallback matches arch substrings against the full output including the file path, not just the tool's arch report | ⚠️ Warning | A path segment like `arm64/` can misclassify an i386-only binary as `'64'` (REVIEW.md WR-02) |
| `library.ts` | 550-557 | `locateMachOBinary` doc comment claims path-traversal containment via `join()` that isn't actually enforced | ⚠️ Warning | No live traversal today (no caller supplies `launchExecutable`), but the safety claim is false (REVIEW.md WR-04) |
| `library.ts` | 947-948 | `void verifyMacArchGroundTruth(...)` has no `.catch` | ⚠️ Warning | A rejection (steamMetadataStore write or dialog throw) surfaces as an unhandled promise rejection (REVIEW.md WR-06) |
| `games.ts` | 171-174 | `parseSteamMacMinOSVersion` stop-keyword list is incomplete (missing Hard Drive/DirectX/Shader/Sound) | ℹ️ Info | Can suppress a legitimate `'64'` verdict, never a false positive — missed-detection only (REVIEW.md WR-03) |
| `games.ts` | 249 | `getSteamInstallSize` store-API call has no timeout | ℹ️ Info | Unrelated to mac_arch correctness; pre-install size estimate can hang (REVIEW.md WR-05) |

No `TBD`/`FIXME`/`XXX` debt markers found in any of the phase's touched files.

### Human Verification Required

None captured as a separate section — status is `gaps_found`, which takes priority per the decision tree. The 18-04-SUMMARY.md deferred Task 3 (visual placement/styling UAT) is now moot until the CR-01 propagation gap is fixed, since a real `'32'`-flagged game cannot currently reach the badge in a built app outside the narrow first-fetch window. Re-run that visual UAT after the gap closure fix lands.

### Gaps Summary

The phase correctly builds every individual piece: the type contracts, the never-assert-32-pre-install heuristic, the Mach-O ground-truth check, the CrossOver bottle-routing OR-branch, and the `MacArchBadge` component itself (which passes its own isolated RTL tests and is correctly wired into `GamePage`). CrossOver/Wine routing (MAC32-02, MAC32-03) is real and functions independently, because `isBottleEligible()` reads `steamMetadataStore` directly.

But the phase's other headline deliverable — "surfacing the game's OS/arch as a badge beside the game logo" (MAC32-04) — is broken by a data-flow gap between where the `'32'` verdict is persisted (`steamMetadataStore`, backend-only) and where the badge reads it (`GameInfo.mac_arch`, frontend-visible, sourced from the in-memory `library` Map). Two independent code paths confirm this: `verifyMacArchGroundTruth()` never updates the library Map or pushes to the frontend, and `refresh()` never seeds `mac_arch` when rebuilding `GameInfo` from the cache. No test in the 360-test green suite exercises this propagation, so it shipped silently. This matches the code-review gate's CR-01 finding exactly, independently re-derived here by tracing the actual source.

**This looks unintentional** (a plan-execution gap, not a deliberate scope cut) — the SUMMARY.md documents zero known stubs and claims the badge "is ready to display the moment 18-02/18-03 populate `GameInfo.mac_arch === '32'`," which the trace above shows does not hold. Recommend closing via `/gsd:plan-phase 18 --gaps` rather than an override.

---

_Verified: 2026-07-12T08:00:46Z_
_Verifier: Claude (gsd-verifier)_
