---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 15
subsystem: navigation/stores-panel
tags: [gap-closure, G-47-6, nav-shell, stores-panel, deep-link]
requires: []
provides:
  - resolveActiveStore(pathname, search) in navTabs.ts (pure; /store/:key and /store-page?store-url= deep links)
  - StoresPanel activeStore prop with isActiveFallback on the Amazon, Epic, GOG, Steam and Humble Keys rows
affects: []
tech-stack:
  added: []
  patterns: [delegate deep-link host matching to resolveStoreForUrl instead of a second rule, use isStore for store-literal comparisons per the runner-literal lint ratchet]
key-files:
  created: []
  modified:
    - src/frontend/components/UI/NavShell/navTabs.ts
    - src/frontend/components/UI/NavShell/index.tsx
    - src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx
    - src/frontend/components/UI/NavShell/__tests__/navTabs.test.ts
    - src/frontend/components/UI/NavShell/__tests__/StoresPanel.test.tsx
    - src/frontend/components/UI/NavShell/__tests__/NavShell.test.tsx
key-decisions:
  - 'NavShell imports resolveStoreForUrl from frontend/screens/WebView/storeEmbedOrigins directly rather than moving it; the module is pure and NavShell components already import from frontend/screens/*'
  - 'rememberLastStore is not called for deep links, so the Stores tab keeps reopening the store the user last browsed via /store/:store'
  - 'amazon and epic rows keep a plain string compare (their keys are not Runner names, so isStore does not type them and the lint rule does not flag them); gog, steam and humble go through isStore'
requirements-completed: [PRICE-01]
duration: 20min
completed: 2026-11-18
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 4
plan_head_before: 422569107535f5b0bf10eca87cbf0869909b9d25
plan_head_after: 01ebfd95907dc0e326f0e453f13bfbddcfeb3925
---

# Phase 47 Plan 15: Stores panel highlights the deep-linked store (G-47-6) Summary

Opening a store from a game link (Deals card, the game page's Store link, the Humble Keys claim) now lights the owning store's row in the Stores tier-2 panel, via a pure `resolveActiveStore` that reuses `resolveStoreForUrl` for host matching.

## What was built

**Task 1 (tracer, TDD).** RED commit `5de1e1dd3` added a `resolveActiveStore` describe to `navTabs.test.ts` (ten failing cases). GREEN commit `d29e8b789`: `resolveActiveStore(pathname, search?)` returns the key for `/store/<epic|gog|amazon|steam>`, and for any pathname containing `store-page` reads `store-url` via `URLSearchParams` and returns `resolveStoreForUrl(url)?.key ?? null`. `NavShell/index.tsx` computes `activeStore` beside `activeTab` and renders `<StoresPanel activeStore={activeStore} />`. `StoresPanel` takes `{ activeStore = null } = {}` (zero-argument calls still compile) and passes `isActiveFallback` to the four store rows and Humble Keys. Store Search, Deals and the Redeem row are untouched.

**Task 2.** Commit `01ebfd959`: StoresPanel cases (each store lights only its own row, humble lights only Humble Keys, null and a bare call light none) and NavShell cases (`/store-page` with an encoded GOG URL passes `activeStore === 'gog'`; a non-store host passes `null`). NavShell.test.tsx gained a module-level `let search`, reset beside `pathname`, with the existing mock factory returning `{ pathname, search }`; no `jest.mock` added.

## Verification

- navTabs, StoresPanel, NavShell and destinationCoverage suites: 84 passed. Full NavShell directory run: all green except the pre-existing, out-of-scope `themeTokens.test.ts` render-site census failure.
- `backendDiCeilings` Meta suite: 132 passed; `meta/backendDiCeilings/frontend-components-ui-navshell.json` untouched (NavShell.test.tsx 10, StoresPanel.test.tsx 4).
- `pnpm codecheck`: clean. `pnpm lint:src`: 0 errors, production PASS (after the isStore fix below).
- `prettier --check` over every path written: clean.
- Acceptance greps: `export function resolveActiveStore` 1, `isActiveFallback` in StoresPanel 5, `resolveActiveStore(location.pathname, location.search)` in NavShell 1, `hostname` in navTabs.ts 0, `let search` 1, `activeStore` in StoresPanel test 9.
- Threat T-47-52 (lookalike host / http): tests cover `https://evilgog.com`, `http://www.gog.com` and `https://example.com` all returning null; matching is owned by `resolveStoreForUrl`.
- Human check (macOS, `pnpm tauri:dev`): Deals card, game-page Store link and Stores > GOG Store should each leave the GOG Store row highlighted. Not run here; harvested at end of phase per the plan.

## Deviations from Plan

**1. [Rule 1 - Bug] Raw store-literal comparisons rejected by the lint ratchet**
- **Found during:** Task 2 verification (`pnpm lint:src`)
- **Issue:** `activeStore === 'gog' | 'steam' | 'humble'` in StoresPanel triggered `no-restricted-syntax` (3 production errors); the repo requires `isStore` from `common/storeCapabilities`.
- **Fix:** gog, steam and humble comparisons use `isStore(activeStore, key)`. Amazon and Epic keep the plain compare (not Runner names, not flagged).
- **Files modified:** src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx
- **Commit:** cf37f25f0

**2. [Rule 1 - Bug] Strict-null type error in the first resolveActiveStore draft**
- **Found during:** Task 1 `pnpm codecheck`
- **Issue:** indexing a RegExp match array produced `string | undefined`.
- **Fix:** read the capture with optional chaining and an `!== undefined` guard before the first GREEN commit.

**Total deviations:** 2 auto-fixed (2 Rule 1). **Impact:** none on scope or behavior.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or schema changes.

## Self-Check: PASSED

All four commits (5de1e1dd3, d29e8b789, cf37f25f0, 01ebfd959) are ancestors of HEAD; all six modified files exist.
