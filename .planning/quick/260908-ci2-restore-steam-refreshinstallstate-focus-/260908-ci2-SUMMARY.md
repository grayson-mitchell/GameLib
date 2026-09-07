---
phase: quick-260908-ci2
plan: 01
subsystem: infra
tags: [tauri, sidecar, ipc, steam, rust, jest]

# Dependency graph
requires:
  - phase: quick-260906-gej
    provides: "Sweep finding A5: refreshInstallState() has zero production call sites"
provides:
  - "SHELL_WINDOW_FOCUSED shared channel constant (src/common/types/sidecarTransport.ts)"
  - "Rust shell producer: WindowEvent::Focused(true) -> send frame, on a spawned thread, fail-soft"
  - "Sidecar consumer: ipcMain.on(SHELL_WINDOW_FOCUSED, ...) -> refreshInstallState().catch(...)"
  - "steamFocusRefreshWire.test.ts: 4-gate cross-side wire-contract pin (T-A/T-B/T-C/T-D)"
affects: [steam-store-manager, sidecar-transport, tauri-shell]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shell-originated send channel: Rust .setup() window-event listener -> write_frame on a spawned thread -> sidecar ipcMain.on consumer, first instance of this direction of travel on the transport"
    - "Cross-side wire-contract pin: comment-stripped main.rs source templated against the shared TS constant, so either side renaming alone reds a test (storeEmbedWireContract.test.ts's pattern, reused for a Rust-to-sidecar frame instead of sidecar-to-Rust)"

key-files:
  created:
    - src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src-tauri/src/main.rs
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/todos/completed/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md

key-decisions:
  - "Preserved the Electron original's defensive optional-chaining syntax verbatim (libraryManagerMap['steam']?.refreshInstallState?.()) even though it types as non-optional on the concrete SteamLibraryManager class"
  - "write_frame() runs on a spawned thread with a cloned Arc<SidecarState>, never inline on the on_window_event callback thread (T-CI2-03 mitigation, the dispatch_tray_launch precedent)"
  - "Broadened flowRegistrationCensus.test.ts's countRegistrations() regex to also recognize an imported shared-constant identifier as a channel-name argument, not just a string literal -- steamFlowRegistration.ts is the first file this census tracks to register a channel by constant rather than raw string"
  - "Narrowed tauriShellSource.test.ts's pre-existing blanket 'no WindowEvent::Focused anywhere' negative gate to exclude only this task's own, unrelated block, rather than deleting or weakening the original login-window focus-steal invariant"

patterns-established:
  - "send-kind channel wire-contract pin: hold the commit constant, vary the tree (git show <sha>^:<file> substitution) to RED-prove a cross-side pin without firing the post-checkout hook"

requirements-completed: [TODO-260906-STEAM-REFRESHINSTALLSTATE]

# Metrics
duration: 25min
completed: 2026-09-08
---

# Quick Task 260908-ci2: Restore Steam refreshInstallState Focus Trigger Summary

**Restored the Steam install-badge reconciliation trigger via a new shell-originated `shellWindowFocused` send channel (Rust `WindowEvent::Focused(true)` -> sidecar `refreshInstallState()`), pinned end-to-end by a 4-gate cross-side wire-contract test.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-08T09:24:00+12:00
- **Completed:** 2026-09-08T09:49:19+12:00
- **Tasks:** 3
- **Files modified:** 7 (1 created, 6 modified; includes 1 todo file renamed pending -> completed)

## Accomplishments

- Restored the Electron `mainWindow.on('focus', ...)` trigger (`main.ts:272-274`, deleted in `5643c7583`) as a Tauri-native equivalent: a second, additive `on_window_event` listener on the main window in `.setup()`, firing only on `WindowEvent::Focused(true)`.
- Added the first shell-originated (Rust -> sidecar) `send` channel on the transport, `SHELL_WINDOW_FOCUSED`, with the channel-name divergence hazard (silent failure on mismatch) closed by a cross-side pin rather than left to trust.
- Wired the sidecar consumer with the same fail-soft `.catch()` guard shape as `logoutSteam`, so a rejecting `refreshInstallState()` cannot crash the sidecar and a subsequent frame is still processed.
- Wrote `steamFocusRefreshWire.test.ts`, a 4-gate suite (T-A cross-side name pin, T-B producer wiring pin, T-C real-transport consumer proof, T-D fail-soft consumer proof), all RED-proven by varying the tree at a constant commit.
- Corrected and closed the originating todo (`2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md`), fixing its wrong `files:` entry (named `games.ts`; the real definition is `library.ts:1354`) and recording an UNRUN Human Verification gesture for the live end-to-end confirmation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SHELL_WINDOW_FOCUSED channel + Rust producer** - `7f88bf856` (feat)
2. **Task 2: Consume shellWindowFocused, broaden census regex** - `d2de69532` (feat)
3. **Task 3: Pin wire contract, close todo** - `844128ccc` (test)

_Note: this quick task's SUMMARY/STATE update is committed separately by the orchestrator, not by this executor run._

## Files Created/Modified

- `src/common/types/sidecarTransport.ts` - Adds `SHELL_WINDOW_FOCUSED = 'shellWindowFocused'`, the first shell-originated send channel
- `src-tauri/src/main.rs` - Mirrors the const; attaches the additive `on_window_event` listener in `.setup()` that writes a `send`-kind frame on `Focused(true)` via a spawned thread, fail-soft on every degraded path
- `src/backend/sidecar/steamFlowRegistration.ts` - Registers `ipcMain.on(SHELL_WINDOW_FOCUSED, ...)` calling `libraryManagerMap['steam']?.refreshInstallState?.()` with a `.catch()` guard
- `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts` - Updates the `EXPECTED` table (send 0 -> 1) and broadens `countRegistrations()`'s regex to recognize a shared-constant channel identifier, not just a string literal
- `src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts` (new) - 4-gate cross-side wire-contract pin, T-A through T-D
- `src/backend/__tests__/tauriShellSource.test.ts` - Narrows the pre-existing "no `WindowEvent::Focused` anywhere" negative gate to exclude this task's own, unrelated block
- `src/backend/sidecar/__tests__/testContainment.test.ts` - Adds `steamFocusRefreshWire.test.ts` to `STRUCTURALLY_CONTAINED_SUITES`
- `.planning/todos/completed/2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md` - Corrected, resolved, and moved from `pending/`

## Decisions Made

- Preserved the Electron original's defensive optional-chaining call syntax (`libraryManagerMap['steam']?.refreshInstallState?.()`) verbatim per the plan, even though `refreshInstallState` types as non-optional/concrete on `SteamLibraryManager` — the shared `LibraryManager` interface still declares it optional, and matching the historical shape was explicitly in scope.
- `write_frame()` dispatched from a spawned thread with a cloned `Arc<SidecarState>` (the `dispatch_tray_launch` precedent), not inline on the window-event callback thread — mitigates T-CI2-03 (main event-loop wedge if the sidecar stalls draining stdin).
- Chose to throttle nothing on rapid focus/blur cycling (T-CI2-02, accepted disposition) — exact parity with the Electron original, which was also unthrottled; a throttle would have been an undisclosed behaviour change smuggled in under a restoration.
- Used the light direct-transport harness (`startRpcServer` + `PassThrough`) combined with `steamFlows.test.ts`'s heavy mock set for T-C/T-D, rather than the full `startSidecar`/`init()` bootstrap — avoids initializing the module-private `heroicLogWriter`, using `jest.spyOn` on the real, already-loaded logger module instead (the `sidecarRejectionGuard.test.ts` precedent), because a `jest.mock` factory calling `jest.requireActual('backend/logger')` re-enters a circular import and throws.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Direct consequence of in-scope change] `testContainment.test.ts` census gate unclassified the new test file**
- **Found during:** Task 3, full `--selectProjects Backend` re-run
- **Issue:** `testContainment.test.ts`'s `T-34.2-83` set-equality gate failed with `unclassified: ["steamFocusRefreshWire.test.ts"]` — a new `*.test.ts` file under `src/backend/sidecar/__tests__/` must be declared in one of two enumerated lists (`IN_SCOPE_SUITES` or `STRUCTURALLY_CONTAINED_SUITES`), and creating the new file (itself in-scope per the plan's own `files_modified`) necessarily tripped this census.
- **Fix:** Added `steamFocusRefreshWire.test.ts` alphabetically to `STRUCTURALLY_CONTAINED_SUITES` and updated the adjacent docstring's file-count/recount comment (54 -> 55, with the reasoning: its own `jest.mock('os', ...)` plus the identical mock set from its list neighbour `steamFlows.test.ts` makes its import graph contained without opting into the heavier `IN_SCOPE_SUITE` kit).
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`
- **Verification:** Re-ran `testContainment.test.ts` in isolation: 55/55 passed.
- **Committed in:** `844128ccc` (Task 3 commit)

**2. [Rule 1 - Pre-existing gate became a false positive] `tauriShellSource.test.ts` Test 8 blanket ban tripped by legitimate new code**
- **Found during:** Task 3, full `--selectProjects Backend` re-run
- **Issue:** `tauriShellSource.test.ts`'s "Test 8 (NEGATIVE)" asserted the stripped `main.rs` source must never contain the literal `WindowEvent::Focused` anywhere in the file — written to guard against an unrelated login-window focus-steal re-raise defect. Task 1's new, unrelated `WindowEvent::Focused(true)` badge-refresh block (far from any login-window code) legitimately tripped this over-broad, file-wide ban.
- **Fix:** Narrowed the assertion to slice out this task's own block (`focus_window.on_window_event(move |event| { ... load_recent_games_from_disk(`) before checking, preserving the original invariant everywhere else in the file. RED-proven not vacuous: a synthetic `WindowEvent::Focused(true)` match was injected near the login-window's own close-handler (outside the excluded block) via a working-tree edit, confirmed the narrowed test still failed with the expected assertion message, then `main.rs` was restored byte-identical (verified via md5 checksum and `cmp` against the exact `7f88bf856` git blob).
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`
- **Verification:** Full re-run of `tauriShellSource.test.ts`: 146/146 passed. RED-proof captured above.
- **Committed in:** `844128ccc` (Task 3 commit)

**3. [Rule 3 - Blind gate shape, Task 2] `flowRegistrationCensus.test.ts`'s regex could not see a constant-based channel registration**
- **Found during:** Task 2
- **Issue:** `countRegistrations()`'s regex only recognized string-literal channel-name arguments to `ipcMain.on(...)`; `steamFlowRegistration.ts`'s new listener registers by the imported `SHELL_WINDOW_FOCUSED` constant, which the gate was blind to.
- **Fix:** Broadened the regex to also match an imported shared-constant identifier as the channel-name argument, and rewrote `registerSteamFlows()`'s docstring to avoid a numeric first-token claim (the suite's `NO_COUNT_CLAIM` gate).
- **Files modified:** `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts`, `src/backend/sidecar/steamFlowRegistration.ts`
- **Committed in:** `d2de69532` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 in Task 3, direct necessary consequences of in-scope changes; 1 in Task 2, a blind gate shape)
**Impact on plan:** All three fixes were required to keep pre-existing gates both green and meaningful against this task's own legitimate changes. No scope creep — no file outside the plan's `files_modified` list plus its two Task-3 deviation files (`tauriShellSource.test.ts`, `testContainment.test.ts`) was touched.

## Issues Encountered

- **`listenerRegistry` accumulation across tests:** `ipcMain.on()` appends to `listenerRegistry`'s per-channel array rather than replacing it; calling `registerSteamFlows()` in both T-C and T-D without clearing first stacked two listeners on `SHELL_WINDOW_FOCUSED` by T-D's execution, doubling the observed call count. Fixed with `listenerRegistry.delete(SHELL_WINDOW_FOCUSED)` in `beforeEach`, documented inline with the reasoning (clearing rather than never re-registering, to keep exercising the real registration path in every test).
- **`heroicLogWriter` uninitialized-writer crash in T-D:** the light-transport harness never calls `init()`/`initHeadless()`, so `backend/logger`'s real `logWarning` threw on the module-private writer. Fixed via `require('../../logger')` + `jest.spyOn` on the real module object, per `sidecarRejectionGuard.test.ts`'s documented precedent (a `jest.mock` factory would re-enter a circular import and throw).
- **Prettier formatting on the new test file:** the multi-line `jest.mock('backend/store_backend', ...)` call needed `--write` re-wrapping on first pass; fixed, re-verified clean, tests still 8/8 green (whitespace-only change).

## RED-Proof Detail (T-A / T-B / T-C / T-D)

All four gates in `steamFocusRefreshWire.test.ts` were RED-proven by holding the commit constant and varying the tree (`git show <sha>^:<file>` substituted for the working-tree file), never `git checkout --` (which fires the post-checkout hook and downloads helper binaries):

- **main.rs swapped to its pre-Task-1 blob:** 5 tests failed (T-A's name-pin assertion, plus all 4 of T-B's block-content assertions — the `focus_window.on_window_event` block did not exist yet). T-C, T-D, and the comment-stripping self-test were unaffected.
- **steamFlowRegistration.ts swapped to its pre-Task-2 blob:** T-C and T-D failed with `Expected number of calls: 1, Received number of calls: 0` — no listener was registered on `SHELL_WINDOW_FOCUSED` yet. T-A and T-B were unaffected (Rust-side only).
- Both trees were restored byte-identical afterward and confirmed via `git status` (clean) and `cmp` against the exact committed blobs.
- **`tauriShellSource.test.ts` Test 8** (no historical pre-fix commit boundary to exploit, since the underlying code IS the legitimate Task-1 change already at HEAD): RED-proven instead by injecting a synthetic `WindowEvent::Focused(true)` match into the working tree near the login-window's close-handler (outside the narrowed test's excluded block), confirming the narrowed assertion still failed with the expected message, then restoring `main.rs` byte-identical (md5 + `cmp` against the `7f88bf856` blob).

## Verification

- `npx jest src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts` — 8/8 passed (final state).
- `npx jest --selectProjects Backend` — **before:** 204 suites / 4635 total (4633 passed + 2 skipped), 56.124s. **after:** 205 suites / 4643 total (4641 passed + 2 skipped), 53.301s. Net +1 suite, +8 tests, 0 new failures.
- `git diff --name-only -- Cargo.toml Cargo.lock package.json src-tauri/Cargo.toml src-tauri/Cargo.lock` — empty (no dependency added, per the plan's hard constraint T-CI2-SC).
- `git diff --name-only -- src/preload .planning/IPC-PORT-INVENTORY.md` — empty (no preload surface touched).
- Prettier: clean on all touched files (2 needed `--write` first, then verified clean; re-ran affected tests afterward to confirm no behavioural change).
- ESLint: 0 errors across all touched files; warnings are pre-existing convention shape (confirmed by direct comparison against `steamFlows.test.ts`'s own identical-shape warning count).

### Human Verification (Task 3, plan-specified disposition)

**Status: UNRUN.** The live end-to-end Steam install/uninstall confirmation (`pnpm tauri:dev` with `GAMELIB_TRACE_SEND=1`, install/uninstall a title in the Steam client, click away and back to the GameLib window, confirm the `[shell] send-trace: window focus refresh entered for 'shellWindowFocused'` line and a badge flip without a full library refresh) was not run in this environment — it requires a live Steam client and a Tauri dev shell, both outside this executor's automated reach. This is a sanctioned disposition per the plan, not a skipped automated gate; the exact 4-step gesture and discharge condition are recorded in the closed todo's `## Human Verification` section for whoever runs it next.

## Threat Model Coverage

All six STRIDE entries (T-CI2-01 through T-CI2-06) and the supply-chain entry (T-CI2-SC) from the plan's own threat register were addressed within the plan's own tasks — no new, undeclared threat surface was introduced by this task's changes:

- T-CI2-01 (channel-name divergence) — mitigated by T-A/T-C.
- T-CI2-02 (unthrottled focus/blur I/O) — accepted, parity with Electron original, not changed.
- T-CI2-03 (event-loop wedge) — mitigated via the spawned-thread `write_frame` dispatch.
- T-CI2-04 (focus event before sidecar readiness) — mitigated via the `eprintln!` WARN + swallow.
- T-CI2-05 (unguarded rejection crash) — mitigated via `.catch()`, pinned by T-D.
- T-CI2-06 (untrusted input) — accepted, no new input surface (empty `args`).
- T-CI2-SC (no new dependency) — confirmed clean via the `Cargo.toml`/`Cargo.lock`/`package.json` diff check.

No Threat Flags section — no security-relevant surface outside the plan's own declared threat model was introduced.

## Known Stubs

None. All new/modified production code paths (Rust producer, sidecar consumer) are fully wired with no hardcoded empty values, placeholder text, or unwired data sources. (A stub-pattern scan of the touched files found only pre-existing, unrelated uses of the word "placeholder" in `main.rs`'s docstrings for other features.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Steam install-badge reconciliation trigger is fully restored and pinned end-to-end; no further work is required to close the originating todo.
- The Human Verification gesture (live Steam install/uninstall confirmation) remains UNRUN and is recorded in the closed todo for a future live-gate pass, should one be scheduled.
- No blockers for subsequent phases. This quick task is self-contained and does not gate other in-flight work.

---
*Phase: quick-260908-ci2*
*Completed: 2026-09-08*

## Self-Check: PASSED

All 9 files confirmed present on disk (created + modified files, including the closed todo and this SUMMARY). All 3 task commits (`7f88bf856`, `d2de69532`, `844128ccc`) confirmed present in `git log --oneline --all`.

---

## Orchestrator addendum (post-executor): Test 8 re-tightened — `d87d4cc8b`

**This supersedes the `tauriShellSource.test.ts` deviation recorded above.** The narrowing
shipped in `844128ccc` was correct in outcome but fragile in form, and the fragility is the
kind this repo has a ledger of.

**What was wrong.** The narrowing excluded a *region*: everything between this task's
`focus_window.on_window_event` block and the next `load_recent_games_from_disk(` call. That end
anchor belongs to the tray recent-games feature, not to this one. Any code later inserted into
the gap would silently widen the exclusion, and a genuine login-window focus-steal re-raise
landing there would pass unseen — the gate green while blind. The executor's RED proof injected
its defect *outside* the excluded block, which demonstrates the gate still fires elsewhere but
says nothing about how tight the exclusion window is.

**What replaced it.** An anchor-free count pin: `WindowEvent::Focused` must occur exactly ONCE
in the comment-stripped source, and that occurrence must be the `Focused(true)` main-window
badge-refresh handler. `Focused(false)` stays banned. Any second occurrence anywhere in the file
reds and forces a conscious decision.

**RED-proof that this is substantive, not cosmetic.** A synthetic
`WindowEvent::Focused(true)` was injected into the old exclusion gap (immediately before the
recent-games seed comment) and both forms were run against the *same* tree:

| Gate form | Result vs the injected defect |
|---|---|
| region-slice (`844128ccc`) | **PASSED** — blind |
| count pin (`d87d4cc8b`) | **FAILED** — `Expected length: 1 / Received length: 2` |

Tree varied at a constant commit; `main.rs` restored byte-identical afterward (md5
`f51cef22e39484b9866bfeb64d2133ee`, `cmp` clean, absent from `git status`).

**Measurement note:** the first attempt to run the old form used `jest -t "Test 8 (NEGATIVE"`,
whose unescaped `(` is regex and matched nothing — reported as `Tests: 0 total`, a silent
zero-test pass. Re-run with `-t "Test 8"`. This is the [[git-log-on-a-nonexistent-pathspec-exits-zero]]
shape in a jest filter, and it would have produced a false "the old gate reds too" conclusion
had the `0 total` line not been read.

`--selectProjects Backend` after the change: 205/205 suites, 4643/4643 — unchanged from
`844128ccc`. Prettier clean, eslint 0 on the touched file.

**Also done by the orchestrator:** the STATE.md "Quick Tasks Completed" row was written by hand
(+1 line, `git diff --numstat` = `1 0`), not via `gsd-sdk` — the executor's re-confirmation of
the 8361→7523 truncation makes that ban 10/10.
