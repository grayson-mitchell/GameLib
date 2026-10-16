# Phase 20: Aggregated Store Search (CheapShark) - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A new **top-level sidebar destination** where one title search returns prices across many
storefronts, annotated with **what the user already owns**. Prices come from CheapShark
(public, keyless, USD-only) behind a **provider interface** so IsThereAnyDeal can replace it
later without reshaping the consumer.

The owned-badge is the reason this belongs in a launcher rather than a browser bookmark:
CheapShark and IsThereAnyDeal will happily sell the user a second copy of a game already
sitting in their GOG library. GameLib knows better, and says so.

**Out of scope:** the aggregated *discovery/browse* surface (multi-provider Deals). That is a
seed, deliberately gated on this phase's provider interface surviving one real consumer first.

</domain>

<decisions>
## Implementation Decisions

### Badge matching strictness

The governing conflict: **Phase 15 already shipped a store-card ownership badge**
(`resolveDiscountBadge` in `src/common/discounts/badges.ts`) that is **exact-normalized-title
match ONLY**, and rejected near-matches on purpose — its own header comment says *"a
near-but-not-identical title never falls back to a badge; missing beats wrong (D-79/D-82)."*
Phase 20's ROADMAP scope said to reuse the **85% fuzzy** matcher from `humble/dedup.ts`. These
contradict. Resolved as follows:

- **D-01:** **Exact for Steam, fuzzy for the rest.** CheapShark returns `steamAppID` on game
  results, so Steam ownership is resolved by **ID join — no title matching at all**, which
  honours Phase 15's "never guess when you have an identifier" principle exactly. Fuzzy title
  matching applies **only** to GOG / Epic / Amazon, where no shared identifier exists.
- **D-02:** **Reuse `HUMBLE_FUZZY_MATCH_THRESHOLD` (85%) as-is.** One shared constant, one
  behaviour. Do **not** mint a second search-specific threshold — two thresholds will drift, and
  a stricter number would be invented precision with no data behind it. If real-world false
  positives appear, tune the one constant and both surfaces benefit.
- **D-03:** **Reuse the full `owned | key-available | null` vocabulary.** In a *buying* context
  the `key-available` state (an unredeemed Humble key for the game being priced) is arguably
  worth more than `owned` itself — it stops a genuinely wasteful purchase.
- **D-04:** **The badge names its store** — "Owned on GOG", not a bare "Owned". This requires the
  resolver to return **which library matched**, not a boolean. A bare "Owned" is a dead end: the
  user's next question is "where?" and the UI must answer it.

### Ownership sources

- **D-05:** Badge resolution reads **Steam + GOG + Epic + Amazon libraries + Humble keys**.
  `sideloadedLibrary` is **excluded** — sideloaded titles are arbitrary user-supplied strings
  and would be the single richest source of fuzzy false positives. All slices are already
  reachable from `GlobalState` (`epic.library`, `gog.library`, `amazon.library`, `steam.library`),
  so no new backend library work is required.
  *Rationale for going wide rather than Steam-only: a partial answer is worse than none. A user
  reads a missing badge as "I don't own this" and buys a duplicate.*
- **D-06:** **Multi-store badges stack** — "Owned on Steam, GOG" when both match. Needs a sane
  cap and overflow rule ("+2 more").
  **This deliberately relaxes Phase 15's `single badge per card` invariant (D-85) — on the search
  surface ONLY. The Deals screen keeps its single-badge rule. Do not "fix" this inconsistency;
  it is intentional.**
- **D-07:** **`owned` and `key-available` coexist** rather than the former suppressing the
  latter. Phase 15 suppressed the key badge (D-83/D-85) only because it had a single badge slot;
  that constraint is gone. Owning a game on GOG while holding an unredeemed Steam key for it are
  two different, both-actionable facts — suppressing the key badge hides an unclaimed asset at
  the exact moment the user is looking at the game.

### Buy handoff

- **D-08:** **External browser via `shell.openExternal()`** — **not** the in-app `/store-page`
  WebView that Deals uses. Rationale: Deals only ever linked to GOG, a store Heroic has always
  embedded. Search links out to **~30 storefronts** nobody has vetted inside an Electron webview,
  and these are pages where users type card details. GameLib should not wrap its own chrome
  around someone else's unvetted checkout form. The user's real browser has their password
  manager, saved cards, and a trusted address bar.
- **D-09:** Outbound links use **CheapShark's documented `redirect?dealID=` URL**, as designed.
  This is their intended integration path and the arrangement their free, keyless API is funded
  by. Do **not** attach GameLib's own affiliate tags (as `withAffiliate()` does for GOG on the
  Deals screen), and do **not** strip their redirect to link direct.
- **D-10:** **No post-purchase machinery.** The purchase lands on the next normal library sync,
  exactly as it would if bought with GameLib closed. No refocus-triggered auto-sync (would fire a
  full multi-store sync on a guess), no manual "I bought it" affordance.

### Search behaviour & result shape

- **D-11:** **Debounced ~400ms, minimum 3 characters, cancel in-flight requests** when a newer
  query supersedes. One request per pause, never per keystroke — CheapShark is free and keyless,
  and hammering it risks getting GameLib's traffic blocked for every user.
- **D-12:** **One row per game, cheapest price up front; per-store deals fetched lazily on
  expand.** This follows the API's actual shape: `GET /games?title=` already carries the cheapest
  price, `steamAppID`, and thumb in one request, while the per-store breakdown requires a second
  call (`GET /games?id={gameID}`) **per game**. Eager-fetching the breakdown would scale request
  count with result count. Owned-badges render on the collapsed row, so the "don't buy this"
  signal is visible **before** any expansion.
- **D-13:** **Currency travels with every price** — `$14.99 USD`, never a bare `$14.99`.
  CheapShark is USD-only while the Deals screen one sidebar entry away renders properly localised
  prices via `CatalogLocaleSettings`. A UK user seeing an unlabelled `$` will read it as their own
  currency and act on a wrong "cheapest" verdict. A dismissible banner is insufficient — the unit
  must be impossible to miss regardless of where the eye lands. This degrades gracefully: when
  ITAD lands, the label simply becomes the real currency.
- **D-14:** **Explanatory prompt on the empty state; "no results" and "provider failed" are
  visually distinct.** A failure renders an inline, retryable error while the search box stays
  usable (fail-soft, mirroring how the Humble adapter treats a dead upstream). Conflating the two
  makes the user retry a search that was never going to work — or abandon one that would have.

### Claude's Discretion

- Where the shared matching logic physically lives (`badges.ts` is in `common/`, `dedup.ts` in
  `backend/humble/`). Combining exact + fuzzy resolution across both needs a home; the planner
  picks it. Constraint: **do not write a second title matcher** — a subtly-different duplicate is
  a bug farm.
- Mapping CheapShark's numeric `storeID` to store names/logos (their `/stores` endpoint), and how
  that lookup is cached.
- Badge overflow rendering specifics (the "+2 more" cap from D-06).
- All i18n key naming.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The governing conflict — READ FIRST
- `src/common/discounts/badges.ts` — Phase 15's shipped ownership badge. Its header comments
  document the **exact-match-only / "missing beats wrong"** decision (D-79/D-82) and the
  single-badge precedence rules (D-83/D-85) that D-01, D-06 and D-07 above deliberately depart
  from. Read the comments, not just the code.
- `src/backend/humble/dedup.ts` — the store-agnostic title matcher: `normalizeTitle`,
  length-sensitive `titleSimilarity`, `isDlcFalsePositiveRisk`, and
  `HUMBLE_FUZZY_MATCH_THRESHOLD`. The `humble`/`steam` parameter naming is a historical artifact
  of where it was first needed; the logic is store-agnostic.

### Exploration context
- `.planning/notes/aggregated-store-search-foundations.md` — why this belongs in the launcher,
  what already exists, and the consciously-accepted CheapShark USD-only debt.
- `.planning/research/questions.md` **Q2** — the IsThereAnyDeal migration cost (access/approval,
  currency coverage, rate limits, whether ITAD exposes a Steam AppID at all). **Q1** covers the
  parallel exact-vs-fuzzy matching problem in Phase 19.
- `.planning/seeds/aggregated-discovery-multi-provider-deals.md` — the deferred browse surface.
  Explicitly NOT this phase.

### Existing analogs to follow
- `src/backend/discounts/index.ts` — the single-provider (GOG catalog) store backend, including
  `CatalogLocaleSettings` and the `hideOwned` filter. This is what the provider interface
  eventually generalizes; it is **already localised**, which is why D-13 matters.
- `src/frontend/screens/Discounts/` — the store-surface UI (`DiscountCard`, `DiscountFilters`,
  `DiscountPagination`), and `helpers.ts` for `withAffiliate()` (**deliberately NOT reused** — see D-09).
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx:199` — the `/discounts`
  "Deals" sidebar entry. The new search entry is a **sibling**, not a child.
- `src/common/types/discounts.ts` — `CatalogProduct`, `CatalogPrice`, `CatalogLocaleSettings`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`common/discounts/badges.ts`** — `resolveDiscountBadge()` + `buildDiscountBadgeMaps()`.
  Pure, unit-tested, no React/i18n/IO. Must be **extended** (return matched store, allow multiple
  badges, add non-Steam libraries, add fuzzy fallback) rather than duplicated.
- **`backend/humble/dedup.ts`** — the fuzzy matcher and its DLC false-positive guard. Generalize;
  do not fork.
- **`frontend/state/GlobalState.tsx`** — already exposes `epic.library`, `gog.library`,
  `amazon.library`, `steam.library`, `sideloadedLibrary`, and Humble keys. D-05's four-store
  ownership needs **no new backend work**.
- **`Sidebar/SidebarLinks`**, **`StoreLogos`** (Phase 2), **`CachedImage`** — sidebar entry, store
  iconography, and thumb rendering all exist.

### Established Patterns
- Store screens live in `src/frontend/screens/*` with a matching `src/backend/*` module and an
  `addHandler`-registered IPC boundary (`backend/discounts/index.ts` is the model).
- Badge resolution is computed **once in the container** and passed down as a resolved literal —
  `DiscountCard` never recomputes it. Follow this: it is what made the logic unit-testable.
- Fail-soft on a dead upstream (Humble adapter precedent) — informs D-14.

### Integration Points
- New sidebar route + screen (sibling of `/discounts`).
- New backend provider module + IPC handler for CheapShark search.
- Extension of the shared badge resolver to consume four libraries and return store attribution.

</code_context>

<specifics>
## Specific Ideas

- **"Owned on GOG" is the headline feature, not decoration.** It is the single thing no
  price-comparison website can do, and the entire justification for building this in-app.
- **`key-available` may be the most valuable badge on the screen** — it stops the user paying for
  a game they already hold a free unredeemed key for.
- The USD label (D-13) is a **correctness** issue, not a cosmetic one: an unlabelled `$` makes the
  "cheapest" verdict actively wrong for every non-US user.

</specifics>

<deferred>
## Deferred Ideas

- **Aggregated discovery / multi-provider Deals** — generalize `backend/discounts` from hardcoded
  GOG to N providers. Seeded at `.planning/seeds/aggregated-discovery-multi-provider-deals.md`,
  gated on this phase's provider interface surviving one real consumer.
- **IsThereAnyDeal migration** — the localised production provider. Scoped as
  `.planning/research/questions.md` **Q2**. The CheapShark USD-only limitation must stay contained
  inside the adapter and never leak into shared types, IPC payloads, or badge logic.
- **Tuning the 85% fuzzy threshold from real data** — D-02 reuses the existing constant on trust.
  If false positives surface, instrument and tune the single shared constant.

### Reviewed Todos (not folded)
- `steam-getproductinfo-appinfo-dump.md` ("Runtime getProductInfo appinfo dump to lock the osarch
  parser") — surfaced by `todo.match-phase` at score 0.6, but a pure keyword false positive. It is
  macOS 32-bit detection work (Phase 18), unrelated to store search.

</deferred>

---

*Phase: 20-aggregated-store-search-cheapshark*
*Context gathered: 2026-07-12*
