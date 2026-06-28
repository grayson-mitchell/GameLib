---
slug: steam-gamepage-info-error
status: resolved
trigger: Opening any Steam game's page throws "Cannot get game info"
created: 2026-06-28
updated: 2026-06-28
resolved: 2026-06-28
fix_commit: f49ac36
human_verified: true
---

# Debug: Steam GamePage "Cannot get game info"

## Symptoms

- **Expected behavior:** Opening a Steam game's page (clicking a Steam game in the library) renders the game page normally.
- **Actual behavior:** The page throws and renders ErrorComponent showing "Cannot get game info".
- **Error message:** `Error: Cannot get game info`
- **Timeline:** Surfaced during Phase 2 (Steam Library) manual QA gate 02-06. Steam library sync itself works (373 games synced); only the per-game GamePage view breaks.
- **Reproduction:** Open any Steam game's detail page.

## Initial Trace (from orchestrator)

- `src/frontend/screens/Game/GamePage/index.tsx` ~line 226: inside a `getInstallInfo(appName, runner, installPlatform).then(info => { if (!info) throw new Error('Cannot get game info') })` block.
- `getInstallInfo` legitimately returns null/undefined for `runner === 'steam'` — Steam has no install-info provider (Steam games install/launch via the `steam://` protocol, not gogdl/legendary/nile).
- The `.then()` runs only when: `runner !== 'sideload' && !notSupportedGame && !notInstallable && !thirdPartyManagedApp && !isOffline`. Steam is not excluded by any of these guards.
- Hypothesis: GamePage should skip the `getInstallInfo` call for `runner === 'steam'` (analogous to sideload / third-party-managed exclusion), or otherwise treat a null result for Steam as non-fatal.

## Current Focus

hypothesis: "GamePage's updateConfig effect calls getInstallInfo for Steam games, which always returns undefined (by design — Steam games install via steam:// protocol). The !info check throws 'Cannot get game info', caught and sets hasError:true, causing <ErrorComponent>."

reasoning_checkpoint:
  hypothesis: "runner === 'steam' causes getInstallInfo to be called; steam.getInstallInfo() always returns undefined; the !info guard throws 'Cannot get game info'; the catch handler sets hasError:true; ErrorComponent renders."
  confirming_evidence:
    - "src/backend/storeManagers/steam/library.ts lines 197-208: getInstallInfo() explicitly returns undefined for all appNames — no implementation, by design."
    - "GamePage/index.tsx lines 217-222: guard excludes sideload and thirdPartyManagedApp but NOT steam — getInstallInfo is called for steam."
    - "GamePage/index.tsx line 225: if (!info) throw new Error('Cannot get game info') — undefined is falsy, throws."
    - "GamePage/index.tsx lines 238-242: catch sets hasError:{error:true, message:'Error: Cannot get game info'} → <ErrorComponent message='Error: Cannot get game info' />."
  falsification_test: "If adding runner !== 'steam' to the guard has no effect, the crash persists; if the crash disappears after excluding steam from the guard, hypothesis is confirmed."
  fix_rationale: "Adding runner !== 'steam' to the guard mirrors the existing runner !== 'sideload' pattern. Steam games use the steam:// protocol — they don't need install-info from GamerLib. Skipping the call leaves gameInstallInfo null; DownloadSizeInfo and InstalledInfo handle null gracefully (DownloadSizeInfo returns null for is_installed games, and uses optional chaining on manifest fields; InstalledInfo reads from gameInfo.install.* not gameInstallInfo)."
  blind_spots: "DownloadSizeInfo would show 'Getting download size...' indefinitely for uninstalled Steam games — add runner === 'steam' guard there too. requestGameSettings is in a separate try/catch and doesn't depend on gameInstallInfo."

next_action: "Apply fix: add runner !== 'steam' to guard in GamePage/index.tsx line 217; add runner === 'steam' early-return in DownloadSizeInfo.tsx; run tsc --noEmit and jest steam suite."

## Evidence

- timestamp: 2026-06-28 — Steam library sync logs "fetched 373 owned games / sync complete", so backend library path is healthy; failure is isolated to GamePage install-info.
- timestamp: 2026-06-28 — src/backend/storeManagers/steam/library.ts:197-208: getInstallInfo() returns undefined unconditionally. Steam games launch via steam:// protocol, not via gogdl/legendary/nile — no install-info is needed or available.
- timestamp: 2026-06-28 — GamePage/index.tsx:217-222: guard condition is runner !== 'sideload' && !notSupportedGame && !notInstallable && !thirdPartyManagedApp && !isOffline — steam is not excluded.
- timestamp: 2026-06-28 — DownloadSizeInfo.tsx: uses optional chaining on gameInstallInfo?.manifest?.* so null is safe, but for uninstalled Steam games it would show "Getting download size..." indefinitely. Adding runner === 'steam' guard (return null) is cleaner.
- timestamp: 2026-06-28 — InstalledInfo.tsx: reads install path/size/version from gameInfo.install.* directly, not from gameInstallInfo. No change needed there.
- timestamp: 2026-06-28 — MainButton.tsx: uses gameInfo.is_installed only, not gameInstallInfo. Play/install buttons work independently of the fix.

## Eliminated

(none — single confirmed hypothesis)

## Resolution

root_cause: "GamePage/index.tsx calls getInstallInfo for runner === 'steam', which returns undefined by design (Steam games use steam:// protocol). The guard excludes sideload and thirdPartyManagedApp but not steam. The !info throw + catch sets hasError:true → ErrorComponent renders."
fix: "Add runner !== 'steam' to the updateConfig guard in GamePage/index.tsx (line 217). Add runner === 'steam' early-return null in DownloadSizeInfo.tsx (after the sideload guard) to prevent indefinite 'Getting download size...' for uninstalled Steam games."
verification: "tsc --noEmit: clean (zero errors). npx jest --testPathPattern=steam: 73 passed, 6 suites, 0 failures. Manual verification pending."
files_changed:
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx
