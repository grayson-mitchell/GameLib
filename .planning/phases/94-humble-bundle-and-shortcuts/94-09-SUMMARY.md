---
phase: 94-humble-bundle-and-shortcuts
plan: 09
subsystem: testing
tags: [oracle, golden, humble, login-watch, fake-clock, secrets, keyring, migration, expiry-digest, app-id-resolver, user-agent, i18n, d-05, d-06, d-18, d-23]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-06 wire recorder and harness (withHumbleOracleProfile, withWireRecorder, writeOrCompareGolden, MANIFEST floors, the redaction scan), 94-08 flowHarness and libraryFixtures
provides:
  - src/backend/humble/__tests__/oracle/userHarness.ts (runUserCase: the real HumbleUser over a scripted login-window seam, the real keyring-backed secret store over a fake keyring, the wire recorder and jest fake timers)
  - src/backend/humble/__tests__/oracle/fakeKeyring.ts (a scripted keyring_get/set/delete/available: nothing reaches the OS)
  - 70 user goldens (60 wire recordings), 23 secrets goldens, 11 alerts goldens, 11 app_id_resolver goldens (11 recordings), 8 user_agent vectors, all under gamelib-humble/tests/fixtures
  - 27 new i18next rows per language (1824 rows) and gamelib_i18n::Catalog::t_unescaped
affects: [94-10, 94-15, 94-17, 94-18, 94-19, 94-27, Humble Rust plans]

requirements-completed: []

actuals:
  tokens: 30000
  tasks: 3
  commits: 4

plan_head_before: f6dcf67134c08966a1111ededdfb5bd821e0a867
plan_head_after: b31640993196589d424423785237926455a1a84b

tech-stack:
  added: []
  patterns:
    - "a user flow oracle is runUserCase({synthetic, prepare, keyring, seam, onSessionStatus, script}): the golden is {input, steps, seamCalls, requests, secretOps, outcomeNotes, outcomePushes, pushes, fenceCalls, logs, result, stateBefore, stateAfter, keyringAfter}; every entry but a request carries seq (one counter) and atMs (fake clock)"
    - "only Date, setTimeout and setInterval are faked (jest.useFakeTimers with every other timer in doNotFake), so the watch's 1500 ms poll and 10 minute deadline move by tick() while sockets and setImmediate stay real"
    - "an axios request interceptor is the session-status hook: it marks each request in the timeline, can fail one before the wire (a dropped connection) and can call stopLogin() while a request is in flight; it never replaces a module"
    - "invalidate-before-delete is shown by a call-through spy on SidecarKeyringSlotStore.prototype.invalidateCache that writes into the same ordered secretOps list as the fake keyring's calls"
    - "the recorder's base URL is rewritten to https://www.humblebundle.com in the golden text, so the constants the code reads at call time (HUMBLE_BASE_URL) are host-independent"

key-files:
  created:
    - src/backend/humble/__tests__/oracle/userHarness.ts
    - src/backend/humble/__tests__/oracle/fakeKeyring.ts
    - src/backend/humble/__tests__/oracle/user.oracle.test.ts
    - src/backend/humble/__tests__/oracle/secretsAlerts.oracle.test.ts
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/user (70 goldens + MANIFEST)
    - src-tauri/crates/gamelib-humble/tests/fixtures/recorded/user (60 cases)
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/secrets (23 + MANIFEST)
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/alerts (11 + MANIFEST)
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/app_id_resolver (11 + MANIFEST)
    - src-tauri/crates/gamelib-humble/tests/fixtures/recorded/app_id_resolver (11 cases)
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/user_agent (8 + MANIFEST)
  modified:
    - src/backend/login/__tests__/userAgent.test.ts
    - src/backend/humble/__tests__/oracle/flowHarness.ts
    - src/backend/__tests__/humbleFixtureRedaction.test.ts
    - meta/genI18nGolden.ts
    - src-tauri/crates/gamelib-i18n/src/lib.rs
    - src-tauri/crates/gamelib-i18n/tests/render.rs
    - src-tauri/crates/gamelib-i18n/tests/fixtures/rendered.json

key-decisions:
  - "The secret store in the user oracle is the real SidecarHumbleSecretStore over a fake keyring, not a recording fake: the invalidate-before-delete order the disconnect golden must show belongs to the real slot store, and the fake keyring is a closure map, so no case can reach a Keychain or a dev vault (T-94-16)."
  - "The digest date is pinned to en-US by supplying that locale where Date.prototype.toLocaleDateString is called with none: the TS renders the host's default locale (this checkout is en-NZ, CI is en-US), and a golden that recorded the host's would differ per machine."
  - "A watch is started through begin(), which returns {login}: returning the promise itself from an async helper makes await begin() wait for the whole watch."
  - "The Task 3 gate was run RED then GREEN as two commits: rendered.json and render.rs first (the test target does not compile without t_unescaped), then lib.rs."

patterns-established:
  - "a plan's expected behaviour is a hypothesis: the golden records what the TS did, and a case that disagrees with the plan is kept and named (the dead cookie API aborts, it does not reach the deadline)"

requirements: [SVC-04, SVC-05]
duration: 45min
completed: 2026-11-24
---

# Phase 94 Plan 09: Humble user, secrets, digest, resolver, user-agent and i18n oracle Summary

**The Humble login watch, reconnect, disconnect, three-state probe, health check and the Humble verdict arm recorded from the TypeScript on a fake clock (70 goldens), the keyring-backed secret owner and its plaintext migration (23), the expiry digest (11), the Steam app-id resolver on the wire (11), the user-agent vectors (8), and every Humble and shortcut string pinned to i18next, escaped or not (1824 rows, `Catalog::t_unescaped`).**

## What was built

- **User flows (`user.oracle.test.ts`, `userHarness.ts`, `golden/user`, `recorded/user`).** 60 flow cases and 10 verdict cases. The login watch: ory and legacy cookie candidates, the ory cookie winning, no CSRF cookie, a failing CSRF read, encryption unavailable (`encryptionDegraded` true), a reconnect clearing a stale `expired`, an anonymous candidate throttled for `VALIDATION_THROTTLE_MS` then accepted, the rejection log collapsing with its 30 s heartbeat, a forced revalidation and a `finished` nav event bypassing the throttle, the deadline re-armed by a navigation at 9 minutes (settles `waiting` at 1,141,500 ms), a live jar with no candidate polling 400 ticks to the deadline (801 seam calls), a window that never opens, a dead cookie API, a live-then-empty jar, a cookie read failure, an open failure, the user closing the window (`cancelled`), a failing event drain, a dropped session-status request retried at once, `stopLogin()` mid-validation writing nothing, `stopLogin()` before `open()` resolves (the orphan is closed on arrival), and a second start tearing down the first. Disconnect (11 cases): the fence first, then config, `noteSignedOut`, the keyring (`invalidateCache` immediately before each `keyring_delete`), library and sync, then storage and cookies last, the window closed; macOS versus handle origin; failing delete, storage, open, clear and close; the census discrepancy, incomplete and never-live branches. Probe (9), health (9), user details (2). Verdict (10): `expired` and `healthy` and `unknown` against each flag state, and a moved epoch for each, plus a missing `userData` pushing no username.
- **Secrets (`secretsAlerts.oracle.test.ts`, `golden/secrets`).** The real slot store over the fake keyring on a fake clock: the success cache, in-flight dedupe, the 120 s memo (no keyring call at 60 s and 119,999 ms, a call at 120,000 ms), timeout versus unavailable classification per slot, totality of `getSecret`, set and clear failures, a slow read that returns the old value after a write (the cache stays on the new one), the availability probe, the 45 s timeout, and eight migration cases (both secrets, nothing to migrate, write failure, read-back failure, mismatch, per-secret independence, csrf only, the boot hook). The test fails when any log line carries a stored value.
- **Digest (`golden/alerts`).** Counts 1, 2 and 5, a hostile title, the D-92 dedupe and a moved date, the first-sync baseline, the settings gate, Steam Deck Game Mode, the legacy backfill, null expirations, and a mixed sync. Each run records the real `i18next.t` calls with their params.
- **Resolver (`golden/app_id_resolver`, `recorded/app_id_resolver`).** A unique hit, no items, ambiguous and non-app results, the three-request order with the 350 ms gap moving the clock (none before the first), the cap (40 requests, 39 sleeps, 5 deferred), the first error stopping the pass uncached, two 200 responses that are errors not misses, cached hits and fresh misses skipped while a miss over 7 days and a pre-term-version miss retry, a stale fence, punctuation and trademark handling in the term, and duplicate titles. Each golden shows the axios config the wire does not (`timeout: 8000`, the params, `User-Agent: GameLib`).
- **User agent (`golden/user_agent`).** Eight `{input, output}` vectors over the three `resolveAppInfo` platforms and the five branch shapes. `login/__tests__/userAgent.test.ts` keeps its three assertions and replays the vectors against the manifest floor (5).
- **i18n.** `genI18nGolden.ts` gained `HUMBLE_SHORTCUT_CASES` (27 rows per language: the six `humble.notification.*` copies with count 1, 2 and 5, every `box.shortcuts.*` toast with the two `gamelib:` Mac Desktop keys, `notify.finished.{add,remove}.steam.*` and `box.error.add.steam.*`) and an `escapeValue: false` flag, serialised only when false. `Catalog::t_unescaped` shares one private `render(.., escape)` with `t`. `render.rs` replays each row through `t` or `t_unescaped` by its flag, plus a guard that every key is in the golden and that the unescaped dialog row differs from the escaped one only in escaping.

## Findings the Rust port must honour

1. **The digest date is shown HTML-escaped in the OS notification.** `i18next.t` escapes `/` in an interpolated value, so the single-key body is `... now expires on 1&#x2F;2&#x2F;2027` (`golden/alerts/one-key-gains-an-expiration-single-copy`). The golden pins what the TS shows today; whether the Rust digest reproduces it or fixes it (the date is a value, not user text) is for 94-17 to decide, and `Catalog::t` already matches the TS.
2. **The digest date also depends on the host's default locale** (`toLocaleDateString()` with no argument). The golden is pinned to en-US; the Rust copy needs an explicit locale policy.
3. **The poll interval fires before the deadline at the same instant.** At 600,000 ms the golden shows `takeEvents` then `close`: one more poll, then `settle`. A fake-clock replay must break the tie the same way.
4. **A jar that returns zero cookies from the first read never reaches the deadline**: `classifyCookieRead` gives `UNDECIDABLE` and the watch settles `error` on the first tick (`login-dead-cookie-api-aborts-on-the-first-tick`). The deadline is reached by a live jar with no candidate or by a window that never opens.
5. **Disconnect keeps eight store files, not seven**: the seven user-state files (revealed, ownership override, gifted at, audit, local redeemed, notified expiration, settle declined) and the `humble_steam_appid` cache. Config, library and sync are cleared.
6. **`readSecret` and `getSecret` on a failing keyring log two warnings** (the failure and the memo line), neither carrying a value. The `keyring_get ok` line logs `len=`, never the value.
7. **A read in flight when `setSecret` lands returns the old value to its own caller and leaves the cache on the new one.**
8. **Every `humbleAuthState` push for the Humble user comes from three places only**: `finishLogin` (`expired: false`), `checkHealthAndFlagExpiry` (`expired: true`, with the stored username) and the verdict arm (`latched` pushes true, `cleared` pushes false); an `unchanged` or `stale` verdict pushes nothing.
9. **The `i18next` count rows agree with Rust's base-key lookup only because `en` holds `expiringBodyPlural`, `_one` and `_other` with the same text**; the crate does not port plural suffixes, and the golden fails if the three diverge.

## Deviations from Plan

### Plan wording that could not hold as written

**1. "a dead-API case (every read returns zero cookies) that ends at the deadline".** It aborts on the first tick (finding 4). Recorded as it behaves; the deadline cases are the live-jar and never-opens ones.
**2. "a recording fake secret store" (Task 1).** The real `SidecarHumbleSecretStore` over a fake keyring instead (key decision 1): the acceptance criterion's invalidate-before-delete order is only observable on the real slot store.
**3. "the en-US `M/D/YYYY` date the sidecar renders today" (Task 2).** The sidecar renders the host's default locale; the golden pins en-US (key decision 2) and the nested-escaping of `/` is recorded (finding 1).
**4. `signInProbe/verdict.ts` "D-24 reference".** Driven through `createTestSignInProbe().epochs` with the real stores, as the plan said; the plan named `testSignInProbe.ts`'s helpers and no more was needed.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] flowHarness helpers were module-private**
- **Found during:** Task 1
- **Issue:** `withUtc` and `readableSnapshot` (the host-zone switch and the state text snapshot 94-08 wrote) were needed by the user oracle.
- **Fix:** exported both from `flowHarness.ts` (two `export` keywords); 94-08's suites are unaffected.
- **Commit:** 99d8d2ee1

**2. [Rule 1 - Bug] `await begin(env)` waited for the whole watch**
- **Found during:** Task 1, the first run (every login case hit the 120 s test timeout)
- **Issue:** an async helper that returns the watch promise is unwrapped by `await`.
- **Fix:** `begin()` returns `{ login }`; the harness's `settle()` is bounded so a request that never completes throws instead of hanging.
- **Commit:** 99d8d2ee1

**3. [Rule 1 - Bug] an `about` string tripped the redaction scan**
- **Found during:** Task 1 compare run (`login-legacy-simpleauth-cookie-authenticated.json: cookie value`)
- **Issue:** the case description contained `_simpleauth_sess=<value>`.
- **Fix:** reworded; the scan was not loosened.
- **Commit:** 99d8d2ee1

**4. [Rule 1 - Bug] the stale-read case recorded no stale read**
- **Found during:** Task 2 golden inspection
- **Issue:** the slow `keyring_get` evaluated the slot after the write, so it answered the new value and the epoch fence was never exercised.
- **Fix:** the delayed call answers the old value explicitly (`then: { answer }`).
- **Commit:** 219b0888b

### Additions beyond the plan

- `userHarness.ts` and `fakeKeyring.ts` (the plan's file list names only the two tests and the fixtures).
- `humbleFixtureRedaction.test.ts` floor raised from 1527 to 1830 (the tree holds 1836).
- Two extra `render.rs` guards (every key present, the unescaped row differs from the escaped one).
- Plan 94-10 (live capture) was not run and nothing here needs its outputs.

## Windows-only observations

- This checkout's default locale is en-NZ (`toLocaleDateString()` gives `2/01/2027`), which is why the digest date is pinned rather than read from the host.
- Everything else passed locally on this CRLF checkout: the four oracle and replay suites (118 tests), `humbleFixtureRedaction` (floor 1830), `humbleShortcutsShimSchedule`, `i18nGolden`, `cargo test -p gamelib-i18n` (10 tests, 1824 rows), `cargo fmt --check`, `cargo clippy -D warnings`, `pnpm backend-di-ceilings` (jestMock stays 1637), `pnpm find-deadcode` (310 baselined), `pnpm planning-gates` (12/12), `npx tsc --noEmit`, ESLint on the new files with no warning, and `npx prettier --check` over every written path. The fixtures are LF and `-text`.
- `rendered.json` is not prettier-ignored; the generator's output passes `--check` as written.

## Verification

- Write run then compare run for each oracle: green (the compare run replays every recording offline and fails on drift or an unrequested exchange).
- Acceptance: user MANIFEST count 70 (>= 15), secrets 23 (>= 10), alerts 11 (>= 6), app_id_resolver 11 (>= 6), user_agent 8 (>= 5); the disconnect golden's `secretOps` show `invalidateCache` immediately before each `keyring_delete` and its `stateAfter` keeps the seven user-state files byte-identical; `failure-memo-answers-unreadable-without-a-keyring-call-for-120-s` makes no keyring call for the second and third reads; `grep -c "humble.notification" rendered.json` is 336; `grep -c "pub fn t_unescaped" lib.rs` is 1.
- The tracer gate (`HUMAN_VERIFY_MODE` end-of-phase, automated-only verify): the compare run was re-run end to end and passed before Task 2 started.
- The RED run for Task 3 failed to compile on `t_unescaped` (commit e1f23ce3c); GREEN is b31640993.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-94-16: no case can reach a real keychain (the only secret storage is the fake keyring's map) and every log line is asserted free of the stored value. T-94-17: `t_unescaped` is used only for the row the TS renders with `escapeValue: false`, pinned by its flag in `rendered.json`.

## Self-Check: PASSED

- Files: `userHarness.ts`, `fakeKeyring.ts`, `user.oracle.test.ts`, `secretsAlerts.oracle.test.ts`, `golden/{user,secrets,alerts,app_id_resolver,user_agent}/MANIFEST.json` all exist.
- Commits: 99d8d2ee1, 219b0888b, e1f23ce3c, b31640993 all in `git log`.
