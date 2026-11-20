---
id: 260905-foh
title: "Repair the stale REQ-34.1-07 dispatch-arm census gate"
date: 2026-09-05
mode: quick
req: REQ-34.1-07
---

## Goal

`src/backend/__tests__/tauriShellSource.test.ts:274` has been RED since `4e269d321`
(`feat(40-02)`, 2026-09-04). Turn it green **without turning it into a rubber stamp.**

## What the gate is, and why that constrains the fix

It scrapes every top-level `dispatch_rust_channel` arm out of `main.rs` as text, subtracts a
hand-maintained `preExistingArms` allowlist, and asserts the remainder is `['tray_set_icon']`.

`dispatch_rust_channel` is the **entire sidecar→Rust capability surface**. Every arm is a power
the Node sidecar can invoke in the privileged shell. The gate's real assertion is *"no
undeclared capability has crept in"*, and its design makes adding one **require a written
declaration** — the two prior maintenance events (34.3 clipboard, 35-08 wake-lock) each appended
names **plus a PROOF STATUS paragraph** naming what proves the arm and what is explicitly NOT
attempted.

**So the allowlist is a ledger, not a name list.** Appending ten bare strings would satisfy the
assertion and destroy the property. This plan writes the ledger entries.

## Load-bearing constraint discovered while researching

The clipboard gate's own doc comment in this same file says CI runs no cargo step. **Re-derived
at HEAD, not transcribed** (`grep -rn "cargo" .github/workflows/*.yml` → zero hits across all 11
workflows). Every Rust unit test cited below is therefore **hand-run and CI-invisible**; this
jest gate is the only CI-visible proxy for Rust source shape. Each PROOF STATUS entry must say
so rather than implying a green pipeline covers it.

## Evidence gathered (all re-derived, none transcribed from a SUMMARY's self-report)

| Arm group | Pure half — unit-tested (hand-run) | Native half — live gate | NOT ATTEMPTED |
|---|---|---|---|
| 40-02: `open`, `set_bounds`, `hide`, `show`, `close` | `store_embed_open_args` / `store_embed_set_bounds_args` via 4 wire-contract tests double-end pinned to `meta/fixtures/store-embed-wire-args.json`, incl. `..._rejects_the_positional_shape_that_shipped` (a real shipped defect: both store routes rendered blank) | Item 1 (D-33 suppression, PASS, launch 3 `54ca5b400`) exercises open+hide+show+set_bounds, 0 px slot-rect delta A/B/C. Item 3 exercises `set_bounds` under sustained motion — **FAILED first run**, passed only on re-run after `b4517366e` | `store_embed_close`'s `webview.close()` — fires only on `beforeunload` app teardown, which no gate item exercises |
| 40-07: `back`, `forward`, `reload`, `navigate` | 6 `StoreEmbedState` cursor tests + 2 `store_embed_nav_state_json` tests; `store_embed_navigate_args` in the same fixture | — | **The buttons themselves.** `40-VERIFICATION.md` Observable Truth 6 "Chrome back/forward reflect the live page — ✗ FAILED". Item 2 clicked an in-page link but its pass condition is input *feel*; the Back button was never scored |
| e61: `take_nav_events` | 5 queue tests, 3 of 5 proven RED; renderer half by `useStoreEmbedHost.test.tsx` property 10, RED-proven | — | The `/store/gog` `af.gog.com`→`www.gog.com` confirmation, recorded UNTICKED on the closed todo |

Cross-cutting: every arm's non-macOS branch returns `:unsupported-platform`. D-03's macOS-only
`unstable` gating is proven by a `cargo tree --target` diff and **NOT** by cross-target
`cargo check` — `40-02-SUMMARY.md` records that as an environment limitation (only
`aarch64-apple-darwin` installed; the run failed `E0463` before reaching this crate), explicitly
not a passed proof. Carry that distinction; do not upgrade it.

## Tasks

### T1 — Write the ten ledger entries

- **files:** `src/backend/__tests__/tauriShellSource.test.ts`
- **action:** append the 10 arms to `preExistingArms` in **three commented groups** (40-02,
  40-07, e61), each carrying a PROOF STATUS paragraph in the wake-lock entry's shape: what the
  pure half proves, what the native half cannot prove and why, what is live-verified with the
  run's commit, and what is **NOT ATTEMPTED**. State the no-cargo-in-CI fact once, at the top of
  the block, so it scopes all three groups.
- **verify:** the gate passes; `newArms` is `['tray_set_icon']`.
- **done:** every added name sits under a claim a reader can check.

### T2 — Tighten the scrape so a digit-bearing arm cannot pass invisibly

- **files:** same
- **action:** `[a-z_]+` → `[a-z0-9_]+` in **both** the match and the extract regex. Today an arm
  named e.g. `wake_lock_2` would be **invisible to the scrape** and pass by not being seen — a
  fail-open hole in a gate whose entire job is to catch the undeclared.
- **verify:** **measure that the scraped set is unchanged** before/after. This widens the
  scrape's vocabulary, so it can only ever catch more — but "can only catch more" is a claim,
  and this repo has a standing lesson about gates that convict correct code. Assert it.
- **done:** the widened regex yields byte-identical arm names on today's `main.rs`.

### T3 — A self-test proving the tightening is real

- **files:** same
- **action:** add a self-test beside the existing `loadMainRsCode comment-stripping self-test`
  (the file's own precedent for proving a helper rather than the file). Run **both** the old and
  new regex against a synthetic digit-bearing arm and assert the old one misses it and the new
  one catches it.
- **verify:** the test fails if the regex is reverted.
- **done:** the fix cannot be silently undone.

## must_haves

**truths**
- The gate is green *and* still refuses an undeclared arm.
- Every one of the 10 names carries a checkable proof claim, including its NOT ATTEMPTED half.
- No claim asserts CI coverage that does not exist.
- The regex change is proven not to alter today's result set.

**artifacts**
- 10 allowlist entries in 3 PROOF-STATUS groups
- widened regex in both places, plus a self-test that fails on revert

**key_links**
- `src/backend/__tests__/tauriShellSource.test.ts`
- `.planning/phases/40-.../40-LIVE-GATE.md`, `40-VERIFICATION.md`, `40-02-SUMMARY.md`

## Out of scope

The two *other* things this gate's staleness exposes, both reported and neither fixed here:
`tauriShellSource.test.ts`'s Epic census fallback failure (quick q93, unrelated), and the fact
that Phase 40 shipped nine arms through a blocking-shaped gate nobody acted on for a day — a
process finding for Phase 40's record, not a code change.
