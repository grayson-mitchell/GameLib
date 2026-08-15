---
phase: quick-260815-vvz
plan: 01
subsystem: infra
tags: [tauri, sidecar, electron-parity, esbuild, ast-gate, steam, macos]

requires:
  - phase: quick-debug-steam-bottle-uninstall-reverts
    provides: the closed-out debug session that identified GameLib staying in front of an
      invisible Steam confirm dialog on bottled Steam uninstall as the user-visible symptom
provides:
  - a real `app.hide()` path spanning bottle.ts -> electronStub.ts -> Tauri's AppHandle::hide()
  - a permanent, RED-provable AST gate (externalDynamicImportGate.test.ts) forbidding native
    dynamic import('electron')/import('electron-store') anywhere under src/backend or src/sidecar
affects: [steam-bottle-lifecycle, sidecar-electron-parity]

tech-stack:
  added: []
  patterns:
    - "TypeScript compiler API (not regex) for source-level AST gates over the sidecar's
      Module._load interception boundary, following electronReachLedger.test.ts's traversal
      conventions"
    - "Committed known-bad/known-good self-test alongside a structural gate, so the gate's own
      RED-capability survives after the defect it was written for is fixed"

key-files:
  created:
    - src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/electronStub.ts
    - src-tauri/src/main.rs
    - src/backend/sidecar/__tests__/lifecycleStub.test.ts
    - src/backend/__mocks__/electron.ts
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts

key-decisions:
  - "app.hide() is forwarded to Tauri's real AppHandle::hide() (option a), not left a declared
    no-op (option b) -- both electron's real app.hide() and Tauri's AppHandle::hide() are
    macOS-only application-wide hides, an exact semantic equivalence rather than an
    approximation, and the caller (raiseFrontmostBottledProcess) is already macOS-gated so the
    forward covers 100% of reachable calls."

requirements-completed: [Q-VVZ-01, Q-VVZ-02, Q-VVZ-03]

duration: ~12min
completed: 2026-08-15
---

# Quick Task 260815-vvz: Fix the dead app.hide sidecar fallback Summary

**Wired electronStub's app.hide() through a new Tauri app_hide rustInvoke arm, converted bottle.ts's dynamic `import('electron')` to a static import that the sidecar's Module._load hook can actually intercept, and added a permanent TS-AST gate (with a committed known-bad/known-good self-test) forbidding that class of defect from recurring.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-15T23:07 (local, +12:00)
- **Completed:** 2026-08-15T23:19 (local, +12:00)
- **Tasks:** 3 (all type="auto", tasks 1-2 tdd="true")
- **Files modified:** 8 planned + 1 Rule-3 deviation file (`testContainment.test.ts`) + 1 deviation-log doc (`deferred-items.md`)

## Accomplishments

- `raiseFrontmostBottledProcess`'s (`bottle.ts`) ~18s-miss yield fallback now reaches a real,
  defined `app.hide()` under the sidecar, forwarded all the way to Tauri's `AppHandle::hide()`
  on macOS (a declared, loud no-op elsewhere -- exact Electron parity, never a silent lie).
- Closed defect 1 at the **compiled-artifact level**, not just in jest: `bottle.ts`'s dynamic
  `import('electron')` (which esbuild left as a native ESM import bypassing `Module._load`)
  is now a static import that compiles to a `require()` the hook can intercept.
- Shipped a permanent AST gate (`externalDynamicImportGate.test.ts`) so this class of defect
  cannot silently recur -- proven non-vacuous by a committed known-bad/known-good self-test and
  an anti-vacuity file-count floor.

## Task Commits

Each task followed the RED -> GREEN TDD flow with per-gate commits (concurrent-session
constraint: every commit staged only its own explicit file paths, verified via
`git status --short` before each commit):

1. **Task 1 RED — failing tests for `app.hide`** — `fc3da4cf4` (test)
2. **Task 1 GREEN — wire electronStub `app.hide` to `AppHandle::hide()`** — `206a31db7` (feat)
3. **Task 2 RED — AST gate forbidding dynamic electron imports** — `e7da6ff37` (test)
4. **Task 2 GREEN — convert `bottle.ts` to a static electron import** — `70a95dc9c` (fix)
5. **Deviation (Rule 3) — classify the new gate suite in `testContainment.test.ts`** — `68b30fba4` (fix)

Task 3 made no source edits (verification + commit only); its findings are folded into the
commits above and the RED/production-shape evidence below.

## Files Created/Modified

- `src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts` — new AST gate (3 tests:
  the invariant, an anti-vacuity file-count floor, and a committed known-bad/known-good
  self-test), TypeScript compiler API, mirrors `electronReachLedger.test.ts`'s conventions.
- `src/common/types/sidecarTransport.ts` — new `RUST_APP_HIDE` (`'app_hide'`) channel constant,
  added to `RUST_INVOKE_CHANNELS`.
- `src/backend/sidecar/electronStub.ts` — new `app.hide()` member: fire-and-forget forward to
  `RUST_APP_HIDE`, never throws, deliberately NOT suppressed by the `relaunchInFlight` guard.
- `src-tauri/src/main.rs` — new `"app_hide"` dispatch arm: macOS branch calls
  `AppHandle::hide()`; non-macOS branch logs a declared no-op via `eprintln!`.
- `src/backend/sidecar/__tests__/lifecycleStub.test.ts` — 5 new tests (1a-1e) covering
  callability, forwarding, allowlist membership, failure logging, and the relaunch-guard
  asymmetry.
- `src/backend/__mocks__/electron.ts` — added `hide: jest.fn()` to the project-wide auto-mock.
- `src/backend/storeManagers/steam/bottle.ts` — hoisted `import { app } from 'electron'` to the
  top-level import block; deleted the inline dynamic import; replaced with an explanatory
  comment (deliberately worded to avoid matching the raw `import('electron')` census grep).
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` — added `hide: jest.fn()` to the
  inline `jest.mock('electron', ...)` factory, imported `app`/`logWarning` for assertions, and
  added 2 new behavioral tests (2a/2b) explicitly documented as NOT defect-1 provers.
- `src/backend/sidecar/__tests__/testContainment.test.ts` (Rule 3 deviation) — classified the
  new gate suite as structurally contained; updated the directory file-count comment (45 -> 46).

## Decisions Made

- **Option (a) chosen for `app.hide()`: forward to `AppHandle::hide()`.** Both real Electron's
  `app.hide()` and Tauri's `AppHandle::hide()` are macOS-only, application-wide hides — an
  exact semantic equivalence, not an approximation (unlike `openDevTools`/`reload`, which stayed
  declared-degraded no-ops because no Tauri equivalent exists at all). The caller
  (`raiseFrontmostBottledProcess`) is already macOS-gated, so the forward covers 100% of
  reachable calls at the cost of three small edits mirroring the already-shipped
  `app_exit`/`app_relaunch` pattern.
- **No `relaunchInFlight` suppression on `app.hide()`.** That guard exists to resolve a
  process-teardown ownership race between `quit()`/`exit()` and an in-flight `relaunch()`.
  Hiding a window is not teardown and cannot win (or need to win) that race — copying the guard
  would just make the yield fallback silently do nothing during a relaunch, with no correctness
  benefit. Test 1e pins this deliberate asymmetry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Classified the new AST gate suite in `testContainment.test.ts`**
- **Found during:** Task 3 (broader safety-net verification, step 4 of the action list)
- **Issue:** `testContainment.test.ts`'s Block C tripwire asserts every `*.test.ts` file in
  `src/backend/sidecar/__tests__` is declared in exactly one of two lists
  (`IN_SCOPE_SUITES` / `STRUCTURALLY_CONTAINED_SUITES`). The new
  `externalDynamicImportGate.test.ts` (Task 2) was unclassified, failing that gate and blocking
  the plan's own `pnpm jest src/backend/sidecar src/backend/storeManagers/steam` verification
  command.
- **Fix:** Classified it as structurally contained (it declares no `jest.mock(...)` of any kind
  and never imports/requires/executes a backend module — the same "contained by construction"
  floor `seamBranchParity.test.ts`/`invokeReturnValueSweep.test.ts` already rely on), and
  updated the directory's `readdirSync`-recount comment from 45 to 46 files.
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`
- **Verification:** `pnpm jest src/backend/sidecar/__tests__/testContainment.test.ts --silent`
  → 52/52 passing.
- **Committed in:** `68b30fba4`

**2. [Out-of-scope, logged not fixed] Pre-existing eslint error in `electronStub.ts:115`**
- **Found during:** Task 3, scoped `eslint` run over this plan's touched files.
- **Issue:** `@typescript-eslint/no-redundant-type-constituents` fires on `IpcHandler`'s
  `unknown | Promise<unknown>` return type. `git blame` attributes this line to commit
  `64bbef740d` (2026-07-20) — well before this plan's diff, and not touched by any task here.
- **Action taken:** NOT fixed (out of this plan's scope, per the scope-boundary rule). Logged to
  `.planning/quick/260815-vvz-fix-the-dead-app-hide-sidecar-fallback-i/deferred-items.md`.

---

**Total deviations:** 1 auto-fixed (Rule 3, blocking), 1 logged-not-fixed (out of scope)
**Impact on plan:** The Rule 3 fix was necessary to make the plan's own declared verification
command pass; it touches no logic, only a test-classification list. No scope creep — the
out-of-scope eslint finding was explicitly left untouched and documented instead.

## RED Observations (recorded per the plan's quality bar)

**Task 1 — `app.hide` tests (`lifecycleStub.test.ts`), pre-fix run:**
All 5 new tests failed. `app.hide` was `undefined` (`TypeError: electronStub_1.app.hide is not
a function`) for tests 1a/1b/1d/1e. Test 1c failed differently and instructively: because
ts-jest in this repo runs in transpile-only mode (no type-checking at test time — see this
project's own standing `ts-jest is TRANSPILE-ONLY` finding), the `RUST_APP_HIDE` named import
from a module that did not yet export it resolved to `undefined` at runtime rather than
throwing a compile error; `RUST_INVOKE_CHANNELS.includes(undefined)` evaluated to `false`,
producing `Expected: true / Received: false`. This differs slightly from the plan's phrasing
("compile-time RED") but is the same underlying non-vacuous failure the plan's authors
intended to prove.

**Task 1 — intermediate RED (constant added, allowlist entry not yet added):** re-running only
test 1c after adding the `RUST_APP_HIDE` constant (but before adding it to
`RUST_INVOKE_CHANNELS`) reproduced `Expected: true / Received: false` again — this time because
the array genuinely lacks the (now real, `'app_hide'`-valued) member, proving the assertion is
non-vacuous rather than merely unresolvable, exactly as the plan specified.

**Task 2 — Gate 1 (`externalDynamicImportGate.test.ts`), pre-fix run:** exactly one hit —
`src/backend/storeManagers/steam/bottle.ts:477` — matching the planning-time evidence exactly.
Gate 2 (file-count floor, `>= 200`, measured 265) and Gate 3 (known-bad/known-good self-test)
both passed independently of repo state at the same run, confirming Gate 1's later green would
be meaningful.

## Production-Shape Evidence (Task 3)

The `build/main/sidecar.js` bundle already on disk at plan-execution time (pre-fix, timestamped
before this session's edits) was inspected BEFORE rebuilding — it still contained the exact
pre-fix line the planning evidence recorded:

```
build/main/sidecar.js:4911:        const { app: app20 } = await import("electron");
```

`grep -c 'import("electron")' build/main/sidecar.js` on that pre-fix bundle: **1**.

After `pnpm build:sidecar` (post-fix): `grep -c 'import("electron")' build/main/sidecar.js`:
**0**. `grep -c 'require("electron")' build/main/sidecar.js`: **34** (up from 33 pre-fix — the
one new static import). The `1 -> 0` transition was observed directly against the real pre-fix
artifact, not reconstructed or assumed.

## Verification Results

- `pnpm jest src/backend/sidecar/__tests__/lifecycleStub.test.ts src/backend/sidecar/__tests__/rustInvokeChannel.test.ts --silent` → 43/43 passing.
- `cd src-tauri && cargo check` → clean, twice (after Task 1's arm and again after all edits).
- `pnpm jest src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts --silent` → 88/88 passing (84 in bottle.test.ts = 82 pre-existing + 2 new; 4 in the gate suite).
- Raw census: `grep -rn "import('electron')\|import(\"electron\")\|import('electron-store')" src/backend src/sidecar --include="*.ts" | grep -v "__tests__" | grep -c . | grep -qx 0` → **CENSUS CLEAN**.
- `pnpm build:sidecar` + production-shape grep → **PRODUCTION SHAPE OK**.
- `pnpm jest src/backend/sidecar src/backend/storeManagers/steam --silent` → 74/74 suites, 2014/2014 tests passing (one transient run hit an unrelated flake in `enrichmentFlows.test.ts`'s `ALL_8_CHANNELS` sweep — reproduced as green on two subsequent immediate reruns with no code changes in between, and the individual suite alone is green every time; this is a pre-existing cross-suite flake, out of this plan's scope per the scope-boundary rule, not a regression from this plan's edits).
- `pnpm codecheck` (`tsc --noEmit`) → clean.
- `pnpm eslint` scoped to this plan's 8 files → 0 errors, warnings only (all warnings pre-existing style in this repo, e.g. `no-unsafe-*`/`require-await` on already-`any`-typed test helpers). One pre-existing ERROR in `electronStub.ts:115` (dated 2026-07-20, unrelated to this plan's diff) logged to `deferred-items.md`, not fixed (out of scope).
- `git status --short` after the final commit → clean; `git diff --stat` from the plan's base commit shows exactly the 8 planned files plus `testContainment.test.ts` (Rule 3 deviation) and `deferred-items.md` (deviation log) were touched.

## Deliberately NOT Live-Gated

Per the plan's own `<verification>` section: reproducing the miss branch requires a real macOS
bottled-Steam uninstall in which no matching installer process appears for ~18 seconds — a
timing-dependent, best-effort yield path that cannot be summoned on demand. The
production-shape check above (the `import("electron")` count transition on the real compiled
artifact) is the accepted substitute evidence: it verifies the exact artifact property that was
broken, not a live reproduction of the timing window itself.

## Issues Encountered

- The explanatory comment originally written at `bottle.ts`'s fallback site quoted the literal
  old code (`` `const { app } = await import('electron')` ``), which broke the plan's own raw
  census grep verification step (a text-level check, not AST-aware — it flagged the comment as
  a live hit). Reworded the comment to describe the mechanism in prose instead of quoting the
  exact removed syntax; re-verified both the AST gate and the raw census grep pass.
- An unrelated pre-existing flake surfaced once in `enrichmentFlows.test.ts` during the full
  sidecar+steam sweep (see Verification Results above) — confirmed non-reproducing and outside
  this plan's touched files.

## Next Phase Readiness

- The `app.hide()` fallback and its guarding AST gate are complete and merged into this
  branch's working tree (not yet pushed/PR'd — this was a quick task, not a phase).
- No blockers for any dependent work. The live-gate residual (the ~18s timing window) remains
  an accepted, named limitation per the plan's own proportionality note — any future phase that
  wants empirical confirmation of the miss branch under a real bottled-Steam uninstall would
  need to construct that timing scenario deliberately.

---
*Quick task: 260815-vvz*
*Completed: 2026-08-15*

## Self-Check: PASSED

All 9 source/test files and 2 planning docs listed in "Files Created/Modified" confirmed
present on disk. All 5 commit hashes (`fc3da4cf4`, `206a31db7`, `e7da6ff37`, `70a95dc9c`,
`68b30fba4`) confirmed present in `git log --oneline --all`.
