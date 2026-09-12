---
created: 2026-09-12
title: "lzmaNativeSeaRealBuild.test.ts's real-sized (64KB) decode test.skip may now pass"
area: backend/storeManagers/steam
severity: medium
platform: any
ready: live-gate
status: pending
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
