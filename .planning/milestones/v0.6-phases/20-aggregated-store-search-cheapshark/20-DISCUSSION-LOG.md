# Phase 20: Aggregated Store Search (CheapShark) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 20-aggregated-store-search-cheapshark
**Areas discussed:** Badge matching strictness, Ownership sources, Result click destination, Search trigger & result shape

---

## Framing discovered during codebase scout

Phase 15 had **already shipped** a store-card ownership badge (`resolveDiscountBadge`,
`src/common/discounts/badges.ts`) that was **exact-title-match only by explicit decision**
("missing beats wrong", D-79/D-82) and carried a third state nobody had accounted for:
`key-available`. Phase 20's ROADMAP scope — written during `/gsd-explore` — said to reuse the
**85% fuzzy** matcher instead. The two were in direct contradiction, and resolving it drove the
whole discussion. Two further exploration-era assumptions were also found to be wrong:

- Deals cards do **not** call `shell.openExternal()`; they navigate to an in-app WebView
  (`/store-page?store-url=…`).
- Ownership badges read **only** `steam.library` — the "you already own this on GOG" promise from
  exploration did not exist in code at all.

---

## Badge matching strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Exact for Steam, fuzzy for the rest | Join on CheapShark's `steamAppID` for Steam (no title matching); fuzzy only for Epic/GOG/Amazon/Humble | ✓ |
| Hold the Phase 15 line — exact only | Exact-normalized-title everywhere; badges silently miss on any string variance | |
| Fuzzy everywhere, including Steam | Uniform 85% matcher, ignoring `steamAppID` | |
| Three-state badge: owned / probably-owned / none | Hedged badge for fuzzy hits | |

**User's choice:** Exact for Steam, fuzzy for the rest.
**Notes:** Honours Phase 15's actual principle (never guess when an identifier exists) while making the non-Steam badge possible at all.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse 85% as-is | Import `HUMBLE_FUZZY_MATCH_THRESHOLD` unchanged — one constant, no drift | ✓ |
| Tighten to ~92% for search | A stricter search-specific constant | |
| Reuse 85% but log every fuzzy hit | Shared constant + instrumentation for later tuning | |

**User's choice:** Reuse 85% as-is.
**Notes:** A second threshold would be invented precision with no data behind it.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse full owned/key-available vocabulary | `resolveDiscountBadge` already returns all three states | ✓ |
| Yes, and make key-available louder than owned | Stronger treatment + possible "Reveal key" action | |
| Owned only — keep key-available on Deals | Simpler v1 surface | |

**User's choice:** Reuse the full `owned | key-available | null` vocabulary.

| Option | Description | Selected |
|--------|-------------|----------|
| Badge names the store — "Owned on GOG" | Resolver returns which library matched, not a boolean | ✓ |
| Bare "Owned" — keep Phase 15's shape | No attribution | |
| Store logo, no text | Reuse `StoreLogos`; language-free | |

**User's choice:** Badge names the store.
**Notes:** A bare "Owned" is a dead end — the user's next question is "where?".

---

## Ownership sources

| Option | Description | Selected |
|--------|-------------|----------|
| All four stores + Humble keys | Steam (exact) + GOG/Epic/Amazon (fuzzy) + Humble `key-available` | ✓ |
| Steam + Humble only in v1 | Defer fuzzy stores until match quality is measured (Phase 19's stance) | |
| All four stores, exclude sideloaded | Same, with `sideloadedLibrary` explicitly skipped | |

**User's choice:** All four stores + Humble keys.
**Notes:** `sideloadedLibrary` read as excluded (choice said "four stores"); sideloaded titles are arbitrary user strings and the richest source of fuzzy false positives. Rationale for going wide: a partial answer is worse than none — a user reads a missing badge as "I don't own this" and buys a duplicate.

| Option | Description | Selected |
|--------|-------------|----------|
| Show every store you own it on | "Owned on Steam, GOG" — needs a cap + overflow rule | ✓ |
| Single badge, exact match wins | Preserves Phase 15's single-badge invariant | |
| Single badge, prefer the installed copy | Optimizes for "what can I play now" | |

**User's choice:** Show every store.
**Notes:** Deliberately relaxes Phase 15's `single badge per card` (D-85) **on the search surface only**. Deals keeps its rule.

| Option | Description | Selected |
|--------|-------------|----------|
| Show both — owned and key-available coexist | They mean different things; suppressing the key hides an unclaimed asset | ✓ |
| Keep Phase 15's rule — owned suppresses key-available | Consistent across both surfaces | |

**User's choice:** Show both.
**Notes:** Phase 15 only suppressed the key badge because it had one badge slot; that constraint is gone.

---

## Result click destination

| Option | Description | Selected |
|--------|-------------|----------|
| External browser via `shell.openExternal()` | User's real browser: password manager, saved cards, trusted address bar | ✓ |
| In-app WebView via `/store-page` | Reuse the Deals pattern | |
| In-app for known-good stores, external otherwise | Allowlist hybrid | |

**User's choice:** External browser.
**Notes:** Deals only ever linked to GOG. Search links to ~30 unvetted storefronts where users type card details — GameLib should not wrap its chrome around someone else's checkout form.

| Option | Description | Selected |
|--------|-------------|----------|
| Use CheapShark's `redirect?dealID=` as designed | The documented integration path; their free keyless API is funded by it | ✓ |
| Same + a visible "prices via CheapShark" credit | Explicit on-screen attribution | |
| Add GameLib's own affiliate tags | Monetize outbound clicks, as `withAffiliate()` does for GOG | |
| Strip all affiliate params | Link direct to the raw store URL | |

**User's choice:** CheapShark's redirect, as designed.
**Notes:** Raised proactively — `withAffiliate()` already silently rewrites GOG links with a hardcoded affiliate ID (`helpers.ts:6`), so "do we monetize the click" would otherwise have been decided implicitly by whoever wrote the adapter.

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing special — normal sync picks it up | No new machinery; stale-ownership window accepted | ✓ |
| Manual "I bought it — refresh library" action | User-initiated immediate pull | |
| Auto-refresh on window refocus after handoff | Slickest; fires a full multi-store sync on a guess | |

**User's choice:** Nothing special.

---

## Search trigger & result shape

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced as you type, ~400ms | Min 3 chars, cancel in-flight; one request per pause | ✓ |
| Explicit submit — type and press Enter | Minimal load, no races, feels dated | |
| Debounced + in-session result cache | Memoize by query string | |

**User's choice:** Debounced ~400ms.
**Notes:** CheapShark is free and keyless — hammering it risks blocking GameLib's traffic for every user.

| Option | Description | Selected |
|--------|-------------|----------|
| One row per game, cheapest shown, expand for all stores | Matches the API's two-call shape exactly | ✓ |
| One row per game, auto-fetch stores for top N | ~5 wasted requests per search | |
| Flat list — every store offer as its own row | Request count scales with result count; buries the searched game | |

**User's choice:** One row per game, lazy per-store expansion.
**Notes:** `GET /games?title=` already carries cheapest price + `steamAppID` + thumb in one call; the per-store breakdown needs `GET /games?id=` **per game**. Owned-badges render on the collapsed row so the "don't buy" signal precedes any expansion.

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit USD label on every price | Unit travels with the number — impossible to misread | ✓ |
| One-time banner at top of screen | Gets dismissed, then bare `$` is ambiguous again | |
| Both — per-price label and explanatory note | Belt and braces | |

**User's choice:** USD label on every price.
**Notes:** Treated as a correctness issue, not cosmetics — the Deals screen one sidebar entry away shows properly localised prices, so a bare `$` makes the "cheapest" verdict actively wrong for non-US users.

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt on empty; inline retryable error on failure | Fail-soft, distinguishes "no results" from "provider down" | ✓ |
| Prompt on empty; recent searches below | Local state only | |
| Empty results and errors look the same | Conflates the two failure modes | |

**User's choice:** Prompt on empty; inline retryable error.
**Notes:** "Show trending deals on the empty state" was explicitly kept off the table — that is discovery, i.e. the deferred seed.

---

## Claude's Discretion

- Where the combined exact+fuzzy matching logic physically lives (`badges.ts` in `common/` vs `dedup.ts` in `backend/humble/`). Hard constraint: **do not write a second title matcher.**
- Mapping CheapShark's numeric `storeID` → store names/logos via their `/stores` endpoint, and how that lookup is cached.
- Badge overflow rendering ("+2 more") specifics.
- All i18n key naming.

## Deferred Ideas

- **Aggregated discovery / multi-provider Deals** — `.planning/seeds/aggregated-discovery-multi-provider-deals.md`. Gated on this phase's provider interface surviving one real consumer.
- **IsThereAnyDeal migration** — `.planning/research/questions.md` Q2. CheapShark's USD-only limitation must stay contained inside the adapter.
- **Tuning the 85% fuzzy threshold from real data** — D-02 reuses the constant on trust.

### Reviewed Todos (not folded)

- `steam-getproductinfo-appinfo-dump.md` — matched at score 0.6 by `todo.match-phase`, but a pure keyword false positive (macOS 32-bit / Phase 18 work, unrelated to store search).
