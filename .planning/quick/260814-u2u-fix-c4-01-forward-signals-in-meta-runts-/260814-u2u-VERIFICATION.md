---
phase: quick-260814-u2u
verified: 2026-08-14T22:40:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Quick Task 260814-u2u: Fix C4-01 (+C4-02, C4-04) in meta/runTs.cjs Verification Report

**Phase Goal:** `meta/runTs.cjs` installed no signal handlers, so `SIGTERM` to the wrapper orphaned
the spawned child (which ran to completion unsupervised) and leaked the private `gamelib-runts-*`
tmpdir, invalidating `34.9-WRAPPER-PROOF.md` Direction B row 11. Make the wrapper signal-honest:
forward SIGTERM/SIGINT/SIGHUP, escalate to SIGKILL after a bound, clean up idempotently, and report
`128+N` exit codes.

**Verified:** 2026-08-14T22:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SIGTERM to the wrapper PID alone kills the child, removes the tmpdir, wrapper exits 143 | ✓ VERIFIED | Orchestrator execution: wrapper 31766/child 31769 distinct, exit 143, 0 leftover dirs. Independently re-confirmed: `npx jest --selectProjects Meta meta/__tests__/runTsSignals.test.ts` → T1 PASS. |
| 2 | SIGINT to the wrapper PID alone does the same, exits 130 | ✓ VERIFIED | T2 PASS in the same jest run (18/18 suites, 422 passed/1 skipped). |
| 3 | Child killed by an external signal while the wrapper survives yields 128+signum (SIGKILL→137), not a flat 1 | ✓ VERIFIED | T4 PASS; code at `meta/runTs.cjs:237-242` (`exitCodeFor`) checks `result.signal` before falling back to `1`. |
| 4 | A `symlinkSync` failure no longer leaks the tmpdir | ✓ VERIFIED | T5 PASS (generates a probe copy with `fs.symlinkSync(` replaced by a throwing IIFE, confirms marker matches exactly once first, spawns it, asserts non-zero exit + no leaked dir). Code inspection confirms the block (`meta/runTs.cjs:274-281`) is now inside the `try` that owns `cleanup()`. |
| 5 | `node` is still never spawned when esbuild exits non-zero | ✓ VERIFIED | T3 PASS with in-test positive control (good entry prints marker + exits 0; broken entry — genuine syntax error — exits non-zero and marker absent from stdout). Orchestrator separately re-confirmed with a real parse error. |
| 6 | Every `gamelib-runts-*` directory created during the proof run is gone afterwards | ✓ VERIFIED | 0 leftover confirmed by orchestrator; independently re-confirmed here with 5 concurrent invocations (5 unique dirs created, 0 leftover after). |
| 7 | `meta/__tests__/runTs.test.ts` still passes 3/3 unmodified, full suite green | ✓ VERIFIED | `git diff` shows no changes to `runTs.test.ts`; re-ran `npx jest --selectProjects Meta` independently: 18 suites passed, 422 passed / 1 skipped, 423 total. |

**Score:** 7/7 truths verified

### Focus-Area Deep Checks (requested by orchestrator, beyond must_haves)

| # | Check | Method | Result | Status |
|---|-------|--------|--------|--------|
| 1 | 5000ms SIGKILL escalation does not fire/linger on a normal fast run | Timed `node meta/runTs.cjs --bundle --platform=node --target=node21 <trivial script>` end-to-end | `0.058s total`, exit 0, no delay | ✓ VERIFIED |
| 1b | Escalation timer actually fires and works when a child truly ignores SIGTERM | Spawned a fixture that installs a no-op `SIGTERM` handler; sent SIGTERM to the wrapper | Wrapper waited exactly ~5s, then SIGKILLed the child, exited `143` (caller's signal per D5), tmpdir removed | ✓ VERIFIED |
| 2 | Cleanup idempotency — double-entry (signal handler + `'close'` + `process.on('exit')`) does not throw or misbehave | Code inspection (`cleaned` boolean guard, `try/catch` inside `cleanup()`) + observed stderr on every manual signal test above (SIGTERM/SIGINT/SIGHUP/escalation) | No thrown errors, no stderr noise, in any of 6+ live signal runs | ✓ VERIFIED |
| 3 | Concurrency (invariant 2 / C3-01) — no cross-contamination, one `mkdtemp` dir per invocation | Ran 5 concurrent wrapper invocations of the same script | 5 distinct `gamelib-runts-*` dirs, each process reported its own correct pid/dir, 0 leftover after `wait` | ✓ VERIFIED |
| 4 | `node_modules` symlink — cleanup unlinks the entry only, never recurses into the real tree | Live repro: created a tmpdir with a `junction` symlink to the real `node_modules`, called the exact `fs.rmSync(tmpDir, {recursive:true, force:true})` used in `cleanup()` | tmpdir removed, real `node_modules/esbuild/bin/esbuild` still present, top-level entry count unchanged (989 before/after) | ✓ VERIFIED |
| 5 | SIGINT and SIGHUP forwarded (not just SIGTERM) | SIGINT: jest T2. SIGHUP: manual live test (`kill -HUP <wrapper pid>`) | SIGINT exits 130 (T2 PASS). SIGHUP: wrapper exit `129` (128+1), child confirmed dead, tmpdir confirmed gone | ✓ VERIFIED |
| 6 | Which C4 findings remain OPEN; SUMMARY honesty about scope | Read `34.9-REVIEW-CYCLE4.md`; grepped `.planning/phases/34.9-.../deferred-items.md` for `C4-0[1-5]`/`C3-0[1-3]` | C4-01/02/04 fixed and proven; C4-03 fixed structurally (D7, `console.error` on `compile.error`/`run.error` at `meta/runTs.cjs:297-302,313-315`); C4-05 (sweep-tool case sensitivity) untouched, exactly as SUMMARY states. `deferred-items.md` has zero rows for C4-01..C4-05 or C3-01..C3-03 (only unrelated prose mentions of `C3-05`/`C3-01` matched by a loose grep) — matches SUMMARY's explicit disclosure that this ledger gap is phase 34.9's own gap-cycle work, not claimed as closed here | ✓ VERIFIED (honest) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `meta/runTs.cjs` | async spawn + SIGTERM/SIGINT/SIGHUP forwarding + idempotent cleanup + 128+N exit codes; contains `FORWARDED_SIGNALS` | ✓ VERIFIED | `FORWARDED_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP']` present (line 97); `spawnSync` appears nowhere as code (only in explanatory comments); `parseArgv` byte-identical to pre-fix version (programmatically diffed) |
| `meta/__tests__/runTsSignals.test.ts` | executable proof: real wrapper spawned, really signalled, exit code / child liveness / tmpdir observed; min 120 lines | ✓ VERIFIED | 249 lines; every test spawns the real `WRAPPER` path via `spawn` (never `shell: true`, never piped), reads exit code from the wrapper's own `'close'` event |
| `meta/__tests__/fixtures/runTsSignalFixture.ts` | long-lived entry printing its own pid and `__dirname` | ✓ VERIFIED | Prints `runts-fixture: ready pid=... dir=...`, heartbeats until 20s deadline, installs no signal handler of its own |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `meta/runTs.cjs` signal handler | the live child process | `currentChild...kill(sig)` | ✓ WIRED | `meta/runTs.cjs:172` `currentChild.kill(sig)` inside the per-signal handler registered at line 159-193 |
| `meta/__tests__/runTsSignals.test.ts` | `meta/runTs.cjs` | spawn of the real wrapper path | ✓ WIRED | `const WRAPPER = join(__dirname, '..', 'runTs.cjs')` (line 29), used unconditionally in production; RED-proof temporarily repointed and restored byte-identically per plan's proof standard |
| `meta/runTs.cjs` compile result | the node spawn | `compile.status !== 0` short-circuit | ✓ WIRED | `meta/runTs.cjs:304` `if (compile.status !== 0) { cleanupAndExit(...); return }` before the `node` spawn at line 312 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Normal fast script does not pay the 5s escalation tax | `time node meta/runTs.cjs --bundle --platform=node --target=node21 <trivial>` | `0.058s total`, exit 0 | ✓ PASS |
| 5 concurrent invocations, no cross-contamination | 5× background `node meta/runTs.cjs ...` of the same script, waited | 5 unique tmpdirs, correct distinct pids reported, 0 leftover | ✓ PASS |
| SIGHUP forwarding | `kill -HUP <wrapper pid>` after fixture ready | wrapper exit 129, child dead, tmpdir gone | ✓ PASS |
| Escalation timer fires on an ignoring child | SIGTERM to wrapper whose child installs a no-op SIGTERM handler | ~5s elapsed, child SIGKILLed, wrapper exit 143, tmpdir gone | ✓ PASS |
| `node_modules` symlink cleanup scoped to the entry | live `rmSync` repro on a junction to the real tree | real tree intact (989 entries unchanged) | ✓ PASS |
| Full suite green | `npx jest --selectProjects Meta` | 18 suites passed, 422 passed / 1 skipped, 423 total | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| C4-01 | 260814-u2u-PLAN.md | No signal handling — orphans child, leaks tmpdir, invalidates row 11 | ✓ SATISFIED | Signal forwarding + escalation + cleanup implemented and execution-proven (T1/T2, manual SIGHUP/escalation tests) |
| C4-02 | 260814-u2u-PLAN.md | `symlinkSync` outside the cleanup-owning `try` leaks tmpdir on throw | ✓ SATISFIED | Block moved inside `try` (`meta/runTs.cjs:274-281`); T5 execution-proven |
| C4-04 | 260814-u2u-PLAN.md | Signal-killed child collapsed to flat exit `1` | ✓ SATISFIED | `exitCodeFor()` returns `128+signum`; T4 execution-proven (137) |
| REQ-34.9-08 | 260814-u2u-PLAN.md | Packaging live-gate requirement (tagged as supported, not closed, by this task) | ✓ SATISFIED (as scoped) | This task's own scope is limited to making Direction B row 11's SIGTERM methodology sound (addendum added, citing fix commit + T1 pin); REQUIREMENTS.md itself was correctly NOT touched by this task (not in `files_modified`), and re-scoring is explicitly left to `/gsd-verify-work 34.9` per the plan's own design |

**C4-03** fell out structurally per D7 (not separately tagged as a requirement but addressed): `console.error` on `compile.error`/`run.error` before exit, at `meta/runTs.cjs:297-302` and `313-315`.

**C4-05** (sweep-tool case-sensitivity) remains explicitly OPEN — out of scope for this task, correctly disclosed as such in the SUMMARY, not claimed as closed.

### Anti-Patterns Found

None. Scanned `meta/runTs.cjs`, `meta/__tests__/runTsSignals.test.ts`, `meta/__tests__/fixtures/runTsSignalFixture.ts` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` — zero matches.

### Human Verification Required

None. This is a fully execution-verifiable infra/tooling change (process signals, exit codes, filesystem state) with no UI, visual, or subjective-quality surface.

### Gaps Summary

No gaps found. All 7 must-have truths verified by independent re-execution (not just trusting the
SUMMARY or the orchestrator's prior confirmation). All 6 focus-area deep checks requested by the
orchestrator (escalation timer timing + firing, cleanup idempotency, concurrency, `node_modules`
symlink scope, SIGINT/SIGHUP forwarding, and C4 scope honesty) independently verified by live
execution against the real wrapper. `meta/` working tree is clean — no stray `runTs.prefix.cjs` or
`runTs.__probe__.cjs`, no orphaned processes from verification probes. The three commits
(`fdc5b24e7`, `bf8a8f024`, `8647ac19e`) exist on the branch and match their claimed content;
`34.9-WRAPPER-PROOF.md`'s `Observed: ______` slot count is unchanged (18 before/after); `STATE.md`'s
diff is exactly the two claimed lines (`last_updated`/`last_activity`), confirmed via `git show`.

---

_Verified: 2026-08-14T22:40:00Z_
_Verifier: Claude (gsd-verifier)_
