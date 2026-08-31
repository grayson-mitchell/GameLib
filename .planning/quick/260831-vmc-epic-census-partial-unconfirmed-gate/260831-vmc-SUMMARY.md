---
phase: quick-260831-vmc
plan: 01
subsystem: legendary/epic-logout
tags: [testing, mutation-testing, epic, cookies, REQ-35-07, D-35-19-15, F-5-02]
requires:
  - "src/backend/storeManagers/legendary/user.ts:564 (`if (unconfirmedHosts.length > 0)`) — READ-ONLY"
provides:
  - "(e5) partial-unconfirmed boundary pin in epicCookieCensus.test.ts"
affects:
  - "35-VERIFICATION.md finding F-5-02"
tech-stack:
  added: []
  patterns:
    - "call-indexed jest mock counter to target one read inside a fixed-order sweep"
    - "record the rejecting call from the mock's OWN arguments, so the targeting assertion is not tautological"
key-files:
  created: []
  modified:
    - src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
decisions:
  - "Target a MIDDLE host (unrealengine.com, index 2) rather than the first or last, so the pin cannot pass via a loop that short-circuits at an edge"
  - "Do NOT copy (e3)'s `not.toContain(`${host}=0,`)` — in (e5) four hosts legitimately record a zero"
metrics:
  duration: ~25 min
  completed: 2026-08-31
  tests_before: 53
  tests_after: 54
---

# Quick Task 260831-vmc: Epic census partial-unconfirmed gate Summary

Added `(e5)`, the pin that closes **F-5-02**: one rejecting final-verification read out of five is
still fatal, and mutation D — which previously failed **0** tests — now fails exactly that test.

## What was wrong

Every pre-existing test in `epicCookieCensus.test.ts` drives the final verification sweep to be
either **uniformly healthy** or **uniformly rejecting**. Nothing exercised the boundary between
them. So narrowing the gate at `user.ts:564` from

```ts
if (unconfirmedHosts.length > 0) {
```

to `if (unconfirmedHosts.length === EPIC_COOKIE_HOSTS.length)` failed **nothing** — 53/53 PASS —
while the mutated product logged the affirmative `post-clear verification — 0 Epic-owned cookie(s)
remain across 5 domain(s)` over a jar one host of which nothing read, and `logout()` **resolved**.

This is the recorded `fixing-a-fail-open-gate-can-create-its-sibling` shape a third time:
SOME-unconfirmed is the fail-open sibling of ALL-unconfirmed, one level over.

**The product code is correct and was not changed.** This task added the missing pin only.

## What `(e5)` does

Fixture (deliberately arithmetically coherent — an incoherent one is how this defect family hid
twice):

| Read | Value | Consequence |
|---|---|---|
| before | `total=9, matched=3` | sets `everProvedLive`; `domainVerdict` = `SUPPORTED_NONEMPTY` |
| clear | `deleted=3` | nonzero delta ⇒ no `brokenHosts` throw; summed total 5×3 = 15 ⇒ no `total===0` throw |
| after | `total=6, matched=0` | 9 − 3 = 6 records left, none Epic's |
| verify | `total=6, matched=0` | same jar, re-read after every mutation |

Control therefore reaches the final sweep at `user.ts:545`. Census call **13** (= `2N+3`, the third
verification read, host **`unrealengine.com`** — a *middle* host) rejects; every other read resolves.

Assertions, all measured green:

1. `logout()` rejects with `/could not read the cookie jar for unrealengine\.com —/` — the em-dash
   straight after a single host name is the discriminator against the all-five case, whose list
   would continue with a comma.
2. `(e3)`'s mechanism, not a new one: `allLoggedText()` must **not** contain
   `Epic-owned cookie(s) remain`; must contain `COULD NOT CONFIRM` and **`1 of 5 domain(s)`** — the
   partial-vs-total discriminator.
3. `unrealengine.com=unconfirmed`, and `${host}=0` for the other four.
   **`(e3)`'s `not.toContain(`${host}=0,`)` was deliberately NOT copied** — here four hosts
   legitimately record a zero, so mirroring `(e3)` wholesale would have produced a wrong test.
4. Targeting proof (all four, or the test proves nothing): `clearCookies` called `N`=5 times;
   `cookiesForDomain` called `3N`=15 times; `rejectedRead` equals `{ index: 13, host:
   'unrealengine.com' }`, captured from the mock's **own arguments** rather than hardcoded; and
   `logged.match(/cookie census read failed/g)` has length **1** — exactly one non-fatal warning
   proves no clear-loop read rejected.
5. T-35-04 hygiene: no `FORBIDDEN_LOG_SUBSTRINGS` entry, no `sentinel-cookie-`.

## Mutation matrix — measured, not asserted

Protocol per mutation: `cp` to `/tmp/user.ts.pristine`, apply, run
`npx jest src/backend/storeManagers/legendary/__tests__/` redirected to a file with `$?` captured
from the **bare** command, restore by `cp`, re-verify sha256. Never `git checkout --`, never
`git stash`, never `git reset`.

| Mutation | Change | Expected | **Measured** | Failing tests |
|---|---|---|---|---|
| **D** | `unconfirmedHosts.length > 0` → `=== EPIC_COOKIE_HOSTS.length` | `(e5)` must fail (was **0**) | **1 failed / 53 passed**, exit 1 | **`(e5)`** only |
| **A** | residual loop sums `verify.matched` unconditionally (trustworthy gate + unconfirmed branch deleted) | 3 | **4 failed / 50 passed**, exit 1 | `(e2)` `(e3)` `(e4)` **+ `(e5)`** |
| **B** | delete the `throw` inside the `unconfirmedHosts.length > 0` branch, keep its `logWarning` | 3 | **4 failed / 50 passed**, exit 1 | `(e2)` `(e3)` `(e4)` **+ `(e5)`** |
| **C** | `trustworthy \|\|= verify.verdict === 'UNDECIDABLE'` | 1 | **1 failed / 53 passed**, exit 1 | `(e4)` only — **unchanged** |

### Reading the matrix

- **D is the finding's closure.** It went **0 → 1**. The one death is `(e5)`, and the failure mode is
  exactly F-5-02's: `expect(received).rejects.toThrow()` / *"Received promise resolved instead of
  rejected. Resolved to value: undefined"* — under D the mutated product certifies the jar and
  `logout()` resolves.
- **D also re-confirms the plan's stated pre-`(e5)` baseline without any file surgery.** Under D the
  other **53 tests all passed**. Since those 53 are precisely the pre-`(e5)` suite, D failing 0/53
  before this change is not merely quoted from the plan — it is re-derived from this run.
- **A and B rose 3 → 4, and no pin was displaced.** The `diff` of the failing-test name sets for A
  and B is empty (identical failure sets), and both contain the original `(e2)` `(e3)` `(e4)`
  *plus* `(e5)`. A rise because `(e5)` also dies is the expected, benign direction; the criterion
  that mattered — the previously-failing tests still fail — holds for both.
- **C is unchanged at 1**, still `(e4)`. `(e5)` correctly does **not** die under C: its rejecting
  read yields `UNSUPPORTED_OR_ERROR`, not `UNDECIDABLE`, so C's widened trust predicate does not
  reach it. `(e4)` remains C's sole and specific pin.

**No count dropped anywhere.** `(e5)` has not collapsed or made redundant any existing pin.

### sha256 restore verification

`shasum -a 256 src/backend/storeManagers/legendary/user.ts` was re-checked after **every** mutation
and matched `f9b3b88a39373fb6be81bb38476c7c4a4821f9aef7f0304f3ab02c2cf6142676` every time —
after D, after A, after B, after C, and once more before this summary was written. `git diff` for
`user.ts` is empty. **The product file is byte-identical to its pre-task state.**

## Verification

- `npx jest src/backend/storeManagers/legendary/__tests__/` → **exit 0, 54 passed / 54 total**,
  3 suites (53 baseline + `(e5)`).
- `--verbose` confirms `(e5)` genuinely ran and sits between `(e4)` and `(g)` in the
  `Task 1: per-host cookie census` describe.
- `npx prettier --check` on the modified file: exit 0 (the file was clean before the edit and is
  clean after — no repo-wide prettier state was disturbed).
- `git status --porcelain` shows no source modifications beyond the committed test file;
  `user.ts` does not appear.
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md` is still
  present and still **modified/uncommitted** — never staged, never reverted, never opened for write.

## Deviations from Plan

One, cosmetic and disclosed:

**Extended one extra stale cross-reference.** The plan directed extending "the `(e2)-(e4)` block
comment" to `(e2)-(e5)`. There is a *second* occurrence of the string `(e2)-(e4)` inside test `(a)`'s
comment (`See (e2)-(e4).`) which the plan did not mention. I updated it to `(e2)-(e5)` as well, so
the file does not carry a reference that points at a range one member short. No behavioural effect.

Nothing else was substituted for the plan's approach. The call-index map (`2N+3` = 13), the
middle-host targeting choice, the fixture arithmetic, the four-part targeting proof and the explicit
instruction *not* to copy `(e3)`'s `${host}=0,` assertion were all followed as written.

## Out of scope, not attempted

- The release-build live gate — **the operator drives it**. No app launched, killed or restarted; no
  build run; nothing claimed about it.
- `src-tauri/target/`, `build/`, `src-tauri/binaries/` untouched (a release DMG is being verified
  separately).
- Known-red baselines confirmed out of this task's suite path and not masked: the 3 `decompressPool`
  native-LZMA failures live in `steam/__tests__/`, and `pnpm lint`'s 9 errors are routed to Phase 39.
  Neither was run or relied upon here.

## Known Stubs

None.

## Self-Check: PASSED

- `src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts` — FOUND, contains `(e5)`
- `src/backend/storeManagers/legendary/user.ts` — FOUND, sha256 `f9b3b88a…6142676` (pristine)
- commit `b737b2f42` — FOUND
