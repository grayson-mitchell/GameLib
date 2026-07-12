# Phase 18: macOS 32-bit detection, badge & CrossOver routing - Research

**Researched:** 2026-07-12
**Domain:** Steam PICS appinfo parsing (steam-user), macOS Mach-O binary inspection, Electron/React badge UI, extending existing Phase 17 bottle-routing logic
**Confidence:** MEDIUM-HIGH (code paths and typings verified directly in the repo/node_modules; the exact runtime `osarch` payload shape is corroborated by two independent sources but NOT yet captured live — the pre-work dump in `steam-getproductinfo-appinfo-dump.md` is still required before the parser is locked)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Arch data source (LOCKED)**
- Read architecture from PICS appinfo via `steam-user` `getProductInfo([appid], [])` — the CM protocol client already connected for `getOwnedApps()`. NOT the public Web API.
- Field path: `apps[appid].appinfo.config.launch[N].config.osarch` (values `"32"` / `"64"` / absent), with sibling `config.oslist` identifying the OS.
- The public Web API `appdetails` endpoint only returns `platforms.mac` as a boolean — no architecture. It is insufficient as the arch source (this is why `is_mac_native` is only a boolean today).

**The false-flag trap (LOCKED — drives the whole design)**
- Steam treats any mac launch entry NOT explicitly flagged `osarch "64"` as 32-bit. `osarch` is manual, developer-set metadata and is a launch-config filter, not a binary probe — a game can ship a 64-bit mac binary with no `osarch` tag.
- Documented false-positives: A Hat in Time, Metro: Last Light, BattleBlock Theater are flagged 32-bit but run fine.
- ⇒ A missing/blank `osarch` is `unknown`, NEVER assumed 32-bit. Over-routing on a missing tag would push good 64-bit games into emulation.

**Hybrid detection rule (LOCKED)**
Pre-install (cheap, PICS only):
- `osarch == "32"` → badge "32" + bottle-eligible; never native-install.
- `osarch == "64"` → native path.
- `osarch` missing/blank → treat as unknown → native path (tentative).

Post-install ground truth (correctness backstop):
- After a native macOS install (unknown/64 case), inspect the installed Mach-O header (`lipo -archs` / `file`) on the `.app` binary.
  - i386-only → re-route to bottle (Windows depot); warn; cache result.
  - x86_64 / arm64 present → confirmed native; cache result.

**Routing integration (LOCKED)**
- Plug into the existing `isBottleEligible()` (`src/backend/storeManagers/steam/games.ts:451`) / D-11 path — 32-bit-confirmed becomes another reason `isBottleEligible()` returns true on macOS. Routes the game's Windows depot under CrossOver, NOT the 32-bit mac binary (nothing on modern macOS can run that).
- Non-macOS hosts: unchanged (Linux keeps Proton delegation; Windows unaffected).

**`oslist` parsing (LOCKED)**
- Match BOTH `"macos"` and legacy `"osx"` in `oslist`. Windows/Linux use `"windows"`/`"linux"`.

**UI (LOCKED)**
- OS logo beside the game logo in the left panel; a "32" mark on 32-bit mac builds.
- The "32" treatment is escalated to an actionable warning ONLY when the host OS is macOS. On Windows/Linux hosts it is informational (or omit) — a "mac 32" warning is not actionable there.

### Claude's Discretion
- Exact GameInfo field name/shape for the arch signal (mirror `is_mac_native` neighbor at `src/common/types.ts:220`; likely a `mac_arch: '32' | '64' | 'unknown'` or similar) and where it is persisted (`steamMetadataStore` alongside `is_mac_native`).
- Whether the Mach-O check runs at install-completion vs first-launch, and the exact `lipo`/`file` invocation and parsing.
- Badge component location, icon assets, and styling (subject to any UI-SPEC generated for this phase).
- Caching key/shape for the resolved arch verdict.

### Deferred Ideas (OUT OF SCOPE)
- Generalizing the OS/arch badge to GOG/Epic mac builds (non-Steam arch signals) — out of scope for V1; the badge could later be store-agnostic.
- Linux 32-bit multilib surfacing — Proton/Steam handle it; not this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAC32-01 | A Steam game's macOS build architecture is read from PICS appinfo via `steam-user` `getProductInfo` (`apps[id].appinfo.config.launch[N].config.osarch`, matching both `"macos"` and legacy `"osx"` in the sibling `oslist`) and recorded as an arch signal on `GameInfo`; a missing/blank `osarch` is treated as unknown, NOT as 32-bit. | Pattern 1 (loosely-typed parser), Pattern 2 (`ensureMacArchHint` call site), Pitfall 1 (`@types/steam-user` typing gap), Code Examples, Validation Architecture row 1-2 |
| MAC32-02 | On macOS, a game whose mac build is confirmed 32-bit is bottle-eligible — install/launch/uninstall route through the bottled Steam client and a native `steam://` install is never attempted; extends `isBottleEligible()`/D-11. | Pattern 3 (`isBottleEligible()` extension), Pitfall 3 (`is_mac_native===true` for 32-bit games — the key gotcha), Validation Architecture row 3-4 |
| MAC32-03 | After a native macOS install of a game with unknown/64-bit `osarch`, GameLib inspects the installed Mach-O binary (`lipo -archs`/`file`) as ground truth; an i386-only binary is re-routed to the bottle and the result is cached. | Pattern 4 (Mach-O invocation), Pattern 5 (binary location), Pitfall 4 (`lipo` availability), Pitfall 5 (post-hoc correction state gap), Open Question 1, Validation Architecture row 5-6 |
| MAC32-04 | The left-panel game view shows an OS logo beside the game logo with a "32" mark on 32-bit macOS builds; the "32" treatment is escalated to an actionable warning only when the host OS is macOS. | Architecture Diagram (UI section), Recommended Project Structure (`MacArchBadge.tsx`), frontend location analysis (`GamePage/index.tsx` `.mainInfo`/`.store-icon`), Validation Architecture row 7-8 |
</phase_requirements>

## Summary

This phase adds two new capabilities on top of code that already exists and already works: (1) a PICS-based `osarch` reader hung off the already-connected `steam-user` CM client, and (2) a post-install Mach-O ground-truth check using a Node `child_process` pattern the codebase already uses three times in `steam/library.ts`. Neither requires a new npm package — `steam-user@5.3.0` and `@types/steam-user@5.1.1` are already installed and already imported (`src/backend/storeManagers/steam/user.ts`), and `getProductInfo()` is **not currently called anywhere** in the codebase — this phase is its first use.

The critical implementation risk is not "how do I call `getProductInfo`" (that's a one-line RPC call already wired through `SteamUser.getClient()`), it's **trusting the shape of what comes back**. `@types/steam-user`'s `Launch.config.osarch` is typed as the single literal `"64"` (not `"32"` and not `"" | string`) — this is a DefinitelyTyped artifact derived from real sample payloads, and it is a hard signal that "32" is a real observed value the type author didn't happen to sample, not a value that categorically shouldn't appear. **Do not treat that type as authoritative** — write the parser against a loosely-typed local interface and validate with the pre-work dump (`steam-getproductinfo-appinfo-dump.md`), exactly as CONTEXT.md requires.

Routing integration is a genuinely small, well-isolated change: `isBottleEligible()` (`games.ts:451`) currently returns true only for a *confirmed-not-native* macOS game (`platformsCaptured===true && is_mac_native===false`). A 32-bit-only mac game is, paradoxically, `is_mac_native===true` (Steam's public appdetails API reports "has a mac depot" — it doesn't know or care about bitness) — so **today, MAC32 games silently fall through the existing native path and fail to launch on Catalina+**. The fix is an independent OR-branch keyed on a new `mac_arch` cache field, not a change to the existing `platformsCaptured`/`is_mac_native` check.

**Primary recommendation:** Add `mac_arch?: '32' | '64' | 'unknown'` to `GameInfo` and `SteamMetadataCacheEntry` (mirroring the existing `is_mac_native` pattern exactly); read it from `getProductInfo` pre-install and from `lipo -archs`/`file` post-install; branch `isBottleEligible()` on `mac_arch === '32'` as an eligibility reason independent of (not layered on top of) the existing `is_mac_native===false` check; render the badge in `GamePage`'s `.mainInfo` panel next to the existing `.store-icon` overlay (`src/frontend/screens/Game/GamePage/index.tsx:493-495`), which is the literal "beside the game logo in the left panel" location CONTEXT.md describes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read `osarch`/`oslist` from PICS appinfo | API / Backend (Electron main) | — | Requires the authenticated `steam-user` CM client (`SteamUser.getClient()`), which only exists in the main process; never exposed to renderer |
| Cache the resolved arch verdict | Database / Storage (electron-store) | Backend (in-memory `library` Map) | Follows the existing `steamMetadataStore` / in-memory `library` dual-cache pattern already used for `is_mac_native` |
| Mach-O ground-truth inspection (`lipo`/`file`) | Backend (Electron main, `child_process`) | — | Filesystem + subprocess access is main-process-only; mirrors `windowsRunningAppId()`/`linuxFallbackRunningAppId()` in `library.ts` |
| Bottle-routing decision (`isBottleEligible()`) | Backend (Electron main) | — | Same tier as the Phase 17 D-11 logic it extends; must stay a single source of truth shared by `install()`/`launch()`/`uninstall()`/`getSettings()` |
| OS/arch badge render | Frontend (React, renderer process) | — | Pure presentational; consumes `GameInfo.mac_arch` already pushed to the renderer via `sendFrontendMessage('pushGameToLibrary', ...)` |
| Host-OS actionability gate (escalate "32" only on macOS) | Frontend (React) | — | `platform` is already available via `ContextProvider`/`GameContext.is.mac`, no new plumbing needed |

## Standard Stack

### Core

No new packages. Everything needed is already a direct dependency.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `steam-user` | 5.3.0 [VERIFIED: package.json] | `getProductInfo()` PICS RPC call | Already the CM client for `getUserOwnedApps`; `getProductInfo` is a documented method on the same client instance (`node_modules/steam-user/components/apps.js:173`) |
| `@types/steam-user` | 5.1.1 [VERIFIED: package.json] | TS types for `AppInfo`/`AppInfoContent`/`Launch` | Already installed; ships a `Launch.config.osarch`/`oslist` shape (see Pitfall 1) |
| `@node-steam/vdf` | ^2.2.0 [VERIFIED: package.json] | ACF/VDF parsing (unrelated to `osarch` — used for `installdir` resolution, unchanged) | Already used throughout `library.ts` for appmanifest parsing |
| Node `child_process` (`spawnSync`/`execFileSync`) | built-in | Invoke `lipo -archs` / `file` on the installed binary | Zero-dependency; codebase already uses this exact pattern 3x in `library.ts` (`windowsRunningAppId`, `macOsRunningAppId`'s sibling `linuxFallbackRunningAppId`) |

**Installation:** none — nothing new to install.

**Version verification:**
```bash
$ npm view steam-user version
5.3.0
$ npm view @types/steam-user version
5.1.1
```
Both match the versions already pinned in `package.json` and already present in `node_modules/` — confirmed by direct filesystem inspection, not just `npm view`.

### Supporting Libraries (no new installs required)

| Library | Already Present | Role in this phase |
|---------|-----------------|----------------------|
| `steam-user` | Yes (`SteamUser.getClient()` in `user.ts`) | `getProductInfo([appid], [])` for the pre-install `osarch` hint |
| `graceful-fs` (`existsSync`, `readdirSync`) | Yes (`library.ts`) | Locate the installed `.app` bundle under `installdir` for the Mach-O check |
| `child_process` (`execFileSync`) | Yes (`library.ts`) | Run `lipo -archs <binary>` (or `file` fallback) |
| `electron-store` (via `CacheStore`/`TypeCheckedStoreBackend`) | Yes (`electronStores.ts`) | Persist `mac_arch` on `SteamMetadataCacheEntry`, same store as `is_mac_native` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `getProductInfo` PICS call | Public `appdetails` Web API | Already rejected by CONTEXT.md — `appdetails` only returns a `platforms.mac` boolean, no architecture data at all. Not viable. |
| `lipo -archs` | `file <binary>` (parse text output) | `lipo -archs` gives a clean space-separated arch list (`i386`, `x86_64`, `arm64`) with zero string-parsing ambiguity; `file` requires regex-matching a human-readable sentence and is less precise on universal binaries. Recommend `lipo -archs` as primary, `file` as fallback if `lipo` is missing (both ship with Xcode Command Line Tools, which is a reasonable assumption for a Mac dev machine but NOT guaranteed on every end-user Mac — see Pitfall 4). |
| `enablePicsCache: true` on the `steam-user` client | Keep `enablePicsCache: false` (current) | The client is currently constructed with `enablePicsCache: false` (`user.ts:210`) specifically to avoid the client auto-maintaining a full PICS cache. **`getProductInfo()` works identically regardless of this flag** — the flag only controls whether the *response* is additionally cached inside `this.picsCache`; the direct-call code path parses `body.apps` into the returned `response.apps[app.appid]` unconditionally (`apps.js:294-313`). No client reconfiguration needed. |

## Package Legitimacy Audit

No external packages are installed by this phase — everything required (`steam-user`, `@types/steam-user`, `@node-steam/vdf`, Node's built-in `child_process`) is already a direct dependency and already used elsewhere in the Steam store manager. The Package Legitimacy Gate is not applicable; skipping per its own scope ("whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ PRE-INSTALL (cheap, network-only)                                    │
│                                                                        │
│  install()/launch()/uninstall() [games.ts]                           │
│        │                                                              │
│        ▼                                                              │
│  ensurePlatformsCaptured()  (existing, unchanged)                    │
│        │                                                              │
│        ▼                                                              │
│  ensureMacArchHint()  ◄── NEW, mirrors ensurePlatformsCaptured shape  │
│        │                                                              │
│        ▼                                                              │
│  SteamUser.getClient().getProductInfo([appId], [])                   │
│        │                                                              │
│        ▼                                                              │
│  parseOsArchHint(appinfo)  ◄── NEW pure function                     │
│        │  walks apps[id].appinfo.config.launch[*]                    │
│        │  filters entries where oslist matches "macos" | "osx"       │
│        │  osarch: "32" → '32'                                        │
│        │  osarch: "64" → '64'                                        │
│        │  osarch missing/blank/no matching entry → 'unknown'         │
│        ▼                                                              │
│  steamMetadataStore.set(appId, { ...meta, mac_arch: verdict })       │
│        │                                                              │
│        ▼                                                              │
│  isBottleEligible()  ◄── EXTENDED: mac_arch==='32' is an              │
│        │                  independent eligibility reason              │
│        ▼                                                              │
│  '32' or unconfirmed-native  →  native install proceeds normally     │
│  (confirmed-32-bit already routes to bottle here, no native attempt) │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ POST-INSTALL (ground truth, filesystem-only, macOS native path only) │
│                                                                        │
│  pollInstallOnce() [library.ts:687, result.state==='installed']      │
│        │  (native source only — bottle-sourced installs are Windows  │
│        │   depots, never Mach-O; skip this branch when source==='bottle')│
│        ▼                                                              │
│  verifyMacArchGroundTruth(appId, installPath)  ◄── NEW, fire-and-forget│
│        │  skip if mac_arch already '32' (nothing to correct)         │
│        │  skip if not macOS host                                     │
│        ▼                                                              │
│  locateMachOBinary(installPath)  ◄── NEW                             │
│        │  scan installPath for *.app, read launch[N].executable,     │
│        │  or fall back to Contents/MacOS/<first file>                │
│        ▼                                                              │
│  execFileSync('lipo', ['-archs', binaryPath])  ◄── argv-form, no shell│
│        │  "i386" only            → mac_arch = '32' (CORRECTION)      │
│        │  "x86_64"/"arm64" present → mac_arch = '64' (confirmed)     │
│        ▼                                                              │
│  steamMetadataStore.set(appId, { ...meta, mac_arch: verdict,         │
│                                   mac_arch_verified: true })          │
│        │                                                              │
│        ▼ (only when verdict flipped to '32')                         │
│  Open Question #1: what happens to the already-downloaded native     │
│  i386 install? (see Open Questions below — not resolved by CONTEXT)  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ UI (renderer process)                                                │
│                                                                        │
│  GameInfo.mac_arch pushed via sendFrontendMessage('pushGameToLibrary')│
│        │                                                              │
│        ▼                                                              │
│  GamePage's .mainInfo panel (index.tsx:487-496)                      │
│        │  <GamePicture .../>  +  <div className="store-icon">        │
│        ▼                                                              │
│  NEW <MacArchBadge gameInfo={gameInfo} /> rendered as a sibling of    │
│  .store-icon, gated on gameInfo.mac_arch === '32'                    │
│        │  escalate to actionable/warning styling only when           │
│        │  is.mac (host OS === darwin) — informational otherwise      │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new files/directories are required beyond what already exists; extend in place:

```
src/backend/storeManagers/steam/
├── games.ts          # isBottleEligible() extension; new ensureMacArchHint()
├── library.ts         # NEW: parseOsArchHint(), locateMachOBinary(),
│                       #      verifyMacArchGroundTruth(); hook into
│                       #      pollInstallOnce()'s 'installed' branch
├── electronStores.ts  # SteamMetadataCacheEntry: + mac_arch, + mac_arch_verified
└── __tests__/
    ├── games.test.ts        # extend isBottleEligible() describe block
    ├── library.test.ts      # extend with Mach-O + osarch-parser describe blocks
    └── macArch.test.ts      # NEW — dedicated file for parseOsArchHint() fixtures
        (recommended split: the osarch parser has enough fixture surface
         — false-flag titles, missing key, empty string — to warrant its
         own file rather than growing library.test.ts further)

src/common/types.ts
    # GameInfo: + mac_arch?: '32' | '64' | 'unknown'  (next to is_mac_native, line ~220)

src/frontend/screens/Game/GamePage/components/
├── MacArchBadge.tsx   # NEW — the "32" badge component
└── index.tsx           # export it alongside PlatformSupport etc.

src/frontend/screens/Game/GamePage/
├── index.tsx           # render <MacArchBadge> beside <StoreLogos> in .mainInfo
└── index.css            # position the badge relative to .store-icon
```

### Pattern 1: Loosely-typed local interface for PICS appinfo traversal

**What:** `@types/steam-user`'s `AppInfoContent` is a 12-member discriminated union (`AppInfoContentGame | AppInfoContentDlc | AppInfoContentTool | ...`), several of which have `config` as non-optional and differently-shaped from `AppInfoContentGame`'s. Rather than narrowing this union at every call site, define a narrow local interface capturing only the fields this phase reads, and cast into it at the single parse function's boundary.

**When to use:** Any time PICS appinfo is consumed for a purpose narrower than "the whole SDK".

**Example:**
```typescript
// Source: derived from node_modules/@types/steam-user/index.d.ts:1625-1636,
// 1675-1688 (Launch, AppInfoConfigBase) — NOT from official Valve docs (none
// exist for appinfo schema); this is the DefinitelyTyped shape, itself
// derived from real sample payloads.
interface SteamLaunchEntryConfig {
  oslist?: string   // "windows" | "macos" | "osx" | "linux" | ...
  osarch?: string   // "32" | "64" | "" | undefined  — @types only samples "64"!
}
interface SteamLaunchEntry {
  executable?: string
  config?: SteamLaunchEntryConfig
}
interface SteamAppInfoConfigLoose {
  installdir?: string
  launch?: Record<string, SteamLaunchEntry>
}

/**
 * Reads config.launch[*].config.osarch for entries whose oslist matches a mac
 * host ("macos" current, "osx" legacy). Returns 'unknown' when no matching
 * mac launch entry exists, or when one exists but osarch is absent/blank —
 * NEVER infers 32-bit from a missing key (the false-flag trap, CONTEXT.md).
 */
export function parseOsArchHint(
  appinfo: unknown
): '32' | '64' | 'unknown' {
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

### Pattern 2: `getProductInfo` call site (mirrors `ensurePlatformsCaptured`)

**What:** A macOS-only, lazily-triggered, dedup-guarded fetch of the `osarch` hint, structured identically to the existing `ensurePlatformsCaptured()`/`fetchMetadataIfNeeded()` pair so install()/launch()/uninstall() can await it before consulting `isBottleEligible()`.

**Example:**
```typescript
// Source: pattern mirrors ensurePlatformsCaptured() in games.ts:479-505.
// getProductInfo signature verified in node_modules/@types/steam-user/index.d.ts:343-355
// and node_modules/steam-user/components/apps.js:173.
private async ensureMacArchHint(): Promise<void> {
  if (!isMac) return
  const meta = steamMetadataStore.get(this.appId)
  if (meta?.mac_arch) return // already resolved (hint or ground truth)

  const client = SteamUser.getClient()
  if (!client?.steamID) return // not connected — leave 'unknown', native path proceeds (safe default)

  try {
    const appIdNum = parseInt(this.appId, 10)
    const result = await client.getProductInfo([appIdNum], [])
    const entry = result.apps[appIdNum]
    const verdict = entry
      ? parseOsArchHint(entry.appinfo)
      : 'unknown'
    steamMetadataStore.set(this.appId, {
      ...(meta ?? { art_cover: '', art_square: '', extra: { reqs: [] } }),
      mac_arch: verdict
    })
  } catch (err) {
    logWarning(
      [`Steam getProductInfo failed for appId ${this.appId}:`, err],
      LogPrefix.Steam
    )
    // Leave mac_arch unset — 'unknown' is the safe default already implied
    // by isBottleEligible()'s absence check; do not throw, do not block install/launch.
  }
}
```

### Pattern 3: `isBottleEligible()` extension (the routing integration point)

**What:** Add `mac_arch === '32'` as an independent OR-branch, NOT a modification of the existing `platformsCaptured && is_mac_native===false` check. These represent two different reasons a mac game can't run natively — "no mac build at all" vs. "has a mac build but it's 32-bit-only" — and a 32-bit mac game will have `is_mac_native === true` (it DOES have a mac depot per the boolean-only public API), so the existing check alone will never catch it.

**Example:**
```typescript
// Source: extends games.ts:451-455 (existing isBottleEligible()).
private isBottleEligible(): boolean {
  if (!isMac) return false
  const meta = steamMetadataStore.get(this.appId)
  // MAC32-02: a confirmed 32-bit mac build is bottle-eligible independent of
  // is_mac_native (which will be TRUE for these games — Steam's public
  // appdetails only reports "has a mac depot", not bitness; the D-11 check
  // below would never fire for a 32-bit game and must not be relied on here).
  if (meta?.mac_arch === '32') return true
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}
```

### Pattern 4: Mach-O ground-truth check (argv-form, no shell — matches codebase convention)

**What:** Reuse the exact `execFileSync` invocation style already used for `linuxFallbackRunningAppId()` (`library.ts:1135-1146`): argv array (never string-interpolated shell command), `encoding: 'utf8'`, bounded `timeout`, wrapped in try/catch returning a safe default.

**Example:**
```typescript
// Source: pattern from library.ts:1135-1146 (existing linuxFallbackRunningAppId).
// lipo -archs output format verified via WebSearch (Apple lipo(1) man page,
// ss64.com/mac/lipo.html) — space-separated arch list, e.g. "i386" or
// "x86_64 arm64". [CITED]
function machOArchsOf(binaryPath: string): string[] {
  try {
    const output = execFileSync('lipo', ['-archs', binaryPath], {
      encoding: 'utf8',
      timeout: 5000
    })
    return output.trim().split(/\s+/).filter(Boolean)
  } catch (err) {
    // lipo missing (no Xcode CLT) or binary not a valid Mach-O — fall back to `file`
    try {
      const output = execFileSync('file', [binaryPath], {
        encoding: 'utf8',
        timeout: 5000
      })
      const archs: string[] = []
      if (/\bx86_64\b/.test(output)) archs.push('x86_64')
      if (/\barm64\b/.test(output)) archs.push('arm64')
      if (/\bi386\b/.test(output)) archs.push('i386')
      return archs
    } catch {
      return [] // neither tool available/succeeded — caller must treat as inconclusive, NOT as 32-bit
    }
  }
}

function verdictFromArchs(archs: string[]): '32' | '64' | null {
  if (archs.length === 0) return null // inconclusive — do not overwrite existing hint
  const has64 = archs.includes('x86_64') || archs.includes('arm64')
  const has32 = archs.includes('i386')
  if (has64) return '64'
  if (has32) return '32'
  return null
}
```

### Pattern 5: Locating the installed Mach-O binary

**What:** `installPath` from `buildInstalledMap()`/`readAcfState()` is `join(steamappsDir, 'common', installdir)` — the game's root folder, NOT the executable. On macOS, Steam typically installs a `<Name>.app` bundle directly under this root (per Valve's mac depot convention: `Launch.executable` for a `"macos"`/`"osx"` launch entry is usually a relative path ending in `.app/Contents/MacOS/<binary>`, but this is convention, not guaranteed).

**Example:**
```typescript
// Source: pattern extends buildInstalledMap()'s installPath construction
// (library.ts:472) with a scan step. .app bundle discovery is a documented
// macOS convention [ASSUMED — not Valve-guaranteed for every title].
function locateMachOBinary(
  installPath: string,
  launchExecutable?: string
): string | null {
  // Prefer the exact path from the mac launch entry's `executable` field when
  // available (already resolved during the osarch parse — thread it through).
  if (launchExecutable) {
    const candidate = join(installPath, launchExecutable)
    if (existsSync(candidate)) return candidate
  }
  // Fallback: scan for a top-level *.app bundle and its MacOS binary.
  try {
    const entries = readdirSync(installPath)
    const appBundle = entries.find((e) => e.endsWith('.app'))
    if (!appBundle) return null
    const macOsDir = join(installPath, appBundle, 'Contents', 'MacOS')
    if (!existsSync(macOsDir)) return null
    const bins = readdirSync(macOsDir)
    return bins.length ? join(macOsDir, bins[0]) : null
  } catch {
    return null
  }
}
```

### Anti-Patterns to Avoid

- **Treating a missing `osarch` key as 32-bit:** This is the entire point of CONTEXT.md's "false-flag trap" — do not write `osarch === '32' || !osarch` anywhere. A Hat in Time, Metro: Last Light, BattleBlock Theater are documented real-world false positives of exactly this mistake.
- **Trusting `@types/steam-user`'s `osarch?: "64"` literal type as exhaustive:** It is sample-derived, not schema-derived (there is no canonical Valve appinfo schema). Cast through a local loose interface (Pattern 1); do not let TypeScript's apparent exhaustiveness lull the parser into rejecting `"32"` at compile time (it would show as a type error if you tried `arch === '32'` against the SDK's own `AppInfoConfig['launch'][string]['config']['osarch']` type — this is exactly the "typing gap" CONTEXT.md flags).
- **Calling `lipo`/`file` with a shell string instead of argv array:** The codebase's own convention (`spawnSync`/`execFileSync` with an args array, never `exec()`) exists specifically to avoid shell injection via attacker-controlled paths. `installPath` is derived from `installdir` inside an ACF file — not fully trusted input. Keep argv-form.
- **Running the Mach-O check on every `launch()` call:** Cache the verdict (`mac_arch_verified: true`) the same way `platformsCaptured` is cached — `lipo`/`file` is cheap but there's no reason to shell out on every single Play click once resolved.
- **Conflating the bottle-sourced install path with the native one for the Mach-O check:** A bottle-installed game is a Windows depot running under CrossOver — there is no macOS Mach-O binary to inspect. Gate `verifyMacArchGroundTruth` on `source === 'native'` only (mirrors the existing `AcfSource` discipline already documented in Phase 17's Pitfalls 2/3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing Steam PICS VDF appinfo blobs | A custom VDF/KeyValues parser | `steam-user`'s built-in parse (already done for you inside `getProductInfo` — it returns a parsed JS object, not raw VDF text) | `steam-user` already ships `VDF.parse()` internally (`apps.js:242`, `:306`) and hands back a fully-parsed object; there is nothing left to hand-roll here |
| Universal-binary architecture inspection | Manually reading Mach-O fat-header bytes | `lipo -archs` (or `file` fallback) | Both are Apple-shipped, battle-tested tools that correctly handle fat binaries, single-arch binaries, and code-signed bundles; reimplementing Mach-O header parsing in Node is significant, fragile, security-sensitive work for zero benefit |
| Bottle-eligibility routing | A new parallel routing mechanism for 32-bit games | Extend the existing `isBottleEligible()` single source of truth | Phase 17 already established this as the one chokepoint consumed by `getSettings()`, `install()`, `launch()`, `uninstall()`, and `isNative()`; a second mechanism would immediately diverge from it (exactly the class of bug Phase 17's D-11 comments warn about) |

**Key insight:** This phase's actual engineering surface is small — one PICS field read, one subprocess call, one boolean OR in an existing function, one badge component. The risk is entirely in *data trustworthiness* (osarch's documented unreliability, an under-sampled TS type) and *state machine correctness* (what happens when the post-install correction fires after a native install already completed — see Open Questions), not in needing new infrastructure.

## Common Pitfalls

### Pitfall 1: `@types/steam-user`'s `osarch` type is a documented trap

**What goes wrong:** Writing `entry.config.osarch === '32'` against the SDK's own `Launch['config']['osarch']` type (`"64"` only) will either fail to compile in strict mode or silently pass because of the `| string` fallback present on nearby sibling fields but notably ABSENT from `osarch` itself (`osarch?: "64";` — no union, no `| string`). TypeScript will happily let `"32"` flow through an `any`/loosely-typed boundary, but a naive `if (launch.config?.osarch === '32')` written directly against `SteamUser.Launch` may not even type-check depending on how it's accessed.

**Why it happens:** `@types/steam-user` (DefinitelyTyped) is generated from observed sample payloads, not a canonical Valve schema (none exists — CONTEXT.md and the pre-work todo both note this).

**How to avoid:** Use the local loose interface from Pattern 1; never import `SteamUser.Launch`/`SteamUser.AppInfoConfig` directly into the parser. Verify against the pre-work dump before locking test fixtures.

**Warning signs:** TS complains `'"32"' is not comparable to type '"64"'`, or the parser silently returns `undefined` for a known-32-bit test title.

### Pitfall 2: `enablePicsCache: false` does NOT block `getProductInfo`

**What goes wrong:** Assuming `getProductInfo` requires `enablePicsCache: true` (the flag that gates `getOwnedApps()`/`ownsApp()` per the SDK's own JSDoc, `index.d.ts:376-388`) and unnecessarily reconfiguring the shared `SteamUser` client, risking regressions in the existing login/reconnect flow (`user.ts:210`).

**Why it happens:** The SDK's docs for `getOwnedApps()` explicitly say "Only works if enablePicsCache option is enabled" right next to `getProductInfo`, inviting the (wrong) assumption that the same restriction applies.

**How to avoid:** `getProductInfo()`'s response-building code (`apps.js:294-313`) parses `body.apps` into the return value unconditionally; the `if (this.options.enablePicsCache)` block (`apps.js:228`) only affects whether the result is ALSO stored in `this.picsCache` for later `getOwnedApps()`/`ownsApp()` lookups. Verified by direct source read, not documentation.

**Warning signs:** None expected if this guidance is followed — flagging so nobody "fixes" this unnecessarily.

### Pitfall 3: A 32-bit mac game has `is_mac_native === true`, not `false`

**What goes wrong:** Assuming the existing `is_mac_native===false` D-11 check will naturally catch 32-bit games too, and only adding the badge without extending `isBottleEligible()`. The game silently keeps trying (and failing) to install natively.

**Why it happens:** `is_mac_native` is sourced from the public `appdetails` API's `platforms.mac` boolean (`games.ts:274`), which is true for ANY mac depot regardless of architecture. This is exactly the same boolean-blindness CONTEXT.md's design doc calls out as the reason `getProductInfo` is needed at all.

**How to avoid:** Pattern 3 above — independent OR-branch, not a change to the existing branch.

**Warning signs:** A known 32-bit-only title (e.g. an old title from the false-flag research) installs natively on a test macOS box and silently fails to launch (typically "The application ... can't be opened" / Rosetta-unavailable style failure, or in the worst case a segfault-on-launch with no user-facing message at all — macOS gives no clean error for attempting to exec a pure-i386 binary since Catalina removed the i386 dyld shims).

### Pitfall 4: `lipo` is not guaranteed present on every end-user Mac

**What goes wrong:** `lipo` ships with Xcode Command Line Tools, which most developer machines have but a typical *end user's* Mac may not (GameLib's actual install target). If `lipo` is missing and the `file` fallback is not implemented, `verifyMacArchGroundTruth` silently becomes a no-op forever on that machine.

**Why it happens:** Reasonable assumption drift — researchers/planners tend to test on dev machines where Xcode CLT is already installed.

**How to avoid:** Implement the `file`-based fallback (Pattern 4 above) — `file` is part of the base macOS install (BSD userland), not Xcode CLT, and is present on every Mac without exception. Treat "neither tool succeeded" as inconclusive (`return null`, do not overwrite the pre-install hint), never as a positive 32-bit or 64-bit verdict.

**Warning signs:** `verifyMacArchGroundTruth` throws or silently no-ops in CI/sandboxed environments without Xcode CLT — write the unit tests against mocked `execFileSync` (see Validation Architecture) so this is caught without needing real Xcode CLT in CI.

### Pitfall 5: Post-install correction has no natural "undo the native install" mechanic

**What goes wrong:** The Mach-O check flips `mac_arch` to `'32'` for a game whose native i386-only build is ALREADY fully downloaded and installed. `isBottleEligible()` now returns true, so the next `launch()` call routes to `tellBottledSteamToLaunch()` — but the bottle's own Steam client has never installed this game (nothing was ever downloaded into the bottle's `steamapps`). The launch will fail against the bottle for an entirely different reason than the one the user expects.

**Why it happens:** This is a genuine gap not resolved by CONTEXT.md's Decisions section (only "whether the Mach-O check runs at install-completion vs first-launch" is called out as Claude's Discretion — the state-machine consequence of a post-hoc correction firing on an already-downloaded native install is not addressed at all).

**How to avoid:** See **Open Question #1** below — flagged for the planner/discuss-phase, not silently resolved by this research.

**Warning signs:** This will only surface for the (rare, by design) false-negative case — a mac depot Steam never tagged `osarch` for, that turns out to be i386-only. Cannot be caught by unit tests alone; needs an explicit plan decision.

## Code Examples

### Reading the authenticated client (existing accessor, no change needed)
```typescript
// Source: src/backend/storeManagers/steam/user.ts:92-94 (existing, verified)
static getClient(): InstanceType<typeof SteamUserLib> | null {
  return this.client
}
```

### `getProductInfo` call shape (SDK-verified)
```typescript
// Source: node_modules/@types/steam-user/index.d.ts:343-355
getProductInfo(
    apps: Array<number | SteamUser.App>,
    packages: Array<number | SteamUser.Package>,
    inclTokens?: boolean,
    callback?: (...) => void,
    requestType?: number,
): Promise<SteamUser.ProductInfo>;
// ProductInfo.apps: Record<number, AppInfo>
// AppInfo: { changenumber: number; missingToken: boolean; appinfo: AppInfoContent }
```

### Real-world confirmation of `oslist`/lowercase casing and osarch's optionality
```json
// Source: WindowsGSM/SteamAppInfo public appinfo dump (appid 548400) [CITED — third-party mirror, not Valve]
// Confirms: field names ARE lowercase ("oslist" not "OSList"), and osarch is
// genuinely absent (not empty-string) on entries that don't declare it.
{
  "launch": {
    "0": {
      "executable": "SH Dedicated server.exe",
      "type": "default",
      "config": { "oslist": "windows" }
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `is_mac_native` boolean only (public `appdetails` API) | `is_mac_native` (has-a-mac-build) + `mac_arch` (bitness, PICS-sourced) — two orthogonal signals | This phase | `isBottleEligible()` gains a second, independent eligibility reason; `is_mac_native` semantics are UNCHANGED (still "has a mac depot"), just no longer sufficient on its own to guarantee "will actually run" |

**Deprecated/outdated:** Nothing in this phase deprecates existing behavior — it is additive. The existing `is_mac_native`/`platformsCaptured`/D-11 machinery from Phase 17 is reused as-is, not replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `config.launch[N].config.osarch` field path and lowercase casing | Standard Stack, Pattern 1 | Corroborated by `@types/steam-user`'s sample-derived types AND a third-party public appinfo dump (WindowsGSM/SteamAppInfo) — MEDIUM confidence, not HIGH, because neither source is Valve's own docs (none exist) and neither source's sample happened to include a real `"32"` value. **This is exactly why the pre-work dump (`steam-getproductinfo-appinfo-dump.md`) is still required before the parser is locked** — do not skip it on the strength of this research alone. |
| A2 | On macOS, Steam installs a `<Name>.app` bundle directly under `installdir`, and `Launch.executable` for the mac entry points at (or near) `Contents/MacOS/<binary>` | Pattern 5 | If a title deviates from this convention, `locateMachOBinary` returns `null` and the ground-truth check silently no-ops for that title (falls back to the pre-install hint only — not a crash, but a missed correction). Recommend the planner add a defensive log-and-skip, not a throw, exactly as drafted. |
| A3 | `lipo`/`file` are sufficient and their output format (space-separated arch list / free-text sentence) is stable | Pattern 4 | If Apple changes `lipo`'s output format in a future macOS version, the regex/split logic silently returns `[]` (inconclusive, not wrong) — degrades gracefully per the "no tool succeeded → don't overwrite" rule already baked into `verdictFromArchs`. |
| A4 | Post-install Mach-O check should run at ACF-completion time (`pollInstallOnce`'s `'installed'` branch), not first-launch | Architecture Diagram | CONTEXT.md leaves this as pure discretion. If first-launch is preferred instead, the same `verifyMacArchGroundTruth` function can be called from `launch()` before `ensureMacArchHint()`/`isBottleEligible()` instead — no functional difference to the check itself, only to *when* it fires. Flagging so the planner makes an explicit choice rather than inheriting this research's pick by default. |

## Open Questions

1. **What happens to an already-downloaded native i386-only install after the post-install correction flips `mac_arch` to `'32'`?**
   - What we know: `isBottleEligible()` will return `true` on the next call, so `launch()`/`install()`/`uninstall()` will all attempt to route through the bottled Steam client — but nothing has ever been installed into the bottle's own `steamapps` for this game (the bottle's Steam client has no record of it).
   - What's unclear: Whether the correction should (a) auto-trigger `forceUninstall()` on the native copy + push `is_installed: false` so the user's next Install click naturally goes through `install()`'s already-correct bottle branch, or (b) leave the native install in place and surface a distinct "this install won't run — reinstall via CrossOver" warning state that doesn't exist anywhere in the codebase today, or (c) something else.
   - Recommendation: Option (a) is the least new surface area — it reuses the existing `forceUninstall()` method (`games.ts:687-695`, already used for a conceptually similar "in-memory state doesn't match reality" reconciliation) and the existing install()-bottle-branch rather than inventing a new UI state. Surface this explicitly to the user via a toast/notification (the existing `notify()` helper is already imported in `library.ts`) explaining why their install disappeared. **This needs an explicit planner/discuss-phase decision — CONTEXT.md does not resolve it.**

2. **Should `ensureMacArchHint()` be awaited synchronously before every `install()`/`launch()`/`uninstall()` call (like `ensurePlatformsCaptured()`), or fire-and-forget like the general metadata fetch?**
   - What we know: `ensurePlatformsCaptured()` is awaited synchronously specifically to close a race condition documented in `.planning/debug/steam-bottle-guided-setup-never-fires.md` (Phase 17) — a fire-and-forget fetch could lose the race against the user's click.
   - What's unclear: Whether the same race applies here. It plausibly does — a 32-bit game whose hint hasn't resolved yet would fall through to the native path exactly like an unconfirmed `is_mac_native` game did pre-Phase-17-fix.
   - Recommendation: Await it synchronously, following the exact same `ensurePlatformsCaptured` pattern (Pattern 2 above already reflects this). Low risk either way since the pattern already exists to copy.

3. **Exact `osarch` payload shape for the three pre-work sample titles** (32-bit-only, 64-bit, no-osarch) is not yet captured.
   - What we know: Field path and casing corroborated by two independent sources (Assumption A1).
   - What's unclear: The literal absent-vs-empty-string distinction for the "no osarch" case, and whether legacy `"osx"` vs current `"macos"` appears in practice for any of the three sample titles.
   - Recommendation: This is precisely the blocking pre-work already identified in `.planning/todos/pending/steam-getproductinfo-appinfo-dump.md` — the planner should sequence a Wave 0 task that runs this dump (using the `ensureMacArchHint`/`parseOsArchHint` scaffolding built in this phase, run once manually against real titles) before the parser's unit test fixtures are finalized.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `steam-user` client connection (authenticated CM session) | MAC32-01 (`getProductInfo`) | ✓ (already required by existing Phase 2/17 code) | 5.3.0 | If disconnected, `ensureMacArchHint()` no-ops and leaves `mac_arch` unset → `isBottleEligible()` falls back to the existing `is_mac_native` check only (safe: never over-routes) |
| `lipo` (Xcode Command Line Tools) | MAC32-03 (Mach-O ground truth) | Not verifiable from this (non-macOS) research environment — must be verified on a real macOS target machine | — | `file` (BSD base install, always present on macOS) — see Pitfall 4 |
| `file` (BSD userland) | MAC32-03 fallback | Not verifiable from this environment | — | None further — if both fail, verdict stays inconclusive (pre-install hint is retained, not overwritten) |

**Missing dependencies with no fallback:** None — both `lipo` and `file` have a documented fallback chain, and `file` itself is not expected to ever be missing on macOS.

**Missing dependencies with fallback:** `lipo` → `file`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest 29.3.2 [VERIFIED: package.json] |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest src/backend/storeManagers/steam/__tests__/macArch.test.ts` |
| Full suite command | `pnpm test` (equivalently `npx jest`) |

The Steam store manager already has a mature, directly-analogous test suite (`src/backend/storeManagers/steam/__tests__/{games,library,bottle,state,user}.test.ts`) using the exact mocking patterns this phase needs:
- `jest.mock('child_process', () => ({ spawnSync: jest.fn(), execFileSync: jest.fn() }))` — already present in `library.test.ts:104-107`, directly reusable for mocking `lipo`/`file` calls.
- `jest.mock('backend/constants/environment', () => ({ isMac: false, ... }))` with per-test `envMock.isMac = true` flips — already present in `games.test.ts:143-153`.
- `jest.mock('../electronStores', ...)` — already present in `games.test.ts:51`, reusable for asserting `steamMetadataStore.set()` calls with the new `mac_arch` field.
- `jest.mock('@node-steam/vdf', () => ({ parse: jest.fn() }))` — already present, unrelated but confirms the parse-mocking pattern if any VDF fallback path is added.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAC32-01 | `parseOsArchHint` returns `'32'`/`'64'`/`'unknown'` correctly for osarch=32, osarch=64, missing key, empty string, `oslist:"osx"` (legacy), `oslist:"macos"` (current), and the three documented false-flag titles (fixture payloads shaped like A Hat in Time/Metro: Last Light/BattleBlock Theater — i.e. osarch absent, verify result is `'unknown'` not `'32'`) | unit | `npx jest src/backend/storeManagers/steam/__tests__/macArch.test.ts -t "parseOsArchHint"` | ❌ Wave 0 — new file |
| MAC32-01 | `ensureMacArchHint()` calls `getProductInfo` with the correct appId, persists `mac_arch` to `steamMetadataStore`, no-ops when already resolved, no-ops when client disconnected | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "ensureMacArchHint"` | ❌ Wave 0 — extend existing file |
| MAC32-02 | `isBottleEligible()` returns `true` when `mac_arch==='32'` regardless of `is_mac_native`/`platformsCaptured` state; existing D-11 tests (`is_mac_native===false` path) still pass unchanged (regression guard) | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "isBottleEligible"` | ❌ Wave 0 — extend existing `describe('SteamGame.isNative()...')` block (`games.test.ts:561`) |
| MAC32-02 | `install()`/`launch()`/`uninstall()` route through `tellBottledSteamToInstall`/`tellBottledSteamToLaunch`/`tellBottledSteamToUninstall` (not native `steam://`) when `mac_arch==='32'` | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "bottle routing"` | ✅ existing `describe` blocks at `games.test.ts:630`/`856` — extend with a `mac_arch: '32'` case |
| MAC32-03 | `machOArchsOf`/`verdictFromArchs` correctly classify `['i386']`→`'32'`, `['x86_64']`→`'64'`, `['x86_64','arm64']`→`'64'`, `[]`→`null` (inconclusive), and fall back to `file` output parsing when `lipo` throws | unit | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "machOArchs"` | ❌ Wave 0 — extend existing file, reuse existing `child_process` mock block |
| MAC32-03 | `verifyMacArchGroundTruth` skips when `source==='bottle'`, skips when not macOS, skips when `mac_arch` already `'32'`, correctly locates a `.app` bundle via `locateMachOBinary` | unit | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "verifyMacArchGroundTruth"` | ❌ Wave 0 — extend existing file |
| MAC32-04 | `MacArchBadge` renders nothing when `mac_arch !== '32'`; renders the "32" mark when `mac_arch === '32'`; applies actionable/warning styling only when `is.mac` (host darwin), informational styling otherwise | unit (RTL) | `npx jest src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx` | ❌ Wave 0 — new component + test |
| MAC32-04 | Manual/visual: badge renders beside the game logo (`.store-icon` sibling) in the actual GamePage left panel on a real build | manual-only | — (visual regression not in scope; existing PlatformSupport/AppleWikiInfo precedent in this repo also relies on manual visual UAT — see STATE.md "Runtime visual UAT pending" entries throughout) | N/A |

### Sampling Rate

- **Per task commit:** `npx jest src/backend/storeManagers/steam/__tests__/<touched-file>.test.ts` (targeted, <30s)
- **Per wave merge:** `pnpm test` (full suite — this repo already runs 938+ tests across 48 suites per the last recorded full-suite gate in STATE.md; expect a similar full run here)
- **Phase gate:** Full suite green (`pnpm test` exit 0) + `tsc`/`eslint` clean, before `/gsd:verify-work` — matches this repo's established convention (see every recent quick-task log in STATE.md: "codecheck 0, N tests pass")

### Wave 0 Gaps

- [ ] `src/backend/storeManagers/steam/__tests__/macArch.test.ts` — covers MAC32-01 (`parseOsArchHint` fixtures, including the three false-flag titles and the missing-vs-empty-string distinction)
- [ ] Extend `src/backend/storeManagers/steam/__tests__/games.test.ts` — covers MAC32-01 (`ensureMacArchHint`), MAC32-02 (`isBottleEligible` extension + routing)
- [ ] Extend `src/backend/storeManagers/steam/__tests__/library.test.ts` — covers MAC32-03 (`machOArchsOf`, `verdictFromArchs`, `locateMachOBinary`, `verifyMacArchGroundTruth`), reusing the existing `child_process` mock block (`library.test.ts:104-107`)
- [ ] `src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx` — covers MAC32-04 (new file + new test directory — no existing `__tests__` dir under `GamePage/components/`; verify RTL/jest-dom setup is already available repo-wide via `@testing-library/jest-dom` in `package.json` devDependencies, confirmed present)
- [ ] The pre-work runtime dump (`steam-getproductinfo-appinfo-dump.md`) itself is a Wave 0 prerequisite — its output should seed the exact fixture payloads for the `parseOsArchHint` test file above, not synthetic guesses

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase reuses the existing authenticated `steam-user` session; no new auth surface |
| V3 Session Management | No | No new session state |
| V4 Access Control | No | No new access-control surface |
| V5 Input Validation | Yes | `appId` reused from the existing `/^\d+$/` guard pattern already established in `buildSteamProtocolUrl` (`games.ts:50-62`) — apply the same guard before passing `appId` into `getProductInfo([parseInt(appId, 10)], [])`. `installPath`/binary paths passed to `execFileSync` must stay argv-form (never shell-interpolated) — see Anti-Patterns |
| V6 Cryptography | No | No new cryptographic surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via a crafted `installdir`/install path flowing into `lipo`/`file` | Tampering | Argv-form `execFileSync(cmd, [arg1, arg2])` — never `exec()`/template-string shell commands. Codebase already follows this convention everywhere (`spawnSync`/`execFileSync` calls in `library.ts`); this phase must not introduce the first `exec()` call in the module. |
| Malformed/oversized PICS appinfo response causing unbounded parsing work | Denial of Service | `getProductInfo` already has a built-in 3600000ms (60min) internal timeout (`apps.js:182`) — acceptable for a background hint fetch that's already awaited behind `ensurePlatformsCaptured`-style dedup, but consider wrapping with the same `METADATA_FETCH_TIMEOUT_MS` bound already used for the appdetails fetch (`state.ts`) so a hung PICS request can't indefinitely stall `install()`/`launch()`. Flag as a planner decision — CONTEXT.md doesn't specify a timeout value for this call. |
| Non-numeric/injected `appId` reaching `getProductInfo` | Tampering | Reuse the exact `/^\d+$/` guard from `buildSteamProtocolUrl` (T-03-01 precedent) before constructing the `apps` array argument |

## Sources

### Primary (HIGH confidence)
- Direct repo inspection: `src/backend/storeManagers/steam/{games,library,user,electronStores,constants}.ts` — existing code, patterns, and integration points, read in full
- Direct `node_modules` inspection: `node_modules/steam-user/components/apps.js` (`getProductInfo` implementation, `enablePicsCache` gating), `node_modules/@types/steam-user/index.d.ts` (`Launch`, `AppInfoConfig`, `AppInfoContent`, `ProductInfo` types)
- `package.json` — confirms `steam-user@^5.3.0`, `@types/steam-user@^5.1.1`, `@node-steam/vdf@^2.2.0` already installed [VERIFIED: package.json + npm view cross-check]
- `.planning/phases/18-.../18-CONTEXT.md`, `.planning/notes/steam-mac-arch-detection-decisions.md`, `.planning/todos/pending/steam-getproductinfo-appinfo-dump.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/17-.../17-CONTEXT.md` — all read in full

### Secondary (MEDIUM confidence)
- [Apple lipo(1) man page mirror](https://keith.github.io/xcode-man-pages/lipo.1.html) and [ss64.com/mac/lipo.html](https://ss64.com/mac/lipo.html) — `-archs` output format (space-separated arch list)
- [WindowsGSM/SteamAppInfo](https://github.com/WindowsGSM/SteamAppInfo/blob/main/AppInfo/548400.json) — third-party public mirror of real Steam appinfo JSON, corroborates lowercase `oslist` casing and genuine key-absence for `osarch`
- Prior research already cited in `.planning/notes/steam-mac-arch-detection-decisions.md` (node-steam-user README, steamtinkerlaunch Appinfo wiki, Steam community false-32-bit-flagging thread) — carried forward, not re-verified in this session

### Tertiary (LOW confidence)
- None — everything above is either direct code inspection or cross-referenced with at least one independent source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all versions confirmed by direct filesystem + `npm view` cross-check
- Architecture / integration points: HIGH — every hook point (`isBottleEligible`, `pollInstallOnce`, `ensurePlatformsCaptured`, `GamePage`'s `.mainInfo`/`.store-icon`) verified by reading the actual current source, not inferred
- `osarch` payload shape / parser correctness: MEDIUM — corroborated by two independent sources but the canonical pre-work dump has not yet been run; this is the one area planners should treat as provisional until Wave 0 completes
- Mach-O ground-truth mechanics: MEDIUM-HIGH — `lipo`/`file` behavior is well-established general macOS knowledge, cross-checked via WebSearch, but not executable/testable from this (non-macOS) research environment
- Pitfalls: HIGH — Pitfall 1 (types gap) and Pitfall 3 (`is_mac_native===true` for 32-bit games) are both derived directly from reading the actual type definitions and actual current `isBottleEligible()` logic, not speculation

**Research date:** 2026-07-12
**Valid until:** 30 days (stable — steam-user/PICS/Mach-O tooling all move slowly; re-verify sooner only if the pre-work dump surfaces a payload shape that contradicts this research)
