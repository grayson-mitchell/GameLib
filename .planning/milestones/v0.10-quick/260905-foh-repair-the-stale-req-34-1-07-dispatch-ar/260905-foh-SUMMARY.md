---
id: 260905-foh
title: "Repair the stale REQ-34.1-07 dispatch-arm census gate"
date: 2026-09-05
status: complete
req: REQ-34.1-07
---

# Quick Task 260905-foh — Summary

## What was wrong

`src/backend/__tests__/tauriShellSource.test.ts:274` — the REQ-34.1-07 census gate over
`dispatch_rust_channel`'s arm set — had been RED since `4e269d321` (`feat(40-02)`, 2026-09-04).
Five `store_embed_*` arms landed undeclared, plan 40-07 added four more, six further commits to
`main.rs` went by, and **nothing in Phase 40's planning record mentions this gate** (grepped).

It did exactly what it was built to do — refuse an undeclared capability — and nobody acted on
the refusal. That is the failure mode a known-red gate always decays into: the signal becomes
noise, and the *next* undeclared arm arrives unnoticed because the gate is already shouting.

## Why "just append the names" was the wrong fix

`dispatch_rust_channel` is the **entire sidecar→Rust capability surface**. Every arm is a power
the Node sidecar can invoke in the privileged shell. The allowlist is a **ledger, not a name
list** — both prior maintenance events (34.3 clipboard, 35-08 wake-lock) appended names *plus a
PROOF STATUS paragraph* stating what proves the arm and what is explicitly not attempted.

Ten bare strings would have made the assertion green and thrown the property away.

## What changed

**Ten entries in three PROOF STATUS groups** (`e02268090`):

| Group | Proven | Not attempted |
|---|---|---|
| 40-02 — `open`, `set_bounds`, `hide`, `show`, `close` | Arg parsers via 4 wire-contract tests double-end pinned to `meta/fixtures/store-embed-wire-args.json`, incl. the regression lock for the positional-vs-object defect that rendered both store routes blank. Native calls live-verified by Item 1 (PASS, `54ca5b400`) and Item 3 (**FAILED** first run, passed after `b4517366e`) | `close()`'s `webview.close()` — fires only on `beforeunload` teardown, which no gate item exercises |
| 40-07 — `back`, `forward`, `reload`, `navigate` | 6 cursor + 2 nav-state-JSON tests; zero page-side JS injection | **The buttons themselves.** `40-VERIFICATION.md` Observable Truth 6 recorded ✗ FAILED; Item 2 clicked a link while scoring input *feel*, so Back was never looked at. Recorded plainly as the least-verified arms in the list |
| e61 — `take_nav_events` | 5 queue tests, **3 of 5 RED-proven**; renderer half by property 10, also RED-proven | The `/store/gog` live confirmation, already UNTICKED on the closed todo |

**Scoping every claim above: CI runs no cargo step.** Re-derived at HEAD rather than inherited
from the clipboard block's own assertion — zero `cargo` hits across all 11 workflow files. Every
Rust test named is hand-run and CI-invisible; this jest gate is the only CI-visible proxy for
these arms' existence. No line in the block implies a green pipeline covers them.

**A fail-open hole, found while reading the gate:** the scrape's `[a-z_]+` made any arm with a
**digit** in its name invisible — an undeclared `oauth2_begin` would have passed *by not being
seen*, the one shape of miss this gate could never report. Widened to `[a-z0-9_]+`, measured
byte-identical on today's `main.rs` (36 names either way) before landing.

## Verification — four mutation proofs

Run by holding the tree constant and injecting a single arm:

| # | Mutation | Expected | Result |
|---|---|---|---|
| 1 | inject undeclared `smuggled_arm` | gate RED | ✓ RED — still bites, not a rubber stamp |
| 2 | inject undeclared `oauth2_smuggled` | gate RED | ✓ RED — the widening works |
| 3 | same arm, **old** regex restored | gate GREEN | ✓ GREEN — the hole, demonstrated rather than argued |
| 4 | narrow the regex | self-test RED | ✓ RED — **only after a rewrite, see below** |

### Proof 4 failed first, and the failure was mine

The first self-test hardcoded its own `NARROW`/`WIDE` literals. It was measured **GREEN with the
real gate reverted to the narrow class** — it proved a fact about regular expressions and nothing
whatsoever about this file. A guard that cannot detect the revert it exists to prevent is not a
guard.

Fixed by hoisting both patterns to module-scope bindings (`DISPATCH_ARM_LINE_RE`,
`DISPATCH_ARM_NAME_RE`) that the gate and the self-test **share**. Sharing the binding is the
entire mechanism. This is the "gesture blind to its own defect" shape, caught only because the
mutation proof was actually run instead of assumed.

## Gate results

| Gate | Result |
|---|---|
| Backend suite | **2 failed → 1 failed**, +1 test (4506 → 4507) |
| remaining failure | the unrelated q93 Epic census fallback guard — out of scope, still open |
| `eslint` on the file | zero output; repo gate exits 0 |
| `tsc --noEmit` | clean |
| prettier | **was CLEAN at HEAD, went RED on my edit — fixed with `--write`**, diff confined to my own two lines; file has zero `eslint-disable` comments, so no suppression could be rewrapped away |

The before/after was measured by swapping **only this file** against `git show HEAD:` and leaving
every other file untouched — 195 suites either way.

## A measurement correction to 260905-e61's record

e61's SUMMARY cites "Backend 4460 passing" and "192/193 suites". **Those counts are wrong**, low
by ~40 tests and 2 suites. Re-measured properly here, the HEAD baseline is **195 suites / 4506
tests / 2 pre-existing failures**.

Cause: those readings were taken from `jest` runs issued in the *same shell command* as a file
write or restore, which returns a stale read — the same artefact produced a spurious "2 failed"
twice during this task before a clean re-run gave 1. **e61's conclusion is unaffected** (two
pre-existing failures, unchanged by that work); only the cited numbers were off. Corrected in
place in e61's SUMMARY rather than left standing.

## Out of scope, still open

1. **The q93 Epic census fallback guard** in this same file — unrelated, untouched.
2. **A process finding for Phase 40's record:** nine arms shipped through a blocking-shaped gate
   that nobody read for a day. That belongs in Phase 40's retrospective, not in a code change.
