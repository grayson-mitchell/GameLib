# Deferred Items — Phase 39

Out-of-scope discoveries logged during plan execution, per the executor's Scope Boundary rule.
Not fixed here; recorded for a future plan to triage.

## From Plan 39-02

Two `pnpm test --selectProjects Backend` failures observed while verifying plan 39-02's Task 3,
in files this plan does not touch and did not modify. Confirmed pre-existing by running each
file's suite in isolation (same failures reproduce standalone, not induced by full-suite load)
and by `git status`/`git diff` showing zero pending changes to either file before this plan
started.

1. **`src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`** — 3 failing assertions,
   all expecting `lzmaDecoderKind()` to report `'native'` and instead observing `'pure-js'`
   (e.g. `lzmaLoader (native-first decode with pure-JS fallback) › lzmaDecoderKind() reports
   "native" after a successful load on this dev machine`). Shape suggests the native lzma addon
   is not built/available in this dev sandbox, not a logic defect — but that is a hypothesis, not
   confirmed here.

   **RESOLVED 2026-09-02 by quick `260902-pwy` (commit `b79765af2`) — and the hypothesis above
   was WRONG.** The addon *was* built and importable (`node_modules/lzma-native/build/Release/
   lzma_native.node`, and a bare `import('lzma-native')` succeeds). The real cause: lzma-native
   8.0.6 bundles **liblzma 5.2.3**, whose `lzma_alone_decoder` rejects a stream that declares a
   KNOWN uncompressed size while also carrying an end-of-stream marker (`Data is corrupt`);
   system `xz 5.8.3` decodes the identical bytes fine. Known-size + EOS is the only shape this
   codebase produces — both the pure-JS `lzma` package and `decompress.ts`'s real VZ branch —
   so `smokeTest()` was correctly refusing the native module and correctly falling back. **It
   was a genuine logic defect after all, and a latent production one**: every real Steam VZ
   chunk would have failed to decode natively the moment `NATIVE_LZMA_DECODE_ENABLED` was
   flipped on. Fixed in `createNativeAdapter()`; 41/41 with zero test files changed.

2. **`src/backend/downloadmanager/__tests__/utils.test.ts`** — 1 failing assertion:
   `installQueueElement — 260817-dib: no-progress (stall) install watchdog › honest copy: a
   stall trip uses box.error.install.stalled and the dialog does not say "connection may be
   stale"`. The mock `t()` call is received with an i18n-namespace-prefixed key
   (`'gamelib:box.error.install.stalled'`) where the test expects the bare key
   (`'box.error.install.stalled'`) — looks like an i18next namespace-prefix convention drift
   versus this test's expectation, unrelated to any file plan 39-02 modified.

   **RESOLVED 2026-09-02 by quick `260902-qgd` (commit `348d3e42a`).** The "convention drift"
   read was right, and the drift was in the **test**, not production. Quick `260901-ud5`
   (`c2f567064`) deliberately re-namespaced 67 fork-authored strings into the `gamelib`
   namespace under its Bucket R (D-05: `pnpm i18n` must write only `gamelib.json`), updated
   `utils.ts:266`, and left this assertion pinning the bare key. Confirmed NOT an absent-key
   defect — `en/gamelib.json` holds the key and both its siblings. Fixed by re-pinning to
   `'gamelib:box.error.install.stalled'`, kept as an exact key pin rather than loosened.
   A bidirectional census (335 test files × 147 prefixed keys, both directions) found this
   was the sweep's **only** stranded assertion. 34/34.

Both are out of scope for 39-02 (Scope Boundary rule) and were not fixed. Recorded here so a
later phase-39 plan (or a dedicated fix) picks them up rather than re-discovering them.

## From Plan 39-03

Both items above reproduced identically during 39-03's verification (same 3 + 1 failures,
same files, unchanged). One additional failure appeared ONLY under the full
`pnpm test --selectProjects Backend` run and did not reproduce standalone:

3. **`src/backend/sidecar/__tests__/enrichmentFlows.test.ts`** — 1 failing assertion in the full
   run only: `REQ-34.2-14/SEAM Invariant B › REQ-34.2-14 channel "getAnticheatInfo" does not
   return UNPORTED_CHANNEL_MARKER and is present in the handler registry` (`response` was
   `undefined`). Run in isolation (`npx jest src/backend/sidecar/__tests__/enrichmentFlows.test.ts`)
   this file is 41/41 green. This file has zero pending changes from this plan
   (`git status`/`git log` both confirm it untouched) — this is the known
   full-suite-run-manufactures-a-different-failure-set class of flake (load/ordering-sensitive),
   not a regression introduced by 39-03. Not fixed here (out of scope: unrelated file, plan
   39-03 touches only `adapter.test.ts`/`library.test.ts`/`netStub.test.ts`).

## From Plan 39-06

Items 1 and 2 above (decompressPool `'pure-js'` vs `'native'`, downloadmanager/utils.test.ts
i18n-namespace-prefix mismatch) reproduced identically in `pnpm test --selectProjects Backend`
after this plan's commit, confirmed via `git log --oneline -- <file>` that neither file has
been touched since the commits already cited in the 39-02 entry — still unrelated to
`src/backend/humble/user.ts`/`user.test.ts`, this plan's only touched files.

The full (all-5-project) `pnpm test` run surfaced two ADDITIONAL genuine failures, neither
previously recorded, neither touching Humble/seam code, and both reproducing standalone
(NOT the load-flake class):

4. **`meta/__tests__/hardcodedStringGate.test.ts`** — 2 failing assertions (`scans the whole
   committed scope and finds zero violations outside the allowlist (D-12: blocking, no advisory
   grace period)`; `measured ratchet over facetLabels.ts / chipLabels.ts ... W4: no collateral`),
   both citing the same offender: `src/frontend/screens/Game/GameSubMenu/repairFailure.ts:135:17`
   — a hardcoded string `"Repair failed. See the log for details."` not routed through `t()`.
   Reproduces in isolation (`pnpm test --selectProjects Meta -- meta/__tests__/hardcodedStringGate.test.ts`
   → 2 failed, 131 passed). `git log -1 -- <file>` attributes the file to commit `c2f567064`
   ("fix(quick-260901-ud5): resolve i18n catalog drift blocking pre-push leg 4"), unrelated to
   any phase-39 plan.

5. **`meta/__tests__/genI18nGateScope.test.ts`** — 1 failing assertion: `[...forkTouchedSnapshot.files]`
   vs `[...freshSnapshotFiles()]` diverge by several `src/frontend/screens/Settings/components/*`
   entries (e.g. `CustomWineProton.tsx`, `Tools/index.tsx` present in one snapshot but not the
   other) — a stale i18n-gate-scope snapshot artifact versus the current file tree. Reproduces
   in isolation. Zero relation to Humble/seam files.

Also observed once, in the full-suite run only:

6. **`meta/__tests__/runTsSignals.test.ts`** — failed once under the full 5-project run; re-run
   standalone (`pnpm test --selectProjects Meta -- meta/__tests__/runTsSignals.test.ts`) is
   8/8 green. Matches the documented full-suite-run-manufactures-a-different-failure-set flake
   class (item 3 above) — a process-signal-timing test sensitive to system load under a large
   concurrent test run. Not a regression.

Items 4 and 5 are new pre-existing repo-hygiene gate failures (not previously catalogued in this
file) discovered while verifying 39-06's full-suite baseline. Both are out of scope for 39-06
(Scope Boundary rule: neither file is Humble/seam-related, neither was touched by this plan) and
were not fixed here. Recorded for a future plan/triage — `hardcodedStringGate` in particular is
a blocking gate (D-12, no advisory grace period) and should be prioritized ahead of any phase-39
plan that depends on `pnpm test` being fully green.
