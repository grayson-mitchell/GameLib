---
phase: 21-steam-native-install
plan: 03
subsystem: settings
tags: [react, useSetting, GlobalConfig, i18n, tdd, steam]

# Dependency graph
requires:
  - phase: 21-01
    provides: lzma decompress + crypto primitives (depot download foundation)
  - phase: 21-02
    provides: manifest.ts ACF writer (atomic-write pattern)
provides:
  - "EnableSteamNativeInstall.tsx — D-13 opt-in Settings toggle, default OFF, no OS gate"
  - "isSteamNativeInstallEnabled() — single backend read seam for the opt-in setting"
  - "enableSteamNativeInstall added to AppSettings type + GlobalConfigV0 factory defaults"
affects: [21-07 (install() branch point), 21-11 (bottle branch)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings toggle: useSetting + ToggleSwitch + InfoIcon (DownloadProtonToSteam.tsx shape)"
    - "Backend GlobalConfig read seam: GlobalConfig.get().getSettings().<key> ?? <default>, single chokepoint reused by all future consumers"

key-files:
  created:
    - src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx
    - src/backend/storeManagers/steam/nativeInstallSetting.ts
    - src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts
  modified:
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
    - public/locales/en/translation.json
    - src/common/types.ts
    - src/backend/config.ts

key-decisions:
  - "Toggle registered in GeneralSettings (next to DefaultSteamPath), not in WineManagerSettingsModal where DownloadProtonToSteam actually renders — that modal is Wine/Proton-scoped and unrelated to native Steam installs; GeneralSettings is the real global Settings screen the must_haves truth (\"A user can toggle ... in Settings\") refers to"
  - "Added enableSteamNativeInstall to AppSettings (common/types.ts) and GlobalConfigV0.getFactoryDefaults() (backend/config.ts) — required for useSetting's keyof AppSettings constraint to type-check; mirrors downloadProtonToSteam's own registration exactly"

patterns-established:
  - "D-13 opt-in setting is the single safety valve for the depot-download feature: default OFF everywhere (frontend toggle, backend factory default, and the accessor's own ?? false fallback) — three independent default-OFF layers, all covered by tests/tsc"

requirements-completed: [SNI-07]

# Metrics
duration: ~20min
completed: 2026-07-15
---

# Phase 21 Plan 03: D-13 Opt-in Setting Summary

**Settings toggle + `isSteamNativeInstallEnabled()` backend accessor for the D-13 opt-in — default OFF, no OS gate, TDD-covered.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-15T10:11:38Z
- **Completed:** 2026-07-15T10:17:24Z
- **Tasks:** 2 completed (Task 2 followed TDD RED→GREEN)
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments
- `EnableSteamNativeInstall.tsx` — a Settings toggle titled "Download Steam games directly in GameLib", default OFF, with D-13 risk-framing `InfoIcon` copy, no platform gate (D-12)
- `isSteamNativeInstallEnabled()` — the single backend read seam for the `enableSteamNativeInstall` GlobalConfig key, default-OFF-tested via TDD (3 test cases: unset, explicit true, explicit false)
- `enableSteamNativeInstall` registered end-to-end: `AppSettings` type, `GlobalConfigV0` factory defaults, frontend `useSetting`, backend accessor, en-locale copy — all consistent and default-false

## Task Commits

Each task was committed atomically:

1. **Task 1: D-13 opt-in toggle component + i18n** - `2fb34ea9` (feat)
2. **Task 2: Single backend accessor for the opt-in setting** - `f392e6f3` (test, RED) → `7df057dc` (feat, GREEN)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx` - D-13 opt-in toggle (useSetting + ToggleSwitch + InfoIcon)
- `src/frontend/screens/Settings/components/index.ts` - barrel export for the new component
- `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx` - renders the toggle next to DefaultSteamPath
- `public/locales/en/translation.json` - `setting.steam-native-install` + `help.steam_native_install` keys
- `src/common/types.ts` - `enableSteamNativeInstall: boolean` added to `AppSettings`
- `src/backend/config.ts` - `enableSteamNativeInstall: false` added to `GlobalConfigV0.getFactoryDefaults()`
- `src/backend/storeManagers/steam/nativeInstallSetting.ts` - `isSteamNativeInstallEnabled()` single read seam
- `src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts` - default-OFF/true/false unit tests

## Decisions Made
- Placed the toggle in `GeneralSettings` (the actual global Settings > General tab, alongside `DefaultSteamPath`) rather than literally where `DownloadProtonToSteam` renders (`WineManagerSettingsModal`, a Wine/Proton-download-location dialog unrelated to native Steam installs). The plan's `must_haves` truth says "A user can toggle ... in Settings" — `WineManagerSettingsModal` is a separate Wine Manager screen, not the Settings screen, so this placement better satisfies the plan's actual intent while still copying `DownloadProtonToSteam.tsx`'s exact component shape as instructed.
- Extended `AppSettings` (common/types.ts) and `GlobalConfigV0`'s factory defaults (backend/config.ts) with the new key — not explicitly listed in the plan's `files_modified`, but required for `useSetting('enableSteamNativeInstall', false)` to type-check against `keyof AppSettings`, and for the backend accessor's `GlobalConfig.get().getSettings().enableSteamNativeInstall` to compile. Mirrors `downloadProtonToSteam`'s own two-line registration exactly (Rule 3 — blocking type error).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `enableSteamNativeInstall` key on `AppSettings`**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `useSetting('enableSteamNativeInstall', false)` failed to compile — `'enableSteamNativeInstall'` was not assignable to `keyof AppSettings` since the plan's `files_modified` list didn't include the type definition or config defaults files.
- **Fix:** Added `enableSteamNativeInstall: boolean` to `AppSettings` in `src/common/types.ts`, and `enableSteamNativeInstall: false` to `GlobalConfigV0.getFactoryDefaults()` in `src/backend/config.ts` — identical two-site registration pattern `downloadProtonToSteam` already uses.
- **Files modified:** `src/common/types.ts`, `src/backend/config.ts`
- **Verification:** `npx tsc --noEmit` clean; full test suite 1228/1228 passing.
- **Committed in:** `2fb34ea9` (Task 1 commit)

**2. [Rule 2 - placement clarification, not a bug] Toggle registered in GeneralSettings instead of WineManagerSettingsModal**
- **Found during:** Task 1 action (locating where to register the component)
- **Issue:** The plan instructed placing the toggle "in the same Settings section where DownloadProtonToSteam renders" — but `DownloadProtonToSteam` only renders inside `WineManagerSettingsModal.tsx`, a Wine Manager dialog for GE-Proton download location, not the app's actual Settings screen. Placing a Steam-native-install feature flag there would be semantically confusing and hard for users to find, contradicting the plan's own must_haves truth ("A user can toggle ... in Settings").
- **Fix:** Registered in `GeneralSettings/index.tsx` (the real Settings > General tab) next to `DefaultSteamPath`, matching where other Steam-related and opt-in toggles (e.g. `NotifyHumbleExpirations`) already live. Component shape (useSetting + ToggleSwitch + InfoIcon) still copies `DownloadProtonToSteam.tsx` exactly, per the plan's interface instruction.
- **Files modified:** `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx`
- **Verification:** tsc clean, eslint clean, component renders via the same `SettingsContext`/`isDefault` gate as all its GeneralSettings siblings.
- **Committed in:** `2fb34ea9` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking type fix, 1 placement clarification)
**Impact on plan:** Both necessary for the toggle to compile and to be discoverable in the actual Settings UI. No scope creep — no depot-download logic touched (that's Plan 07/11's job).

## Issues Encountered
- The literal acceptance-criteria grep `grep -c "useSetting('enableSteamNativeInstall'" ... returns 1` does not match after Prettier reformats the multi-line `useSetting(...)` call across two lines (confirmed the same is true of the existing `DownloadProtonToSteam.tsx` analog: `grep -c "useSetting('downloadProtonToSteam'" ...` also returns 0). Prettier's formatting is enforced by the pre-push hook and takes precedence over the literal grep wording. Verified the key linkage instead via `npx tsc --noEmit` (which would fail if the string didn't match a valid `AppSettings` key) and `grep -c "'enableSteamNativeInstall'"` (returns 1).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `isSteamNativeInstallEnabled()` is ready for Plan 07 (`SteamGame.install()` branch point) and Plan 11 (bottle branch) to import and consult before running the depot-download path.
- Default-OFF is verified at three independent layers (frontend `useSetting` default, backend factory default, accessor's `?? false` fallback) — today's `steam://install` behavior is unchanged until a user explicitly opts in.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*
