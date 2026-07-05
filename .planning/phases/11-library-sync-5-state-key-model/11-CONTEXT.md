# Phase 11: Library Sync + 5-State Key Model - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

A connected Humble account's full key inventory (orders → per-key TPKs) is synced into
GameLib through the live-validated C5 adapter (`src/backend/humble/adapter.ts`), classified
into exactly one of UNPICKED / UNREVEALED / REVEALED / REDEEMED / UNREDEEMABLE, cached
locally with concurrency-bounded fetching, and displayed on a minimal read-only keys page
that fails soft (cached data + "couldn't refresh") when the Humble API is unreachable.

Delivers HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04. No dedup (Phase 12), no Keys-Waiting /
Giftable-Spares views (Phase 13), no reveal/claim actions (Phase 14), no store overlay
(Phase 15). Humble is a keys domain, NOT a Runner (locked v1.2 decision).

</domain>

<decisions>
## Implementation Decisions

> Numbering continues from Phase 10 (D-01..D-18) to keep v1.2 decision IDs unambiguous.

### Phase 11 surface (where synced keys appear)
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

### Sync triggers & fetch strategy
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

### Key model & classification
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

### Fail-soft & staleness (HSYNC-04)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 11: Library Sync + 5-State Key Model" — goal + 4 success criteria.
- `.planning/REQUIREMENTS.md` § "Humble Library Sync" — HSYNC-01..04 wording.

### Key model & API source of truth
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — the 5-state model (§2.1 states + detection
  fields, §2.2 transitions, §2.3 ownership overlay), `redeemed_key_value` /
  `subscriptioncontent` + `choice_url` / `steam_app_id` field semantics, F2/F8 feature
  definitions, C-constraints. THE reference for classification logic.
- `.planning/phases/10-humble-auth-adapter-scaffold/10-VALIDATION.md` — empirically proven
  endpoint behavior (gamekeys array shape, order-detail 200s, steam_app_id presence,
  identity 404-advisory). What the live API actually returns.
- `.planning/research/PITFALLS.md` — C5 access-denial history (Lutris 2022/2024/2025) and
  cookie-handling rules (never logged, never in full IPC payloads).

### Prior-phase decisions that bind this phase
- `.planning/phases/10-humble-auth-adapter-scaffold/10-CONTEXT.md` — D-03/D-04 (disconnect
  wipe policy + REVEALED-flag/audit-log survival), D-08 (401-vs-403 split + startup health
  check), D-09/D-10 (expiry tile + toast machinery Phase 11 consumes for "couldn't
  refresh" vs "session expired"), D-14 (axios transport, dormant ses.fetch seam).
- `.planning/research/ARCHITECTURE.md` — `src/backend/humble/` component breakdown and the
  never-a-Runner constraint.

### Existing code (build on, don't rebuild)
- `src/backend/humble/adapter.ts` — C5 wall: `getGamekeys` / `getOrderDetail` /
  `AdapterResult` statuses (`ok` / `session_expired` / `access_denied` / `schema_error`),
  the single `humbleRequest` transport seam, redacted schema-failure logging.
- `src/backend/humble/user.ts` — session/cookie machinery, expiry signaling; Phase 11
  consumes its state, never re-implements validation.
- `src/backend/humble/electronStores.ts`, `src/backend/humble/ipc_handler.ts` — store +
  IPC conventions to extend.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/humble/adapter.ts` — both sync endpoints already exist behind typed
  `AdapterResult`; Phase 11 adds orchestration on top, not new HTTP code. The 401/403
  split maps directly onto session-expired vs fail-soft-backoff handling.
- Phase 10's expiry signal (startup health check + 401 → expired tile/toast) — the
  "session expired" branch of sync failure is already built; Phase 11 only adds the
  non-auth fail-soft branch (D-31).
- Steam library's cache-then-sync pattern (`src/backend/storeManagers/steam/library.ts`:
  init() serves cache, background refresh, stale indicator in LibraryHeader) — the
  architectural template for cache-aggressive sync + last-synced display (D-32), adapted
  to the not-a-Runner humble domain.
- Sidebar (`src/frontend/components/UI/Sidebar`) — where the "Humble Keys" entry mounts,
  conditioned on connected state from the existing humble context slice.

### Established Patterns
- IPC via `addHandler()` typed in `AsyncIPCFunctions` / `FrontendMessages` — all new
  `humble:*` sync/inventory channels follow this.
- `electron-store` domain stores (`electronStores.ts`) — inventory cache, REVEALED-flag
  store, and sync-state metadata follow the existing configStore pattern.
- Humble frontend state lives in a `humble` context slice (not a runner entry) — inventory
  + sync status extend that slice.
- All CSS uses semantic tokens from `_colors.scss` / `_spacing.scss`; all strings via
  `t()` with keys in the consumed namespace (Phase 10 WR-08 lesson).

### Integration Points
- `src/backend/humble/` grows sync/classification modules (e.g., `library.ts` /
  `classify.ts` per research ARCHITECTURE.md) behind the existing adapter.
- `src/frontend/screens/` gains the Humble Keys page; sidebar gains its entry; router
  gains its route.
- Startup sequencing: sync hooks the same startup path as the D-08 health check — health
  check first, sync only on a healthy session.

</code_context>

<specifics>
## Specific Ideas

- The keys page is a **classification proof**, deliberately humble (read-only, minimal) —
  its job is making the 5-state model visibly correct so Phases 12–14 build on trusted
  data. Resist decorating it.
- Rate-limit paranoia is a feature: abort-on-denial (D-25) + 403 cooldown (D-33) +
  skip-terminal fetching (D-24) all exist because Humble has locked out integrations
  before (C5). When in doubt, fetch less.
- One malformed order must never fail the whole sync — schema_error on a single order
  detail keeps that order's cached entry and the sync continues (per-order isolation,
  same spirit as D-34).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Reveal actions, gift links, detail
expansion, and link-outs on key rows were consciously excluded from the Phase 11 surface;
they arrive with Phases 13/14 as designed.)

</deferred>

---

*Phase: 11-library-sync-5-state-key-model*
*Context gathered: 2026-07-05*
