---
phase: 35-electron-cutover-remove-the-electron-build
plan: 09
subsystem: login-webview
tags:
  [
    d-09-corrected,
    d-05,
    d-16,
    epic,
    logout,
    cookies,
    domain-scoped,
    tauri,
    req-35-07,
    req-34.4.1-06,
    t-35-37,
    t-35-38,
    t-35-39,
    t-35-40,
    t-35-41
  ]
status: TASKS 1-2 COMPLETE — Task 3 (blocking human-verify, live 34.6 Step 8 re-run) OUTSTANDING

# Dependency graph
requires: [35-01, 35-02, 35-08]
provides:
  - '`EPIC_COOKIE_DOMAINS` in main.rs — the five Epic-owned apex domains, replacing the single `EPIC_COOKIE_DOMAIN` literal'
  - '`epic_cookie_domain_matches(domain)` in main.rs — the macOS fallback guard, delegating every comparison to `cookie_domain_matches`'
  - '`EPIC_COOKIE_HOSTS` in legendary/user.ts — the paired TS list, looped one `seam.clearCookies` call per domain inside ONE hidden window'
  - 'A summed, per-domain-logged Epic cookie clear whose ZERO TOTAL fails the logout instead of warning and continuing'
  - '`FATAL_WIPE_STEP` — the single named wipe step whose failure is fatal to `logout()`, with the others explicitly left as warnings'
  - 'epicLogoutDomains.test.ts — 14 tests, including a cross-language gate asserting the Rust set and the TS list are the same list'
affects: [35-13, 35-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'When a filter cannot match its target BY CONSTRUCTION, widen the filter — do not change the mechanism. The banned blanket wipe would have passed the plan''s own success criterion while destroying every other storefront session'
    - 'RENAME a constant whose meaning changes (`EPIC_COOKIE_DOMAIN` -> `EPIC_COOKIE_DOMAINS`) so every existing reference goes red at compile time rather than silently inheriting a new meaning'
    - 'Test a narrowing guard in BOTH directions. A positive-only test cannot detect an over-wide set, which is the exact harm the requirement closed'
    - 'Re-derive a structural gate''s expectation by re-running the gate''s own algorithm over the pre- and post-edit files and diffing the multiset — a green test only says the expectation still holds, not that you checked it'
    - 'A "grep count unchanged" acceptance criterion is a tripwire on a TOKEN. New comments must not spell that token, or the count stops meaning what it was written to mean'
    - 'Attribute a flaky test failure by re-running the RECONSTRUCTED pre-change tree, not by asserting the suite is known-flaky'
    - 'A per-domain breakdown is what makes an incomplete operation diagnosable. A bare total is what let this defect hide for a whole phase'

key-files:
  created:
    - src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts
  modified:
    - src-tauri/src/main.rs
    - src/backend/storeManagers/legendary/user.ts
    - src/backend/storeManagers/legendary/__tests__/user.test.ts
    - src/frontend/state/GlobalState.tsx

key-decisions:
  - '`clear_all_browsing_data()` was NOT used and remains banned. Its `grep -c` over main.rs is 3 before and 3 after, and the three prohibition comments are byte-identical.'
  - 'The `f_34_4_2_12` structural (arm, guard) expectation does NOT move. Established by re-running the gate''s own scan algorithm over both the pre-edit snapshot and the post-edit file and diffing the result — not by observing the test stayed green.'
  - 'Exactly ONE wipe step is fatal: `clearEpicCookies`. ANY failure of it is fatal, not only the zero-total case. The other steps deliberately stay warnings — argued in full below.'
  - 'The fatal failure is captured and rethrown AFTER the credential-side cleanup, never instead of it (T-34.5-19 is unweakened), and the later wipe steps still run.'
  - '`GlobalState.epicLogout` was fixed although the plan did not list it — logout() can now reject, and without a guard the rejection latched the library''s global `refreshing` flag forever.'
  - 'A cross-language gate reads main.rs off disk and asserts `EPIC_COOKIE_DOMAINS` equals `EPIC_COOKIE_HOSTS`. The plan only asked for paired comments; a comment cannot fail.'

# Metrics
tasks-completed: 2
tasks-outstanding: 1
commits:
  - d3c7b8bf9
  - 48ac4c677
---

# Phase 35 Plan 09: Epic Logout Reaches Every Epic-Owned Domain Summary

The Epic logout cookie clear now attempts five Epic-owned apex domains instead of one — widened on
BOTH sides of the seam, because a TS-only loop would have failed four of the five — sums the
per-domain deltas, logs a per-domain breakdown, and FAILS the logout when it removed nothing
anywhere. The banned blanket wipe was not used and its in-source prohibitions are untouched.

---

## 1. Why both halves had to change together

`humble_login_clear_cookies` (`main.rs:5747`) carries a macOS-only Epic fallback gated on
`cookie_domain_matches(domain, Some(EPIC_COOKIE_DOMAIN))`, where that constant was the single
literal `"epicgames.com"`. Epic's login window comes from `open_pristine_epic_login_window`, which
never registers a Tauri-managed `WebviewWindow`, so `existing_window` is structurally always `None`
on that path — the guard is the ONLY thing admitting the call.

Passing `fortnite.com` to the old guard therefore failed the domain check and fell straight through
to `humble_login:no-window:{label}`. Four of the five domains would have returned an **error, not a
clear**, and the logout would have looked like it worked.

Both sides changed in the same plan, and a test now asserts they are the same list.

## 2. `clear_all_browsing_data` — the count, before and after

| | count | lines |
|---|---|---|
| before | **3** | 2066, 5742, 6237 |
| after | **3** | 2066, 5785, 6289 |

The three prohibition comments are **byte-identical** — verified by diffing the matched lines
against the pre-edit snapshot (`diff` of the two grep outputs, text only, ignoring line numbers:
empty).

**One thing worth knowing about this criterion.** My first draft of the new doc comment and the new
negative test comment each mentioned `clear_all_browsing_data()` by name, in prose, to explain why
it is banned. That took the count from 3 to **5** without adding a single call. The criterion is a
tripwire on the *token*, and a count of 5 would have permanently destroyed its meaning for the next
reader — "3" is supposed to mean "the three prohibitions and nothing else". Both new comments were
rewritten to describe the API without spelling its name, and each says in place that it is
deliberately not spelling it. Count restored to 3.

## 3. The `main.rs:9903` structural gate — what happened, and how I established it

**The expectation does NOT move.**

I did not establish that by running `cargo test` and seeing green. A green test only tells you the
expectation still holds; it does not tell you whether you checked. I re-implemented the gate's own
scan algorithm (arm tracking by `"name" => {` lines, comment/`cookies_for_url` skipping, the
backward walk to the nearest preceding `#[cfg(`) as a standalone script and ran it over **both** the
pre-edit snapshot and the post-edit file:

```
PRE-EDIT                                                              POST-EDIT
('humble_login_clear_cookies',       '#[cfg(not(macos))]', 5883)  ->  (same, 5934)
('humble_login_clear_cookies',       '#[cfg(not(macos))]', 6070)  ->  (same, 6121)
('humble_login_cookies',             '#[cfg(not(macos))]', 5643)  ->  (same, 5685)
('humble_login_cookies_for_domain',  '#[cfg(not(macos))]', 6355)  ->  (same, 6406)
split_line_shape_found: True        total sites: 4                    True / 4
```

The `(arm, guard)` multiset is identical; only line numbers moved, and line numbers are not part of
the expectation. That is the correct outcome for this change: I added no `.cookies()` call site,
removed none, moved none between arms, and added no `#[cfg(...)]` attribute between any call site
and its guard. The guard edit replaced a two-line `if` condition with a one-line one inside the same
`#[cfg(target_os = "macos")]` attribute.

The gate's own instruction ("re-derive from a fresh measurement, never widen to make it pass") was
followed even though the derivation landed on the same answer.

## 4. The judgment call: what happens to the OTHER wipe steps' failures

**They stay warnings. Only `clearEpicCookies` becomes fatal.** Named in source as
`FATAL_WIPE_STEP`, with the reasoning written in place rather than left to be re-derived.

**Why `clearEpicCookies` is fatal:**

- It is the step that establishes the security property logout exists to establish — the next user
  of this OS profile must not open the login window already authenticated.
- It is the only step with a **measured** success signal (a post-removal delta), so "it did nothing"
  is *observable* here and nowhere else. A failure that is both observable and load-bearing must not
  be swallowed; swallowing it is the exact defect class that produced the original lying self-report.

**Why ANY failure of it is fatal, not just the zero-total one:** a step that threw (a rejected
Rust-side clear, a window that never opened) removed nothing either. Treating "removed nothing" as
fatal while treating "crashed, therefore also removed nothing" as a warning would just move the
fail-open one level over — the shape recorded in
`fixing-a-fail-open-gate-can-create-its-sibling`.

**Why the others stay warnings:**

- `clearEpicStorage` is origin-scoped by construction and reports counts that are *legitimately*
  zero (a user with no localStorage). It has **no zero-delta contract to promote**. Making its throw
  fatal without a measured defect would convert an unmeasured risk into a new failure mode.
- The Electron branch's five `session.fromPartition` steps are a legacy path this phase removes
  wholesale. Changing their semantics now buys nothing and alters a leg that is being deleted.
- The plan explicitly forbids changing their behaviour **silently in either direction**. This is the
  non-silent statement.

**Ordering, which is the part that matters:** the failure is *captured* and rethrown **after**
`configStore.delete('userInfo')` + `clearCache('legendary')`. That cleanup is T-34.5-19's security
boundary and must run unconditionally — a sign-out that revoked the CLI session but left `userInfo`
behind is worse than one that left a stray cookie behind. The remaining wipe steps also still run; a
fatal cookie step does not take the storage step down with it. Both properties have their own tests.

**One accepted consequence, stated rather than discovered later:** a logout run against an
already-empty jar (for instance a second logout with no intervening login) will now legitimately
measure a zero total and fail. The operator decision took this deliberately — a clear that removed
nothing should not report success — but it is a real behavioural edge and belongs in Task 3's notes.

## 5. Deviations from the plan

### D1 — `GlobalState.epicLogout` fixed (file not in the plan's `files_modified`)

**Rule 2 — missing error handling, directly caused by this change.**

`logout()` can now reject. `GlobalState.tsx`'s `epicLogout` awaited `window.api.logoutLegendary()`
with no guard:

```ts
this.setState({ refreshing: true })
await window.api.logoutLegendary().finally(...)   // rejects here
this.setState({ refreshing: false })              // never runs
```

The rejection skipped `setState({ refreshing: false })`, latching the library's **global** loading
flag forever. `Login/components/Runner`'s own `handleLogout` already guards its button (G-30-01) but
that guard cannot reach this flag. Wrapped in `try/finally`. The rejection is deliberately **not**
swallowed — `finally` rethrows, and the Runner guard is what surfaces and logs it.

Frontend suite: 130 suites / 2101 tests, all green, including
`GlobalStateScopedRefresh.test.ts`'s source-shape gates on this exact method.

### D2 — a cross-language list-pairing TEST, not only paired comments

The plan (and T-35-41's mitigation) asked for the two lists to "carry paired comments naming each
other". They do. But a comment cannot fail, and list drift is the named threat. `epicLogoutDomains.test.ts`
additionally reads `main.rs` off disk and asserts `EPIC_COOKIE_DOMAINS` equals `EPIC_COOKIE_HOSTS`
equals an independently-written copy of the operator-approved set. RED-proven (mutation T8).

The gate carries a **stripper-integrity guard**: `stripSourceComments` drops every line beginning
with `*`, so a source gate over Rust can go silently vacuous. The test counts the entries in the
**raw** file first and requires that count `> 0` before trusting the stripped extraction.

### D3 — three existing tests in `user.test.ts` changed their expected outcome

`resolves.toBeUndefined()` -> `rejects.toThrow(...)` for the three cases where `clearCookies`
rejects. Each test's original *subject* is unchanged and still asserted alongside: the window is
still closed, the credential-side cleanup still runs, the storage step still runs. Only the reported
outcome moved, which is the point of the plan.

The `removed nothing for epicgames.com` per-domain warning was **deleted**, not kept alongside the
new behaviour: under a five-domain sweep an individual zero is legitimate, so warning on it would
fire on correct behaviour.

### D4 — `graphify update .` NOT run

`CLAUDE.md` asks for it after modifying code. Not run: this repo's `graphify update` is known to
delete `graphify-out/graph.html`. Destroying that artifact as a silent side effect of this plan is
worse than flagging it. **Run it yourself if you want the graph refreshed.** (Same call as 35-08 D5.)

### Not a deviation, but worth recording: the extraction bug the RED-proof caught

`extractQuotedList` originally anchored on the first `[` after the constant's name. Rust declares
`const EPIC_COOKIE_DOMAINS: &[&str] = &[`, whose first `[` belongs to the **type**. The gate
extracted `&str`, compared an empty list, and failed loudly on its first run. It now anchors on the
assignment `=`. The comment in place says why, so the next person does not re-introduce it.

## 6. RED-proofs — every mutation and the failure it produced

Nothing below was accepted green-on-first-write. 35-08's start/stop pairing test — its entire threat
mitigation — passed against a deliberately broken `stop`, and was only caught because the executor
broke the code on purpose.

### Rust (3 mutations)

| # | Mutation | Failed |
|---|---|---|
| R1 | dropped `"fortnite.com"` from `EPIC_COOKIE_DOMAINS` | 3 tests: `..._accepts_every_epic_owned_apex` ("expected the Epic-owned apex `fortnite.com` to reach the macOS clear path"), `..._accepts_subdomains_of_each_apex`, `epic_cookie_domains_is_exactly_the_operator_approved_set`. 193 passed / 3 failed |
| R2 | replaced `cookie_domain_matches(domain, Some(epic))` with a bare `domain.ends_with(epic)` (no dot boundary) | 1 test: `..._rejects_suffix_lookalikes` — "suffix lookalike `notepicgames.com` must NOT reach Epic's clear path". 195 passed / 1 failed |
| R3 | made the guard match every non-empty domain (`!domain.is_empty()`) | 2 tests: `..._rejects_every_other_storefront` — "`humblebundle.com` must NOT reach Epic's clear path -- an over-wide guard is the REQ-34.4.1-06 harm, not a convenience" — and `..._rejects_suffix_lookalikes`. 194 passed / 2 failed |

R3 is the load-bearing one: it is the over-wide-set direction, and it is exactly what a
positive-only test could not have detected.

### TypeScript (6 mutations, run against both legendary test files, 28 tests total)

| # | Mutation | Failed |
|---|---|---|
| T1 | `for (const host of EPIC_COOKIE_HOSTS.slice(0, 1))` — only the first domain attempted (the pre-plan behaviour) | 4: "attempts EVERY approved Epic-owned apex...", "logs a per-domain breakdown AND a total equal to the sum", "closes the single window ... even when a MIDDLE domain rejects", "no Epic cookie name ... reaches any log sink" (its non-vacuity clause on `metahuman.com`) |
| T2 | `total = deleted` instead of `total += deleted` — last value, not sum | 3: "...total equal to the sum of the deltas", "a single domain returning 0 among non-zero others does NOT fail the logout" (4,0,0,0,0 -> last = 0 -> wrongly rejects), and the log non-vacuity clause |
| T3 | opened a fresh hidden window per domain | 2: "opens ONE hidden window for the whole sweep and closes it exactly once", "closes the single window exactly once even when a MIDDLE domain rejects" |
| T4 | disabled the zero-total check (`if (false)`) | 5, incl. "a ZERO TOTAL across every domain REJECTS the logout", "a zero total still runs the credential-side cleanup BEFORE it rejects", "a zero total does not stop the LATER wipe steps from running" |
| T5 | reverted the fatal step to warn-and-continue — the old swallow | 9, spanning both files |
| T6 | leaked the cookie name `EPIC_DEVICE` into the per-domain log line | 2: both T-35-40 disclosure tests |
| T7 | rethrew the fatal failure INSIDE the loop, skipping credential cleanup | 6, incl. "a zero total still runs the credential-side cleanup BEFORE it rejects (T-34.5-19)" |
| T8 | dropped `metahuman.com` from `main.rs` only, drifting the two lists | 1: "main.rs EPIC_COOKIE_DOMAINS is exactly the approved set" |
| T9 | moved the window close out of the unconditional `finally` | 1: "closes the single window exactly once even when a MIDDLE domain rejects" |

After each mutation the file was restored from a `cp` snapshot and re-verified by `shasum` against
the recorded green hash. Final tree hashes match the green snapshots exactly.

## 7. What is NOT logged

Counts and domain names only. `FORBIDDEN_LOG_SUBSTRINGS` in the new test file pins `EPIC_SESSION_AP`,
`EPIC_DEVICE`, `EPIC_LOGIN_ID`, `_epicSID`, `_tald`, `__cf_bm` and a synthetic token marker against
every string that reached `logInfo`/`logWarning`/`logError`, on both the success and the failure
path. Each check is preceded by a **non-vacuity clause** requiring the log corpus to be non-empty and
to actually contain the domains and the total — otherwise "contains no cookie name" is trivially
true. No real cookie value appears anywhere in the test fixtures, comments or commit messages
(T-35-04: this repo is public).

## 8. Verification

| Gate | Baseline | Result |
|---|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml` | 191 passed / 0 failed | **196 passed / 0 failed** (+5 new) |
| `pnpm test --selectProjects Backend` | 185 suites, 3 failed (`lzmaLoader`/`decompressPool` reporting `pure-js`) | **186 suites, 4344 passed, exactly the same 3 failures** |
| `pnpm codecheck` (`tsc --noEmit`) | clean | **clean** |
| `pnpm test --selectProjects Frontend` | — | **130 suites / 2101 passed** |

`--selectProjects Backend` was confirmed non-vacuous: the run prints `Running one project: Backend`
and reports a non-zero test count (4349 collected). An unrecognised project name runs 0 suites and
still exits 0.

`eslint` on every changed file: **0 errors.** Warning counts are unchanged per file
(`user.ts` 6 -> 6, `user.test.ts` 18 -> 18, `GlobalState.tsx` 19 -> 19); the new test file adds 5
warnings of the same `no-unsafe-*` shapes its sibling `user.test.ts` already carries 18 of.

`prettier --check` **in place** (not on a scratch copy, which resolves a different config): all four
changed files clean. `user.ts` was clean before the change, so `--write` touched only my own lines —
verified by reading the diff's removed lines, all of which are mine.

`cargo fmt --check` is red repo-wide (53 pre-existing hunks) and was NOT "fixed". My new code
introduces **no** new rustfmt diff: none of my added lines appear as a `+`/`-` line in its output
(the only mention of my identifiers is a context line beneath a pre-existing hunk).

### The flaky-suite attribution, done honestly

Two intermediate Backend runs showed **4** failures, not 3 — once `enrichmentFlows`, once
`bootstrapWirings`, the two suites recorded as alternating flakes under full-suite load. Rather than
assert "known flake", I reconstructed the pre-change tree (`cp` of the snapshot, not `git checkout`)
and ran it three times:

| Pre-change run | Failures |
|---|---|
| 1 | 3 |
| 2 | **4** (a flake) |
| 3 | 3 |

The pre-change tree flakes the same way, so the flake is not attributable to this plan. Neither
suite reads `main.rs`. The final post-change run landed at exactly 3.

## Known Stubs

None.

## Threat Flags

None. This plan narrows an existing security-relevant surface (the cookie clear's filter) rather
than adding one. No new network endpoint, auth path, file access pattern or schema change at a trust
boundary.

---

## Task 3 — OUTSTANDING (blocking human-verify)

**Not attempted and not self-certified.** It needs a live `pnpm tauri:dev` run with a real Epic
login and a second storefront logged in.

Three things worth knowing before running it:

- **Clause (b) is the whole point.** A foreign storefront's cookies must SURVIVE, matched by exact
  name, and that storefront must still be signed in. A clear that empties the jar is a REGRESSION,
  not a pass — that is what the superseded plan would have done, and its own gate would have scored
  it green. Do not accept clause (a) alone.
- **Do not plant a cookie via the Tauri DevTools console.** That console accepts neither paste nor
  Enter on macOS, and it is logged as 34.6 Step 8's sixth contract defect. Use cookies already in
  the jar.
- **`strings(1)` is not sound** on the binarycookies jar — it retains tombstoned bytes, so a name
  appearing in the file is not evidence of a live cookie. Prove the reader non-vacuous on a
  known-live cookie first, and confirm the jar was flushed (mtime/size moved) before reading it.

The per-domain log line to look for reads
`Legendary logout: Epic cookie clear removed N cookie(s) across 5 Epic-owned domain(s) —
epicgames.com=A, fortnite.com=B, unrealengine.com=C, twinmotion.com=D, metahuman.com=E`.
Individual zeros in that breakdown are expected and fine; a zero total now fails the logout and the
UI will surface a failed sign-out rather than a silent success.
