---
phase: 47
slug: migrate-aggregated-store-search-from-cheapshark-to-istherean
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-12
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `47-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest ^29.7.0 + ts-jest (projects Backend / Common / Frontend / Preload / Meta / relay) |
| **Config file** | `jest.config.js` plus per-project `src/{backend,common,frontend}/jest.config.js` |
| **Quick run command** | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/itad.test.ts src/backend/storeSearch/__tests__/itadCache.test.ts src/backend/storeSearch/__tests__/handlers.test.ts` and `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch` |
| **Full suite command** | `pnpm test:ci` + `pnpm check:ipc-contract` |
| **Estimated runtime** | ~30 seconds quick; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick backend + frontend StoreSearch commands
- **After every plan wave:** Run `pnpm test:ci` + `pnpm check:ipc-contract`
- **Before `/gsd-verify-work`:** Full suite green, `pnpm find-deadcode` ratchet, i18n gates
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Filled by the planner per task. Requirement → test map from research:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| PRICE-01 | Adapter maps ITAD search+prices to `StoreSearchResult` with real `currencyCode`; sends `country` | unit | `itad.test.ts` | ❌ W0 | ⬜ pending |
| PRICE-01 | `deal.url` byte-identical (affiliate tags, encoded chars) | unit | `itad.test.ts` | ❌ W0 | ⬜ pending |
| PRICE-01 | `formatPrice` per currency (USD/EUR/GBP/JPY, unknown fallback) | unit | `formatPrice.test.ts` | ❌ W0 | ⬜ pending |
| PRICE-01 | `countryCode` renderer → IPC → adapter, zod-validated | unit | `src/common/types/ipc`, `useDebouncedStoreSearch.test.ts` | partial | ⬜ pending |
| PRICE-01 | ITAD shop id → runner mapping (61 steam, 35 gog, Epic from dump) | unit | `src/backend/__tests__/storeMapping.test.ts` | ✅ (rewrite) | ⬜ pending |
| PRICE-02 | Keyless gid lookup: `app/` prefix, chunking, persistence, only unseen ids, failure-tolerant | unit | `itad.test.ts` | ❌ W0 | ⬜ pending |
| PRICE-02 | Owned badge + Humble keyAvailable via injected `steamAppId`; fuzzy fallback never wrong-owned | component | `StoreSearchScreen.test.tsx` | ✅ (extend) | ⬜ pending |
| PRICE-03 | 429 + `Retry-After` → cached rows with `cachedAt`; `blockedUntil` gate, injectable clock, no timers | unit | `itadCache.test.ts`, `itad.test.ts` | ❌ W0 | ⬜ pending |
| PRICE-03 | Cached timestamp rendered via `t()` | component | `StoreSearchRow.test.tsx` | ✅ (extend) | ⬜ pending |
| All | Handler rethrow contract unchanged | unit | `handlers.test.ts` | ✅ (adjust) | ⬜ pending |
| All | Dotted-title cache key; API key never logged; entry cap | unit | `itadCache.test.ts` | ❌ W0 | ⬜ pending |
| All | New store registered (fixtures/kind/TTL pins) | unit | `src/backend/stores`, `storeKinds.test.ts` | ✅ (update) | ⬜ pending |
| All | IPC contract regenerated | gate | `pnpm check:ipc-contract` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeSearch/__tests__/itad.test.ts`, `itadCache.test.ts` (replace `cheapshark.test.ts`)
- [ ] ITAD response fixtures (redacted of any key) under `src/backend/storeSearch/__tests__/fixtures/`
- [ ] `meta/measureItadCoverage.ts` + operator run (human-action checkpoint) → `47-ITAD-COVERAGE.json`
- [ ] `formatPrice` test file; extend `StoreSearchScreen.test.tsx` / `StoreSearchRow.test.tsx`
- [ ] `meta/backendDiCeilings/storeSearch.json` updated for new/removed `jest.mock` files

Framework install: none.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Country/currency coverage sweep | PRICE-01 | Needs operator's ITAD key (never committed) | `ITAD_API_KEY=... node meta/runTs.cjs --bundle --platform=node --target=node22 meta/measureItadCoverage.ts` |
| Live search in running app, localised prices, 429 simulated | PRICE-01/03 | Needs key + built sidecar | `pnpm build:sidecar`, then `pnpm tauri:dev`; search; force 429 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
