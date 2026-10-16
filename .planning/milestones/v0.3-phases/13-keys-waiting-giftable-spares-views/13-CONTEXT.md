# Phase 13: Keys-Waiting + Giftable-Spares Views - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

The existing Humble Keys page (Phase 11 surface, Phase 12 ownership overlay) grows two
ownership-aware focused views: **Keys waiting** — unowned, unredeemed keys sorted by
expiration urgency with ≤30-day urgency badges — and **Giftable spares** — owned-elsewhere,
UNREVEALED keys with a one-click gift-link copy behind an irreversibility warning. Per
Phase 11 D-19/D-20, these are tabs of the same page/sidebar slot, not new surfaces.

Delivers HVIEW-01, HVIEW-02. These views must exist before Phase 14, whose C2 guard
redirects into Giftable Spares. No reveal/claim actions (Phase 14), no store overlay or
OS notifications (Phase 15). The gift-link copy is the ONLY new interactive affordance
this phase adds; everything else remains read-only. Humble remains a keys domain, NOT a
Runner (locked v0.3 decision). Zero new Humble write-style API calls.

</domain>

<decisions>
## Implementation Decisions

> Numbering continues from Phase 12 (D-35..D-48) to keep v0.3 decision IDs unambiguous.

### Tab structure & navigation
- **D-49:** The Humble Keys page becomes **3 tabs: "Keys waiting" / "Giftable spares" /
  "All keys"**. The Phase 11 state-grouped list (D-21 layout) survives **unchanged** as
  the "All keys" tab — the full-inventory "never lose a key" proof stays always reachable.
- **D-50:** **"Keys waiting" is the default tab** when opening Humble Keys — the
  action-oriented view first; full inventory is one click away.
- **D-51:** Tabs are **real sub-routes** (e.g. `/humble/keys/waiting`, `/spares`, `/all`)
  following existing react-router patterns. Phase 14's C2 redirect becomes a plain
  `navigate()`; deep links and back-button work for free.
- **D-52:** **Live counts on the two actionable tabs only** ("Keys waiting (7)",
  "Giftable spares (3)"); "All keys" is uncounted. Counts derive from the same data
  already in the humble context slice.

### View membership rules
- **D-53:** Keys waiting = `!ownedElsewhere` AND state ∈ **{UNPICKED, UNREVEALED,
  REVEALED}** — the spec §2.3 "Claim this" set exactly. UNPICKED Choice-month
  pseudo-entries belong here: a pick deadline silently expiring is precisely the failure
  this view exists to prevent. REVEALED-but-unactivated keys still need finishing.
- **D-54:** **Fuzzy-matched "Likely owned" keys go to Giftable spares** — `ownedElsewhere`
  is the single membership source of truth regardless of `matchConfidence`. The row keeps
  the D-41 "Likely owned on Steam" badge and the D-42 "Not the same game" override; the
  override moves the key back to Keys waiting (existing recompute path, no new mechanism).
- **D-55:** **Owned-elsewhere + REVEALED keys appear in All keys only.** They are neither
  claimable (owned) nor giftable (spec §2.1: reveal forfeits the gift link). Both focused
  views stay honest — no non-actionable rows.
- **D-56:** Keys waiting sort: **all dated keys soonest-first at the top, then the
  no-expiration bulk alphabetically** (HVIEW-01 "expiration urgency then title"). One
  list, no section headers.

### Gift-link mechanics (HVIEW-02)
- **D-57 (cached-first, deep-link fallback):** Researcher must verify whether the already-
  cached order-detail payload carries a usable gift URL (or one constructible from
  `gamekey`/tpk fields) **passively — no new write-style Humble API calls, ever** (C5).
  - If passively obtainable → one-click **"Copy gift link"** straight from cache.
  - If not → the row's action becomes **"Gift on Humble"**, deep-linking to the Humble
    order page where the user gifts manually.
  In-app gift-link *generation* via an undocumented write endpoint is **rejected** — that
  is the exact risk class that got Lutris locked out, and generation may itself convert
  the key.
- **D-58:** **Confirmation dialog on every copy** — states the consequence ("anyone with
  this link can claim the key; once redeemed it's gone for good") before writing to the
  clipboard. No "don't ask again". Same friction philosophy as Phase 14's C1 per-key
  reveal warning.
- **D-59:** A successful copy persists a **per-key copied-at timestamp** (keyed by
  `machineName`, joining the D-04 disconnect-wipe exemption alongside REVEALED flags and
  overrides) and renders a subtle "gift link copied {date}" annotation on the row —
  guards against double-gifting the same key.
- **D-60:** The gift action (copy or deep-link) **exists only in the Giftable spares
  view**. All-keys rows remain D-22 read-only (the D-42 override stays the sole
  exception). Phase 14's C2 redirect gets a single actionable destination.

### Urgency badge & recommendation copy
- **D-61:** **Two-tier urgency badge**: ≤7 days → `--status-danger`, ≤30 days →
  `--status-warning` (Phase 7 tier→color convention). No badge beyond 30 days.
- **D-62:** Badge copy is a compact countdown — **"{N} days left"** (weeks phrasing
  beyond 7 days; hours phrasing under 24h if data granularity supports it). The existing
  "Expires {date}" row text stays alongside as the absolute date.
- **D-63:** The badge renders **in all three tabs** — urgency is a property of the key,
  not the view; an expiring giftable spare is urgent too. Only claimable/giftable states
  badge (UNPICKED / UNREVEALED / REVEALED); REDEEMED and UNREDEEMABLE never badge.
- **D-64:** The §2.3 recommendation copy (D-39 deliverable) lands as a **one-line
  view-level header blurb per focused tab** — Waiting: "Keys you don't own yet — claim
  them before they expire." Spares: "You already own these games — keep the keys
  unrevealed and gift them instead." No per-row recommendation microcopy; the tab itself
  is the recommendation.

### Claude's Discretion
- Exact route path segments, tab component construction/styling (semantic tokens), and
  count-badge styling.
- Confirmation-dialog component choice (reuse the app's existing Dialog components) and
  exact warning copy; i18n keys in the **consumed** namespace (Phase 10 WR-08).
- Copied-at store shape/location following `electronStores.ts` conventions; whether it
  shares a store with the REVEALED flags or gets its own.
- Empty states per tab ("no keys waiting — you're all caught up", "no giftable spares").
- Precise weeks/hours phrasing thresholds for D-62 and how the badge coexists spatially
  with the state badge and owned badge on a row.
- How the gift-link availability check surfaces per-row when the cached payload has it
  for some keys and not others (mixed copy/deep-link rows are acceptable).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 13: Keys-Waiting + Giftable-Spares Views" — goal +
  3 success criteria (urgency-sorted waiting view, 30-day badge, one-click gift-link copy
  with irreversibility warning).
- `.planning/REQUIREMENTS.md` § "Humble Key Views" — HVIEW-01/02 wording.

### View semantics & gift-link model
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — §2.1 (giftable = UNREVEALED only; reveal
  forfeits the gift link), §2.2 (gift transition leaves the actionable set), §2.3
  (recommendation semantics driving both views), §2.4 (`gift_link` attribute "if
  unrevealed" — the field the D-57 research must verify against the live payload), F4/F6
  (the two views' functional definitions), C4 (gift links are secrets — never logged),
  C5 (adapter isolation / no risky endpoints).

### Prior-phase decisions that bind this phase
- `.planning/phases/11-library-sync-5-state-key-model/11-CONTEXT.md` — D-19/D-20 (this
  page/nav slot is THE surface; Phase 13 is tabs of it), D-21 (All-keys layout preserved),
  D-22 (read-only rule D-60 upholds), D-27 (UNPICKED pseudo-entries now in Keys waiting).
- `.planning/phases/12-ownership-dedup/12-CONTEXT.md` — D-39 (recommendation copy arrives
  in Phase 13 — D-64 fulfills it), D-41/D-42 (fuzzy badge + override that D-54 reuses),
  D-48 (keep-last-known ownership — view membership inherits it).
- `.planning/phases/10-humble-auth-adapter-scaffold/10-CONTEXT.md` — D-04 (disconnect-wipe
  exemption the D-59 copied-at store joins).
- `.planning/phases/12-ownership-dedup/12-REVIEW.md` — **WR-01..WR-04 open warnings** on
  the ownership matching this phase's views consume (falsy `steam_app_id` skips both
  tiers; numeric-sequel fuzzy false-positives; override inert while Steam disconnected;
  no undo-override UI). Accept-or-remediate is due before Phase 14, but planner should
  know Giftable Spares makes WR-02/WR-04 user-visible: a false-positive fuzzy match now
  files a key under "gift this away".

### Existing code (build on, don't rebuild)
- `src/frontend/screens/Humble/Keys/` — the page to grow tabs (`index.tsx`), row component
  (`components/HumbleKeyRow` — owned badge + D-42 override already render here),
  group component, `stateLabels.ts`.
- `src/common/humble/groupKeys.ts` — pure grouping/sorting helper (unit-tested); Phase 13
  adds view-filter/sort helpers in the same pure-function style.
- `src/common/humble/expirationDisplay.ts` — existing pure expiration-display logic the
  urgency-badge tiering should extend or sit beside.
- `src/common/types/humble.ts` — `HumbleKey` (has `ownedElsewhere`/`matchConfidence`;
  has NO gift-link field — D-57 research decides whether one is added), `HumbleSyncState`.
- `src/backend/humble/classify.ts` + `library.ts` — where a gift-link field would be
  captured during sync if the payload carries it; `__tests__/fixtures/tpks.ts` holds
  real-payload shapes (note `is_gift` there marks a *received* gift, not a gift link).
- `src/backend/humble/electronStores.ts` — store conventions for the D-59 copied-at store
  (REVEALED-flag store is the precedent).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Humble Keys page + context slice — tabs, counts, and both views filter the `humble.keys`
  data already pushed to the frontend; no new sync machinery.
- `HumbleKeyRow` — already renders state badge, platform/origin caption, owned badge,
  fuzzy override, and expiration text; Phase 13 extends it (urgency badge, spares-view
  action) rather than forking it.
- `groupAndSortKeys` / `getExpirationDisplay` pure helpers in `src/common/humble/` —
  the pattern for view-membership predicates and urgency-tier computation (unit-testable
  from the backend jest project).
- REVEALED-flag store + `humbleSetOwnershipOverride` IPC — precedents for the copied-at
  store and any new `humble:*` IPC (gift-link copy confirmation → persist).

### Established Patterns
- IPC via `addHandler()` typed in `AsyncIPCFunctions`/`FrontendMessages` for new
  `humble:*` channels (e.g. record-gift-copy).
- Semantic color tokens (`--status-*`) per Phase 7 tier→color precedent for badge tiers.
- All strings via `t()` with keys in the consumed namespace (WR-08 lesson).
- Route guard: page bounces to `humbleLoginPath` when not logged in — sub-routes inherit
  this.

### Integration Points
- Router: the single Humble Keys route becomes a parent route with three child routes
  (D-51); sidebar entry unchanged (D-20 slot is permanent).
- Phase 14 contract: `/humble/keys/spares` (or equivalent) is the C2 redirect target —
  the route path chosen here is consumed by Phase 14; record it in the plan/summary.
- Clipboard: use Electron's clipboard via the established API surface; the gift link must
  never transit logs (C4) — mirror the redacted-logging discipline from `adapter.ts`.

</code_context>

<specifics>
## Specific Ideas

- The two focused views are **recommendation surfaces**: Waiting = "Claim this",
  Spares = "keep as a giftable spare — do not redeem" (spec §2.3). The tab structure IS
  the recommendation; keep rows clean.
- **Giftable means UNREVEALED, full stop** — the moment a key is revealed the gift link
  is forfeit (spec §2.1). Membership predicates must never soften this.
- The dangerous error class carried over from Phase 12: a fuzzy false-positive now shows
  a needed key under "gift this away". The "Likely owned" badge + override on the spares
  row (D-54) are the mandatory safety valves — don't drop them from the spares rendering.
- Gift links are secrets (C4): treat like key values — never logged, never in full IPC
  debug payloads, clipboard-only exposure.
- No new Humble requests in this phase (D-57 fallback exists precisely to preserve this) —
  the views are pure computation over already-synced data, same spirit as Phase 12 dedup.

</specifics>

<deferred>
## Deferred Ideas

- **In-app gift-link generation** (if research confirms Humble requires a generate call):
  rejected for v0.3 as a C5-risk write endpoint; the deep-link fallback covers the need.
  Revisit only if Humble documents the endpoint or the passive field proves unavailable
  AND deep-linking proves too weak in practice.
- **WR-01..WR-04 accept-or-remediate decision** (from 12-REVIEW.md) — due before Phase 14
  per the Phase 12 close-out; not a Phase 13 deliverable, but WR-02 (numeric-sequel fuzzy
  false-positives) and WR-04 (no undo-override UI) become more visible once Giftable
  Spares ships. If remediation is chosen, WR-04's undo affordance would naturally live on
  the spares row.
- **"Remember last tab"** — rejected in favor of a fixed Keys-waiting default (D-50);
  could return as a preference later if users ask.

</deferred>

---

*Phase: 13-keys-waiting-giftable-spares-views*
*Context gathered: 2026-07-07*
