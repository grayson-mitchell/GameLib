# Phase 69: Consolidate frontend state onto GlobalStateV2 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-10
**Phase:** 69-consolidate-frontend-state-onto-globalstatev2
**Areas discussed:** Store shape, IPC subscriptions & async actions, Migration path & coexistence, Phase 64 order & verification

---

## Todo cross-reference

| Option | Description | Selected |
|--------|-------------|----------|
| Downloads history lost | 2026-11-05 todo: finished list lost on tab return | ✓ |
| Fold none | Keep the phase behaviour-neutral | |

**User's choice:** Fold the downloads-history todo.

---

## Store shape

| Question | Options | Selected |
|----------|---------|----------|
| One store or many | Per-domain stores / One V2 store with slices / You decide | Per-domain stores |
| Persistence | Keep configStore.set in actions / zustand persist middleware | Keep in actions |
| Library data | Port shape as-is / Normalise now | Port as-is |
| Existing small stores | Leave alone / Fold into domain stores | Leave alone |

---

## IPC subscriptions & async actions

| Question | Options | Selected |
|----------|---------|----------|
| Listener home | Boot module, once / Per-domain hook in App | Boot module |
| Async actions | Inside each domain store / Separate service modules | Inside each store |
| Teardown | App-lifetime / Return disposers | App-lifetime |
| componentDidUpdate effects | store.subscribe in boot module / useEffect in top-level component | store.subscribe |

---

## Migration path & coexistence

| Question | Options | Selected |
|----------|---------|----------|
| Coexistence | Bridge then convert / Slice + all consumers at once | Bridge then convert |
| Order | Low-risk first / Library first | Low-risk first |
| Tests | Seed stores directly / Test provider shim | Seed stores directly |
| Ratchet | Files importing ContextProvider / Plus ESLint ban | Files importing ContextProvider |

---

## Phase 64 order & verification

| Question | Options | Selected |
|----------|---------|----------|
| 64 vs 69 order | 69 first / 64 first / Parallel with own store | 69 first |
| Re-render measurement | Profiler commit counts (synthetic) / Real library manual / Both | Profiler commit counts |
| Smoke checks | Blocking per wave / Only auth+library waves / One live gate at end | **One live gate at end** (differs from recommendation) |
| Downloads todo | Reproduce + fix in downloads wave / Frontend half only | Reproduce + fix |

---

## Claude's Discretion

Exact domain-store boundaries, file layout, which ratchet metric to count, how plans are batched within each wave, and where TourContext ends up.

## Deferred Ideas

- Normalise library data into a keyed map (after Phase 70)
- ESLint ban on the deleted context
