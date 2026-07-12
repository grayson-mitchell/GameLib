# Phase 18: macOS 32-bit detection, badge & CrossOver routing - Pattern Map

> ⚠️ **PARTIALLY SUPERSEDED (2026-07-12, direction-B pivot).** The **pre-install** patterns in this map — `ensureMacArchHint()`, `parseOsArchHint()`, and everything keyed on PICS `getProductInfo`/`osarch` (File Classification rows, the `games.ts ensureMacArchHint()` section, the `library.ts parseOsArchHint()` section, the `mac_arch_source: 'osarch'` enum, and the "Dedup-guarded lazy-fetch"/`parseOsArchHint` shared-pattern entries) — are **DEAD**. Plan 18-01's real appinfo dump proved Steam PICS carries no mac 32/64 signal. The pre-install source is now the store-API `mac_requirements.minimum` **min-OS heuristic** and `mac_arch_source` is `'minos' | 'macho'`. See **18-RESEARCH.md** (refreshed) and **18-02-PLAN.md** for the authoritative pre-install patterns. **Still valid and consumed by 18-03/18-04:** the Mach-O sections (`machOArchsOf`, `verifyMacArchGroundTruth`, `pollInstallOnce` hook), the `isBottleEligible()` `'32'` OR-branch, and all `MacArchBadge`/frontend sections below.

**Mapped:** 2026-07-12
**Files analyzed:** 9 (5 backend modified, 1 backend new-content-in-existing-file, 1 frontend new component, 1 types file, 3 test files extended/new)
**Analogs found:** 9 / 9 — this phase is unusually well-covered because RESEARCH.md already pinpointed exact integration lines and the codebase has a near-identical prior-phase pattern (`is_mac_native`/D-11) to mirror throughout.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `src/backend/storeManagers/steam/games.ts` (`ensureMacArchHint()`, `isBottleEligible()` extension) | service/controller method | request-response (RPC + cache) | same file: `ensurePlatformsCaptured()` (L479-505), `isBottleEligible()` (L451-455) | exact — same file, same class, mirrors an existing sibling method |
| `src/backend/storeManagers/steam/library.ts` (`parseOsArchHint`, `machOArchsOf`, `verdictFromArchs`, `locateMachOBinary`, `verifyMacArchGroundTruth`) | utility / service (transform + file I/O) | transform (PICS parse), file-I/O (Mach-O subprocess) | same file: `linuxFallbackRunningAppId()` (L1135-1146), `macOsRunningAppId()` (L1093-1110), `pollInstallOnce()` (L638-725) | exact — same file, same subprocess/parse conventions |
| `src/backend/storeManagers/steam/electronStores.ts` (`SteamMetadataCacheEntry` + `mac_arch`/`mac_arch_verified` fields) | model / config | CRUD (cache read/write) | same file: `is_mac_native?`/`platformsCaptured?` fields (L42-51) | exact — literally the field to mirror |
| `src/common/types.ts` (`GameInfo.mac_arch`) | model | CRUD | same file: `is_mac_native?: boolean` (L220) | exact |
| `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx` (new) | component | request-response (render from props) | `PlatformSupport.tsx` (whole file, 36 lines) | exact — same directory, same `{ gameInfo: GameInfo }` prop shape, same conditional-icon rendering style |
| `src/frontend/screens/Game/GamePage/components/index.tsx` (barrel export) | config/index | — | same file, existing export list (L1-18) | exact |
| `src/frontend/screens/Game/GamePage/index.tsx` (render `<MacArchBadge>` beside `.store-icon`) | component | request-response (render) | same file: `.mainInfo`/`.store-icon` block (L486-497), local `isMac` derivation (L165) | exact |
| `src/backend/storeManagers/steam/__tests__/macArch.test.ts` (new) | test | transform (pure-function fixtures) | `library.test.ts` child_process mock block (L103-107) + `games.test.ts` `isNative()` describe block (L561-626) | role-match — new file, but scaffolding lifted verbatim from two existing files |
| `src/backend/storeManagers/steam/__tests__/games.test.ts` (extend `isBottleEligible`/routing describes) | test | request-response | same file: `describe('SteamGame.isNative() — D-11 ...')` (L561-626), `describe('SteamGame.install() — Phase 17 bottle routing ...')` (L856+) | exact |
| `src/backend/storeManagers/steam/__tests__/library.test.ts` (extend Mach-O describes) | test | file-I/O | same file: existing `child_process` mock (L103-107), `envMock`/`resetMocks` pattern | exact |
| `src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx` (new) | test | request-response | sibling dir `components/__tests__/HumbleOriginInfo.test.tsx` (RTL component test) — dir already exists, contrary to RESEARCH.md's claim it doesn't | role-match |

## Pattern Assignments

### `src/backend/storeManagers/steam/games.ts` — `ensureMacArchHint()` (service method, request-response)

**Analog:** `ensurePlatformsCaptured()`, same file, lines 479-505.

**Imports already present in this file** (no new imports needed except `SteamUser`, which this file currently does NOT import — `library.ts` does):
```typescript
// games.ts:14-20 (existing)
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getFileSize } from 'backend/utils'
import type LogWriter from 'backend/logger/log_writer'
import { GameConfig } from 'backend/game_config'
import { isMac } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import { steamMetadataStore } from './electronStores'
```
**New import required:** `import { SteamUser } from './user'` — `library.ts:` already does this (`import { SteamUser } from './user'`); `games.ts` does not yet.

**Core pattern — the dedup-guarded lazy-fetch shape to mirror exactly** (`games.ts:479-505`):
```typescript
private async ensurePlatformsCaptured(): Promise<void> {
  if (!isMac) return

  const alreadyCaptured = (): boolean =>
    steamMetadataStore.get(this.appId)?.platformsCaptured === true

  if (alreadyCaptured()) return

  await this.fetchMetadataIfNeeded(this.getGameInfo())

  if (!alreadyCaptured() && pendingFetches.has(this.appId)) {
    const deadline = Date.now() + METADATA_FETCH_TIMEOUT_MS
    while (
      !alreadyCaptured() &&
      pendingFetches.has(this.appId) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
```
`ensureMacArchHint()` follows the same isMac-guard / already-resolved-guard / try-network-call / persist-to-steamMetadataStore shape, but its network call is a one-shot `getProductInfo` RPC (not the dedup-pool `fetchMetadataIfNeeded`) — RESEARCH.md's Pattern 2 already has the concrete body drafted against this exact analog; use it verbatim, just add the `try/catch` + `logWarning` shape from `fetchMetadataIfNeeded`'s own catch block (`games.ts:311-316`, same file) for the network-failure path:
```typescript
// games.ts:311-316 (existing catch pattern to mirror)
} catch (err) {
  logWarning(
    [`Steam metadata fetch failed for appId ${this.appId}:`, err],
    LogPrefix.Steam
  )
}
```

**Call-site integration** — `install()`/`launch()`/`uninstall()` already `await this.ensurePlatformsCaptured()` as the first line before consulting `isBottleEligible()` (`games.ts:373`, `L?` in launch/uninstall per RESEARCH.md's routing map). Add `await this.ensureMacArchHint()` alongside it, same call sites, same ordering (mirrors the existing two-guard pattern; do not add a new decision point ordering ambiguity — CONTEXT.md's Open Question #2 in RESEARCH.md recommends synchronous await, matching `ensurePlatformsCaptured`).

---

### `src/backend/storeManagers/steam/games.ts` — `isBottleEligible()` extension (routing, request-response)

**Analog:** same function, same file, lines 451-455 (the exact function being extended, not a separate analog).

**Current code (the single source of truth to extend, not replace):**
```typescript
// games.ts:451-455
private isBottleEligible(): boolean {
  if (!isMac) return false
  const meta = steamMetadataStore.get(this.appId)
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}
```

**Pattern to apply (independent OR-branch, per CONTEXT.md + RESEARCH.md Pattern 3):**
```typescript
private isBottleEligible(): boolean {
  if (!isMac) return false
  const meta = steamMetadataStore.get(this.appId)
  // MAC32-02: confirmed 32-bit is bottle-eligible independent of is_mac_native
  // (which is TRUE for these games — appdetails only reports "has a mac depot").
  if (meta?.mac_arch === '32') return true
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}
```
Do NOT touch the existing `return` line's logic — add the new `if` above it. This preserves every existing `isNative()`/`isBottleEligible()` unit test in `games.test.ts:561-626` unchanged (regression guard already flagged in RESEARCH.md's Validation Architecture table).

---

### `src/backend/storeManagers/steam/electronStores.ts` — `SteamMetadataCacheEntry` field addition (model, CRUD)

**Analog:** same file, `is_mac_native?`/`platformsCaptured?` field block, lines 42-51.

**Exact pattern to mirror (doc-comment style + optional-field convention):**
```typescript
// electronStores.ts:39-51 (existing — the shape to copy)
export interface SteamMetadataCacheEntry {
  art_cover: string
  art_square: string
  extra: ExtraInfo
  is_mac_native?: boolean
  is_linux_native?: boolean
  is_delisted?: boolean
  platformsCaptured?: boolean
}
```
Add adjacent to `is_mac_native?`/`platformsCaptured?`:
```typescript
  /** MAC32-01/03: resolved macOS build architecture. 'unknown' default is
   * implicit (absent key) — NEVER infer '32' pre-install (the false-flag trap,
   * see games.ts isBottleEligible). Set from the store-API mac_requirements
   * min-OS heuristic pre-install (direction B); corrected by the post-install
   * Mach-O ground-truth check. */
  mac_arch?: '32' | '64' | 'unknown'
  /** True once the post-install lipo/file check has run and confirmed or
   * corrected mac_arch — prevents re-shelling-out on every launch(). */
  mac_arch_verified?: boolean
  /** MAC32-cache-shape (CONTEXT.md, direction B): provenance of the mac_arch
   * verdict — 'minos' (store-API mac_requirements min-OS pre-install hint) or
   * 'macho' (post-install ground truth, i.e. a Steam-corrected fact).
   * Forward-compat for a future community override export (Phase 19). */
  mac_arch_source?: 'minos' | 'macho'
```
Note: CONTEXT.md's cache shape is `appId → { arch, source }` — the flattened `mac_arch`/`mac_arch_verified`/`mac_arch_source` triple above achieves the same semantics while staying consistent with this store's existing flat-field convention (`is_mac_native`, `platformsCaptured` are flat booleans, not a nested object) — the planner should pick one shape and apply it consistently across `electronStores.ts`, `common/types.ts`, `games.ts`, and `library.ts`.

---

### `src/common/types.ts` — `GameInfo.mac_arch` (model, CRUD)

**Analog:** same file, `is_mac_native?: boolean` field, line 220 (directly requested by CONTEXT.md's Claude's Discretion section).

**Exact insertion point:**
```typescript
// types.ts:220-227 (existing)
  is_mac_native?: boolean
  is_linux_native?: boolean
  is_delisted?: boolean
  steamPlatformsCaptured?: boolean
```
Add `mac_arch?: '32' | '64' | 'unknown'` immediately after `is_mac_native?`/before `is_linux_native?`, matching the doc-comment style already used for `is_delisted?` and `steamPlatformsCaptured?` (both have `/** ... */` block comments explaining the phase/reconciliation rationale — do the same for `mac_arch`).

---

### `src/backend/storeManagers/steam/library.ts` — `parseOsArchHint()` (pure transform)

**Analog:** No direct pure-parser analog in this file (the closest existing parse function is the VDF `parse()` calls in `macOsRunningAppId()`/`linuxRegistryVdfRunningAppId()`, L1093-1128, which follow a "read → try/catch → return safe default" shape). RESEARCH.md's Pattern 1 already contains a complete, ready-to-use implementation — use it verbatim; it is not derived from a single codebase analog because `getProductInfo`/PICS appinfo parsing has no prior use in this codebase (RESEARCH.md confirms: "getProductInfo() is not currently called anywhere in the codebase — this phase is its first use").

**Safe-default try/catch shape to apply around the PICS RPC call itself** (mirrors `macOsRunningAppId`, `library.ts:1093-1110`):
```typescript
function macOsRunningAppId(): number {
  const regPath = join(userHome, 'Library', 'Application Support', 'Steam', 'registry.vdf')
  if (!existsSync(regPath)) return 0
  try {
    const content = readFileSync(regPath, 'utf-8')
    const parsed = parse(content)
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}
```
`parseOsArchHint()` is pure (no I/O, no try/catch needed inside it — the I/O/try-catch lives in `ensureMacArchHint()` in games.ts, one tier up). Use RESEARCH.md's Pattern 1 code directly:
```typescript
export function parseOsArchHint(appinfo: unknown): '32' | '64' | 'unknown' {
  const config = (appinfo as { config?: SteamAppInfoConfigLoose })?.config
  const launchEntries = config?.launch ? Object.values(config.launch) : []
  const macEntries = launchEntries.filter((entry) =>
    ['macos', 'osx'].includes((entry.config?.oslist ?? '').toLowerCase())
  )
  for (const entry of macEntries) {
    const arch = entry.config?.osarch
    if (arch === '32') return '32'
    if (arch === '64') return '64'
  }
  return 'unknown'
}
```

---

### `src/backend/storeManagers/steam/library.ts` — `machOArchsOf()` / Mach-O subprocess call (file-I/O, argv-form)

**Analog:** `linuxFallbackRunningAppId()`, same file, lines 1135-1146 — the exact `execFileSync` argv-form / try-catch-return-safe-default convention this codebase already uses for exactly this class of "shell out, parse text output, degrade gracefully" problem.

**Full analog to copy the shape from:**
```typescript
// library.ts:1135-1146 (existing — the exact convention to replicate)
function linuxFallbackRunningAppId(): number {
  try {
    const output = execFileSync('ps', ['-eo', 'args'], {
      encoding: 'utf8',
      timeout: 1000
    })
    const match = output.match(/reaper SteamLaunch --AppId (\d+)/)
    return match ? parseInt(match[1], 10) : 0
  } catch {
    return 0
  }
}
```
Existing top-of-file import already covers both functions needed:
```typescript
// library.ts:11 (existing)
import { spawnSync, execFileSync } from 'child_process'
```
`machOArchsOf`/`verdictFromArchs`/`locateMachOBinary` follow this exact try/execFileSync/regex-or-split/catch-return-safe-default shape — RESEARCH.md's Pattern 4/5 already have complete implementations matching this convention (argv-form array args, `encoding: 'utf8'`, bounded `timeout`, never a string-interpolated shell command — same discipline as `windowsRunningAppId`'s `spawnSync` call at L1073-1077).

**Windows analog for the `spawnSync` variant** (if a `file`-vs-`lipo` two-tool fallback chain needs the `spawnSync` form instead of `execFileSync` anywhere):
```typescript
// library.ts:1071-1086 (existing)
function windowsRunningAppId(): number {
  try {
    const result = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    if (result.status !== 0) return 0
    const match = result.stdout?.match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i)
    return match ? parseInt(match[1], 16) : 0
  } catch {
    return 0
  }
}
```

---

### `src/backend/storeManagers/steam/library.ts` — `verifyMacArchGroundTruth()` hook into `pollInstallOnce()` (event-driven, install-completion trigger)

**Analog:** `pollInstallOnce()`'s `'installed'` branch, same file, lines 687-723 — the exact place RESEARCH.md's Architecture Diagram identifies as the hook point (A4: "run at ACF-completion time").

**Integration point (existing code, read-only reference — do not restructure):**
```typescript
// library.ts:687-723 (existing 'installed' branch)
} else if (result.state === 'installed') {
  const existing = library.get(appId)
  if (existing) {
    const updated: GameInfo = {
      ...existing,
      is_installed: true,
      install: {
        install_path: result.installPath!,
        install_size: getFileSize(Number(result.sizeOnDisk!)),
        platform: installPlatformForSource(source)
      }
    }
    library.set(appId, updated)
    steamLibraryStore.set('games', Array.from(library.values()))
    sendFrontendMessage('pushGameToLibrary', updated)
  }
  sendFrontendMessage('gameStatusUpdate', { appName: appId, runner: 'steam', status: 'done' })
  notify({ title: existing?.title ?? '', body: i18next.t('notify.install.finished', 'Installation Finished') })
  stopInstallPolling(appId)
  ...
}
```
`verifyMacArchGroundTruth(appId, result.installPath!)` should be called as a fire-and-forget (not awaited — do not block the `'installed'` badge-flip UX) inside this branch, gated on `source === 'native'` (per RESEARCH.md's Anti-Patterns: "a bottle-installed game is a Windows depot — there is no macOS Mach-O binary to inspect") and `isMac` (host check — mirrors `ensurePlatformsCaptured`'s `if (!isMac) return` guard style from games.ts).

**`forceUninstall()` analog for the i386 recovery path (CONTEXT.md-locked, prompts user then reinstalls via bottle):**
```typescript
// games.ts:687-695 (existing — reuse directly, do not reimplement)
async forceUninstall(): Promise<void> {
  const info = this.getGameInfo()
  library.delete(this.appId)
  sendFrontendMessage('pushGameToLibrary', { ...info, is_installed: false })
  logInfo(
    `SteamGame: force-uninstalled appId ${this.appId} from in-memory library`,
    LogPrefix.Steam
  )
}
```
The `notify()` helper already used at `library.ts:714-717` (imported from `backend/dialog/dialog`) is the mechanism RESEARCH.md's Open Question #1 recommends for surfacing the "install won't run — reinstalling via CrossOver" explanation to the user; a confirm-gated dialog (not just a toast) will need `showDialogBoxModalAuto` — already mocked in both test files (`games.test.ts:85`, `library.test.ts:82-86`) as `notify: jest.fn(), showDialogBoxModalAuto: jest.fn()`, confirming the helper already exists and is the established dialog surface in this module.

---

### `src/frontend/screens/Game/GamePage/components/MacArchBadge.tsx` (new component, request-response render)

**Analog:** `PlatformSupport.tsx` — the entire file (36 lines), same directory. Best possible match: same `{ gameInfo: GameInfo }` prop, same conditional-icon rendering off `GameInfo` platform flags, same `useTranslation('gamepage')` namespace.

**Full analog (copy this shape):**
```typescript
// PlatformSupport.tsx (existing, full file)
import { useTranslation } from 'react-i18next'
import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

const PlatformSupport = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')

  return (
    <div className="platformSupport">
      <b>{t('info.supportedPlatforms', 'Supported platforms')}:</b>
      <span className="platformSupport__icons">
        <FontAwesomeIcon icon={faWindows} title="Windows" />
        {gameInfo.is_mac_native && (
          <FontAwesomeIcon icon={faApple} title="macOS" />
        )}
        {gameInfo.is_linux_native && (
          <FontAwesomeIcon icon={faLinux} title="Linux" />
        )}
      </span>
    </div>
  )
}

export default PlatformSupport
```
`MacArchBadge.tsx` follows this exact shape: `{ gameInfo: GameInfo }` prop, gate render on `gameInfo.mac_arch === '32'` (return `null` otherwise — matches `CompatibilityInfo.tsx`'s early-return-null convention, `CompatibilityInfo.tsx:22-24`/`28-30`), render `faApple` (or a plain "32" text badge per CONTEXT.md's "a '32' mark") — the actionable-vs-informational styling split is the one piece with no direct analog in `PlatformSupport.tsx` (which has no host-OS gating); use the host-OS `isMac` local variable pattern from `GamePage/index.tsx:165` instead (see below).

**Host-OS actionability gate — analog is `GamePage/index.tsx`'s own local platform derivation, not a shared hook:**
```typescript
// index.tsx:163-165 (existing)
const isWin = platform === 'win32'
const isLinux = platform === 'linux'
const isMac = platform === 'darwin'
```
If `MacArchBadge` needs `isMac` itself (rather than receiving it as a prop from `GamePage`), the `platform` value comes from a context/hook already in scope in `index.tsx` — check how `platform` itself is sourced there (destructured from `ContextProvider`/`useContext` per RESEARCH.md's Architectural Responsibility Map: "`platform` is already available via `ContextProvider`/`GameContext.is.mac`"). Prefer passing `isMac` down as a prop from `GamePage/index.tsx` (which already computes it at L165) rather than re-deriving it inside the new component — keeps `MacArchBadge` a pure presentational component consistent with `PlatformSupport`.

---

### `src/frontend/screens/Game/GamePage/components/index.tsx` (barrel export)

**Analog:** same file, full existing content (18 lines) — mechanical addition.

**Current file:**
```typescript
export { default as CloudSavesSync } from './CloudSavesSync'
export { default as DownloadSizeInfo } from './DownloadSizeInfo'
export { default as InstalledInfo } from './InstalledInfo'
export { default as Scores } from './Scores'
export { default as HLTB } from './HLTB'
export { default as AppleWikiInfo } from './AppleWikiInfo'
export { default as Requirements } from './Requirements'
export { default as MainButton } from './MainButton'
export { default as DotsMenu } from './DotsMenu'
export { default as Developer } from './Developer'
export { default as Description } from './Description'
export { default as GameStatus } from './GameStatus'
export { default as ReportIssue } from './ReportIssue'
export { default as SettingsButton } from './SettingsButton'
export { default as CompatibilityInfo } from './CompatibilityInfo'
export { default as PlatformSupport } from './PlatformSupport'
export { default as HumbleOriginInfo } from './HumbleOriginInfo'
```
Add `export { default as MacArchBadge } from './MacArchBadge'` — one new line, alphabetical-ish placement not enforced (existing list is not strictly sorted), append near `PlatformSupport` for readability.

---

### `src/frontend/screens/Game/GamePage/index.tsx` — render `<MacArchBadge>` beside `.store-icon` (component, request-response render)

**Analog:** same file, `.mainInfo`/`.store-icon` block, lines 486-497; `PlatformSupport` import + render, lines 69 and 597.

**Exact render-site to extend:**
```tsx
// index.tsx:486-497 (existing)
<div className="mainInfoWrapper">
  <div className="mainInfo">
    <GamePicture
      art_square={art_cover}
      art_logo={art_logo}
      store={runner}
    />
    <div className="store-icon">
      <StoreLogos runner={runner} />
    </div>

    <h1 style={{ opacity: art_logo ? 0 : 1 }}>{title}</h1>
```
Insert `<MacArchBadge gameInfo={gameInfo} isMac={isMac} />` as a sibling of `<div className="store-icon">` (per RESEARCH.md's literal placement recommendation: "rendered as a sibling of `.store-icon`"). Import alongside the existing `PlatformSupport` import (`index.tsx:69`, part of the barrel-destructured import block from `./components`).

**`isMac` — already computed in this file, reuse rather than recompute:**
```typescript
// index.tsx:165 (existing)
const isMac = platform === 'darwin'
```

**CSS analog** — `.store-icon` positioning to mirror in `index.css` (not read in this pass; planner should grep `index.css` for `.store-icon` rule to match absolute/relative positioning convention before adding a `.macArchBadge` rule).

---

## Shared Patterns

### False-flag-safe verdict derivation (applies to ALL of `parseOsArchHint`, `verdictFromArchs`, `isBottleEligible`)
**Source:** CONTEXT.md decisions + RESEARCH.md Anti-Patterns section.
**Apply to:** `library.ts` (`parseOsArchHint`, `verdictFromArchs`), `games.ts` (`isBottleEligible`).
**Rule:** A missing/blank/inconclusive signal is NEVER coerced to `'32'`. Every function in this phase's arch-detection chain must have an explicit `'unknown'`/`null` fallback path, never a `|| '32'`/truthy-default. This is the single most important cross-cutting invariant in the phase — verify it at every boundary (parser, subprocess result, cache read).

### Argv-form subprocess invocation (no shell)
**Source:** `src/backend/storeManagers/steam/library.ts:1071-1146` (`windowsRunningAppId`, `linuxFallbackRunningAppId`).
**Apply to:** `machOArchsOf()` (`lipo`/`file` calls).
```typescript
execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8', timeout: 1000 })
```
Never build a shell-interpolated command string; always pass command + args array separately; always set a bounded `timeout`; always wrap in try/catch returning a safe default (empty array / `null`, not throwing).

### Dedup-guarded lazy-fetch-before-routing-decision
**Source:** `src/backend/storeManagers/steam/games.ts:479-505` (`ensurePlatformsCaptured`).
**Apply to:** `ensureMacArchHint()`, and its call sites in `install()`/`launch()`/`uninstall()` (same three call sites `ensurePlatformsCaptured()` already has).
Guard order: `if (!isMac) return` → `if (alreadyResolved) return` → network call → persist to `steamMetadataStore` → (only `ensurePlatformsCaptured` has the extra `pendingFetches` bounded-poll step; `ensureMacArchHint`'s RPC is a direct one-shot `await`, so it does not need that step per RESEARCH.md Pattern 2).

### `steamMetadataStore` persistence shape
**Source:** `src/backend/storeManagers/steam/games.ts:296-304` (`steamMetadataStore.set` call in `fetchMetadataIfNeeded`).
**Apply to:** `ensureMacArchHint()` and `verifyMacArchGroundTruth()`.
```typescript
steamMetadataStore.set(this.appId, {
  art_cover,
  art_square,
  extra,
  is_mac_native,
  is_linux_native,
  is_delisted: false,
  platformsCaptured: true
})
```
Always spread the existing entry (`...(meta ?? { art_cover: '', art_square: '', extra: { reqs: [] } })`) rather than constructing a fresh object — losing `art_cover`/`art_square`/`extra` on a `mac_arch`-only write would regress the artwork cache. RESEARCH.md's Pattern 2 draft already does this correctly.

### Test mock scaffolding (`resetMocks: true`)
**Source:** `src/backend/storeManagers/steam/__tests__/library.test.ts:103-114`, `games.test.ts:44-118,561-573`.
**Apply to:** `macArch.test.ts` (new), extensions to `games.test.ts` and `library.test.ts`.
```typescript
// child_process mock — reusable verbatim for lipo/file
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  execFileSync: jest.fn()
}))

// environment mock — flip isMac per-test in beforeEach
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// electronStores mock — steamMetadataStore.get/.set already mocked;
// tests assert on steamMetadataStore.set mock.calls for mac_arch persistence
jest.mock('../electronStores', () => ({
  configStore: { get: jest.fn(), get_nodefault: jest.fn(), set: jest.fn(), clear: jest.fn() },
  steamLibraryStore: { get: jest.fn(), set: jest.fn() },
  steamMetadataStore: { get: jest.fn(), set: jest.fn(), entries: jest.fn() },
  steamSyncStore: { get: jest.fn(), set: jest.fn() }
}))
```
Note: `jest.config.js` sets `resetMocks: true` — every mock's return-value/implementation MUST be re-established in `beforeEach`/inside each `it`, never relying on a factory default persisting across tests (both existing test files' header comments call this out explicitly).

**`envMock`-flip test pattern to copy directly for `isBottleEligible()` extension tests:**
```typescript
// games.test.ts:561-573 (existing describe/beforeEach shape)
describe('SteamGame.isNative() — D-11 per-OS confirmed-not-native', () => {
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
  })

  it('D-11: macOS confirmed-not-native ... — isNative() returns false', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(false)
  })
})
```
A new `it('MAC32-02: mac_arch===32 — isBottleEligible/isNative routes to bottle regardless of is_mac_native', ...)` test should be added inside this exact describe block, following the same `envMock.isMac = true` + `steamMetadataStore.get` mock-return shape, asserting `mac_arch: '32', is_mac_native: true` still yields `isNative() === false`.

## No Analog Found

None — every file in scope has at least a role-match analog in the existing codebase; the parser (`parseOsArchHint`) has no prior PICS-parsing analog to copy verbatim (this phase is the first use of `getProductInfo` in the codebase, confirmed by RESEARCH.md), but its shape is fully specified by RESEARCH.md's Pattern 1 and the general "loosely-typed boundary + try/catch-free pure function" convention already visible in this module's other parsers (`parseSteamStorageRequirement`, `games.ts:73-91`, same argument-validation-then-regex-then-safe-default shape).

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/` (games.ts, library.ts, electronStores.ts, user.ts, `__tests__/*.test.ts`), `src/common/types.ts`, `src/frontend/screens/Game/GamePage/` (index.tsx, components/*.tsx, components/__tests__/*)
**Files scanned:** games.ts (full read of relevant sections), library.ts (targeted non-overlapping reads: subprocess block, pollInstallOnce block), electronStores.ts (full, 62 lines), common/types.ts (targeted GameInfo block), PlatformSupport.tsx (full, 36 lines), CompatibilityInfo.tsx (full, 99 lines), components/index.tsx (full, 18 lines), GamePage/index.tsx (targeted: mainInfo block, isMac derivation block), games.test.ts (targeted: describe-block list, isNative describe, mock header), library.test.ts (targeted: mock header, child_process mock block)
**Pattern extraction date:** 2026-07-12
