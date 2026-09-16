# 260916-gdg — RESEARCH: what a CheapShark → IsThereAnyDeal migration actually costs

**Date:** 2026-09-16
**Answers:** `.planning/research/questions.md` Q2 (open since 2026-07-12)
**Method:** ITAD OpenAPI spec (`dist/openapi.yaml`, v2.11.0, 6069 lines) + live unauthenticated
probes against `api.isthereanydeal.com`. No ITAD account was registered — see "Still human-gated".

## Evidence grades

Every claim below carries one of three grades. Do not promote a grade when citing this file.

| grade        | means                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| **MEASURED** | I ran the request and read the response this session                        |
| **SPEC**     | read from the published OpenAPI schema or docs prose; not exercised live    |
| **UNKNOWN**  | needs an API key or a human decision — explicitly not answered              |

---

## Headline

**The Phase 20 bet paid off.** The provider-neutral types minted in Phase 20 (D-11/D-12/D-13)
survive the migration essentially intact. `SEARCH_CURRENCY = 'USD'` is close to the only line
that dies. The migration's cost is **not** in reshaping GameLib's types.

The real costs are three, and two of them are non-technical:

1. **One embedded API key is shared by every GameLib install** — a class of problem structurally
   similar to (though much milder than) the impact.com credential problem that makes Heroic's
   GMG/Humble feeds require a mirror repo.
2. **ITAD's terms forbid building "a competition to IsThereAnyDeal"** — which a full deals-browsing
   screen plausibly is. This needs a human to ask them, not code.
3. **Search no longer returns prices in one call.** D-12's "one row per game, price included"
   becomes 2 calls (3 if Steam AppIDs are wanted).

---

## Q2.1 — Access · PARTIALLY ANSWERED (one hard gate found)

**SPEC.** Registration is self-service at `isthereanydeal.com/apps/my/`; keys and OAuth
credentials "will be generated for you" on registration. Requires an ordinary ITAD user account.
Caveat in the same page: "For some endpoints you might need explicit approval for use."

**SPEC — terms of use, in the order they matter to us:**

- **"MUST NOT build a competition to IsThereAnyDeal or IsThereAnyDeal projects"**, and MUST NOT
  use the API "to directly or indirectly help the competition". **This is the hard gate the
  question anticipated.** A price-checker inside a launcher is plausibly fine. An ITAD-powered
  aggregate *deals-browsing screen* — which is the "replace the GOG-only Deals tab" half of the
  plan — is much closer to ITAD's own core product. **Do not build the Discounts half until a
  human has asked `api@isthereanydeal.com` in writing.**
- **"MUST NOT change provided data in any way"**, explicitly including *not removing affiliate
  tags from URLs*. This constrains the adapter: `obj.deal2.url` must be passed through verbatim.
  Convenient side effect — see Q2.5, it is *simpler* than CheapShark, not harder.
- **Attribution is SHOULD, not MUST** — "You SHOULD provide a link to IsThereAnyDeal.com or
  mention IsThereAnyDeal API." Cheap to honour; do it regardless.
- **Commercial use is permitted "IF the resulting app is available to public."** GameLib is
  public, so this is satisfied.
- **MUST NOT imply affiliation** unless agreed otherwise.
- Data is "as-is" and access may be revoked "at any point without notice" → the adapter must
  degrade gracefully, not hard-fail the screen.

**Precedent, and its limit.** A third-party ITAD plugin for Playnite — also a desktop library
manager — exists and is actively maintained (`Lacro59/playnite-isthereanydeal-plugin`). That is
real evidence the "competition" clause is not read to exclude launchers outright. It is **not**
evidence that an aggregate deals *browser* is allowed, because that plugin's scope is wishlist
price-checking, which is the narrower of our two surfaces. Do not over-read it.

## Q2.2 — Currency & region · MECHANISM ANSWERED, COVERAGE UNKNOWN

**SPEC.** Region is a per-request `country` query parameter, ISO 3166-1 alpha-2, `default: US`.
Not a key setting, not an account setting — which is the good case: it means one key can serve
users in every country, and no per-user credential is needed to localise.

> **This maps 1:1 onto the existing `CatalogLocaleSettings.countryCode`. No translation layer.**

**SPEC.** Every price is `obj.price { amount: number, amountInt: integer, currency: /[A-Z]{3}/ }`
— an ISO 4217 code attached to each individual price. So D-13's decision to type `currencyCode`
as a bare `string` on every price-bearing type, rather than a literal union, was correct and
needs **no type change** — only a real value instead of the `'USD'` constant.

**One shape mismatch to absorb in the adapter:** ITAD gives `amount` as a **number** plus
`amountInt` in minor units; GameLib's `StoreSearchResult.cheapestPrice` is a **decimal string**.
Format from `amountInt` (integer, no float representation risk), not from `amount`.

**MEASURED, and it disproves a tempting shortcut.** `GET /service/shops/v1?country=XX` needs no
API key (HTTP 200). I swept 14 countries — US, GB, DE, FR, CA, AU, BR, JP, PL, SE, IN, TR, RU, MX
— and got **34 shops for every one of them, with an identical shop list** (US/JP and US/BR
byte-identical after sorting). So this endpoint does **not** vary by country and **cannot** be
used to measure per-country coverage. The ITAD FAQ has a "Countries and Currencies" section but
its answers render client-side and are not in the served HTML.

→ **The list of covered countries/currencies remains UNKNOWN and needs the key.** Do not assume
it matches Steam's region list.

## Q2.3 — Rate limits & caching · ANSWERED, and this is the sleeper cost

**SPEC.** 1000 requests per rolling 5-minute window for verified-email accounts. Current usage
is shown on the app setup page. Unverified accounts are slated for lower limits (identical during
a transitional period). Over-limit → `429` + `Retry-After`. Docs are explicit: "you should not be
constantly maxing out your usage, implement proper caching." Higher limits available on request;
circumvention "will cause ban."

**The finding the raw number hides:** 1000/5min is a **per-key** budget, and a desktop launcher
ships **one key in the binary**. That budget is therefore shared across the entire GameLib user
base — roughly 3.3 requests/second for *everyone combined*. CheapShark needed no key and so had
no shared ceiling at all. This is a genuine architectural cost that the question did not
anticipate, and it has only three exits:

| option                                  | cost                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| Ask ITAD for a raised limit with our use case | free, but discretionary, and couples us to their goodwill      |
| Each user registers their own ITAD key   | kills the zero-friction property; the Steam-Web-API-key friction we rejected elsewhere |
| Proxy through a GameLib-owned service    | recurring infra + the thing ITAD adoption was supposed to avoid      |

A key embedded in a shipped binary is also trivially extractable — worth noting given the ban
clause, though it is ITAD's risk model to set, not ours.

**Per-keystroke search is now 2–3× more expensive** (see Q2.5), which compounds this. The
existing `useDebouncedStoreSearch` is necessary but no longer sufficient on its own; a result
cache is required, not optional.

## Q2.4 — Identity / Steam AppID matching · ANSWERED — **YES**, and verified live

This was the question with the worst downside (fall back to fuzzy title matching, raising
false-positive risk on the "you already own this" badge). **That downside does not materialise.**

**SPEC.** `/games/search/v1` returns `obj.game { id (uuid), slug, title, type, mature, assets }`
— **no Steam AppID and no price**. Taken alone, ITAD search is strictly less informative than
CheapShark's.

**MEASURED — exact Steam AppID mapping works, in batch, with NO API KEY:**

```
POST https://api.isthereanydeal.com/lookup/id/shop/61/v1
body: ["app/220","app/570"]
→ HTTP 200
{"app/220":"018d937f-012f-73b8-ab2c-898516969e6a",
 "app/570":"018d937f-19a5-7057-bb6d-314d586e6dbc"}
```

(Shop `61` is Steam. The spec lists `security: - {}` for this endpoint, and the live 200 without
a key confirms it. By contrast `/games/search/v1` without a key returned
`403 {"status_code":403,"reason_phrase":"Missing api key"}` — MEASURED — so the openness is
specific to the lookup family, not general.)

Three mapping routes exist:

- `POST /lookup/id/shop/61/v1` — Steam AppIDs → ITAD gids (batch, no auth) **← the one we want**
- `POST /lookup/shop/61/id/v1` — ITAD gids → Steam AppIDs (batch, no auth)
- `GET /games/lookup/v1?appid=570` — single Steam AppID → game (needs key)

**Direction matters and favours us.** The owned-badge use case maps GameLib's *already-known
Steam library* onto ITAD gids — that is the first route: batched, exact, and unauthenticated, so
it does not consume the shared key budget at all. This is **better** than CheapShark's
per-result `steamAppID` field, not merely equivalent.

ID format is `app/{appid}` — the adapter must prefix on the way in and strip on the way out.

Also note `/lookup/id/title/v1` is **exact-match only** ("Typos or variations in title may not
give you expected result") and is POST-only (MEASURED: GET returns 405). It is not a search
substitute.

## Q2.5 — Interface delta · ANSWERED — smaller than feared, with one structural break

**SPEC, field by field.**

`StoreSearchResult`:

| field           | CheapShark          | ITAD                                          | verdict                        |
| --------------- | ------------------- | --------------------------------------------- | ------------------------------ |
| `gameId`        | numeric string      | uuid string                                   | no type change                 |
| `title`         | `external`          | `title`                                       | ✓                              |
| `steamAppId?`   | inline on search    | extra batch lookup (Q2.4)                     | preserved, costs a call        |
| `thumb`         | `thumb`             | `assets.banner145/300/400/600` \| `boxart`    | pick one; same field           |
| `cheapestPrice` | decimal string      | `deals[].price.amountInt` → format            | adapter formats                |
| `currencyCode`  | `'USD'` constant    | `price.currency` (real ISO 4217)              | **the debt dies here**         |
| `buyUrl`        | `buildRedirectUrl()` | `obj.deal2.url` **verbatim**                 | *simpler* — see below          |

`StoreSearchDeal`: `price`/`retailPrice` → `price`/`regular`; `storeId`/`storeName` →
`obj.shop {id, name}`; `currencyCode`/`buyUrl` as above.

`StoreSearchStore`: `storeId` becomes numeric; `isActive` becomes implicit — `/service/shops/v1`
is literally "Active shops".

**Two pitfalls delete themselves.** `buildRedirectUrl()` and the whole double-encoding hazard
(Phase 20 RESEARCH Pitfall 1 — CheapShark's already-percent-encoded `dealID` 404s if re-encoded)
disappear: ITAD returns a complete deal URL. The T-20-01 mitigation comment changes character
entirely — instead of "we build the URL from a fixed prefix so the untrusted fragment can't
escape", we are now passing through a **fully provider-supplied URL**, which we are contractually
forbidden from altering. That is a *different* trust posture and the adapter must say so; it is
not a downgrade to gloss over.

**The one place the change leaks outside the adapter:** `common/discounts/storeMapping`'s
`resolveRunner()` is keyed on CheapShark's string store IDs and is **shared with the Discounts
screen**. ITAD shop IDs are numeric and different (Steam 61, GOG 35). This is the single shared
module that must change, and it is shared — so it is the one real blast-radius item.

**The structural break is D-12.** Phase 20 chose CheapShark partly because `GET /games?title=`
returns one row per game *with the cheapest price already included* — one call. ITAD splits this:

```
/games/search/v1?title=…        → gids only, no prices   (key required)
POST /games/prices/v3           → prices, 1–200 gids per call, `country` param
POST /lookup/shop/61/id/v1      → Steam AppIDs, optional, no key
```

So the search path is **2 calls minimum, 3 for owned-badging**, against CheapShark's 1. Batching
softens it (200 gids per prices call covers a whole result page in one request), but combined
with the shared key budget in Q2.3 this is the change that actually shapes the UX.

`getGameDeals(gameId)` maps cleanly onto `/games/prices/v3` with a single gid — the per-row
expand path is essentially unchanged.

---

## The additional 2026-08-27 question — can ITAD back the Discounts screen too?

**Mechanically YES.** `/deals/v2` (GET or POST) takes `country`, `offset`, `limit` (max 200),
`sort` (`-cut`, `price`), `nondeals`, `mature`, `shops[]`, and a `filter` (JSON, or ITAD's own
base64-lz-compressed filter string). It returns the same deduplicated best-price-per-game list
the ITAD website shows. **SPEC.**

Three findings that bear directly on the "don't port Heroic's GMG/Humble modules" decision:

1. **`hideOwned` / `wishlistOnly` become possible.** The todo records these as *impossible* under
   the static-feed model because there is no account to filter against. `/deals/v2` accepts
   **OAuth** (`wait_read`, `coll_read`) as an alternative to the API key, and with it "the user
   data filters will work". That is a capability the GMG/Humble port can never have.
2. **Staleness collapses.** The todo measures the mirrored feed at up to ~48h (24h feed cron +
   24h client `CacheStore`). **MEASURED:** the GB shops probe reported per-shop `update`
   timestamps of `2026-09-16T20:35:32+02:00` — minutes old at time of reading.
3. **ITAD subsumes both Heroic feeds.** **MEASURED** — the 34-shop list includes GreenManGaming,
   Humble Store, GOG, Epic Game Store, Steam, and Fanatical. No mirror repo, no impact.com
   partnership, no affiliate pipeline.

> ⚠ **But `/deals/v2` is exactly the surface the "no competition" clause most plausibly bites.**
> Finding 1–3 make the Discounts half *attractive*, which is precisely why the terms question
> must be settled first rather than last.

**Coverage gap worth recording:** **Amazon Games is absent** from ITAD's shop list (MEASURED).
GameLib supports Amazon as a first-class store; ITAD does not track it. Any ITAD-backed Discounts
screen is structurally blind to one of GameLib's four stores.

---

## Still human-gated (why this todo cannot close as `ready: code`)

1. **Register an ITAD app** at `isthereanydeal.com/apps/my/` — needs a human account. Unblocks
   the Q2.2 currency/country coverage measurement and any live test of search/prices/deals.
2. **Email `api@isthereanydeal.com`** about the "no competition" clause, describing GameLib as a
   desktop launcher and asking explicitly whether an in-app aggregate deals browser is permitted.
   **This gates the Discounts half of the plan and nothing else can substitute for it.**
3. **Decide the shared-key strategy** (Q2.3 table) — request a raised limit, per-user keys, or a
   proxy. This is a product decision with a friction cost, not an implementation detail.

## Recommendation

Split the decision, because the two halves have different risk:

- **StoreSearch price-checker → migrate.** The type delta is small, the Steam-AppID story is
  *better* than CheapShark's, the USD-only debt dies, and the Playnite plugin is precedent for
  this exact scope. Gated only on item 1 and item 3 above.
- **Discounts screen → do not build until item 2 returns in writing.** The capability case is
  strong (localised, fresh, filterable, no mirror repo) and the Heroic GMG/Humble port remains
  correctly rejected either way — but this is the surface most likely to be read as competing,
  and finding that out after building it is the expensive order.
