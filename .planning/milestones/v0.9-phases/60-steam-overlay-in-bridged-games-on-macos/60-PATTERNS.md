# Phase 60: Steam overlay in bridged games on macOS - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 22 new/modified
**Analogs found:** 22 / 22 (one file, the vendored shim source, is a verbatim copy and has a doc-only analog)

All paths are relative to `/Users/graysonmitchell/Projects/GameLib`. `B` = `src/backend/storeManagers/steam`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `B/bridge/overlay/overlayPaths.ts` (new) | utility (paths) | transform | `B/bridge/drm/drmPaths.ts` | exact |
| `B/bridge/overlay/overlayNotice.ts` (new) | utility (step/notice) | transform | `B/bridge/drm/steamclientLayerMode.ts` | exact |
| `B/bridge/overlay/overlayRunnerClone.ts` (new) | service | file-I/O, batch (cp/codesign) | `B/bridge/drm/runnerClone.ts` | exact |
| `B/bridge/overlay/overlayLaunch.ts` (new) | service | request-response (pure + prepare) | `B/engine/engineDecision.ts` + `buildDrmLaunchEnvironment` in `B/games.ts` | role-match |
| `B/bridge/overlay/overlayAttachWatch.ts` (new) | service | event-driven (bounded poll) | `B/bottleProcessMonitor.ts` + `B/bottleLaunchSignals.ts` | role-match |
| `B/bridge/drm/runnerClone.ts` (modify) | service | file-I/O | itself | n/a |
| `B/bottle.ts` (modify: registry `kind`, regex) | provider/registry | request-response | itself (L1511, L1618) | n/a |
| `B/games.ts` (modify: route, CX_ENV, notify, wine-log sink) | controller/service | request-response | itself (L878-894, 3954, 4202) | n/a |
| `src/common/types.ts` (modify: `steamOverlayOverride`, `KnowFixesInfo`) | model | n/a | `steamEngineOverride` at L334 | exact |
| `src/common/types/steam.ts` (modify: `overlayEligible`) | model | n/a | `overrideEligible` in `SteamEngineState` | exact |
| `src/backend/knownFixes.ts` (modify: tier-1 key `steamGameOverlay`) | service/config | transform | `drm: 'ceg'` handling L80-92, L231 | exact |
| `B/engine/engineState.ts` (modify: `overlayEligible`) | service | request-response | itself L127, L218-222 | n/a |
| `B/engine/engineDecision.ts` or overlay module: `readStoredOverlayOverride` | utility | file-I/O | `readStoredEngineOverride` L354-367 | exact |
| `src/frontend/screens/Settings/components/SteamOverlayOverride.tsx` (new) | component | request-response | `SteamEngineOverride.tsx` | exact |
| `src/frontend/screens/Settings/sections/GamesSettings/index.tsx` (modify) | component | request-response | L267-271 mount of `SteamEngineOverride` | exact |
| `src/backend/constants/paths.ts` (modify: `builtOverlayShimPath`) | config | n/a | `steamBridgeHelperPath` L139 | exact |
| `meta/buildSteamBridgeShims.ts` (modify: overlay shim compile) | utility (build) | batch | `buildHelperCompileArgv` L346 + `compileHelper` L477 | exact |
| `native/steam-bridge/overlay-shim/{overlay_shim.m,LICENSE,NOTICE,PINS.md}` (new, vendored) | vendored source | n/a | `native/steam-bridge/steamclient-layer/ntdll-patch/PINS.md` (PINS role only) | role-match |
| `THIRD-PARTY-NOTICES.md` (modify) | docs | n/a | existing entries | role-match |
| `public/locales/en/translation.json` (modify) | config | n/a | existing `steam.engine.*` strings | exact |
| `B/bridge/overlay/__tests__/*.test.ts` (new, 4 files) | test | n/a | `B/bridge/drm/__tests__/runnerClone.test.ts` | exact |
| `src/frontend/.../__tests__/SteamOverlayOverride.test.tsx` (new) | test | n/a | existing `SteamEngineOverride` test | exact |

## Pattern Assignments

### `B/bridge/overlay/overlayPaths.ts` (utility, transform)

**Analog:** `B/bridge/drm/drmPaths.ts`

Copy the whole file's shape. Key points: no import of `backend/constants/paths` (caller passes `appFolder`); every getter returns `null` on bad input or escape.

**Regex + containment + root guard** (drmPaths.ts L15-58):
```typescript
import { isAbsolute, join, relative } from 'path'
const CROSSOVER_BUILD_RE = /^[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
const APP_ID_RE = /^[0-9]{1,10}$/

function contained(root: string, path: string): string | null {
  const rel = relative(root, path)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return path
}

export function buildDrmPaths(appFolder: string): DrmPaths | null {
  // eslint-disable-next-line no-control-regex
  if (!appFolder || !isAbsolute(appFolder) || /[\x00-\x1f]/.test(appFolder)) {
    return null
  }
  const root = join(appFolder, 'steam-bridge', 'drm')
  const runnersRoot = join(root, 'runners')
  const traceRoot = join(root, 'trace')
  const runnerDir = (build: string): string | null =>
    typeof build === 'string' && CROSSOVER_BUILD_RE.test(build)
      ? contained(runnersRoot, join(runnersRoot, 'crossover-' + build))
      : null
```
Overlay version: root `join(appFolder,'steam-bridge','overlay')`, `runnersRoot`, `traceRoot`, `runnerDir(build)`, `runnerAppPath(build)` (`join(dir,'CrossOver')`), and a `traceFile(appId, launchId)` keyed like drmPaths L79-85. Mark exports with `// ts-prune-ignore-next` as drmPaths does.

---

### `B/bridge/overlay/overlayNotice.ts` (utility, transform)

**Analog:** `B/bridge/drm/steamclientLayerMode.ts` (L89-131). Do NOT extend `DRM_STEPS`; keep a separate union (RESEARCH Pattern 6): `'steam-dylibs' | 'shim' | 'crossover-detect' | 'clone' | 'resign' | 'env'`.

**Cause normaliser + step error + notice line** (L89-131):
```typescript
export const DRM_CAUSE_MAX_CHARS = 160
function normaliseCause(cause: unknown): string {
  let text: string
  try {
    if (cause instanceof Error) text = cause.message
    else if (typeof cause === 'string') text = cause
    else text = String(cause)
  } catch { text = 'unknown' }
  if (typeof text !== 'string') text = 'unknown'
  let out = ''
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    out += c <= 0x1f || c === 0x7f ? ' ' : ch
  }
  out = out.replace(/\s+/g, ' ').trim().slice(0, DRM_CAUSE_MAX_CHARS).trim()
  return out === '' ? 'unknown' : out
}
export function drmStepError(step: DrmStep, cause: unknown): DrmStepError {
  return { status: 'error', step, cause: normaliseCause(cause) }
}
export function formatDrmNoticeLine(appId: string, step: DrmStep, cause: string): string {
  const id = /^[0-9]{1,10}$/.test(appId) ? appId : 'invalid'
  let token = normaliseCause(cause)
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._:/@+=,-]/g, '_')
  if (token === '') token = 'unknown'
  return `[bridge-notice] appId=${id} reason=${drmNoticeReason(step)} cause=${token}`
}
```
Overlay: `reason=overlay-<step>`. Zero-imports rule (L12-14) applies only to the DRM module (bridgeCensus bundles it); keep overlay notice import-free too for symmetry, and "nothing throws" (L16).

---

### `B/bridge/overlay/overlayRunnerClone.ts` (service, file-I/O)

**Analog:** `B/bridge/drm/runnerClone.ts` (1165 lines). Reuse by exporting its private primitives (`dumpLoaderEntitlements` L498, `entitlementsPlist` L512, `sha256File` L200, `statRegular` L213, `safeRemove` L454, `removeInside` L468, `psListing` L688, `isPathInUse` L701, `parseEntitlementKeys` L478, `LOADER_REL` L196). Add `// ts-prune-ignore-next` or consume them.

**Imports** (runnerClone.ts L28-52):
```typescript
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, constants as fsConstants, promises as fsp } from 'fs'
import type { Stats } from 'fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { createAbortController, deleteAbortController } from 'backend/utils/aborthandler/aborthandler'
```

**Tool-runner seam** (L62-100): `RunnerTool` allow-list, `RunTool` type, `RUNNER_TIMEOUTS`, `defaultRunTool` (spawns with fake-HOME env, `unrefHandle`). Overlay clone takes a `RunTool` dep exactly as `RunnerCloneDeps` (L417) so tests inject a fake.

**Entitlement dump parse** (L478-510): returns `null` on any non-`<true/>` value, which the overlay turns into a fail-open `resign` step error.

**Loader re-sign core to factor into a shared `resignLoaders(run, dest, rels, partial, timeouts)`** (L1055-1099):
```typescript
const stock = await dumpLoaderEntitlements(run, loader, timeouts.codesign)
if (!stock) stepFail('runner-patch', 'loader entitlements unreadable')
...
const plist = join(partial, 'loader-entitlements.plist')
await fsp.writeFile(plist, entitlementsPlist(), { flag: 'wx', mode: 0o600 })
const sign = await run('/usr/bin/codesign',
  ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', plist, loader],
  { timeoutMs: timeouts.codesign })
if (sign.code !== 0) stepFail('runner-patch', `loader re-sign failed (${sign.code}): ${sign.stderr.slice(0, 80)}`)
const after = await dumpLoaderEntitlements(run, loader, timeouts.codesign)
if (!after || !sixSet.every((k) => after.includes(k))) stepFail('runner-patch', 'loader lacks the dyld entitlement after re-sign')
await removeInside(partial, plist)
```
Differences for overlay (RESEARCH Pattern 1): derive the plist from the dumped keys + `DYLD_ENTITLEMENT` instead of the strict 5-key equality check at L1064-1069 (DRM stays strict); loop over `[LOADER_REL, join('bin','wineloader')]`; the existing `.gamelib-orig` copy (L1057-1061) precedes each re-sign.

**Targeted xattr scrub, keep as is, never `xattr -c`** (L1101-1132): `xattr -r -d com.apple.quarantine|com.apple.provenance`, then per-file check; `provenanceRemaining` is tolerated with a `logWarning`. `bin/wineloader` is already in the checked list (L1116).

**Marker + atomic rename** (L1134-1164): `writeFile(..., {flag:'wx', mode:0o600})`, `rename(partial, runnerDir)`, `EEXIST|ENOTEMPTY` -> step fail, `finally { await safeRemove(runnersRoot, partial) }`. Overlay marker: own schema with `crossoverBuild`, SHA-256 of both re-signed loaders and of both source loaders (Pitfall 10), `cloneMethod`, `createdAt`. No ntdll patch, no builtins, no lsteamclient.

**DRM clone change (D-05)**: in `buildRunner` replace the single-loader block L1055-1099 with the shared helper over both rels; marker `schema: 2` adds `wineloaderSha256` + `wineloaderResigned`. `verifyRunnerClone` (L564, loader check at L656-680) requires the six entitlements on `bin/wineloader` only when `wineloaderResigned`. Wineloader re-sign best-effort (RESEARCH Pitfall 1; open question A7, confirm with user).

---

### `B/bridge/overlay/overlayLaunch.ts` (service, request-response)

**Analog 1 (CX_ENV merge to extract):** `B/games.ts` L886-894, inside `buildDrmLaunchEnvironment`:
```typescript
if (cxTokens.length > 0) {
  if (cxTokens.some((t) => t.slice(t.indexOf("'") + 1, -1).includes("'"))) {
    return invalid('CX_ENV value')
  }
  const existing = getKey('CX_ENV')
  const joined = cxTokens.join(' ')
  setKey('CX_ENV', existing ? `${existing} ${joined}` : joined)
}
```
Extract into `appendCxEnvTokens(env, tokens)` (RESEARCH "CX_ENV append helper" code example is the target shape) and call it from both `buildDrmLaunchEnvironment` (new optional `overlayTokens` on `DrmLaunchEnvInput`) and the TCP overlay path. Other DRM tokens are pushed like `cxTokens.push(\`WINEDLLPATH='${drmPath}'\`)` (L884-886).

**Analog 2 (direct file read of per-game setting; avoids GameConfig async-fill trap, 59-UAT G11):** `B/engine/engineDecision.ts` L354-367:
```typescript
export function readStoredEngineOverride(appId: string): unknown {
  if (!/^[0-9]{1,10}$/.test(appId)) return undefined
  const path = join(gamesConfigPath, `${appId}.json`)
  if (!existsSync(path)) return undefined
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string, { steamEngineOverride?: unknown } | undefined>
    return raw[appId]?.steamEngineOverride
  } catch { return undefined }
}
```
Mirror as `readStoredOverlayOverride` returning `raw[appId]?.steamOverlayOverride`. `resolveOverlayEnabled` is the pure function given in RESEARCH Pattern 5; unit-test the precedence table.

**Fail-open rule:** every function returns `{status:'ok'|'error', step, cause}` (the `DrmStepResult` shape in steamclientLayerMode.ts L79-84) and never rejects; the caller in `games.ts` wraps in try/catch.

**Token set** (CONTEXT specifics): `DYLD_INSERT_LIBRARIES='<shim>:<SBIN>/steamloader.dylib:<SBIN>/gameoverlayrenderer.dylib' SteamOverlayGameId=<id> SteamGameId=<id> SteamAppId=<id>`; `SBIN` from `MAC_STEAM_CLIENT_SUBPATH` in `B/games.ts`. Reject `'`, `:`, control chars, non-absolute; require regular files.

---

### `B/bridge/overlay/overlayAttachWatch.ts` (service, event-driven bounded poll)

**Analog 1:** `B/bottleLaunchSignals.ts` L55-92, `readBoundedTail(path, maxBytes=65536)`; never throws, closes in `finally`. Import and reuse; also reuse its `[...]`-timestamp parser with the `launchStartedAt - 5000` cutoff.

**Analog 2 (tracked, unref'd sleep):** `B/bottleProcessMonitor.ts` L245-255:
```typescript
function trackedSleep(entry: MonitorEntry, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const handle = setTimeout(() => {
      entry.timers.delete(handle)
      resolve()
    }, ms)
    entry.timers.add(handle)
    handle.unref?.()
  })
}
```
Register an abort via `createAbortController` / `deleteAbortController` (as runnerClone.ts imports them) so stdin-EOF `callAllAbortControllers()` ends the watch. 1 s poll, 10 s cap, no import-time work (sidecar exit contract). Declare the real-HOME read arm in the docblock (the same justification `launchDrmModeGame` gives). Output is one `logInfo` line only.

---

### `B/bottle.ts` (modify: runner registry)

Sites: `DRM_RUNNER_CXROOT_RE` (L1511, match at L1536), `drmBridgeRunners` Map (L1618), `getBridgeBottleSettings` (~L1727), `killForRegisteredEngine` (~L1990). Relax the regex to `(?:drm|overlay)`, add `kind: 'drm' | 'overlay'` to the entry, add an overlay label next to "(GameLib DRM runner)". Call `endPerGameBridgeBottleSession` before registering when the runner changes, as `drmLaunchSetup` does (~L420-436).

---

### `B/games.ts` (modify)

Integration points (line numbers as in RESEARCH; re-grep before editing, file is 6166 lines):
- `buildDrmLaunchEnvironment` CX_ENV merge: L878-894 (excerpt above).
- Notice/toast: fallback toast is `notify({ title, body })` after `i18next.t('gamelib:steam.engine.toast.cxMissing', 'CrossOver not found — using built-in engine')` (L4194-4202). Overlay-failure toast copies this (every launch, no dedupe, D-09). DRM variant `maybeNotifyDrmModeFailed` (~L3945-3956) builds `title`/`body` with `i18next.t('gamelib:steam.bridge.drm.title', ...)` and `notify({ title, body })`, but has session dedupe and a raised dialog; do not copy those parts.
- Route: `launchBridgeGameBody` (~L4429), `drmLaunchSetup` `not-applicable` branch (~L4510-4516), `launchDrmModeGame` (~L4296-4358), `fireBridgeWineLaunch` (~L4958-5010, spawn `runWineCommand` ~L5148). Overlay prepare runs after the `not-applicable` clear; wine-log sink only attached for overlay launches (Pitfall 4; model `B/bridge/drm/stageWineLog.ts` `openStageWineLog` and `createDrmWineLogAppender`).
- Calling `readStoredOverlayOverride` dynamically mirrors L1206-1208 (`const { readStoredEngineOverride } = ...`).

---

### `src/common/types.ts`, `src/common/types/steam.ts`

**Analog:** `steamEngineOverride?: string` at `src/common/types.ts` L334 (inside `GameSettings`). Add `steamOverlayOverride?: 'automatic' | 'on' | 'off'` next to it. `KnowFixesInfo` (~L1160) gets `steamGameOverlay?: 'off'`. `SteamEngineState` in `common/types/steam.ts` gets `overlayEligible?: boolean`, computed in `engineState.ts` (L218-222 already evaluates `bridgeInstallBottleFor(appId)`); unlike `overrideEligible` it must not exclude `isDrmModeTitle`.

---

### `src/backend/knownFixes.ts` (tier-1 key)

**Analog:** the `drm` key. `TIER1_KNOWN_FIX_KEYS` (L80-92) and the value allow-list in `filterTier1KnownFixes` (L231-237):
```typescript
if (key === 'drm' && value !== 'ceg') {
  logWarning(
    `Known fixes for '${appName}' (${layerLabel} layer): 'drm' accepts only "ceg", ignoring ${JSON.stringify(value)}.`
  )
  continue
}
```
Add `'steamGameOverlay'` to the tuple and an identical branch accepting only `"off"`. Check `knownFixReportDrift.test.ts` and `TIER1_ROUTING_KEYS` / `isRoutingOnlyTier1Fix` (RESEARCH open question 3). Do not confuse with tier-2 `overlays` / `KnownFixOverlayEntry`.

---

### `src/frontend/screens/Settings/components/SteamOverlayOverride.tsx` (component)

**Analog:** `SteamEngineOverride.tsx` in the same dir.

**Imports** (L1-9):
```typescript
import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import SelectField from 'frontend/components/UI/SelectField'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'
import { useSteamEngineState } from 'frontend/state/SteamEngineState'
```
Use `useSetting('steamOverlayOverride','automatic')`, a collapsed `<details>` + `SelectField`, `labelHelp={<InfoIcon .../>}` (icon-only (i) on the label line, per memory), options Automatic / On / Off, `t('steam.overlay.…','English default')` calls via the local `T` type (L11-15). Mount next to the engine override at `GamesSettings/index.tsx` L267-271, gated `!isDefault && isMac && gameInfo?.runner === 'steam'` plus `overlayEligible`. Per-game value is shown as stored (`selectValue` idea, WR-05).

---

### `src/backend/constants/paths.ts`

**Analog** (L139-141):
```typescript
export const steamBridgeHelperPath = fixAsarPath(
  join(publicDir, 'bin', process.arch, 'darwin', 'steam-bridge-helper')
)
```
Add `builtOverlayShimPath = fixAsarPath(join(publicDir,'bin',process.arch,'darwin','overlay_shim.dylib'))`.

---

### `meta/buildSteamBridgeShims.ts` (build)

**Analog:** `buildHelperCompileArgv` (L346-370, pure exported, unit-tested by `meta/__tests__/buildSteamBridgeShims.test.ts`), `compileHelper` (L477-493), `spawnArgv` (L458-475), `main()` (L595; `compileHelper()` first). Add `buildOverlayShimCompileArgv(arch)` (pure, `-arch` via `machoArchFlag(arch)`, flags from RESEARCH Pattern 4), `overlayShimOutputPath()` beside `helperOutputPath` (L194), and `compileOverlayShim()` running arm64 and x86_64 clang runs, `lipo -create`, `codesign -fs -`. Both slices always (x86_64 is the Rosetta injection target). Spawn envs: `createFakeHomeProfile().childEnv()` (as `meta/buildDrmNativeParts.ts` does); `spawnArgv` itself has no `env` literal, so only add an env if you pass one.
```typescript
function spawnArgv(command: string, args: string[]) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    ...
    child.on('close', (code) => resolve({ code, stdout, stderr }))
```
Note that `main()` has a file-delimiter comment at L592 ("export async function main" as end-of-function delimiter); keep it intact when editing.

---

### Vendored `native/steam-bridge/overlay-shim/`

No code analog. Role analog: `native/steam-bridge/steamclient-layer/ntdll-patch/PINS.md` for the pin record. Required content from RESEARCH: byte-identical `overlay_shim.m` (blob `194b5fba7c0f145a9d7e227fc5ace2e2333e2299`, sha256 `d6924aa4b330059dfa1212340a34f8081ea949cc8c82cfc2875ca6f0964687e5`, commit `0c798e7148efe279627573f864210064788b427c`), GPLv3 `LICENSE`, `NOTICE`, no prebuilt binary. Test `overlayShimVendor.test.ts` asserts the hash.

---

### Tests

**Analog:** `B/bridge/drm/__tests__/runnerClone.test.ts` (header L1-30): synthetic CrossOver trees in `mkdtemp` dirs whose names contain a space, fake `RunTool` for all steps except explicit `defaultRunTool` cases, `createFakeHomeProfile` for real spawns, `callAbortController` for abort cases, opt-in real-CrossOver arm gated like `ntdllPatch.realCrossover.test.ts`. Existing `runnerClone.test.ts` needs edits for schema 2 and wineloader re-sign. Watcher test uses fake timers and asserts unref. See RESEARCH "Phase Decisions -> Test Map" for the per-decision commands.

## Shared Patterns

### Fake-HOME isolation (every spawn)
**Source:** `createFakeHomeProfile().childEnv()` from `backend/testUtils/fakeHomeProfile` (used by `runnerClone.ts` `defaultRunTool`).
**Apply to:** overlay clone `cp/codesign/plutil/xattr/ps`, shim build `clang/lipo/codesign`. Never a hand-rolled `env` literal (`fakeHomeIsolation.test.ts`). The console_log watcher is the one declared real-profile arm (read-only, no spawn).

### Fail-open step result
**Source:** `DrmStepResult` / `drmStepError` (`steamclientLayerMode.ts` L79-112).
**Apply to:** all overlay functions. Return a result object, never reject; the caller notifies (`notify`) and writes the `[bridge-notice]` line, and launches stock (TCP) or DRM-without-tokens. Opposite of DRM fail-closed.

### Notice line + toast
**Source:** `formatDrmNoticeLine` (L120-131) and `notify({ title, body })` with `i18next.t('gamelib:…', 'English default')` (`games.ts` L4194-4202).
**Apply to:** overlay setup failures (every launch), D-10 abnormal-exit message.

### Sidecar exit contract
**Source:** `trackedSleep` (`bottleProcessMonitor.ts` L245-255) and `createAbortController`.
**Apply to:** the attach watcher and any wine-log sink: `unref()` every handle, bounded work, nothing at import or boot.

### Path validation before env use
**Source:** `drmPaths.ts` `contained()` and absolute/control-char guard (L37-47); `games.ts` quote guard L887.
**Apply to:** overlay paths and `CX_ENV` tokens (also reject `:`).

### `<verify>` formatter check
Per CLAUDE.md conventions: `npx prettier --file-info <path>` first; run `npx prettier --check` on exact written `.ts/.tsx` paths. `.planning`, `public/locales/`, `.claude` are prettier-ignored (omit the check, say so). Check `native/` and the `.m` with `--file-info` first.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `native/steam-bridge/overlay-shim/overlay_shim.m` | vendored native source | n/a | Verbatim third-party Objective-C; no GameLib equivalent. Pin and hash only. |
| Known-fix `steamGameOverlay` precedence logic | pure function | transform | Net-new; copy structure from RESEARCH Pattern 5 `resolveOverlayEnabled`. |
| D-10 abnormal-exit predicate | utility | event-driven | No existing "exited abnormally soon after start" check; `onBridgeLaunchDeadline` (Phase 59) covers only the never-appeared case. Use the `monitor.onFirstMatch`/`onStopped` hooks in `fireBridgeWineLaunch`. |

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/` (bridge, bridge/drm, engine, root), `src/backend/knownFixes.ts`, `src/backend/constants/paths.ts`, `src/common/`, `src/frontend/screens/Settings/components/`, `meta/`
**Files read for excerpts:** runnerClone.ts (ranges), drmPaths.ts, steamclientLayerMode.ts, bottleLaunchSignals.ts, bottleProcessMonitor.ts (range), engineDecision.ts (range), games.ts (ranges), knownFixes.ts (ranges), paths.ts (range), SteamEngineOverride.tsx (head), buildSteamBridgeShims.ts (ranges)
**Pattern extraction date:** 2026-11-02
**Caveat:** Line numbers in `games.ts` / `bottle.ts` beyond those I re-read directly (L878-894, 3945-3956, 4194-4202) come from RESEARCH.md and the file has uncommitted edits in the working tree; re-grep before editing.
