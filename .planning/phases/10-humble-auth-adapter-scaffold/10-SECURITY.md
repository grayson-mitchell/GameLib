---
phase: 10-humble-auth-adapter-scaffold
audited: 2026-07-05
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 23
threats_closed: 23
threats_open: 0
status: SECURED
---

# Phase 10 — Security Audit: Humble Auth Adapter Scaffold

Verifies every threat declared across `10-01-PLAN.md`..`10-06-PLAN.md` `<threat_model>` blocks
against the implemented code (read-only verification; no implementation files modified).
Cross-referenced against `10-REVIEW.md` (WR-01..WR-09) where review findings bear on a
registered threat's actual delivery.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-10-01 | Info Disclosure (adapter logging) | mitigate | CLOSED | `src/backend/humble/adapter.ts:104-111` (`mapAxiosError` logs a static string only), `describeSchemaFailure` (adapter.ts:127-154, structural zod issue paths/messages + length only); `adapter.test.ts:164-178` asserts no logged string contains the cookie, on both success and error paths |
| T-10-02 | Tampering (Humble JSON) | mitigate | CLOSED | `adapter.ts:161,178,195` — `Schema.safeParse` on every response; `schema_error` typed return, never a blind cast; `adapter.test.ts:194-198` |
| T-10-03 | Spoofing / access-denial confusion | mitigate | CLOSED | `adapter.ts:99-103` `mapAxiosError` — 401→`session_expired`, 403→`access_denied`, distinct branches; `adapter.test.ts` 401/403 cases |
| T-10-04 | Info Disclosure (cookie at rest) | mitigate | CLOSED | `user.ts:87-110` `encryptCookie` — `safeStorage.encryptString` + `HUMBLE_TOKEN_PREFIX`; on unavailable encryption sets `configStore.set('encryptionDegraded', true)` + `logWarning`; `user.test.ts:421-438` asserts both |
| T-10-05 | Info Disclosure (logs/IPC payloads) | mitigate | CLOSED* | `user.ts:301-304` docstring discipline + `finishLogin` never passes `cookieValue` to a logger; `HumbleAuthState` type structurally excludes the cookie (`common/types/humble.ts:31-35`); `user.test.ts:524-547` asserts no logger/`configStore.set` call receives the raw value. *Residual risk: see WR-03 note below — does not reopen this threat's literal disposition (no-log/no-IPC), but is a related store-write-discipline gap worth tracking. |
| T-10-06 | Tampering/Elevation (cross-domain cookie bleed) | mitigate | CLOSED | `constants.ts:11` `HUMBLE_LOGIN_PARTITION = 'persist:humble'`; `user.ts:200` `session.fromPartition(HUMBLE_LOGIN_PARTITION)`; `WebView/index.tsx:471-477` webview `partition={'persist:humble'}` for `runner === 'humble'` — main process and renderer share the same named, isolated partition, never the app's default session |
| T-10-07 | Info Disclosure (leftover session on disconnect) | mitigate | CLOSED** | `user.ts:398-408` `disconnect()` calls all five `clearX` methods + `configStore.clear()`; `user.test.ts:508-520` asserts all six calls. **Residual weakness (10-REVIEW.md WR-02, confirmed by reading `user.ts:398-408`): `configStore.clear()` executes LAST, after five awaited partition-clear calls with no try/catch — a single rejected Electron session API call leaves the encrypted (or plaintext-degraded) `sessionCookie` on disk after a user-confirmed Disconnect. The declared mitigation ("clears all five partition caches + configStore") is literally present and passes on the happy path; the gap is an unhandled-rejection edge case, not an absent mitigation. Recommend: `configStore.clear()` first, partition wipe in try/catch (per WR-02's proposed fix), before Phase 11 ships. |
| T-10-08 | Spoofing (401 vs 403 health check) | mitigate | CLOSED | `user.ts:378-393` `checkHealthAndFlagExpiry` — only `session_expired` sets `expired`+pushes `humbleAuthState`; `access_denied` is a no-op; `user.test.ts:440-485` covers both branches |
| T-10-09 | Info Disclosure (IPC payload shape) | mitigate | CLOSED | `common/types/ipc.ts:468` `humbleAuthState: (state: HumbleAuthState) => void`; `HumbleAuthState` (`common/types/humble.ts:31-35`) is `{ isLoggedIn; username?; expired? }` only — cookie structurally excluded from the channel signature |
| T-10-10 | Tampering (channel-name drift) | mitigate | CLOSED | `grep -c "humble:" src/common/types/ipc.ts` = 0; all Humble channels camelCase (`humbleStartLogin`, `humbleStopLogin`, etc., `ipc.ts` lines 134-266) |
| T-10-11 | Elevation (unbounded renderer-triggered login) | accept | CLOSED | Accepted-risk entry recorded below — single-user desktop app, login is user-initiated from Manage Accounts, no untrusted remote caller (per `10-03-PLAN.md` threat_model) |
| T-10-12 | Info Disclosure (frontend state/logs) | mitigate | **OPEN** | The declared invariant — "the cookie never reaches the renderer" — is **not actually true**. The typed `humble` context slice IS cookie-free (`GlobalState.tsx:232-241`, `HumbleAuthState`), but `humbleConfigStore` is separately registered as a `TypeCheckedStoreFrontend` (`src/frontend/helpers/electronStores.ts:160-162`), which forwards to the generic, unfiltered `window.api.storeGet(storeName, key)` bridge (`src/preload/api/misc.ts:95-96`, `stores[storeName].get(key, defaultValue)` — no key allow-list of any kind). Any renderer-side JS can call `window.api.storeGet('humbleConfigStore', 'sessionCookie')` directly and receive the raw stored value — `humble:v1:`-prefixed ciphertext normally, but the **raw plaintext session cookie** when `encryptionDegraded` is true (T-10-04's own fallback path). This is not a hypothetical: it is a documented, currently-reachable IPC surface (10-REVIEW.md WR-09), confirmed by reading `src/frontend/helpers/electronStores.ts` and `src/preload/api/misc.ts` directly — no grep match closes this. Mirrors a pre-existing Steam pattern (`refreshToken`), so it is not phase-10-introduced, but the phase's own threat register makes a stronger claim than the code delivers. |
| T-10-13 | Repudiation (accidental disconnect) | mitigate | CLOSED | `GlobalState.tsx:755-769` `humbleDisconnect` gated behind `this.handleShowDialogModal` confirmation (Confirm/Cancel) before `window.api.humbleDisconnect()` runs |
| T-10-14 | Info Disclosure (degraded encryption on Linux) | mitigate | CLOSED | `Login/index.tsx:230-236` renders `<WarningMessage>` with `login.humble_encryption_degraded` when `humble?.encryptionDegraded` is set; sourced from `humbleConfigStore.get_nodefault('encryptionDegraded')` (`GlobalState.tsx:241`) |
| T-10-15 | Info Disclosure (10-VALIDATION.md contents) | mitigate | CLOSED | `10-VALIDATION.md` "Redaction Statement" (lines 134-138): no cookie/gamekey/key values; report shape (`HumbleValidationReport`, `common/types/humble.ts:67-74`) is structurally counts/booleans only (`gamekeyCount: number`, `steamAppIdPresent: boolean`); manually confirmed no `_simpleauth_sess` or raw key/gamekey string appears in the file |
| T-10-16 | Elevation/abuse (dev trigger in production) | mitigate | CLOSED | `src/backend/main.ts:884-885` — `if (!app.isPackaged) { addHandler('humbleRunValidation', ...) }`, outside the always-on `registerHumbleIpcHandlers()` |
| T-10-17 | Tampering (transport swap regressing 401/403) | mitigate | CLOSED | `npx jest src/backend/humble/__tests__/adapter.test.ts src/backend/humble/__tests__/user.test.ts --no-coverage` → 2 suites, 48/48 passing (re-run live during this audit) |
| T-10-18 | Repudiation (unproven transport advancing to Phase 11) | mitigate | CLOSED | `10-VALIDATION.md` frontmatter `status: approved`; "Live Validation Gate (D-12/D-15)" section records `Overall verdict: PASS` against all three D-13-revised criteria |
| T-10-19a | DoS/UX (expiry notification blocking UI) | mitigate | CLOSED | `src/frontend/components/UI/HumbleExpiryToast/index.tsx:15-18` — explicit comment + implementation avoid `Dialog`/`MessageBoxModal`/`handleShowDialogModal`; no MUI Dialog import in file |
| T-10-19b | Info Disclosure (persist:humble on-disk cookie store) | accept | CLOSED | Accepted-risk entry recorded below — D-18 accepted trade-off; whole partition cleared on Disconnect (`user.ts:398-407`) |
| T-10-20 | Info Disclosure (cookie in logs/IPC during login validation) | mitigate | CLOSED | `user.ts:331-334` logs `gamekeys.status` only ("Humble login validation rejected candidate session: <status>"), never the cookie value; `HumbleAuthState` cookie-free (see T-10-09); `user.test.ts:524-547` |
| T-10-21 | Spoofing (standard-Chrome UA on login webview) | accept | CLOSED | Accepted-risk entry recorded below — required for Google SSO; scoped to `runner === 'humble'` only (`WebView/index.tsx:481`, `user.ts:63-73` `standardBrowserUserAgent`) |
| T-10-SC | Tampering (package installs) | mitigate | CLOSED | `git log --oneline` across all Phase 10 commits (`b80900fc`..`e2236bc1`) shows zero commits touching `package.json`/`pnpm-lock.yaml`; confirmed via `git log -- package.json` returning no phase-10 commits |

## Accepted Risks Log

The following threats carry an `accept` disposition per their declared plan and are logged here
as the accepted-risk record required to close them:

- **T-10-11** (Elevation — unbounded renderer-triggered login windows): Accepted because GameLib is
  a single-user desktop application; the Humble login flow is only reachable from the user's own
  Manage Accounts screen, with no remote/untrusted caller able to trigger it. No additional rate
  limiting implemented this phase.
- **T-10-19b** (Info Disclosure — `persist:humble` on-disk cookie store): Accepted per D-18. A second
  copy of the session cookie exists in Chromium's own on-disk cookie store for the `persist:humble`
  partition (identical exposure to every other runner's login partition — Epic/GOG/Amazon already
  work this way). The encrypted `electron-store` copy (`sessionCookie`, safeStorage + `humble:v1:`
  prefix) remains canonical for all adapter calls; the entire partition is wiped on explicit
  Disconnect (`user.ts:398-407`).
- **T-10-21** (Spoofing — standard-Chrome UA on the login webview): Accepted. Required so Google SSO
  offers password / "Try another way" flows instead of blocking or forcing an unusable
  passkey-only prompt inside an embedded browser. Scoped only to the `persist:humble` login surface
  (`runner === 'humble'` branch in `WebView/index.tsx`); no other runner's UA is affected.

## Open Threats (BLOCKER)

None — T-10-12 was remediated post-audit (see Security Audit 2026-07-05 (remediation) below).

**T-10-12 original finding (resolved by commit `73228a68`):** the typed `humble` context slice was
cookie-free, but `humbleConfigStore` was exposed to the renderer as a whole via the generic,
key-unfiltered `storeGet` IPC bridge — `window.api.storeGet('humbleConfigStore', 'sessionCookie')`
returned the raw stored value (plaintext when `encryptionDegraded`). **Remediation:** a
credential-key deny-list at the preload bridge (`src/preload/api/misc.ts`, `SECRET_STORE_KEYS`)
now blocks `humbleConfigStore/sessionCookie` and the analogous pre-existing
`steamConfigStore/refreshToken`, including dot-notation subpath reads; blocked reads return
`undefined` with a console warning. Verified: no frontend/preload code legitimately reads those
keys; `tsc --noEmit` exit 0; the declared "cookie never reaches the renderer" mitigation now
holds for every renderer caller. T-10-12 status: **CLOSED**.

## Unregistered Attack Surface (WARNING — not a blocker)

Cross-referencing `10-REVIEW.md` against the six plans' threat registers, the following
review findings represent real behavior with security-adjacent implications that were not
declared as threats in any plan's `<threat_model>` block and were not logged in any
`10-0X-SUMMARY.md`'s `## Threat Flags` section (only `10-05-SUMMARY.md` has that section at
all, and it reports "None"):

- **WR-03** (`src/backend/humble/user.ts:297-374`): `finishLogin()` can commit
  `configStore.set(HUMBLE_TOKEN_STORE_KEY, ...)` / `isLoggedIn` / `expired` writes to disk
  **after** `stopLogin()` has already settled the promise with `{ status: 'waiting' }`
  (D-06 "silent cancel"). This is a race, not an information-disclosure leak (the cookie still
  only reaches its intended encrypted store slot) — but it means a user who explicitly cancelled
  a login can end up backend-authenticated while the UI shows disconnected, a Repudiation-adjacent
  gap not covered by any registered threat's disposition. Recommend registering a threat for this
  in Phase 11 planning or fixing per the REVIEW's suggested `isSettled()` re-check.
- **WR-04** (`src/backend/humble/adapter.ts:80-92`): `humbleRequest` sets no axios `timeout`. A
  hung/stalled request keeps `validationInFlight` true indefinitely inside `user.ts`'s login watch,
  silently dropping every poll tick and every forced navigation-triggered revalidation
  (D-17) until the OS-level TCP timeout eventually fires. This is a latent availability/DoS gap on
  the login and health-check paths with no corresponding registered threat.
- **WR-02 / WR-09** are covered above as residual notes on T-10-07 and the T-10-12 BLOCKER,
  respectively, rather than listed again here.

## Security Audit 2026-07-05 (remediation)

| Metric | Count |
|--------|-------|
| Threats found | 23 |
| Closed | 23 |
| Open | 0 |

Post-audit remediation pass (same day) resolved the T-10-12 BLOCKER and both WARNING-level
unregistered-surface items, closing all residual notes:

- **T-10-12 / WR-09** → CLOSED by `73228a68` (preload `storeGet` credential-key deny-list, also
  covers the pre-existing Steam `refreshToken` exposure).
- **WR-02 residual on T-10-07** → fixed by `fb16db3e` (`disconnect()` clears the canonical
  `configStore` credential FIRST; each partition-clear step individually guarded; IPC listener no
  longer discards the promise). Regression test added.
- **WR-03 (unregistered, Repudiation-adjacent)** → fixed by `c977fb61` (`finishLogin` re-checks
  settled/stopped state before any store write; a cancelled login can no longer silently
  authenticate). Regression test added.
- **WR-04 (unregistered, availability)** → fixed by `43b73e00` (15s axios timeout in
  `humbleRequest`, mapped to the existing transient path). Regression tests added.
- Additional hardening from the same pass: WR-01 offline-startup catch (`a8e036ef`), WR-05 expired
  flag hydration (`24b9e95f`), WR-06 auth-state push (`dece7226`), WR-07 `encryptionDegraded`
  cleared on healthy re-login (`d14b6946`), WR-08 i18n namespace fix (`7dbfbb99`).

Verification after remediation: humble suites 55/55, full jest 362/362, `tsc --noEmit` exit 0,
eslint 0 errors on modified files.

## Summary

**Closed:** 23/23 | **Open:** 0 (post-remediation; original audit found 1 BLOCKER, resolved same day)

The Humble auth adapter scaffold's core security discipline (C5 adapter isolation, zod
validation, 401/403 split, cookie encryption at rest, isolated login partition, dev-gate-only
validation trigger, redacted validation report) is genuinely implemented and unit-tested, not
just documented. One declared mitigation — "the cookie never reaches the renderer" (T-10-12) — is
not delivered as stated: the generic `humbleConfigStore` frontend registration exposes the raw
stored cookie value to any renderer script via the existing, unfiltered `storeGet` IPC bridge,
which is materially significant in the `encryptionDegraded` (plaintext) case. This mirrors a
pre-existing Steam pattern and is not phase-10-introduced, but the phase's own threat register
makes a claim the code does not back up, and `block_on: high` for this audit means this must be
resolved (or the T-10-12 disposition reduced to `accept` with an explicit accepted-risk entry) before
sign-off.

Two additional findings (WR-03, WR-04) surfaced during code review represent new
attack-surface-adjacent behavior with no threat-register mapping and no `## Threat Flags` entry in
any plan's SUMMARY — logged here as WARNING, not a blocker.
