# Phase 70: Split GameInfo into shared and per-store shapes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 70-split-gameinfo-into-shared-and-per-store-shapes
**Areas discussed:** Union vs storeData, What counts as shared, IPC tightening scope, Order and ratchet

---

## Union vs storeData

| Option | Description | Selected |
|--------|-------------|----------|
| Flat union | Persisted JSON/IPC unchanged, no cache migration; TS blocks store reads until narrowed | ✓ |
| Nested storeData | Greppable `storeData.steam.x`; migration on 5 caches + renderer mirror + IPC shape change | |
| Union now, nest later | Union, with nesting as a deferred option | |

| Option (narrowing) | Description | Selected |
|--------|-------------|----------|
| Guard + accessor | `isStoreGame` type guard + `asStoreGame` returning member or undefined | ✓ |
| Guard only | Just the type guard | |
| You decide | Planner picks | |

| Option (naming) | Description | Selected |
|--------|-------------|----------|
| GameInfo = the union | GameInfoCore is the base; importers keep compiling until they read a store field | ✓ |
| GameInfo = the core | Union gets a new name; big-bang compile break | |

| Option (sideload) | Description | Selected |
|--------|-------------|----------|
| Own union member | SideloadGameInfo carries its browser fields | ✓ |
| Core-only member | Browser fields move to core | |

**User's choice:** all recommended options.

---

## What counts as shared

| Option | Description | Selected |
|--------|-------------|----------|
| Concept shared | Core holds concepts meaningful for every store even if one fills it today | ✓ |
| Populated by 2+ stores | Mechanical rule based on who sets it today | |

| Option (metacritic) | Description | Selected |
|--------|-------------|----------|
| Core | Shared concept with sources for every store | ✓ |
| Steam member | Explicit Steam-only backend source | |

**Notes:** The first round recommended the Steam member. The operator stopped to ask whether
there's an API or other source for Metacritic, and whether core would make more sense if other
stores were covered. Findings: there's no official Metacritic API (only unofficial RapidAPI
scrapers). Steam `appdetails` and PCGamingWiki (already used for non-Steam games through the
renderer wiki map) cover every store. OpenCritic and IGDB are different scores. The
recommendation was revised to core and the operator picked it.

| Option (nested) | Description | Selected |
|--------|-------------|----------|
| Yes, no persisted move | Per-store nested types narrow ExtraInfo/InstalledInfo in place | ✓ |
| Top level only | Nested stays shared; later todo | |

| Option (3rd-party flags) | Description | Selected |
|--------|-------------|----------|
| Planner decides by evidence | Apply the concept-shared rule per flag | ✓ |
| Keep all in core | Treat as one shared concept | |

---

## IPC tightening scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full per-runner schema | zod discriminatedUnion, strict core + strict members | ✓ |
| Core strict, members loose | Per-store keys pass through | |
| Core only, passthrough stays | Phase 67 debt remains | |

| Option (type source) | Description | Selected |
|--------|-------------|----------|
| Hand-written + parity test | Keeps load-bearing JSDoc; bidirectional compile-time test | ✓ |
| Inferred from zod | Single source, JSDoc moves to `.describe()` | |

| Option (settings passthrough) | Description | Selected |
|--------|-------------|----------|
| Out of scope, todo | Rename marker, file todo | |
| Tighten it here too | Close all four Phase 67 passthroughs | ✓ |

**Notes:** The operator chose to widen scope to the settings passthrough rather than take the recommendation.

| Option (unknown keys) | Description | Selected |
|--------|-------------|----------|
| Strip at load, reject at IPC | Phase 68 migration cleans caches; IPC strict | ✓ |
| Strip silently at IPC | zod `.strip()` | |
| Reject at IPC only | Old caches could break Install | |

---

## Order and ratchet

| Option (order) | Description | Selected |
|--------|-------------|----------|
| Plan now, execute after 69 UAT | Keeps regressions attributable | ✓ |
| Start now in parallel | Faster, harder attribution | |

| Option (ratchet) | Description | Selected |
|--------|-------------|----------|
| Files narrowing outside stores | Greppable file count, ends at an allowlist | ✓ |
| Per-field read sites | Needs a TS-aware counter | |

| Option (live checks) | Description | Selected |
|--------|-------------|----------|
| Two gates | After migration+IPC wave, and at the end | |
| Every wave | Phase 69 pattern | |
| Final gate only | One live check at the end | ✓ |

**Notes:** The operator chose a final gate only over the recommended two gates. CONTEXT D-16 folds the
upgraded-profile cache check into that final gate.

| Option (type homes) | Description | Selected |
|--------|-------------|----------|
| Existing common/types/<store>.ts | Frontend-importable | ✓ |
| Next to the store manager | Breaks renderer imports | |

---

## Claude's Discretion

- Classification of the third-party launcher flags, and the final per-field table
- The internals of the narrowing module and parity test; how waves are cut

## Deferred Ideas

- Backend hydration of PCGamingWiki Metacritic scores onto `GameInfo` for non-Steam games
