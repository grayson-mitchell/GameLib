# Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
**Areas discussed:** Embedded key in builds, User-key setting timing, Cache freshness & size, Wave 0 coverage sweep

---

## Embedded key in builds

| Question | Options | Selected |
|----------|---------|----------|
| Release key source | GH secret `ITAD_API_KEY` baked via esbuild --define / Runtime-only, no bake-in | GH secret `ITAD_API_KEY` |
| Dev key source | Env var `GAMELIB_ITAD_API_KEY` / Only via Settings field | Env var `GAMELIB_ITAD_API_KEY` |
| Keyless build | 'Not set up' message / Hide Store Search | 'Not set up' message |
| Release without secret | Fail release build / Warn only | Fail release build |

---

## User-key setting timing

| Question | Options | Selected |
|----------|---------|----------|
| When to ship | In Phase 47, last wave / Defer to follow-up | In Phase 47, last wave |
| Rejected user key | Fall back + show warning / Fail visibly, no fallback | Fall back + show warning |
| ITAD email | Human-action task in plan / Handle separately | Human-action task in plan |

---

## Cache freshness & size

| Question | Options | Selected |
|----------|---------|----------|
| Search TTL | 1 hour / 15 minutes / 6 hours | 1 hour |
| Results per search | 20 / 30 / 10 | 20 |
| Gid mapping TTL | 30 days / Forever | 30 days |
| Result with no deals | Drop the row / Show 'No price in your region' | Drop the row |

---

## Wave 0 coverage sweep

| Question | Options | Selected |
|----------|---------|----------|
| When the sweep runs | Wave 0 checkpoint blocking later waves / Run now before planning / Skip, assume broad coverage | Wave 0 checkpoint |
| Unsupported-country fallback | US / Nearest supported by currency/region | US |

---

## Claude's Discretion

- `getStoreSearchStoreMap` channel fate, `Retry-After` clamp bounds, single-flight shape, cache-key hash, test layout, plan split.

## Deferred Ideas

- ITAD deals browser, Stage 2 feed service, intermediate caching server, Amazon prices, Store Search region picker, affiliate disclosure.
