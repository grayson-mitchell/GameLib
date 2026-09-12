---
created: 2026-09-12
title: "lzmaNativeSeaRealBuild.test.ts's real-sized (64KB) decode test.skip may now pass"
area: backend/storeManagers/steam
severity: medium
platform: any
ready: live-gate
status: "RESOLVED 2026-09-12 -- pure-JS test un-skipped after 5/5 green jest runs (each a real
  SEA rebuild) plus 20/20 direct-binary runs; native test stays skipped by STANDING OPERATOR
  DECISION on NATIVE_LZMA_DECODE_ENABLED, not by failure. Attribution NOT established."
source: quick-260912-e6k (fix sidecar uncaughtException guard EPIPE self-feed)
files:
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
resolves_phase: null
---

# lzmaNativeSeaRealBuild.test.ts's real-sized (64KB) decode test.skip may now pass

## What was observed

While live-gating quick-260912-e6k's sidecar EPIPE fix, the freshly rebuilt SEA binary
(`pnpm build:sidecar-sea`, current source) was run directly with
`GAMELIB_SIDECAR_SELFTEST=decompress-pool` (STEP 4/5 of that plan's Task 3) and completed its
full 64KB VZ/LZMA round trip within ~2 seconds, with no error. That is the same self-test
(`runDecompressPoolSelfTest()`, `src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts`)
that `lzmaNativeSeaRealBuild.test.ts`'s two `test.skip`'d tests (lines ~262 and ~357) exercise via
jest, both marked `KNOWN FAILING ... do not un-skip without real fix + real green run`.

This is only circumstantial evidence from a different (non-jest, direct-binary) invocation — it
was not run through jest against the current build in a controlled comparison, and quick-260912-e6k
deliberately left both `test.skip`s untouched (out of scope for that plan).

## Suggested next step

1. Run `lzmaNativeSeaRealBuild.test.ts`'s full suite (not `-t` filtered) against a current
   `pnpm build:sidecar-sea` build and check whether either or both `test.skip`'d tests now pass
   if un-skipped.
2. If they pass: un-skip them for real, with a real green run recorded (not just a spot check),
   and remove the "KNOWN FAILING" framing from the test name/comments.
3. If they still fail: record why, correcting whatever assumption in the linked debug file no
   longer holds, and leave them skipped with an accurate comment.
4. Do NOT assume quick-260912-e6k's sidecar fix caused this — the two are unrelated code paths
   (the EPIPE guard fix touches `uncaughtException` handling, not the LZMA decode path). Verify
   independently before crediting one fix for the other's apparent change.

---

## RESOLUTION (2026-09-12)

### The todo's own framing was half wrong

It treated the two `test.skip`s as one question. They are not, and only one was ever a
measurement question:

- **Line 262, pure-JS gated path** — needs no kill-switch flip. **UN-SKIPPED.**
- **Line 357, native path** — can only run with a local flip of `NATIVE_LZMA_DECODE_ENABLED`,
  which is under a **standing operator decision** (2026-08-18, coordinator-directed: the switch
  stays `false`, no flip without a fresh recurrence and fresh diagnostics). **STAYS SKIPPED** —
  and its comment now says so, because "KNOWN FAILING" was the wrong reason and would have
  invited someone to un-skip it on evidence that does not apply to it.

### Evidence for un-skipping the pure-JS test

| measurement | result |
| --- | --- |
| `npx jest --testPathPattern lzmaNativeSeaRealBuild`, **5 consecutive runs** | 5/5 `Test Suites: 1 passed`, `Tests: 1 skipped, 2 passed, 3 total` |
| Direct binary, `GAMELIB_SIDECAR_SELFTEST=decompress-pool`, fake HOME, **20 runs** | 20/20 `SELFTEST decode=ok bytes=65536 match=true` at `inlineFallback:false, nativeWorkers:0` |
| Prior `/gsd-debug` session, 2026-08-18 | 40/40 non-reproduction, incl. ~4.6x CPU oversubscription |

The jest runs are **five independent real SEA builds** — the suite's `beforeAll` runs
`pnpm build:sidecar-sea` every time — not one build measured five times.

### What is NOT claimed

**Nobody established what fixed it.** The original hang was real and specifically instrumented;
this is *"trigger condition still unidentified"*, **not** *"the bug never existed"*. Candidates
landing after the 2026-08-18 closure: `f3f63fd72` (2026-08-22, Stored PK chunk truncation) and
the SEA bundling changes `af0602e9b` / `7ed470b19` (2026-08-29) — the latter plausible for a
worker that never entered `handleDecodeMessage()`. Proving any of them means bisecting with a
real SEA rebuild per step. **Not done, and not credited.**

### Why un-skipping is the safer option, not the riskier one

A skipped test detects nothing. The 2026-08-18 closure explicitly asked for *"a fresh
recurrence"* and could not manufacture one — with the test skipped, a recurrence in CI would
pass unnoticed. Un-skipped, it is the detector that closure wanted. The test comment records
that **a future red here is not a flake to retry**: it is the diagnostic opportunity, and the
CPU-load axis is already exhausted, so reach for memory/IO contention instead.

### Also corrected

A second, later-diagnosed defect sits behind the native gate: lzma-native@8.0.6 bundles liblzma
5.2.3, whose `lzma_alone_decoder` rejects the known-size+EOS alone stream that is the only shape
this codebase produces (fixed in `b79765af2`, `createNativeAdapter()`). That fix has **never been
exercised end-to-end inside a real compiled SEA binary**, because the kill switch has masked the
path throughout. Re-enabling native decode therefore needs *both* the operator's call on the
switch *and* a real green run of the line-357 test against a build including `b79765af2`.
