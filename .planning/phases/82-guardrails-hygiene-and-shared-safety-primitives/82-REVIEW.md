---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
reviewed: 2026-11-21T00:00:00Z
depth: standard
files_reviewed: 43
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
  - src/backend/safety/knownInstalls.ts
  - src/backend/safety/__tests__/knownInstalls.test.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/sideload/__tests__/uninstallSafety.test.ts
  - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
  - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeRemovalSafety.test.ts
  - src/backend/storeManagers/steam/cancelDelete.ts
  - src/backend/storeManagers/steam/gameUninstall.ts
  - src/backend/storeManagers/steam/__tests__/steamDirectRemovalSafety.test.ts
  - src/backend/storeManagers/steam/library/acfState.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/testUtils/yieldUntil.ts
  - src/backend/testUtils/__tests__/yieldUntil.test.ts
  - meta/__tests__/runTs.test.ts
  - meta/__tests__/rustTestWorkflow.test.ts
  - .github/workflows/rust-test.yml
  - src-tauri/deny.toml
findings:
  critical: 0
  warning: 4
  info: 8
  total: 12
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
| WR-02 (one unresolvable protected/known path blocks all removals) | fixed (quick 261121-o99, `d8fc1bb25`) | Holds. A relative reference is skipped and an unresolvable absolute one is placed by `lexical_reference_location`; only a dotted unresolvable one stays `unknown`. Adversarial rows pin unrelated-passes and inside-still-refuses for known installs and protected roots, plus the relative and (Windows-only, compiled not run) unplugged-drive cases. Side effect: IN-10. Verified in the post-82 section below. |
| WR-03 (60 s timeout on the delete) | fixed | Holds. `RUST_SAFETY_REMOVE_TREE` is in `UNBOUNDED_RUST_CHANNELS`; the check channel keeps the bound; the new test proves both. Residual hang risk: see IN-06. |
| WR-04 (empty `trustRoot` read as none) | fixed | Holds. `Some("")` is `unknown(NoTrustRoot)` for every kind, including the may-skip kinds, with an adversarial row for all three. |
| WR-05 (Steam copy-removal guard advisory) | fixed for the named fail-open (o99, `099101f9e`) | `refuseUnsafeCopy` (`acfState.ts:310-329`) now refuses an `installed` copy it cannot place and never calls `remove_copy` (two new rows). Residual: `absent`/`downloading`/`unknown` still reach `remove_copy`, and the verdict is not enforced inside it (Phase 90, per the summary). Doc drift: IN-11. |
| WR-06 (sideload sub-directories ignored) | fixed as specified (o99, `d8fc1bb25`) | `check_sideload` now refuses when a sibling real directory's top level holds a runnable entry (`remove.rs:298-306`); three adversarial rows. The rule over-refuses common layouts: WR-12. |
| WR-07 (detector blind spots) | fixed | Mostly holds. `deps.rm`, `deps.fs.rmSync`, `nfs.rmSync`, optional chains and opaque options are now reported (verified by probe and test). Residual fail-open modes remain: WR-10. |
| WR-08 (lexical rows pass vacuously) | fixed | Holds. Every filter string must match a row, with a `should_panic` test proving it. |
| WR-09 (deletes outside the Rust delete-time re-check) | fixed, narrower than documented (o99, `099101f9e`) | Cancel path: `changedSinceCheck` (`cancelDelete.ts:72-85,298`) re-asserts absent/isLink synchronously before `rmSync` (two new rows). Bottle path: the guard is re-asked after `cxbottle --delete` (`bridgeBottleLifecycle.ts:273-287`, one new row). Neither repeats the known-install check before the delete, and the bottle re-check is after the fact: IN-12. |

The deferred Info items IN-01..IN-05 were closed by quick 261121-o99 (IN-01 `is_symlink` only, IN-02 `remove-bottle` kind, IN-03 sideload `refused`, IN-04 in-progress Steam installs, IN-05 job timeout and advisory reasons); evidence is in the post-82 section below. (The WR-02, WR-05, WR-06 and WR-09 rows above were revised on 2026-11-21; they said "deferred" before.)

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

## Incremental review — post-82 quick tasks (o99, p6z, mpt)

**Reviewed:** 2026-11-21
**Depth:** standard
**Scope:** `git diff 00ce8e36c..HEAD` over the 24 files in the request: quick `261121-o99` (commits `d8fc1bb25`,
`099101f9e`, `81edc90b7`), `261121-p6z` (`1ffdec537`, `ded4cd2b8`) and `261121-mpt` (runTs pin narrowing and the
`steamBridgeKnownFixes` wait). `sideload/games.ts` also carries a Phase 84 logger import rename (`targetWriter`,
file exists, type-only) that is not part of o99.
**Result:** 2 warnings, 4 info. No critical findings.

Verified, not assumed:

- `cargo test -p gamelib-safety --offline`: 30 unit, 55 adversarial, 2 contract, all pass. Ten Jest suites touched by
  o99, p6z and mpt (303 tests) pass, as do `bootstrap.test.ts` and `sharedRedistInstall.test.ts` (89 tests).
- **IN-01 premise holds.** `FileType::is_symlink` on Windows is `is_reparse_point && tag & 0x20000000`, and both
  `IO_REPARSE_TAG_SYMLINK` (0xA000000C) and `IO_REPARSE_TAG_MOUNT_POINT` (0xA0000003) carry that bit, so junctions
  stay links and `remove_link` still picks `remove_dir` by the directory attribute. The Windows rows were compiled,
  not run, here (the author says the same).
- **`lexical_reference_location` is sound for what it claims.** It anchors at the deepest ancestor that resolves, so
  macOS `/var` to `/private/var` stays comparable with canonical targets; a dot segment is rejected first by
  `lexical_check`, so the dotted case stays `unknown`. A reference through a regular file or an unplugged drive is
  placed lexically and still refuses a target at or inside it (adversarial rows pin both directions).
- **`yieldUntil` is correct.** The clock is captured at module load, the contract (static import, `setImmediate`
  left real, per-test timeout above 15 s, return not throw) is written down and each caller meets it:
  `bootstrap.test.ts`, `steamBridgeKnownFixes.test.ts` and `sharedRedistInstall.test.ts` import it statically and
  set a 30 s timeout. `yieldUntil.test.ts` proves expiry on real time with fake timers installed.
- The `rust-test.yml` `timeout-minutes: 45` is at job level and the new workflow test reads only the pre-`steps:`
  header, so it cannot be satisfied by a step-level key.

### Status of o99's claimed closures

| Id | o99 claim | Verdict on the code now |
|----|-----------|-------------------------|
| WR-02 | reference fallback | **Closed.** `location_keys` no longer propagates `NotAbsolute`/`CanonicalizeFailed` for a relative or unresolvable reference; the unplugged-drive and relative-setting cases from the original finding are in the adversarial table. A side effect is IN-10. |
| WR-05 | non-placeable installed copy refused | **Closed for the named fail-open.** `refuseUnsafeCopy` now refuses an `installed` copy with no `installPath` or an unplaceable install root, and `remove_copy` is not called (two new rows assert both, plus `existsSync` on the payload). Residual, as the summary says: `absent`/`downloading`/`unknown` still reach `remove_copy`, and the verdict is still not enforced inside `remove_copy` (Phase 90). Doc drift: IN-11. |
| WR-06 | sibling-game rule | **Closed as specified**, one level down. The rule over-refuses common layouts: WR-12. |
| WR-09 | re-assert at the cancel delete and after cxbottle | **Closed, narrower than the comments say.** The cancel path re-asserts only `absent`/`isLink`, and the bottle path re-checks after the delete has run: IN-12. |
| IN-01 | `is_symlink` only | **Closed.** See above. |
| IN-02 | `remove-bottle` kind emitted | **Closed.** `gameUninstall.ts:259` passes it; the title branch and `removalRefused.title.removeBottle` (`gamelib.json:606`) exist; `bridgeRemovalSafety.test.ts` pins `kind: 'remove-bottle'`. |
| IN-03 | sideload `refused` second stage | **Closed.** `guardedRemoveTree` returns `refused` only when nothing was deleted (check-stage refusal, or Rust's re-check inside `remove_tree`); the new test drives the second `safety_check_removal` to a refusal and asserts `refused: true`, no `failed`, the entry kept and the file on disk. |
| IN-04 | in-progress Steam installs known | **Closed for Steam** (the breadcrumb is cleared on completion and cancel by `clearSteamResumeBreadcrumb`, so it does not leave a phantom known install; the caller's own key is excluded and tested). The never-loaded-versus-empty point is a documented decision, not a fix: an unloaded library still reads as "no other installs". |
| IN-05 | job timeout, advisory reasons | **(a) Closed** and pinned by a test. **(b) Not independently verifiable here:** the local advisory DB has no RUSTSEC-2026-0545/0548 entry and `cargo deny` did not run, so the new reasons rest on the summary's statement that the rustsec.org pages were re-fetched. |

Still open and untouched by this range (not re-reported): WR-10, WR-11, IN-06, IN-07, IN-08, IN-09. WR-11 still
reproduces: `sharedRedistInstall.test.ts` printed the "import a file after the Jest environment has been torn down"
error again on this run.

## Warnings (post-82 quick tasks)

### WR-12: the WR-06 sibling-directory rule refuses the most common sideload layouts and has no override

**File:** `src-tauri/crates/gamelib-safety/src/remove.rs:241-251,255-268,298-306`
**Issue:** The new rule reuses the top-level predicate unchanged for a sibling directory:
`entry_looks_runnable` counts any `.exe`, `.msi`, `.bat`, `.cmd`, `.com`, `.sh`, `.lnk`, `.command`, `.appimage`,
`.x86`, `.x86_64` name, and on Unix any regular file with an execute bit. Applied one level down, that matches
folders that are part of one game, not a second game:

- A Windows game folder `Game/game.exe` plus `Game/_CommonRedist/vcredist_x64.exe`, `Game/DirectX/DXSETUP.exe`,
  `Game/redist/...`, `Game/Support/uninstall.exe` or `Game/Launcher/crashhandler.exe` now answers
  `folder-looks-shared`. It is the same shape as the new row `sideload_shared_when_a_sibling_directory_holds_a_game`
  (`Other/other.exe`), so the crate cannot tell them apart.
- A native Linux or macOS game folder with `lib/`, `plugins/` or `tools/` holding exec-bit `.so`/helper files
  (libraries are normally 0755) refuses for the same reason, unless it happens to be the directory that contains
  the game's own executable.
- An unreadable sibling directory (`top_level_looks_runnable` maps any `read_dir` error to `unknown`) now turns the
  whole removal `unknown`, where before it was invisible.

The tests only pin the passing case `Data/` plus `Engine/Binaries/Win64/Game-Shipping.exe` (executable two levels
down), so none of the layouts above is exercised. The user's only recourse is the notice ("may be shared with other
software"); there is no force option, so "delete files" is unusable for these sideloaded games. This is a behavior
change from a removal that worked (over-refusal is the stated direction, but this widens it from "executable beside
the game" to "any installer anywhere one level down").
**Fix:** Make the sibling-directory test narrower than the top-level one: count a sibling directory only when its
top level holds a `.exe`/`.app`/`.appimage`/`.x86_64` that is not an uninstaller or redistributable name, or count
only `.app` bundles and `.exe` files and drop the exec-bit and `.msi`/`.bat`/`.cmd`/`.sh` arms for the nested level.
Add adversarial rows for `Redist/vcredist_x64.exe` (removable) and an exec-bit `lib/libfoo.so` (removable, Unix
only) so the chosen boundary is pinned, and make an unreadable sibling directory skip-with-no-key rather than
`unknown` if the over-refusal is not wanted.

### WR-13: the narrowed runTs shared-cache predicate can be bypassed by an ordinary spelling

**File:** `meta/__tests__/runTs.test.ts:51-52` (`SHARED_CACHE_OUTFILE`), used at `:53-55`, `:117-140`, `:205-222`
**Issue:** mpt replaced the broad `/node_modules\/\.cache/` match with
`/--out(?:file|dir)[=\s]+node_modules\/\.cache\b|node_modules\/\.cache\/[\w./-]*\.[cm]?js\b/` so `codecheck`'s tsc
buildinfo is allowed. The new regex only fires on a bare `node_modules/.cache` immediately after the flag, or on a
`.js/.cjs/.mjs` filename. I ran it:

- `esbuild --outfile=./node_modules/.cache/z m.ts && node ./node_modules/.cache/z`: not flagged
- `esbuild --outfile="node_modules/.cache/z" m.ts && node node_modules/.cache/z`: not flagged
- `esbuild --outdir=./node_modules/.cache m.ts`: not flagged
- `tsc --outDir node_modules/.cache/x` (capital D): not flagged

All four are the C3-01 hazard (a runnable compiled into the shared, script-name-keyed cache path). The vacuity guard
only tries the three spellings the regex was written around, so it cannot notice. The old predicate caught every
one of these.
**Fix:** Keep the broad predicate and exempt only the allowed form, so the default stays strict:

```ts
function hasSharedCacheOutfile(scriptValue: string): boolean {
  const withoutBuildInfo = scriptValue.replace(
    /--tsBuildInfoFile[=\s]+\S*node_modules\/\.cache\/\S+\.tsbuildinfo/g,
    ''
  )
  return /node_modules\/\.cache/.test(withoutBuildInfo)
}
```

Add the four spellings above to the synthetic bad set, and keep `incremental-state` as the negative control.

## Info (post-82 quick tasks)

### IN-10: relative, NUL-containing and `~`-prefixed references are now skipped silently, which turns a fail-closed row into a fail-open one

**File:** `src-tauri/crates/gamelib-safety/src/remove.rs:45-48`, `src/backend/safety/knownInstalls.ts:44-49`
**Issue:** `location_keys` returns no keys for any reference `parse_absolute` rejects. That was the intended WR-02
fix for settings like `~/Games`, but it also covers a *known install* whose recorded path is relative. A sideloaded
game whose `install.executable` is relative gives `dirname('game.exe') === '.'`, which the guard used to answer
`unknown/not-absolute` and now ignores, so that game is invisible to the nested/inside-known-install checks. Nothing
logs or reports the skip, and the adversarial rows pin only the "removable" direction.
**Fix:** In `installFolder`, drop (and `logWarning`) non-absolute paths on the TS side so the skip is visible, or
have the reply carry a `skippedReferences` count the caller can log. Keep the Rust skip.

### IN-11: `refuseUnsafeCopy` docstring contradicts the WR-05 change, and the refusal reason is misleading

**File:** `src/backend/storeManagers/steam/library/acfState.ts:304-309` (docstring), `:323-328` (reason)
**Issue:** The docstring still says "an installdir this check cannot place" is left to `remove_copy`, but the body now
refuses an installed copy it cannot place. The refusal reports `canonicalize-failed`, which the notice renders as
"couldn't be verified" even though the cause is an install path that is not `<steamapps>/common/<one folder>` or is
missing (and `remove_copy`'s own `installdir is not a single folder` reason, which was more accurate, is gone for this case).
**Fix:** Update the docstring to say an installed-but-unplaceable copy is refused here, and either keep the original
`installdir is not a single folder` reason in `reason` (with `safety` still set) or add a distinct `RemovalReason`.

### IN-12: the WR-09 re-assertions are weaker than their comments, and one fails open on a missing item

**File:** `src/backend/storeManagers/steam/cancelDelete.ts:278-279,292-300`;
`src/backend/storeManagers/steam/bridgeBottleLifecycle.ts:273-287`
**Issue:** (a) `cancelDelete` re-checks only that the root's absent/link state is unchanged. The scenario in the
original finding (another store's game registered into the folder after the check) is not re-asserted: the
known-install and protected-root checks are not repeated. The window is now only the synchronous stretch after the
last `await`, so this is a narrow residual, but the comment "the verdict is re-asserted here" overstates it.
(b) If a `yes` verdict carries no `partial` item, `checked` stays `undefined`, `changedSinceCheck` returns `false`,
and the delete proceeds without any re-assertion. It should refuse. (c) The bottle re-check runs after `cxbottle
--delete` has already deleted the bottle, so it can only relabel the outcome as `error`; and it asks the guard about
an absent directory, so a transient non-`yes` answer (for example `rust-invoke-failed`) after a successful delete
reports `Failed to remove bridge bottle` for a bottle that is gone. A retry reaches the `absent` branch and
completes, so it self-heals.
**Fix:** (b) `if (!item) return refuse(appId, 'safety verdict carried no item for the install root')`. (a) and (c)
reword the comments to say what is and is not re-asserted; if (c)'s false `error` matters, report `removed` with a
logged warning when the post-check is `unknown` and the bottle directory is already gone.

### IN-13: new slowed-I/O tests leak a real timer on their failure path (same pattern as IN-09)

**File:** `src/backend/__tests__/steamBridgeKnownFixes.test.ts:625-640`, `src/backend/sidecar/__tests__/bootstrap.test.ts:688-696`
**Issue:** Both the slowed `readFile` and the slowed `fsPromises.rm` wait on an un-tracked 250 ms timer. If
`yieldUntil` expires (the failure these tests exist to catch), the `finally` restores the spy and removes the tmp
profile, then the timer resolves and calls the real `readFile`/`rm` against a directory that is gone, after teardown.
Failure path only, and `yieldUntil` expiring would already have failed the test, so the cost is a noisy second error.
**Fix:** Keep the timer handle and `clearTimeout` it in the `finally`, or `unref` it.

---

_Reviewed: 2026-11-21 (post-82 quick tasks o99, p6z, mpt)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
