---
quick_id: 260905-glr
slug: sweep-prettier-over-the-22-store-embed-files
status: complete
date: 2026-09-05
mode: quick
ships_code: true
commits:
  - d74624710
---

# Quick Task 260905-glr — Summary

**The `pnpm prettier` pre-push leg is green. All four legs now exit 0.** 22 files, +440/−202, no
behaviour changed — and that was measured, not asserted.

## The sweep

`pnpm prettier` had been exiting 1 since the Phase 40 store-embed work landed, blocking the
pre-push hook's third leg. `npx prettier --write` over exactly the 22 files the gate named.
`git status` showed exactly 22 modified files afterwards, nothing else.

## Proving it cosmetic, because a sweep is not always cosmetic

Quick `260901-ud5` swept 46 files and found **3 carried real changes**. So this run measured
rather than trusted:

**AST equality over the 21 TS/TSX files.** Parsed pre- and post-sweep copies with the repo's own
`typescript`, walked both trees, compared node kinds plus identifier/literal text.

- First pass: **1 file differed** — `useStoreEmbedHost.test.tsx`.
- Cause: prettier dropped a redundant `ParenthesizedExpression` around a conditional arrow body
  (`getItem: (key) => (a ? b : null)` → `getItem: (key) =>\n  a ? b : null`).
- Second pass ignoring `ParenthesizedExpression` nodes: **0 of 21 differ.** So the sole structural
  change in the entire sweep is a redundant-paren removal.
- **Non-vacuity proven:** injecting one line into `storeEmbedOrigins.ts` makes the same comparison
  report a difference, then reverting restores 0. A check that cannot fail proves nothing.

**The cross-language fixture — run, not reasoned about.**
`meta/fixtures/store-embed-wire-args.json` is parse-identical (same 4 keys). But it is
`include_str!`'d into `src-tauri/src/main.rs:9332`, so its **bytes** changed. `serde_json::from_str`
is whitespace-insensitive in principle — and that principle is exactly the kind of claim this
fixture exists to punish. `main.rs:9320`'s own comment records why: on 2026-09-05 a live gate found
`store_embed_open` rejecting every call because the sidecar sent positional arrays while the Rust
parsers read a single object, and **every gate was green — both sides were tested, the contract
between them was not.** So `cargo test store_embed_wire_contract` was run: **4 passed, 0 failed.**

**ESLint compared per rule, not by total.** Three `eslint-disable-next-line` directives sit in
these files — the precise hazard `260901-ud5` hit when a `require()` reflow carried a call out from
under one. The repo-wide total was unchanged at 4145 warnings / 0 errors, but a net-zero total can
hide two offsetting changes, so the comparison was done **per file and per rule id across the whole
repo**: identical, no rule starts or stops firing anywhere. All three directives verified still
sitting directly above their intended target lines (`return useStoreEmbedHost({`,
`return new Function(...)`, `}, [])`).

## Verification

| Check | Result |
|---|---|
| Files touched | **exactly 22**, nothing else |
| AST equality (21 TS/TSX, parens ignored) | **0 differ**; non-vacuity proven by injection |
| JSON fixture | parse-identical, same 4 keys |
| `cargo test store_embed_wire_contract` | **4 passed / 0 failed** against the reformatted bytes |
| `pnpm test:ci` | **8002 passed / 1 failed / 3 skipped — byte-identical to baseline**, same failing suite by set comparison |
| `pnpm codecheck` | exit 0 |
| `pnpm lint` | exit 0 — per-file-per-rule counts **identical** repo-wide |
| `pnpm prettier` | **exit 0** (was 1) |
| `pnpm i18n --fail-on-update` | exit 0, wrote nothing outside the 22 — no `t()` reflow disturbed the catalogues |
| **All four pre-push legs** | **exit 0** |

The `pnpm test:ci` baseline was captured **before the first edit**, so no failure could be silently
inherited.

## Pre-existing and NOT fixed

`src/backend/__tests__/tauriShellSource.test.ts` fails at
`D-35-29-01 … POSITIVE: real census arm satisfies every fallback requirement`. Present in the
baseline, unchanged after, and not one of the 22. It is a source-reading assertion about the Epic
census arm in `main.rs` — a different defect that deserves its own record rather than being
absorbed into a formatting commit.

## Note on the request that produced this

This task was reached via "fix `repairFailure.ts:135` to get the i18n gate green". **That was
already done and required no work here** — the i18n gate went green in `21dd66e4c`, and
`repairFailure.ts` is byte-identical to when the failure was first reported on 2026-09-01. The
gate's judgement had changed, not the code: `260901-ud5`'s Bucket E rewrite removed the only
reference of `message` reaching `t()`, invalidating the Pattern 3 `isAssignedThenPassedToT`
exemption whose doc comment names `repairFailure.ts` by name. Recorded because the earlier report
named the symptom's *location* as the defect, and editing that line would have been the wrong fix.
