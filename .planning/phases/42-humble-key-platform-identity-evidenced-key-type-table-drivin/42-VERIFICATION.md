---
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
verified: 2026-09-08T19:48:54Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Store-indicator visual verification (both themes, no layout shift) against the CURRENT row rendering"
    addressed_in: "Phase 43"
    evidence: "Phase 43 goal: 'Bring the Humble Keys screen closer to Humble's own site... a three-column row whose KEY column is action-scenario driven' — the row markup CONTEXT.md's item 3/4 gate checks measured (pre-260908-vo4, then vo4's .humbleKeyRowCaption geometry) is superseded by Phase 43's redesign. Residue tracked by two open `ready: live-gate` todos (2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md, 2026-09-08-humble-key-row-store-icon-geometry-unverified-live.md), not by this phase."
---

# Phase 42: Humble key platform identity — evidenced key_type table Verification Report

**Phase Goal:** Replace three ad-hoc `key_type` interpretation call sites with ONE evidenced
`key_type` table (display name, logo-or-neutral, redeem-URL-or-help-fallback) driving the row's
store indicator and per-platform deep links; give owned+revealed keys somewhere to live (settle
to REDEEMED with an undo path), since they were excluded from both Keys-waiting and Giftable
Spares.
**Verified:** 2026-09-08T19:48:54Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A caller can resolve any `key_type` to a display name / logo-or-none without knowing platform names | VERIFIED | `src/common/humble/keyTypePresentation.ts` — `getKeyTypePresentation()`, `KEY_TYPE_PRESENTATIONS` table (steam/gog/gog_keyless/epic/epic_keyless branded; origin/origin_keyless/uplay/battlenet/nintendo_direct named; generic → explicit unknown). 252-line unit suite passes. |
| 2 | A caller can resolve `key_type`+code to a real deep link or the static help URL, never fabricated | VERIFIED | `getRedeemTarget()` — closed 2-entry `REDEEM_URL_BUILDERS` (steam, gog only); everything else falls to `HUMBLE_REDEEM_HELP_URL` with `code` dropped (never interpolated on the help branch). |
| 3 | Unrecognised `key_type` and literal `'generic'` resolve to the SAME explicit unknown case | VERIFIED | `[GENERIC_KEY_PLATFORM]: { kind: 'unknown' }` is an explicit map entry; `getKeyTypePresentation`'s miss branch returns the identical `{ kind: 'unknown' }` literal — no default fall-through. Pinned by `keyTypePresentation.test.ts`. |
| 4 | `HumbleKeyRow` renders the store's logo + proper name, not the raw lowercase token | VERIFIED | `HumbleKeyRow/index.tsx:187` imports and calls `getKeyTypePresentation`; `resolveStoreLogo`/`resolvePlatformDisplay` are thin adapters over the table's output (exhaustive `never`-guarded switches), not re-derivation. Regression pin: `"does not leak the raw lowercase \"steam\" token anywhere in the row (the original defect)"` (`__tests__/index.test.tsx:328`). |
| 5 | `HumbleClaimWizard`'s redeem action resolves through the table, not a Steam-vs-static-help fork | VERIFIED | `HumbleClaimWizard/index.tsx:664-668` calls `getRedeemTarget`/`getKeyTypePresentation`; the two-way fork is gone (only `isSteam` remains, and it drives the unrelated Steam-vs-manual wizard FLOW, not the label/URL — see Anti-Patterns note). GOG deep link + urlencoding + Steam-byte-identical + generic/unrecognised-help tests all pass. |
| 6 | No ad-hoc `key_type` interpretation survives at any of the three original call sites | VERIFIED | Grepped both files for `platform ===`/`key_type ===`: the only survivor is `isSteam = humbleKey.platform === 'steam'` in both files, which gates flow/label choices unrelated to store-identity or redeem-target derivation (button copy "Activate" vs "Finish activation" in the row; steam-vs-manual step machine in the wizard) — not the defect the phase targets. |
| 7 | `humbleSettleDeclinedStore` exists and is registered | VERIFIED | `src/backend/humble/electronStores.ts:191-194`, exported and registered in `src/backend/sidecar/storeRegistration.ts:97,187`. D-04 disconnect-exempt (not touched by `HumbleUser.disconnect()`). |
| 8 | Exact-match owned+REVEALED key auto-settles to REDEEMED, writes `source: 'ownership-exact'` | VERIFIED | `library.ts recomputeOwnership()` guards 1-5 (`:524-579`); writes `humbleLocalRedeemedStore.set(composite, { redeemedAt, source: 'ownership-exact' })`. Backend test `'exact-match owned+REVEALED key settles to REDEEMED source: ownership-exact...'` passes. Operator-observed live (checkpoint log item 6): 12 real entries settled 2026-09-09, all `matchConfidence: exact`. |
| 9 | Fuzzy-match owned+REVEALED key is NEVER auto-settled | VERIFIED | Guard 2 (`key.matchConfidence !== 'exact'` → return unmodified) in `recomputeOwnership`; backend test coverage; operator-observed live: zero of 8 fuzzy-matched keys settled. |
| 10 | Undo of an auto-settle is durable — does not re-settle on next recompute | VERIFIED | `undoRedeemed` writes a decline record to `humbleSettleDeclinedStore` only when the reversed record's `source === 'ownership-exact'` (`library.ts:1510-1511`); guard 5 in `recomputeOwnership` reads it back. Operator-observed live: the one real falsification test (a re-sync after Undo) did not re-settle. |
| 11 | The renderer can distinguish an ownership-inferred settle from a user's explicit "Mark as redeemed" | VERIFIED | `ClaimAnnotation.redeemedSource` (`src/common/types/humble.ts:240`), populated by `getClaimAnnotations` (`library.ts:838+`), defaulting a missing `source` to `'user'`. |
| 12 | An auto-settled key's Undo is REACHABLE in the UI (not just backend-capable) | VERIFIED | `HumbleKeyRow`'s 4th D-22 exception `settleAction` prop (`index.tsx:116,317-340`); `HumbleKeyGroup` threads `settleActionFor` (`index.tsx:96`); `All/index.tsx` fetches `humbleGetClaimAnnotations` on mount and gates `settleActionFor` strictly on `redeemedSource === 'ownership-exact'` (`:81-100`), calling `window.api.humbleUndoRedeemed` on click. Operator-observed live: "3, confirmed moved successfully" / "4. refreshed stayed" (checkpoint log). |
| 13 | A user-marked (non-auto-settled) REDEEMED key does NOT gain a second Undo in the All tab | VERIFIED | `settleActionFor` returns `undefined` unless `redeemedSource === 'ownership-exact'` exactly; `HumbleKeyRow`'s `!claimAction && settleAction` guard additionally suppresses double-rendering if both were ever supplied. Test: `"renders exactly one Undo control when BOTH claimAction and settleAction are supplied — claimAction wins"`. |
| 14 | The owning todo no longer asserts the false Activate-button premise, and records how it was measured | VERIFIED | `.planning/todos/pending/2026-08-23-humble-integrated-activation-reconcile-key-state-with-steam-.md` — `status: completed`, `resolves_phase: "42"`, carries the 4-row verdict table with file:line citations, the A1 correction (`key_type` is `gog_keyless`, not `gog`), commit `af1a947c4`. |

**Score:** 14/14 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Visual verification (both themes / no layout shift) against the CURRENT row markup | Phase 43 | Phase 43 goal explicitly redesigns the Humble Keys row ("a three-column row whose KEY column is action-scenario driven"). Checkpoint-log items 3/4 passed against pre-`260908-vo4` and `vo4`-superseded geometry respectively; re-verifying now would be measuring markup Phase 43 replaces. Two open `ready: live-gate` todos track the residue explicitly. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/humble/keyTypePresentation.ts` | Pure key_type→presentation+redeem-target table | VERIFIED | 158 lines, exports `HUMBLE_REDEEM_HELP_URL`, `HumbleStoreLogoId`, `HumbleKeyTypePresentation`, `HumbleRedeemTarget`, `getKeyTypePresentation`, `getRedeemTarget`. No React, no i18n, no I/O. |
| `src/backend/humble/__tests__/keyTypePresentation.test.ts` | Unit coverage for every row + unknown branch | VERIFIED | 252 lines, passes. |
| `src/backend/humble/electronStores.ts` | `HumbleLocalRedeemedRecord` widened, `humbleSettleDeclinedStore` added | VERIFIED | `source?: 'user' \| 'ownership-exact'` on the record; new store defined + exported + registered. |
| `src/common/types/humble.ts` | `ClaimAnnotation.redeemedSource` | VERIFIED | Present at line 240. |
| `src/backend/humble/library.ts` | Auto-settle inside `recomputeOwnership`, durable Undo | VERIFIED | `:493-596` settle block, `:1496-1520` `undoRedeemed` decline-write. |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | Table-driven store indicator + `settleAction` exception | VERIFIED | Imports table at `:12-16`, resolves at `:187-192`; `settleAction` prop rendered `:317-340`. |
| `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` | Table-driven 3-way redeem action | VERIFIED | Imports table at `:10-13`, resolves at `:664-702`. |
| `src/frontend/screens/Humble/Keys/All/index.tsx` | Claim-annotation fetch + settle-undo wiring | VERIFIED | `:44-100`; only 135 lines, no stub markers. |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx` | `settleActionFor` threaded to `HumbleKeyRow` | VERIFIED | `:25-27` prop, `:96` usage. |
| `public/locales/en/gamelib.json` + 48 other locales | New i18n keys (`platformOther`, `openStore`, `settledFromOwnership`) | VERIFIED | All 3 keys present in all 49 `gamelib.json` locale files (zero missing). |
| `.planning/todos/pending/2026-08-23-humble-integrated-activation-reconcile-key-state-with-steam-.md` | Corrected problem statement + `resolves_phase` | VERIFIED | `status: completed`, `resolves_phase: "42"`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `HumbleKeyRow/index.tsx` | `common/humble/keyTypePresentation` | `import { getKeyTypePresentation, ... } from 'common/humble/keyTypePresentation'` | WIRED | Line 12-16, called at line 187. |
| `HumbleClaimWizard/index.tsx` | `common/humble/keyTypePresentation` | `import { getKeyTypePresentation, getRedeemTarget } from ...` | WIRED | Line 10-13, called at lines 664/668. |
| `library.ts recomputeOwnership` | `humbleLocalRedeemedStore` | `.set(composite, { redeemedAt, source: 'ownership-exact' })` | WIRED | `:568-571`, guarded by 5 preconditions, test-covered. |
| `library.ts undoRedeemed` | `humbleSettleDeclinedStore` | `.set(composite, { declinedAt })` when prior source was `'ownership-exact'` | WIRED | `:1510-1511`. |
| `All/index.tsx` | `window.api.humbleGetClaimAnnotations` / `humbleUndoRedeemed` | mount-effect fetch + `settleActionFor.onUndoSettle` | WIRED | `:44-100`; both success and failure paths re-fetch annotations. |
| `HumbleKeyGroup/index.tsx` | `HumbleKeyRow`'s `settleAction` prop | `settleAction={settleActionFor?.(key)}` | WIRED | `:96`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `All/index.tsx` `annotations` state | `humble.keys` (from `ContextProvider`) driving row render; `annotations` driving settle-undo gating | `window.api.humbleGetClaimAnnotations()` → `HumbleLibrary.getClaimAnnotations()` reads `humbleLocalRedeemedStore` (real electron-store, not a static return) | Yes | FLOWING |
| `HumbleKeyRow` `platformPresentation` | `humbleKey.platform` (real synced field) | `getKeyTypePresentation(humbleKey.platform)` — pure table lookup, no static empty return | Yes | FLOWING |
| `recomputeOwnership`'s settle | `mutatedKeys` | `dedupRecomputeOwnership(entry.keys, steamGames, ...)` reads live `getSteamGate()` snapshot, not a hardcoded fixture | Yes | FLOWING |

### Behavioral Spot-Checks

Not applicable in the curl/CLI sense — this is a React/Electron/IPC surface with no standalone runnable entry point outside the app shell. Verified instead via targeted, scoped `jest` runs (below) plus the operator's live-app checkpoint log (2026-09-09), which is the load-bearing behavioral evidence for the settle/undo half.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend Humble suite (incl. `keyTypePresentation`, `library` settle/undo tests) | `npx jest --selectProjects Backend --testPathPattern humble` | 19 suites, 701 tests passed | PASS |
| Frontend Humble suite (incl. `HumbleKeyRow`, `HumbleClaimWizard`, `All`) | `npx jest --selectProjects Frontend --testPathPattern "Humble"` | 8 suites, 110 tests passed | PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| Planning gates | `pnpm planning-gates` | 9/9 passed | PASS |

### Probe Execution

Not applicable — this is not a migration/tooling phase and no `scripts/*/tests/probe-*.sh` files or probe references exist in the phase's PLAN/SUMMARY/CONTEXT files.

### Requirements Coverage

REQ-42-01 through REQ-42-08 are phase-local requirement IDs minted by `42-COVERAGE.md` (this phase predates the ROADMAP's `success_criteria` field being populated for phase 42 — `gsd-sdk query roadmap.get-phase 42` returns `"success_criteria":[]`). They do not appear in `.planning/REQUIREMENTS.md` (that file scopes the v0.2/v0.3 milestone only). Traceability is therefore assessed against CONTEXT.md's 6 success criteria + assumption A1, which `42-COVERAGE.md` already maps 1:1 to REQ-42-01..08.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| REQ-42-01 | 42-01 | ONE pure key_type presentation table, explicit unknown branch | SATISFIED | `keyTypePresentation.ts` |
| REQ-42-02 | 42-04 | `HumbleKeyRow` caption table-driven | SATISFIED | `HumbleKeyRow/index.tsx:187-192` |
| REQ-42-03 | 42-05 | `HumbleClaimWizard` table-driven 3-way redeem | SATISFIED | `HumbleClaimWizard/index.tsx:664-702` |
| REQ-42-04 | 42-02, 42-03 | Auto-settle exact-match owned+REVEALED with provenance | SATISFIED | `library.ts:493-579` |
| REQ-42-05 | 42-03 | Fuzzy NEVER auto-settles | SATISFIED | Guard 2, `library.ts:541-543` |
| REQ-42-06 | 42-03, 42-06 | Auto-settle Undo reachable in UI | SATISFIED | `All/index.tsx`, `HumbleKeyGroup`, `HumbleKeyRow` settleAction chain |
| REQ-42-07 | 42-07 | Owning todo corrected, measurement recorded | SATISFIED | Todo `status: completed`, `resolves_phase: "42"` |
| REQ-42-08 | 42-07 | A1 (`key_type === 'gog'`) confirmed live or recorded unconfirmed | SATISFIED | Corrected to `gog_keyless` via live sync, fixed by quick task 260908-uic, recorded in CHECKPOINT-LOG item 1 |

No orphaned requirements found for Phase 42 in `.planning/REQUIREMENTS.md` (the file does not map any IDs to this phase — it predates phase 42's numbering scheme).

### Anti-Patterns Found

None. Scanned all 17 files touched across plans 42-01 through 42-07 (`keyTypePresentation.ts`, its test, `electronStores.ts`, `common/types/humble.ts`, `library.ts` + its test, `jest.config.js`, `svgReactStub.tsx`, `svgReactResolution.test.tsx`, `HumbleKeyRow/index.tsx` + test, `HumbleClaimWizard/index.tsx` + test, `All/index.tsx` + test, `HumbleKeyGroup/index.tsx`, `gamelib.json`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` — zero hits.

One residual `isSteam = humbleKey.platform === 'steam'` boolean survives in both `HumbleKeyRow/index.tsx:181` and `HumbleClaimWizard/index.tsx:81`. Traced both usages: neither derives a display name, logo, or redeem URL — they gate an unrelated pre-existing (Phase 14 / `260823-op3`) UX decision (button copy, and the wizard's one-click-Steam-API vs. reveal-then-manual-copy step machine). This is NOT a surviving instance of the "three ad-hoc key_type interpretation call sites" the phase targeted (those were: the row's raw-token caption, the wizard's "Redeem on {{platform}}" label, and the wizard's Steam-vs-help URL fork — all three now route through the table). Recorded here for transparency, not as a gap.

Two lint warnings exist in `library.ts` (`@typescript-eslint/require-await` on `markRedeemed`/`undoRedeemed`) — confirmed via `git log -L` to predate this phase (introduced in commit `33df5ebf3`, Phase 14-03), consistent with the orchestrator's "zero net-new lint warnings" measurement.

### Human Verification Required

None. This phase went through its own `checkpoint:human-verify` gate directly with the operator (`42-07-CHECKPOINT-LOG.md`, status: COMPLETE, all 6 items resolved, 2026-09-09). The two items that passed against now-superseded row markup (both-themes color inheritance, layout-shift geometry) are explicitly deferred to Phase 43's redesign (see Deferred Items above) and tracked by two standalone `ready: live-gate` todos outside this phase's scope — re-verifying them here would measure markup Phase 43 replaces, not this phase's deliverable.

### Gaps Summary

No gaps found. All 14 derived observable truths (covering the table's construction, both consumer call sites' wiring, the settle/undo machinery, and the todo correction) verified against the codebase — not just against SUMMARY.md claims. Backend (701 tests) and frontend (110 tests) Humble-scoped jest suites pass, `tsc --noEmit` exits 0, `pnpm planning-gates` is 9/9, and zero debt-marker anti-patterns were found in any of the 17 phase-touched files. The phase's two explicitly-deferred visual-verification items are honestly carried forward to Phase 43 (whose goal is a full redesign of the same row) rather than being silently dropped or falsely marked done.

---

_Verified: 2026-09-08T19:48:54Z_
_Verifier: Claude (gsd-verifier)_
