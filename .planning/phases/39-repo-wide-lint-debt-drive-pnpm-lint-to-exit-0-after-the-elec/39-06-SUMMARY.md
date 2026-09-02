---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
plan: 06
subsystem: testing
tags: [jest, tauri, humble, login-window-seam, mock-migration]

requires:
  - phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
    provides: "39-05: getLoginWindowSeamOrThrow() throwing accessor, checkHealthAndFlagExpiry()/disconnect()/getLiveCsrfToken() collapsed onto it, fakeSeam test fixture established"
provides:
  - "watchForLogin() and finishLogin() in src/backend/humble/user.ts collapsed to a single seam-only path — zero remaining session/HUMBLE_LOGIN_PARTITION dependency in the file"
  - "user.test.ts fully re-pointed at the seam path: every describe runs against a file-wide installed fakeSeam"
  - "Two false-pass security tests (csrf-secret logging, cookie-secrecy) fixed to genuinely exercise the secret-bearing code path instead of passing vacuously"
affects: [39-07, 39-08, 39-09]

tech-stack:
  added: []
  patterns:
    - "File-wide fakeSeam install in the outer describe('HumbleUser') beforeEach/afterEach, now that every code path in user.ts requires a seam"
    - "mockSeamCookies.mockImplementation((label, host, names) => names.includes('csrf_cookie') ? {...} : {...}) to distinguish the two cookie names sharing one seam.cookies() call site"
    - "await flushAsync() inserted before the first notifyLoginNavigated() call in every re-pointed test, so seam.open()'s .then() callback has a microtask tick to set seamLabel before forced revalidation fires"

key-files:
  created: []
  modified:
    - src/backend/humble/__tests__/user.test.ts

key-decisions:
  - "Re-expressed the D-11 'reconnect() watches WITHOUT clearing' guarantee under the seam model as: seam.open() was called with HUMBLE_LOGIN_URL AND neither seam.clearCookies() nor seam.clearStorage() was ever called — the only remaining seam-level proxy for the retired 'clear before open' guard"
  - "Fixed two false-pass tests (Rule 1) rather than leaving them passing vacuously: 'never logs the raw csrf cookie value' and 'no logger call and no configStore.set call ever receives the raw cookie value' both drove the retired mockCookiesGet mock, which was unreachable post-collapse — their secret values never entered any code path, so every not.toContain(SECRET) assertion was vacuously true regardless of correctness"
  - "Left dead mockCookiesGet/mockFromPartition assertions in two pre-existing (Plan 05) tests untouched — checkHealthAndFlagExpiry()'s 'does NOT re-fetch/overwrite csrfToken' and getLiveCsrfToken()'s 'without touching session.fromPartition' — both mocks are permanently unreachable now but still referenced (not unused, no lint risk), and both tests' real guarantees are exercised by other assertions in the same test; out of scope for this plan (pre-existing from an earlier plan, not touched by Task 1)"

patterns-established: []

requirements-completed: []

duration: ~45min (across two sessions; Task 1 committed in a prior session at c70a9ef06)
completed: 2026-09-02
---

# Phase 39 Plan 06: Collapse watchForLogin/finishLogin onto the seam, re-point user.test.ts Summary

**Collapsed the last `session`/`HUMBLE_LOGIN_PARTITION` dependency out of `humble/user.ts` (Task 1, prior session) and mechanically re-pointed all 79 tests in `user.test.ts` at the seam-only path, fixing two genuine false-pass security tests along the way.**

## Performance

- **Duration:** ~45 min total (Task 1 committed in a prior session; this session covered Tasks 2/3 — test re-pointing and full-suite verification)
- **Completed:** 2026-09-02
- **Tasks:** 3 (Task 1 already committed at session start)
- **Files modified:** 1 (`src/backend/humble/__tests__/user.test.ts`) this session; `src/backend/humble/user.ts` in the prior session's Task 1 commit

## Re-derived Seam Census (ground truth, re-verified this session)

In `src/backend/humble/user.ts`:

| Grep | Count |
|---|---|
| `session.fromPartition` | 0 |
| `import { session } from 'backend/platform'` | 0 |
| `HUMBLE_LOGIN_PARTITION` | 0 |
| `getLoginWindowSeam()` (bare, nullable) | 0 |
| `seam === null` / `seam !== null` | 0 |
| `ses!` | 0 |
| `seam.close` (with a following `.catch(`) | 5 (WR-06 float discipline intact) |
| `getLoginWindowSeamOrThrow` | 8 |

This matches the pre-Task-1 baseline noted in the carried-over plan context: exactly 2
`session.fromPartition(HUMBLE_LOGIN_PARTITION)` occurrences and 2 bare `getLoginWindowSeam()`
calls (at `watchForLogin`/`finishLogin`, ~lines 259/734 and ~255/721 pre-collapse) — both
confirmed at 0 now.

`src/backend/sidecar/humbleLoginFlowRegistration.ts:457`'s deliberately-kept smoke-test guard
(`const seam = getLoginWindowSeam()`, nullable) is confirmed untouched — `git diff` across both
commits in this plan shows zero changes to that file.

## Accomplishments

- All four `startLogin()` describes (D-06 silent cancel, cookie capture + encryption, best-effort
  identity, anonymous-cookie validation) and the rejection-log-collapse, degraded-encryption,
  reconnect() D-11, csrf_cookie capture, and cookie-secrecy describes are re-pointed at the seam
  path.
- Two tests deleted, each replaced with a named covering twin (see below).
- Two false-pass tests discovered and fixed in place (see Deviations).
- `pnpm test --selectProjects Backend -- src/backend/humble/__tests__/user.test.ts`: **79 passed, 79 total.**
- `seamBranchParity.test.ts` (the anti-regrowth live gate): **29 passed, 29 total.**
- `pnpm codecheck`: exit 0.
- `pnpm lint`: exit 0, 4157 warnings — identical to the tracked baseline recorded in `39-05-SUMMARY.md`; zero new warnings.

## Task Commits

1. **Task 1: Collapse the watchForLogin cluster, finishLogin's csrf capture, and the two imports** - `c70a9ef06` (committed in a prior session)
2. **Task 2 + 3: Re-point every test in user.test.ts to the seam path, fix false-passes** - `2dca3a05c` (test)

**Plan metadata:** (this commit)

## Mechanical Test Translation — per-describe record

Translation rule applied throughout: `mockCookiesGet.mockResolvedValue([{ value }])` →
`mockSeamCookies.mockResolvedValue({ total, matched: [{ name, domain, value }] })`, with
`await flushAsync()` inserted before the first `notifyLoginNavigated()` call in every test that
calls it (so `seam.open(...).then((openedLabel) => { seamLabel = openedLabel })` has a microtask
tick to run first). `total` was chosen to match what each original test was simulating — `total: 1`
for a single found cookie, `total: 0` for tests that don't depend on cookie content (pure
deadline/timeout tests, which don't read `mockSeamCookies` at all in their assertions).

- **`startLogin() — D-06 silent cancel`** (4 tests): the WR-03 in-flight-validation test uses
  `total: 1`; the two deadline-timeout tests use `total: 0` (they assert timing behaviour
  independent of cookie content, with `mockSeamCookies` explicitly asserted `not.toHaveBeenCalled()`
  where applicable).
- **`startLogin() — cookie capture + encryption`** (2 tests): `total: 1`, matched
  `[{ name: '_simpleauth_sess', domain: 'humblebundle.com', value: 'raw-cookie-value' }]`.
- **`startLogin() — best-effort identity after gamekeys acceptance (D-02/D-16)`** (2 tests):
  same `total: 1` shape.
- **`standardBrowserUserAgent()`**: 1 test **DELETED** — 'the persist:humble partition session
  receives the standard UA when the watch starts' asserted the Electron-only
  `session.fromPartition(...).setUserAgent(...)` call, a branch `watchForLogin()` no longer has at
  all. **Covering twin:** `login window seam path (Phase 34.4.1 Plan 03)` → 'opens the login window
  once with `HUMBLE_LOGIN_URL`, `visible: true`, and the standard Chrome UA', which asserts the same
  guarantee via `seam.open(...)`'s `userAgent` argument — the only surviving path.
- **`startLogin() — anonymous-cookie validation (HACCT-01/D-16)`** (6 tests): `total: 1` with
  varying `value` per test (anonymous vs authenticated vs changed cookie values), matching what
  each test simulates.
- **`startLogin() — rejection-log collapse (F-2, Phase 34.4.1 Plan 18)`** (5 async tests + 1
  fully-synchronous constants-pinning test, untouched): `total: 1` shape.
- **`startLogin() — degraded encryption (Pitfall 5 / success criterion 5)`** (2 tests): `total: 1`
  shape.
- **`reconnect() — D-11 partition kept`** (1 test): re-expressed individually, not mechanically
  translated (see D-11 section below).
- **`csrf_cookie capture + getCsrfToken() (Phase 14)`**: 3 of 5 tests re-pointed via
  `mockSeamCookies.mockImplementation((label, host, names) => names.includes('csrf_cookie') ? {...} : {...})`,
  since `_simpleauth_sess` and `csrf_cookie` share the same `seam.cookies()` call site. The other 2
  tests in this describe (`getCsrfToken()` undefined-when-uncached, `csrfToken` wiped by disconnect())
  were already correct from an earlier plan.
- **`login window seam path (Phase 34.4.1 Plan 03)`**: 1 test **DELETED** — 'Electron regression:
  with NO seam installed...' asserted that `watchForLogin()` silently falls back to an Electron
  session-based path when no seam is installed, a premise Task 1's collapse made false
  (`getLoginWindowSeamOrThrow()` is now called unconditionally and throws). **Covering twin:**
  replaced in place with 'with NO seam installed, startLogin() rejects loudly instead of silently
  falling back (Phase 39 Plan 06)', asserting the actual new invariant via
  `await expect(HumbleUser.startLogin()).rejects.toThrow(/no login-window seam is installed/)`.
- **`cookie secrecy (Pitfall 4)`** (1 test): re-pointed and fixed (see Deviations — this was a
  false-pass before the fix).

`expect(mockFromPartition)` assertion count: **5 → 2** (before this plan's Task 2/3 commit → after).
The 2 remaining are pre-existing, out-of-scope, harmless (see Deviations).

## D-11 Guarantee — quoted, re-expressed under the seam model

```typescript
describe('reconnect() — D-11 partition kept', () => {
  test('watches the persist:humble partition WITHOUT clearing it', async () => {
    const reconnectPromise = HumbleUser.reconnect()
    HumbleUser.stopLogin()
    await reconnectPromise

    // Phase 39 Plan 06: reconnect() is watchForLogin()'s only
    // implementation, now seam-only. There is no "clear before open"
    // branch left to instrument via mockFromPartition/session.clear*()
    // (those were removed from src/backend entirely by earlier plans in
    // this collapse series) — the D-11 guarantee ("reconnect() watches
    // WITHOUT clearing") is re-expressed here as: reconnect() actually
    // opens a real login window (proving it runs the genuine watch, not
    // a no-op) AND never calls either seam wipe method first.
    expect(mockSeamOpen).toHaveBeenCalledWith(
      HUMBLE_LOGIN_URL,
      expect.any(Object)
    )
    expect(mockSeamClearCookies).not.toHaveBeenCalled()
    expect(mockSeamClearStorage).not.toHaveBeenCalled()
  })
})
```

This is now guaranteed by: `reconnect()` genuinely runs the watch (proven by `seam.open()` being
called with the real login URL, not a no-op), and it never calls `seam.clearCookies()` or
`seam.clearStorage()` first — the seam-level equivalent of "no clear before open."

## Cookie Secrecy (Pitfall 4) — confirmed real log path

`no logger call and no configStore.set call ever receives the raw cookie value` was rewired to
route `SECRET` through `mockSeamCookies.mockResolvedValue({ total: 1, matched: [{ name:
'_simpleauth_sess', domain: 'humblebundle.com', value: SECRET }] })`, with `await flushAsync()`
inserted before `notifyLoginNavigated()`. Traced the resulting code path in `user.ts`: `cookieValue`
(= `SECRET`) flows into `finishLogin()`, which passes it to `getGamekeys(cookieValue)`,
`storeHumbleSecret('sessionCookie', cookieValue)`, and `getAccountIdentity(cookieValue)` — none of
which log the raw value (per the file's own doc comment at `finishLogin()`'s top: "NEVER pass
cookieValue to a logger... Passing the raw value to getGamekeys/getAccountIdentity is fine — the
adapter already receives it on every call and never logs it"). `mockConfigStore.set` is genuinely
called (`isLoggedIn`, `expired`, `userData`) and `mockSendFrontendMessage` is genuinely called
(`humbleAuthState`) with real, non-secret data — confirming the test's three assertion loops
(`loggerCalls`, `mockConfigStore.set.mock.calls`, `mockSendFrontendMessage.mock.calls`) now drive a
real, secret-bearing code path rather than passing vacuously.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed false-pass test: 'never logs the raw csrf cookie value'**
- **Found during:** Task 3 (csrf_cookie capture describe)
- **Issue:** This test drove the retired `mockCookiesGet` mock, which was never reachable once
  `finishLogin()`'s csrf-capture branch collapsed to seam-only. `CSRF_SECRET` never entered any
  code path, so every `.not.toContain(CSRF_SECRET)` assertion passed vacuously regardless of
  correctness — a live instance of the project's own documented lesson class ("a pass can cover
  an unreachable surface").
- **Fix:** Rewired through `mockSeamCookies.mockImplementation((_label, _host, names) =>
  names.includes('csrf_cookie') ? {total:1, matched:[{...CSRF_SECRET}]} : {total:1,
  matched:[{...raw-cookie-value}]})`, with an explanatory code comment documenting the discovery.
- **Files modified:** `src/backend/humble/__tests__/user.test.ts`
- **Verification:** Test re-run after the fix, still green — now genuinely exercising the
  secret-bearing csrf capture path.
- **Committed in:** `2dca3a05c`

**2. [Rule 1 - Bug] Fixed false-pass test: 'no logger call and no configStore.set call ever
receives the raw cookie value' (cookie secrecy, Pitfall 4)**
- **Found during:** Task 3, final verification pass
- **Issue:** Same class of bug as #1 — this test still drove `mockCookiesGet.mockResolvedValue([{
  value: SECRET }])`, unreachable post-Task-1. With the file-wide default `mockSeamCookies` value
  of `{total:0, matched:[]}` (from `installFakeSeamDefaults()`), the login would settle
  `{status:'error'}` (an `UNDECIDABLE` cookie-read verdict) before `SECRET` ever touched any real
  code path, making the test's assertions vacuously true.
- **Fix:** Rewired through `mockSeamCookies.mockResolvedValue({ total: 1, matched: [{ name:
  '_simpleauth_sess', domain: 'humblebundle.com', value: SECRET }] })` with `await flushAsync()`
  inserted before `notifyLoginNavigated()`. Traced the resulting code path (see "Cookie Secrecy"
  section above) to confirm the login now genuinely completes and `SECRET` genuinely flows through
  `getGamekeys`/`storeHumbleSecret`/`getAccountIdentity`, none of which log it.
- **Files modified:** `src/backend/humble/__tests__/user.test.ts`
- **Verification:** Test re-run after the fix, still green (79/79 for the file); confirmed via
  reading `finishLogin()`'s source that the login-completion code path (gamekeys 'ok', configStore
  writes, sendFrontendMessage) genuinely executes with `SECRET` as the live cookie value.
- **Committed in:** `2dca3a05c`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — false-pass security tests fixed in place)
**Impact on plan:** Both fixes are necessary for the plan's own stated security assertions
(cookie/csrf secrecy) to be meaningful rather than vacuous. No scope creep — both fixes stayed
within `user.test.ts`, the file this plan's Tasks 2/3 already touch.

## Out-of-Scope Discoveries (logged to deferred-items.md, not fixed)

Per the Scope Boundary rule, the following were found during full-suite verification but are
unrelated to Humble/seam code and were not fixed here. Full detail in
`.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/deferred-items.md`
under "From Plan 39-06":

- `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` and
  `src/backend/downloadmanager/__tests__/utils.test.ts` — both previously catalogued (Plan 39-02),
  reproduced identically, confirmed still unrelated to any file this plan touches.
- `meta/__tests__/hardcodedStringGate.test.ts` (2 failures) and
  `meta/__tests__/genI18nGateScope.test.ts` (1 failure) — **newly discovered this session**, both
  genuine (reproduce standalone), both pre-existing (attributed via `git log` to commits unrelated
  to any phase-39 plan), both in the `Meta` project with zero relation to Humble/seam files.
  `hardcodedStringGate` is a blocking gate (D-12) and should be prioritized ahead of any future
  plan depending on a fully-green `pnpm test`.
- `meta/__tests__/runTsSignals.test.ts` — failed once under a full-suite run, confirmed 8/8 green
  in isolation; matches the documented full-suite-run-manufactures-a-different-failure-set flake
  class, not a regression.

Two pre-existing (Plan 05) dead-mock assertions were also identified and left untouched (out of
scope — not part of Task 1's collapse, and not broken): `checkHealthAndFlagExpiry()`'s 'does NOT
re-fetch/overwrite csrfToken when one is already cached' test still asserts
`mockCookiesGet.mock.calls` has length 0 (permanently true now, harmless — the test's real
guarantee, `configStore.set` never called with `csrfToken`, is a separate assertion in the same
test), and `getLiveCsrfToken()`'s 'returns the stored snapshot directly... without touching
session.fromPartition' test still asserts `mockFromPartition` was not called (also permanently
true, harmless). Neither mock is unused (still referenced in assertions), so neither creates a new
lint warning.

## Full-Suite Verification

Two independent clean runs (not back-to-back with another `pnpm test`, to avoid the documented
load-induced-flake effect) produced identical, stable results:

**`pnpm test --selectProjects Backend`:**
```
Test Suites: 2 failed, 188 passed, 190 total
Tests:       4 failed, 2 skipped, 4383 passed, 4389 total
```
Both failing suites are the pre-existing, previously-catalogued `decompressPool.test.ts` /
`downloadmanager/utils.test.ts` failures — confirmed unrelated to this plan by `git log` (neither
file has been touched since the commits already cited in `deferred-items.md`'s "From Plan 39-02"
entry) and by re-running each standalone (same failures reproduce, not induced by full-suite load).

**`pnpm test` (full, all 5 projects):**
```
Test Suites: 5 failed, 365 passed, 370 total
Tests:       8 failed, 3 skipped, 7470 passed, 7481 total
```
Every failure classified:
- 2 (Backend, `decompressPool`/`downloadmanager utils`) — pre-existing, known baseline (Plan 39-02).
- 2 (Meta, `hardcodedStringGate` ×2 assertions in the count, `genI18nGateScope` ×1) — pre-existing,
  newly discovered and catalogued this session, unrelated to Humble/seam code.
- 1 (Meta, `runTsSignals`) — full-suite-load flake, confirmed 8/8 green in isolation.

None caused by this plan. `src/backend/humble/user.test.ts` contributes 0 failures to either run
(79/79 green in both).

`seamBranchParity.test.ts` (live anti-regrowth gate): **29 passed, 29 total** — confirms the
`humble/user.ts` collapse has not regrown a dual-branch `if (seam === null) { ... } else { ... }`
shape anywhere in the codebase.

`pnpm codecheck`: exit 0.
`pnpm lint`: exit 0, 4157 warnings (identical to the `39-05-SUMMARY.md` baseline — zero new
warnings; the one `user.test.ts` warning cluster present in the lint output, lines 62-105, predates
this session's edits and is part of the mock-scaffolding section this plan did not touch).

## Issues Encountered

None beyond the two false-pass tests documented above under Deviations.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `humble/user.ts` is now fully seam-only; no remaining `session`/`HUMBLE_LOGIN_PARTITION`
  dependency anywhere in the file.
- REQ-39-03 spans plans 39-02 through 39-07 and is intentionally left unmarked — this is not the
  last plan under it (39-07 through 39-09 remain).
- Two newly-discovered pre-existing Meta-project gate failures (`hardcodedStringGate`,
  `genI18nGateScope`) are logged in `deferred-items.md` for a future plan to triage; neither
  blocks this plan's own success criteria, but `hardcodedStringGate` is a blocking gate (D-12) and
  should be addressed before any plan that depends on `pnpm test` exiting 0 end-to-end.

---
*Phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec*
*Completed: 2026-09-02*

## Self-Check: PASSED

- FOUND: `src/backend/humble/__tests__/user.test.ts`
- FOUND: `src/backend/humble/user.ts`
- FOUND: `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/deferred-items.md`
- FOUND commit `c70a9ef06` (Task 1, prior session)
- FOUND commit `2dca3a05c` (Task 2/3, this session)
- FOUND commit `a6edbe61b` (this SUMMARY + deferred-items.md)
