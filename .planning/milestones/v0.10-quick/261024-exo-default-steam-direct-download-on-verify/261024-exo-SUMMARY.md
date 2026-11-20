---
phase: quick-261024-exo
plan: 01
status: complete
requirements:
  - TODO-2026-10-22-steam-direct-download-default-on-and-verify-arch-after-delegated-install
commits:
  - 934ae58b8
  - ff50f6747
  - 27837977c
---

# Quick 261024-exo Summary

Steam direct download now defaults ON; a Steam-client-delegated install keeps its poll alive through a real Steam startup and download, and runs the Apple-silicon Mach-O arch check (i386 recovery offer) on completion.

## Decision (verbatim)

The factory default becomes true. Unset/absent key -> ON (fresh profiles, and pre-key profiles that were never flushed). A persisted false is ALWAYS respected: because load()/resetToDefaults() and every setSetting() flush the whole config, profiles created while the factory default was false carry an explicit false that cannot be told apart from a user's choice, so they stay OFF until the user flips the toggle once. No migration, no new marker key (a migration would override real user choices).

## Tasks

1. `934ae58b8` Default `enableSteamNativeInstall` to true (config.ts factory default, `nativeInstallSetting.ts` fallback, renderer `useSetting` fallback). New `steamNativeInstallDefault.test.ts` pins fresh/unset/explicit-false/restart persistence.
2. `ff50f6747` `delegatedToSteamClient` poll option. Delegated polls skip the 20-tick grace; they stop on installed, 600 ticks (~30 min) with no manifest, 10 consecutive absent ticks after a manifest was seen, or MAX_TICKS. Both OFF-path call sites in games.ts pass the flag. Tests D1-D3 plus updated games.test.ts assertions.
3. `27837977c` `refreshInstallState()` runs `verifyMacArchGroundTruth` for a native false->true flip when no poll is active (no double prompt). Tests E1-E4.

## Verification

- `npx jest src/backend/storeManagers/steam/__tests__ + steamNativeInstallDefault + settingsFlows + installFlows`: 46 suites, 1838 tests passed.
- Task 1 suites (nativeInstallSetting, steamNativeInstallDefault, settingsFlows, installFlows, dismissedSignInNoticesSetting): 5 suites, 58 tests passed.
- `pnpm codecheck`: clean.
- `npx prettier --check` clean on all touched files (all non-ignored).
- eslint over touched source: 0 errors (pre-existing warnings only).

## Deviations from Plan

- E1/E3/E4 helper uses a microtask flush instead of the file's `flushAsync()` (setImmediate), because these tests run under fake timers where setImmediate never fires. Test-only; no behavior change.
- No code change to the pollInstallOnce `installed` branch gating was needed: E1 confirmed the delegated path already reaches `verifyMacArchGroundTruth` (the HOARD miss was the poll dying at 60 s).

## Deferred (out of scope per plan)

- "Stale nonAvailableGames entry" log noise (`Library: 1 owned Steam game(s) silently excluded ... 63000`).
- Arch check for a delegated install that completes while GameLib is not running (on next launch `refresh()` sets is_installed directly, so no flip is seen; a boot-time Mach-O sweep is new boot work under the sidecar exit contract and needs its own decision).
- Existing profiles with an explicit persisted `enableSteamNativeInstall: false` (all profiles created since the key existed) stay OFF until the user toggles it.

## Known Stubs

None.

## Self-Check: PASSED
