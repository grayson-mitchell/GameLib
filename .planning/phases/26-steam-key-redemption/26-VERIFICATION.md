---
phase: 26-steam-key-redemption
verified: 2026-07-20T16:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live redeem of a valid unowned Steam test key"
    expected: "Success message names the redeemed game/package, and the game appears in the Steam library view after refresh, with no app restart"
    why_human: "Requires a real authenticated steam-user CM session plus a real spare Steam key; cannot be exercised against the mocked steam-user client used by the automated test suite"
  - test: "Redeem a key for an already-owned title"
    expected: "Distinct 'already owned' message (copy.ts already-owned bucket), not the generic invalid/failed copy"
    why_human: "Needs a real key for a title the account already owns; the classifier's mapping is unit-tested but the live acceptance criterion (SPEC REQ5) explicitly calls for a live check"
  - test: "Redeem a malformed-but-shaped (10-40 char, valid charset) key that Steam rejects as invalid"
    expected: "Distinct 'invalid key' message, no crash, modal stays open"
    why_human: "Needs a live rejection round-trip from Steam; client-side isObviouslyMalformed only catches obviously-wrong shapes, not Steam-side invalid keys"
  - test: "Entry point visibility toggling with a real Steam login/logout cycle"
    expected: "Sidebar 'Redeem a Steam key' item is absent with no Steam session and appears immediately after a real Steam login, opening the modal on click"
    why_human: "Automated test mocks the ContextProvider steam.username value directly; a live login/logout cycle exercising the real IPC + context state update path is not covered by the mocked test"
  - test: "Log inspection after a real redeem attempt (any outcome)"
    expected: "No raw key value appears anywhere in gamelib.log"
    why_human: "Automated test asserts no mock logger call contains the key string; a full log-file inspection after a real run is the SPEC-mandated final check"
---

# Phase 26: Steam Key Redemption Verification Report

**Phase Goal:** Let a user redeem a Steam product key into their own Steam library from inside GameLib, without typing it into the Steam client. Manual entry point (first vertical slice): login-gated UI to paste a loose Steam key → client-side format validation → backend `SteamUser.redeemKey(store, key)` wrapper over the authenticated CM session → branch on `EPurchaseResult` into distinct outcomes → newly-owned game appears in the library. Store-aware-ready UI (store is a parameter, only Steam wired).

**Verified:** 2026-07-20
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REQ-26-01: Login-gated Steam key entry point exists, absent when logged out, opens modal when logged in | VERIFIED | `SidebarLinks/index.tsx:269-277` gates a button-style `SidebarItem` on `steam.username`, `onClick={() => handleRedeemKeyDialog(true)}`. Test `SidebarLinks/__tests__/index.test.tsx` — both cases pass (`npx jest .../SidebarLinks` → 2/2 green, run live during this verification). |
| 2 | REQ-26-02: Backend redeem wrapper + IPC — `SteamUser.redeemKey(store,key)` over CM session, exposed via `redeemSteamKey` IPC | VERIFIED | `user.ts:625-654` implements `redeemKey`, calling `ensureConnected()`/`getClient()` then `client.redeemKey(key)` in try/catch. Three-file IPC lockstep confirmed: `ipc.ts:258-261` (`redeemSteamKey` in `AsyncIPCFunctions`), `preload/api/steam.ts` (`export const redeemSteamKey = makeHandlerInvoker('redeemSteamKey')`), `main.ts:929-931` (`addHandler('redeemSteamKey', ...) => SteamUser.redeemKey(store, key)`). `npx jest .../user.test.ts -t redeemKey` → 12/12 green (live run). |
| 3 | REQ-26-03: Client-side format validation rejects empty/malformed input before any IPC call | VERIFIED | `steamKeyValidation.ts` exports `normalizeKey`/`isObviouslyMalformed` implementing the length/charset rule (no 5-5-5 anchor — confirmed no `{5}` literal). `RedeemSteamKeyDialog/index.tsx:63-68` calls `isObviouslyMalformed(key)` and `return`s before any `window.api.redeemSteamKey` call. `npx jest .../steamKeyValidation.test.ts` → 9/9 green (live run). |
| 4 | REQ-26-04: Success outcome shows game/package name and refreshes library, no restart | VERIFIED (code) / HUMAN NEEDED (live) | `redeemKey` resolves to `classifyPurchaseResult` → `outcome:'success'`; dialog reads `Object.values(result.packageList)[0]` as `packageName`, renders it via `redeemOutcomeCopy`, then calls `refreshLibrary({ library: 'steam' })` (context method wrapping `window.api.refreshLibrary`). Unit-verified via `user.test.ts` OK(0) case. Live confirmation (real key, real library update, no restart) requires a human with a spare test key — tracked below. |
| 5 | REQ-26-05: Already-owned / invalid / rate-limited surfaced as 3 distinct non-generic messages | VERIFIED (code) / HUMAN NEEDED (live for 2 of 3) | `classifyPurchaseResult` in `user.ts:667-699` buckets all 8 `EPurchaseResult` values into exactly 4 outcomes per the SPEC table; `copy.ts` returns 4 (+error) mutually distinct strings, asserted by `copy.test.ts` (green, live run). Rate-limited mapping is verified by unit test per SPEC's explicit allowance ("verified via result-code mapping if not reproducible live"). Already-owned/invalid live confirmation requires human test keys — tracked below. |
| 6 | REQ-26-06: Redeem surface carries a store field/param; only Steam wired, no hard-coded Steam-only assumption | VERIFIED | `store: 'steam'` threaded through `RedeemKeyResult` (`common/types/steam.ts:24-29`), IPC payload type (`ipc.ts:258-261`), backend signature (`redeemKey(store: 'steam', key: string)`), and dialog call site (`redeemSteamKey({ store: 'steam', key: ... })`). No GOG/multi-store code added; store is a literal-union parameter, not a hard-coded assumption. |

**Score:** 6/6 truths structurally/unit-verified; 2 of 6 additionally carry mandatory live-hardware sub-checks per SPEC (REQ-26-04 success round-trip, REQ-26-05 already-owned/invalid live confirmation) that cannot be exercised against the mocked `steam-user` test double.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/types/steam.ts` | `RedeemKeyResult`/`RedeemKeyOutcome` with `store` field | VERIFIED | Lines 12-29, matches plan interface exactly |
| `src/backend/storeManagers/steam/user.ts` | `redeemKey` + `classifyPurchaseResult` | VERIFIED | Lines 609-700; guard clause, try/catch, never throws across IPC boundary, status-only logging |
| `src/backend/storeManagers/steam/__tests__/user.test.ts` | Table-driven tests, all 8 EPurchaseResult values | VERIFIED | `describe('redeemKey()')` block, 12 tests, all green on live run |
| `src/frontend/helpers/steamKeyValidation.ts` | `normalizeKey`/`isObviouslyMalformed` | VERIFIED | Matches plan spec exactly, no 5-5-5 anchor |
| `src/frontend/helpers/__tests__/steamKeyValidation.test.ts` | Table-driven accept/reject incl. over-rejection guards | VERIFIED | Path deviates from plan's literal colocated path (documented, justified — project-wide `testMatch` convention requires `__tests__/`); 9/9 green on live run |
| `src/common/types/ipc.ts` | `redeemSteamKey` in `AsyncIPCFunctions` | VERIFIED | Line 258-261, imports `RedeemKeyResult` |
| `src/preload/api/steam.ts` | `redeemSteamKey` invoker export | VERIFIED | `export const redeemSteamKey = makeHandlerInvoker('redeemSteamKey')` |
| `src/backend/main.ts` | `addHandler('redeemSteamKey', ...)` | VERIFIED | Lines 929-931, delegates to `SteamUser.redeemKey(store, key)` |
| `src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts` | Pure outcome→copy map, 4 distinct messages | VERIFIED | 4 distinct + error message, `copy.test.ts` green |
| `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx` | Dialog-based modal, validates, redeems, shows outcome, refreshes library, View-in-library jump | VERIFIED | Full implementation present and matches plan; malformed-input early-return confirmed, `redeemSteamKey`/`refreshLibrary` calls confirmed, no raw-key logging (grep clean) |
| `src/frontend/state/{types.ts,ContextProvider.tsx,GlobalState.tsx}` | `showRedeemKeyDialog`/`handleRedeemKeyDialog` triad | VERIFIED | All three files updated consistently |
| `src/frontend/App.tsx` | Mounts `<RedeemSteamKeyDialog />` | VERIFIED | Line 105, inside always-mounted dialog list |
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` | Login-gated sidebar item under Settings | VERIFIED | Lines 269-277, `elementType="button"`, gated on `steam.username` |
| `.../SidebarLinks/__tests__/index.test.tsx` | Login-gating test (hidden/shown) | VERIFIED | 2/2 tests green on live run |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `user.ts redeemKey` | `client.redeemKey(key)` | `ensureConnected()` + `getClient()` guard, try/catch | WIRED | Confirmed by reading source; resolve and reject paths both handled |
| `classifyPurchaseResult` | `SteamUserLib.EPurchaseResult` | namespaced enum switch | WIRED | Confirmed — never references the 84-value `EPurchaseResultDetail` |
| `main.ts addHandler('redeemSteamKey')` | `SteamUser.redeemKey` | destructure `{store,key}`, call `SteamUser.redeemKey(store, key)` | WIRED | Line 929-931 |
| `ipc.ts` / `preload/api/steam.ts` / `main.ts` | three-file lockstep | matching `redeemSteamKey` identifier across all three | WIRED | All three present and mutually consistent |
| `RedeemSteamKeyDialog.onRedeem` | `window.api.redeemSteamKey` | called only after `isObviouslyMalformed` fails to short-circuit | WIRED | Confirmed by reading `index.tsx:63-79` |
| `RedeemSteamKeyDialog` success path | `refreshLibrary({ library: 'steam' })` (context method → `window.api.refreshLibrary`) | `await refreshLibrary(...)` on `outcome==='success'` | WIRED | Confirmed; context method internally calls `window.api.refreshLibrary(library)` per `GlobalState.tsx:924-937` |
| `SidebarLinks` Redeem item | `handleRedeemKeyDialog(true)` | button `onClick` | WIRED | Confirmed by test asserting `handleRedeemKeyDialog` called with `true` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `RedeemSteamKeyDialog` | `result` (RedeemKeyResult) | `window.api.redeemSteamKey` → IPC → `SteamUser.redeemKey` → live `client.redeemKey()` over authenticated CM session | Yes — no static/mock fallback in production code path | FLOWING |
| `RedeemSteamKeyDialog` | `matchedGame` (View-in-library jump) | `steam.library` (refreshed via `refreshLibrary`) title-matched via `fuzzyMatch`/`normalizeTitle` | Yes, with graceful degrade to no-link if no confident match (Pitfall 3 handled) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend redeemKey classifies all 8 EPurchaseResult values | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -t redeemKey` | 12/12 passed | PASS |
| Backend user.test.ts full file (no regressions) | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` | 61/61 passed | PASS |
| Frontend validator, copy map, sidebar gating tests | `npx jest src/frontend/helpers/__tests__/steamKeyValidation.test.ts src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/copy.test.ts src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx` | 20/20 passed | PASS |
| No new TypeScript errors in phase-touched files | `npx tsc --noEmit -p .` filtered to phase files | No matches (clean) | PASS |
| Live redeem round-trip (real CM session + real key) | — | Not run — requires live Steam session and real spare test keys | SKIP (routed to human verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-26-01 | 26-05 | Login-gated entry point | SATISFIED | Sidebar item + gating test, both green |
| REQ-26-02 | 26-01, 26-03 | Backend redeem wrapper + IPC | SATISFIED | `redeemKey` + three-file IPC lockstep, tests green |
| REQ-26-03 | 26-02 | Client-side format validation | SATISFIED | Validator + test, green |
| REQ-26-04 | 26-04 | Success outcome handling | SATISFIED (code) / NEEDS HUMAN (live round-trip) | Code path complete; SPEC explicitly requires live test-key confirmation |
| REQ-26-05 | 26-01, 26-04 | Non-success outcome handling | SATISFIED (code) / NEEDS HUMAN (2 of 3 outcomes live) | Classifier + copy tests green; SPEC requires live confirmation for already-owned/invalid, permits mapping-only for rate-limited |
| REQ-26-06 | 26-01, 26-03, 26-04 | Store-aware-ready UI | SATISFIED | `store: 'steam'` threaded through all layers, no hard-coded single-store assumption |

All 6 requirement IDs present in `.planning/REQUIREMENTS.md` Phase 26 section and Traceability table, each marked Complete — no orphaned requirements found. This matches the plan frontmatter requirement declarations across 26-01..26-05 exactly (union = REQ-26-01..06, no gaps, no extras).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER found in any of the 13 phase-touched files | — | None — clean |

No blocker-level anti-patterns found. The prior code review (`26-REVIEW.md`) surfaced 3 Warnings (transport-error rejections classified as 'invalid' rather than 'error'; catch path logs nothing on the classified branch; IPC handler lacks defensive input-shape validation) and 2 Info items (DuplicatedKey bucketed as 'invalid' rather than 'already-owned'-adjacent; modal doesn't re-gate on live login state). Per the verification brief, these are tracked advisory items from a prior review pass and are **not** re-reported here as phase-blocking gaps — they do not prevent the phase goal (manual Steam key redemption) from being achieved; they are robustness/UX refinements on the error path.

### Human Verification Required

### 1. Live redeem of a valid unowned Steam test key

**Test:** Log into Steam in GameLib → open the redeem modal via the sidebar → paste a known-valid, unowned spare key → submit
**Expected:** Success message names the redeemed game/package (from `packageList`), and the game appears in the Steam library view after the automatic refresh, with no app restart
**Why human:** Requires a real authenticated `steam-user` CM session and a real spare Steam key; the automated suite mocks `steam-user` entirely

### 2. Already-owned key outcome

**Test:** Redeem a key for a title the account already owns
**Expected:** Distinct "already owned" message (not the generic invalid/failed copy)
**Why human:** SPEC REQ5 explicitly requires live verification via test keys for this outcome

### 3. Invalid/malformed key outcome (Steam-side rejection)

**Test:** Redeem a garbage-but-validly-shaped key (passes client-side format check, rejected by Steam)
**Expected:** Distinct "invalid key" message, modal stays open, no crash
**Why human:** Needs a live rejection round-trip from Steam's servers

### 4. Entry-point visibility across a real login/logout cycle

**Test:** With no Steam session, confirm the "Redeem a Steam key" sidebar item is absent; log into Steam; confirm it appears and opens the modal
**Expected:** Item hidden pre-login, visible + functional post-login
**Why human:** The automated test mocks `steam.username` directly in a stubbed context; a real IPC-driven login state transition is not exercised

### 5. Log inspection for raw key leakage

**Test:** After any real redeem attempt (any outcome), inspect `gamelib.log`
**Expected:** No raw key value appears anywhere in the log — only store/outcome/purchaseResultDetails status lines
**Why human:** Automated tests assert the mocked logger is never called with the key string; a real end-to-end log-file inspection is the SPEC-mandated final check (mirrors `doRevealKey` discipline)

### Gaps Summary

No code-level gaps found. All 6 phase requirements (REQ-26-01..06) are implemented, wired end-to-end, and covered by passing automated tests (verified by running the suites directly during this verification, not by trusting SUMMARY.md claims). Traceability rows for REQ-26-01..06 are present in `.planning/REQUIREMENTS.md` and marked Complete, closing the gap noted in `deferred-items.md`.

The phase cannot be marked fully `passed` because the SPEC itself (26-SPEC.md Acceptance Criteria + Requirements) mandates live-hardware confirmation with real Steam test keys for the success, already-owned, and invalid outcomes, and for the login-gated entry point's real (non-mocked) visibility toggle. These are explicitly out of reach for static/automated verification and are routed to human verification per this workflow's instructions, rather than being marked as failures.

---

_Verified: 2026-07-20_
_Verifier: Claude (gsd-verifier)_
