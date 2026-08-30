---
phase: 35-electron-cutover-remove-the-electron-build
plan: 23
subsystem: auth
tags: [cookies, epic, legendary, logout, census, jest, classifyCookieRead]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "plan 09's multi-domain Epic cookie clear (EPIC_COOKIE_HOSTS) and humble/user.ts's disconnect() before/after census pattern (plan 22 gap-cycle 17), plus loginWindowSeam.ts's classifyCookieRead/cookiesForDomain"
provides:
  - "Per-host before/after cookie census on the Epic clearEpicCookies wipe step, with a self-interpreting log line (total/matched/verdict on both sides)"
  - "A three-case jar-liveness fatality rule replacing the bare total===0 check, distinguishing 'nothing to clear' from 'the clear is broken'"
affects: [35-29, epic-logout, cookie-clearing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-host cookie census (before/after, classifyCookieRead) ported from humble/user.ts's disconnect() to a SECOND caller (legendary/user.ts) — the shared `everProvedLive` liveness flag and the log-verdict/domain-verdict split are now an established pattern for any future third caller"

key-files:
  created:
    - src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
  modified:
    - src/backend/storeManagers/legendary/user.ts

key-decisions:
  - "Two separate classifications from one census read: a JAR-WIDE (log-facing) verdict via classifyCookieRead({total: jarTotal, everProvedLive}), mirroring Humble exactly for acceptance criterion (b); and a DOMAIN-SCOPED (fatality-facing) verdict via classifyCookieRead({total: matched, everProvedLive}), used only internally. Using the jar-wide verdict for fatality would have misclassified a CLI-only Epic auth (empty Epic jar, but a nonzero jar-wide total from an unrelated GOG/Humble cookie) as SUPPORTED_NONEMPTY, breaking success_criteria's 'a genuinely empty Epic jar logs out cleanly'."
  - "everProvedLive is ONE flag shared across the whole sweep (every host, both before/after sides), set true the first time any read anywhere returns a jar-wide total > 0 — it proves the cookiesForDomain RPC CHANNEL is alive, a property of the channel, not of any one host's content, so a later zero from a different host is trustworthy rather than indistinguishable from a dead read API."
  - "Split into two atomic commits along the plan's own task boundary: Task 1 (census + logging, fatality left as the original bare total===0 check) then Task 2 (the three-case fatality rewrite). Verified Task 1's commit compiles and all existing + new Task-1-scoped tests pass standalone before layering Task 2 on top."

requirements-completed: [REQ-35-07]

# Metrics
duration: ~55min
completed: 2026-08-30
---

# Phase 35 Plan 23: Epic Cookie Census + Jar-Liveness Fatality Summary

**Per-host before/after cookie census on Epic's `clearEpicCookies` step (ported from `humble/user.ts`'s disconnect()), plus a three-case fatality rule that tells a genuinely empty Epic jar apart from a broken clear — replacing the bare `total === 0` check.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-30
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments

- Every host in `EPIC_COOKIE_HOSTS` now gets a before/after cookie-jar census (`seam.cookiesForDomain(label, host, [])`, empty name filter) around its clear, classified via `classifyCookieRead` — mirroring `humble/user.ts`'s disconnect() reference implementation.
- The fatal-logout predicate is now a three-case rule keyed on the per-host `before` census instead of a bare summed total, closing `35-REVIEW.md`'s CR-04 part 2.
- 9 new named tests in `epicCookieCensus.test.ts` cover both tasks' full acceptance criteria, including a documented RED-proof that a naive `total === 0`-only implementation silently resolves the exact "healthy primary domain masks a broken secondary domain" scenario D-35-19-15 measured live.
- Zero regressions: `epicLogoutDomains.test.ts` (17 tests) and `user.test.ts` (11 tests) pass unmodified; full `pnpm test --selectProjects Backend` is green except one pre-existing, unrelated failure (see Deviations).

## Task Commits

Each task was committed atomically:

1. **Task 1: Port the Humble cookie census to the Epic per-domain clear** - `acf854233` (feat)
2. **Task 2: Base the fatal-logout decision on jar liveness, not on the matched-delta sum alone (CR-04 part 2)** - `b5ed7df03` (fix)

**Plan metadata:** (this commit, made after this SUMMARY) — `docs(35-23): complete plan`

## Files Created/Modified

- `src/backend/storeManagers/legendary/user.ts` — `clearEpicCookies` wipe step: added `readHostCensus()` (before/after per-host census, non-fatal on a rejecting read), `fmtSide()` formatter, `domainVerdict()` (fatality-facing classification over `matched`), and the three-case fatality rule (`brokenHosts` check → nonzero-total success → `allProvenEmpty` check → fail-closed fallback) replacing the bare `total === 0` throw. `EPIC_COOKIE_HOSTS` and `FATAL_WIPE_STEP` are byte-identical to before this plan (verified via `git diff` across both commits).
- `src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts` (new) — 9 tests covering Task 1's acceptance criteria (a)-(d) and Task 2's four named fatality cases plus a byte-identity reminder for `EPIC_COOKIE_HOSTS`.

## Verbatim Per-Host Census Log Line Format

Recorded here because plan `35-29` greps `gamelib.log` for it:

```
Legendary logout: cleared ${deleted} ${host} cookie(s) (measured post-removal delta) — cookie census before(total=${jarTotal}, matched=${matched}, verdict=${verdict}) after(total=${jarTotal}, matched=${matched}, verdict=${verdict})
```

Where `verdict` is one of `SUPPORTED_NONEMPTY` / `SUPPORTED_BUT_EMPTY` / `UNSUPPORTED_OR_ERROR` / `UNDECIDABLE`, and a rejecting census read renders that side as `total=unavailable, matched=unavailable, verdict=UNSUPPORTED_OR_ERROR`. Example (healthy, `epicgames.com`, 4 removed):

```
Legendary logout: cleared 4 epicgames.com cookie(s) (measured post-removal delta) — cookie census before(total=4, matched=4, verdict=SUPPORTED_NONEMPTY) after(total=0, matched=0, verdict=SUPPORTED_BUT_EMPTY)
```

The pre-existing summary line (`Legendary logout: Epic cookie clear removed ${total} cookie(s) across ${N} Epic-owned domain(s) — ${perDomain}`) is unchanged, preserving `user.test.ts`'s `stringContaining('removed 10 cookie(s)')`-style assertions.

## How `everProvedLive` Is Derived

`everProvedLive` is a single `let` boolean, scoped to the whole `clearEpicCookies` step (shared across every host, both the `before` and `after` reads). It starts `false` and is set `true` the first time ANY census read anywhere in the sweep returns a jar-wide `total > 0`. It is never reset per-host. This mirrors `humble/user.ts`'s disconnect() exactly, and the reason it is a single shared flag rather than per-host state is that it exists to prove the `cookiesForDomain` RPC *channel* is alive — a property of the channel, not of any individual host's cookie content. Once proven live anywhere, a later `matched === 0` for a *different* host is trustworthy evidence of "genuinely empty for that domain" rather than being indistinguishable from "the read API silently returned nothing." Two classifications are derived from the same flag: the JAR-WIDE (log-facing) verdict `classifyCookieRead({ total: jarTotal, everProvedLive })`, and the DOMAIN-SCOPED (fatality-facing) verdict `classifyCookieRead({ total: matched, everProvedLive })`. The split exists because using the jar-wide verdict for the fatality decision would misclassify a legendary CLI-only auth (Epic jar empty, but a nonzero jar-wide total from an unrelated GOG/Humble cookie in the same shared browser jar) as `SUPPORTED_NONEMPTY` — see Decisions.

## The Mutation That RED-Proves Case (b)

Case (b) (plan's numbering) = the test named `(2) a host proven SUPPORTED_NONEMPTY with a zero delta is FATAL, naming the broken host, regardless of the overall summed total` in `epicCookieCensus.test.ts`.

**Mutation applied:** deleted the `brokenHosts` filter/check entirely and reverted the fatality block to the pre-plan naive form:
```ts
if (total === 0) {
  throw new Error(
    `Legendary logout: domain-scoped cookie clear removed nothing across all ` +
      `${EPIC_COOKIE_HOSTS.length} Epic-owned domains (${perDomain.join(', ')})`
  )
}
```
(`hostRecords`/`domainVerdict` computation left in place but unused by the fatality decision.)

**Effect, measured live:** the test's scenario has `epicgames.com` clear healthily (`deleted=5`) while `fortnite.com`'s `before` census proves 2 cookies were present and its measured post-removal delta is 0 (the clear is broken for that host specifically). The summed total is `5 + 0 + 0 + 0 + 0 = 5`, which is **not** zero. Under the naive mutation, the test failed with:
```
expect(received).rejects.toThrow()
Received promise resolved instead of rejected
Resolved to value: undefined
```
i.e. the naive `total === 0`-only implementation silently **resolves** the exact scenario D-35-19-15 measured live — a healthy primary-domain clear masking a broken secondary-domain clear inside a nonzero sum. Restoring the `brokenHosts` check (the actual, committed implementation) flips this back to `rejects.toThrow(/removed nothing for fortnite\.com despite the jar proving cookies were present beforehand/)`, which is what is committed. Two other tests ((b)'s own SUPPORTED_NONEMPTY-log assertion and case (1)'s "empty jar is not fatal") also failed under the same mutation, confirming the naive check's failure mode was not narrowly scoped to one test.

## D-35-19-15 Is NOT Closed By This Plan

Explicit per the plan's `<output>` requirement: all evidence above is from **unit tests against mocked `cookiesForDomain`/`clearCookies` seam calls**. No real Steam/Epic/browser cookie jar was exercised. `D-35-19-15` (live gate criterion 21 never exercised the multi-domain clear with a real secondary-domain cookie present) remains **open** and is deferred to plan `35-29`'s criterion-21 re-run, which must seed a cookie on a non-primary Epic domain (`fortnite.com`/`unrealengine.com`/`twinmotion.com`/`metahuman.com`) and **confirm it is present before logout** — without that confirm-present step, a re-test would reproduce the same vacuous zero D-35-19-15 already measured. This plan's frontmatter `closes_deferred: [D-35-19-15]` refers only to the code-side fix (porting the census, per that item's own closing paragraph) being shipped; it does not assert the live-proof half is discharged.

## Decisions Made

- **Two-verdict split (jar-wide log verdict vs. domain-scoped fatality verdict)** — see "How `everProvedLive` Is Derived" above. Necessary to satisfy acceptance criterion (b) (log verdict computed from jar-wide total, matching Humble) without breaking success_criteria's "a genuinely empty Epic jar logs out cleanly" (which requires the fatality decision to key on the Epic-specific `matched` count, not jar-wide noise from other runners' cookies in the same shared jar).
- **`everProvedLive` shared across the whole sweep, mutated progressively** — matches Humble's single-flag design; considered and rejected a per-host-reset flag because it would make a legitimately-empty later host indistinguishable from a dead read channel on that host alone.
- **Split into two atomic commits along the plan's task boundary** — Task 1 (census/logging, fatality untouched) then Task 2 (fatality rewrite), each independently compiling and passing its own test subset before the next was layered on. This required temporarily writing test (a)/(b) in a fatality-neutral way (using a healthy nonzero `clearCookies` mock) so they don't couple to Task 2's not-yet-shipped logic — done deliberately rather than accidentally, and verified by running the Task-1-only test subset against the naive-fatality intermediate state before committing.
- **Per-host log line appends census info to the existing message rather than replacing it** — preserves `user.test.ts`'s existing `stringContaining('cleared 4 epicgames.com cookie(s)')` / `stringContaining('measured post-removal delta')` assertions unmodified.

## Deviations from Plan

None — plan executed exactly as written. One pre-existing, unrelated test-suite failure was observed and is not a deviation from this plan's own scope:

- `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` — 3 failures (`lzmaDecoderKind()` expected `'native'`, received `'pure-js'`). Untouched by this plan; already logged in `deferred-items.md` Item 3 (from plan 35-20) as a pre-existing, machine-specific native-LZMA-decode limitation on this dev machine. No new entry added.
- `src/backend/sidecar/__tests__/enrichmentFlows.test.ts` — failed once under the full `pnpm test --selectProjects Backend` run (load-induced), passed cleanly (41/41) when run in isolation immediately after. Matches this project's known "a full `pnpm test` manufactures a DIFFERENT failure set" pattern (`full-suite-run-manufactures-failures-under-load.md`). Untouched by this plan (no file in `src/backend/sidecar/` was modified). Not logged as a new deferred item since it is not reproducible in isolation.

## Issues Encountered

None beyond the design reconciliation documented in "Decisions Made" above (resolved before writing any code).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `REQ-35-07`'s code-side gap (per-domain census, jar-liveness fatality) is shipped and unit-tested. `35-REVIEW.md` CR-04 part 2 has a shipped fix (backend half; the renderer half shipped in plan 35-22).
- `D-35-19-15` stays open for plan `35-29`'s criterion-21 re-run — that plan must seed and confirm-present a cookie on a non-primary Epic domain before triggering logout.
- `EPIC_COOKIE_HOSTS`/`EPIC_COOKIE_DOMAINS` (T-35-41 paired-list invariant) untouched; `epicLogoutDomains.test.ts`'s existing parity gate still applies unchanged.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/legendary/user.ts
- FOUND: src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
- FOUND: commit acf854233 (feat(35-23): add per-host Epic cookie census (REQ-35-07, D-35-19-15))
- FOUND: commit b5ed7df03 (fix(35-23): base Epic logout fatality on jar liveness, not a bare zero sum (CR-04))
