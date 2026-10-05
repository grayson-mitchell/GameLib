---
created: 2026-10-05T00:00:00.000Z
title: "Steam depot minor defects: abort listeners leak in retry backoff, failed HTTP bodies never cancelled, fake profile reused across two binary runs"
area: steam
severity: minor
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 25"
files:
  - src/backend/storeManagers/steam/depot/decompress.ts:359
  - src/backend/storeManagers/steam/depot/decompress.ts:1108
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts:189
---

## Problem

1. **Abort listeners accumulate** (`decompress.ts:359`, `sleepAbortable`): the `'abort'` listener is
   removed only if the signal fires. A long run with many retries piles closures onto the run-wide
   AbortSignal and triggers MaxListenersExceededWarning.
2. **Failed responses never read or cancelled** (`decompress.ts:1108`, `!res.ok`): under undici the
   connection stays tied up until GC; a host returning many 4xx/5xx builds up idle sockets.
3. **Fake-HOME profile reused** (`lzmaNativeSeaRealBuild.test.ts:189`): one profile from `beforeAll`
   is shared by the two live tests (lines 214 and 302). CLAUDE.md's two-profile rule says "Fresh
   profile per invocation, always" unless reuse is justified at the call site; it isn't.

## Failure scenario

See each item.

## Suggested fix

1. `removeEventListener` in the timer callback.
2. `await res.body?.cancel()` before throwing.
3. Create a profile per test, or justify the reuse at the call site.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

All three items reproduced against the code and were fixed.

1. **`sleepAbortable` listener leak** (`depot/decompress.ts`): the timer callback now removes the
   `'abort'` listener before resolving; `{ once: true }` only ever removed it when the signal fired.
2. **Failed response bodies** (`depot/decompress.ts`, `!res.ok` branch): `await
   res.body?.cancel().catch(() => undefined)` before throwing `ChunkHttpError`. Best-effort, so a
   cancel rejection cannot replace the HTTP error being reported.
3. **Fake-HOME profile reuse** (`__tests__/lzmaNativeSeaRealBuild.test.ts`): the profile moved from
   `beforeAll`/`afterAll` to `beforeEach`/`afterEach`, so each binary invocation gets a fresh
   profile; `afterEach` reaps any still-live child before shredding its profile.

**RED.** Two new tests in `depotPrimitives.test.ts` (`failure-path cleanup (phase 25 review)`),
run against the unfixed product code: after 3 failing attempts with a caller signal,
`getEventListeners(signal, 'abort')` had length **2** (one per completed backoff), expected 0; a
non-ok response's `body.cancel` was called **0** times over 2 attempts, expected 2.

**GREEN.** Both pass after the fix; `depotPrimitives.test.ts` + `depot.test.ts` 285/285 under
`--runInBand`. `fakeHomeIsolation.test.ts` 7/7. `pnpm codecheck` exit 0; eslint 0 errors (one
pre-existing `unbound-method` warning at `depotPrimitives.test.ts:1996`, not in touched lines);
prettier `--check` clean on all three files.

**Not verified.** Item 3 has no runtime RED/GREEN: `lzmaNativeSeaRealBuild.test.ts` was not run.
It has **no skip or guard** — its `beforeAll` unconditionally runs `pnpm build:sidecar-sea` and then
spawns the compiled SEA binary, and it is in the default backend jest project (so `pnpm test:ci`
builds the SEA). Building and running it was out of scope for this task. The change is verified by
typecheck, eslint and the fake-HOME gate only. No live Steam download was run for items 1–2;
`undici`'s real socket release on `cancel()` is inferred from the Fetch spec, not measured.
