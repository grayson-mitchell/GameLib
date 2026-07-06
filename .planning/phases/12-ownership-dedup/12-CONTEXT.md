# Phase 12: Ownership Dedup - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Every Humble key in the synced inventory is cross-referenced against the Steam library —
AppID-first via `steam_app_id`, 85%+ fuzzy-name fallback with a DLC guard — setting an
`owned_elsewhere` overlay flag (orthogonal to the 5-state classification, per spec §2.3).
A Humble Steam key already REDEEMED into Steam collapses onto its existing Steam library
entry as a game-details annotation instead of appearing as a duplicate entry anywhere.

Delivers HDEDUP-01, HDEDUP-02. No Keys-Waiting / Giftable-Spares views (Phase 13), no
reveal/claim actions (Phase 14), no store overlay (Phase 15). Dedup is a pure local
computation — it makes ZERO Humble network requests. Humble remains a keys domain, NOT a
Runner (locked v1.2 decision).

</domain>

<decisions>
## Implementation Decisions

> Numbering continues from Phase 11 (D-01..D-34) to keep v1.2 decision IDs unambiguous.

### Steam-entry annotation (HDEDUP-02 collapse)
- **D-35:** The Humble-origin annotation lives on the **Steam game's details page only**
  (no library tile badge). Copy is **origin only**: "Includes a key from Humble Bundle:
  {bundle/order name}" — no purchase date. Bundle name comes from the order data already
  cached in Phase 11.
- **D-36:** The redeemed key **stays visible on the Humble Keys page** as a normal
  REDEEMED row — it is part of the key inventory ("never lose a key"). "Collapse" means
  only that a matched key never becomes a separate library-like entry; the details
  annotation is the Steam-side trace.
- **D-37:** A REDEEMED Steam key with **no confirmed ownership match** (redeemed on
  another account, delisted, missing `steam_app_id`) renders as a normal REDEEMED row —
  no annotation, no mismatch flag, no guessing. The collapse fires only on a confirmed
  match.

### Owned badge on the keys page (HDEDUP-01 visibility)
- **D-38:** Phase 12 adds an ownership badge to matching rows on the Phase 11 Humble Keys
  page — the visible proof that matching works before Phase 13's views exist. Phase 13
  filters on the same underlying flag.
- **D-39:** The badge states the **fact only** ("Owned on Steam") — no §2.3 recommendation
  copy ("Claim this" / "giftable spare"); those arrive with Phase 13's views. The badge is
  also **presentation-only**: the D-21 layout (state groups, expiring-soonest first) is
  untouched — no dimming, no re-sorting.
- **D-40:** The details-page annotation is **redeemed-only**. No "you have an unclaimed
  Humble key" hint on Steam entries — unclaimed-key surfacing is Phase 15's store-overlay
  job (HSTORE-01).

### Match confidence & overrides
- **D-41:** Fuzzy matches are **visually distinguishable** from exact matches: exact
  AppID match → "Owned on Steam"; fuzzy-name match → "Likely owned on Steam". The
  exact-vs-fuzzy provenance is persisted with the match result so Phase 14's C2 hard
  block can treat fuzzy matches more gently (a false-positive fuzzy match must not
  permanently block claiming a genuinely-needed key).
- **D-42:** A **"Not the same game" override exists on fuzzy-matched rows only** — it
  clears the match and is persisted (keyed by `machine_name`). Exact AppID matches are
  trusted: no override, no manual "mark as owned".
- **D-43:** Overrides **survive disconnect** — they join the D-04 wipe exemption alongside
  the REVEALED flags and future audit log. A user correction must not silently regress
  (and re-block Phase 14 claims) after a reconnect.
- **D-44:** When a key **has** `steam_app_id`, the AppID verdict is **final** — owned or
  not owned, no fuzzy second-guessing. The fuzzy-name path runs ONLY when `steam_app_id`
  is missing. Predictability over recall: fuzzy false-positives are the dangerous error
  class here.

### Match scope & recompute
- **D-45:** **All key platforms** (Steam, GOG, Epic, Ubisoft, …) are matched against
  Steam ownership — a GOG key for a Steam-owned game IS a spare (spec F3: cross-reference
  every key). Non-Steam keys have no `steam_app_id`, so they go through the fuzzy path
  with the "Likely owned" treatment (D-41) and override affordance (D-42).
- **D-46:** "The library" for Phase 12 = the **full Steam owned-apps list** (installed or
  not), as held by the Steam store manager. Matching against Epic/GOG/Amazon libraries is
  a deferred enhancement — see Deferred Ideas.
- **D-47:** Ownership matching recomputes **after every Humble sync AND whenever the
  Steam library refreshes** (new purchase or a redeemed key changes ownership). It is an
  in-memory pass over cached data — D-24 frozen terminal orders are included in the
  recompute without any re-fetch, and no Humble requests are ever issued by dedup.
- **D-48:** If the Steam account is disconnected or its session is stale, existing
  `owned_elsewhere` flags are **kept at last-known values** until a successful recompute
  against real Steam data. Never zero out flags on missing/stale Steam data — flipping
  owned→unowned would strip Phase 14's C2 protection and invite key waste.

### Claude's Discretion
- Fuzzy-matching algorithm/library choice and title normalization strategy (edition
  suffixes, trademark symbols, punctuation) — the 85%+ threshold and the
  DLC-must-not-match-base-game guard are locked by HDEDUP-01/success criterion 3; how to
  achieve them is open.
- Where match results/overrides are stored (`electron-store` shapes following
  `electronStores.ts` conventions) and whether `owned_elsewhere` is persisted per key or
  recomputed on load — as long as D-48's keep-last-known behavior holds.
- IPC channel names (`humble:*`), badge styling (semantic tokens), i18n keys (consumed
  namespace per Phase 10 WR-08), override affordance placement/copy, details-page
  annotation component placement.
- Whether Phase 11's cached `HumbleKey` rows need a schema migration / one-time backfill
  re-fetch to capture `steam_app_id` for already-cached (including D-24 frozen) orders —
  a one-time backfill is acceptable and does not violate D-24's spirit (recurring cost is
  what it forbids). Researcher should confirm what the cache actually holds.
- UNPICKED Choice-month pseudo-entries (D-27) presumably cannot be ownership-matched (no
  concrete game identity); confirm and exclude them cleanly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 12: Ownership Dedup" — goal + 3 success criteria
  (AppID-first, 85%+ fuzzy fallback, DLC no-false-positive).
- `.planning/REQUIREMENTS.md` § "Humble Ownership Dedup" — HDEDUP-01/02 wording.

### Ownership-overlay model & field semantics
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — §2.3 (ownership overlay orthogonal to key
  state, recommendation semantics), §2.4 (key attributes incl. `owned_elsewhere`), F3
  (dedup functional requirement), `steam_app_id` field semantics. THE reference for what
  `owned_elsewhere` means.

### Prior-phase decisions that bind this phase
- `.planning/phases/11-library-sync-5-state-key-model/11-CONTEXT.md` — D-21 (keys-page
  layout Phase 12 must not disturb), D-22 (read-only rows; the D-42 override is Phase
  12's sanctioned exception), D-24 (frozen terminal orders — dedup recomputes over them
  without re-fetch), D-28 (all-platform classification, Steam-first dedup), D-30
  (REVEALED-flag store precedent for the override store).
- `.planning/phases/10-humble-auth-adapter-scaffold/10-CONTEXT.md` — D-03/D-04
  (disconnect wipe policy + survival exemption that D-43 extends to overrides).
- `.planning/research/ARCHITECTURE.md` — `src/backend/humble/` component breakdown and
  the never-a-Runner constraint.

### Existing code (build on, don't rebuild)
- `src/common/types/humble.ts` — `HumbleKey` / `HumbleOrderCacheEntry` shapes; currently
  have NO `steamAppId` or `ownedElsewhere` fields — Phase 12 extends these types.
- `src/backend/humble/classify.ts` + `src/backend/humble/library.ts` — where tpks are
  normalized into `HumbleKey` rows and where sync commits per-order results; the natural
  place to capture `steam_app_id` and hang the post-sync dedup pass.
- `src/backend/humble/electronStores.ts` — store conventions for the override store and
  any persisted match state.
- `src/backend/storeManagers/steam/library.ts` — the Steam ownership source: in-memory
  library keyed by `app_name` (stringified AppID), titles included; also where a
  Steam-refresh recompute trigger (D-47) hooks in.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Steam library cache (`src/backend/storeManagers/steam/library.ts`) — full owned-apps
  list with AppIDs and titles already in memory/on disk; dedup consumes it read-only.
- Phase 11 sync pipeline (`src/backend/humble/library.ts`: `runSync`, per-order commit) —
  the Humble-side recompute trigger (D-47) hangs off sync completion; per-order cache
  entries are the dedup input.
- REVEALED-flag store (D-30) — the exact precedent for the fuzzy-override store: keyed by
  `machine_name`, persisted, survives disconnect.
- Game details page (enriched in Phase 7) — where the D-35 annotation mounts; it already
  composes per-runner metadata sections.
- Humble Keys page rows — gain the badge (D-38/D-41) and the fuzzy-only override
  affordance (D-42).

### Established Patterns
- IPC via `addHandler()` typed in `AsyncIPCFunctions` / `FrontendMessages` — any new
  `humble:*` channels (override action, ownership state push) follow this.
- `electron-store` domain stores in `src/backend/humble/electronStores.ts`.
- All CSS via semantic tokens; all strings via `t()` in the consumed namespace.
- `owned_elsewhere` extends the existing `humble` context slice on the frontend — not a
  runner entry.

### Integration Points
- `HumbleKey` type grows `steamAppId?` / ownership fields — check whether cached rows
  need a one-time backfill to carry `steam_app_id` (Claude's discretion item; D-24 frozen
  orders are never re-fetched on a recurring basis).
- Dedup recompute must be callable from two places (D-47): Humble sync completion and the
  Steam library refresh path.
- The Steam game-details page needs a lookup: "is there a REDEEMED Humble key matching
  this AppID?" — likely via the humble context slice or an IPC query.

</code_context>

<specifics>
## Specific Ideas

- `owned_elsewhere` is an **overlay, never a state**: it must never mutate the 5-state
  classification, and classification must never consult ownership (spec §2.3
  orthogonality).
- The dangerous error class is the **fuzzy false-positive**: in Phase 14 it becomes a
  hard block on claiming a key the user genuinely needs. Bias the matcher toward
  precision over recall; the "Likely owned" label + override (D-41/D-42) are the safety
  valves.
- Dedup issues **zero Humble requests** — it is a pure computation over the Phase 11
  cache and the Steam library. C5 rate-limit discipline is preserved by construction.
- Keep-last-known (D-48) exists to protect users, not to hide staleness: a temporary
  Steam logout must not flip owned games to "Claim this".

</specifics>

<deferred>
## Deferred Ideas

- **Ownership matching against Epic/GOG/Amazon libraries** — spec F3's full "unified
  library" reading. Phase 12 is Steam-only per the roadmap; cross-runner name matching is
  a future enhancement (all fuzzy, higher false-positive surface — revisit after the
  Steam matcher is proven).
- **Mismatch hint** ("redeemed, but not found in your Steam library") on unmatched
  REDEEMED rows — consciously rejected for Phase 12 (D-37) to avoid false alarms on
  delisted/region-locked titles; could return later if demand appears.

</deferred>

---

*Phase: 12-ownership-dedup*
*Context gathered: 2026-07-06*
