---
phase: 18-macos-32-bit-detection-badge-crossover-routing
plan: 03
subsystem: steam
tags: [mac-arch, mach-o, lipo, bottle-routing, isBottleEligible, i386-recovery]

# Dependency graph
requires:
  - phase: 18-02
    provides: mac_arch/mac_arch_verified/mac_arch_source cache shape on SteamMetadataCacheEntry, isBottleEligible() mac_arch==='32' OR-branch (dormant until this plan caches a '32' verdict)
  - phase: 17-steam-on-macos-via-crossover
    provides: forceUninstall()/install() bottle routing, tellBottledSteamToInstall, isBottleReady()
provides:
  - machOArchsOf / verdictFromArchs / locateMachOBinary — Mach-O classification primitives (library.ts)
  - verifyMacArchGroundTruth(appId, installPath, source) — post-install correctness backstop, the only path that ever asserts mac_arch:'32'
  - pollInstallOnce 'installed' branch fire-and-forget hook (isMac && source==='native')
  - promptI386Recovery(appId) — user-consented forceUninstall + bottle reinstall (CONTEXT D-6)
affects: [18-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "argv-form execFileSync (command + array, never shell-interpolated) for lipo/file, mirroring windowsRunningAppId/linuxFallbackRunningAppId"
    - "false-flag-safe verdict chain: empty/inconclusive subprocess output -> null, never coerced to '32', at every boundary (machOArchsOf -> verdictFromArchs -> verifyMacArchGroundTruth)"
    - "fire-and-forget post-install hook placed AFTER the badge-flip/notify in pollInstallOnce so it never delays the install-completion UX"
    - "dialog.showMessageBox (Electron native, backend-awaited) for a confirm-then-act flow the backend needs a real response from — NOT showDialogBoxModalAuto, whose onClick callbacks cannot cross the IPC structured-clone boundary"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "Used Electron's native dialog.showMessageBox instead of the plan-suggested showDialogBoxModalAuto for the i386 recovery confirm. showDialogBoxModalAuto's buttons[].onClick callbacks are sent from the main process to the renderer via sendFrontendMessage -> webContents.send, which uses the structured-clone algorithm — functions cannot cross that boundary, so a confirm decision could never round-trip back into promptI386Recovery's async flow. dialog.showMessageBox is this codebase's only established backend-AWAITED confirm primitive (legendary/eos_overlay.ts's remove()/enable() is the existing precedent) and was used instead."
  - "games.ts was left unmodified for Task 3 — forceUninstall() and install() are reused directly and unchanged, exactly as the plan's own <action> text specifies ('reuse directly, do not reimplement'). The entire recovery flow (promptI386Recovery) lives in library.ts alongside verifyMacArchGroundTruth, since library.ts already imports SteamGame for getGame()."
  - "verifyMacArchGroundTruth's 'wasThirtyTwo' distinction from the plan's <behavior> text was simplified away: the function's own top-of-function skip gate already returns early whenever mac_arch is already '32', so by the time the persist step runs, the verdict can only be transitioning INTO '32' (never already there) — a separate flip-detection flag was unnecessary."

patterns-established:
  - "Mach-O ground truth is the ONLY code path in this phase (and the only one that will ever exist, per the phase's design) permitted to assert mac_arch:'32' — every other signal (min-OS heuristic from 18-02, an absent/inconclusive subprocess result) must resolve to 'unknown'/null, never '32'"
  - "Post-install, fire-and-forget correctness backstops belong at the END of their pollInstallOnce/poll-callback branch, after any user-facing badge-flip/notify calls, so a slow or failing check can never delay the primary UX"

requirements-completed: [MAC32-03]

# Metrics
duration: ~50min
completed: 2026-07-12
---

# Phase 18 Plan 03: Post-Install Mach-O Ground Truth & i386 Recovery Summary

**Added a post-install `lipo -archs`/`file`-fallback Mach-O binary inspector (`machOArchsOf`/`verdictFromArchs`/`locateMachOBinary`) that runs as a fire-and-forget hook after every native macOS install, correcting Steam's un-tagged/false-negative mac-arch signal — and, when it flips a game to confirmed 32-bit, prompts the user (Electron native `dialog.showMessageBox`, not the IPC-bound `showDialogBoxModalAuto`) before force-uninstalling the dead native copy and reinstalling through the CrossOver bottle.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-12
- **Tasks:** 3 (all auto/tdd)
- **Files modified:** 3 (`library.ts`, `library.test.ts`, `games.test.ts`) — no new files; `games.ts` deliberately left untouched (see Deviations)

## Accomplishments

- `machOArchsOf(binaryPath)` runs `lipo -archs` argv-form (`execFileSync('lipo', ['-archs', binaryPath], ...)` — command + array, never a shell-interpolated string), falls back to `file` when `lipo` throws, and returns `[]` (inconclusive) when both tools fail — never a 32-bit verdict from a missing tool.
- `verdictFromArchs(archs)` maps an arch list to `'32' | '64' | null`: any `x86_64`/`arm64` present wins (`'64'`, a universal binary is runnable) even alongside `i386`; empty input is `null` (inconclusive), structurally never coerced to `'32'`.
- `locateMachOBinary(installPath, launchExecutable?)` prefers a supplied launch executable, else scans `installPath` for a top-level `*.app` bundle and returns its `Contents/MacOS/<first bin>`; bounded to `installPath`'s own subtree via `join()`, never throws, returns `null` on any miss.
- `verifyMacArchGroundTruth(appId, installPath, source)` is the correctness backstop — the ONLY code path in this phase that may ever assert `mac_arch === '32'`. Skip-gates on `source !== 'native'`, `!isMac`, `mac_arch` already `'32'`, and `mac_arch_verified` already `true`. A definitive verdict is persisted with `mac_arch_source:'macho'`/`mac_arch_verified:true`, spreading the existing `steamMetadataStore` entry so art/extra fields are never lost. An inconclusive result is a no-op — it never overwrites the existing hint.
- Wired fire-and-forget into `pollInstallOnce`'s `'installed'` branch, placed AFTER the badge-flip/`notify()` calls so the check can never delay the install-completion UX, gated on `isMac && source === 'native'`.
- `promptI386Recovery(appId)` presents a native Electron `dialog.showMessageBox` confirm ("Reinstall via CrossOver" / "Cancel") when the verdict flips to `'32'`. On confirm: `forceUninstall()`s the dead native copy, then `install()`s — which now routes through the bottle because `isBottleEligible()` (from 18-02) honors the freshly-cached `mac_arch:'32'` verdict. On cancel: neither is called; the `'32'` verdict (already persisted by `verifyMacArchGroundTruth` before the prompt ever fires) stays cached either way.
- 24 new unit tests across `library.test.ts` (classification primitives + `verifyMacArchGroundTruth` skip-gates/persistence/dialog-trigger) and `games.test.ts` (confirm/cancel recovery paths), all green; full `steam` suite is 353/353 passing (`npm test -- --testPathPattern=steam` exits 0).

## Task Commits

1. **Task 1: machOArchsOf / verdictFromArchs / locateMachOBinary (MAC32-03)** — `7b8acbeb` (feat)
2. **Task 2: verifyMacArchGroundTruth + pollInstallOnce hook (MAC32-03)** — `5b1babb9` (feat)
3. **Task 3: i386 recovery — prompt, force-uninstall, bottle re-install (MAC32-03, CONTEXT D-6)** — `f777c529` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/library.ts` — added `machOArchsOf`, `verdictFromArchs`, `locateMachOBinary`, `verifyMacArchGroundTruth`, `promptI386Recovery`; hooked `verifyMacArchGroundTruth` into `pollInstallOnce`'s `'installed'` branch (fire-and-forget, `isMac && source==='native'` gated); added `InstallArgs` and `dialog` (from `'electron'`) imports.
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — new `describe` blocks for `machOArchsOf()`, `verdictFromArchs()`, `locateMachOBinary()`, `verifyMacArchGroundTruth()`; added an `electron` mock (`dialog.showMessageBox` + `app.getPath`) and a `flushAsync` helper for the fire-and-forget dialog-trigger test.
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — new `describe('promptI386Recovery() — MAC32-03 i386 recovery (CONTEXT D-6)')` with confirm/cancel tests; added `dialog.showMessageBox` to the existing `electron` mock factory.

## Decisions Made

See `key-decisions` in frontmatter. Both are documented in full below under Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used `dialog.showMessageBox` instead of `showDialogBoxModalAuto` for the i386 recovery confirm dialog**

- **Found during:** Task 3, while implementing `promptI386Recovery`.
- **Issue:** The plan's `<action>` text and 18-PATTERNS.md both point to `showDialogBoxModalAuto` (already mocked in both test files) as "the established confirm surface." Tracing its implementation (`src/backend/dialog/dialog.ts`) showed it sends `buttons[].onClick` callbacks to the renderer via `sendFrontendMessage('showDialog', ...)` → `mainWindow.webContents.send(...)`, which serializes arguments with Electron's structured-clone algorithm. Function values cannot cross that boundary — a confirm decision made by clicking a button in the renderer's `DialogHandler`/`MessageBoxModal` can never call back into the main-process `onClick` closure, so `promptI386Recovery`'s `async` flow (which needs to `await` a real yes/no answer before deciding whether to `forceUninstall()`+`install()`) could never actually receive it. Every existing `showDialogBoxModalAuto` call site in the codebase is single-button (`box.ok`) or fire-and-forget notification-style — this phase would have been the first attempt to use it for a backend-awaited two-way confirm, and it does not support that.
- **Fix:** Used Electron's native `dialog.showMessageBox({ title, message, buttons, ... })`, which is `await`-able and returns `{ response }` synchronously within the main process (no IPC round-trip, no serialization boundary). This is not a novel pattern — it's the codebase's existing, established primitive for exactly this class of problem (`legendary/eos_overlay.ts`'s `remove()`/`enable()`, `backend/updater.ts`, `backend/protocol.ts`, `backend/utils.ts` all use it identically).
- **Files modified:** `src/backend/storeManagers/steam/library.ts` (`promptI386Recovery`), `src/backend/storeManagers/steam/__tests__/library.test.ts` and `__tests__/games.test.ts` (added `dialog.showMessageBox` to the `electron` mock factories instead of relying on the pre-existing `showDialogBoxModalAuto` mock).
- **Verification:** `promptI386Recovery`'s confirm/cancel tests in `games.test.ts` assert `dialog.showMessageBox` is called and its resolved `response` correctly gates `forceUninstall()`/`install()`; the acceptance criterion's grep (`showDialogBoxModalAuto\|forceUninstall`) still passes via the `forceUninstall` alternative — the prompt (line 671) still precedes `forceUninstall()` (line 699) in `library.ts`, satisfying the "never silent" intent the grep was checking for.
- **Commit:** `f777c529`.

**2. [File-list variance, not a rule violation] `games.ts` was not modified for Task 3**

- **Found during:** Task 3 planning.
- **Issue:** The plan's frontmatter lists `src/backend/storeManagers/steam/games.ts` as a file Task 3 modifies, but the plan's own `<action>` text says to "reuse directly, do not reimplement" `forceUninstall()`/`install()`. Since `library.ts` already imports `SteamGame` (for `getGame()`), and 18-PATTERNS.md itself hedges the location as "library.ts (or games.ts, wherever the recovery lives)," no code change to `games.ts` was actually required.
- **Fix:** N/A — no fix needed. `promptI386Recovery` constructs `new SteamGame(appId)` and calls its existing, unmodified `forceUninstall()`/`install()` methods.
- **Files modified:** None (deliberately).
- **Verification:** `games.test.ts`'s new tests exercise the real (unmodified) `SteamGame.forceUninstall()`/`install()` via `libraryModule.promptI386Recovery()`, confirming the reuse works end-to-end without any games.ts change.

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in the plan's own reference guidance) + 1 file-list variance (no code change, self-explanatory from the plan's own text).
**Impact on plan:** The showDialogBoxModalAuto→dialog.showMessageBox fix is necessary for the recovery flow to function at all (an IPC-serialized onClick would silently never fire, meaning "confirm" would never actually trigger the reinstall — a functional bug, not a style preference). No scope creep; all of Task 3's stated behaviors and acceptance criteria are met.

## Known Stubs

None — this plan is backend-only; no UI stub surface. Plan 18-04 (badge) is a separate concern already summarized independently.

## Threat Flags

None. All threat-model dispositions from the plan match the implementation:
- T-18-03-01 (command injection via lipo/file): mitigated — argv-form `execFileSync` throughout, `grep -c "exec("` confirms no bare `exec()` was introduced.
- T-18-03-02 (destructive misroute — forceUninstall without consent): mitigated — `promptI386Recovery` always calls `dialog.showMessageBox` and checks `response === 0` BEFORE any `forceUninstall()`/`install()` call; verified by the cancel-path test (`neither invoked, mac_arch 32 stays cached`).
- T-18-03-03 (false 32-bit from empty/failed tool output): mitigated — `verdictFromArchs([])` returns `null`, never `'32'`; `verifyMacArchGroundTruth` treats a `null` verdict as a no-op, explicitly tested.
- T-18-03-04 (wrong-target inspection): mitigated — `locateMachOBinary` is bounded to `installPath`'s own subtree via `join()`, returns `null` (never throws) on any miss.
- T-18-03-SC (package installs): N/A — `child_process` and `electron`'s `dialog` are both built-ins; no packages installed.

## Issues Encountered

- A pre-existing (unrelated to this plan) leaked-`setInterval` test-teardown bug was discovered while validating the isolated-file test run of `games.test.ts` (`Jest did not exit... TypeError: Cannot read properties of undefined (reading 'map')` from a real `startInstallPolling()` interval firing after the suite completes, in the unrelated `SteamGame.install() ensurePlatformsCaptured() — Phase 17 Plan 09` describe block's "native-Mac game routes native after capture" test, which never mocks `startInstallPolling`). Reproduced identically against `library.ts` at commit `6dedc8d9` (pre-Phase-18-03), confirming it predates this plan. Does NOT affect the plan's actual verification command — `npm test -- --testPathPattern=steam` (multi-suite run) exits 0 with 353/353 passing; the crash only surfaces as noisy trailing stderr when a single test file is run in isolation. Logged to `.planning/phases/18-macos-32-bit-detection-badge-crossover-routing/deferred-items.md` per the SCOPE BOUNDARY rule — not fixed (out of scope for this plan's task changes).

## Next Phase Readiness

- Plan 18-04 (badge, already summarized per the phase directory) can read `GameInfo.mac_arch`/`mac_arch_verified` directly — this plan's Mach-O ground truth is the definitive, final source of a `'32'` verdict; no further backend plumbing required for the badge to reflect reality once a game has been through a post-install check.
- The `mac_arch_source: 'minos' | 'macho'` provenance field (18-02) is now actually populated with `'macho'` values at runtime by this plan, ready for the Phase 19 crowd-sourcing export consideration noted in ROADMAP.md.
- The pre-existing leaked-interval test issue (see Issues Encountered) is a good candidate for a future `/gsd-quick` housekeeping pass — flagged in `deferred-items.md`, not blocking.

## Self-Check: PASSED

- `src/backend/storeManagers/steam/library.ts` — FOUND, contains `machOArchsOf`, `verdictFromArchs`, `locateMachOBinary`, `verifyMacArchGroundTruth`, `promptI386Recovery`, and the `pollInstallOnce` hook (`grep -n "verifyMacArchGroundTruth"` confirms the fire-and-forget call site).
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — FOUND, 105 tests passing (up from 83 baseline).
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — FOUND, 120 tests passing (up from 118 baseline).
- `.planning/phases/18-macos-32-bit-detection-badge-crossover-routing/deferred-items.md` — FOUND.
- Commit `7b8acbeb` — FOUND in git log.
- Commit `5b1babb9` — FOUND in git log.
- Commit `f777c529` — FOUND in git log.
- `npx tsc --noEmit` (via `npm run codecheck`) — exits 0 (clean).
- `npx eslint` on all four touched files — 0 errors, 427 pre-existing-pattern warnings (consistent with the rest of the file's `any`-typed VDF-parse handling).
- `npm test -- --testPathPattern=steam` — exits 0, 353/353 tests passing (11/11 suites).

---
*Phase: 18-macos-32-bit-detection-badge-crossover-routing*
*Completed: 2026-07-12*
