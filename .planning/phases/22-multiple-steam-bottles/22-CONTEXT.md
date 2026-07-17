# Phase 22: Steam Game Families (multiple bottle configurations) - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

On **macOS**, break the single-bottle assumption end-to-end: support **N** CrossOver
"family" bottles (each its own Windows Steam client, one-time login, and Wine/CrossOver
version) plus a persistent **game→family assignment map**. The existing Phase 17
`GameLibSteam` bottle migrates losslessly to become the pre-selected **"Default"** family.
Games only leave Default when they need a different configuration.

macOS-only (behind the existing `isMac` gate), CrossOver-only. This is the **pragmatic
fallback** to the user's preferred native-Steam-bridge architecture (seeded out, hard
dependency). Reuses the Phase 17 `steam/bottle.ts` primitives — which already accept a
`bottleName` argument — rather than adding a parallel mechanism.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**9 requirements are locked.** See `22-SPEC.md` for full requirements, boundaries, and
acceptance criteria.

Downstream agents MUST read `22-SPEC.md` before planning or implementing. Requirements are
not duplicated here.

**In scope (from SPEC.md):**
- N CrossOver bottles ("families") plus a persistent game→family assignment map
- "Default" family = the migrated existing Phase 17 bottle (zero-loss)
- Install-time family picker (pre-selected Default, with "New family…") for bottle-eligible macOS games
- Family management UI in Settings: create, rename, set per-family Wine/CrossOver version, delete
- Per-family guided setup + one-time Steam login
- Per-family ACF poller / install-state reconciliation across all families
- Routing (install/launch/uninstall/getSettings) resolves the per-game family bottle

**Out of scope (from SPEC.md):**
- The native-Steam bridge / Proton-style architecture (seeded, gated on a hard dependency)
- GPTK / `toolkit` / plain Wine as a Steam engine — families are CrossOver-only
- Moving an installed game between families in-app (reinstall to move)
- Concurrent play across families on ONE Steam account (Steam allows one active session/account)
- Sharing a single Steam login/auth across families (prefix isolation + D-04)
- Sharing already-downloaded game files across families (each re-downloads)
- Non-macOS: Linux and Windows Steam paths stay on native `steam://`, unchanged

</spec_lock>

<decisions>
## Implementation Decisions

These are the **HOW** decisions from this discussion. They sit on top of the locked WHAT
in `22-SPEC.md`.

### Family identity & naming model
- **D-01: Decoupled id + display name.** A family is
  `SteamFamily = { bottleName, displayName, wineVersion?, provisioned }` where `bottleName`
  is a **stable CrossOver bottle directory id** (immutable once created, sanitized, used for
  ALL paths / `cxbottle` ops) and `displayName` is an **editable label**. Rename only ever
  touches `displayName` — never moves the bottle directory, never risks `cxbottle.conf`,
  running processes, or installed-game paths. This is what makes the migrated `GameLibSteam`
  bottle able to *display* as "Default" and be renamed safely (Req 4/9, zero-loss Req 2).
  Rejected: "name IS the directory" (rename = risky dir move/recreate; conflicts with
  zero-loss migration).
- **D-02: `displayName` carries the Req 9 rules; `bottleName` is derived then frozen.**
  `sanitizeBottleName` + uniqueness are enforced on the editable `displayName` (the field
  the user types/sees — matches Req 9 wording). The stable `bottleName` dir id is
  auto-derived at creation via `slug(displayName)` + collision-suffix (e.g. `'Retro Games'`
  → dir `Retro-Games`, `-2` on collision), then **frozen**. A new family's auto
  `displayName` = `'Family N'` (next free integer), editable, no required typing (Req 9).
- **D-03: "Default" is an ordinary family, just remembered.** `'Default'` is only a
  `displayName` on the migrated `GameLibSteam` bottle. It is renameable and deletable like
  any other family (subject to the last-family guard, Req 5). **Nothing hardcodes the string
  `'Default'`.** The install picker's "pre-selected default" is a **soft/remembered** default:
  `lastUsedFamily ?? migratedFamily`. Rejected: a protected `isDefault` sentinel (less
  flexible; privileges one family forever).

### State/store shape
- **D-04: Reshape `steamBottleConfigStore` in place (one store).** Same store
  (`steamBottleConfigStore`, `cwd: steam_store`), reshaped to hold
  `families: Record<bottleName, SteamFamily>` + `assignments: Record<appId, bottleName>`,
  replacing the old flat `bottleName`/`wineVersion`/`provisioned` keys. One store → one
  migration point → one source of truth. `bottle.ts` helpers read `families[bottleName]`
  instead of top-level keys. Rejected: separate families store + assignments store (two
  files to keep consistent, two migration touch-points).

### Routing resolution
- **D-05: Central resolver, threaded bottleName (Option A).** A single
  `resolveFamilyForApp(appId)` returns a discriminated result
  `{ status: 'ok' | 'needs-provision', bottleName }`. `games.ts` install/launch/uninstall
  call it **first**, branch on `needs-provision` (route to guided setup for **that family's**
  bottle — Req 7), then pass the resolved `bottleName` into `tell*(appId, bottleName)` and
  the poller. `steam/bottle.ts` stays a **pure primitive** (no hidden store reads), using the
  `bottleName` seam Phase 17 already built. The cost is touching the `tell*(appId)` call
  signatures to also take `bottleName` — a handful of mechanical call sites in `games.ts`.
  Rejected: encapsulated resolution inside `tell*` (hides the store dependency; forces Req 7
  branching to be re-derived for the UI).
  - **Note:** a `needs-repick` status was considered and **dropped** — see D-08. Deleted-family
    games become uninstalled+unassigned and re-pick via the normal install picker, so the
    resolver only needs `ok | needs-provision`.
- **D-06: Cross-family poller (Req 8).** Install-state reconciliation and the ACF poller
  iterate **all** families' steamapps dirs (`getBottleSteamappsDir(bottleName)` per family),
  so a game installed in any family shows installed.

### Migration & default resolution
- **D-07: Eager one-time versioned migration at startup.** On app start, if the store has no
  `schemaVersion`, build `families['GameLibSteam']` from the old flat values (preserving
  `wineVersion` + `provisioned`), set `displayName: 'Default'`, clear the old flat keys, and
  stamp a schema version. Runs once; every reader afterward sees only the new shape — no
  per-call fallback branching. Rejected: lazy migrate-on-read (spreads shape-checks across
  accessors; racey write-backs; harder to reason about "is it migrated yet").
- **D-08: Backfill legacy installs; unassigned → migrated bottle.** During migration, scan
  the migrated `GameLibSteam` bottle's steamapps (ACF) and write an explicit
  `assignments[appId] = 'GameLibSteam'` for each already-installed game. Any still-unassigned
  appId (never installed) resolves to the migrated bottle name as a deterministic fallback.
  Every installed game ends up explicitly mapped → the poller/reconciliation has ground truth.
- **D-09: Delete semantics (Req 5/7).** `deleteFamily(bottleName)` removes the CrossOver
  bottle directory, and for each affected game clears its `assignment` **and** marks it
  **uninstalled** (its files are gone with the bottle anyway). The game returns to
  uninstalled+unassigned; clicking Install shows the standard Req 3 family picker — that **is**
  the "re-pick." No dangling-assignment state. Deleting the **last** remaining family is
  blocked (Req 5). Delete is confirm-gated, naming the affected games (Req 5).

### UI surfaces
- **D-10: Install picker clones the existing location-picker pattern.** Build
  `SteamFamilyPicker.tsx` + a `useSteamFamilyPicker` zustand store as a **sibling of the
  existing `SteamInstallLocationPicker.tsx` / `SteamInstallLocation.ts`** (same
  zustand-store + GamePage-modal pattern the native-library picker already uses). Lists
  families (pre-selected per the D-03 soft default) plus a "New family…" row. Choosing
  "New family" **creates it inline** (auto `displayName`), then kicks straight into that
  family's guided provision + login, then continues the install — one flow, no context
  switch. Native-macOS and all Linux/Windows Steam games show **no** picker (Req 3).
- **D-11: Family management lives in a new "Steam Families" Settings section.** A dedicated
  section within the existing Settings screen, alongside the current Steam components
  (`CrossoverBottle.tsx`, `EnableSteamNativeInstall.tsx`, `DefaultSteamPath.tsx`). Per-row
  rename / Wine-version / delete, plus "Create family." Create/provision **reuses the existing
  `SteamBottleSetup` guided flow, parameterized by `bottleName`.** Behind the `isMac` gate.
  Rejected: a dedicated top-level Families screen (new nav destination + more scaffolding;
  diverges from where Steam settings live).

### IPC surface
- **D-12: New cohesive family IPC set; fold in `steamBottleStatus`.** Add a family IPC group:
  `listFamilies()`, `createFamily(displayName) -> {bottleName}`,
  `renameFamily(bottleName, displayName)`, `deleteFamily(bottleName)`,
  `setFamilyWine(bottleName, wineVersion)`, `assignGameToFamily(appId, bottleName)`, and
  `familyStatusForApp(appId) -> 'ok' | 'needs-provision'` (backing the D-05 resolver for the
  UI). The old single-bottle `steamBottleStatus` (provisioned + bottleName) is **folded into**
  `listFamilies` / the per-app status so there is **one** family-aware source. Rejected:
  keeping `steamBottleStatus` alongside new handlers (two overlapping status sources that can
  drift — the same dead/duplicate-signal problem Phase 17 removed with the `loggedIn` field,
  see WR-02 in `common/types/steam.ts`).

### Claude's Discretion (researcher/planner may decide)
- Exact wave/plan breakdown (SPEC suggests 4 plans).
- `slug()` implementation details (which chars map to `-`, casing) — must produce a
  `sanitizeBottleName`-clean, collision-checked dir id.
- Confirm-dialog copy/enumeration for delete; how "affected games" are listed.
- How `familyStatusForApp` / the resolver surface `needs-provision` in each entry point
  (Install vs Play button state), consistent with the Phase 17 `settingUpBottle` gating in
  `GamePage/index.tsx`.
- Whether `lastUsedFamily` is persisted in the store or derived; where it's read for the
  picker pre-selection.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked scope & requirements
- `.planning/phases/22-multiple-steam-bottles/22-SPEC.md` — **the 9 locked requirements**,
  boundaries, constraints, acceptance criteria. MUST read before planning.
- `.planning/ROADMAP.md` § "Phase 22: Steam Game Families (multiple bottle configurations)"
  — goal, dependency on Phase 17/18, the pragmatic-fallback framing, CrossOver-only and
  one-time-login-per-family constraints.

### Prior-phase decisions this phase extends
- `.planning/phases/17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i/17-CONTEXT.md`
  — the single-bottle foundation (D-01 dedicated bottle, D-04 opaque bottled auth, D-09
  install driven through bottled Steam client, D-11 unknown-platform handling). Phase 17
  explicitly **deferred** "per-game Steam bottles"; families are the per-config middle ground.

### Backend code to modify / thread family identity through
- `src/backend/storeManagers/steam/electronStores.ts` — `steamBottleConfigStore` (reshape to
  `families` + `assignments`, D-04); `SteamBottleConfig` type export.
- `src/common/types/steam.ts` — `SteamBottleConfig` type (currently a flat single record;
  becomes `SteamFamily` + collection; note the WR-02 removed-`loggedIn` history, relevant to
  D-12).
- `src/backend/storeManagers/steam/bottle.ts` — the primitives that already **accept**
  `bottleName` (`getBottleDir`, `getBottleSteamappsDir`, `getBottleSteamExePath`,
  `isBottleProvisioned`, `isBottleReady`, `provisionBottle`, `sanitizeBottleName`,
  `tellBottledSteamTo{Install,Launch,Uninstall}`). D-05 threads real family identity in;
  `getSteamBottleSettings()` and `dispatchToBottledSteam` currently read the single stored
  `bottleName` and MUST take a resolved `bottleName` instead.
- `src/backend/storeManagers/steam/games.ts` — `install()`/`launch()`/`uninstall()`/
  `getSettings()` call `resolveFamilyForApp(appId)` first (D-05), branch on `needs-provision`.
- `src/backend/storeManagers/steam/library.ts` — `resolveBottleSteamappsDir()` / the ACF
  poller must iterate all families (D-06, Req 8).

### Frontend surfaces to build / reuse
- `src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx` +
  `src/frontend/state/SteamInstallLocation.ts` — **the pattern to clone** for the family
  picker (D-10).
- `src/frontend/state/InstallGameModal.ts` (`openInstallGameModal` / `startSteamInstall`,
  line ~60–83) and `src/frontend/screens/Game/GamePage/index.tsx` (`handleInstall`, the Steam
  bypass at ~672 + `settingUpBottle` gate at ~670) — the single install chokepoints where the
  family picker is injected (D-10, Req 3).
- `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` +
  `src/frontend/state/SteamBottleSetup.ts` + `steamBottleDefaults.ts` — the guided
  provision+login flow to **parameterize by `bottleName`** (D-11) and reuse for "New family"
  (D-10).
- `src/frontend/screens/Settings/components/` — `CrossoverBottle.tsx`,
  `EnableSteamNativeInstall.tsx`, `DefaultSteamPath.tsx`, `SteamRuntime.tsx` — neighbors and
  pattern for the new "Steam Families" Settings section (D-11).

### Constraint / bug context
- `.planning/seeds/macos-steam-native-bridge-lsteamclient.md` — the deferred preferred
  architecture (out of scope; this phase is the fallback).
- `.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md` — why families
  are CrossOver-only (GPTK/`toolkit` is not a working Steam engine).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`SteamInstallLocationPicker.tsx` + `SteamInstallLocation.ts`** — an existing GamePage
  modal picker (native-library targets) with the exact zustand-store + open/confirm shape the
  install-time family picker needs (D-10).
- **`SteamBottleSetup.tsx` + `SteamBottleSetup.ts` + `steamBottleDefaults.ts`** — the Phase 17
  guided provision+login flow; parameterize by `bottleName` to serve every family (D-10/D-11).
- **`steam/bottle.ts` primitives already accept `bottleName`** — the seam Phase 17 built on
  purpose; D-05 threads real family identity through it rather than adding a new mechanism.
- **`sanitizeBottleName` (T-17-01)** — reused for `displayName` validation (D-02, Req 9).
- **The ACF install poller** (`steam/library.ts` / `startInstallPolling`) — generalize to scan
  per-family steamapps roots (D-06).

### Established Patterns
- **`bottleName` defaulting** — every `bottle.ts` helper today does
  `bottleName ?? steamBottleConfigStore.get('bottleName') ?? DEFAULT_STEAM_BOTTLE_NAME`. After
  D-04/D-05 the fallback becomes the migrated bottle name; callers pass the resolved family
  bottle explicitly.
- **CR-01 (17-17) scope guard in `provisionBottle`** — refuses to provision Steam into the
  shared GOG/Epic `GameLib` bottle. Every new family's `bottleName` must still pass this guard.
- **Fire-and-forget dispatch; ACF owns real status (D-02/D-09 Phase 17)** — preserved
  per-family; never optimistically flip install state.
- **`isMac`-gated Steam behavior** — all family surfaces stay macOS-scoped; Linux/Windows
  Steam untouched.

### Integration Points
- **`resolveFamilyForApp(appId)`** (new) — the single chokepoint between "user acted on
  appId" and "which bottle." Consumed by `games.ts` routing, the poller, and `familyStatusForApp` IPC.
- **`openInstallGameModal` / `handleInstall`** — where the family picker intercepts install
  (Req 3), mirroring the existing Steam-install bypass.
- **Startup migration** (D-07) — one-time reshape of `steamBottleConfigStore`; must run before
  any family reader.

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose the **decoupled id + display name** model over "name is the directory"
  specifically to keep rename safe and honor zero-loss migration (D-01) — do not collapse the
  two names back together in planning.
- User chose **"Default" as an ordinary, remembered default** (not a protected sentinel) — the
  install-picker pre-selection is `lastUsedFamily ?? migratedFamily`, a soft default. This is a
  deliberate, slightly looser reading of SPEC's "pre-selected to Default" (D-03).
- User chose to **backfill legacy installs** during migration (extra ACF scan) rather than rely
  on implicit fallback, so the assignment map is a complete picture (D-08).
- User chose **one family-aware IPC/status source**, explicitly to avoid the drift/dead-signal
  problem Phase 17 hit with `loggedIn` (D-12).

</specifics>

<deferred>
## Deferred Ideas

- **Moving an installed game between families in-app** — out of scope per SPEC (reinstall to
  move; prefix isolation makes it a re-download anyway).
- **Concurrent play across families on one Steam account** — not solvable here (Steam allows
  one active session per account; needs distinct accounts).
- **Sharing a single Steam login / downloaded files across families** — out of scope (prefix
  isolation + D-04 opaque auth).
- **The native-Steam bridge (Proton-style, one native client + cheap per-game prefixes)** — the
  user's preferred long-term architecture; gated on a hard dependency (no macOS `lsteamclient`).
  Seeded as `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`; if it ever ships it
  likely supersedes much of this phase.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 22-multiple-steam-bottles*
*Context gathered: 2026-07-17*
