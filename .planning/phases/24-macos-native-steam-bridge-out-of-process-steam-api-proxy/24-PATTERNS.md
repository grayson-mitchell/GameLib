# Phase 24: macOS native Steam bridge (out-of-process steam_api proxy) - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 16 (from RESEARCH.md's Recommended Project Structure + CONTEXT.md integration points)
**Analogs found:** 13 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/backend/storeManagers/steam/bridge/bridge-allowlist.json` | config | batch (static data) | `src/backend/crossover_index/schema.ts`'s bundled-JSON precedent (schema, not the JSON file itself — no existing bundled JSON asset in-repo to copy byte-shape from) | role-match |
| `src/backend/storeManagers/steam/bridge/allowlist.ts` | utility (schema-validated loader) | transform | `src/backend/crossover_index/schema.ts` | exact |
| `src/backend/storeManagers/steam/bridge/importScan.ts` | utility (subprocess wrapper + parser) | transform | `src/backend/utils.ts` `spawnAsync` (L843-881) + `bottle.ts` `killBottleWineServer` (L505-523, argv-form `spawnAsync` call site) | role-match |
| `src/backend/storeManagers/steam/bridge/helperProcess.ts` | service (process lifecycle + readiness) | event-driven / request-response | `src/backend/storeManagers/steam/clientSetup.ts` `ensureSteamClientReady()` (L92-132) | exact |
| `src/backend/storeManagers/steam/bridge/shimGenerate.ts` | service (orchestration, per-bottle placement) | file-I/O | `src/backend/storeManagers/steam/bottle.ts` `provisionBottle()` (L540-802) | role-match |
| `src/backend/storeManagers/steam/bridge/protocol.ts` | utility (framing constants) | transform | No direct analog — new wire-protocol surface, no existing binary-framing code in repo | none |
| `src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts` | test | — | `src/backend/storeManagers/steam/__tests__/clientSetup.test.ts` | role-match |
| `src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts` | test | — | `src/backend/storeManagers/steam/__tests__/bottle.test.ts` | role-match |
| `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` | test | — | `src/backend/storeManagers/steam/__tests__/clientSetup.test.ts` | exact |
| `meta/gen_vtables.ts` | utility (build-time generator script) | transform | `meta/buildCrossoverIndex.ts` | exact |
| `meta/gen_vtables.test.ts` | test | — | `meta/__tests__/` (buildCrossoverIndex's test sibling, same `meta/__tests__` dir) | role-match |
| `meta/buildSteamBridgeShims.ts` | utility (packaging-time build step) | file-I/O | `meta/downloadHelperBinaries.ts` | exact |
| `meta/downloadZig.ts` | utility (pinned-tarball downloader) | file-I/O | `meta/downloadHelperBinaries.ts` (`RELEASE_TAGS`, `downloadFile`) | exact |
| `src/backend/constants/paths.ts` (MODIFIED — add `steamBridgeHelperPath`) | config | — | Same file, existing `fakeEpicExePath`/`galaxyCommunicationExePath` pattern (L69-75) | exact (self-modification, in-file precedent) |
| `src/backend/storeManagers/steam/games.ts` (MODIFIED — bridge routing branch) | controller (routing) | request-response | Same file, `isSteamNativeInstallEnabled()` composition inside `isBottleEligible()` block (L660-661, L634) | exact (self-modification, in-file precedent) |
| `src/frontend/state/SteamBridgeSetup.ts` (NEW, D-05 dialog seam) | store/provider (frontend signal handler) | event-driven | `src/frontend/state/SteamBottleSetup.ts` | exact |
| `native/steam-bridge/helper/bridge_helper.c` | service (native subprocess, out-of-repo-convention C) | request-response | No in-repo TS/JS analog (native C) — pattern source is `.claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_server.c` | none (native code, spike precedent only) |
| `native/steam-bridge/generated/steam_api_shim.c` + `.def` | model (generated artifact, committed source) | transform | Spike precedent `.claude/skills/spike-findings-gamelib/sources/005c-min-steam_api-shim/` + `006-cpp-vtable-abi/steam_api_vt.c` | none (native code, spike precedent only) |

## Pattern Assignments

### `src/backend/storeManagers/steam/bridge/allowlist.ts` (utility, transform)

**Analog:** `src/backend/crossover_index/schema.ts` (28 lines, read in full)

**Full pattern** (lines 1-28):
```typescript
import { z } from 'zod'

/**
 * D-09: the trust-boundary validator for the CrossOver compatibility index —
 * a remotely-published (or bundled) payload that drives a user-facing claim
 * ("this game won't run"). Every bound here is a mitigation, not a nicety:
 * - `rating.int().min(1).max(5)` rejects poisoned/out-of-range medal values
 *   (T-19-01, T-19-04).
 * - `entries.min(1000)` rejects a truncated payload (T-19-04).
 * - `version: z.literal(1)` rejects a shape-drifted payload from a future
 *   incompatible publish.
 * Do NOT loosen any of these bounds — they are the mitigation, not styling.
 */
export const crossoverIndexSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z
    .array(
      z.object({
        name: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        steamid: z.string().optional()
      })
    )
    .min(1000)
})

export type CrossoverIndex = z.infer<typeof crossoverIndexSchema>
```

**Apply to `allowlist.ts`:** Define a `bridgeAllowlistSchema` following the exact same shape (`z.object` with a `version: z.literal(1)` guard + `z.array(z.object({ appId: z.string().regex(/^\d+$/), title: z.string().min(1), ... }))`), export the inferred type, then `readFileSync` + `JSON.parse` + `.parse()` the bundled `bridge-allowlist.json` at module load (mirrors how `crossoverIndexSchema` is consumed downstream — trace via `graphify path "crossoverIndexSchema" "consumer"` if the consumer file is needed). A malformed entry should throw at load (fail loud, matching D-02's "curated, reviewed" posture) rather than silently drop — this is a small, developer-maintained list, unlike the 1000+-entry CrossOver index, so `entries.min(1)` not `.min(1000)`.

**AppId numeric-guard convention** (reuse project-wide, do not reinvent):
```typescript
// Pattern repeated verbatim across bottle.ts:806, clientSetup.ts:40 — reuse the SAME regex
const NUMERIC_APP_ID = /^\d+$/
```

---

### `src/backend/storeManagers/steam/bridge/helperProcess.ts` (service, event-driven / request-response)

**Analog:** `src/backend/storeManagers/steam/clientSetup.ts` (241 lines, read in full)

**Result-shape + status-union pattern** (lines 42-52):
```typescript
export type SteamClientReadyStatus = 'ready' | 'needs-install' | 'needs-launch'

export interface EnsureSteamClientReadyResult {
  status: SteamClientReadyStatus
  // Mirrors `status === 'ready'` — kept alongside `status` so Plan 07's
  // existing games.ts call site (`if (!clientReady.ready)`) needs zero
  // changes (21-07 SUMMARY's stated invariant: "same exported signature ...
  // no games.ts changes needed").
  ready: boolean
  error?: string
}
```

**Bounded-poll / readiness seam pattern** (lines 92-132, the exact idiom RESEARCH.md's Pattern 4 names as the `ensureBridgeHelperReady()` model):
```typescript
export async function ensureSteamClientReady(
  appId: string
): Promise<EnsureSteamClientReadyResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `ensureSteamClientReady: rejected non-numeric appId "${appId}" (T-21-05)`,
      LogPrefix.Steam
    )
    return {
      status: 'needs-install',
      ready: false,
      error: `Invalid appId: "${appId}"`
    }
  }

  if (!SteamUser.isSteamClientInstalled()) {
    logInfo(
      `ensureSteamClientReady: Steam client not installed — requesting guided install for appId ${appId} (D-10)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamClientSetupRequired', {
      appName: appId,
      reason: 'install'
    })
    return { status: 'needs-install', ready: false }
  }

  if (!hasLibraryFoldersVdf()) {
    logInfo(
      `ensureSteamClientReady: Steam installed but never launched (no libraryfolders.vdf) — requesting launch-once prompt for appId ${appId} (D-11)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamClientSetupRequired', {
      appName: appId,
      reason: 'launch-once'
    })
    return { status: 'needs-launch', ready: false }
  }

  return { status: 'ready', ready: true }
}
```

**Apply to `ensureBridgeHelperReady()`:** Same three-tier status union shape — `'ready' | 'needs-spawn' | 'unreachable'` (or similar) — numeric-guard the appId first, then (1) spawn-if-not-running the helper binary at `steamBridgeHelperPath` (see paths.ts pattern below), (2) probe with the spike-proven `PING`→`PONG` over the loopback socket with a bounded retry loop (model the retry loop on `bottle.ts`'s `raiseFrontmostBottledProcess` polling shape, L355-436 — `for (let attempt = 0; attempt < N && !ready; attempt++) { await sleep(ms); ... }`), (3) on failure call `sendFrontendMessage('steamBridgeSetupRequired', { appName: appId, reason: ... })` exactly like the `steamClientSetupRequired`/`steamBottleSetupRequired` precedent — never a new event-naming convention.

**Process-spawn pattern to reuse for launching the helper binary itself:**
```typescript
// src/backend/utils.ts L843-881 — argv-form spawn, never shell string interpolation
export const spawnAsync = async (
  command: string,
  args: string[],
  options: SpawnOptions = {},
  onOutput?: (data: string) => void
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  const child = spawn(command, args, options)
  // ... stdout/stderr collection, resolves on 'close'
}
```
For the LONG-LIVED helper (unlike `spawnAsync`'s wait-for-close shape), use Node's raw `child_process.spawn` directly and keep the `ChildProcess` handle module-scoped (D-03 "one shared, long-lived" — do not use `spawnAsync`, which waits for exit).

---

### `src/backend/storeManagers/steam/games.ts` (controller, request-response) — bridge routing branch

**Analog:** Same file, existing D-13/D-15 opt-in composition pattern (self-analog — this is a MODIFIED file, not new)

**Routing composition pattern** (lines 634-668, install() — the exact shape to replicate for the bridge sub-branch):
```typescript
await this.ensurePlatformsCaptured()
if (this.isBottleEligible()) {
  if (!isBottleReady()) {
    logInfo(
      `SteamGame: appId ${this.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of installing`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamBottleSetupRequired', { appName: this.appId })
    return { status: 'done', deferredToSetup: true }
  }

  // D-15/SNI-08 opt-in: ... (installBottleNative branch)
  if (isSteamNativeInstallEnabled()) {
    return this.installBottleNative(args)
  }

  logInfo(
    `SteamGame: delegating install for appId ${this.appId} via the bottled Steam client`,
    LogPrefix.Steam
  )
  const result = await tellBottledSteamToInstall(this.appId)
  // ...
}
```

**Eligibility-gate pattern** (lines 965-977, the private predicate to compose with, per D-01/D-02 allowlist check):
```typescript
private isBottleEligible(): boolean {
  if (!isMac) return false
  const meta = steamMetadataStore.get(this.appId)
  if (meta?.mac_arch === '32') return true
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}
```

**Apply:** Add a new private `isBridgeEligible(): boolean { return this.isBottleEligible() && bridgeAllowlist.has(this.appId) }` and insert the bridge sub-branch as the FIRST check inside each of `install()`/`launch()`/`uninstall()`'s existing `if (this.isBottleEligible())` block — mirroring exactly how `isSteamNativeInstallEnabled()` composes as a sub-branch (L660-661) inside that same block. Per RESEARCH.md Pattern 4, the bridge's `launch()` sub-branch does NOT call `tellBottledSteamToLaunch` — it must call `runWineCommand` directly on the game's own `.exe` (see `bottle.ts`/`launcher.ts` patterns below), since there is no bottled `steam.exe` in the bridge bottle.

**Import list precedent** (lines 39-46, current imports from `bottle.ts`/`nativeInstallSetting.ts` to extend, not replace):
```typescript
import {
  isBottleReady,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall,
  // ... add: provisionBottle (D-11 on-demand fallback provisioning),
  // getSteamBottleSettings, getBottleDir, sanitizeBottleName as needed
} from './bottle'
import { isSteamNativeInstallEnabled } from './nativeInstallSetting'
// add: import { bridgeAllowlist } from './bridge/allowlist'
```

---

### `src/backend/storeManagers/steam/bridge/shimGenerate.ts` (service, file-I/O) — per-bottle shim placement

**Analog:** `src/backend/storeManagers/steam/bottle.ts` `provisionBottle()` (lines 540-802, read in full)

**Idempotent-guard + numeric/name-sanitize + argv-spawn shape to replicate** (lines 540-554, 704-720):
```typescript
export async function provisionBottle(opts?: {
  bottleName?: string
  wineVersion?: WineInstallation
}): Promise<ProvisionBottleResult> {
  const rawName = opts?.bottleName ?? DEFAULT_STEAM_BOTTLE_NAME
  const bottleName = sanitizeBottleName(rawName)

  // (1) Reject unsafe names before any path/argv construction (T-17-01).
  if (!bottleName) {
    logError(
      `provisionBottle: rejected unsafe bottle name "${rawName}" (T-17-01)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid bottle name: "${rawName}"` }
  }
  // ...
```

```typescript
  // (5) Download ... HTTPS only (T-17-02), reusing a cached copy on
  // re-provision. mkdirSync the redist dir first (recursive is idempotent).
  const steamSetupDir = join(steamSupportPath, 'redist')
  const steamSetupExePath = join(steamSetupDir, 'SteamSetup.exe')
  mkdirSync(steamSetupDir, { recursive: true })
  if (!existsSync(steamSetupExePath)) {
    try {
      await downloadFile({ url: STEAM_SETUP_EXE_URL, dest: steamSetupExePath })
    } catch (error) { /* ... */ }
  }
```

**Apply:** `shimGenerate.ts`'s per-game placement function should follow the SAME shape: sanitize/guard inputs first (appId numeric guard, matching `dispatchToBottledSteam`'s `NUMERIC_APP_ID.test(appId)` at L823), then an idempotent existence check (`existsSync(shimDestPath)` before regenerating — mirrors `provisionBottle`'s `if (!existsSync(steamSetupExePath))` cache-reuse), then `objdump`-derived import scan → shim selection → `copyFileSync`/`writeFileSync` placement next to the game's `.exe`. Reuse `getBottleSteamappsDir`-sibling path helpers from `bottle.ts` (`getBottleDir`, `resolveBottleSteamRoot`-style resolver) rather than re-deriving bottle paths.

**Bottle-name/path guard to reuse verbatim** (lines 156-169):
```typescript
export function sanitizeBottleName(name: string): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed) return null
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.includes('\0')
  ) {
    return null
  }
  return trimmed
}
```

---

### `src/backend/storeManagers/steam/bridge/importScan.ts` (utility, transform) — objdump wrapper

**Analog:** `src/backend/utils.ts` `spawnAsync` (lines 843-881) + `bottle.ts`'s argv-form `spawnAsync` call sites (e.g. `killBottleWineServer`, lines 505-523)

**Argv-form spawn (never shell-interpolated) call-site pattern**:
```typescript
async function killBottleWineServer(bottleName: string): Promise<void> {
  try {
    await spawnAsync(WINESERVER_BIN, ['-k'], {
      env: {
        ...process.env,
        WINEPREFIX: getBottleDir(bottleName),
        CX_ROOT
      }
    })
  } catch (error) {
    logWarning(
      [
        `killBottleWineServer: wineserver -k for bottle "${bottleName}" failed (best-effort — provisioning continues)`,
        error
      ],
      LogPrefix.Steam
    )
  }
}
```

**Apply:** `importScan.ts` should call `spawnAsync('/usr/bin/objdump', ['--private-headers', exePath])` (argv-form, per RESEARCH.md's Don't-Hand-Roll table and Security ASVS V5 — never `spawnAsync('objdump --private-headers ' + exePath)` shell-string form), parse stdout with a small regex/line-filter for `grep steam_api`-equivalent matching done in JS rather than shelling to `grep`, and return the parsed symbol list. Follow the same try/catch + `logWarning`-on-failure shape as `killBottleWineServer`.

---

### `meta/gen_vtables.ts` (utility, build-time generator) — R1 vtable + flat shim generator

**Analog:** `meta/buildCrossoverIndex.ts` (352 lines; header + type section read, lines 1-70)

**Module-header + purpose-doc convention to replicate**:
```typescript
/**
 * CI-only index builder — turns CodeWeavers' daily `.tie` XML dump into the
 * small offline artifact the macOS library badges/filter read:
 * `crossover-index.json.gz` plus a `collisions.json` drift report.
 *
 * Run with `pnpm build-crossover-index`.
 *
 * This is CI-only. The Electron app never parses XML — it only ever reads
 * the small JSON this script emits (Phase 19, CXIDX-01).
 * ...
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
```

**Apply to `gen_vtables.ts`:** Same doc-header convention explaining WHY the script is build-time-only and WHAT it emits (per D-07: reads `meta/sdk/*.manifest.json` GameLib-authored interface manifests, emits `native/steam-bridge/generated/steam_api_shim.c` + `.def`). Export typed interfaces for the manifest shape (`InterfaceManifest`, `MethodSignature`) the same way `buildCrossoverIndex.ts` exports `DumpRecord`/`Collision`/`DedupResult`. Run via a new `pnpm gen-vtables` script (mirrors `pnpm build-crossover-index`), added to `package.json` scripts alongside the existing entry.

---

### `meta/buildSteamBridgeShims.ts` / `meta/downloadZig.ts` (utility, packaging-time) — R5 packaging

**Analog:** `meta/downloadHelperBinaries.ts` (264 lines, read in full)

**Pinned-release-tag + tarball-download pattern** (lines 17-23, 31-44):
```typescript
const RELEASE_TAGS = {
  legendary: '0.20.43',
  gogdl: 'v1.2.1',
  nile: 'v1.1.2',
  comet: 'v0.2.0',
  'epic-integration': 'v0.4'
} as const satisfies Record<DownloadedBinary, string>

async function downloadFile(url: string, dst: string) {
  const response = await fetch(url, {
    keepalive: true,
    headers: { 'User-Agent': 'HeroicBinaryUpdater/1.0' }
  })
  if (response.status !== 200) {
    throw Error(`Failed to download ${url}: ${response.status}`)
  }
  await mkdir(dirname(dst), { recursive: true })
  const fileStream = createWriteStream(dst, { flags: 'w' })
  await finished(Readable.fromWeb(response.body).pipe(fileStream))
}
```

**Arch/platform-keyed asset placement pattern** (lines 46-66, 57-58 especially — the exact `public/bin/${arch}/${platform}/${exeFilename}` convention RESEARCH.md's Pattern 5 names):
```typescript
async function downloadAsset(
  binaryName: string,
  repo: string,
  tag_name: string,
  arch: string,
  platform: SupportedPlatform,
  filename: string
) {
  const url = `https://github.com/${repo}/releases/download/${tag_name}/${filename}`
  const exeFilename = binaryName + (platform === 'win32' ? '.exe' : '')
  const exePath = join('public', 'bin', arch, platform, exeFilename)
  await downloadFile(url, exePath)
  if (platform !== 'win32') {
    await chmod(exePath, '755')
  }
}
```

**Version-drift-detection pattern** (lines 200-225, `compareDownloadedTags`/`storeDownloadedTags` — reuse if `downloadZig.ts` should skip re-downloading an already-current pinned tarball):
```typescript
async function compareDownloadedTags(): Promise<DownloadedBinary[]> {
  const storedTagsText = await readFile('public/bin/.release_tags', 'utf-8').catch(() => '{}')
  // ... compares stored vs RELEASE_TAGS, returns only what changed
}
```

**Apply:** `downloadZig.ts` should add a `zig` entry to a RELEASE_TAGS-shaped pinned-version map (or a sibling constant), fetch from `ziglang.org/download/index.json` per RESEARCH.md rather than a GitHub releases URL (different source, same pin-then-fetch shape), and place the extracted binary under a build-tooling path (NOT `public/bin/${arch}/${platform}` — that convention is for BUNDLED runtime binaries; zig is a build-time-only toolchain, should NOT ship in the packaged app). `buildSteamBridgeShims.ts` should compile the arm64 helper with `clang` and write to `public/bin/${process.arch}/darwin/steam-bridge-helper` using the exact `exePath = join('public', 'bin', arch, platform, exeFilename)` + `chmod(exePath, '755')` pattern (non-win32 branch) from `downloadAsset` above — this is a direct 1:1 copy of the existing convention, per R5's "no electron-builder.yml change needed" finding.

---

### `src/backend/constants/paths.ts` (MODIFIED) — `steamBridgeHelperPath`

**Analog:** Same file, existing `fakeEpicExePath`/`galaxyCommunicationExePath` (lines 63-75, read in full)

**Full pattern**:
```typescript
export const publicDir = resolve(
  __dirname,
  '..',
  app.isPackaged || process.env.CI === 'e2e' ? '' : '../public'
)

export const fakeEpicExePath = fixAsarPath(
  join(publicDir, 'bin', 'x64', 'win32', 'EpicGamesLauncher.exe')
)

export const galaxyCommunicationExePath = fixAsarPath(
  join(publicDir, 'bin', 'x64', 'win32', 'GalaxyCommunication.exe')
)
```

**`fixAsarPath` helper to reuse (lines 86-91)**:
```typescript
export function fixAsarPath(origin: string): string {
  if (!origin.includes('app.asar.unpacked')) {
    return origin.replace('app.asar', 'app.asar.unpacked')
  }
  return origin
}
```

**Apply:** Add, immediately after the existing win32-only constants:
```typescript
export const steamBridgeHelperPath = fixAsarPath(
  join(publicDir, 'bin', process.arch, 'darwin', 'steam-bridge-helper')
)
```
Note the deviation from the existing constants: this one is `process.arch`-parameterized (not hardcoded `'x64'`) because the helper is a native arm64 binary and the existing constants are all win32 cross-platform binaries that don't vary by host arch. `electron-builder.yml`'s `mac.files` already includes `build/bin/${arch}/darwin/*` (verified, no config change needed) and `asarUnpack` already includes `build/bin/**/*`.

---

### `src/frontend/state/SteamBridgeSetup.ts` (NEW) — D-05 fallback dialog seam

**Analog:** `src/frontend/state/SteamBottleSetup.ts` (52 lines, read in full)

**Full pattern**:
```typescript
import type { IpcRendererEvent } from 'electron'
import { create } from 'zustand'
import { Runner } from 'common/types'

interface SteamBottleSetupState {
  isOpen: boolean
  appName?: string
  open: (appName: string) => void
  close: () => void
}

// Phase 17 (17-06), D-07: single global store driving the guided
// bottle-setup surface. Opened EXCLUSIVELY in response to the backend
// `steamBottleSetupRequired` push (see `handleSteamBottleSetupRequiredSignal`
// below, wired up once in GlobalState.tsx) — never by a frontend eligibility
// check on raw `gameInfo.is_mac_native`.
export const useSteamBottleSetup = create<SteamBottleSetupState>()((set) => ({
  isOpen: false,
  appName: undefined,
  open: (appName: string) => set({ isOpen: true, appName }),
  close: () => set({ isOpen: false })
}))

// Extracted as a standalone, directly-testable function (rather than an
// inline arrow registered in GlobalState.tsx) so unit tests can simulate the
// backend signal firing without mounting the GlobalState class component.
export const handleSteamBottleSetupRequiredSignal = (
  _e: IpcRendererEvent,
  { appName }: { appName: string }
): void => {
  useSteamBottleSetup.getState().open(appName)
}
```

**Apply:** `SteamBridgeSetup.ts` should follow this EXACT shape (zustand store + standalone testable handler function), but the state needs one more field per D-05's "explicit error dialog that offers to fall back" requirement — e.g. `reason?: string` and a `fallbackAvailable: boolean` — and the handler is wired to a NEW `steamBridgeSetupRequired` IPC event (matching `steamBottleSetupRequired`'s naming convention exactly, per RESEARCH.md Pattern 4's "identical shape to the existing... events"). The consumer component (`SteamBridgeSetup.tsx`, sibling of `SteamBottleSetup.tsx` under `src/frontend/screens/Game/GamePage/components/`) should call `showDialogBoxModalAuto` (see dialog.ts pattern below) with two buttons: fall back / cancel — D-11 says the fallback button triggers `provisionBottle()` on demand if not yet provisioned, then routes through the existing Phase 17 `install()`/`launch()` non-bridge branch.

---

### D-05 dialog wiring — `showDialogBoxModalAuto`

**Analog:** `src/backend/dialog/dialog.ts` (74 lines, read in full)

**Full pattern**:
```typescript
import { LogPrefix, logWarning } from 'backend/logger'
import { dialog, Notification } from 'electron'
import { ButtonOptions, DialogType } from 'common/types'
import { getMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { isSteamDeckGameMode } from 'backend/constants/environment'

function showDialogBoxModalAuto(props: {
  event?: Electron.IpcMainInvokeEvent
  title: string
  message: string
  type: DialogType
  buttons?: Array<ButtonOptions>
}) {
  if (props.event) {
    props.event.sender.send(
      'showDialog',
      props.title,
      props.message,
      props.type,
      props.buttons
    )
  } else {
    try {
      sendFrontendMessage(
        'showDialog',
        props.title,
        props.message,
        props.type,
        props.buttons
      )
    } catch (error) {
      logWarning(['showDialogBoxModalAuto:', error], LogPrefix.Backend)
      const window = getMainWindow()
      switch (props.type) {
        case 'ERROR':
          dialog.showErrorBox(props.title, props.message)
          break
        default:
          if (!window) break
          dialog.showMessageBox(window, {
            title: props.title,
            message: props.message,
            buttons: props.buttons?.map((button) => button.text) || []
          })
          break
      }
    }
  }
}
```

**Apply:** Do NOT use `showDialogBoxModalAuto` directly from `games.ts`'s bridge branch — per the existing project convention (RESEARCH.md Pattern 4, `steamBottleSetupRequired`/`steamClientSetupRequired`), the backend fires `sendFrontendMessage('steamBridgeSetupRequired', { appName, reason })` and the FRONTEND owns opening the actual dialog UI (the `SteamBridgeSetup.tsx` component, via `useSteamBridgeSetup`'s `isOpen` state — NOT a raw `showDialogBoxModalAuto` call). This keeps D-05 consistent with the two existing guided-setup surfaces rather than introducing a third dialog-invocation shape. `showDialogBoxModalAuto`'s `buttons: ButtonOptions[]` param is referenced in RESEARCH.md as available IF a simpler modal (rather than a bespoke component) is chosen instead — flag this as a planning decision, not a locked pattern.

---

### `runWineCommand` — bridge game direct-`.exe` launch (R6, no bottled steam.exe)

**Analog:** `src/backend/launcher.ts` `runWineCommand` (lines 1490-1650+, signature + core spawn shown) + `bottle.ts`'s `dispatchToBottledSteam` call-site convention (lines 856-885)

**Call-site convention to replicate** (`bottle.ts` lines 856-875 — the CX_BOTTLE / wait:false shape RESEARCH.md and CONTEXT.md both name):
```typescript
try {
  const { runWineCommand } = await import('backend/launcher')
  if (verb === 'install') {
    void raiseInstallerWindow('install')
  } else if (verb === 'launch') {
    void raiseBottledGameWindow('launch')
  }
  await runWineCommand({
    commandParts,
    gameSettings: getSteamBottleSettings(),
    wait: false,
    protonVerb: 'run',
    skipPrefixCheckIKnowWhatImDoing: true
  })
  return { status: 'done' }
} catch (error) {
  logError([`tellBottledSteamTo${verb}: runWineCommand failed`, error], LogPrefix.Steam)
  return { status: 'error', error: `Failed to dispatch ${verb} to bottled Steam: ${String(error)}` }
}
```

**`runWineCommand` signature/shape** (`launcher.ts` lines 1490-1506):
```typescript
async function runWineCommand({
  gameSettings,
  commandParts,
  wait,
  protonVerb = 'run',
  installFolderName,
  gameInstallPath,
  options,
  startFolder,
  skipPrefixCheckIKnowWhatImDoing = false,
  ignoreLogging = false
}: WineCommandArgs): Promise<{ stderr: string; stdout: string; code?: number }>
```

**Apply:** The bridge's `launch()` sub-branch calls `runWineCommand` DIRECTLY with `commandParts: [gameExePath]` (not `[steamExePath, '-applaunch', appId]` like the bottled path) and `startFolder` set to the game's own install directory (so the shim's `steam_appid.txt`/relative DLL search order resolves correctly) — this is the "genuinely different verb shape" RESEARCH.md's Pattern 4 flags as the single largest routing delta. `gameSettings` should resolve to the NEW bridge bottle's settings (a `getBridgeBottleSettings()` sibling of `getSteamBottleSettings()` in `bottle.ts`, pointed at the dedicated bridge bottle name per Pitfall 1/RESEARCH Pattern 4), not `getSteamBottleSettings()` itself, since that resolves the Phase 17 `GameLibSteam` bottle (which must NOT be reused for bridge games — R6 acceptance bar).

---

## Shared Patterns

### AppId numeric-guard (T-03-01 / T-17-04 / T-21-05 lineage)
**Source:** `bottle.ts:806` (`const NUMERIC_APP_ID = /^\d+$/`), `clientSetup.ts:40` (identical), `games.ts` (via `buildSteamProtocolUrl`)
**Apply to:** Every bridge function that accepts an appId from an untrusted/IPC-adjacent boundary (`allowlist.ts`'s `.has(appId)` lookup, `helperProcess.ts`'s `ensureBridgeHelperReady(appId)`, `shimGenerate.ts`'s placement function) — reuse the EXACT same regex constant name/value, do not redefine a slightly different one.
```typescript
const NUMERIC_APP_ID = /^\d+$/
if (!NUMERIC_APP_ID.test(appId)) {
  logWarning(`<fn>: rejected non-numeric appId "${appId}"`, LogPrefix.Steam)
  return { status: 'error', error: `Invalid appId: "${appId}"` }
}
```

### Argv-form subprocess spawn (never shell-interpolated)
**Source:** `src/backend/utils.ts` `spawnAsync` (L843-881), used throughout `bottle.ts`/`depot.ts`
**Apply to:** `importScan.ts` (objdump), `shimGenerate.ts`/`meta/buildSteamBridgeShims.ts` (zig cc, clang), any process invocation touching a user-controlled path (installed game `.exe` path, bottle name). ASVS V5 (RESEARCH Security Domain) explicitly calls this out — argv array form only, matching `sanitizeBottleName`/T-17-01 precedent.

### Bounded-poll readiness idiom
**Source:** `clientSetup.ts` `ensureSteamClientReady()` (L92-132) status-union shape; `bottle.ts` `raiseFrontmostBottledProcess()` (L355-436) retry-loop mechanics
**Apply to:** `helperProcess.ts`'s `ensureBridgeHelperReady()` — combine the STATUS-UNION return shape from the first with the ACTUAL POLL-LOOP mechanics (sleep/attempt-count/unref-timer-for-Jest-safety) from the second.

### Backend→frontend guided-setup signal naming
**Source:** `steamBottleSetupRequired` (`bottle.ts` install/launch/uninstall call sites in `games.ts`), `steamClientSetupRequired` (`clientSetup.ts` L112-115, L124-127)
**Apply to:** New `steamBridgeSetupRequired` event, fired via `sendFrontendMessage('steamBridgeSetupRequired', { appName: this.appId, reason: ... })` — same call shape, same `{ appName, reason }` payload convention (`reason` distinguishes sub-cases the way `'install'`/`'launch-once'` do for the client-setup event).

### Zustand store + standalone-testable IPC handler (frontend)
**Source:** `src/frontend/state/SteamBottleSetup.ts` (full file, 52 lines)
**Apply to:** `src/frontend/state/SteamBridgeSetup.ts` — `create<State>()` store + an exported non-inline `handle*Signal` function (so it's unit-testable without mounting `GlobalState.tsx`, per the project's no-jsdom frontend test constraint noted in `doc/frontend_testing.md`).

### Pinned-version + `public/bin/${arch}/${platform}/` binary bundling
**Source:** `meta/downloadHelperBinaries.ts` (`RELEASE_TAGS`, `downloadAsset`, L17-66)
**Apply to:** `meta/downloadZig.ts` (build-tool download, does NOT ship in bundle) and `meta/buildSteamBridgeShims.ts` (helper binary, DOES ship — target `public/bin/${process.arch}/darwin/steam-bridge-helper`). `electron-builder.yml`'s `mac.files: build/bin/${arch}/darwin/*` already covers this — no config change needed (RESEARCH.md R5, independently confirmed by reading `electron-builder.yml` L38-49).

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md / spike sources instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/backend/storeManagers/steam/bridge/protocol.ts` | utility | transform | No existing binary wire-framing code in the TS codebase — this phase introduces the first custom binary protocol. RESEARCH.md's Pattern 3 is the authoritative spec (frame layout, request_id correlation); treat that as the source of truth, not a codebase analog. |
| `native/steam-bridge/helper/bridge_helper.c` | service (native) | request-response | Native C, no in-repo TS/JS role to mirror. Direct precedent is `.claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_server.c` (spike, connect-per-call — must be upgraded to persistent-channel per D-03) — read that file directly during planning, not a `src/`-resident pattern. |
| `native/steam-bridge/generated/steam_api_shim.c` + `.def` | model (generated) | transform | Generated native output, no TS analog. Precedent: `.claude/skills/spike-findings-gamelib/sources/005c-min-steam_api-shim/` (flat exports) and `006-cpp-vtable-abi/steam_api_vt.c` (vtable ABI mechanism) — both spike sources, already independently cross-referenced against the live Steamworks SDK headers in RESEARCH.md Pattern 2. |
| `src/backend/storeManagers/steam/bridge/bridge-allowlist.json` (the JSON file itself) | config data | — | No existing bundled static JSON asset ships in this repo today (the CrossOver index is CI-published/gzipped, not committed as a static file) — only its zod SCHEMA (`crossover_index/schema.ts`) is a real analog. The JSON file's own shape is a new authoring task, guided by D-01/D-02, not a copy. |

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/` (bottle.ts, games.ts, clientSetup.ts, nativeInstallSetting.ts), `src/backend/dialog/`, `src/backend/launcher.ts`, `src/backend/constants/paths.ts`, `src/backend/crossover_index/schema.ts`, `src/backend/utils.ts` (spawnAsync), `src/frontend/state/` (SteamBottleSetup.ts), `meta/` (downloadHelperBinaries.ts, buildCrossoverIndex.ts), `electron-builder.yml`, plus graphify BFS traversal seeded on `games.ts`/`isBottleEligible`/`SteamGame` (239 nodes) and `dialog`/`SteamBottleSetup` (117 nodes).
**Files scanned:** 14 read directly (full or targeted-range), graphify-oriented before every raw read per project rule.
**Pattern extraction date:** 2026-07-18

---

*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
