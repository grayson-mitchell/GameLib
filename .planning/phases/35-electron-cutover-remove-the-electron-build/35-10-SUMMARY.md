---
phase: 35-electron-cutover-remove-the-electron-build
plan: 10
subsystem: sidecar
tags:
  [
    d-05,
    d-18,
    installed-json,
    legendary,
    fs-watch,
    debounce,
    winetricks,
    req-35-16,
    t-35-41,
    t-35-42,
    t-35-43,
    t-35-44,
    t-35-sc
  ]
status: TASK 1 COMPLETE — TASK 2 BLOCKED, the plan's diagnostic frame is refuted by measurement already on record

# Dependency graph
requires: [35-02, 35-07]
provides:
  - '`installedJsonWatcher.ts` — the sidecar port of `main.ts:1036-1048`, with the 500ms debounce, the `existsSync` guard and the `logInfo` line carried across unchanged'
  - 'Teardown (`stopInstalledJsonWatcher`) and start idempotence, neither of which `main.ts` needed because the Electron process exited'
  - 'A `Block C` call site in `bootstrap.ts` `init()`, JEST_WORKER_ID-guarded against opening a real watch on the developer machine during tests'
  - 'Mutation-proven coverage: three independent breakages each isolate to exactly one assertion'
affects: [35-14, 35-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Sweep `main.ts` for NON-handler side effects (`watch(`, `setInterval`, `.on(`) — the channel-by-channel port inventory cannot see them, so they pass a fully green port-coverage gate while never executing'
    - 'A debounce needs assertions in BOTH directions. "Two writes inside the window produce one refresh" is satisfied equally well by an accidental once-only latch; only the complementary "two writes outside the window produce two refreshes" distinguishes them'
    - 'Prove a test by breaking the code under it. Three separate mutations here, each isolating to one assertion, is what makes the green meaningful'
    - 'A leaked libuv handle HANGS jest rather than failing it — a regression that parks the worker in `uv__io_poll` produces a timeout, not a red assertion, so guard it at the source and assert the guard directly'
    - 'Before wiring a real `fs.watch` into `init()`, ask what it watches under jest — most Backend suites do NOT override homedir, so it watches the real user profile'

key-files:
  created:
    - src/backend/sidecar/installedJsonWatcher.ts
    - src/backend/sidecar/__tests__/installedJsonWatcher.test.ts
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts

key-decisions:
  - 'The watcher lives in its own module wired from `bootstrap.ts`, NOT in `libraryFlowRegistration.ts` — that file does not exist in this repo'
  - 'The bootstrap call site is JEST_WORKER_ID-guarded, mirroring `handlers.ts:145`'
  - 'Task 2 is NOT implemented. All three layers the plan names as candidates are excluded by measurement already on record; the live defect is elsewhere and its cause is unnamed'

metrics:
  tasks-completed: 1
  tasks-blocked: 1
  commits: 1
  duration: single session
  completed: 2026-08-29
---

# Phase 35 Plan 10: installed.json Watcher + winetricksInstall Summary

Ported `main.ts`'s debounced `installed.json` watcher into the sidecar with teardown and
idempotence it never had, mutation-proven three ways. **Task 2 is blocked**: the plan's premise
that `winetricksInstall` is a live silent no-op is stale, and all three layers it names as
candidate root causes were excluded by direct measurement before this plan was written.

---

## Task 1 — the `installed.json` watcher — COMPLETE

Commit `0da9898bf`.

### What was ported, and the delay values

`src/backend/main.ts:1036-1048` guards with `existsSync(legendaryInstalled)`, registers
`watch(legendaryInstalled, ...)`, logs
`logInfo('installed.json updated, refreshing library', LogPrefix.Legendary)`, then
`clearTimeout`/`setTimeout`s a call to `libraryManagerMap['legendary'].refreshInstalled()`.

**The debounce delay in `main.ts:1047` is `500`. The delay in
`installedJsonWatcher.ts` is `INSTALLED_JSON_REFRESH_DEBOUNCE_MS = 500`. They match.** The value
is exported rather than inlined so a test can pin it, and the watcher exposes **no** override
parameter — so the shipped 500 is the value the timing tests actually run against, rather than a
shortened test-only window that would stop proving the shipped number.

The original comment explaining the double-fire is carried across verbatim, since it is the reason
the debounce exists.

`src/backend/main.ts` is **unmodified** — confirmed by `git diff --name-only` not listing it. The
behaviour was ported by reading, so the Electron build survives until plan 35-14.

### Where it was installed, and the deviation that forced the decision

The plan's `files_modified` and `<read_first>` both name
`src/backend/sidecar/libraryFlowRegistration.ts`. **That file does not exist.** The sidecar has no
library-flow registration module at all; `refreshLibrary` is registered in
`steamFlowRegistration.ts` despite the name.

The watcher therefore lives in a dedicated `src/backend/sidecar/installedJsonWatcher.ts`, called
from a new `Block C` in `bootstrap.ts`'s `init()` — after Block B and immediately before the
`READY_SENTINEL` write. That satisfies the plan's own requirement that it start when the sidecar is
ready rather than at module load: `legendaryInstalled` resolves through the app-data path shim, and
a fresh profile has no `installed.json` until legendary first writes one.

### The hazard this nearly shipped, and the guard it needed

`legendaryInstalled` resolves to the **real** user profile path. That file **exists on this
machine** (mtime 2026-08-24), and `bootstrap.test.ts` does **not** mock `os.homedir`. An unguarded
`startInstalledJsonWatcher()` in `init()` would therefore open a real `fs.watch` on the developer's
actual `installed.json` in every Backend suite that boots the sidecar, leaking a libuv handle into
each jest worker.

That is not hypothetical — it was **measured during mutation testing** (below), where an orphaned
watch handle hung the run outright. The call site is guarded with
`process.env.JEST_WORKER_ID === undefined`, mirroring `handlers.ts:145`'s existing use of the same
signal for the same class of problem. Under real Tauri the guard is unconditionally false and the
watcher always arms.

### How the watcher proves it FIRES, not that it was registered

This is the plan's central demand and the reason the suite is shaped as it is.

Every case drives a **real `fs.watch` against a real temp file** and scores the observable
**effect** — the count of refresh calls — never the registration. A mocked `watch`, or an assertion
that a callback was handed to `watch`, would pass against a watcher that never fires once; that is
the exact vacuous shape the original defect already survived for the whole of phase 34.6.

Nine cases:

| Case | What it proves |
|---|---|
| Two writes inside the window → **1** refresh | the debounce coalesces a burst (T-35-41) |
| Two writes outside the window → **2** refreshes | it is a debounce, not a once-only latch |
| Absent file → start returns `false`, no refresh | the `existsSync` guard |
| Write after `stop()` → no refresh | teardown |
| `stop()` mid-window → the queued refresh is dropped | teardown clears the timer, not just the handle |
| Second `start()` returns `false` | no watcher stacking (T-35-42) |
| No `refresh` override → `libraryManagerMap.legendary.refreshInstalled()` called | the port targets the same function `main.ts` does |
| `logInfo` called with the ported string on the Legendary prefix | the discharge signal `35-AB-RETEST.md` item 2 names |
| `INSTALLED_JSON_REFRESH_DEBOUNCE_MS === 500` | the delay did not drift during the port |

The default-wiring case matters disproportionately: every other case injects a spy, and would pass
against a watcher wired to nothing at all.

### RED runs — recorded, with output

**RED 1 — against the pre-fix tree (no watcher in existence):**

```
FAIL Backend src/backend/sidecar/__tests__/installedJsonWatcher.test.ts
  ● Test suite failed to run
    Cannot find module '../installedJsonWatcher' from 'src/backend/sidecar/__tests__/installedJsonWatcher.test.ts'
Tests:       0 total
```

That is a real red, but a weak one — it only proves the module was absent. So the fix was then
broken deliberately, three ways, each against the finished implementation.

**RED 2 — debounce deleted** (`clearTimeout`/`setTimeout` replaced with a direct `refresh()`):

```
✕ collapses two writes INSIDE the window into exactly ONE refresh
  ● Expected number of calls: 1
    Received number of calls: 2
✕ drops a refresh already pending inside the debounce window when stopped
  ● Expected number of calls: 0
    Received number of calls: 1
✓ does NOT collapse two writes SEPARATED by more than the window — two refreshes
Tests:       2 failed, 7 passed, 9 total
```

Note the third line. The complementary case **correctly still passed** with the debounce gone —
which is precisely why both directions are required, and why a single-direction debounce test would
have been a green that proved nothing.

**RED 3 — idempotence guard deleted:**

```
✕ refuses a second start rather than opening a second watch handle (T-35-42)
  Expected: false
  Received: true
Tests:       1 failed, 8 passed, 9 total
```

This one produced a finding that **corrected the test itself**. Without `--forceExit` the run did
not fail — it **hung**. Sampling the process (`sample 45461`) showed it parked in
`uv__io_poll`/`uv_run`: the second `watch()` overwrites `activeWatcher`, so
`stopInstalledJsonWatcher()` can never close the first, and the orphaned handle keeps the worker's
event loop alive forever.

More importantly, it showed the **refresh-count assertion in that test cannot detect stacking at
all** — two handles share one `refreshTimeout`, so the second callback merely re-arms the debounce
the first set and the burst still collapses to exactly one refresh. The count reads `1` whether the
guard is present or absent. The detecting assertion is the `toBe(false)` return value. The test now
says so explicitly in a comment rather than implying coverage it does not have; leaving the original
`one write, one refresh (T-35-42)` title would have been a false claim about what the case measures.

**RED 4 — `existsSync` guard deleted:**

```
✕ does not start, and never refreshes, when the file is absent
Tests:       1 failed, 8 passed, 9 total
```

Each mutation isolates to exactly the intended assertion, and nothing else moves.

### An additional gate this tripped

`testContainment.test.ts`'s Block C tripwire (`T-34.2-83`) requires every `*.test.ts` in
`src/backend/sidecar/__tests__/` to be classified into one of two declared lists. The new file was
added to `STRUCTURALLY_CONTAINED_SUITES` with a justification entry following the file's existing
convention, including a recomputed count (57 files: 4 `IN_SCOPE_SUITES` + 53). The entry states
honestly that this suite **does** touch the real filesystem — unusually for that list — because the
behaviour under test is a real `fs.watch`, and records that every write is confined to a per-test
`mkdtempSync(os.tmpdir())` directory removed in `afterEach`.

### Teardown has no shutdown call site — stated plainly

The plan asked for teardown "on sidecar shutdown". `stopInstalledJsonWatcher()` is implemented,
exported and tested, but **there is no sidecar shutdown hook to wire it to** — `processGuards.ts`
and `src/sidecar/index.ts` register no `exit`/`beforeExit`/`SIGTERM` handler. Process exit closes
the handle anyway. The accumulation hazard the teardown was requested for (T-35-42) is actually
mitigated by the start-idempotence guard, which is the assertion that goes red when removed.
Inventing a shutdown hook was out of scope for this plan.

---

## Task 2 — `winetricksInstall` — BLOCKED, NOT IMPLEMENTED

### The current live behaviour, from the two-sided 34.6 record

**`34.6-LIVE-GATE.md` Step 4 is genuinely two-sided, and both sides are still true of their own
run.**

- **Run 1 (2026-08-24) — FAIL.** Operator clicked Install on a real `corefonts` row. No
  `[GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall` line, no `winetricks -q corefonts`, no error
  in either sink, `gamelib.log` mtime frozen 14 minutes stale, `grep -c` = 0 across both sinks.
- **`## SUPERSEDES — Step 4 re-drive` (2026-08-26, quick task 260826-s2f) — PASS.** The D-11
  observable **fired**: `(18:02) [INFO] [Backend]: [GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall`,
  and the channel did real work: `Running .../tools/winetricks -q comctl32ocx`. Watermark discipline
  was kept (1 prior observable at 808 lines before, 2 at 926 lines after; pre-drive log archived).

A third, independent observation confirms the pass side: **`35-AB-RETEST.md` item 4, Tauri leg**,
recorded `(18:48:25) [Backend]: [GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall` followed by a real
PowerShell msi install.

**So the current live behaviour is: the channel works end to end, but reaching it by pure mouse
click is unreliable.** Keyboard (Tab, then Enter) drives it every time. Mouse-only fails. The A/B
operator's working route was "press Tab while the row is highlighted — the mouse pointer visibly
CHANGES — and only then does a click succeed."

The plan's `must_haves` truth — *"produces literally nothing when invoked: zero log lines in EITHER
sink"* — describes **run 1 only**, and is stale as a description of the current build.

### Which half this plan addresses: NEITHER, because the plan aims at a refuted layer

The plan's Task 2 instructs: diagnose among **(a) sidecar registration**, **(b) Rust `sidecar_send`
dispatch**, **(c) frontend emit**, then "apply the same fix pattern the prior instance used."

**All three are excluded, and I re-verified each against the current tree rather than inheriting
the claim:**

- **(a) sidecar registration — correct and complete.**
  `wineToolsFlowRegistration.ts:335` registers `ipcMain.on('winetricksInstall', ...)`, calls
  `logSendHandlerReached('winetricksInstall')` as its first statement, awaits
  `Winetricks.install(runner, appName, component)`, and catches into `logSendFailure`. Its shape is
  byte-for-byte the same as the working send channels in `appShellFlowRegistration.ts`
  (`changeLanguage`, `notify`, `quit`, `openReleases`, `abort`, `lock`, `unlock`, …) and the same
  as `frontendReady`, which is the sibling send channel proven live in the very same app instance
  that produced run 1's failure. **There is no wiring difference to find.**

- **(b) Rust dispatch — structurally incapable of the hypothesized defect.**
  The plan hypothesizes "channel absent from a routing list". `sidecar_send`
  (`src-tauri/src/main.rs:1168-1196`, re-read after 35-07 and 35-08 changed the file materially)
  builds a `SidecarRpcRequest` and calls `state.write_frame(&req)`. **There is no routing list, no
  allowlist and no channel filtering of any kind** — so there is nothing a channel could be absent
  from. This is stronger than "excluded by prior measurement": the defect the plan describes cannot
  exist at this layer.

- **(c) frontend emit — correct.**
  `src/preload/api/wine.ts:17` is `makeListenerCaller('winetricksInstall')`, the same factory
  `frontendReady` uses. The channel is declared in `SyncIPCFunctions` (`common/types/ipc.ts:137`).
  Keyboard activation drives this exact emit successfully, which is a live proof the emit path is
  intact.

### Where the defect actually is, per five live drives already on record

The todo `2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md` is **PARKED**, not
open-and-undiagnosed. Its SETTLED section, which explicitly says *"do not re-investigate these"*:

1. The IPC port is **CORRECT**; keyboard drives it end to end.
2. Nothing was ever sending a frame on the mouse path — **427 traced sends in one boot**, with
   `winetricksInstall` absent, the probe proven live by other channels **before** its silence was
   trusted.
3. The break point is exact: on mouse click the button receives `pointerdown` and `mousedown`, then
   **no `mouseup` and no `click`**.
4. It is a **React unmount**, not CSS — a per-row probe logs `row UNMOUNT` immediately after
   `mousedown`.
5. Not a blur/`:focus-within` race — the `preventDefault` guard is in the running bundle and
   changed nothing.
6. Not an overlay — Inspect Element resolves to the `<button>`.
7. Never a stale bundle, at any drive.

`35-AB-RETEST.md` item 4's verdict is **`TAURI-ONLY`**, and it points *away* from even the unmount
theory: the cursor not changing over the control means the element is **not being hit-tested**,
which an unmount-on-mousedown cannot explain (you must hit an element to mousedown on it). Electron
passed on the same mouse path with the same shared frontend code, so a shared-code theory cannot
explain the divergence either.

**Three hypotheses have been formed by code reading here and all three were wrong** — IPC transport,
then a `:focus-within` blur-unmount, then `loadingInstalled`. Two of them produced confident fixes
with green tests. The todo also carries an **unresolved anomaly** it says must be explained first: a
`useEffect` probe in `Winetricks/index.tsx` that never fired once despite being in the same bundle
chunk as a probe that demonstrably did.

### Why I did not write `winetricksInstallChannel.test.ts`

The plan requires a test asserting the emit reaches the handler and logs, **RED-proven against the
pre-fix wiring**.

There is no pre-fix wiring. The wiring is correct and has been since phase 34.6. Such a test would
be **green on first write, un-RED-provable**, and — worse — would sit in the tree named for a defect
it does not cover, since the live failure is in renderer hit-testing entirely upstream of the emit.
That is this repo's recorded `a-pass-can-cover-an-unreachable-surface` shape, and manufacturing it
would make the winetricks item *look* guarded while the button stays mouse-dead. Per the plan's own
constraint — *"a test written after the fix that passes against the broken code proves nothing"* —
writing it was the wrong move.

**Unmet by design:** the artifact `winetricksInstallChannel.test.ts`, and Task 2's acceptance
criteria. The plan's winetricks `key_link` (frontend emit → `wineToolsFlowRegistration.ts` handler
via the send-channel dispatch path) **already holds** and is live-proven three times over.

### T-35-44 checked anyway, since the channel is live

The threat model asks whether the verb reaches `winetricks` as an argv element rather than through
a shell string. `Winetricks.install` (`tools/index.ts:759-768`) calls
`Winetricks.runWithArgs(runner, appName, ['-q', component])` — an **argv array**, not a joined
shell string. No change needed; recorded so it is not re-derived.

---

## Is the 34.6 Step 4 FAIL dischargeable by observation?

**No. It still needs a live human run, and this plan cannot discharge it.** Stated plainly, as
asked.

Reasons:

1. **This plan changed no winetricks code**, so nothing about the live behaviour moved.
2. Step 4's PASS condition — no `UNPORTED_CHANNEL_MARKER` **AND** the D-11 observable fires — has
   already been satisfied twice under drive (2026-08-26 re-drive; A/B retest 18:48:25). What has
   **not** been established is the *cause* of run 1's failure. The operator's attribution
   (temperamental row selection) is recorded in the gate document itself as **"PLAUSIBLE AND NOW
   WELL-SUPPORTED, BUT STILL NOT FORMALLY PROVEN"**, with an explicit instruction: *"Do not cite
   this as established cause."*
3. The re-drive's environment **differed** — `7z`, `cabextract` and `zenity` were installed between
   runs — and the document is explicit that the PASS does not retroactively prove run 1 was
   environmental.
4. The document carries a **standing rule**, set by the operator when it was closed under option
   (c): *no SUPERSEDES re-scopes a failing item out of the verdict.* `verdict: FAIL 7/9` and
   `failing_items: [4, 8]` were deliberately left unchanged even after the operator accepted the
   re-drive as a PASS. **An executor flipping that verdict would be overriding an explicit operator
   decision.**

What would actually discharge it: an instrumented live run capturing the **failing and succeeding
mouse interactions side by side** — the one probe the todo names as never taken, logging `search`
and `searchResults.length` on every `WinetricksSearchBar` render, and the cursor/hit-test state the
A/B retest surfaced. That is a live human gate, owned by
`2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md`.

Nothing is blocked by leaving it: `34.6-VERIFICATION.md` run 2 already returned `status: passed`
independently, and Step 8 (Epic logout) fails independently anyway, so the verdict would not become
clean even if Step 4 were flipped.

---

## Deviations from plan

1. **`libraryFlowRegistration.ts` does not exist.** Named in `files_modified`, `<read_first>` and
   `<files>`. Created `installedJsonWatcher.ts` and wired it from `bootstrap.ts` instead.
   *Reason:* the file is absent from the repo; the sidecar has no library-flow registration module.

2. **Added a `JEST_WORKER_ID` guard at the bootstrap call site** — not in the plan.
   *Reason:* without it the watcher opens a real `fs.watch` on the developer's actual
   `installed.json` in every Backend suite that boots the sidecar, leaking a handle per worker.
   Measured, not hypothesized. Follows the existing `handlers.ts:145` precedent. (Rule 2.)

3. **Modified `testContainment.test.ts`** — not in `files_modified`.
   *Reason:* its Block C tripwire fails on any unclassified test file in the directory. (Rule 3.)

4. **Corrected my own test's title and comment** after mutation testing showed its refresh-count
   assertion cannot detect watcher stacking.
   *Reason:* the original title asserted a coverage claim that measurement disproved.

5. **Task 2 not implemented.** See above. *Reason:* stop condition — the plan's prescribed
   diagnostic frame is refuted by measurement already on record, and layer (b) is structurally
   incapable of the defect it hypothesizes.

## Deferred / still open

- **`winetricksInstall` mouse-path failure** — renderer hit-testing, `TAURI-ONLY`, cause unnamed
  after five live drives and three disproven hypotheses. Owned by
  `2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md`. Needs a live
  instrumented run, not a code-reading fix.
- **`34.6-LIVE-GATE.md` Step 4** — remains FAIL of record for run 1 by explicit operator rule.
- **No sidecar shutdown hook** exists to call `stopInstalledJsonWatcher()`.
- **The `35-AB-RETEST.md` item 2 note worth acting on:** `main.ts` side effects that are not IPC
  handlers are invisible to the porting inventory. This plan ported one. **A sweep of `main.ts` for
  other `watch(` / `setInterval` / `.on(` side effects that never made the jump has NOT been done**
  and is not in this plan's scope.

## Verification

| Check | Result |
|---|---|
| `pnpm test --selectProjects Backend` (final, with change) | **3 failed**, 4330 passed, 4335 total — all 3 in `decompressPool` lzma pure-js. **Exactly the known-red baseline.** |
| `pnpm test --selectProjects Backend` (baseline, change reverted) | **4 failed** / 2 suites — lzma ×3 **plus** a `bootstrapWirings` flake |
| `pnpm test --selectProjects Backend -- installedJsonWatcher` | 9 passed, 9 total |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **191 passed, 0 failed** — matches baseline; `main.rs` unchanged |
| `pnpm codecheck` | exit 0 |
| `prettier --check` (in place, my files only) | clean |
| `eslint` (my files) | 0 errors; 1 warning, identical to 7 pre-existing ones in the same file |
| `src/backend/main.ts` unmodified | confirmed — absent from `git diff --name-only` |
| Deletions in commit | none |

**On the failure-count discrepancy, measured rather than assumed.** The first full run showed 5
failures including `enrichmentFlows`, which is not in the stated baseline. Rather than assume, the
pre-change tree was reconstructed (bootstrap restored from a `cp` snapshot, new files moved out,
containment entry removed) and the full suite re-run: **the baseline itself failed 4 tests, with a
`bootstrapWirings` flake instead.** Both suites pass in isolation and together with the change in
place. They are load-dependent flakes that alternate between runs, present without this change —
consistent with the recorded finding that a full suite run manufactures a different failure set
under load. The final run with the change landed on **exactly the 3 known-red lzma failures**.

No `git stash`, `git reset` or `git checkout -- <path>` was used at any point; every snapshot and
restore was `cp` + `shasum -a 256`, with hashes verified to match on restore.

## Commits

- `0da9898bf` — `feat(35-10): port the debounced installed.json watcher to the sidecar`

## Self-Check: PASSED

- `src/backend/sidecar/installedJsonWatcher.ts` — FOUND
- `src/backend/sidecar/__tests__/installedJsonWatcher.test.ts` — FOUND
- commit `0da9898bf` — FOUND in `git log`
- `src/backend/sidecar/__tests__/winetricksInstallChannel.test.ts` — **NOT CREATED, deliberately**;
  rationale above.
