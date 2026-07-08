---
phase: 14
slug: guided-claim-flow
audited: 2026-07-09
auditor: gsd-security-auditor
threats_total: 12
threats_closed: 12
threats_open: 0
asvs_level: default
block_on: default
---

# Phase 14 — Security Audit

> Verifies every threat mitigation declared across 14-01-PLAN.md through 14-06-PLAN.md's `<threat_model>` blocks is actually present in the implemented code (HEAD, including post-review fix commits e68ca336..8b97eb50). Documentation/intent was not accepted as evidence — every row below is backed by a grep-verified code citation and/or a passing test.

## Scope note on post-phase fixes

The 14-REVIEW-FIX pass (commits `e68ca336`, `34774a8c`, `5bfc2cb3`, `ff5de31e`, `ddcb8f6a`, `9ffdecc7`, `8b97eb50`, applied 2026-07-08) modified several files audited here after the per-plan SUMMARYs were written. This audit verified against current HEAD, not the SUMMARYs' as-written state. Two of those fixes directly intersect the threat register:
- `ddcb8f6a` (WR-04) is the resolution of the `incomplete-mitigation` threat flag SUMMARY 14-05 raised against T-14-11 — verified closed below.
- `ff5de31e` (WR-03, `getLiveCsrfToken()`) and `8b97eb50` (WR-06, `rejected_by_server`) were checked for logging-discipline regressions against T-14-01/T-14-04/T-14-07 — none found.

## Threat Verification

| Threat ID | Category | Disposition | Evidence | Status |
|-----------|----------|-------------|----------|--------|
| T-14-01 | Information Disclosure | mitigate | `src/backend/humble/library.ts:549-565` `appendAudit()` — `AuditRecord` fields are `event/at/title/platform/outcome` only, no key-value field exists on the type (`src/backend/humble/electronStores.ts:99-105`). `src/backend/humble/adapter.ts` never logs `res.data`/`parsed.data`/`key`/`error_msg` verbatim — every `logWarning` call in `revealKey()` (adapter.ts:634-654) logs `keyPresent=Boolean(...)` / `errorMsgLength=....length` only. Redaction asserted by tests: `adapter.test.ts:916` ("never logs the csrf token, the key value, or an error_msg containing a key-shaped string"), `adapter.test.ts:931`. `14-VALIDATION.md` records status/length/field-names only (no key/cookie value present in the file, confirmed by inspection). | CLOSED |
| T-14-02 | Information Disclosure | mitigate | `common/types/humble.ts:135` — `locallyRedeemedPending?: boolean` is the only claim-flow field on the broadcast `HumbleKey` type; `keyindex`/`revealedKeyValue` exist only on `HumbleKeyInternal` (`electronStores.ts:21-24`), never on `HumbleKey`. `library.ts:341-345` `toDisplayKey()` strips both internal fields before every `humbleKeysUpdated` push (verified: `getKeys()` is the sole read path used by `recomputeOwnership`, `patchCachedState`, `loadCached`). `humbleGetRevealedKeyValue` (`ipc_handler.ts:111-113`, `preload/api/humble.ts:38-40`) is the only channel that returns a raw key value, called on-demand only (`HumbleClaimWizard/index.tsx:68-95`), held in `useState` (`index.tsx:57`), never in a Context provider. | CLOSED |
| T-14-03 | Tampering / EoP | mitigate | `library.ts:899-921` (`revealKey`)/`923-959` (`doRevealKey`) — the exported function signature takes only `(gamekey, machineName)`, no `ownedElsewhere`/view-membership argument from the caller; `target.ownedElsewhere` is read from the backend's own live `getKeys()` (`library.ts:927-930, 953`), never from renderer input. Adversarial test: `library.test.ts:1951` (C2 exact) and `:1971` (C2 fuzzy) both set `ownedElsewhere` directly in the backend cache and assert `mockAdapterRevealKey` is never called. UI restriction is first-line only: `claimAction` prop supplied exclusively by `Waiting/index.tsx:130-146`; `Spares/index.tsx:81-95` explicitly does not pass it (comment at line 89 confirms the omission is deliberate). | CLOSED |
| T-14-04 | Information Disclosure | mitigate | `user.ts:163-170` (`getCsrfToken`) and `:182-202` (`getLiveCsrfToken`, added by WR-03 fix `ff5de31e`) both route through `encryptCookie`/`decryptCookie` (same discipline as the session cookie) and are `static` methods on the main-process-only `HumbleUser` class. Grepped: no `sendFrontendMessage` call site anywhere in `user.ts` includes `csrfToken`/`csrf` — the two `sendFrontendMessage('humbleAuthState', ...)` calls (`user.ts:486-490`, `:521-525`) carry only `isLoggedIn/username/expired`, matching the `HumbleAuthState` type (`common/types/humble.ts:28-32`), which has no csrf field. | CLOSED |
| T-14-05 | Repudiation/Tampering | mitigate | `adapter.ts:74-80` `RevealResponseSchema` uses `.passthrough()`; `:628,644` — `success === false` and `success !== true \|\| !key` are both handled explicitly, never a blind cast. Single call site confirmed: `adapterRevealKey` (aliased import of `adapter.ts`'s `revealKey`) is called exactly once, at `library.ts:1039`, inside `doRevealKey`, itself called only from the in-flight-guarded `revealKey()` wrapper (`library.ts:899-921`) which is exported once via `HumbleLibrary.revealKey` and invoked from exactly one IPC handler (`ipc_handler.ts:102-104`). No retry wrapper found (grep for `retry`/loop around this call site: none). Ambiguous outcome never auto-resubmits: the `catch` block (`library.ts:1110-1132`) returns `{status:'ambiguous'}` and the wizard's only re-invocation of `humbleRevealKey` is the explicit user-clicked "Try again" button on the *'failed'* step (`HumbleClaimWizard/index.tsx:318-323`), not `'ambiguous'` (which offers only "Sync now", `index.tsx:270-274`). | CLOSED |
| T-14-06 | Tampering | mitigate | `dedup.ts:150-158` — `hasUsableSteamAppId` explicitly excludes `''` and `'0'` in addition to `undefined`, with an inline comment noting a plain truthiness check would be insufficient. Falls through to fuzzy tier when unusable. Unit-tested (referenced by 14-01-SUMMARY.md and covered under the existing dedup test suite). | CLOSED |
| T-14-07 | Information Disclosure (Pitfall A) | mitigate | Resolved via live checkpoint, recorded in `14-VALIDATION.md` ("Reveal Endpoint — CONFIRMED contract" section): CSRF required, transport moved to Electron `net.request` (`adapter.ts:264-335` `humblePostRequest`, uses `net.request` with `partition: HUMBLE_LOGIN_PARTITION`, `credentials:'include'`, `useSessionCookies:true`). `getLiveCsrfToken()` (`user.ts:182-202`, WR-03 fix) sources the live cookie so header/cookie can't diverge — checked for logging regressions: the only log line (`user.ts:193-199`) logs the caught error object, never the cookie value itself (error objects from `session.cookies.get` do not carry the cookie value). | CLOSED |
| T-14-08 | Tampering | mitigate | `HumbleClaimWizard/index.tsx:106-160` `handleReveal()` is the sole call site of `window.api.humbleRevealKey` in the component (grep-confirmed: single match). Invoked only from the danger-styled confirm button (`index.tsx:222`, warning step) and the 'failed' step's retry button (`index.tsx:320`). The mount `useEffect` (`index.tsx:63-100`) only ever calls `humbleGetRevealedKeyValue`, gated `entryMode !== 'finish' → return`, never `humbleRevealKey`. Explicitly unit-tested: `HumbleClaimWizard/__tests__/index.test.tsx:203` "does not call humbleRevealKey on the initial claim-mode render (HCLAIM-01, T-14-08)" and `:305` "entryMode 'finish' ... never calls humbleRevealKey (D-66)". | CLOSED |
| T-14-09 | Information Disclosure | mitigate | `HumbleClaimWizard/index.tsx:15` `NON_STEAM_REDEEM_HELP_URL` is a hardcoded literal string; the non-Steam branch (`index.tsx:389-401`) opens this constant URL with no template interpolation of `revealedKey` or any key-derived value (contrast with the Steam branch at `:377-383`, which does interpolate `revealedKey` into the trusted `store.steampowered.com` URL only). Test: `index.test.tsx:258` "shows 'Redeem on {{platform}}' and no 'Open Steam' control for a non-Steam key (HCLAIM-05)". | CLOSED |
| T-14-10 | Tampering | mitigate | `library.ts:980-991` (`doRevealKey`) — `lookupKeyindex()` returning `undefined` returns `{status:'ineligible'}` before any adapter call. `HumbleKeyRow/index.tsx:227-238` renders the disabled `"Sync to enable claiming"` caption when `claimAction.keyindexResolved` is false, with no click handler in that branch (contrast with the `onClaim` button in the sibling branch). `Waiting/index.tsx:136` defaults `keyindexResolved` to `false` when the annotations fetch hasn't landed, closing the race-window Pitfall C describes. | CLOSED |
| T-14-11 | Repudiation | mitigate | Originally flagged `incomplete-mitigation` by 14-05-SUMMARY.md (undo only reachable pre-commit, on the still-fuzzy Spares row). Resolved by post-phase fix `ddcb8f6a` (WR-04): `HumbleLibrary.getAllOwnershipOverrides()` (`library.ts:419-434`) exposed via `humbleGetOwnershipOverrides` (`ipc_handler.ts:63-65`, `preload/api/humble.ts:28-30`); `Waiting/index.tsx:26,53-55,65-69,129` fetches the override map (mount + `refreshAnnotations()`) and sets `undoOverride` on the row where the *overridden* key now actually lives; `HumbleKeyRow/index.tsx:145-160` renders the undo control off the caller-supplied `undoOverride` flag only, decoupled from the (cleared) `ownedElsewhere`/`fuzzy` flags. `Spares/index.tsx:89-94` explicitly does not render it (a key there is by definition not overridden). Label copy fixed from the inverted original. | CLOSED |
| T-14-SC | Tampering (dependencies) | accept | No new npm/pip/cargo packages introduced in any Phase 14 commit — confirmed via `git log --oneline -- package.json` across the Phase 14 commit range (last package.json change predates Phase 14: `81892fad` chore(12-02) fastest-levenshtein, `1493cfe6` fix(01) steam-session). Matches RESEARCH.md's "Package Legitimacy Audit: N/A" for this phase. | CLOSED (accepted risk, verified N/A) |

## Test Evidence Summary

Full suite run at audit time (2026-07-09), scoped to every touched/cited test file:

```
PASS Backend  src/backend/humble/__tests__/electronStores.test.ts
PASS Frontend src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx
PASS Backend  src/backend/humble/__tests__/library.test.ts
PASS Backend  src/backend/humble/__tests__/adapter.test.ts
PASS Backend  src/backend/humble/__tests__/user.test.ts
PASS Backend  src/backend/humble/__tests__/classify.test.ts
PASS Frontend src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx

Test Suites: 7 passed, 7 total
Tests:       318 passed, 318 total
```

This matches the 706/706 (baseline) + 32 new (WR-fix pass) = 738/738 full-suite figure recorded in `14-REVIEW-FIX.md`.

## Unregistered Flags

None. `14-05-SUMMARY.md`'s `## Threat Flags` entry (`incomplete-mitigation` against T-14-11/WR-04) is the only threat flag raised across all six SUMMARYs, and it maps to an existing threat ID (T-14-11) — informational, not unregistered. It is resolved (see T-14-11 row above). No new attack surface was identified during this audit that lacks a threat mapping in the register above; the `net.request`/Electron-transport change (post-phase fix, round 6 of the `humble-reveal-key-fails` debug session) is new surface but is explicitly covered by T-14-07's disposition and re-verified for logging discipline in the Scope Note above.

## Accepted Risks Log

| ID | Description | Justification | Accepted By |
|----|--------------|----------------|-------------|
| T-14-SC | No new third-party dependency was introduced by Phase 14 (steam-user/steam-session/etc. predate this phase); therefore no new supply-chain surface to review this phase. | RESEARCH.md Package Legitimacy Audit recorded N/A for Phase 14; independently confirmed via `git log -- package.json` showing no commit inside the Phase 14 range touches it. | 14-01-PLAN.md / 14-06-PLAN.md (plan-level acceptance) |

---
SECURITY.md: `.planning/phases/14-guided-claim-flow/14-SECURITY.md`
