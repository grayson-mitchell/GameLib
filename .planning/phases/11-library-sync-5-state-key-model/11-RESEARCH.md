# Phase 11: Library Sync + 5-State Key Model - Research

**Researched:** 2026-07-05
**Domain:** Undocumented-API library sync + local state-machine classification, on top of an already-validated Electron adapter (Phase 10)
**Confidence:** HIGH

## Summary

Phase 10 already proved the two load-bearing Humble endpoints work from the live app
(`GET /api/v1/user/order` → gamekeys, `GET /api/v1/order/{gamekey}` → order detail with
`tpkd_dict.all_tpks[].steam_app_id`), and left `src/backend/humble/adapter.ts` as a typed,
C5-isolated transport returning `AdapterResult<T>` (`ok` / `session_expired` /
`access_denied` / `schema_error`). Phase 11 does not touch the adapter's transport — it
builds the orchestration layer on top: fetch gamekeys, fan out to order details under a
small concurrency bound, classify each `tpkd_dict.all_tpks[]` entry into one of five states,
persist the result, and render it on a new read-only "Humble Keys" page. No new npm
packages are required — axios, zod, and electron-store are already installed and were
verified live in Phase 10.

The single most important architectural correction this research makes to the prior
`ARCHITECTURE.md` document: that document recommends embedding the local `REVEALED` flag
**inside** the same cache record that holds the synced key data. Phase 10's D-04 and this
phase's D-30 require the opposite — the library cache **wipes on disconnect** but the
REVEALED flag (and the future audit log) **must survive disconnect**. These cannot be the
same store. Phase 11 must create the REVEALED-flag store as a **separate** electron-store
instance from the library cache, and explicitly wire disconnect to clear the cache/sync
stores while never touching the REVEALED-flag store.

The second major design question — classification precedence — is fully specified by
CONTEXT.md D-30: expiration (→ `UNREDEEMABLE`) beats everything, `redeemed_key_value`
presence (→ `REDEEMED`) beats the local flag, the local flag (→ `REVEALED`) beats the
default, and the default is `UNREVEALED` (or the `UNPICKED` pseudo-entry case, which is
structurally different — no tpk exists yet). This hierarchy must be implemented exactly as
specified, in a single pure `classify()` function, so it is unit-testable independent of
the network.

The one open technical risk this research could NOT resolve from existing artifacts: **no
prior validation confirms the API shape for an un-picked Humble Choice month.** Phase 10's
live gate only exercised a real account's existing (already-picked) orders. Whether
un-picked months appear via the same `/api/v1/user/order` + `/api/v1/order/{gamekey}` pair,
via a distinct endpoint, or not at all until picked, is unverified. See Open Questions.

**Primary recommendation:** Build `src/backend/humble/library.ts` (sync orchestration +
concurrency-bounded fetch + fail-soft handling) and `src/backend/humble/classify.ts` (pure,
unit-testable 5-state classification function) as new modules behind the existing
`adapter.ts`, add two new electron-store instances (`humbleLibraryStore` for the wipeable
cache, `humbleRevealedStore` for the disconnect-surviving flag), and a minimal read-only
`HumbleKeys` screen that mirrors the Steam library's cache-then-sync pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch gamekeys + order details from Humble | Backend (Electron main, `adapter.ts`) | — | C5 wall; only place that knows Humble URLs (already built, Phase 10) |
| Concurrency-bounded fan-out sync orchestration | Backend (`library.ts`, new) | — | Must own retry/abort/backoff decisions; not a UI concern |
| 5-state classification (incl. REVEALED precedence) | Backend (`classify.ts`, new, pure function) | — | Must be identical on every sync/restart; testable without network |
| Library cache (wipes on disconnect) | Storage (electron-store, new `humbleLibraryStore`) | — | Persisted so restart/sync-failure can serve stale data |
| REVEALED-flag store (survives disconnect) | Storage (electron-store, new `humbleRevealedStore`) | — | Must outlive the library cache per D-04/D-30 — separate file, not a field |
| Sync-state / last-synced timestamp | Storage (electron-store, new) | Backend | Read by both the fail-soft banner and the "last synced" indicator |
| IPC surface (`humble:*` sync/keys channels) | Backend (`ipc_handler.ts`, extended) | Browser/Client (preload) | Typed boundary; renderer never gets raw axios/adapter results |
| Keys list page (read-only, state-grouped) | Browser/Client (React renderer) | — | New screen; consumes `humble` context slice, no backend logic |
| Sidebar nav entry, conditional visibility | Browser/Client (React renderer) | — | Pure presentation, gated on `humble.isLoggedIn` |
| Fail-soft banner + freshness indicator | Browser/Client (React renderer) | Backend (supplies `syncError`/`lastSynced`) | UI state derived from backend-pushed context fields |
| Startup sync trigger | Backend (main process, piggybacks D-08 health check) | Browser/Client (fires `handleHumbleAuthState`-adjacent call) | Must run after health check confirms a non-expired session |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

> Numbering continues from Phase 10 (D-01..D-18) to keep v1.2 decision IDs unambiguous.

#### Phase 11 surface (where synced keys appear)
- **D-19:** Phase 11 ships a **minimal keys list page** — title, state badge, expiration
  date per row. This is the visible proof of classification (success criterion 1) and the
  home of the fail-soft indicator. Phase 13 restyles/extends this same page into the real
  Keys-Waiting / Giftable-Spares views; it is evolution, not throwaway.
- **D-20:** The page mounts as a **sidebar entry** ("Humble Keys", alongside Stores),
  **visible only when a Humble account is connected**. Phase 13's views become tabs/filters
  of this page — the nav slot is permanent, only the content evolves.
- **D-21:** Layout is a **flat list grouped by state** (UNPICKED / UNREVEALED / REVEALED /
  REDEEMED / UNREDEEMABLE), **expiring-soonest first within each group**; bundle/order
  origin is a secondary label on each row. Previews Phase 13's state-driven views.
- **D-22:** Rows are **strictly read-only** in Phase 11 — no reveal, no copy, no detail
  expand, no link-out. Zero risk of shipping claim-flow behavior before Phase 14's C1/C2
  guards exist.

#### Sync triggers & fetch strategy
- **D-23:** Sync runs at **app startup** (piggybacking the Phase 10 D-08 health check),
  **after a successful login/reconnect**, and via a **manual refresh button** on the keys
  page. **No background interval timer.**
- **D-24 (skip-terminal re-fetch):** Each sync re-fetches the gamekeys list plus order
  details for **every order that still contains a non-terminal key** (UNPICKED /
  UNREVEALED / REVEALED). Orders whose keys are ALL terminal (REDEEMED / UNREDEEMABLE) are
  **frozen in cache** and not re-fetched — a redeemed key cannot regress. This satisfies
  HSYNC-03's "reclassified on the next sync" exactly while old bundles stop costing
  requests. New gamekeys (never seen before) are always fetched.
- **D-25:** Order-detail fetching uses a **small concurrency pool (2–3)**; the **first
  403/429 aborts the entire sync** into the fail-soft path (serve cache + backoff). A
  Humble-side denial is never hammered — C5 discipline.
- **D-26:** First sync (and any long sync) uses **progressive fill**: keys appear in the
  list as each order detail resolves, with a "Syncing… N/M orders" indicator.
  Classification per order is independent, so partial display is safe.

#### Key model & classification
- **D-27:** An unpicked Humble Choice month is **one UNPICKED pseudo-entry per month**
  (e.g., "Humble Choice — March 2026 · games not picked"), with the month's pick deadline
  as its expiration, living in the same state-grouped list as real keys. Detection:
  `product.category == 'subscriptioncontent'` + `choice_url`, no key allocated.
- **D-28:** **All key platforms classify** (Steam, GOG, Epic, Ubisoft, Origin, …) into the
  5-state model with a platform label per row. Dedup (Phase 12) and claim flow (Phase 14)
  stay Steam-first, but the Phase 11 inventory is complete — "never lose a key" applies to
  every platform.
- **D-29:** **DRM-free download entitlements are excluded** from the inventory entirely —
  it is strictly keys + unpicked Choice months. Managing Humble-hosted installers is
  locked out of v1.2 scope (PROJECT.md).
- **D-30 (write-ahead REVEALED flag, HSYNC-02):** Phase 11 builds the locally-persisted
  REVEALED flag store and honors it during classification (a key with the local flag and
  no `redeemed_key_value` classifies REVEALED, never regressing to UNREVEALED across
  re-sync/restart). The flag is *written* by Phase 14's reveal flow; Phase 11 only needs
  the store + classification precedence: `redeemed_key_value` present ⇒ REDEEMED beats
  local flag; expiration ⇒ UNREDEEMABLE beats both. Per Phase 10 D-04, this store (and the
  future audit log) **survives disconnect** — everything else wipes.

#### Fail-soft & staleness (HSYNC-04)
- **D-31:** Non-auth sync failure (network, timeout, 403 backoff) shows a **persistent
  inline banner** at the top of the keys list: "Couldn't refresh — showing data from
  {last sync time}". It clears on the next successful sync. **No toast** — background
  failures aren't interruption-worthy. (Session-expiry keeps its separate Phase 10 D-09
  treatment: expired tile + one-time toast.)
- **D-32:** The keys page **always shows sync freshness** — a subtle "Last synced X ago"
  near the manual refresh button, healthy or not. The failure banner reuses the same
  timestamp. Mirrors the Steam library's stale-indicator precedent (Phase 2).
- **D-33:** **No auto-retry.** The next natural trigger (startup, login, manual refresh)
  is the retry. A **403 additionally starts a cooldown that gates even the manual refresh
  button** ("temporarily unavailable — retry in Nm") so a denial is never hammered.
- **D-34:** Mid-sync aborts keep **per-order partial results**: each order's refresh
  commits independently; fresh orders stay fresh, the rest keep prior cache, and the
  banner reads "couldn't finish refresh". Consistent with progressive fill — displayed
  data is never yanked back.

### Claude's Discretion
- Cache store shape/location (`electron-store` following `electronStores.ts` conventions),
  IPC channel names (`humble:*` per the research architecture), and the exact
  key-inventory TypeScript model.
- Tightening `OrderDetailSchema` in `adapter.ts` (currently permissive `.passthrough()`
  with `all_tpks: z.unknown()[]`) to the fields classification needs — keep
  `.passthrough()` resilience; never let one malformed order fail the whole sync
  (schema_error on one order ⇒ that order keeps its cached entry).
- 403-cooldown duration and manual-refresh debounce.
- Empty states (connected but zero keys; disconnected navigation guard), banner/indicator
  copy, i18n keys — note Phase 10 WR-08: i18n keys go in the **consumed** translation
  namespace.
- Sidebar icon/label and exact placement.
- Whether UNPICKED deadline data is reliably available from the API; if not, the
  pseudo-entry renders without an expiration rather than blocking the feature.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Reveal actions, gift links, detail
expansion, and link-outs on key rows were consciously excluded from the Phase 11 surface;
they arrive with Phases 13/14 as designed.)

</user_constraints>

## Phase Requirements

<phase_requirements>

| ID | Description | Research Support |
|----|-------------|------------------|
| HSYNC-01 | Connected user's Humble keys sync into GameLib, normalized into the 5-state model, cached locally with concurrency-bounded, cache-aggressive fetching | `library.ts` sync orchestration pattern (Data Flow section), concurrency-bound fetch pattern, `humbleLibraryStore` cache design, D-24/D-25 |
| HSYNC-02 | Every key classified into exactly one state, with the locally-tracked REVEALED flag written before the reveal API call (write-ahead) so it survives re-sync | `classify.ts` precedence algorithm, `humbleRevealedStore` separate-store design (survives disconnect per D-04/D-30), Pitfall 1/8 write-ahead discipline (store exists now, write happens in Phase 14) |
| HSYNC-03 | Expiration / UNREDEEMABLE status recomputed on every sync (Humble applies expirations retroactively) | Pitfall 7 (PITFALLS.md) — never cache expiration as a boolean; D-24 skip-terminal logic explicitly re-fetches every non-terminal order so expiration can be detected; classify() recomputes from the expiration field on every call |
| HSYNC-04 | If Humble refresh fails, launcher shows cached library with "couldn't refresh" indicator (fail-soft) | Fail-soft architecture pattern (mirrors `SteamLibraryManager.refresh()` cache fallback), D-31/D-32/D-33/D-34, Pitfall 3/5 |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Tech stack must remain Electron + React + TypeScript (no framework changes) — Phase 11 work is entirely within this stack.
- Steam auth approach note in CLAUDE.md is resolved/superseded by the "Technology Stack" section further down the same file (steam-session + steam-user) — not directly relevant to Phase 11 (Humble domain), but confirms the project's general pattern of adapter-isolated, session-cookie-based third-party integrations, which Humble's `adapter.ts` already follows.
- GSD workflow enforcement: file-changing work must go through a GSD command (`/gsd:plan-phase` → `/gsd:execute-phase`), not direct edits. This research is an input to that workflow, not a bypass of it.
- No project skills found under `.claude/skills/`, `.agents/skills/`, etc. — no additional conventions beyond what's in this file and the codebase itself.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | 1.13.5 (installed, confirmed live-working in Phase 10) | HTTP transport for `adapter.ts` calls (unchanged in Phase 11) | Already the project's Humble transport; Phase 10's live validation gate proved it reaches Humble from Electron main with the real session cookie — no reason to introduce a second transport |
| zod | 3.24.3 (installed) | Schema validation of Humble API responses | Already used in `adapter.ts`'s `GamekeysSchema`/`OrderDetailSchema`; Phase 11 extends (does not replace) these schemas with the fields classification needs (`redeemed_key_value`, `key_type`, `expiration`, `product.category`, `product.choice_url`) |
| electron-store (via `TypeCheckedStoreBackend` / `CacheStore`) | 8.2.0 (installed, per project stack decision) | Persist the library cache, REVEALED-flag store, and sync-state timestamp | Follows the exact pattern already used for `steamLibraryStore`/`steamMetadataStore`/`steamSyncStore` (`src/backend/storeManagers/steam/electronStores.ts`) and `humbleConfigStore` (`src/backend/humble/electronStores.ts`) |

**No new packages are required for this phase.** All three dependencies above are already installed, already imported in the Humble domain (or the sibling Steam domain), and were exercised end-to-end (axios + zod) by Phase 10's live validation gate.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | A small in-process concurrency pool (2–3 concurrent order-detail fetches, D-25) is simple enough (~15–20 lines, a counter + a promise queue) that it does not warrant a dependency. `p-limit`'s current major version is ESM-only, which is an awkward fit for this project's CJS-targeting Electron main bundle (`tsconfig.json` `module: esnext` is bundler-resolved, not a guarantee of native ESM at runtime in the Electron main process) — hand-rolling avoids that friction entirely. See "Don't Hand-Roll" below for why this is the one exception to that rule. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled concurrency semaphore | `p-limit` / `p-queue` npm packages | Both are well-maintained, but `p-limit` v4+ is ESM-only (requires dynamic `import()` from a CJS-oriented Electron main context) and `p-queue` pulls in more surface (priority queues, timeouts) than 2–3-way bounded fan-out needs. A ~20-line hand-rolled pool matches the existing project style (no new dependency review overhead) and is trivially unit-testable. |
| Embedding REVEALED flag inside the library cache record (as `ARCHITECTURE.md` originally proposed) | Separate `humbleRevealedStore` electron-store instance | The embedded approach was written before Phase 10's D-03/D-04 (disconnect wipes the library cache but the REVEALED flag survives) were locked. A single combined store cannot satisfy both "wipe on disconnect" and "survive disconnect" simultaneously — they must be two files. This supersedes that part of `ARCHITECTURE.md`. |

## Package Legitimacy Audit

No external packages are being installed in this phase — axios, zod, and electron-store are already present, already verified live (Phase 10), and Phase 11 introduces zero new npm dependencies. The Package Legitimacy Gate protocol (slopcheck / registry verification) is **not applicable** here. If the planner or an executing task later decides a concurrency-pool library is preferred over the hand-rolled approach recommended above, that package must go through the full gate before being added.

## Architecture Patterns

### System Architecture Diagram

```
Startup / Login-success / Manual refresh button (three triggers, D-23)
        │
        ▼
┌──────────────────────────────┐
│ Backend: library.ts (new)    │
│  sync()                       │
└──────────────┬───────────────┘
               │ 1. adapter.getGamekeys(cookie)
               ▼
      [ ok | session_expired | access_denied | schema_error ]
               │
        ok ────┴──── session_expired ──▶ leave to Phase 10's D-08/D-09 expiry flow (no sync attempted)
               │                          access_denied/schema_error ──▶ fail-soft: keep cache, set syncError, start cooldown (D-33)
               ▼
   Partition gamekeys into:
     - new (never cached)          → always fetch
     - non-terminal (has UNPICKED/UNREVEALED/REVEALED key) → always re-fetch (D-24)
     - all-terminal (all REDEEMED/UNREDEEMABLE)             → SKIP, frozen in cache
               │
               ▼
   Concurrency-bounded pool (2–3 in flight, D-25)
     for each gamekey to fetch:
        adapter.getOrderDetail(cookie, gamekey)
               │
        first 403/429 anywhere ──▶ abort remaining fetches, fail-soft (D-25/D-34)
               │ ok
               ▼
   classify.ts: normalizeOrder(rawOrder, revealedStore) → HumbleKey[]
     - read humbleRevealedStore for (gamekey,tpkIndex) flags
     - apply precedence: expiration → UNREDEEMABLE
                          else redeemed_key_value present → REDEEMED
                          else revealed flag set → REVEALED
                          else → UNREVEALED
     - product.category==='subscriptioncontent' + choice_url + no tpk → UNPICKED pseudo-entry
               │
               ▼
   Per-order commit (D-34): write this order's entry into humbleLibraryStore
   immediately (not batched at the end) — partial sync results are never lost
               │
               ▼
   humbleSyncStore.set('syncedAt', now)   (banner/"last synced" read this)
               │
               ▼
   sendFrontendMessage('humbleKeysUpdated', keys) + progress messages (D-26)
               │
               ▼
┌──────────────────────────────┐
│ Frontend: humble context slice│  →  HumbleKeys screen (flat list, grouped by
│ (ContextProvider)              │      state, expiring-soonest first, D-21)
└──────────────────────────────┘
               │
        syncError set? ──▶ persistent inline banner (D-31), no toast
        always ──▶ "Last synced X ago" indicator (D-32)
```

### Recommended Project Structure

```
src/backend/humble/
├── adapter.ts            # UNCHANGED transport (Phase 10) — schema tightened only (Claude's discretion)
├── user.ts                # extend disconnect() to also clear humbleLibraryStore + humbleSyncStore
│                           #   (NOT humbleRevealedStore — D-04/D-30 survival)
├── library.ts              # NEW — sync orchestration: gamekeys fetch, skip-terminal
│                           #   partition, concurrency pool, per-order commit, fail-soft
├── classify.ts              # NEW — pure classify(rawTpk, revealedFlag, now) => HumbleKeyState
│                           #   and classifyOrder(rawOrder, revealedStore) => HumbleKey[]
│                           #   (kept separate from library.ts so it is unit-testable with
│                           #   zero mocking of axios/electron-store)
├── electronStores.ts        # extend: add humbleLibraryStore, humbleRevealedStore, humbleSyncStore
├── ipc_handler.ts           # extend: register humble:sync, humble:getKeys, humble:getSyncState
└── constants.ts              # extend: cooldown duration, concurrency limit constant

src/common/types/humble.ts   # extend: HumbleKey, HumbleKeyState union, HumbleOrderCacheEntry,
                              #   HumbleSyncState — Phase 10 explicitly left these undefined
                              #   ("HumbleKey/HumbleOrder library types are Phase 11 scope")

src/frontend/screens/Humble/  # NEW (Phase 13 will restyle this into tabs, not rebuild it)
└── Keys/
    └── index.tsx             # D-19/D-21/D-22: flat read-only list, grouped by state,
                              #   expiring-soonest first, banner + freshness indicator

src/frontend/components/UI/Sidebar/components/SidebarLinks/
└── index.tsx                # extend: add "Humble Keys" item, gated on humble.isLoggedIn (D-20)
```

### Pattern 1: Cache-Then-Sync (mirrors Steam)

**What:** On startup, immediately load and render whatever is in `humbleLibraryStore`
before attempting any network call. The sync (triggered separately per D-23) then updates
the cache and pushes a fresh `humbleKeysUpdated` message — it never blocks the initial
render.

**When to use:** Every Humble Keys screen mount and every app startup.

**Example (the Steam precedent to mirror):**
```typescript
// Source: src/backend/storeManagers/steam/library.ts (existing code, read directly)
async init(): Promise<void> {
  const cached = steamLibraryStore.get('games', [])
  if (cached.length) {
    library.clear()
    cached.forEach((g) => {
      library.set(g.app_name, g)
      sendFrontendMessage('pushGameToLibrary', g)
    })
  }
  // ... background sync happens separately, never blocks the above
  if (SteamUser.isLoggedIn()) {
    runOnceWhenOnline(() => this.refresh())
  }
}
```
Phase 11's `library.ts` should expose an equivalent `loadCached()` (sync, no network) called
at startup/mount, and a separate `sync()` (async, network) called per D-23's three triggers.

### Pattern 2: Per-Order Isolation for Schema Drift and Partial Aborts

**What:** Classification and caching happen **per order**, not for the whole sync batch at
once. A `schema_error` on one order's detail response, or a mid-sync abort on 403, must
leave every other order's already-fetched, already-classified data intact and committed.

**When to use:** Inside the concurrency pool's per-task completion handler in `library.ts`.

**Example:**
```typescript
// Illustrative — matches the existing adapter.ts AdapterResult discriminated union
async function fetchAndCommitOrder(gamekey: string, cookie: string) {
  const result = await getOrderDetail(cookie, gamekey)
  if (result.status === 'ok') {
    const entry = classifyOrder(result.data, humbleRevealedStore)
    humbleLibraryStore.set(gamekey, entry) // committed immediately, not batched
    return { gamekey, outcome: 'ok' as const }
  }
  if (result.status === 'schema_error') {
    // Pitfall 5 / Claude's Discretion note: one malformed order never fails
    // the whole sync — the previously cached entry for this gamekey (if any)
    // is left untouched.
    logWarning(['Humble sync: order schema_error, keeping cached entry:', gamekey], LogPrefix.Backend)
    return { gamekey, outcome: 'schema_error' as const }
  }
  // access_denied / session_expired: bubble up to abort the whole sync (D-25)
  return { gamekey, outcome: result.status }
}
```

### Pattern 3: Small Hand-Rolled Concurrency Pool

**What:** Bound in-flight order-detail requests to 2–3 concurrent, matching D-25. No
external dependency (see Standard Stack / Alternatives Considered).

**When to use:** `library.ts`'s sync fan-out step.

**Example:**
```typescript
// Illustrative — a minimal bounded-concurrency runner. Aborts remaining work
// (does not await already-dispatched-but-unresolved tasks past the abort point)
// on the first access_denied signal, per D-25.
async function runBounded<T>(
  items: string[],
  limit: number,
  worker: (item: string) => Promise<{ outcome: string } & T>
): Promise<Array<{ outcome: string } & T>> {
  const results: Array<{ outcome: string } & T> = []
  let aborted = false
  let index = 0
  async function runNext(): Promise<void> {
    if (aborted) return
    const i = index++
    if (i >= items.length) return
    const result = await worker(items[i])
    results.push(result)
    if (result.outcome === 'access_denied') {
      aborted = true // stop dispatching new work; in-flight tasks still settle
      return
    }
    return runNext()
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext))
  return results
}
```

### Pattern 4: Classification Precedence (D-30) as a Pure Function

**What:** A single function, no I/O, that takes the raw tpk fields plus the locally-stored
REVEALED flag and returns exactly one state. Keeping it pure makes HSYNC-02/03's precedence
rules trivially unit-testable (see Validation Architecture below) without mocking axios or
electron-store.

**Example:**
```typescript
// Illustrative — precedence per D-30, literal order: expiration beats
// redeemed_key_value, redeemed_key_value beats the local flag, the flag
// beats the default.
type HumbleKeyState =
  | 'UNPICKED'
  | 'UNREVEALED'
  | 'REVEALED'
  | 'REDEEMED'
  | 'UNREDEEMABLE'

function classifyTpk(
  tpk: { redeemedKeyValuePresent: boolean; expiration: string | null },
  isLocallyRevealed: boolean,
  now: Date = new Date()
): HumbleKeyState {
  if (tpk.expiration && new Date(tpk.expiration) <= now) {
    return 'UNREDEEMABLE' // D-30: expiration beats BOTH other signals
  }
  if (tpk.redeemedKeyValuePresent) {
    return 'REDEEMED' // beats the local flag
  }
  if (isLocallyRevealed) {
    return 'REVEALED'
  }
  return 'UNREVEALED'
}
```
The `UNPICKED` case is structurally distinct — it applies to the order/product level (no
tpk exists yet), not to an individual tpk, and should be a separate branch in
`classifyOrder()` that runs before iterating `tpkd_dict.all_tpks[]`.

### Anti-Patterns to Avoid

- **Storing `redeemed_key_value` (or any other raw key string) in the cache:** Only store a
  boolean `redeemedKeyValuePresent` derived from the field's presence. The actual key value
  is a secret (C4/Pitfall 4) and Phase 11 never needs to display or copy it (D-22: rows are
  read-only, no copy action).
- **Registering the new stores via the generic frontend `storeGet` bridge:** Phase 10's
  WR-09 finding showed that registering an electron-store as a `TypeCheckedStoreFrontend`
  lets any renderer code read arbitrary keys from it over IPC. Expose `humbleLibraryStore`
  and `humbleRevealedStore` data to the renderer only through dedicated typed IPC handlers
  (`humble:getKeys`, etc.) that return a display-safe shape, not through the generic store
  bridge.
- **Batching the whole sync's writes until the end:** Per D-34, each order's cache write
  must commit as soon as that order's fetch resolves, not after `Promise.all` on the whole
  batch. A batched approach would violate "mid-sync aborts keep per-order partial results."
- **Treating `access_denied` and `session_expired` the same way:** They already return
  distinct `AdapterResult` variants from Phase 10's adapter. `session_expired` is Phase 10's
  problem (expiry tile/toast, D-08/D-09) — `library.ts` should not attempt a sync at all if
  the session is already known-expired, and should not treat a `session_expired` result
  mid-sync as a fail-soft/cooldown case; it should stop and let the existing expiry
  machinery own it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Response shape validation | Manual field-presence checks / `as` casts on Humble API responses | zod schemas, extending the existing `OrderDetailSchema`/`GamekeysSchema` in `adapter.ts` | Already the project's pattern; `.passthrough()` resilience (Pitfall 5) is already proven to keep one field-shape drift from crashing the whole sync |
| Encrypted secret storage | A new encryption scheme for any Humble-domain secret | `safeStorage.encryptString`/`decryptString` with the `TOKEN_PREFIX` sentinel pattern (already implemented in `humble/user.ts` for the session cookie) | Not directly needed by Phase 11 (no new secrets are introduced — REVEALED flags and classification data are not secrets), but any future secret in this domain must reuse this exact pattern, not invent a new one |
| Relative-time formatting ("X ago") | A new formatter for the Humble "last synced" indicator | Extract/reuse the existing `formatRelativeTime()` pattern from `src/frontend/screens/Library/components/LibraryHeader/index.tsx` (currently a private inline function — extract to a shared helper if reused, per Claude's Discretion) | D-32 explicitly says this indicator "mirrors the Steam library's stale-indicator precedent" — the string-formatting logic already exists and is proven |

**Key insight:** Everything genuinely novel in this phase (classification precedence,
skip-terminal partitioning, the two-store REVEALED-vs-cache split) is domain-specific
business logic that no library can provide — it must be hand-written, but as a small,
pure, and heavily-tested function per Pattern 4 above. Everything that IS a solved problem
(HTTP, schema validation, encrypted storage, relative-time strings) already has an
established in-repo pattern from Phase 10 or the Steam manager — reuse it rather than
reinventing it.

## Common Pitfalls

### Pitfall 1: Embedding the REVEALED flag in the same store that gets wiped on disconnect

**What goes wrong:** If the local REVEALED flag is stored as a field on the same cache
record that `HumbleUser.disconnect()` clears (as `ARCHITECTURE.md`, written before D-03/D-04
were locked, originally proposed), a disconnect+reconnect cycle silently loses every
REVEALED flag. A key the user revealed (Phase 14 territory, but the store is built now)
would come back showing as UNREVEALED — directly reproducing PITFALLS.md's Pitfall 1
consequence ("gift link permanently forfeited... the app now shows the key as
UNREVEALED") even though no reveal-flow bug caused it.

**Why it happens:** The natural first design ("store it where the sync writes it") doesn't
account for the disconnect wipe policy locked in a *different* phase's CONTEXT.md (Phase
10 D-03/D-04), which this phase's D-30 explicitly cross-references.

**How to avoid:** Two separate electron-store instances from the start:
`humbleLibraryStore` (wiped by disconnect, alongside the sync-state store) and
`humbleRevealedStore` (never touched by disconnect — same treatment as the future audit
log per D-04). `HumbleUser.disconnect()` must be extended in this phase to clear the
former but explicitly skip the latter, with an inline comment explaining why (mirroring the
existing `// D-04: does NOT touch any audit-log/REVEALED-flag store` comment already
present in `user.ts:469-470`, which currently says "none exists yet in Phase 10; this is
forward policy for Phase 11").

**Warning signs:** A single `HumbleKey` type/record that has both a `revealed: boolean`
field and lives inside the same `CacheStore`/`.clear()` call graph as the rest of the
synced library.

### Pitfall 2: Un-picked Choice month detection assumed but never live-validated

**What goes wrong:** D-27's detection heuristic (`product.category == 'subscriptioncontent'`
+ `choice_url`, no key allocated) comes from `HUMBLE-SPEC-SOURCE.md`, which is itself
marked `[ASSUMED]`/undocumented-API-derived, not confirmed by Phase 10's live validation
gate (which only exercised existing, already-picked orders on the tested account). If the
tested account has no currently-unpicked Choice month, this code path may ship completely
unexercised against the real API and fail silently or throw on first real-world encounter.

**Why it happens:** Live validation gates naturally only exercise the data present in the
account used to run them; an un-picked month is a transient state (it exists only until
the user picks that month's games) and may not have been present during Phase 10's gate.

**How to avoid:** Treat D-27's detection heuristic as `[ASSUMED]` (see Assumptions Log) and
plan a lightweight, dev-only live-validation checkpoint (mirroring Phase 10's
`window.api.humbleRunValidation()` pattern) that specifically checks: does the
`/api/v1/user/order` or `/api/v1/order/{gamekey}` response ever include a
`subscriptioncontent`-category entry, and if so, does it have the expected shape? If the
account used for this phase's execution has no unpicked month at validation time, the
planner should still implement the pseudo-entry code path defensively (never throw on an
unexpected/missing field — fall back to omitting the pseudo-entry rather than crashing the
whole sync) per the Claude's Discretion note ("if not, the pseudo-entry renders without an
expiration rather than blocking the feature").

**Warning signs:** Code that assumes `product.choice_url` is always present when
`category === 'subscriptioncontent'`, or that throws (rather than defensively omits) when
the pick-deadline field is absent.

### Pitfall 3: Skip-terminal partitioning silently classifies a NEW gamekey as terminal without ever fetching it

**What goes wrong:** D-24's "all-terminal" freeze only applies to gamekeys the cache has
already seen and classified. A bug in the partitioning logic that checks
"all keys terminal" on an *empty* (never-fetched) cache entry, rather than explicitly
distinguishing "not in cache yet" from "in cache and all-terminal," would silently skip
fetching brand-new orders — the opposite of D-24's intent ("New gamekeys (never seen
before) are always fetched").

**Why it happens:** `Array.every()` on an empty array returns `true` — a naive
`entry.keys.every(k => isTerminal(k.state))` check on a not-yet-cached (empty-keys) entry
would incorrectly read as "all terminal," so the partitioning step must check cache
*membership* first, separately from the terminal-check.

**How to avoid:** Partition explicitly in three named buckets — `newGamekeys` (not in
`humbleLibraryStore` at all), `nonTerminalGamekeys` (in cache, `!entry.allTerminal`), and
`frozenGamekeys` (in cache, `entry.allTerminal`) — and fetch the union of the first two,
never relying on an `every()` check alone to decide "new vs. frozen."

**Warning signs:** A single boolean check (`allTerminal`) used to decide "skip" without a
prior "does this gamekey exist in the cache at all" branch.

### Pitfall 4: Fail-soft path accidentally clears or partially overwrites the cache on a mid-batch abort

**What goes wrong:** If the concurrency pool's abort-on-403 logic (D-25) is implemented by
throwing out of the whole `sync()` function on the first denial, any `try/finally` or
cleanup logic that clears in-progress state could accidentally wipe or leave inconsistent
the cache entries for orders that already completed successfully earlier in the same
batch — violating D-34 ("fresh orders stay fresh, the rest keep prior cache").

**Why it happens:** The natural instinct when handling "abort the whole operation" is a
single top-level try/catch that also does cleanup; if that cleanup touches
`humbleLibraryStore` broadly (e.g., "reset sync state") rather than narrowly (only the
sync-in-progress flag / cooldown timer), completed per-order writes can be collaterally
damaged.

**How to avoid:** The per-order commit (Pattern 2) already writes to the cache as soon as
each order resolves — the abort signal (Pattern 3's `aborted` flag) should only stop
*dispatching new work*, never touch already-committed cache entries. The only state
written on abort is the `syncError` flag and (if the denial was a 403) the cooldown
timestamp — both in the sync-state store, never the library cache.

**Warning signs:** A `finally` block or catch handler that calls `humbleLibraryStore.clear()`
or writes to gamekeys other than the one currently being processed.

### Pitfall 5: Classification recomputed from a stale in-memory copy instead of the freshly-fetched response

**What goes wrong:** HSYNC-03 requires expiration to be recomputed from the Humble
response's expiration field **on every sync** — not trusted from the previous cache entry.
A subtle bug: if `classifyOrder()` is accidentally called with the *previous* cached entry
(to "preserve" fields) rather than the newly-fetched raw response, a retroactively-added
expiration on Humble's side would never be observed, because the code is re-deriving state
from data that predates the change.

**Why it happens:** The REVEALED-flag preservation requirement (D-30) and the
expiration-recomputation requirement (HSYNC-03) pull in opposite directions — one says
"carry forward local state across syncs," the other says "never trust cached state for
this specific field." Conflating them (e.g., merging the whole previous record forward and
only overwriting fields that changed) risks silently preserving a stale expiration/`null`
value from before Humble added it.

**How to avoid:** `classifyOrder()` takes the **fresh** raw API response as its primary
input and reads the REVEALED-flag store (a *different*, small, keyed lookup — not the
previous library-cache record) as the only piece of carried-forward local state. Nothing
about expiration, `redeemed_key_value` presence, or `key_type` should ever come from the
previous cache entry — those three fields are always taken from the current fetch.

**Warning signs:** A `{ ...previousEntry, ...newFields }` spread pattern where
`previousEntry` includes `expiration` or `redeemedKeyValuePresent`.

## Code Examples

### Extending `AdapterResult`-based error handling into sync orchestration

```typescript
// Illustrative — library.ts's use of the EXISTING adapter.ts contract.
// Source pattern: src/backend/humble/adapter.ts (AdapterResult<T> union)
import { getGamekeys, getOrderDetail } from './adapter'
import { HumbleUser } from './user'

export async function sync(): Promise<{ status: 'ok' | 'partial' | 'failed' }> {
  const cookie = HumbleUser.getCredentials()
  if (!cookie) return { status: 'failed' } // not logged in — nothing to sync

  const gamekeysResult = await getGamekeys(cookie)
  if (gamekeysResult.status !== 'ok') {
    // session_expired: leave to Phase 10's expiry machinery, don't set syncError
    // access_denied/schema_error: fail-soft — keep cache, set syncError (D-31)
    return { status: 'failed' }
  }
  // ... partition into new/nonTerminal/frozen (Pitfall 3), then bounded fetch (Pattern 3)
  return { status: 'ok' }
}
```

### Extending `electronStores.ts` with the two-store split

```typescript
// Illustrative — src/backend/humble/electronStores.ts, extending the existing file
import { TypeCheckedStoreBackend } from '../electron_store'
import CacheStore from '../cache'

const configStore = new TypeCheckedStoreBackend('humbleConfigStore', {
  cwd: 'humble_store'
})

// Wiped by HumbleUser.disconnect() alongside configStore.
const humbleLibraryStore = new CacheStore<HumbleOrderCacheEntry, string>(
  'humble_library',
  null // indefinite lifespan — cache-aggressive per F1/HSYNC-01
)
const humbleSyncStore = new CacheStore<number, 'syncedAt'>('humble_sync', null)

// D-04/D-30: NEVER cleared by disconnect(). Separate file on disk from the
// two stores above for exactly that reason.
const humbleRevealedStore = new CacheStore<{ revealedAt: number }, string>(
  'humble_revealed',
  null
)

export { configStore, humbleLibraryStore, humbleSyncStore, humbleRevealedStore }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ARCHITECTURE.md`'s single-store REVEALED-flag-embedded-in-cache design | Two separate electron-store instances (library cache vs. REVEALED-flag store) | Superseded by Phase 10 D-03/D-04 and this phase's D-30 (both locked 2026-07-05) | Any plan or task that follows `ARCHITECTURE.md` literally on this point will violate HSYNC-02's "survives re-sync" requirement across a disconnect/reconnect cycle |
| `HUMBLE-SPEC-SOURCE.md`'s original F5 wording ("reveal, then hand off to Steam activation") | Reveal/redeem are explicitly OUT of Phase 11 scope (D-22) — this phase only builds the flag store and classification precedence, not the write path | Locked by this phase's CONTEXT.md domain boundary | Do not implement any reveal IPC handler or UI action in Phase 11; the store must exist and be honored in classification, but nothing writes to it yet |

**Deprecated/outdated:**
- The `humblebundle` npm package (konsumer) — already rejected in prior research
  (`ARCHITECTURE.md`), remains rejected; not relevant to Phase 11's build-your-own-adapter
  approach.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Un-picked Humble Choice months are detectable via `product.category == 'subscriptioncontent'` + `product.choice_url` on the same order-list/order-detail endpoints already validated in Phase 10 | Pitfall 2, D-27 implementation | If un-picked months use a different endpoint or shape entirely, the UNPICKED pseudo-entry code path ships unexercised and may never render, or throw on an unexpected response shape (mitigated by defensive coding per Claude's Discretion, but the *feature* — showing unpicked months — would silently not work) |
| A2 | The pick-deadline date for an UNPICKED month is available as a field on the same product/order object | Claude's Discretion note, D-27 | If unavailable, the pseudo-entry must render without an expiration (already the documented fallback) — low risk, already anticipated |
| A3 | `redeemed_key_value` presence alone (not its content) is the correct and only REDEEMED signal, with no other Humble-side "activated" flag | `HUMBLE-SPEC-SOURCE.md` Appendix A, `[CITED]` from a 2017 reverse-engineering writeup, not re-confirmed by Phase 10's live gate for a REDEEMED key specifically (the gate confirmed gamekeys+order-detail+steam_app_id, not a redeemed_key_value example) | If Humble's real response never actually withholds `redeemed_key_value` until activation (e.g., it's always present as an empty string vs. absent), the REDEEMED/UNREVEALED boundary could misclassify; needs a real-account check during execution against at least one already-redeemed key if the test account has one |
| A4 | Order-detail responses expose an `expiration` field per-tpk (not only at the order/bundle level) suitable for the UNREDEEMABLE check | `HUMBLE-SPEC-SOURCE.md` §2.1, Pitfall 7 | If expiration is only available at a coarser granularity (e.g., per-order, not per-key), the classify function's signature needs adjusting — the precedence logic itself is unaffected, only its input shape |

**If this table is empty:** N/A — see entries above; all four should be confirmed or
corrected against the real API during Phase 11 execution, ideally via a dev-only debug
check similar to Phase 10's `humbleRunValidation()` pattern before the classify function is
considered final.

## Open Questions (RESOLVED)

> All three questions below now have a concrete resolution path in the Phase 11 plans.
> Each is annotated inline with where it is addressed — no further planning is blocked on them.

1. **Does an un-picked Humble Choice month even appear in `/api/v1/user/order` at all, and if so, in what shape?**
   - What we know: Phase 10's live validation gate confirmed the gamekeys-list and
     order-detail endpoints work for existing (picked) orders. `HUMBLE-SPEC-SOURCE.md`
     asserts a detection heuristic but is explicitly marked as unofficial/reverse-engineered.
   - What's unclear: Whether an unpicked month shows up as a normal gamekey entry with a
     `subscriptioncontent`-category product and no allocated tpks, as a distinct
     non-gamekey structure, or not at all in this endpoint pair.
   - Recommendation: Add a dev-only, `!app.isPackaged`-gated debug check (mirroring Phase
     10's `humbleRunValidation()`) that logs (redacted, structure-only) whether any
     `subscriptioncontent`-category entry was observed in the tester's real account during
     execution. If none is observed, implement the pseudo-entry code defensively (never
     throw, never block sync) but flag the feature as unverified against live data in the
     phase's own VALIDATION.md, the same way Phase 10 flagged the identity endpoint as
     advisory.
   - **Resolution (Plan 11-01 Task 2 + Plan 11-05 Task 2):** The UNPICKED pseudo-entry is implemented defensively in `classifyOrder` (Plan 11-01 Task 2) — it omits the pseudo-entry rather than throwing when `choice_url`/deadline are absent. Live confirmation of the un-picked-month shape (Assumption A1) is resolved in Plan 11-05 Task 2 (Real-account UAT), which records the finding in `11-VALIDATION.md` or flags it "unverified — defensive path only".

2. **Is `redeemed_key_value` truly absent (not merely empty-string/null) for a not-yet-revealed key, and present with a real value for a REDEEMED one?**
   - What we know: This is the documented (but unofficial) detection field per
     `HUMBLE-SPEC-SOURCE.md` and multiple community tool sources in `PITFALLS.md`'s Sources
     list.
   - What's unclear: The exact JSON representation (field entirely absent vs. `null` vs.
     empty string) was not captured in Phase 10's redacted validation report (which
     recorded only pass/fail + presence booleans, not field-level shape detail for this
     specific field).
   - Recommendation: The zod schema for this field should accept `string | null | undefined`
     and treat any falsy value as "absent," rather than assuming strict field absence via
     `.optional()` alone — safer against a `null`-vs-`undefined` surprise.
   - **Resolution (Plan 11-01 Task 2):** The `OrderDetailSchema` element uses `redeemed_key_value: z.string().nullish()` and `classifyOrder` derives `redeemedKeyValuePresent` from a truthy check — null, undefined, and empty-string are all treated uniformly as "absent". The live field shape (Assumption A3) is additionally confirmed against a real redeemed key in Plan 11-05 Task 2.

3. **Should a REDEEMED key that later gains a retroactive expiration actually reclassify to UNREDEEMABLE (per D-30's literal precedence), or is this an edge case Humble's real API never produces?**
   - What we know: D-30 explicitly states "expiration ⇒ UNREDEEMABLE beats both" (both
     `redeemed_key_value` presence and the local flag).
   - What's unclear: Whether Humble's real API would ever attach an expiration to an
     already-redeemed entitlement (logically, an activated key has nothing left to expire
     from the user's perspective — Steam already owns it). This may be a defensive
     precedence rule for a combination that never actually occurs in practice.
   - Recommendation: Implement the precedence exactly as locked in D-30 (do not
     second-guess a locked user decision) — the classify function should be written to
     handle the case even if it's rare/theoretical. Flag this in code comments so a future
     phase doesn't "fix" it by reordering the precedence without checking back with this
     decision.
   - **Resolution (Plan 11-01 Task 2):** The literal D-30 precedence (expiration → UNREDEEMABLE beats `redeemed_key_value` → REDEEMED beats the local flag) is implemented in `classifyTpk` with an explicit code comment referencing this question that warns against reordering; a unit test asserts past-expiration → UNREDEEMABLE even when `redeemedKeyValuePresent` is true.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| axios | HTTP transport (`adapter.ts`, unchanged) | ✓ | 1.13.5 | — |
| zod | Response schema validation | ✓ | 3.24.3 | — |
| electron-store | Cache/config persistence | ✓ | 8.2.0 | — |
| Humble Bundle API reachability | The entire sync (F1) | Not applicable to check at research time — this is the live-network dependency the whole phase is designed to be resilient to | — | Fail-soft: serve cached `humbleLibraryStore` data with the "couldn't refresh" banner (D-31) — this fallback IS the phase's success criterion 4, not an afterthought |
| Node/TypeScript toolchain (jest, ts-jest) | Unit tests for `classify.ts`/`library.ts` | ✓ | jest 29.7.0, ts-jest 29.3.2 | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Humble API reachability — see fail-soft row above; this is the designed behavior, not a gap.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | jest 29.7.0 (`ts-jest` 29.3.2) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest src/backend/humble/__tests__ --no-coverage` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HSYNC-01 | `classifyOrder()` produces exactly one of the 5 states for representative fixture tpks (one per state) | unit | `npx jest src/backend/humble/__tests__/classify.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-01 | Sync partitions gamekeys into new/non-terminal/frozen correctly (Pitfall 3) — a never-cached gamekey is always fetched, an all-terminal cached gamekey is skipped | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-01 | Concurrency pool never exceeds the configured in-flight limit (mock worker with a counter) | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-02 | A tpk with the local REVEALED flag set and no `redeemed_key_value` classifies REVEALED, and this survives a simulated restart (new store instance reading the same file) | unit | `npx jest src/backend/humble/__tests__/classify.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-02 | `humbleRevealedStore` is untouched by `HumbleUser.disconnect()` while `humbleLibraryStore`/`humbleSyncStore` are cleared | unit | `npx jest src/backend/humble/__tests__/user.test.ts --no-coverage` (extend existing file) | ✅ (extend) |
| HSYNC-03 | A tpk cached without an expiration, then re-synced with a newly-added expiration field, reclassifies UNREDEEMABLE on the next sync (not the cached run) | unit | `npx jest src/backend/humble/__tests__/classify.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-03 | An all-terminal order is frozen and skipped on subsequent syncs (does not call `getOrderDetail` again) | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-04 | `access_denied`/`schema_error` on `getGamekeys` leaves the existing cache untouched and sets a `syncError`/cooldown state | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-04 | Mid-sync abort (403 on order N of M) commits orders 1..N-1's fresh results and leaves N+1..M at their prior cached state (D-34) | unit | `npx jest src/backend/humble/__tests__/library.test.ts --no-coverage` | ❌ Wave 0 |
| HSYNC-04 | Fail-soft banner / "last synced X ago" indicator renders from context state (manual/visual — no headless DOM test infra exists for this screen yet) | manual | — (visual UAT, per Phase 10's precedent of manual-only UX verification) | 📋 manual |

### Sampling Rate

- **Per task commit:** `npx jest src/backend/humble/__tests__ --no-coverage`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/backend/humble/classify.ts` + `src/backend/humble/__tests__/classify.test.ts` — new files; the pure classification function and its precedence tests (HSYNC-01/02/03) do not exist yet
- [ ] `src/backend/humble/library.ts` + `src/backend/humble/__tests__/library.test.ts` — new files; sync orchestration, partitioning, concurrency pool, and fail-soft tests (HSYNC-01/04) do not exist yet
- [ ] Fixture data: at least one realistic `tpkd_dict.all_tpks[]` entry per state (UNPICKED product shape, UNREVEALED, REVEALED via mock local flag, REDEEMED via `redeemed_key_value` presence, UNREDEEMABLE via past-dated expiration) — none of Phase 10's existing fixtures cover classification fields since Phase 10 only validated presence/shape, not classification semantics
- [ ] Extend `src/backend/humble/__tests__/user.test.ts` to cover the disconnect-does-not-clear-`humbleRevealedStore` behavior once `user.ts`'s `disconnect()` is extended

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new work) | Already covered by Phase 10 (session cookie handling unchanged in this phase) |
| V3 Session Management | No (new work) | Same — Phase 10 owns this; Phase 11 only reads `HumbleUser.getCredentials()` |
| V4 Access Control | No | Single-user local app; no multi-tenant concern |
| V5 Input Validation | Yes | zod schemas (`OrderDetailSchema` extension) validate every field this phase consumes before it reaches classification logic — never `as`-cast a raw Humble response |
| V6 Cryptography | No (new work) | No new secret is introduced by this phase; REVEALED flags and classification data are not sensitive (they don't include raw key values) |
| V7 Error Handling / Logging | Yes | Must extend the existing redacted-logging discipline (`describeSchemaFailure` pattern) — never log a full order/tpk object; log structural info (state counts, gamekey identifiers) only |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Persisting the raw `redeemed_key_value` string in the local cache | Information Disclosure | Store only a derived boolean (`redeemedKeyValuePresent`); never persist the actual field value (C4) |
| Registering `humbleLibraryStore`/`humbleRevealedStore` via the generic frontend `storeGet` IPC bridge (per Phase 10's WR-09 finding on `humbleConfigStore`) | Information Disclosure | Expose only through dedicated typed IPC handlers returning a display-safe projection; do not add these stores to the generic frontend store registration list |
| Unbounded parallel order-detail fetch (fan-out without a concurrency limit) treated as a self-inflicted denial-of-service against the account's own access | Denial of Service | Concurrency-bounded pool (2–3, D-25), abort-on-first-denial, 403 cooldown gating even manual refresh (D-33) |
| Logging full order/tpk objects for sync debugging | Information Disclosure | Follow the existing `describeSchemaFailure()` redaction pattern (`adapter.ts`) — log field paths/messages/lengths only, never values, for any new logging this phase adds |
| Malformed/adversarial API response causing a classification crash that takes down the whole sync (or worse, the IPC handler) | Tampering / Denial of Service | Per-order isolation (Pattern 2) — a `schema_error` on one order must be caught and skipped, never allowed to throw out of the sync loop or the IPC handler |

## Sources

### Primary (HIGH confidence)
- Codebase read directly: `src/backend/humble/adapter.ts`, `user.ts`, `electronStores.ts`,
  `ipc_handler.ts`, `constants.ts`, `__tests__/adapter.test.ts` — the exact Phase 10
  scaffold Phase 11 builds on
- Codebase read directly: `src/backend/storeManagers/steam/library.ts`,
  `electronStores.ts` — the cache-then-sync + `CacheStore` precedent Phase 11 mirrors
- Codebase read directly: `src/frontend/state/GlobalState.tsx` (humble context slice,
  `humbleCheckHealth()` startup call site), `ContextProvider.tsx`, `SidebarLinks/index.tsx`,
  `Library/components/LibraryHeader/index.tsx` (stale-indicator precedent)
- `.planning/phases/10-humble-auth-adapter-scaffold/10-VALIDATION.md` — the live-proven
  endpoint/shape facts this phase's sync logic is built on
- `.planning/phases/10-humble-auth-adapter-scaffold/10-CONTEXT.md` — D-03/D-04/D-08/D-09/D-14
  decisions this phase's disconnect-wipe and fail-soft logic must be consistent with
- `.planning/phases/10-humble-auth-adapter-scaffold/10-REVIEW.md` — WR-08 (i18n consumed
  namespace) and WR-09 (generic store-bridge IPC exposure risk) findings this phase must
  not repeat
- `.planning/phases/11-library-sync-5-state-key-model/11-CONTEXT.md` — this phase's locked
  decisions (D-19..D-34), copied verbatim above
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — the 5-state domain model, field semantics
- `.planning/research/PITFALLS.md` — Pitfalls 1, 3, 5, 7, 8 (direct precedent for this
  phase's Common Pitfalls section)
- `.planning/research/ARCHITECTURE.md` — original component breakdown (superseded on the
  REVEALED-flag-storage point, as documented above)

### Secondary (MEDIUM confidence)
- `package.json` inspection confirming axios 1.13.5 / zod 3.24.3 / electron-store 8.2.0
  already installed, cross-referenced against Phase 10's live validation report confirming
  these work end-to-end against the real Humble API

### Tertiary (LOW confidence)
- `HUMBLE-SPEC-SOURCE.md`'s un-picked-month detection heuristic and `redeemed_key_value`
  field-shape assumption — both flagged in the Assumptions Log above, unofficial/reverse-
  engineered API behavior not independently re-confirmed in this research session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all three libraries already installed and
  live-validated in Phase 10
- Architecture: HIGH — direct extension of an existing, already-built adapter and an
  existing, already-built sibling (Steam) sync pattern; the one correction (REVEALED-flag
  store separation) is derived directly from two locked CONTEXT.md decisions (Phase 10 D-04,
  Phase 11 D-30), not speculation
- Pitfalls: HIGH for the architecture-level pitfalls (store separation, per-order isolation,
  partitioning) since they follow directly from locked decisions and existing code; MEDIUM
  for the two Humble-API-shape assumptions (un-picked month detection, `redeemed_key_value`
  exact representation) since neither was covered by Phase 10's live validation gate

**Research date:** 2026-07-05
**Valid until:** 30 days for the architecture/stack guidance (stable, no external API
churn risk); the two `[ASSUMED]` API-shape items (Assumptions A1/A3) should be
re-verified against the live account at the start of Phase 11 execution, not held to the
30-day window, since Humble's undocumented API can and has changed without notice (C5)
