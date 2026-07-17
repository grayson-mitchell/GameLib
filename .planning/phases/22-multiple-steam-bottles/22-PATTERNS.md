# Phase 22: Steam Game Families - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 17 (new + modified)
**Analogs found:** 17 / 17 (all have a direct in-codebase analog — this phase is a pure
generalization of Phase 17, not new-pattern territory)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/common/types/steam.ts` (reshape `SteamBottleConfig` → `SteamFamily`) | model | CRUD | same file, current flat `SteamBottleConfig` (lines 12-30) | exact (in-place reshape) |
| `src/backend/storeManagers/steam/electronStores.ts` (store type param only) | config | CRUD | same file (lines 10-17) | exact (in-place) |
| `src/backend/storeManagers/steam/families.ts` (NEW) | service | CRUD | `src/backend/storeManagers/steam/bottle.ts` (path/guard helpers, `provisionBottle`) | role-match (new file, but every operation clones an existing `bottle.ts` primitive) |
| `src/backend/storeManagers/steam/bottle.ts` (`getSteamBottleSettings`, `dispatchToBottledSteam`, `tellBottledSteamTo*` signature changes) | service | CRUD / request-response | same file's ALREADY-family-ready `isBottleReady(bottleName?)` (lines 233-258) | exact (sibling function in same file) |
| `src/backend/storeManagers/steam/games.ts` (`install`/`launch`/`uninstall`/`getSettings`) | controller | request-response | same file's existing `isBottleEligible()`-gated blocks (lines 560-611, 897-937, 1000-1019) | exact (in-place restructure) |
| `src/backend/storeManagers/steam/library.ts` (`buildBottleInstalledMap`, `getBottleSteamappsRoot`, `readAcfState`, `startInstallPolling`) | service | batch / event-driven | same file's native multi-root precedent, `buildInstalledMap()` / `readAcfState(source='native')` (lines 1008-1120) | exact (native path is the multi-root template) |
| `src/backend/main.ts` (fold `steamBottleStatus`/`steamBottleProvision`/`isSteamBottleProvisioned` into family IPC group) | controller | request-response | same file, existing Steam IPC block (lines 940-962) | exact (in-place) |
| `src/backend/storeManagers/steam/__tests__/families.test.ts` (NEW) | test | — | `src/backend/storeManagers/steam/__tests__/bottle.test.ts` (mock strategy, lines 1-90) | exact (same mock strategy: graceful-fs, electron, electronStores, backend/config, backend/utils, backend/launcher) |
| `src/backend/storeManagers/steam/__tests__/bottle.test.ts` (extend) | test | — | same file (existing) | exact |
| `src/backend/storeManagers/steam/__tests__/games.test.ts` (extend) | test | — | same file (existing) | exact |
| `src/backend/storeManagers/steam/__tests__/library.test.ts` (extend) | test | — | same file (existing) | exact |
| `src/frontend/state/SteamFamilyPicker.ts` (NEW) | store | request-response | `src/frontend/state/SteamInstallLocation.ts` (whole file, 40 lines) | exact (D-10 explicit clone target) |
| `src/frontend/screens/Game/GamePage/components/SteamFamilyPicker.tsx` (NEW) | component | request-response | `src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx` (whole file, 90 lines) | exact (D-10 explicit clone target) |
| `src/frontend/state/InstallGameModal.ts` (`startSteamInstall`/`openInstallGameModal` gain family-picker branch) | provider | request-response | same file, existing `startSteamInstall`/D-09 multi-library branch (lines 45-58) | exact (in-place, same shape) |
| `src/frontend/screens/Game/GamePage/index.tsx` (`handleInstall` Steam bypass at ~672) | component | request-response | same file, same bypass block (lines 672-684) | exact (in-place) |
| `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` + `src/frontend/state/SteamBottleSetup.ts` (parameterize by `bottleName`) | component + store | request-response | same files (whole files) | exact (in-place param add) |
| `src/frontend/screens/Settings/components/SteamFamilies.tsx` (NEW) + `.scss` | component | CRUD | `src/frontend/components/UI/TwoColTableInput/index.tsx` (row/icon pattern) + `src/frontend/screens/Settings/components/WineVersionSelector.tsx` (CrossOver-filtered selector) + `CrossoverBottle.tsx`/`EnableSteamNativeInstall.tsx`/`DefaultSteamPath.tsx` (Settings component shape) | role-match (new file, composite of 3 existing patterns) |
| `SteamFamilies.tsx` delete-confirmation call | event-driven | — | `src/frontend/helpers/library.ts` `handleStopInstallation` (lines 102-127) via `showDialogModal` | exact (D-09 explicit clone target) |

## Pattern Assignments

### `src/common/types/steam.ts` (model, CRUD)

**Analog:** same file, current shape (read in full this session)

**Current shape to replace** (lines 20-30):
```typescript
export type SteamBottleConfig = {
  bottleName: string
  wineVersion?: WineInstallation
  wineCrossoverBottle?: string
  provisioned: boolean
  // WR-02 (17-17): the former `loggedIn` field was removed...
}
```

**Target shape** (D-01/D-02/D-04 — must stay a `type`, not `interface`, per the existing
comment at line 17-19: "TypeScript only permits implicit index-signature assignability...
for type-literal aliases, not interfaces"):
```typescript
export type SteamFamily = {
  bottleName: string        // stable dir id, frozen at creation (D-01/D-02)
  displayName: string       // editable label, sanitized+unique (D-02/Req 9)
  wineVersion?: WineInstallation
  provisioned: boolean
}

export type SteamBottleConfig = {
  schemaVersion?: number                     // D-07: absence = pre-migration
  families: Record<string, SteamFamily>      // keyed by bottleName
  assignments: Record<string, string>        // appId -> bottleName
  lastUsedFamily?: string                    // D-03 soft default (Discretion A2)
}
```
Follow the WR-02 comment style precedent: document removed/renamed fields inline so a
future reader understands why the flat keys disappeared (mirror the existing WR-02
comment block).

---

### `src/backend/storeManagers/steam/electronStores.ts` (config, CRUD)

**Analog:** same file (whole file read this session, 79 lines)

No structural change needed — `steamBottleConfigStore` already generically typed via
`SteamBottleConfig` (line 71-77 re-exports the type). Only the imported type's shape
changes; the store construction (lines 14-17) is untouched:
```typescript
const steamBottleConfigStore = new TypeCheckedStoreBackend(
  'steamBottleConfigStore',
  { cwd: 'steam_store' }
)
```
This confirms D-04's "one store, reshaped in place" — no new `electron-store` instance,
no new `cwd`.

---

### `src/backend/storeManagers/steam/families.ts` (NEW — service, CRUD)

**Analog:** `src/backend/storeManagers/steam/bottle.ts` (whole file read this session, 905
lines) — every family CRUD operation is a thin wrapper composing existing `bottle.ts`
primitives; this file must NOT reimplement `cxbottle` invocation, sanitization, or the
CR-01 guard.

**Imports pattern to mirror** (bottle.ts lines 16-45):
```typescript
import { join } from 'path'
import { existsSync, rmSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  getBottleDir,
  sanitizeBottleName,
  isBottleReady,
  provisionBottle
} from './bottle'
import { steamBottleConfigStore } from './electronStores'
```

**Read-modify-write pattern (mandatory — RESEARCH.md Anti-Pattern)**: never replace the
whole `families` map on a single-entry mutation. Every family mutator must do:
```typescript
// Source: RESEARCH.md Anti-Patterns section (explicit warning) — pattern to follow
// for renameFamily/setFamilyWine/createFamily/deleteFamily
const families = steamBottleConfigStore.get_nodefault('families') ?? {}
steamBottleConfigStore.set('families', {
  ...families,
  [bottleName]: { ...families[bottleName], displayName }
})
```

**`sanitizeBottleName` reuse (D-02, verbatim — do not reimplement)** — `bottle.ts:156-169`:
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
`families.ts` must run this over `displayName` (D-02: "sanitizeBottleName + uniqueness
are enforced on the editable displayName"), then run `slug()` (new, local, per RESEARCH
"Don't Hand-Roll" — no external slugify dependency) over the sanitized value to derive
`bottleName`, checking `Object.keys(families)` for collisions before freezing it.

**`provisionBottle` reuse — the ONLY create path (Pitfall 3)** — `bottle.ts:540-802`. Every
new-family creation path (`createFamily` IPC handler, "New family…" inline creation) MUST
call `provisionBottle({ bottleName, wineVersion })` — never a second
`spawnAsync(CXBOTTLE_BIN, ['--create', ...])` call site. This is what keeps the CR-01
shared-bottle guard (lines 556-581) authoritative for every family, not just Default.

**Delete semantics (D-09) — pattern for `deleteFamily`:**
```typescript
// Source: pattern derived from bottle.ts's killBottleWineServer (lines 505-523) +
// provisionBottle's win32-recreate delete sequence (lines 605-624) + D-09
export async function deleteFamily(bottleName: string): Promise<{status:'done'|'error', error?: string}> {
  const families = steamBottleConfigStore.get_nodefault('families') ?? {}
  if (Object.keys(families).length <= 1) {
    return { status: 'error', error: 'Cannot delete the only remaining family' } // Req 5 guard
  }
  await killBottleWineServer(bottleName) // reuse — never a bare `wineserver -k`
  try {
    await spawnAsync(CXBOTTLE_BIN, ['--bottle', bottleName, '--delete', '--force'])
  } catch (error) { /* log + fallback rmSync(getBottleDir(bottleName)) — mirror provisionBottle's fallback */ }
  const { [bottleName]: _removed, ...remainingFamilies } = families
  steamBottleConfigStore.set('families', remainingFamilies)
  // D-09: clear assignment + mark uninstalled for every affected game — see games.ts/library.ts owner
}
```
NOTE: `killBottleWineServer` and `CXBOTTLE_BIN`/`WINESERVER_BIN`/`CX_ROOT` are currently
private (unexported) in `bottle.ts` — `families.ts` needs them exported from `bottle.ts`
(mechanical export addition, not a new mechanism) rather than re-declared.

**`resolveFamilyForApp` (D-05) — the routing chokepoint:**
```typescript
// Source: RESEARCH.md "Resolver shape" code example, verified against
// steamBottleConfigStore.get_nodefault + isBottleReady(bottleName?) (bottle.ts:233)
export function resolveFamilyForApp(
  appId: string
): { status: 'ok'; bottleName: string } | { status: 'needs-provision'; bottleName: string } {
  const assignments = steamBottleConfigStore.get_nodefault('assignments') ?? {}
  const lastUsedFamily = steamBottleConfigStore.get_nodefault('lastUsedFamily')
  const migratedBottle = /* the D-07 migration's recorded family name — see migration module */
  const bottleName = assignments[appId] ?? lastUsedFamily ?? migratedBottle
  return isBottleReady(bottleName)
    ? { status: 'ok', bottleName }
    : { status: 'needs-provision', bottleName }
}
```
Anti-pattern to avoid (RESEARCH.md explicit): this function must NOT re-derive
`isBottleEligible()` — it assumes the caller (games.ts) already confirmed eligibility, and
focuses purely on "which bottle."

---

### `src/backend/storeManagers/steam/bottle.ts` (service, CRUD/request-response — signature changes only)

**Analog:** same file's already-family-ready sibling functions (`isBottleReady`,
`isBottleProvisioned` — both already accept optional `bottleName`, lines 184-258)

**`getSteamBottleSettings()` — current (zero-arg, flat-key) shape to replace** (lines
266-279):
```typescript
export function getSteamBottleSettings(): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  const storedWineVersion = steamBottleConfigStore.get_nodefault('wineVersion')
  const storedBottleName = steamBottleConfigStore.get_nodefault('wineCrossoverBottle')
  return {
    ...globalSettings,
    wineCrossoverBottle: storedBottleName ?? DEFAULT_STEAM_BOTTLE_NAME,
    wineVersion: storedWineVersion ?? globalSettings.wineVersion
  }
}
```
**Target shape** (RESEARCH.md Pattern 1, MUST preserve the `?? globalSettings.wineVersion`
fallback — Pitfall 2 — a freshly-created not-yet-provisioned family has no `wineVersion`
yet):
```typescript
export function getSteamBottleSettings(bottleName: string): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  const family = steamBottleConfigStore.get_nodefault('families')?.[bottleName]
  return {
    ...globalSettings,
    wineCrossoverBottle: bottleName, // D-01/D-02: bottleName IS the CrossOver id now
    wineVersion: family?.wineVersion ?? globalSettings.wineVersion
  }
}
```

**`dispatchToBottledSteam`/`tellBottledSteamTo*` — current shape** (lines 819-904, full
text read this session): currently `appId`-only, reads
`steamBottleConfigStore.get_nodefault('bottleName') ?? DEFAULT_STEAM_BOTTLE_NAME`
internally (lines 838-840). Target: add `bottleName: string` as a required second
parameter to `dispatchToBottledSteam` and all three `tellBottledSteamTo{Install,Launch,
Uninstall}` exports, threading it into `getBottleSteamExePath(bottleName)` (already
accepts it, line 145) and `getSteamBottleSettings(bottleName)` (see above). Every other
line of the function (numeric-appId guard at 823-829, `isBottleReady(bottleName)` at
831-836, the switch/runWineCommand dispatch at 843-885) stays structurally identical —
this is a pure parameter-threading change, per RESEARCH Pattern 1's framing.

**`provisionBottle` — SIGNATURE unchanged, but its BODY's persistence MUST change
(Blocker 1).** It already accepts `{ bottleName?, wineVersion? }` (line 540-543) and
already runs the CR-01 guard (lines 556-581) against whatever `bottleName` is passed —
that seam is fine. BUT its body has SIX flat-key writes that the D-04 reshape deletes from
the type: `.set('bottleName', ...)` (L584), `.set('wineCrossoverBottle', ...)` (L585),
`.set('wineVersion', ...)` (L587), `.set('provisioned', false)` (L641),
`.set('wineVersion', ...)` (L744), `.set('provisioned', true)` (L793) — plus a seventh in
`isBottleReady`'s self-heal (L253-254). All seven MUST convert to `families[bottleName]`
read-modify-write (upsert; drop the `wineCrossoverBottle` write — bottleName IS the
CrossOver id) in the SAME wave that removes the flat keys, or `tsc`/`codecheck`/
`bottle.test.ts` (ts-jest type-checks on transform, no `isolatedModules`) can never pass.
Also drop the now-dead `get_nodefault('bottleName')` fallback READS in `isBottleProvisioned`
(L187) and `isBottleReady` (L236) — always `undefined` post-migration, silently collapsing
to `DEFAULT_STEAM_BOTTLE_NAME`. This is Plan 01 Task 2/3 scope; no later plan re-touches
`bottle.ts`. Separately, the stored `SteamFamily.provisioned` flag is best-effort only —
`listFamilies`/`familyStatusForApp` derive the reported `provisioned` LIVE via
`isBottleReady(bottleName)` (Blocker 3, Plan 02), never from the stored flag.

---

### `src/backend/storeManagers/steam/games.ts` (controller, request-response)

**Analog:** same file's existing `install()` bottle-eligible block (lines 560-611) —
extend in place, do not duplicate.

**Current shape (install, to be replaced), lines 560-611:**
```typescript
async install(args: InstallArgs): Promise<InstallResult> {
  await this.ensurePlatformsCaptured()
  if (this.isBottleEligible()) {
    if (!isBottleReady()) {
      sendFrontendMessage('steamBottleSetupRequired', { appName: this.appId })
      return { status: 'done', deferredToSetup: true }
    }
    if (isSteamNativeInstallEnabled()) return this.installBottleNative(args)
    const result = await tellBottledSteamToInstall(this.appId)
    if (result.status !== 'done') return { status: 'error', error: result.error }
    startInstallPolling(this.appId, { source: 'bottle' })
    return { status: 'done' }
  }
  // ...unchanged native path
}
```
**Target shape (D-05 — resolver-first, per RESEARCH.md Pattern 2):**
```typescript
async install(args: InstallArgs): Promise<InstallResult> {
  await this.ensurePlatformsCaptured()
  if (this.isBottleEligible()) {
    const resolved = resolveFamilyForApp(this.appId)
    if (resolved.status === 'needs-provision') {
      sendFrontendMessage('steamBottleSetupRequired', {
        appName: this.appId,
        bottleName: resolved.bottleName // NEW field — Pitfall 4
      })
      return { status: 'done', deferredToSetup: true }
    }
    if (isSteamNativeInstallEnabled()) return this.installBottleNative(args, resolved.bottleName)
    const result = await tellBottledSteamToInstall(this.appId, resolved.bottleName)
    if (result.status !== 'done') return { status: 'error', error: result.error }
    startInstallPolling(this.appId, { source: 'bottle', bottleName: resolved.bottleName })
    return { status: 'done' }
  }
  // ...unchanged native path
}
```
Apply the identical restructure to `launch()` (lines 912-937, `isBottleEligible` at 919) and
`uninstall()` (lines 1000-1019, `isBottleEligible` at 1002) and `getSettings()`'s bottle
branch. **Pitfall 1 mitigation (mandatory):** grep for all 4 `isBottleEligible()` call sites
before considering D-05 done (`getSettings`, `install` L562, `launch` L919, `uninstall`
L1002) and, per RESEARCH.md's explicit recommendation, factor the resolver-check +
needs-provision branch into ONE shared private helper on `SteamGame` (e.g.
`resolveOrRequestSetup()`) rather than pasting the branch 4 times — this is a deliberate
deviation from "clone the existing shape 4x" toward "extract the now-common shape once,"
justified by RESEARCH.md's own Pitfall 1 warning.

`isBottleEligible()` itself (lines 819-831) is UNCHANGED — it stays the single source of
truth for "should this route through a bottle at all"; `resolveFamilyForApp` must never
re-derive it (Anti-Pattern, confirmed above).

---

### `src/backend/storeManagers/steam/library.ts` (service, batch/event-driven)

**Analog:** the file's own native multi-root precedent, `readAcfState`'s native branch
(lines 1008-1066, full text read this session) — the bottle branch must mirror this
shape, not the current single-root bottle code.

**Current single-root bottle helper to generalize** (lines 62-64):
```typescript
function getBottleSteamappsRoot(): string {
  return getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)
}
```
**Current single-root `buildBottleInstalledMap()` to generalize** (lines 1077-1120, full
text read this session) — scans ONE `steamappsDir`. **Target (D-06, RESEARCH.md Pattern
3):**
```typescript
// Source: pattern derived from native readAcfState's steamappsDirs.map() loop
// (library.ts:1026-1029) applied to the bottle side + D-06
export async function buildBottleInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string; bottleName: string }>
> {
  const installed = new Map<number, { installPath: string; sizeOnDisk: string; bottleName: string }>()
  const families = steamBottleConfigStore.get_nodefault('families') ?? {}
  for (const bottleName of Object.keys(families)) {
    const steamappsDir = getBottleSteamappsDir(bottleName)
    if (!existsSync(steamappsDir)) continue
    let files: string[]
    try { files = readdirSync(steamappsDir) } catch { continue }
    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue
        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        if ((stateFlags & 4) !== 0 && !isNaN(appid)) {
          installed.set(appid, {
            installPath: join(steamappsDir, 'common', state.installdir ?? ''),
            sizeOnDisk: state.SizeOnDisk ?? '0',
            bottleName // NEW — D-05/D-09 need to know which family a hit came from
          })
        }
      } catch { /* skip corrupt ACF — T-2-01/T-17-05, unchanged discipline */ }
    }
  }
  return installed
}
```
`readAcfState(appId, source)` (lines 1008-1066) needs a parallel change: when `source ===
'bottle'`, its single-element `[getBottleSteamappsRoot()]` array (line 1028) must become
`Object.keys(families).map(getBottleSteamappsDir)` — mirroring the native branch's own
`(await getSteamLibraries()).map(...)` (line 1029) exactly. `startInstallPolling` /
`pollInstallOnce` (lines 1134-1159, 1273+) need an explicit `bottleName` threaded in
alongside `source: 'bottle'` so the single-appId targeted poll knows which family's root
to read — do not silently default it via `getSteamBottleSettings()`.

**Bit-mask discipline (preserve exactly, do not "simplify" to equality)** — every ACF
consumer above uses `(stateFlags & 4) !== 0`, never `stateFlags === 4`. This is
called out as "Pitfall 6" precedent in the existing `buildBottleInstalledMap` comment
(line 1105) and must be preserved verbatim in the multi-family version.

---

### `src/backend/main.ts` (controller, request-response) — IPC fold-in (D-12)

**Analog:** same file's existing Steam bottle IPC block (lines 940-962, full text read
this session):
```typescript
addHandler('steamBottleProvision', async (event, args) => provisionBottle(args))
addHandler('isSteamBottleProvisioned', async () => isBottleProvisioned())
addHandler('steamBottleStatus', async () => ({
  provisioned: steamBottleConfigStore.get_nodefault('provisioned') ?? false,
  bottleName: steamBottleConfigStore.get_nodefault('bottleName') ?? DEFAULT_STEAM_BOTTLE_NAME
}))
```
**Target:** replace this three-handler block with the D-12 family group, following the
exact `addHandler('name', async (event, args) => fn(args))` shape already established
(mirrors `steamStartCredentials`/`steamSubmitGuard` above it, lines 915-922, for
multi-arg handlers):
```typescript
addHandler('listFamilies', async () => listFamilies())
addHandler('createFamily', async (event, displayName) => createFamily(displayName))
addHandler('renameFamily', async (event, bottleName, displayName) => renameFamily(bottleName, displayName))
addHandler('deleteFamily', async (event, bottleName) => deleteFamily(bottleName))
addHandler('setFamilyWine', async (event, bottleName, wineVersion) => setFamilyWine(bottleName, wineVersion))
addHandler('assignGameToFamily', async (event, appId, bottleName) => assignGameToFamily(appId, bottleName))
addHandler('familyStatusForApp', async (event, appId) => familyStatusForApp(appId))
```
**Hard-removal requirement (Pitfall 5):** delete `steamBottleProvision`/
`isSteamBottleProvisioned`/`steamBottleStatus` entirely rather than leaving them
alongside the new group — the flat `bottleName`/`provisioned` keys they read no longer
exist post-D-04, so leaving them "for compatibility" produces a silent wrong-family read.
Per RESEARCH.md: prefer this surfacing as a TypeScript compile error (flat keys genuinely
removed from `SteamBottleConfig`) over a runtime bug.

---

### `src/frontend/state/SteamFamilyPicker.ts` (NEW — store, request-response)

**Analog:** `src/frontend/state/SteamInstallLocation.ts` (whole file, 40 lines, read this
session) — **clone almost verbatim** (D-10 explicit instruction).

**Full analog to clone:**
```typescript
import { create } from 'zustand'
import { GameInfo } from 'common/types'

export interface SteamLibraryOption {
  path: string
  steamappsDir: string
  isPrimary: boolean
}

interface SteamInstallLocationState {
  isOpen: boolean
  appName?: string
  gameInfo: GameInfo | null
  libraries: SteamLibraryOption[]
  open: (appName: string, gameInfo: GameInfo, libraries: SteamLibraryOption[]) => void
  close: () => void
}

export const useSteamInstallLocation = create<SteamInstallLocationState>()((set) => ({
  isOpen: false,
  appName: undefined,
  gameInfo: null,
  libraries: [],
  open: (appName, gameInfo, libraries) => set({ isOpen: true, appName, gameInfo, libraries }),
  close: () => set({ isOpen: false })
}))
```
**Target shape** — same field names/pattern, swap `SteamLibraryOption`/`libraries` for a
family list shape per UI-SPEC Surface 1 (`{ isOpen, appName, gameInfo, families, open(),
close() }`):
```typescript
export interface SteamFamilyOption {
  bottleName: string
  displayName: string
  provisioned: boolean
}

interface SteamFamilyPickerState {
  isOpen: boolean
  appName?: string
  gameInfo: GameInfo | null
  families: SteamFamilyOption[]
  preselected?: string // D-03 soft default, computed backend-side (never re-derived client-side)
  open: (appName: string, gameInfo: GameInfo, families: SteamFamilyOption[], preselected?: string) => void
  close: () => void
}
```

---

### `src/frontend/screens/Game/GamePage/components/SteamFamilyPicker.tsx` (NEW — component, request-response)

**Analog:** `SteamInstallLocationPicker.tsx` (whole file, 90 lines, read this session) —
clone the exact `Dialog`/`DialogHeader`/`DialogContent`/`DialogFooter` shape, the
`useEffect` pre-selection seeding, the null-guard, and the confirm/cancel button pair.

**Structural pattern to copy verbatim** (imports, lines 1-11; gate, line 32-34; footer
buttons, lines 74-85):
```typescript
import { Dialog, DialogContent, DialogFooter, DialogHeader } from 'frontend/components/UI/Dialog'
// ...
if (!isOpen || !appName || !gameInfo) {
  return null
}
// ...
<DialogFooter>
  <button onClick={handleConfirm} className="button is-primary">
    {t('button.install')}
  </button>
  <button onClick={handleCancel} className="button is-secondary outline">
    {t('box.cancel', 'Cancel')}
  </button>
</DialogFooter>
```
**Deviation from the analog (per UI-SPEC Surface 1):** the analog's `<select>` lists
libraries only; the family picker's `<select>` must append a final `"New family…"`
`<option value="__new__">` and, on confirm with that value selected, create the family
inline then chain into `useSteamBottleSetup.getState().open(appName, newBottleName)`
(Surface 2b) BEFORE calling `installSteamGame` — this sequencing (create → setup → then
install) is new orchestration logic not present in the analog and is the one place this
component genuinely diverges from a pure clone.

---

### `src/frontend/state/InstallGameModal.ts` (provider, request-response)

**Analog:** same file's existing `startSteamInstall` D-09 branch (lines 45-58, full file
read this session):
```typescript
export const startSteamInstall = async (appName: string, gameInfo: GameInfo) => {
  const libraries = await window.api.listSteamLibraryTargets()
  if (libraries.length > 1) {
    useSteamInstallLocation.getState().open(appName, gameInfo, libraries)
    return
  }
  installSteamGame(appName, gameInfo)
}
```
**Target shape** — same "fetch → branch on picker-needed → open store OR go straight to
install" shape, gated by bottle-eligibility (open question 1, RESEARCH.md recommends
folding an `eligible` flag into `familyStatusForApp`/`listFamilies` rather than mirroring
`isBottleEligible()` client-side):
```typescript
export const startSteamInstall = async (appName: string, gameInfo: GameInfo) => {
  const libraries = await window.api.listSteamLibraryTargets()
  if (libraries.length > 1) {
    useSteamInstallLocation.getState().open(appName, gameInfo, libraries)
    return
  }
  const familyStatus = await window.api.familyStatusForApp(appName) // includes eligible flag
  if (familyStatus.eligible) {
    const { families, preselected } = await window.api.listFamilies()
    useSteamFamilyPicker.getState().open(appName, gameInfo, families, preselected)
    return
  }
  installSteamGame(appName, gameInfo)
}
```
The `runner === 'steam' && action === 'install' && gameInfo` chokepoint in
`openInstallGameModal` (lines 71-74) itself is UNCHANGED — it already delegates to
`startSteamInstall`, so all new logic lives inside that function, per the existing
single-chokepoint design.

---

### `src/frontend/screens/Game/GamePage/index.tsx` (component, request-response) — second chokepoint (Pitfall 7)

**Analog:** same file's own Steam bypass block (lines 672-684, read this session):
```typescript
if (gameInfo.runner === 'steam' && !is_installed) {
  return window.api.install({
    appName, path: '', runner: 'steam', installDlcs: [], sdlList: [],
    installLanguage: 'en-US', platformToInstall: 'Windows', gameInfo
  })
}
```
This is the SECOND install chokepoint RESEARCH.md's Pitfall 7 warns about — it currently
calls `window.api.install` directly, bypassing `InstallGameModal.ts` entirely. It must
gain the SAME bottle-eligibility-gated family-picker branch as `startSteamInstall` above
(ideally by delegating to a shared helper exported from `InstallGameModal.ts` rather than
duplicating the eligibility-check + picker-open logic inline here) — the planner must
verify both call sites end up behind the picker, not just one.

---

### `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` + `src/frontend/state/SteamBottleSetup.ts` (component + store — parameterize by bottleName)

**Analog:** same two files, full text read this session (Pitfall 4's exact citations).

**Store — current shape to extend** (`SteamBottleSetup.ts`, whole file, 52 lines):
```typescript
interface SteamBottleSetupState {
  isOpen: boolean
  appName?: string
  open: (appName: string) => void
  close: () => void
}
export const handleSteamBottleSetupRequiredSignal = (
  _e: IpcRendererEvent,
  { appName }: { appName: string }
): void => {
  useSteamBottleSetup.getState().open(appName)
}
export const isSteamBottleSetupActiveFor = (
  state: { isOpen: boolean; appName?: string },
  appName: string,
  runner: Runner
): boolean => {
  return state.isOpen && state.appName === appName && runner === 'steam'
}
```
**Target:** add `bottleName` alongside `appName` throughout — `open(appName, bottleName)`,
`{ appName, bottleName }` in the signal payload, and thread `bottleName` into
`isSteamBottleSetupActiveFor`'s state shape (used by both the toast AND
`GamePage/index.tsx`'s `settingUpBottle` gate at line 174 — do not change that gate's
call-site contract without updating both consumers).

**Component — the seeding bug to fix (Pitfall 4)** — `SteamBottleSetup.tsx` lines 87-91:
```typescript
// ALWAYS the dedicated Steam bottle, never the user's shared GOG/Epic
// bottle (globalConfig.wineCrossoverBottle)...
setCrossoverBottle(DEFAULT_STEAM_BOTTLE_NAME)
```
Must become `setCrossoverBottle(bottleName)` (the prop from the store), never the
hardcoded constant — otherwise every "New family" provision silently reprovisions
`GameLibSteam` instead of the new family.

**Polling target to fix (Pitfall 5)** — lines 104-119, currently
`window.api.steamBottleStatus()` (no args, global): must become a bottleName-scoped call
(e.g. reuse `familyStatusForApp` or a small per-bottle status helper) so provisioning
progress for a non-Default family is not silently read from the wrong (stale/removed)
global key.

**`handleConfirm` — current shape to extend** (lines 129-140):
```typescript
const handleConfirm = async () => {
  setPhase('provisioning')
  setProvisionError(undefined)
  const result = await window.api.steamBottleProvision({
    bottleName: crossoverBottle || undefined,
    wineVersion
  })
  if (result.status === 'error') { setProvisionError(result.error); setPhase('error') }
}
```
This shape is already correct — `steamBottleProvision` already accepts `bottleName` — the
only change needed is that `crossoverBottle` must be seeded from the family prop (above),
not the constant.

---

### `src/frontend/screens/Settings/components/SteamFamilies.tsx` + `.scss` (NEW — component, CRUD)

**Analog composite** — three existing patterns, all read this session:

**(a) Settings-component shape** — `EnableSteamNativeInstall.tsx` (whole file, 44 lines,
`isDefault`-gated) vs. `EnableDXVKFpsLimit.tsx` (whole file, 66 lines, feature-gated via
multiple conditions incl. platform). Per UI-SPEC, `SteamFamilies` is gated by `isMac` (not
`isDefault` — families are account-level, not per-game). Mirror `EnableDXVKFpsLimit`'s
early-return-`<></>` gate style but on `isMac`:
```typescript
// Source: pattern derived from EnableDXVKFpsLimit.tsx's platform/engine gate (lines 22-30)
// applied to isMac instead of isWin/isLinuxNative/isMacNative
if (!isMac) {
  return <></>
}
```

**(b) Row/icon-button pattern** — `TwoColTableInput/index.tsx`'s `TableInput` (whole file,
234 lines, read this session). Reuse its exact icon-button conventions (do NOT reuse the
component itself — UI-SPEC is explicit that a 3-column semantic row is needed, not the
generic 2-col key/value editor):
```typescript
// Source: TwoColTableInput/index.tsx lines 158-169 — icon-button pattern to mirror
<SvgButton onClick={() => editRow(row)}>
  <EditIcon style={{ color: 'var(--accent)' }} fontSize="large" />
</SvgButton>
<SvgButton onClick={() => removeRow(row)}>
  <RemoveCircleIcon style={{ color: 'var(--danger)' }} fontSize="large" />
</SvgButton>
```
and the "add" action icon (line 198-206):
```typescript
<SvgButton onClick={() => addRow(...)} className="is-primary">
  <AddBoxIcon style={{ color: 'var(--success)' }} fontSize="large" />
</SvgButton>
```
Per UI-SPEC's accessibility requirement (not in the analog — a NEW requirement this phase
adds), every icon-only button here must ALSO carry `aria-label` + `title` — the analog
component does NOT do this today, so do not copy that omission.

**(c) Settings placement + registration** — `GeneralSettings/index.tsx` (lines 1-55, read
this session): components are plain named imports from the `../../components` barrel,
rendered in JSX sequence under one `<h3 className="settingSubheader">` heading:
```typescript
import { DefaultSteamPath, EnableSteamNativeInstall /* ...+ SteamFamilies */ } from '../../components'
// ...
<DefaultSteamPath />
<EnableSteamNativeInstall />
{/* <SteamFamilies /> — new, directly adjacent per D-11 */}
```
Register the new component in the barrel exactly like every existing entry —
`src/frontend/screens/Settings/components/index.ts`:
```typescript
export { default as SteamFamilies } from './SteamFamilies'
```
(mirrors line 14's `export { default as CrossoverBottle } from './CrossoverBottle'`).

**(d) CrossOver-filtered Wine-version dropdown** — `WineVersionSelector.tsx` (whole file,
228 lines, read this session). Reuse its `SelectField` + icon-prefixed `MenuItem`
rendering convention (lines 136-149, 220-225) but filter the options list to
`altWine.filter(w => w.type === 'crossover')` before mapping — SPEC requires GPTK/toolkit/
plain Wine never appear for a family.

---

### Delete-confirmation dialog (Req 5, D-09) — `showDialogModal` reuse

**Analog:** `src/frontend/helpers/library.ts`'s `handleStopInstallation` (lines 102-127,
read this session) — the exact `showDialogModal` call shape to mirror:
```typescript
function handleStopInstallation(
  appName: string, path: string, t, progress, runner,
  showDialogModal: (options: DialogModalOptions) => void
) {
  showDialogModal({
    title: t('gamepage:box.stopInstall.title'),
    message: t('gamepage:box.stopInstall.message'),
    buttons: [
      { text: t('gamepage:box.stopInstall.keepInstalling') },
      { text: t('box.yes'), onClick: () => { /* ...the destructive action... */ } }
    ]
  })
}
```
`showDialogModal` itself is sourced from `ContextProvider` (default no-op stub at
`ContextProvider.tsx:102`, real implementation provided by `GlobalState.tsx`) — access it
via `useContext(ContextProvider)` inside `SteamFamilies.tsx`, exactly as `library.ts`
receives it as a parameter from its caller. UI-SPEC's exact target call shape (already
fully specified in `22-UI-SPEC.md` Surface 3) is a direct instantiation of this pattern —
no new dialog primitive needed.

## Shared Patterns

### bottleName threading (extends Phase 17's built seam)
**Source:** `src/backend/storeManagers/steam/bottle.ts` — `isBottleReady(bottleName?:
string)` (lines 233-258), `isBottleProvisioned(bottleName?: string)` (lines 184-190),
`getBottleDir`/`getBottleSteamappsDir`/`getBottleSteamExePath` (lines 65-147) — ALL
already accept an explicit `bottleName`.
**Apply to:** `getSteamBottleSettings`, `dispatchToBottledSteam`/`tellBottledSteamTo*`,
`getBottleSteamappsRoot`/`buildBottleInstalledMap`/`readAcfState` — bring these to the
same explicit-parameter shape rather than defaulting internally to a single stored value.

### Read-modify-write on Record-shaped store keys
**Source:** RESEARCH.md Anti-Patterns (no direct pre-existing code example — this is a
NEW discipline this phase introduces, since Phase 17's store had no `Record`-shaped keys).
**Apply to:** every `families.ts` mutator (`renameFamily`, `setFamilyWine`, `createFamily`,
`deleteFamily`) and the D-07 migration itself — never `.set('families', {...})` with a
single entry; always spread the existing map first.

### CR-01 shared-bottle guard (never bypass `provisionBottle`)
**Source:** `src/backend/storeManagers/steam/bottle.ts` lines 556-581 (verbatim, unchanged).
**Apply to:** `families.ts`'s `createFamily` and any "New family" inline-creation path —
must call `provisionBottle`, never a raw `cxbottle --create`.

### Fire-and-forget dispatch; ACF is truth (never optimistic)
**Source:** `bottle.ts`'s `dispatchToBottledSteam` docstring (lines 811-818) — "never
optimistically flips install state... the bottle-scoped ACF poller owns real status."
**Apply to:** every per-family `tellBottledSteamTo*` call site in `games.ts` — preserve
this discipline per-family, exactly as today.

### `isMac`-gated Steam surfaces
**Source:** `bottle.ts`'s dynamic `isMac` import pattern (line 364,
`await import('backend/constants/environment')`) on the backend; `EnableDXVKFpsLimit.tsx`'s
early-return gate (lines 22-30) on the frontend.
**Apply to:** `SteamFamilies.tsx` (isMac gate), and any new backend family code path that
should be a no-op on Linux/Windows (families are macOS/CrossOver-only per SPEC).

### `showDialogModal` for every destructive in-app confirm
**Source:** `src/frontend/helpers/library.ts`'s `handleStopInstallation` (lines 102-127).
**Apply to:** `SteamFamilies.tsx`'s delete-family confirmation — the ONLY destructive
confirm mechanism this codebase uses; never a bespoke modal.

## No Analog Found

None. Every file in this phase's scope has a direct, concrete in-codebase analog —
consistent with RESEARCH.md's framing that "this phase's entire job is generalizing 1→N,
not solving new problems." Where a new file is genuinely NEW (`families.ts`,
`SteamFamilyPicker.ts`/`.tsx`, `SteamFamilies.tsx`/`.scss`), it is a composite clone of 2-3
existing analogs rather than an unprecedented pattern (documented per-file above).

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/*`, `src/backend/main.ts`,
`src/common/types/steam.ts`, `src/frontend/state/*`,
`src/frontend/screens/Game/GamePage/**`, `src/frontend/screens/Settings/**`,
`src/frontend/components/UI/TwoColTableInput/**`, `src/frontend/helpers/library.ts`
**Files scanned (graphify-oriented, then Read in full or targeted ranges):** 20
**Pattern extraction date:** 2026-07-17
