---
phase: quick-260710-kba
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
autonomous: true
requirements: [KBA-FMT]

must_haves:
  truths:
    - "An installed Steam game's Install Info panel shows a human-readable size (e.g. ~19.2 GiB), never raw bytes"
    - "Steam's persisted GameInfo.install.install_size is a formatted string, matching legendary/gog/nile"
    - "getSteamInstallSize returns the already-formatted install_size directly for installed games, without calling axios"
    - "The steam games test suite passes and pnpm codecheck passes"
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "Formatted install_size persisted at both install-object construction sites"
      contains: "getFileSize(Number(installedData.sizeOnDisk))"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "Fast path returns formatted install_size directly"
    - path: "src/backend/storeManagers/steam/__tests__/games.test.ts"
      provides: "LIB-06 fast-path test updated to formatted-string contract"
  key_links:
    - from: "src/backend/storeManagers/steam/library.ts"
      to: "backend/utils getFileSize"
      via: "import from 'backend/utils'"
      pattern: "getFileSize"
---

<objective>
Fix Steam install size rendering as raw bytes in the game Install Info panel. Steam is the only store that persists `GameInfo.install.install_size` as a raw byte string (straight from the ACF `sizeOnDisk`); every other store persists a `getFileSize(...)`-formatted string. The shared `InstalledInfo.tsx` component renders the value verbatim, so Steam shows e.g. `20622023528` instead of `~19.2 GiB`.

Purpose: Make Steam conform to the formatted-string contract used by legendary/gog/nile, so the shared display component renders correctly with no frontend changes.
Output: Formatted install sizes persisted for Steam games; `getSteamInstallSize` fast path updated to match; test fixture updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- getFileSize is exported from backend/utils. Steam's sizeOnDisk is a string. -->
<!-- Legendary reference (src/backend/storeManagers/legendary/library.ts:594): -->
<!--   const convertedSize = install_size ? getFileSize(Number(install_size)) : '0' -->
<!-- Steam library.ts already imports from 'backend/utils' (line 16): -->
<!--   import { getSteamLibraries } from 'backend/utils' -->
<!-- Add getFileSize to that existing import. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Persist formatted install_size and fix the games.ts fast path</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts</files>
  <action>
In `src/backend/storeManagers/steam/library.ts`:
  - Add `getFileSize` to the existing `import { getSteamLibraries } from 'backend/utils'` (line 16) → `import { getSteamLibraries, getFileSize } from 'backend/utils'`.
  - At the `refresh()` install-object site (~line 215) change `install_size: installedData.sizeOnDisk` → `install_size: getFileSize(Number(installedData.sizeOnDisk))`.
  - At the `refreshInstallState()` install-object site (~line 335) apply the identical change.
  - Use `getFileSize(Number(...))` (not parseInt) to match legendary's pattern, since `sizeOnDisk` is a string.

In `src/backend/storeManagers/steam/games.ts`:
  - `getSteamInstallSize` fast path (~lines 96-98) currently does `parseInt(gameInfo.install.install_size, 10)` then `getFileSize(bytes)`. Since `install_size` is now already a formatted string, parseInt would mangle it ("15.00 GiB" → 15 → "15 B"). Change the fast path to return `gameInfo.install.install_size` directly when `gameInfo?.is_installed && gameInfo?.install?.install_size` is truthy. Leave the non-numeric appId guard and the pre-install store-API estimate path unchanged.
  - Update the JSDoc fast-path comment (~lines 82-84) to state the field is already formatted and returned directly (no parse).
  </action>
  <verify>
    <automated>pnpm codecheck</automated>
  </verify>
  <done>Both install-object sites in library.ts persist `getFileSize(Number(installedData.sizeOnDisk))`; getFileSize imported from backend/utils; getSteamInstallSize fast path returns the formatted install_size directly; codecheck (typecheck + lint) passes.</done>
</task>

<task type="auto">
  <name>Task 2: Update the LIB-06 fast-path test to the formatted-string contract</name>
  <files>src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <action>
In the `getSteamInstallSize` describe block (~line 743), the test "LIB-06: returns installed game size from install_size without calling axios.get" passes `install_size: '16106127360'` (raw bytes) and relies on the mocked `getFileSize` returning '15.00 GiB'. Update it to the new contract:
  - Change the fixture to a formatted string: `install: { install_size: '15.00 GiB', install_path: '/games/tf2' }`.
  - Assert `result` equals `'15.00 GiB'` (the value passed straight through) and that `axios.get` was NOT called.
  - Since the fast path no longer calls getFileSize, this test no longer depends on the getFileSize mock return value — remove reliance on it for this case (the mock can remain in beforeEach for other tests, but this assertion must hold regardless of the mock). Optionally assert `getFileSize` was not called in the fast-path case to lock the contract.
Leave the uninstalled/store-API and error-fallback tests unchanged.
  </action>
  <verify>
    <automated>npx jest games.test.ts</automated>
  </verify>
  <done>The LIB-06 fast-path test uses a formatted-string fixture, asserts the value is returned directly without calling axios, and the full steam games.test.ts suite passes.</done>
</task>

</tasks>

<verification>
- `pnpm codecheck` passes (typecheck + lint).
- `npx jest games.test.ts` passes (steam games suite green).
- Manual sanity: an installed Steam game's Install Info panel shows a human-readable size, not raw bytes.
</verification>

<success_criteria>
- Steam persists `GameInfo.install.install_size` as a `getFileSize`-formatted string at both construction sites.
- `getSteamInstallSize` returns that formatted string directly for installed games (no parseInt, no axios).
- Test suite and codecheck are green.
</success_criteria>

<output>
Create `.planning/quick/260710-kba-format-steam-install-size-as-human-reada/260710-kba-SUMMARY.md` when done
</output>
