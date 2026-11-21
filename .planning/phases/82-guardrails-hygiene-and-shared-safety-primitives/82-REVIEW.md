---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
reviewed: 2026-11-20T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src-tauri/crates/README.md
  - src-tauri/crates/gamelib-safety/src/remove.rs
  - src-tauri/crates/gamelib-safety/src/safe_path.rs
  - src-tauri/crates/gamelib-safety/src/wire.rs
  - src-tauri/crates/gamelib-safety/tests/adversarial.rs
  - src-tauri/crates/gamelib-safety/tests/fixtures/trust-root-contract.json
  - src-tauri/crates/gamelib-safety/tests/trust_root_contract.rs
  - src/backend/safety/__tests__/nonSteamDeleteGate.test.ts
  - src/backend/safety/__tests__/steamDeleteGate.test.ts
  - src/backend/sidecar/__tests__/rustInvokeChannel.test.ts
  - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts
  - src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
  - src/backend/storeManagers/steam/gameLaunchOverlay.ts
  - src/backend/testUtils/__tests__/fakeSafetyRust.test.ts
  - src/backend/testUtils/__tests__/fakeSafetyRustContract.test.ts
  - src/backend/testUtils/__tests__/rawRecursiveDeletes.test.ts
  - src/backend/testUtils/fakeSafetyRust.ts
  - src/backend/testUtils/rawRecursiveDeletes.ts
  - src/backend/utils/uninstaller.ts
  - src/common/types/safety.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 82: Code Review Report (incremental re-review after 82-17..82-19)

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Re-review of the gap-closure changes since `887e32dc5` (82-17 trust-root resolution, 82-18 raw-delete
detector and unbounded remove channel, 82-19 trust-root-aware fake and dispositions), plus
`gameLaunchOverlay.ts` and `games.test.ts` from the separate debug fix `dac99a816`.

I ran `cargo test -p gamelib-safety --offline` (45 adversarial tests and 2 contract tests pass) and the five
TS suites for the detector, both delete gates, the fake and the contract (51 tests pass). I also probed the
detector directly with a transpiled copy.

No Critical findings. The core fix holds. I traced the claim that an absent trust root can only admit absent
targets: a target that exists has every canonical prefix on disk, and the root's missing names are by
definition not on disk, so the component-wise containment test cannot pass for it. `..` in a root cannot
mis-place it either (`file_name()` is `None` for a trailing `..`, which fails closed). An existing root is
still followed through links, a dangling or file-blocked root stays `unknown`, and an empty string is now
`unknown/no-trust-root`. No TS caller sends `''` as a trust root (`appFolder`, `fixesPath`, `commonRoot`,
`gogSupportPath` are all derived non-empty paths).

The one new Warning is a remaining fail-open mode in the raw-delete detector. The three Info items are test
and tooling hygiene.

## Status of prior Critical and Warning findings

| Id | Disposition | Verdict on the code now |
|----|-------------|-------------------------|
| CR-01 (GOG uninstall refused when `gog-support` absent) | fixed | Holds. `resolve_trust_root` places an absent root at its nearest existing ancestor; `trust_root_absent_and_target_absent_is_yes...` and the shared contract row pass on the real crate. The GOG test now removes `gogSupportPath` and the fake (which models the rule, pinned to the crate by the fixture) lets the uninstall through. |
| WR-01 (cancel cleanup refused when `steamapps/common` absent) | fixed | Holds. Same root cause, covered by the crate row "cancel before the first write" and the new `cancelDelete` test. |
| WR-02 (one unresolvable protected/known path blocks all removals) | deferred | Still present, unchanged: `location_keys(raw)?` at `remove.rs:56,122` is untouched. Fails closed (over-refuses). Not re-reported. |
| WR-03 (60 s timeout on the delete) | fixed | Holds. `RUST_SAFETY_REMOVE_TREE` is in `UNBOUNDED_RUST_CHANNELS`; the check channel keeps the bound; the new test proves both. Residual hang risk: see IN-06. |
| WR-04 (empty `trustRoot` read as none) | fixed | Holds. `Some("")` is `unknown(NoTrustRoot)` for every kind, including the may-skip kinds, with an adversarial row for all three. |
| WR-05 (Steam copy-removal guard advisory) | deferred | Still present, unchanged (`acfState.ts` not touched). Not re-reported. |
| WR-06 (sideload sub-directories ignored) | deferred | Still present, unchanged (`check_sideload` not touched). Not re-reported. |
| WR-07 (detector blind spots) | fixed | Mostly holds. `deps.rm`, `deps.fs.rmSync`, `nfs.rmSync`, optional chains and opaque options are now reported (verified by probe and test). Residual fail-open modes remain: WR-10. |
| WR-08 (lexical rows pass vacuously) | fixed | Holds. Every filter string must match a row, with a `should_panic` test proving it. |
| WR-09 (deletes outside the Rust delete-time re-check) | deferred | Still present, unchanged (`cancelDelete.ts` `rmSync` and `cxbottle` path untouched). Not re-reported. |

The deferred Info items IN-01..IN-05 are likewise unchanged in the files touched by this range.

## Warnings

### WR-10: Raw-delete detector still fails open when it cannot parse a call

**File:** `src/backend/testUtils/rawRecursiveDeletes.ts:214-219` (`if (close < 0) continue`),
`:178-185` (`isDeclaration`), `:92-111` (`matchingParen`)
**Issue:** The two delete gates exist to fail loudly on an unguarded recursive delete, but three paths drop
a matching call silently. I confirmed each with a probe of the transpiled module (all returned `[]`):

- `rmSync(p.replace(/'/g, ''), { recursive: true })`. `matchingParen` and `topLevelArguments` treat the
  quote inside the regex literal as a string opener, never find the closing paren, and `findRawRecursiveDeletes`
  executes `continue` on `close < 0`. A recursive delete with a regex literal containing a quote or backtick
  in its arguments is invisible. (The nested-backtick template case did parse in my probe, so this is
  specific to regex literals.)
- `if (a) rmSync(x, { recursive: true })` followed on the next line by a `{` block. `isDeclaration` treats a
  closing paren followed by `{` as a method declaration and skips the call.
- `fs.rmSync.call(fs, x, { recursive: true })` and `.apply`: `CALL` needs `\s*\(` directly after the name, so
  the form is not matched, and it is not listed in the header's non-goals.

The header promises the file lists what it does not see; these are not on the list, and the first is a silent
skip rather than a reported unknown. The same D-05 rule that motivated the floors (a gate must not pass on
parse failure) applies.
**Fix:** Make an unmatched paren a hard failure instead of a skip, and add the other forms to the non-goal
list or the detector:

```ts
const close = matchingParen(text, open)
if (close < 0) {
  throw new Error(
    `rawRecursiveDeletes: cannot match the parens of an rm call at ${file}:${text.slice(0, nameAt).split('\n').length}`
  )
}
```

Add detector tests for the regex-literal probe (expect a throw or a finding), and tighten `isDeclaration` to
require the `{` to be preceded by a parameter-list shape (a preceding method-name or `function` keyword)
rather than any `{` after `)`. Add `.call`/`.apply` to `CALL` or to the header's non-goals.

## Info

### IN-06: `safety_remove_tree` now has no bound at all, so a blocked delete hangs the caller forever

**File:** `src/backend/sidecar/sidecarRpc.ts:139-163,542-547`
**Issue:** After WR-03 the channel has no timer and the Rust side has no deadline (`safety_dispatch.rs` calls
`gamelib_safety::dispatch` directly). The other unbounded channels are bounded in Rust (COMMAND_DEADLINE,
LOGON_BOUND) or by a human. A `remove_dir_all` blocked on an unresponsive network share, a stuck antivirus
filter or a dead external drive never settles, so `guardedRemoveTree` never returns and the uninstall stays
in its in-progress state with no refusal toast. The trade is deliberate and better than reporting `failed`
while Rust keeps deleting; the residual is only the indefinite-stall case.
**Fix:** Optional. Either document the stall as accepted next to the `UNBOUNDED_RUST_CHANNELS` comment, or
give the channel a generous ceiling (for example 30 minutes) that reports a distinct `rust-invoke-timeout`
outcome rather than `failed`.

### IN-07: `fakeSafetyRustInvoke` delete confinement is lexical, and trust-root answers outrank the configured verdict

**File:** `src/backend/testUtils/fakeSafetyRust.ts:69-75,194-203,236-241`
**Issue:** (a) `insideTmp` uses `resolve()` only, not a realpath. A target path `tmp/link/sub` where `link` is
a symlink to a folder outside the temp dir passes the confinement and `rmSync` deletes the outside folder's
`sub`. The same file already computes the canonical parts (`located.parts`) it could check instead. Requires
a test that builds such a link, so it is a latent test-safety hole rather than a live one. (b) The trust-root
objection replaces the configured verdict and reason (`objection?.verdict ?? verdict`). The crate checks
protected roots before the trust root, so a test that configures `checkVerdict: 'no', reason:
'is-protected-root'` on a target whose trust root also objects now sees `outside-trust-root`. No current
test hits it. Both are fine to leave; recording them so the next fake change does not rely on either.
**Fix:** (a) Check confinement on `realpathSync.native` of the target's deepest existing ancestor. (b) Only
apply the trust-root objection when the configured verdict is `yes`, or document the precedence.

### IN-08: New `games.test.ts` cases copy a POSIX-only path literal and fail on a Windows host

**File:** `src/backend/storeManagers/steam/__tests__/games.test.ts:15144` (also 14484, 15023)
**Issue:** The two new `it.each` pinned-engine cases assert `endPerGameBridgeBottleSessionWith` was called with
the literal `'/ov/runner/CrossOver/bin'`, but the production code builds it with `path.join`, which yields
backslashes on Windows. Verified: both new cases fail on this Windows machine with `"\\ov\\runner\\CrossOver\\bin"`
received. The two existing siblings that already use the literal fail the same way, so this follows the
file's existing pattern and CI is ubuntu-only, but the new tests widen the local Windows red set (see the
Windows jest baseline in project memory).
**Fix:** Compute the expectation with `join('/ov/runner/CrossOver', 'bin')` in the new assertion (and ideally
the two older ones).

---

_Reviewed: 2026-11-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Incremental review — 82-20 (G-82-2-r2)

**Reviewed:** 2026-11-21
**Depth:** standard
**Scope:** `src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts`, diff `2496709d0..HEAD`
**Result:** 1 warning, 1 info. No critical findings.

The change does what it claims for the converted waits. Verified, not assumed:

- **The captured clock advances under fake timers.** `realNow` and `realSetTimeout` are module-scope constants, and
  nothing in the file installs fake timers at module scope or in a `beforeEach`. Every `jest.useFakeTimers` call is
  inside an `it`, and `afterEach` restores real timers. With `@sinonjs/fake-timers` 10.3.0 installed
  (`toFake` including `performance`, `Date`, `hrtime`), a reference captured before install kept reading real time
  while `performance.now()` and `Date.now()` read frozen. `setImmediate` is in `doNotFake`, so the loop yields on
  the real event loop.
- **`yieldUntil` cannot hang.** Both its exits are real: `done()` or the 15 s real deadline. It is inside the 30 s
  per-test timeout. It leaks no timer of its own (setImmediate only).
- **Every converted wait is followed by an `expect` that fails instead of hanging.** All four sites (lines 960-961,
  1006-1007, 1161-1162, 1281-1282) assert the call count straight after the wait, before
  `advanceTimersByTimeAsync`.
- No turn-counted waits remain (`grep` for `setImmediate`/`i <` finds only `yieldUntil`).
- The file passes locally (63/63).

### WR-11: the "import after the Jest environment has been torn down" warning is not fixed; it comes from the last test, not the waits

**File:** `src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts:1507-1514`
**Issue:** Running the whole file still prints `ReferenceError: You are trying to import a file after the Jest
environment has been torn down` (reproduced 3 of 3 full runs; the stack points at
`sharedRedistInstall.ts:459` through source maps, but it is the `await import('../depot')` at
`sharedRedistInstall.ts:655`). Narrowing the run shows the cause: `-t "Play-time call joining"` alone reproduces
it, and the four converted installer-timeout/Graphics tests plus the slowed tracer together do not. That test is
synchronous. It starts two `installSteamBridgeSharedRedists` calls and returns without awaiting them, so the
run is still in its real `fs/promises` ledger I/O when `afterEach` removes the tmp dirs and the environment tears
down; the dynamic `import('../depot')` then fires after teardown. The comment above the block ("leaves a
never-settling in-flight run for APP") treats this as harmless because the download mock never settles, but the
run never gets as far as the mock. The plan-82-20 text and the new doc comments attribute the CI warning to the
timing waits; this leaves it unresolved and noisy, and a floating promise past teardown can also surface as an
unhandled rejection if the run's error path ever throws.
**Fix:** Settle the run before the test returns:
```ts
it('a Play-time call joining an install-time in-flight run returns the same promise', async () => {
  let release!: (r: SharedRedistDownloadResult) => void
  mockedDownload.mockReturnValue(
    new Promise<SharedRedistDownloadResult>((r) => (release = r))
  )
  const a = installSteamBridgeSharedRedists(DEPS, APP, SETTINGS, undefined, { allowLogon: true })
  const b = installSteamBridgeSharedRedists(DEPS, APP, SETTINGS)
  expect(b).toBe(a)
  release({ status: 'offline', depots: [], failed: [], skipped: [] })
  await a
})
```

### IN-09: slowed-download tracer test leaks a real timer on its failure path and does not prove the slow window elapsed

**File:** `src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts:986-1014`
**Issue:** (a) The 250 ms `realSetTimeout` is not unref'd or tracked. If `yieldUntil` expires (the failure the test
exists to catch) the `expect` throws, `afterEach` tears down, and the timer later resolves the download and drives the
run into the dynamic import and removed tmp dirs after teardown, which is the same warning as WR-11, on the failure
path only. (b) The test never asserts that the first installer call came at least `SLOW_PRE_INSTALLER_MS` after the
call began, so it would still pass if a future change made the download mock resolve early; its value as a regression
for the turn-counted wait rests on that unasserted delay. (c) Apart from the download mock it duplicates the sibling
test above it line for line.
**Fix:** Take `const t0 = realNow()` before the call and `expect(realNow() - t0).toBeGreaterThanOrEqual(SLOW_PRE_INSTALLER_MS - 10)`
after the wait; keep the timer handle and `clearTimeout` it in a `finally`, or parameterize the two tests with
`it.each` over the download mock.

---

_Reviewed: 2026-11-21 (82-20 incremental)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
