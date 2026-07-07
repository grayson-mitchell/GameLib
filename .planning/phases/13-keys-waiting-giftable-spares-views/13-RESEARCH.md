# Phase 13: Keys-Waiting + Giftable-Spares Views - Research

**Researched:** 2026-07-07
**Domain:** React/Electron frontend view composition over an already-synced local cache (no new network/API surface); client-side routing; clipboard/deep-link secrets handling
**Confidence:** HIGH

## Summary

Phase 13 is a pure-frontend, zero-new-package phase: two new filtered/sorted views ("Keys
waiting", "Giftable spares") plus the existing "All keys" list become three tabs of the same
route, backed entirely by data already in the `humble.keys` context slice (Phase 11/12 sync +
dedup). No new Humble HTTP calls of any kind are required or permitted (C5, D-57's "passive
only" mandate). The single genuinely new capability is the Giftable-Spares "gift" action —
and the decisive research finding of this phase is that **the assignment's central question
resolves negatively**: the cached Humble order-detail payload does **not** carry a usable
`gift_link` (or any constructible-from-cache equivalent). This was verified two ways — the
project's own `OrderDetailTpkSchema`/`classify.ts`/real-payload fixtures never reference such a
field, and a live-captured, production-scale fixture set from an actively-maintained community
integration (`UncleGoogle/galaxy-integration-humblebundle`, real API captures in
`tests/data/orders_keys.json`) shows every unrevealed Steam tpk with a rich field set and **no**
gift-link field, only a boolean `partial_gift_enabled` at the product level. D-57's rejected
branch — in-app gift-link *generation* — is corroborated as correctly rejected: Humble's own
website generates a one-time `humblebundle.com/gift?key=<token>` URL only when the user clicks
"Gift" on the order's web page, i.e. gift-link creation is itself a write action, never a field
sitting in `GET` order-detail data.

**Primary recommendation:** Build "Keys waiting" and "Giftable spares" as pure predicate+sort
functions over the existing `HumbleKey[]` (same style as `groupAndSortKeys`/
`getExpirationDisplay`), rendered through three **nested react-router child routes** under the
existing `/humble-keys` path (data router, `children` array + `<Outlet/>`, matching the
`lazy: makeLazyFunc(...)` convention already used for every other top-level route). The
Giftable-Spares gift action is a **"Gift on Humble" deep-link** (`shell.openExternal()` to
`https://www.humblebundle.com/home/keys`, the confirmed real Keys & Entitlements page — a
gamekey-scoped `?key=` deep link is plausible but unverified, see Open Questions), gated behind
the existing `showDialogModal` confirmation-dialog pattern, persisting a per-key "gifted-at"
timestamp in a new `CacheStore` sibling to `humbleRevealedStore`/`humbleOwnershipOverrideStore`
(never wiped on disconnect, per D-04/D-59's own framing).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| View filtering/sorting (Keys waiting, Giftable spares membership) | Frontend (pure `common/humble/*` helper) | — | Same tier as existing `groupAndSortKeys`; zero I/O, unit-testable, no backend round-trip needed since `humble.keys` is already in the renderer's context |
| Tab routing / active-tab state | Frontend Server-equivalent (Electron renderer router) | — | react-router-dom v6.30 data router already owns all navigation; Phase 14's C2 redirect target is a route, not new state |
| Urgency badge computation (day-count tiers) | Frontend (pure `common/humble/*` helper) | — | Same "day math, no library" convention as `expirationDisplay.ts`/`formatRelativeTime` |
| Gift-link availability check | Backend (adapter/classify layer — read-only, already-synced field) | Frontend (per-row branch: copy vs. deep-link) | Confirmed: no field exists to check. Decision collapses to a single, phase-wide "always deep-link" branch, not a per-row mixed-availability check |
| Gift action (deep-link open) | Frontend (Electron `shell.openExternal`) | Backend (existing generic IPC bridge, if a dedicated channel is added) | Mirrors existing `steam://rungameid` launch pattern — a thin external-open call, no Humble API involved |
| Copied/gifted-at persistence | Backend (`electron-store` via `CacheStore`) | — | Same tier as `humbleRevealedStore`/`humbleOwnershipOverrideStore` — must survive disconnect (D-04 exemption family) |
| Confirmation dialog (irreversibility warning) | Frontend (existing global `showDialogModal` + `ContextProvider`) | — | Established app-wide pattern (`GameCard`'s edit/uninstall dialogs); no new dialog primitive needed |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HVIEW-01 | "Keys waiting" view lists unowned + unredeemed keys, sorted by expiration urgency then title | D-53/D-56 membership+sort rules confirmed implementable as a pure filter+comparator over the existing `HumbleKey[]`/`groupAndSortKeys` pattern; `byExpiringSoonest` comparator already exists and needs only a title-tiebreak extension (see Code Examples) |
| HVIEW-02 | "Giftable spares" view lists owned-elsewhere + UNREVEALED keys, exposes/copies the Humble gift link | D-57 research (this phase) conclusively resolves to the **deep-link fallback branch**: no passively-cached gift link exists anywhere in the payload (verified against real captures); "Gift on Humble" deep-link + confirmation dialog + gifted-at persistence is the only C5-compliant path |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> Numbering continues from Phase 12 (D-35..D-48) to keep v1.2 decision IDs unambiguous.

**Tab structure & navigation**
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

**View membership rules**
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

**Gift-link mechanics (HVIEW-02)**
- **D-57 (cached-first, deep-link fallback):** Researcher must verify whether the already-
  cached order-detail payload carries a usable gift URL (or one constructible from
  `gamekey`/tpk fields) **passively — no new write-style Humble API calls, ever** (C5).
  - If passively obtainable → one-click **"Copy gift link"** straight from cache.
  - If not → the row's action becomes **"Gift on Humble"**, deep-linking to the Humble
    order page where the user gifts manually.
  In-app gift-link *generation* via an undocumented write endpoint is **rejected** — that
  is the exact risk class that got Lutris locked out, and generation may itself convert
  the key.

  > **RESOLVED by this research: the fallback branch applies.** See Summary and the
  > Gift-Link Mechanics section below.
- **D-58:** **Confirmation dialog on every copy** — states the consequence ("anyone with
  this link can claim the key; once redeemed it's gone for good") before writing to the
  clipboard. No "don't ask again". Same friction philosophy as Phase 14's C1 per-key
  reveal warning.

  > Since D-57 resolved to deep-link (no clipboard write occurs), this decision's
  > *intent* — friction + explicit irreversibility warning before the gift action fires —
  > still applies; only the literal "before writing to the clipboard" mechanic changes to
  > "before opening the external Humble page." See Common Pitfalls.
- **D-59:** A successful copy persists a **per-key copied-at timestamp** (keyed by
  `machineName`, joining the D-04 disconnect-wipe exemption alongside REVEALED flags and
  overrides) and renders a subtle "gift link copied {date}" annotation on the row —
  guards against double-gifting the same key.

  > Reinterpreted per the D-57 resolution: the timestamp marks "opened Humble's gift page
  > for this key," not "copied a link" — same guard-rail intent (avoid double-gifting),
  > different trigger event and row copy ("Opened Humble gift page {date}" or similar;
  > exact copy is Claude's discretion per CONTEXT.md).
- **D-60:** The gift action (copy or deep-link) **exists only in the Giftable spares
  view**. All-keys rows remain D-22 read-only (the D-42 override stays the sole
  exception). Phase 14's C2 redirect gets a single actionable destination.

**Urgency badge & recommendation copy**
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

  > Research resolves this discretion item too: there is no mixed availability — the
  > check is phase-wide (never available), so a single, uniform "Gift on Humble" action
  > applies to every Giftable-Spares row. No per-row branching logic is needed.

### Deferred Ideas (OUT OF SCOPE)
- **In-app gift-link generation** (if research confirms Humble requires a generate call):
  rejected for v1.2 as a C5-risk write endpoint; the deep-link fallback covers the need.
  Revisit only if Humble documents the endpoint or the passive field proves unavailable
  AND deep-linking proves too weak in practice.

  > This research confirms the passive field is unavailable — the deep-link fallback is
  > now load-bearing, not merely a contingency.
- **WR-01..WR-04 accept-or-remediate decision** (from 12-REVIEW.md) — due before Phase 14
  per the Phase 12 close-out; not a Phase 13 deliverable, but WR-02 (numeric-sequel fuzzy
  false-positives) and WR-04 (no undo-override UI) become more visible once Giftable
  Spares ships. If remediation is chosen, WR-04's undo affordance would naturally live on
  the spares row.
- **"Remember last tab"** — rejected in favor of a fixed Keys-waiting default (D-50);
  could return as a preference later if users ask.
</user_constraints>

## Standard Stack

### Core

No new runtime dependencies. Every capability in this phase is covered by packages already
installed and used elsewhere in the codebase:

| Library | Version | Purpose | Why Standard (already in project) |
|---------|---------|---------|--------------|
| react-router-dom | ^6.30.0 [VERIFIED: package.json] | Nested tab sub-routes (D-51) | Already the app's data router (`createBrowserRouter`); supports `children` arrays + `<Outlet/>` for exactly this parent/tab-route shape |
| Electron `shell.openExternal` / `clipboard` | built-in (Electron, version pinned by project) | "Gift on Humble" deep-link open | Same primitive already used for `steam://rungameid` launches and the existing `clipboardWriteText` IPC listener |
| electron-store (via `CacheStore`/`TypeCheckedStoreBackend`) | ^8.2.0 [ASSUMED — carried from Phase 10 CLAUDE.md tech-stack record, not re-verified this session] | Persist gifted-at timestamp | Identical pattern to `humbleRevealedStore`/`humbleOwnershipOverrideStore` in `src/backend/humble/electronStores.ts` |
| react-i18next | already in project | All new UI strings | Existing `t()` + consumed-namespace convention (`public/locales/en/translation.json`, `humbleKeys.*` key prefix) |

**No installation required.**

### Supporting

Not applicable — no supporting libraries beyond the Core table are needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nested react-router child routes for tabs | The existing `TabPanel` component (`src/frontend/components/UI/TabPanel`) | `TabPanel` is a non-routed, in-memory tab switcher used elsewhere (GamePage, Settings). D-51 explicitly locks in **real sub-routes** so Phase 14's C2 guard can `navigate()` to a URL and back/forward + deep-linking work for free — `TabPanel` would not satisfy this locked decision. Do not use it here. |
| Deep-link "Gift on Humble" fallback | In-app gift-link generation via an undocumented endpoint | Rejected outright by C5/D-57 — confirmed by this research to be the *only* way to get a gift link at all (Humble's own site calls a write endpoint when the user clicks "Gift"), which is precisely the risk class the phase forbids |

**Version verification:** No new packages to verify. `react-router-dom` version confirmed
directly from `package.json` (`^6.30.0`) — no registry lookup needed since it is already
installed and in active use elsewhere in the same codebase.

## Package Legitimacy Audit

**Not applicable — this phase installs zero new packages.** Every capability (routing,
clipboard/external-open, local persistence, i18n) is covered by dependencies already present
and already exercised in Phase 10–12 code. The Package Legitimacy Gate protocol is skipped;
no `slopcheck`/registry verification is required.

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages proposed).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer: /humble-keys (parent route)                               │
│                                                                       │
│  ContextProvider.humble.keys ──▶ (already synced, Phase 11/12)      │
│                     │                                                 │
│                     ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Pure view helpers (src/common/humble/*)                     │   │
│   │  - selectKeysWaiting(keys)   [D-53 predicate + D-56 sort]    │   │
│   │  - selectGiftableSpares(keys)[D-54/D-55 predicate]           │   │
│   │  - getUrgencyTier(state, expiration, now) [D-61/D-63]        │   │
│   └───────────────┬───────────────────────┬───────────────────────┘ │
│                    │                       │                         │
│         ┌──────────▼─────────┐   ┌─────────▼──────────┐             │
│         │ /waiting (default) │   │ /spares             │  /all      │
│         │ HVIEW-01            │   │ HVIEW-02            │  (D-21,   │
│         │ header blurb (D-64) │   │ header blurb (D-64) │  unchanged)│
│         │ HumbleKeyRow + badge│   │ HumbleKeyRow + badge│             │
│         │ (read-only, D-22)   │   │ + "Gift on Humble"  │             │
│         │                     │   │   action (D-60)     │             │
│         └─────────────────────┘   └──────────┬──────────┘             │
│                                               │ onClick                │
│                                    ┌──────────▼──────────┐             │
│                                    │ showDialogModal      │             │
│                                    │ (D-58 warning)        │             │
│                                    └──────────┬──────────┘             │
│                                               │ confirm                │
│                                    ┌──────────▼──────────┐             │
│                                    │ shell.openExternal   │             │
│                                    │ humblebundle.com/    │             │
│                                    │ home/keys            │             │
│                                    └──────────┬──────────┘             │
│                                               │ IPC (fire-and-forget)  │
└───────────────────────────────────────────────┼────────────────────────┘
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │ Backend: new CacheStore       │
                                  │ humbleGiftedAtStore            │
                                  │ (keyed by machineName,         │
                                  │ never wiped on disconnect)     │
                                  └─────────────────────────────┘
```

### Recommended Project Structure

```
src/common/humble/
├── groupKeys.ts               # existing — unchanged (All keys tab)
├── expirationDisplay.ts       # existing — unchanged (per-row expiration text)
├── viewFilters.ts             # NEW — selectKeysWaiting / selectGiftableSpares (D-53/54/55/56)
└── urgencyBadge.ts            # NEW — getUrgencyTier (D-61/62/63), pure day-math like expirationDisplay.ts

src/frontend/screens/Humble/Keys/
├── index.tsx                  # becomes the parent route: tab nav + <Outlet/>, or a thin layout wrapper
├── index.css
├── stateLabels.ts             # existing — unchanged
├── components/
│   ├── HumbleKeyGroup/        # existing — reused by the "All keys" child route unchanged
│   ├── HumbleKeyRow/          # existing — extended with urgency badge + optional gift action prop
│   └── UrgencyBadge/          # NEW — small presentational component (D-61/62/63)
├── Waiting/
│   └── index.tsx              # NEW — HVIEW-01 child route
├── Spares/
│   └── index.tsx              # NEW — HVIEW-02 child route, owns the gift action + confirm dialog
└── All/
    └── index.tsx              # NEW — thin wrapper re-rendering the unchanged D-21 grouped list

src/backend/humble/
├── electronStores.ts          # extended — add humbleGiftedAtStore (sibling to humbleRevealedStore)
└── ipc_handler.ts             # extended — add e.g. humbleRecordGiftLinkOpened handler
```

### Pattern 1: Nested tab sub-routes with a locked default redirect

**What:** Parent route owns the tab shell (nav + counts), an index redirect sends `/humble-keys`
to `/humble-keys/waiting` (D-50), and each tab is a real child route.
**When to use:** Any time a locked decision requires deep-linkable, back-button-safe tabs (D-51)
— this is exactly the shape Phase 14's C2 guard needs (`navigate('/humble-keys/spares')`).
**Example:**
```typescript
// Source: pattern derived from existing src/frontend/App.tsx route table
// (createBrowserRouter + `lazy: makeLazyFunc(...)`), extended with `children`.
{
  path: 'humble-keys',
  lazy: makeLazyFunc(import('./screens/Humble/Keys')), // parent: tab nav + <Outlet/>
  children: [
    { index: true, element: <Navigate to="waiting" replace /> }, // D-50
    { path: 'waiting', lazy: makeLazyFunc(import('./screens/Humble/Keys/Waiting')) },
    { path: 'spares', lazy: makeLazyFunc(import('./screens/Humble/Keys/Spares')) },
    { path: 'all', lazy: makeLazyFunc(import('./screens/Humble/Keys/All')) }
  ]
}
```

### Pattern 2: Pure predicate + comparator view helpers (no React, no I/O)

**What:** Mirror `groupAndSortKeys`'s existing shape — filter/sort functions taking `HumbleKey[]`
and returning `HumbleKey[]`, unit-testable from the backend jest project with zero mocking.
**When to use:** Any new view-membership or sort rule derived purely from already-synced fields.
**Example:**
```typescript
// Source: pattern extends src/common/humble/groupKeys.ts's byExpiringSoonest
import { HumbleKey } from '../types/humble'

const WAITING_STATES = new Set(['UNPICKED', 'UNREVEALED', 'REVEALED'])

// D-56: dated keys soonest-first, then undated keys alphabetically by title —
// a single list, no section headers (unlike groupAndSortKeys's grouped output).
function compareWaiting(a: HumbleKey, b: HumbleKey): number {
  if (a.expiration !== null && b.expiration !== null) {
    return new Date(a.expiration).getTime() - new Date(b.expiration).getTime()
  }
  if (a.expiration !== null) return -1
  if (b.expiration !== null) return 1
  return a.title.localeCompare(b.title)
}

export function selectKeysWaiting(keys: HumbleKey[]): HumbleKey[] {
  return keys
    .filter((k) => !k.ownedElsewhere && WAITING_STATES.has(k.state))
    .sort(compareWaiting)
}

// D-54/D-55: owned-elsewhere AND UNREVEALED only — REVEALED-but-owned keys
// stay out (spec §2.1: reveal forfeits the gift link, so they belong in
// All keys only per D-55).
export function selectGiftableSpares(keys: HumbleKey[]): HumbleKey[] {
  return keys.filter((k) => k.ownedElsewhere && k.state === 'UNREVEALED')
}
```

### Pattern 3: Confirmation-gated external action via existing global dialog

**What:** Reuse `showDialogModal`/`DialogModalOptions` (already used by `GameCard` for
edit/uninstall confirmations) instead of building a new dialog primitive.
**When to use:** D-58's "confirmation dialog on every [gift action]" requirement.
**Example:**
```typescript
// Source: pattern from src/frontend/screens/Library/components/GameCard/index.tsx
// (showDialogModal usage) + src/frontend/types.ts DialogModalOptions/ButtonOptions
showDialogModal({
  showDialog: true,
  title: t('humbleKeys.giftConfirmTitle', 'Gift this key?'),
  message: t(
    'humbleKeys.giftConfirmBody',
    'Anyone with this link can claim the key; once redeemed it is gone for good.'
  ),
  buttons: [
    {
      text: t('button.cancel', 'Cancel'),
      onClick: () => showDialogModal({ showDialog: false })
    },
    {
      text: t('humbleKeys.giftConfirmAction', 'Open Humble'),
      onClick: () => {
        window.api.humbleRecordGiftLinkOpened(humbleKey.machineName)
        window.api.openExternalUrl('https://www.humblebundle.com/home/keys') // exact IPC name TBD by planner
        showDialogModal({ showDialog: false })
      }
    }
  ]
})
```

### Anti-Patterns to Avoid
- **Per-row "copy vs. deep-link" branching:** the mixed-availability discretion item in
  CONTEXT.md is moot — research shows the gift-link field is *never* available (not
  "available for some keys"), so a single phase-wide "Gift on Humble" action is correct;
  building per-row availability-detection logic would be speculative complexity with no
  data path that could ever populate the "available" branch.
- **Forking `HumbleKeyRow` per tab:** CONTEXT.md's `<code_context>` explicitly directs
  extending the existing row component (urgency badge prop, optional gift-action prop),
  not creating three separate row renderers — keeps the D-22 read-only rule and the D-42
  override enforced in exactly one place.
- **Treating `matchConfidence: 'fuzzy'` overrides as already having an undo affordance:**
  WR-04 (Phase 12 review) is still open — do not assume the override is reversible in the
  UI; if the plan wants to add undo, that is new scope, not a Phase 13 given.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative "days left" countdown text | A new date-diff/formatting utility from scratch | The existing vanilla-`Date`-math convention already used by `formatRelativeTime` (`HumbleKeys/index.tsx`) and `extractExpiration`/`getExpirationDisplay` (`common/humble/`) | The codebase deliberately has **no date library dependency** (no date-fns/dayjs/moment in package.json) — this is an established, intentional convention, not an oversight. Adding a date library for this phase would be scope creep and inconsistent with sibling code |
| Tab UI shell | A new tab-bar component library | Semantic-token-styled native buttons/links + react-router `NavLink`, matching the existing `--status-*` token convention (Phase 7) | The project has zero UI-kit dependency for tabs; `TabPanel` exists for non-routed cases but D-51 requires real routes, so a thin custom nav bar over `<NavLink>` is the right level of "build," not a full library |
| Confirmation modal | A new modal/dialog component | `showDialogModal` + `DialogModalOptions` (global `ContextProvider` state) | Already used for exactly this class of action (edit-game, uninstall confirmations) elsewhere in `GameCard` |
| Local secret-adjacent persistence | A bespoke JSON file / raw `fs` writes | `CacheStore` (thin wrapper already used by `humbleRevealedStore`/`humbleOwnershipOverrideStore`) | Same electron-store-backed pattern, same disconnect-survival semantics needed for D-59's gifted-at timestamp |

**Key insight:** Every "don't hand-roll" item in this phase resolves to "reuse the sibling
pattern already in `src/common/humble/` or `src/backend/humble/electronStores.ts`" — Phase 13
is architecturally a *composition* phase, not a phase that introduces new infrastructure.

## Common Pitfalls

### Pitfall 1: Assuming D-57's "cached-first" branch without re-verifying against THIS project's actual payload
**What goes wrong:** A planner or implementer sees `HUMBLE-SPEC-SOURCE.md` §2.4 say
`gift_link (if unrevealed)` and assumes the field exists, builds a "Copy gift link" button,
ships it, and it silently does nothing (or crashes on `undefined`) for every real user.
**Why it happens:** The spec source document is aspirational/undocumented-API grounding, not a
confirmed schema — the same document's own §Appendix A opens with "No official public API...
undocumented and may change without notice." Multiple other fields in this exact spec
(`expiration`, `redeemed_key_value`) were already proven wrong by live-UAT rounds 3-4 and
required tolerant multi-candidate extraction in `classify.ts`.
**How to avoid:** This research already resolved the question — treat it as settled (deep-link
fallback, not cached copy) rather than re-litigating it per-plan. If a future live sync ever
surfaces an actual gift-link-shaped field, that is new information requiring a fresh decision,
not a retroactive assumption.
**Warning signs:** Any task description that says "read `HumbleKey.giftLink`" — no such field
should be added to the `HumbleKey` type in this phase; there is nothing to read.

### Pitfall 2: D-58/D-59's literal "clipboard" wording driving the wrong IPC shape
**What goes wrong:** Implementer builds a `clipboardWriteText`-based flow per D-58's literal
text ("before writing to the clipboard") when the actual action is `shell.openExternal` (no
clipboard write happens at all in the resolved deep-link branch).
**Why it happens:** D-58/D-59 were written before this research resolved D-57; their literal
mechanics (copy → clipboard → "copied at" annotation) describe the *rejected* alternative
branch.
**How to avoid:** Preserve the *intent* (confirm-before-irreversible-action, timestamp to guard
against double-gifting) but implement against the deep-link mechanic: confirm → `openExternal`
→ persist "opened-at" → row shows "Opened Humble gift page {date}" (exact copy is Claude's
discretion per CONTEXT.md).
**Warning signs:** A task titled "wire clipboard write for gift link" — should instead be
"wire external-open for Gift on Humble action."

### Pitfall 3: Losing the D-42/D-54 safety valve when building the Spares row
**What goes wrong:** The Spares view is built as a stripped-down/new row renderer that drops the
"Likely owned on Steam" badge and "Not the same game" override to keep the UI clean, silently
making a fuzzy false-positive un-recoverable from that view.
**Why it happens:** The gift action is new UI real estate on the row; a naive implementation
might replace the badge+override area to make room.
**How to avoid:** Per CONTEXT.md `<specifics>`, the override is the "mandatory safety valve" —
extend `HumbleKeyRow`, don't replace it. The override button must render on every fuzzy-matched
Spares row exactly as it does today.
**Warning signs:** A Spares-specific row component that doesn't import/reuse `HumbleKeyRow`.

### Pitfall 4: All-keys tab regressing D-21/D-22 during the router refactor
**What goes wrong:** Converting the single-page component into a parent+children route
structure accidentally changes the "All keys" grouped-list rendering (spacing, group order,
collapse defaults) because the refactor touches the same file.
**Why it happens:** `HumbleKeys/index.tsx` currently *is* the All-keys view; splitting it into
a parent-shell + 3 children means the All-keys JSX has to move somewhere, and a careless move
can drop props/behavior.
**How to avoid:** Move the existing render body verbatim into a new `All/index.tsx` child
route component; the parent `index.tsx` becomes ONLY the tab nav + `<Outlet/>` + the
sync-status header (refresh button, cooldown banner, last-synced text) — decide whether that
header is shared across all 3 tabs (likely yes, since sync state is view-independent) or
duplicated.
**Warning signs:** A diff that touches `HumbleKeyGroup`/`HumbleKeyRow`'s existing group-order
or collapse-default logic "as part of" this phase — that logic is explicitly locked by D-21 and
out of scope here.

### Pitfall 5: Forgetting the gifted-at store needs the SAME disconnect exemption as REVEALED/override stores
**What goes wrong:** New `humbleGiftedAtStore` gets wired into the generic disconnect-wipe path
(the `wipeSteps` loop in `user.ts` that clears `humbleLibraryStore`/`humbleSyncStore`), silently
erasing the double-gift guard on every reconnect.
**Why it happens:** It's easy to add a new store to the "clear everything on disconnect" loop by
habit, since most Humble stores in this codebase ARE wiped on disconnect.
**How to avoid:** `user.ts`'s disconnect method has an explicit, commented carve-out list
(`humbleRevealedStore`, `humbleOwnershipOverrideStore`) — the new store must be added to that
same carve-out, with a matching comment explaining why (mirrors existing D-04/D-42/D-43
reasoning verbatim).
**Warning signs:** `humbleGiftedAtStore` appearing inside the `wipeSteps` array instead of the
comment block below it.

## Code Examples

### Urgency tier computation (D-61/62/63)
```typescript
// Source: pattern extends src/common/humble/expirationDisplay.ts's pure-function style
import { HumbleKeyState } from '../types/humble'

export type UrgencyTier = 'danger' | 'warning' | null

const BADGE_ELIGIBLE_STATES = new Set<HumbleKeyState>([
  'UNPICKED',
  'UNREVEALED',
  'REVEALED'
])

const MS_PER_DAY = 86_400_000

// D-61: no badge beyond 30 days; REDEEMED/UNREDEEMABLE never badge (D-63).
export function getUrgencyTier(
  state: HumbleKeyState,
  expiration: string | null,
  now: Date = new Date()
): UrgencyTier {
  if (!BADGE_ELIGIBLE_STATES.has(state) || expiration === null) {
    return null
  }
  const daysLeft = (new Date(expiration).getTime() - now.getTime()) / MS_PER_DAY
  if (daysLeft < 0) return null // already past — classify.ts would have made this UNREDEEMABLE
  if (daysLeft <= 7) return 'danger'
  if (daysLeft <= 30) return 'warning'
  return null
}
```

### Real cached tpk shape for an UNREVEALED Steam key (proves no gift field exists)
```json
// Source: UncleGoogle/galaxy-integration-humblebundle tests/data/orders_keys.json
// (real, live-captured API response — machine_name/steam_app_id/gamekey redacted-shape
// example only; this is what an unrevealed Steam tpk actually contains)
{
  "machine_name": "torchlight_steam",
  "gamekey": "hTzqNWHeqNpnGFrk",
  "key_type": "steam",
  "key_type_human_name": "Steam",
  "steam_app_id": "41500",
  "human_name": "Torchlight",
  "direct_redeem": false,
  "disclaimer": "Steam will not provide extra giftable copies of games you already own."
  // no redeemed_key_val -> UNREVEALED
  // NO gift_link / gift_url / giftable field anywhere on this object
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Single flat `HumbleKeys` page (D-19/D-21 grouped list, no routing within the page) | Parent route + 3 child sub-routes (tabs), default redirect to Waiting | This phase (D-49/D-50/D-51) | Phase 14's C2 guard becomes a plain `navigate()` call to a real URL instead of needing new in-page state plumbing |
| `HUMBLE-SPEC-SOURCE.md` §2.4's assumed `gift_link` field | Confirmed absent from the real payload; deep-link-only gift mechanic | This phase (D-57 research resolution) | `HumbleKey` type gains NO new gift-link field; the Giftable-Spares action is a single uniform external-open, not a per-row cached-value read |

**Deprecated/outdated:** N/A — no prior implementation of gift-link handling exists to
deprecate; this is greenfield within an established page.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The generic "Gift on Humble" deep-link target should be `https://www.humblebundle.com/home/keys` (the confirmed Keys & Entitlements page) rather than a per-order URL | Summary, Pattern 3, Code Examples | Low — worst case the user lands on their full key list instead of the specific order and has to find the key manually; no security/data-integrity impact |
| A2 | A per-order deep link of the shape `https://www.humblebundle.com/downloads?key={gamekey}` may exist and would be a better UX (jumps straight to the right order) | Open Questions | Low — this is a UX nicety, not load-bearing; only two independent WebSearch mentions found it, neither an official/authoritative source, so it is NOT recommended as the primary target without a quick manual check |
| A3 | electron-store version `^8.2.0` is still accurate for this phase's new `CacheStore` sibling | Standard Stack | Low — inherited from the CLAUDE.md tech-stack record (Phase 10), not re-verified this session; even if the version drifted, the existing `electronStores.ts` pattern is version-agnostic to this phase's usage |
| A4 | Exact weeks/hours phrasing thresholds for D-62's countdown copy (e.g., "2 weeks left" vs. "14 days left") are undetermined and left to planner/implementer discretion per CONTEXT.md | Common Pitfalls, User Constraints (Claude's Discretion) | Low — cosmetic copy decision, explicitly delegated by CONTEXT.md |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Does `https://www.humblebundle.com/downloads?key={gamekey}` reliably deep-link to a
   specific order's Keys & Entitlements row (vs. the generic `/home/keys` list)?**
   - What we know: Two independent, non-authoritative WebSearch results reference this URL
     shape in the context of Humble order/download pages; it is architecturally plausible
     (matches the `?key=` query-param convention Humble uses elsewhere, e.g. the gift-token
     URL `humblebundle.com/gift?key=<token>`).
   - What's unclear: Whether the page still requires the user to scroll/search once landed,
     whether it 404s for very old orders, and whether it requires being logged in via the
     regular browser session (it should, since gifting always requires being logged in on
     humblebundle.com regardless of GameLib's own session).
   - Recommendation: Ship the safe, confirmed `https://www.humblebundle.com/home/keys` as the
     deep-link target for v1.2. If a later plan wants the per-order convenience link, gate it
     behind a `checkpoint:human-verify` task (open the URL once manually with a real gamekey)
     rather than trusting it silently.
2. **Should the sync-status header (refresh button, last-synced text, error banner) be shared
   across all three tabs, or per-tab?**
   - What we know: The data (`humble.syncing`, `humble.syncedAt`, `humble.syncError`) is
     view-independent — it describes the whole library, not a specific tab's contents.
   - What's unclear: Whether CONTEXT.md's "Claude's Discretion" for "tab component
     construction" is meant to cover this too, or whether it's assumed shared without saying so.
   - Recommendation: Render it once in the parent route (above the tab nav or above the
     `<Outlet/>`), not duplicated per child route — avoids triplicated event-listener wiring
     for `handleHumbleSyncProgress`/`handleHumbleSyncStateChanged`.
3. **Does the existing `showDialogModal`/`DialogModalOptions` global pattern support the "no
   'don't ask again'" requirement (D-58) out of the box?**
   - What we know: `DialogModalOptions` has no persisted-preference field visible in
     `types.ts`; it's a stateless "show now" call each time.
   - What's unclear: Whether any wrapping component elsewhere in the codebase adds a
     "don't show again" checkbox pattern that a future contributor might reflexively add here.
   - Recommendation: Explicitly do NOT add a "don't ask again" checkbox/localStorage flag to
     this dialog invocation — D-58 is unambiguous ("No 'don't ask again'").

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest [VERIFIED: package.json] |
| Config file | `jest.config.js` (`projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend']`) |
| Quick run command | `pnpm test -- src/backend/humble/__tests__/viewFilters.test.ts src/backend/humble/__tests__/urgencyBadge.test.ts` |
| Full suite command | `pnpm test` (or `pnpm test:ci` for CI-parity, `--runInBand --silent`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HVIEW-01 | `selectKeysWaiting` membership (D-53: `!ownedElsewhere` + state ∈ {UNPICKED,UNREVEALED,REVEALED}) | unit | `pnpm test -- viewFilters.test.ts -t "selectKeysWaiting"` | ❌ Wave 0 |
| HVIEW-01 | `selectKeysWaiting` sort (D-56: dated soonest-first, then undated alphabetical) | unit | `pnpm test -- viewFilters.test.ts -t "sort"` | ❌ Wave 0 |
| HVIEW-02 | `selectGiftableSpares` membership (D-54/D-55: `ownedElsewhere` + state === UNREVEALED only, REVEALED excluded) | unit | `pnpm test -- viewFilters.test.ts -t "selectGiftableSpares"` | ❌ Wave 0 |
| HVIEW-01/02 | `getUrgencyTier` tiering (D-61/62/63: ≤7d danger, ≤30d warning, no badge beyond/REDEEMED/UNREDEEMABLE never) | unit | `pnpm test -- urgencyBadge.test.ts` | ❌ Wave 0 |
| HVIEW-01/02 | Tab route renders correct child, default redirects to `waiting` (D-50/D-51) | integration (React Testing Library, if used elsewhere in this codebase's frontend project — verify convention in an existing `screens/*/__tests__` dir before assuming) | manual/integration — planner to confirm existing frontend test convention | ❌ Wave 0 (confirm framework choice first) |
| HVIEW-02 | Gift confirmation dialog blocks the external-open until confirmed; gifted-at timestamp persists and survives a simulated disconnect | unit (backend: store persistence + disconnect carve-out) + manual (renderer dialog interaction) | `pnpm test -- humbleGiftedAtStore` (name TBD) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `pnpm test -- <file>` for the touched pure helper
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/backend/humble/__tests__/viewFilters.test.ts` — covers HVIEW-01/HVIEW-02 membership+sort (mirrors existing `groupKeys.test.ts` structure/fixtures)
- [ ] `src/backend/humble/__tests__/urgencyBadge.test.ts` — covers D-61/62/63 tiering (mirrors `expirationDisplay.test.ts`)
- [ ] A test for the new `humbleGiftedAtStore` disconnect-survival carve-out, following `electronStores.test.ts`'s existing pattern
- [ ] Confirm whether the frontend jest project (`src/frontend`) has any existing React-Testing-Library-based route/component test to model the tab-routing test on, or whether that verification stays manual for this phase — **check before planning a specific automated command** (this research did not locate one; do not assume RTL is configured without confirming)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth surface — this phase reads only the already-authenticated `humble.keys` cache |
| V3 Session Management | No | No session handling changes |
| V4 Access Control | No | No new privilege boundary; the D-42 override IPC already validates server-side (`matchConfidence !== 'fuzzy'` rejection in `ipc_handler.ts`) and is unchanged by this phase |
| V5 Input Validation | Yes | The gamekey/machineName values driving any future per-order deep-link URL construction (Open Question 1) MUST be `encodeURIComponent`-escaped before interpolation into a URL — mirror the existing `adapter.ts` precedent (`encodeURIComponent(gamekey)` in `getOrderDetail`) rather than trusting the cached string is URL-safe |
| V6 Cryptography | No | No new cryptographic material; no gift-link secret is ever generated or stored by GameLib in this phase (the deep-link resolution means GameLib never possesses a gift-link value at all) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malicious/drifted `gamekey` or `machineName` string (from a compromised or buggy sync) injected into a constructed deep-link URL, altering navigation target or breaking out of the intended URL structure | Tampering | `encodeURIComponent()` on every interpolated value before building any `https://www.humblebundle.com/...?key=...` URL — never string-concatenate raw cached fields into a URL (same discipline `adapter.ts` already applies to outbound Humble requests) |
| Logging a gifted-at IPC call with the full gamekey/machineName in a way that becomes sensitive metadata over time (correlatable with which games a user owns elsewhere) | Information Disclosure | Continue the existing C4/T-10-01 discipline: log counts/booleans, not raw identifiers, in any new log line this phase adds (mirrors `describeSchemaFailure`'s redaction style) |
| A future "available gift link" field accidentally landing in a generic/telemetry-adjacent log or IPC debug payload if Humble's API ever starts returning one | Information Disclosure | Not applicable to THIS phase (no such field exists to leak) — but the `HumbleKey` type comment convention (C4 warnings already present in `common/types/humble.ts`) should be extended with the same warning if a `giftLink` field is ever added in a future phase |

## Sources

### Primary (HIGH confidence)
- Project source (this repo): `src/backend/humble/adapter.ts`, `classify.ts`,
  `electronStores.ts`, `ipc_handler.ts`, `__tests__/fixtures/tpks.ts`, `common/types/humble.ts`,
  `common/humble/groupKeys.ts`, `common/humble/expirationDisplay.ts`,
  `frontend/screens/Humble/Keys/*`, `frontend/App.tsx`, `frontend/types.ts` — read directly this
  session to confirm current state, IPC surface, and confirm no `gift_link` field exists anywhere
  in the codebase's own schema/classification/fixture layers.
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — §2.1-2.4, F4/F6, C1-C6, Appendix A (read this
  session).
- `.planning/phases/{11,12}-*/{11,12}-CONTEXT.md`, `12-REVIEW.md` — prior-phase locked decisions
  (D-19/20/21/22/27, D-39/41/42/48, WR-01..04) read this session.
- `package.json` — `react-router-dom` `^6.30.0` confirmed directly.

### Secondary (MEDIUM confidence)
- [UncleGoogle/galaxy-integration-humblebundle](https://github.com/UncleGoogle/galaxy-integration-humblebundle) —
  `tests/data/orders_keys.json`, real live-captured API response fixtures, fetched and parsed
  directly this session (`python3 -c "json.load(...)"`) — confirms zero `gift_link`-family field
  on any tpk, only `partial_gift_enabled` (a boolean) at product level. An actively-used,
  independent community integration's ground-truth capture is stronger evidence than any single
  documentation source for an undocumented API.
- [BeevMan/HumbleBundle-Keys-Clipboard](https://github.com/BeevMan/HumbleBundle-Keys-Clipboard) —
  `README.md` and `scripts/APIscript.js` fetched this session; confirms
  `https://www.humblebundle.com/home/keys` as the real, user-facing Keys & Entitlements page URL,
  and confirms the `/api/v1/user/order` + `/api/v1/order/{gamekey}?all_tpkds=true` endpoint
  shapes independently match this project's own `adapter.ts`.
- [Hayden Schiff's Humble Bundle API docs](https://www.schiff.io/projects/humble-bundle-api/) —
  fetched this session; documents `is_giftee` as the only gift-related field it lists, no
  `gift_link`.

### Tertiary (LOW confidence)
- WebSearch results (not independently fetched/verified) referencing
  `https://www.humblebundle.com/downloads?key={gamekey}` as a per-order page URL and
  `https://www.humblebundle.com/gift?key=<token>` as the shape of a Humble-generated gift link —
  plausible and directionally consistent with confirmed Humble URL conventions, but not
  confirmed against an official source or a live request this session. Flagged in Open
  Questions / Assumptions Log for a quick manual check before being relied upon as a specific
  deep-link target.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every capability maps to an already-in-use,
  already-verified dependency in this exact codebase.
- Architecture: HIGH — nested react-router routes are a standard, well-documented v6.4+ data
  router pattern already exercised elsewhere in this app's route table; pure-filter-helper
  pattern is a direct, low-risk extension of `groupAndSortKeys`.
- Gift-link mechanics (D-57 resolution): HIGH — corroborated by (a) this project's own
  three-layer schema/classify/fixture code never referencing such a field despite multiple
  live-UAT rounds specifically hunting for undocumented field names, and (b) an independent,
  actively-maintained community integration's real captured API payloads showing the same
  absence.
- Deep-link exact URL target: MEDIUM (generic `/home/keys`) / LOW (per-order `?key=` variant) —
  see Open Questions.
- Pitfalls: HIGH — each pitfall is grounded in an explicit, already-documented precedent in this
  codebase (WR-01..04, D-04 exemption pattern, D-21/22 lock) rather than generic React/Electron
  pitfalls.

**Research date:** 2026-07-07
**Valid until:** 30 days (stable, internal-composition phase; the one external fact with a
shorter shelf life — Humble's undocumented URL conventions — is already flagged LOW/MEDIUM and
gated behind a recommended manual check rather than treated as a hard dependency)
