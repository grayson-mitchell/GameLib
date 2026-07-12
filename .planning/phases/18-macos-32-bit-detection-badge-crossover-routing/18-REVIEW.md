---
phase: 18-macos-32-bit-detection-badge-crossover-routing
reviewed: 2026-07-12T07:55:19Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx
  - src/frontend/screens/Game/GamePage/components/index.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/index.css
  - public/locales/en/gamepage.json
findings:
  critical: 1
  warning: 6
  info: 2
  total: 9
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-07-12T07:55:19Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the macOS 32-bit detection feature: the store-API min-OS heuristic
(`games.ts`), the post-install Mach-O ground-truth check with `lipo`/`file`
shell-out and i386 recovery (`library.ts`), the cache-entry shape
(`electronStores.ts`), and the frontend badge (`MacArchBadge.tsx`) plus its
wiring in `GamePage`.

Command construction for the Mach-O check is argv-form (`execFileSync` with an
array), so there is **no shell-injection surface** — the `steam://` appId guard
(`/^\d+$/`) and the numeric-only running-appId scanners are also sound. The
HTML parser is regex-only, never rendered, and the floor-only invariant
(`macArchFromMinOS` never returns `'32'`) is correctly enforced at the type
level.

However, the phase's headline deliverable — the 32-bit badge and its
CrossOver-routing signal — has a **breaking propagation gap**: the resolved
`mac_arch` verdict is written only to `steamMetadataStore` and is never placed
on the `GameInfo` pushed to the frontend, and `refresh()` drops it entirely on
every library sync. The badge therefore fails to render in the common case.
There are also robustness defects in the `file` fallback parser, the min-OS
stop-keyword list, and the i386 recovery flow (which leaves the dead native
copy on disk and lets native-wins reconciliation re-mask the bottle install).

## Critical Issues

### CR-01: Resolved `mac_arch` verdict never reaches `GameInfo`/frontend — the 32-bit badge does not render

**File:** `src/backend/storeManagers/steam/library.ts:627-636` and `src/backend/storeManagers/steam/library.ts:246-285`

**Issue:** The 32-bit badge (`MacArchBadge.tsx:24`) renders solely off
`gameInfo.mac_arch === '32'`. Two backend paths break the propagation of that
value onto the `GameInfo` the frontend actually sees:

1. `verifyMacArchGroundTruth()` — the *only* place that can assert `'32'` —
   writes the verdict exclusively to `steamMetadataStore.set(...)`
   (lines 627-632). It never calls `library.set(appId, ...)` and never
   `sendFrontendMessage('pushGameToLibrary', ...)`. So immediately after a
   Mach-O `'32'` detection, neither the in-memory library entry nor the
   frontend `GameInfo` carries `mac_arch`. `pollInstallOnce()` already pushed
   the `'installed'` `GameInfo` (spreading the prior library entry, which had
   no `mac_arch`) *before* the fire-and-forget check runs, so the badge never
   appears post-install.

2. `refresh()` rebuilds every `GameInfo` from `cachedMeta` (lines 246-285) and
   seeds `is_mac_native`, `is_linux_native`, `is_delisted`,
   `steamPlatformsCaptured` — but **omits `mac_arch`**, even though
   `cachedMeta.mac_arch` is persisted (`electronStores.ts:58`). `refresh()`
   runs at startup (and mid-session on launch-completion), clearing and
   repopulating the library Map without `mac_arch`. For a game whose art and
   platforms are already cached, `getGameInfo()`'s lazy `fetchMetadataIfNeeded`
   is gated off (`games.ts:312`), so `mac_arch` is never re-seeded and the
   badge stays hidden.

Net effect: the CrossOver-routing *decision* still works (`isBottleEligible()`
reads `steamMetadataStore` directly, `games.ts:608-617`), but the user-facing
badge — the phase's primary UI deliverable — is effectively never shown for
fully-cached games. No test covers `mac_arch` on the pushed/refreshed
`GameInfo`, so the gap is silent.

**Fix:** Propagate `mac_arch` onto the `GameInfo` at both sites.

In `verifyMacArchGroundTruth`, after persisting to the metadata store, update
the library entry and push it:
```ts
steamMetadataStore.set(appId, { ...(existing ?? {...}), mac_arch: verdict, mac_arch_source: 'macho', mac_arch_verified: true })
const current = library.get(appId)
if (current) {
  const updated: GameInfo = { ...current, mac_arch: verdict }
  library.set(appId, updated)
  steamLibraryStore.set('games', Array.from(library.values()))
  sendFrontendMessage('pushGameToLibrary', updated)
}
```

In `refresh()`, seed the field from the cache like the other flags:
```ts
mac_arch: cachedMeta?.mac_arch ?? 'unknown',
```
(and mirror it in the `getGameInfo` persisted-cache fallback if that path can be hit before a sync).

## Warnings

### WR-01: i386 recovery leaves the dead native copy on disk; native-wins reconciliation re-masks the bottle install

**File:** `src/backend/storeManagers/steam/library.ts:694-701`

**Issue:** On confirm, `promptI386Recovery` calls `game.forceUninstall()` then
`game.install()`. `forceUninstall()` (`games.ts:850-858`) is **in-memory only**
— it deletes the library Map entry and pushes `is_installed:false`, but never
issues `steam://uninstall` and never removes the native `appmanifest_*.acf` or
the on-disk 32-bit files. Because `mac_arch` is already `'32'`,
`isBottleEligible()` is true, so `game.uninstall()` would route to the *bottle*
too — meaning **no code path removes the native 32-bit copy**. Consequences:
(a) a multi-GB dead install leaks on disk permanently; (b) the next
`refresh()`/`refreshInstallState()` re-reads the still-present native ACF and,
via native-wins reconciliation (`library.ts:242`, `:397`), reports the game as
native-installed (`platform: 'Mac'`), masking the freshly downloaded bottle
install in the UI. The docstring claim "force-uninstalls the dead native copy"
(line 662, 695) is inaccurate.

**Fix:** Before reinstalling, actually remove the native install (fire the
native `steam://uninstall/<appId>` and/or delete the native ACF+dir) rather
than the in-memory-only `forceUninstall()`, or explicitly exclude a
`mac_arch:'32'` game's native ACF from `buildInstalledMap()` reconciliation so
the bottle install is not clobbered.

### WR-02: `file` fallback matches arch substrings anywhere in output (including the file path) → can misclassify a 32-bit binary as `'64'`

**File:** `src/backend/storeManagers/steam/library.ts:513-522`

**Issue:** The `file` fallback runs `execFileSync('file', [binaryPath])` without
`-b`, so the output includes the full `binaryPath`, and the arch regexes
(`/\bx86_64\b/`, `/\barm64\b/`, `/\bi386\b/`) are tested against the whole
string. If the install path contains `arm64`/`x86_64` as a path segment (e.g.
`.../arm64/...`) while the binary is genuinely `i386`-only, the output matches
`arm64` and `verdictFromArchs` returns `'64'` — a false "runnable" verdict that
skips bottle routing, so the game silently fails to launch. This is the exact
false-negative-for-32 the phase is meant to prevent.

**Fix:** Use `file -b` (brief; omits filename) and/or match only the portion
after the first colon:
```ts
const output = execFileSync('file', ['-b', binaryPath], { encoding: 'utf8', timeout: 5000 })
```

### WR-03: `parseSteamMacMinOSVersion` stop-keyword list is incomplete — a later spec figure can lower the computed minimum and suppress a valid `'64'` verdict

**File:** `src/backend/storeManagers/steam/games.ts:171-174`

**Issue:** The run-on/tagless bounding only stops at
`processor|cpu|memory|ram|graphics|gpu|storage|network|additional`. Common
requirement labels like `Hard Drive`, `Hard Disk`, `Disk`, `DirectX`,
`Shader`, `Sound` are absent. A dotted figure from such a trailing clause
(e.g. `"OS: 10.15 ... Shader Model 5.1"` or a `5.5`) is picked up by
`extractVersionTokens`, and `reduce` selects the **lowest** version — dragging
the minimum below Catalina and turning a legitimate `'64'` into `'unknown'`.
The floor invariant holds (never a false `'32'`/`'64'`), so this is a
missed-detection/robustness issue, not a false positive.

**Fix:** Extend the stop-keyword alternation (`disk|hard\s*drive|hard\s*disk|directx|shader|sound`) or, more robustly, stop the OS segment at the first `,`/`<br>`/`;` boundary in the canonical shapes before extracting versions.

### WR-04: `locateMachOBinary` docstring claims `join()` bounds to the install subtree — it does not prevent `../` traversal

**File:** `src/backend/storeManagers/steam/library.ts:550-557`

**Issue:** The comment states the candidate is "Bounded to installPath's own
subtree via join() (T-18-03-04)". `path.join('/install', '../../etc/foo')`
resolves outside the subtree — `join()` normalizes but provides **no
containment**. Today `launchExecutable` is never supplied by callers, so there
is no live traversal, but the safety invariant is documented as enforced when
it is not; a future caller passing a Steam-metadata-derived launch path would
re-introduce a path-escape/arbitrary-binary-inspection risk.

**Fix:** Either drop the false claim, or actually enforce containment:
```ts
const candidate = join(installPath, launchExecutable)
const rel = relative(installPath, candidate)
if (rel.startsWith('..') || isAbsolute(rel)) return null
```

### WR-05: `getSteamInstallSize` store-API request has no timeout

**File:** `src/backend/storeManagers/steam/games.ts:249`

**Issue:** `axios.get(\`${STEAM_STORE_API}?appids=${appId}\`)` is issued with no
`timeout`, unlike `fetchMetadataIfNeeded` which passes
`{ timeout: METADATA_FETCH_TIMEOUT_MS }` (`games.ts:345-347`). A stalled
connection to the Steam store leaves this awaited call hanging indefinitely,
blocking the pre-install size estimate.

**Fix:** Pass the same bounded timeout:
```ts
const resp = await axios.get(`${STEAM_STORE_API}?appids=${appId}`, { timeout: METADATA_FETCH_TIMEOUT_MS })
```

### WR-06: `verifyMacArchGroundTruth` is fire-and-forget but can reject → unhandled promise rejection

**File:** `src/backend/storeManagers/steam/library.ts:946-948`, `:627-641`

**Issue:** `pollInstallOnce` calls `void verifyMacArchGroundTruth(...)`. Inside,
`steamMetadataStore.set(...)` and `dialog.showMessageBox(...)`
(via `promptI386Recovery`) can throw/reject. Because the call is `void`-ed with
no `.catch`, any rejection surfaces as an unhandled promise rejection in the
main process. `machOArchsOf` swallows its own errors, but the store write and
dialog do not.

**Fix:** Wrap the body in try/catch (log-and-swallow), or attach
`.catch(logWarning)` at the `void` call site.

## Info

### IN-01: `locateMachOBinary` picks `bins[0]` / first `*.app` from unordered `readdirSync`

**File:** `src/backend/storeManagers/steam/library.ts:560-565`

**Issue:** `readdirSync` order is filesystem-dependent, and
`Contents/MacOS/` may hold helper executables/dylibs alongside the main
binary; a top-level directory may contain more than one `.app` (e.g. an
uninstaller). Inspecting `bins[0]` / the first `.app` can sample the wrong
Mach-O and, in mixed-arch edge cases, yield a misleading verdict.

**Fix:** Prefer the bundle's `CFBundleExecutable` from `Info.plist`, or filter
to actual executables; at minimum prefer a bundle name matching `installdir`.

### IN-02: `fetchMetadataIfNeeded` drops `mac_arch_source` on an `is_mac_native` true→false transition

**File:** `src/backend/storeManagers/steam/games.ts:449-459`

**Issue:** When a previously mac-native game reports `is_mac_native:false` on a
later fetch, `mac_arch` is carried forward (line 413) but the conditional store
write emits neither the verified nor the `minos` source branch, so a
previously persisted `mac_arch_source` is silently dropped while `mac_arch`
itself is retained. Harmless today (nothing reads `mac_arch_source` yet, per
`electronStores.ts:62-68`), but the provenance/value pair becomes inconsistent.

**Fix:** Carry `mac_arch_source` forward from `existingMeta` whenever
`mac_arch` is carried forward unchanged.

---

_Reviewed: 2026-07-12T07:55:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
