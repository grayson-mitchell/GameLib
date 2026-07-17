# Phase 22: Steam Game Families (multiple bottle configurations) - Research

**Researched:** 2026-07-17
**Domain:** Electron/TypeScript backend refactor (single→N CrossOver bottle model) + React/zustand frontend surfaces, macOS-only
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Family identity & naming model**
- **D-01: Decoupled id + display name.** A family is
  `SteamFamily = { bottleName, displayName, wineVersion?, provisioned }` where `bottleName`
  is a **stable CrossOver bottle directory id** (immutable once created, sanitized, used for
  ALL paths / `cxbottle` ops) and `displayName` is an **editable label**. Rename only ever
  touches `displayName` — never moves the bottle directory, never risks `cxbottle.conf`,
  running processes, or installed-game paths.
- **D-02: `displayName` carries the Req 9 rules; `bottleName` is derived then frozen.**
  `sanitizeBottleName` + uniqueness are enforced on the editable `displayName`. The stable
  `bottleName` dir id is auto-derived at creation via `slug(displayName)` + collision-suffix,
  then **frozen**. A new family's auto `displayName` = `'Family N'` (next free integer),
  editable, no required typing (Req 9).
- **D-03: "Default" is an ordinary family, just remembered.** `'Default'` is only a
  `displayName` on the migrated `GameLibSteam` bottle. It is renameable and deletable like
  any other family (subject to the last-family guard, Req 5). **Nothing hardcodes the string
  `'Default'`.** The install picker's "pre-selected default" is a **soft/remembered** default:
  `lastUsedFamily ?? migratedFamily`.

**State/store shape**
- **D-04: Reshape `steamBottleConfigStore` in place (one store).** Same store
  (`steamBottleConfigStore`, `cwd: steam_store`), reshaped to hold
  `families: Record<bottleName, SteamFamily>` + `assignments: Record<appId, bottleName>`,
  replacing the old flat `bottleName`/`wineVersion`/`provisioned` keys. `bottle.ts` helpers
  read `families[bottleName]` instead of top-level keys.

**Routing resolution**
- **D-05: Central resolver, threaded bottleName (Option A).** A single
  `resolveFamilyForApp(appId)` returns a discriminated result
  `{ status: 'ok' | 'needs-provision', bottleName }`. `games.ts` install/launch/uninstall
  call it **first**, branch on `needs-provision` (route to guided setup for **that family's**
  bottle — Req 7), then pass the resolved `bottleName` into `tell*(appId, bottleName)` and
  the poller. `steam/bottle.ts` stays a **pure primitive** (no hidden store reads).
  A `needs-repick` status was considered and **dropped** (D-08): deleted-family games become
  uninstalled+unassigned and re-pick via the normal install picker.
- **D-06: Cross-family poller (Req 8).** Install-state reconciliation and the ACF poller
  iterate **all** families' steamapps dirs (`getBottleSteamappsDir(bottleName)` per family),
  so a game installed in any family shows installed.

**Migration & default resolution**
- **D-07: Eager one-time versioned migration at startup.** On app start, if the store has no
  `schemaVersion`, build `families['GameLibSteam']` from the old flat values (preserving
  `wineVersion` + `provisioned`), set `displayName: 'Default'`, clear the old flat keys, and
  stamp a schema version. Runs once; every reader afterward sees only the new shape.
- **D-08: Backfill legacy installs; unassigned → migrated bottle.** During migration, scan
  the migrated `GameLibSteam` bottle's steamapps (ACF) and write an explicit
  `assignments[appId] = 'GameLibSteam'` for each already-installed game. Any still-unassigned
  appId (never installed) resolves to the migrated bottle name as a deterministic fallback.
- **D-09: Delete semantics (Req 5/7).** `deleteFamily(bottleName)` removes the CrossOver
  bottle directory, and for each affected game clears its `assignment` **and** marks it
  **uninstalled**. The game returns to uninstalled+unassigned; clicking Install shows the
  standard Req 3 family picker — that **is** the "re-pick." Deleting the **last** remaining
  family is blocked (Req 5). Delete is confirm-gated, naming the affected games (Req 5).

**UI surfaces**
- **D-10: Install picker clones the existing location-picker pattern.** Build
  `SteamFamilyPicker.tsx` + a `useSteamFamilyPicker` zustand store as a sibling of
  `SteamInstallLocationPicker.tsx` / `SteamInstallLocation.ts`. Lists families
  (pre-selected per D-03) plus a "New family…" row. Choosing "New family" creates it inline
  (auto `displayName`), then kicks straight into that family's guided provision + login, then
  continues the install — one flow, no context switch. Native-macOS and all Linux/Windows
  Steam games show **no** picker (Req 3).
- **D-11: Family management lives in a new "Steam Families" Settings section.** A dedicated
  section within the existing Settings screen, alongside the current Steam components
  (`CrossoverBottle.tsx`, `EnableSteamNativeInstall.tsx`, `DefaultSteamPath.tsx`). Per-row
  rename / Wine-version / delete, plus "Create family." Create/provision **reuses the existing
  `SteamBottleSetup` guided flow, parameterized by `bottleName`.** Behind the `isMac` gate.

**IPC surface**
- **D-12: New cohesive family IPC set; fold in `steamBottleStatus`.** Add:
  `listFamilies()`, `createFamily(displayName) -> {bottleName}`,
  `renameFamily(bottleName, displayName)`, `deleteFamily(bottleName)`,
  `setFamilyWine(bottleName, wineVersion)`, `assignGameToFamily(appId, bottleName)`, and
  `familyStatusForApp(appId) -> 'ok' | 'needs-provision'`. The old single-bottle
  `steamBottleStatus` (provisioned + bottleName) is **folded into** `listFamilies` / the
  per-app status so there is **one** family-aware source.

### Claude's Discretion
- Exact wave/plan breakdown (SPEC suggests 4 plans).
- `slug()` implementation details (which chars map to `-`, casing) — must produce a
  `sanitizeBottleName`-clean, collision-checked dir id.
- Confirm-dialog copy/enumeration for delete; how "affected games" are listed.
- How `familyStatusForApp` / the resolver surface `needs-provision` in each entry point
  (Install vs Play button state), consistent with the Phase 17 `settingUpBottle` gating in
  `GamePage/index.tsx`.
- Whether `lastUsedFamily` is persisted in the store or derived; where it's read for the
  picker pre-selection.

### Deferred Ideas (OUT OF SCOPE)
- **Moving an installed game between families in-app** — reinstall to move (no
  file-copy/move helper); prefix isolation makes it a re-download anyway.
- **Concurrent play across families on one Steam account** — not solvable here (Steam allows
  one active session per account; needs distinct accounts).
- **Sharing a single Steam login / downloaded files across families** — out of scope (prefix
  isolation + D-04 opaque auth).
- **The native-Steam bridge (Proton-style, one native client + cheap per-game prefixes)** —
  the user's preferred long-term architecture; gated on a hard dependency (no macOS
  `lsteamclient`). Seeded as `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Must remain Electron + React + TypeScript, and stay mergeable with Heroic upstream — this
  phase introduces zero new dependencies and clones existing internal patterns rather than
  adding a component library, satisfying this directly.
- Steam integration lives in `src/backend/storeManagers/steam/*` per the existing
  Technology Stack decisions (steam-user, steam-session, `@node-steam/vdf`, electron-store) —
  this phase does not touch auth/library-sync, only the CrossOver bottle layer.
- GSD workflow enforcement: file-changing work must go through a GSD command
  (`/gsd-execute-phase` etc.) — not directly relevant to research itself, but the planner
  should structure plans/tasks accordingly.

## Summary

This phase generalizes the Phase 17 single-bottle Steam-on-macOS foundation
(`steam/bottle.ts`, `steamBottleConfigStore`, `SteamBottleSetup.tsx`) from "one
dedicated CrossOver bottle for every bottle-eligible game" to "N named
family bottles + a persistent appId→bottleName assignment map." Every
locked decision (D-01..D-12) is already fully specified in `22-CONTEXT.md`;
there are no open design questions left for the planner to resolve at the
architecture level. What this research adds is the **exact code-level
delta** — which functions already accept a `bottleName` parameter (the
Phase-17-built seam) versus which functions read the single stored value
implicitly and must be threaded through, and which of the two frontend
install chokepoints and the guided-setup store are hardcoded single-bottle
today.

The core finding: `steam/bottle.ts`'s low-level path helpers
(`getBottleDir`, `getBottleSteamappsDir`, `getBottleSteamExePath`,
`sanitizeBottleName`, `isBottleProvisioned(bottleName?)`,
`isBottleReady(bottleName?)`, `provisionBottle({bottleName})`) already take
an optional `bottleName` — this is the seam Phase 17 deliberately built and
D-05 explicitly says to reuse. But three call sites do **not** yet thread a
resolved bottle name and must gain one: (1) `getSteamBottleSettings()` (no
param, reads flat `wineCrossoverBottle`/`wineVersion` keys), (2)
`dispatchToBottledSteam`/`tellBottledSteamTo{Install,Launch,Uninstall}`
(appId only, reads the flat stored `bottleName` internally), and (3) the
bottle-scoped ACF poller (`getBottleSteamappsRoot()`, `buildBottleInstalledMap()`,
`readAcfState(appId, 'bottle')`, `startInstallPolling`) which all resolve a
single implicit root. On the frontend, `SteamBottleSetup.tsx` +
`useSteamBottleSetup` and the `steamBottleStatus`/`steamBottleProvision` IPC
trio are all single-bottle by construction and need `bottleName` added to
their signatures, not just their bodies. There are also **two** separate
install chokepoints to gate with the new family picker
(`GamePage/index.tsx:672`'s direct bypass, and `InstallGameModal.ts`'s
`startSteamInstall`), and a genuine open question (not resolved by
CONTEXT.md) about how the frontend decides a game is bottle-eligible at all
before it can show the family picker — flagged below as a planner decision
point, since the codebase's own comments explicitly warn against
re-deriving that predicate client-side.

**Primary recommendation:** Thread a resolved `bottleName` string through
every bottle.ts primitive and poller call that currently defaults to the
single stored value, reshape `SteamBottleConfig` in place (D-04), and clone
the two existing frontend patterns (`SteamInstallLocationPicker`/
`SteamInstallLocation` for the install-time picker, `TwoColTableInput`'s
row/icon conventions for the Settings list) exactly as `22-UI-SPEC.md`
specifies — do not invent new frontend patterns.

<phase_requirements>
## Phase Requirements

No formal REQ-XX IDs were minted for this phase; `22-SPEC.md` locks 9
numbered requirements instead. Mapped below (also used as the Validation
Architecture requirement IDs):

| ID | Description | Research Support |
|----|-------------|------------------|
| Req 1 | Multi-family data model: N bottles + appId→family assignment map | D-04 reshape verified against `common/types/steam.ts`/`electronStores.ts`; see Pattern "Reading a family entry" |
| Req 2 | Zero-loss migration of the existing bottle to "Default" | D-07/D-08 verified against current flat-key reads in `bottle.ts`; see Pitfall 2 |
| Req 3 | Install-time family picker (Default pre-selected), never shown for native/Linux/Windows | D-10 verified against `SteamInstallLocationPicker.tsx`/`SteamInstallLocation.ts` (exact clone target); see Pitfall 6, Pitfall 7, Open Question 1 |
| Req 4 | Family lifecycle management (Settings): create/rename/set-wine/delete | D-11 verified against `EnableSteamNativeInstall.tsx`/`DefaultSteamPath.tsx`/`TwoColTableInput` patterns |
| Req 5 | Destructive, guarded delete (confirm-gated, last-family blocked) | D-09 verified; `showDialogModal` pattern confirmed as the reuse target |
| Req 6 | Per-family one-time login via guided setup | D-11 verified against `SteamBottleSetup.tsx` (currently hardcoded single-bottle); see Pitfall 4 |
| Req 7 | Not-ready/deleted family routing (never silently hits wrong family) | D-05 verified against the 4 `isBottleEligible()` call sites in `games.ts`; see Pattern 2, Pitfall 1 |
| Req 8 | Cross-family install-state reconciliation | D-06 verified against `buildBottleInstalledMap()`/`buildInstalledMap()` in `library.ts`; see Pattern 3 |
| Req 9 | Family naming/count rules (auto-named, renameable, sanitized, unique, unbounded) | D-01/D-02 verified against existing `sanitizeBottleName` (`bottle.ts:156-169`) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Family CRUD (create/rename/delete/set-wine) | API/Backend (`steam/families.ts`, new) | Database/Storage (`steamBottleConfigStore`) | Pure state mutation + CrossOver `cxbottle` process calls; no UI logic |
| Game→family assignment resolution | API/Backend (`resolveFamilyForApp`, new) | — | Single chokepoint consumed by install/launch/uninstall/poller — must not be re-derived per call site (D-05) |
| CrossOver bottle lifecycle (create/delete dir, `cxbottle.conf`) | API/Backend (`steam/bottle.ts`) | OS/Filesystem | Already established in Phase 17; extends to accept explicit `bottleName` everywhere |
| Bottled Steam client dispatch (install/launch/uninstall verbs) | API/Backend (`dispatchToBottledSteam`) | Wine/CrossOver runtime | Fire-and-forget process dispatch via `runWineCommand`; never optimistic — ACF is truth |
| Cross-family ACF reconciliation / poller | API/Backend (`steam/library.ts`) | Database/Storage (`library` in-memory Map + `steamLibraryStore`) | Must scan every family's steamapps root, not just one (D-06) |
| Install-time family picker UI | Frontend/Client (React + zustand) | API/Backend (`listFamilies`, `familyStatusForApp`) | Clone of existing `SteamInstallLocationPicker` pattern (D-10) |
| Family management UI (Settings) | Frontend/Client (React) | API/Backend (family IPC group) | New Settings section; clone of `TwoColTableInput` row/icon conventions (D-11) |
| Guided per-family Steam login/provision | Frontend/Client (`SteamBottleSetup.tsx`, parameterized) | API/Backend (`provisionBottle`) | Reused verbatim, parameterized by `bottleName` (D-11) — no new provisioning mechanism |
| Startup migration (flat→families/assignments) | API/Backend (one-time, app startup) | Database/Storage | Runs once before any family reader (D-07) — must complete before `main.ts` registers any Steam IPC handler that reads the store |

## Standard Stack

This phase introduces **no new npm packages**. It is a pure extension of
the existing Phase 17 stack:

### Core (already in project — reused, not newly installed)
| Library | Version | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------------------------|
| electron-store (via `TypeCheckedStoreBackend`) | existing | Persist `families`/`assignments` in `steamBottleConfigStore` | Same store, reshaped in place per D-04; no new store file |
| zustand | existing | Frontend state for `SteamFamilyPicker.ts`, updated `SteamBottleSetup.ts` | Matches every existing GameLib frontend store (`SteamInstallLocation.ts`, `useSteamBottleSetup`) |
| `graceful-fs` | existing | `cxbottle.conf` reads, bottle dir existence checks, `rmSync` on delete | Already used throughout `bottle.ts` |
| `@mui/icons-material` | existing | `EditIcon`, `RemoveCircleIcon`, `AddBoxIcon` for family-row actions | Established icon-button convention (`TwoColTableInput`) |

**Installation:** none required — no `package.json` changes for this phase.

**Version verification:** N/A — no new packages.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero new external packages; it
extends existing backend modules (`steam/bottle.ts`, `steam/games.ts`,
`steam/library.ts`, `steam/electronStores.ts`) and clones existing frontend
components. No `npm install` step, no slopcheck/registry verification
needed.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │   Frontend (React + zustand)             │
                         │                                           │
  Install click ────────►│ handleInstall() [GamePage/index.tsx:672] │
  (game page)             │ startSteamInstall() [InstallGameModal.ts]│
                         │            │                              │
                         │            ▼  (NEW: bottle-eligible gate) │
                         │   SteamFamilyPicker.tsx (D-10, new)       │
                         │   ├─ pick existing family ─────┐          │
                         │   └─ "New family…" ─┐          │          │
                         │                     ▼          │          │
                         │   SteamBottleSetup.tsx (D-11,   │          │
                         │   parameterized by bottleName)  │          │
                         │                     │           │          │
                         └─────────────────────┼───────────┼──────────┘
                                               │ IPC        │ IPC
                                               ▼            ▼
                         ┌─────────────────────────────────────────┐
                         │   Backend (main process)                 │
                         │                                           │
                         │  createFamily / renameFamily / deleteFamily
                         │  setFamilyWine / assignGameToFamily       │
                         │  familyStatusForApp / listFamilies (D-12) │
                         │            │                              │
                         │            ▼                              │
                         │  resolveFamilyForApp(appId)  (D-05, new)  │
                         │  { status: 'ok'|'needs-provision',        │
                         │    bottleName }                           │
                         │            │                              │
                         │            ▼                              │
  games.ts install()/launch()/uninstall()/getSettings()               │
                         │            │                              │
                         │            ▼                              │
                         │  steam/bottle.ts (PURE primitives)        │
                         │  provisionBottle({bottleName})            │
                         │  tellBottledSteamTo{Install,Launch,       │
                         │    Uninstall}(appId, bottleName)          │
                         │            │                              │
                         │            ▼                              │
                         │  cxbottle CLI ──► CrossOver bottle dir    │
                         │  runWineCommand ──► bottled steam.exe     │
                         │                                           │
                         │  steam/library.ts poller (D-06)           │
                         │  iterates families[*] steamapps roots ───►│
                         │  merges into library Map, tags bottleName │
                         └─────────────────────────────────────────┘
                                               │
                                               ▼
                         steamBottleConfigStore (D-04, reshaped)
                         { schemaVersion, families: Record<bottleName,
                           SteamFamily>, assignments: Record<appId,
                           bottleName> }
```

### Recommended Project Structure (new/changed files only)

```
src/backend/storeManagers/steam/
├── bottle.ts               # CHANGED: getSteamBottleSettings(bottleName),
│                           #   dispatchToBottledSteam(verb, appId, bottleName)
├── families.ts              # NEW: createFamily/renameFamily/deleteFamily/
│                           #   setFamilyWine/listFamilies/resolveFamilyForApp
├── electronStores.ts        # CHANGED: SteamBottleConfig reshape (D-04)
├── games.ts                 # CHANGED: install/launch/uninstall/getSettings
│                           #   call resolveFamilyForApp() first (D-05)
├── library.ts                # CHANGED: buildBottleInstalledMap iterates all
│                           #   families (D-06); readAcfState/poller take
│                           #   an explicit bottleName
└── __tests__/
    ├── families.test.ts     # NEW
    ├── bottle.test.ts        # CHANGED: bottleName-param coverage
    ├── games.test.ts          # CHANGED: resolver branch coverage
    └── library.test.ts        # CHANGED: multi-family scan coverage

src/common/types/steam.ts    # CHANGED: SteamFamily + SteamBottleConfig reshape

src/frontend/
├── screens/Game/GamePage/components/
│   ├── SteamFamilyPicker.tsx      # NEW (clone of SteamInstallLocationPicker)
│   └── SteamBottleSetup.tsx        # CHANGED: parameterized by bottleName
├── state/
│   ├── SteamFamilyPicker.ts        # NEW (clone of SteamInstallLocation.ts)
│   └── SteamBottleSetup.ts          # CHANGED: open(appName, bottleName)
└── screens/Settings/components/
    ├── SteamFamilies.tsx            # NEW
    └── SteamFamilies.scss             # NEW
```

### Pattern 1: `bottleName` threading (extend the existing Phase 17 seam)

**What:** Every function that currently defaults to a single stored bottle
name must accept an explicit `bottleName` parameter, with the *fallback*
(only used pre-migration or for the resolver itself) changing from
`DEFAULT_STEAM_BOTTLE_NAME` to "the migrated bottle's name."

**When to use:** Any `steam/bottle.ts` or `steam/library.ts` function that
currently does `bottleName ?? steamBottleConfigStore.get_nodefault('bottleName') ?? DEFAULT_STEAM_BOTTLE_NAME`.

**Example (current code, `bottle.ts:233-239`):**
```typescript
// Source: src/backend/storeManagers/steam/bottle.ts (existing, Phase 17)
export function isBottleReady(bottleName?: string): boolean {
  const name =
    bottleName ??
    steamBottleConfigStore.get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
  ...
}
```
This function is ALREADY family-ready — it accepts an optional name. The
functions that are NOT yet ready (`getSteamBottleSettings()`,
`dispatchToBottledSteam`) must be brought to this same shape:

```typescript
// Target shape for getSteamBottleSettings (currently zero-arg, bottle.ts:266)
export function getSteamBottleSettings(bottleName: string): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  const family = steamBottleConfigStore.get_nodefault('families')?.[bottleName]
  return {
    ...globalSettings,
    wineCrossoverBottle: bottleName, // bottleName IS the CrossOver bottle id (D-01/D-02) — no separate stored key needed
    wineVersion: family?.wineVersion ?? globalSettings.wineVersion
  }
}
```

### Pattern 2: Resolver-first routing (D-05)

**What:** `games.ts`'s `install()`/`launch()`/`uninstall()`/`getSettings()`
each independently check `isBottleEligible()` then `isBottleReady()` today
(three near-identical blocks at `games.ts:562-611`, `919-937`, `1002-1019`).
D-05 requires calling `resolveFamilyForApp(appId)` FIRST in each, branching
on `needs-provision`, then passing the resolved `bottleName` into every
downstream call.

**When to use:** All four `SteamGame` methods that currently gate on
`this.isBottleEligible()`.

**Example (target shape, based on existing `install()` at `games.ts:560-611`):**
```typescript
// Source: pattern derived from existing games.ts:560-611 (Phase 17), + D-05
async install(args: InstallArgs): Promise<InstallResult> {
  await this.ensurePlatformsCaptured()
  if (this.isBottleEligible()) {
    const resolved = resolveFamilyForApp(this.appId)
    if (resolved.status === 'needs-provision') {
      sendFrontendMessage('steamBottleSetupRequired', {
        appName: this.appId,
        bottleName: resolved.bottleName // NEW field — the frontend guided-setup
                                          // store must open for THIS family, not
                                          // "the" bottle
      })
      return { status: 'done', deferredToSetup: true }
    }
    const result = await tellBottledSteamToInstall(this.appId, resolved.bottleName)
    if (result.status !== 'done') return { status: 'error', error: result.error }
    startInstallPolling(this.appId, { source: 'bottle', bottleName: resolved.bottleName })
    return { status: 'done' }
  }
  // ...unchanged native path
}
```

### Pattern 3: Multi-family ACF reconciliation (D-06)

**What:** `buildBottleInstalledMap()` (used by `refresh()` at
`library.ts:442-443` and `refreshInstallState()` at `library.ts:610-611`)
currently scans ONE root via `getBottleSteamappsRoot()` (`library.ts:62-63`),
which itself calls the single-bottle `getSteamBottleSettings().wineCrossoverBottle`.
This must become a multi-root scan mirroring how `buildInstalledMap()`
(the NATIVE equivalent, `library.ts:657` area) already iterates multiple
library paths — but the bottle version must additionally tag which
`bottleName` each hit came from, since D-05's poller and D-09's delete both
need that.

**When to use:** Both full-resync (`refresh()`) and incremental
(`refreshInstallState()`) reconciliation paths, plus the targeted
single-appId poller (`readAcfState`, `pollInstallOnce`, `startInstallPolling`).

**Example (target shape):**
```typescript
// Source: pattern derived from existing buildInstalledMap() (library.ts,
// native multi-root precedent) + buildBottleInstalledMap() (single-root,
// to be generalized) + D-06
export async function buildBottleInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string; bottleName: string }>
> {
  const installed = new Map<number, { installPath: string; sizeOnDisk: string; bottleName: string }>()
  const families = steamBottleConfigStore.get_nodefault('families') ?? {}
  for (const bottleName of Object.keys(families)) {
    const steamappsDir = getBottleSteamappsDir(bottleName)
    if (!existsSync(steamappsDir)) continue
    // ...same ACF-parse loop as buildInstalledMap(), tagging bottleName
  }
  return installed
}
```

### Anti-Patterns to Avoid

- **Re-deriving eligibility/routing logic per call site:** `games.ts`
  already has this anti-pattern partially avoided via the private
  `isBottleEligible()` single source of truth — do not let
  `resolveFamilyForApp` become a second parallel eligibility check; it
  should assume eligibility was already confirmed by the caller and focus
  purely on "which bottle."
- **Writing `families[bottleName]` as a full-object replace on every
  mutation:** `renameFamily`/`setFamilyWine` must read-modify-write the
  single `bottleName` entry (`{ ...families, [bottleName]: { ...families[bottleName], displayName } }`),
  never touch other families' entries — a naive `.set('families', {[bottleName]: ...})`
  would silently delete every other family.
- **Hardcoding `'Default'` anywhere in the resolver or IPC layer** — D-03
  is explicit that `'Default'` is only ever a `displayName` string on
  whichever bottle happens to be the migrated one; nothing should special-case
  the literal string `'Default'` in routing logic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CrossOver bottle create/delete | A custom bottle-management shell wrapper | `cxbottle --create`/`--delete` via `spawnAsync` (already in `bottle.ts`) | Locked mechanism from the 17-01 spike; reinventing risks missing the win10_64 template flag or the wineserver-kill-before-delete sequencing (`killBottleWineServer`) |
| Family name uniqueness/sanitization | A new validation function | `sanitizeBottleName` (T-17-01, already exported) + a simple `Object.keys(families).includes(candidate)` uniqueness check | Reuse is explicitly locked (D-02); a second validator risks drifting from the path-traversal guard |
| Wine-version-restricted-to-CrossOver dropdown | A parallel `<select>` implementation | `WineVersionSelector`'s rendering conventions (icon-prefixed `MenuItem`s), filtered to `type === 'crossover'` | UI-SPEC explicitly names this as the precedent to reuse, not a new component |
| Destructive confirm dialog | A bespoke modal | `showDialogModal` (`ContextProvider`/`GlobalState.tsx`), mirroring `handleStopInstallation`'s call shape | Every other in-app destructive confirm in this codebase goes through this one mechanism |
| Slug/dir-id generation from a display name | A generic slugify library | A small local `slug()` (lowercase, non-alnum→`-`, collapse repeats) + collision-suffix loop against `Object.keys(families)` | No new dependency; the transformation is trivial and the collision logic is project-specific (D-02) |

**Key insight:** every "don't hand-roll" item above is instead "don't hand-roll
a NEW mechanism when a Phase 17 mechanism or an existing frontend component
already solves the identical problem for the single-bottle case." This phase's
entire job is generalizing 1→N, not solving new problems.

## Common Pitfalls

### Pitfall 1: Three near-duplicated single-bottle checks in `games.ts` are easy to miss one of
**What goes wrong:** `install()`, `launch()`, and `uninstall()` each have
their own independent `if (this.isBottleEligible()) { if (!isBottleReady()) {...} ... }`
block (lines ~562, ~919, ~1002). It is easy to update two of the three and
miss the third, leaving (e.g.) uninstall still targeting the wrong bottle.
**Why it happens:** The blocks are structurally identical but not factored
into a shared helper.
**How to avoid:** Grep for `isBottleEligible()` call sites before considering
D-05 done (there are exactly 4: `getSettings`, `install`, `launch`,
`uninstall` — plus the `isNative()` wrapper which reuses it and needs no
change). Add a single shared private helper
(`private async resolveOrRequestSetup(): Promise<{status:'ok', bottleName: string} | {status:'deferred'}>`)
inside `SteamGame` to avoid drift.
**Warning signs:** A test suite that passes for install/launch but a
manually-tested uninstall dispatches to the wrong (or the migrated default)
bottle.

### Pitfall 2: `getSteamBottleSettings()` losing its `wineVersion` fallback semantics
**What goes wrong:** The current function falls back to
`globalSettings.wineVersion` when no bottle-specific version is stored
(`bottle.ts:266-279`). If the reshape naively requires every family to have
a `wineVersion` set, a freshly created but not-yet-provisioned family (no
`wineVersion` chosen yet) would get `undefined` engine settings, breaking
`checkWineBeforeLaunch`.
**Why it happens:** The migration (D-07) only guarantees `wineVersion` for
the migrated Default family (carried over from the flat key); brand-new
families start with `wineVersion?: WineInstallation` genuinely absent until
the guided setup runs.
**How to avoid:** Keep the `?? globalSettings.wineVersion` fallback in the
per-family lookup, exactly mirroring current behavior — do not tighten this
to a required field.

### Pitfall 3: The `provisionBottle` CR-01 shared-bottle guard must run for EVERY new family, not just Default
**What goes wrong:** `provisionBottle()` compares the target `bottleName`
against `GlobalConfig.get().getSettings().wineCrossoverBottle` (the shared
GOG/Epic bottle) and refuses to provision into it (`bottle.ts:567-581`,
CR-01/17-17). If a new family's auto-generated slug happens to collide with
the user's shared bottle name (unlikely but not impossible — e.g. user's
shared bottle happens to be named `Family-1`), this guard must still fire.
**Why it happens:** The guard is inside `provisionBottle`, which every
family's create/provision flow reuses (D-11) — so this is actually already
safe by construction, PROVIDED no new code path bypasses `provisionBottle`
and calls `cxbottle --create` directly.
**How to avoid:** Never add a second `cxbottle --create` call site outside
`provisionBottle`. The planner should verify all new family-creation code
paths (`createFamily` IPC handler, "New family…" inline creation) route
through `provisionBottle`, not a lower-level `cxbottle` invocation.
**Warning signs:** A code-review finding a `spawnAsync(CXBOTTLE_BIN, ['--create', ...])`
call anywhere outside `bottle.ts`.

### Pitfall 4: Frontend guided-setup store (`useSteamBottleSetup`) has no `bottleName` concept today
**What goes wrong:** `useSteamBottleSetup.open(appName)` and
`isSteamBottleSetupActiveFor(state, appName, runner)` only track `appName` —
there is no way today to know WHICH family's setup is in progress. If two
games route to two different not-yet-provisioned families in quick
succession, the second `steamBottleSetupRequired` push would silently
overwrite the first's `appName` with no bottle disambiguation, and
`SteamBottleSetup.tsx` would seed `crossoverBottle` to the hardcoded
`DEFAULT_STEAM_BOTTLE_NAME` constant regardless of which family was actually
requested (`steamBottleDefaults.ts:19`, `SteamBottleSetup.tsx:91`).
**Why it happens:** This state and component were built when there was
only ever one bottle, so `bottleName` was never modeled.
**How to avoid:** Add `bottleName` to `SteamBottleSetupState`, to
`open(appName, bottleName)`, to the `steamBottleSetupRequired` push payload
(backend `sendFrontendMessage`), and to `handleSteamBottleSetupRequiredSignal`.
Seed `crossoverBottle` in `SteamBottleSetup.tsx` from the prop, never from
the `DEFAULT_STEAM_BOTTLE_NAME` constant.
**Warning signs:** Manually testing "New family" from the Settings section
provisions into `GameLibSteam` instead of the newly created family's own
bottle name.

### Pitfall 5: `steamBottleStatus` polling inside `SteamBottleSetup.tsx` must become family-aware
**What goes wrong:** The component polls `window.api.steamBottleStatus()`
(no args, global) every 3s while `phase === 'provisioning'`
(`SteamBottleSetup.tsx:104-119`). D-12 folds this IPC away entirely into the
new family group. If the planner leaves the OLD `steamBottleStatus` handler
in place "for compatibility" while ALSO adding new family IPC, the
provisioning-progress poll for a non-Default family will silently report
the WRONG family's status (whatever the old flat `bottleName` key happens
to still hold), showing "Steam is installed" prematurely or never.
**Why it happens:** `steamBottleStatus` reads the flat single
`bottleName`/`provisioned` keys directly — under D-04 those keys no longer
exist after migration.
**How to avoid:** Replace the poll target with a bottleName-scoped call
(e.g. `familyStatusForApp` result, or a small `getFamilyProvisionStatus(bottleName)`
IPC) before removing the old handler, so there's no dangling call to a
deleted store key.
**Warning signs:** TypeScript would actually catch this at compile time IF
`SteamBottleConfig`'s flat keys are removed rather than left as optional —
prefer a hard removal (per D-04's "replacing the old flat keys") so this
surfaces as a build error, not a runtime bug.

### Pitfall 6: Frontend bottle-eligibility check does not exist today and must be added carefully
**What goes wrong:** Neither install chokepoint (`GamePage/index.tsx:672`
nor `InstallGameModal.ts`'s `startSteamInstall`) checks bottle-eligibility
today — they unconditionally treat every `runner === 'steam'` install as
"delegate to backend, let it decide." The `SteamBottleSetup.ts` file has an
explicit comment: *"D-11-safe eligibility (platformsCaptured-aware) lives
entirely in the backend's `isBottleEligible`; the frontend only reflects
that decision"* — i.e. the project deliberately avoided a frontend
eligibility predicate. But `22-UI-SPEC.md` Surface 1 requires "the
chokepoint must check `isBottleEligible` before opening this store, exactly
as it already checks `runner === 'steam' && !is_installed`" — which is a
NEW requirement this phase introduces, not an existing pattern to copy.
**Why it happens:** `GameInfo` (pushed to the frontend) DOES already carry
`is_mac_native`, `mac_arch`, `steamPlatformsCaptured` mirror fields (added
for the platform-icon indicator, DETAIL-01/MAC32), so a client-side mirror
of the backend predicate IS mechanically possible:
`mac_arch === '32' || (steamPlatformsCaptured === true && is_mac_native === false)`.
**How to avoid:** This is a genuine **planner decision point** flagged as
an Open Question below — either (a) accept a client-side mirror predicate
(consistent with the existing `steamPlatformsCaptured` mirroring
convention, but reintroduces the dual-predicate-drift risk the codebase's
own comments warn about), or (b) have `familyStatusForApp`/`listFamilies`'s
IPC response include an `eligible: boolean` flag so the frontend never
re-derives the predicate itself. Given D-12 already adds an IPC round trip
for family status, folding eligibility into that same response is likely
cheaper than option (a) and avoids drift. Recommend (b).
**Warning signs:** A native-macOS game (never bottle-eligible) briefly
shows the family picker if a mirror predicate is implemented slightly
wrong (e.g. missing the `platformsCaptured` gate that prevents a
freshly-synced, not-yet-classified game from being misrouted).

### Pitfall 7: Two install chokepoints, not one
**What goes wrong:** CONTEXT.md and UI-SPEC both correctly identify TWO
separate bypass points — `GamePage/index.tsx:672-684`'s `handleInstall()`
(the game page's own Install button) and `InstallGameModal.ts:51-58`'s
`startSteamInstall()` (used by the library grid / context menu / anywhere
else `openInstallGameModal` is called, line 71-74). A planner who only
patches one will leave the other install entry point bypassing the family
picker entirely.
**Why it happens:** These two chokepoints exist for a pre-existing reason
(the D-09/21-09 multi-library override picker already had this same
dual-chokepoint problem and solved it in both places) — it's a known
shape in this codebase, not a bug, but easy to solve only half of.
**How to avoid:** Grep for `runner === 'steam'` AND `installSteamGame` AND
`window.api.install(` before considering Req 3 done; there should be
exactly two call sites gated by the new family-picker check, matching the
count of pre-existing Steam-bypass branches.
**Warning signs:** Installing via the library grid context menu skips the
family picker while installing via the game page shows it (or vice versa).

## Code Examples

### Reading a family entry from the reshaped store (D-04)
```typescript
// Source: pattern derived from src/backend/storeManagers/steam/electronStores.ts
// + common/types/steam.ts (existing) + D-04
const families = steamBottleConfigStore.get_nodefault('families') ?? {}
const family = families[bottleName] // SteamFamily | undefined
```

### Resolver shape (D-05)
```typescript
// Source: derived from steam/bottle.ts's existing isBottleReady(bottleName?)
// (already family-ready) + steamBottleConfigStore assignments (D-04)
export function resolveFamilyForApp(
  appId: string
): { status: 'ok'; bottleName: string } | { status: 'needs-provision'; bottleName: string } {
  const assignments = steamBottleConfigStore.get_nodefault('assignments') ?? {}
  const migratedBottle = /* the D-07 migration's recorded migrated family name */
  const lastUsedFamily = steamBottleConfigStore.get_nodefault('lastUsedFamily')
  const bottleName = assignments[appId] ?? lastUsedFamily ?? migratedBottle
  return isBottleReady(bottleName)
    ? { status: 'ok', bottleName }
    : { status: 'needs-provision', bottleName }
}
```

### Existing `sanitizeBottleName` reused for `displayName` validation (D-02)
```typescript
// Source: src/backend/storeManagers/steam/bottle.ts:156-169 (existing, Phase 17,
// T-17-01) — reused verbatim for displayName input validation, not re-implemented
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Single `steamBottleConfigStore` flat record (`bottleName`, `wineVersion`, `wineCrossoverBottle`, `provisioned`) | `families: Record<bottleName, SteamFamily>` + `assignments: Record<appId, bottleName>` | This phase (D-04) | Every reader (`bottle.ts`, `games.ts`, `library.ts`, `main.ts` IPC) must switch from flat-key reads to keyed-record reads |
| `steamBottleStatus`/`steamBottleProvision`/`isSteamBottleProvisioned` IPC trio | Folded into `listFamilies`/`familyStatusForApp`/`createFamily` family IPC group | This phase (D-12) | Frontend `SteamBottleSetup.tsx` polling and `steamBottleStatus` consumers must be repointed |
| Implicit single-bottle routing in `games.ts` (`isBottleEligible()` → `isBottleReady()` → dispatch) | Explicit `resolveFamilyForApp(appId)` first, branch on result | This phase (D-05) | `tellBottledSteamTo*` and `getSteamBottleSettings` signatures gain a `bottleName` parameter |

**Deprecated/outdated:**
- The flat `SteamBottleConfig` shape (`bottleName`, `wineCrossoverBottle`,
  `wineVersion`, `provisioned` as top-level keys) — replaced by the
  `families`/`assignments` shape. The migration (D-07) is the only code
  that should ever read the OLD flat keys, and only once at startup.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The frontend can reuse the already-exposed `GameInfo.is_mac_native`/`mac_arch`/`steamPlatformsCaptured` fields to build a client-side mirror of `isBottleEligible()`, OR the planner instead folds an `eligible` flag into the new family-status IPC response — this research does not mandate one over the other (see Pitfall 6 / Open Question 1). | Common Pitfalls → Pitfall 6; Code Examples | If the planner picks the mirror-predicate approach without noticing the codebase's own explicit anti-pattern comment, a future contributor could reintroduce drift between frontend/backend eligibility logic — low risk (both are pure/cheap to keep in sync), but worth an explicit decision record. |
| A2 | `resolveFamilyForApp`'s exact fallback chain (`assignments[appId] ?? lastUsedFamily ?? migratedBottle`) matches D-03's "soft/remembered default" wording, but the precise persistence of `lastUsedFamily` (store key vs. derived) is explicitly left to Claude's Discretion in CONTEXT.md — this research assumes it is a new top-level store key for simplicity. | Code Examples → Resolver shape | Low risk — CONTEXT.md already marks this as discretionary; any reasonable implementation satisfies Req 3's acceptance criteria. |

**If this table is empty:** N/A — see above; both entries are low-risk
implementation-detail assumptions, not disputed facts. Every locked
decision (D-01 through D-12) is verified directly against the existing
codebase in this research and requires no further confirmation.

## Open Questions

1. **How does the frontend decide "this game is bottle-eligible" before
   opening the family picker?**
   - What we know: `GameInfo` already exposes `is_mac_native`, `mac_arch`,
     `steamPlatformsCaptured` — enough to mechanically replicate the
     backend's `isBottleEligible()` predicate client-side. The codebase
     has an explicit prior comment discouraging exactly this
     ("D-11-safe eligibility... lives entirely in the backend... never by
     a frontend eligibility check").
   - What's unclear: Whether the planner should (a) accept a client-side
     mirror predicate (fast, no new IPC, but reintroduces a discouraged
     pattern) or (b) add an `eligible` flag to the family-status IPC
     response (no duplicated logic, one more round-trip already implied by
     D-12's `familyStatusForApp`).
   - Recommendation: (b) — fold eligibility into the same
     `familyStatusForApp`/`listFamilies` response the picker already needs
     to call to know which families exist and which is pre-selected. This
     keeps `isBottleEligible()` a single backend source of truth.

2. **Exact persistence of `lastUsedFamily` (D-03's soft default).**
   - What we know: CONTEXT.md explicitly marks this as Claude's Discretion
     ("Whether `lastUsedFamily` is persisted in the store or derived").
   - What's unclear: Store key vs. derived-from-`assignments`-recency.
   - Recommendation: A simple new top-level `steamBottleConfigStore` key
     (`lastUsedFamily?: string`), written whenever a family picker
     selection is confirmed — simplest, matches the store's existing
     flat-key style for singleton values.

## Environment Availability

CrossOver (`/Applications/CrossOver.app/.../cxbottle`) is an existing,
already-validated dependency from Phase 17 — this phase adds no new
external dependency, only new invocations of the same `cxbottle`
create/delete lifecycle against additional bottle names. No new
environment probing is needed beyond what Phase 17 already established
(CrossOver installed at the fixed `CXBOTTLE_BIN` path, `win10_64` template
support). If CrossOver is absent, Phase 17's existing behavior already
governs (guided setup fails with a logged error) — this phase does not
change that failure mode, it only multiplies how many times it can occur
(once per family).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (`ts-jest`) |
| Config file | `jest.config.js` (backend suite has no jsdom — pure-function/store-mock testing only, per existing `steamBottleDefaults.ts` docstring) |
| Quick run command | `npx jest src/backend/storeManagers/steam/__tests__/families.test.ts` (or `bottle.test.ts`/`games.test.ts`/`library.test.ts` as touched) |
| Full suite command | `npm test` (`jest`) / CI: `npm run test:ci` (`jest --runInBand --silent`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| Req 1 (multi-family data model) | `families`/`assignments` collection round-trips; resolver returns correct bottle for each of 2 families | unit | `npx jest families.test.ts -t "resolveFamilyForApp"` | ❌ Wave 0 — new `families.test.ts` |
| Req 2 (zero-loss migration) | D-07 migration preserves `wineVersion`/`provisioned`, backfills `assignments` from ACF (D-08), sets `schemaVersion` | unit | `npx jest families.test.ts -t "migration"` (or a dedicated `migration.test.ts`) | ❌ Wave 0 |
| Req 3 (install-time picker) | `SteamFamilyPicker` renders only when eligible+picker data present; "New family…" triggers inline create + guided setup | unit (store logic) + manual (dialog render, no jsdom) | `npx jest SteamFamilyPicker.test.ts` for store logic; visual/dialog behavior is manual-only (project has no jsdom frontend test harness) | ❌ Wave 0 — new store test; component itself is manual-only per existing project convention (see `SteamInstallLocation.ts`'s lack of a `.tsx` test) |
| Req 4 (family lifecycle mgmt) | `createFamily`/`renameFamily`/`deleteFamily`/`setFamilyWine` persist correctly and survive a store re-read | unit | `npx jest families.test.ts -t "createFamily\|renameFamily\|deleteFamily\|setFamilyWine"` | ❌ Wave 0 |
| Req 5 (guarded delete) | Deleting last family is blocked; deleting a family clears assignments + marks games uninstalled | unit | `npx jest families.test.ts -t "deleteFamily"` | ❌ Wave 0 |
| Req 6 (per-family guided setup/login) | `provisionBottle({bottleName})` still enforces the CR-01 shared-bottle guard for a NEW family name | unit | `npx jest bottle.test.ts -t "CR-01"` | ✅ existing test extended |
| Req 7 (not-ready/deleted routing) | `resolveFamilyForApp` returns `needs-provision` for an unprovisioned family; a deleted family's game resolves to unassigned (re-pick) | unit | `npx jest games.test.ts -t "isBottleEligible\|resolveFamilyForApp"` | ❌ Wave 0 extension of existing `games.test.ts` |
| Req 8 (cross-family reconciliation) | `buildBottleInstalledMap` scans 2+ families' steamapps roots and tags `bottleName` per hit | unit | `npx jest library.test.ts -t "buildBottleInstalledMap"` | ❌ Wave 0 extension of existing `library.test.ts` |
| Req 9 (naming/count rules) | Auto-name uniqueness, `sanitizeBottleName` rejection cases, unbounded count | unit | `npx jest families.test.ts -t "slug\|sanitize\|unique"` | ❌ Wave 0 (reuses existing `sanitizeBottleName` tests in `bottle.test.ts` as a base) |

### Sampling Rate
- **Per task commit:** the specific `__tests__/*.test.ts` file(s) touched by that task (e.g. `npx jest families.test.ts`)
- **Per wave merge:** `npx jest src/backend/storeManagers/steam` (full steam backend suite)
- **Phase gate:** `npm test` (full suite) green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/backend/storeManagers/steam/__tests__/families.test.ts` — new file covering Req 1, 4, 5, 9 (family CRUD, resolver, naming rules)
- [ ] Migration test coverage (either inside `families.test.ts` or a dedicated `migration.test.ts`) — covers Req 2/D-07/D-08
- [ ] `bottle.test.ts` extension — `getSteamBottleSettings(bottleName)` and `dispatchToBottledSteam(verb, appId, bottleName)` signature-change coverage
- [ ] `games.test.ts` extension — resolver-first branching in `install()`/`launch()`/`uninstall()`/`getSettings()`
- [ ] `library.test.ts` extension — multi-family `buildBottleInstalledMap`/`readAcfState` coverage
- [ ] No new test framework or config needed — existing Jest setup and `__mocks__/electron-store.ts` in-memory mock cover this phase's needs

## Sources

### Primary (HIGH confidence — direct codebase inspection via graphify + Read, this session)
- `src/backend/storeManagers/steam/bottle.ts` — full file read; confirmed which functions accept `bottleName` today vs. which read the flat stored value
- `src/backend/storeManagers/steam/electronStores.ts` — confirmed `steamBottleConfigStore` shares `cwd: 'steam_store'` with other Steam stores; confirmed `SteamBottleConfig` is the sole type driving `StoreStructure['steamBottleConfigStore']`
- `src/common/types/steam.ts` — confirmed current flat `SteamBottleConfig` shape and the WR-02 removed-`loggedIn` history
- `src/common/types/electron_store.ts` — confirmed `TypeCheckedStoreBackend.get/set/get_nodefault` operate on top-level typed keys; no dot-path nested-key API needed for the D-04 reshape
- `src/backend/electron_store.ts` — confirmed the underlying `electron-store` wrapper's get/set semantics
- `src/backend/storeManagers/steam/games.ts` (lines 290-410, 550-650, 800-1020) — confirmed the 4 `isBottleEligible()` call sites and their exact current single-bottle dispatch shape
- `src/backend/storeManagers/steam/library.ts` (lines 40-140, 400-700, 900-1030) — confirmed `getBottleSteamappsRoot()`, `buildBottleInstalledMap()`, `buildInstalledMap()` (native multi-root precedent), `refresh()`/`refreshInstallState()`, and the poller's `AcfSource`/`readAcfState` shape
- `src/backend/main.ts` (lines 920-960) — confirmed the exact `steamBottleProvision`/`isSteamBottleProvisioned`/`steamBottleStatus` IPC handlers to fold per D-12
- `src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx` + `src/frontend/state/SteamInstallLocation.ts` — the exact pattern to clone for Surface 1, per D-10
- `src/frontend/state/InstallGameModal.ts` + `src/frontend/screens/Game/GamePage/index.tsx` (lines 140-200, 640-690) — confirmed BOTH install chokepoints and the existing `settingUpBottle`/`isSteamBottleSetupActiveFor` gating pattern
- `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` + `src/frontend/state/SteamBottleSetup.ts` + `steamBottleDefaults.ts` — confirmed the guided-setup flow is hardcoded to `DEFAULT_STEAM_BOTTLE_NAME` today and the explicit "never a frontend eligibility check" comment
- `src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx`, `DefaultSteamPath.tsx`, `CrossoverBottle.tsx`, `WineVersionSelector.tsx` — confirmed the Settings component conventions (isDefault gating, useSetting hook, SelectField/MenuItem icon pattern)
- `src/frontend/components/UI/TwoColTableInput/index.tsx` — confirmed the row/edit/remove icon-button pattern to clone for Surface 2
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` — confirmed existing Jest/describe-test conventions and current test coverage of `sanitizeBottleName`, `isBottleReady`, `provisionBottle`'s CR-01 guard
- `.planning/phases/22-multiple-steam-bottles/22-CONTEXT.md`, `22-SPEC.md`, `22-UI-SPEC.md` — the authoritative locked scope for this phase
- `.planning/ROADMAP.md` § Phase 22 — goal/dependency framing
- `package.json` — confirmed Jest 29.7.0/ts-jest test stack, no new dependencies needed

### Secondary / Tertiary
- None — this phase required no external web research; it is a pure internal-codebase generalization with zero new third-party dependencies or unfamiliar APIs. All findings are HIGH confidence, sourced directly from the current repository state.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every reused pattern verified by direct file read
- Architecture: HIGH — every locked decision (D-01..D-12) cross-checked against the actual current code shape, not just CONTEXT.md's description of it
- Pitfalls: HIGH — all 7 pitfalls derived from specific line-numbered code inspection this session, not speculation

**Research date:** 2026-07-17
**Valid until:** 30 days (internal refactor of a stable, already-shipped Phase 17 foundation; no external API/library drift risk)
