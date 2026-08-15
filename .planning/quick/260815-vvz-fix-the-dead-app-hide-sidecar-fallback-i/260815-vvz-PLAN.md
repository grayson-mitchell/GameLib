---
phase: quick-260815-vvz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types/sidecarTransport.ts
  - src/backend/sidecar/electronStub.ts
  - src-tauri/src/main.rs
  - src/backend/sidecar/__tests__/lifecycleStub.test.ts
  - src/backend/__mocks__/electron.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts
autonomous: true
requirements: [Q-VVZ-01, Q-VVZ-02, Q-VVZ-03]

must_haves:
  truths:
    - "Under the packaged/dev sidecar, `raiseFrontmostBottledProcess`'s miss branch reaches a real `app.hide` member instead of throwing `Cannot read properties of undefined`"
    - "That `app.hide` actually hides the GameLib window on macOS (forwarded to Tauri's AppHandle::hide), not a silent lie"
    - "No file under src/backend uses a native dynamic `import('electron')`/`import('electron-store')`, so the Module._load stub interception can never be bypassed again"
    - "A future reintroduction of a dynamic external import fails a committed automated gate, not a live uninstall"
  artifacts:
    - path: "src/common/types/sidecarTransport.ts"
      provides: "RUST_APP_HIDE channel constant, listed in RUST_INVOKE_CHANNELS"
      contains: "app_hide"
    - path: "src/backend/sidecar/electronStub.ts"
      provides: "app.hide() forwarding member"
      contains: "hide:"
    - path: "src-tauri/src/main.rs"
      provides: "app_hide dispatch_rust_channel arm"
      contains: "\"app_hide\""
    - path: "src/backend/storeManagers/steam/bottle.ts"
      provides: "static electron import feeding the raise-loop fallback"
      contains: "from 'electron'"
    - path: "src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts"
      provides: "AST gate forbidding dynamic external imports under src/backend"
  key_links:
    - from: "src/backend/storeManagers/steam/bottle.ts"
      to: "electron (Module._load -> electronStub)"
      via: "static import compiled to require()"
      pattern: "^import \\{ app \\} from 'electron'"
    - from: "src/backend/sidecar/electronStub.ts"
      to: "src-tauri/src/main.rs dispatch_rust_channel"
      via: "requestRustInvoke(RUST_APP_HIDE)"
      pattern: "RUST_APP_HIDE"
---

<objective>
Repair two stacked defects that make `raiseFrontmostBottledProcess`'s `app.hide()` yield-fallback dead under Tauri, and add a permanent structural gate so the first defect cannot recur silently.

Purpose: when a bottled Steam installer/uninstaller window cannot be raised within ~18s, GameLib is supposed to step aside so the user can see whatever DID appear. Today that fallback throws instead, so GameLib stays in front of an invisible Steam confirm dialog — the exact user-visible symptom that produced the closed debug session `steam-bottle-uninstall-reverts.md`.

Output: a real macOS `app.hide()` path spanning bottle.ts -> electronStub -> Rust `AppHandle::hide()`, plus a RED-provable AST gate over `src/backend`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Project skill (read before starting): `Skill("spike-findings-gamelib")` — sidecar / Electron-API-parity / preload seam patterns.

Source files:
@src/backend/storeManagers/steam/bottle.ts
@src/backend/sidecar/electronStub.ts
@src/backend/sidecar/installElectronHook.ts
@src/common/types/sidecarTransport.ts
@src/backend/sidecar/__tests__/lifecycleStub.test.ts
@src/backend/sidecar/__tests__/electronReachLedger.test.ts
@src/backend/storeManagers/steam/__tests__/bottle.test.ts
</context>

<evidence>
Every claim below was verified during planning. Do not re-derive; do confirm cheaply if an edit does not land as described.

**Defect 1 mechanism — confirmed at the COMPILED artifact, not inferred.**
`build/main/sidecar.js:4911` currently reads:

    const { app: app20 } = await import("electron");

esbuild left this as a **native ESM dynamic import** in the CJS bundle (because of `--external:electron`, see `package.json:34`). Node's native `import()` resolves through the ESM loader, which does **not** consult `Module._load` — the hook installed by `src/backend/sidecar/installElectronHook.ts` is therefore bypassed entirely, and the real `electron` npm package (whose CJS export is a *path string*) is loaded instead. Destructuring `app` off that yields `undefined`, producing the operator's exact log line: `TypeError: Cannot read properties of undefined (reading 'hide')`. A static `import { app } from 'electron'` compiles to `require()`, hits the hook, and gets the stub — which is why every sibling (`steam/constants.ts`, `steam/games.ts`, `steam/library.ts`, `steam/tokenStore.ts`) works.

**Census — this is the ONLY occurrence.**
`grep -rn "import('electron')\|import(\"electron\")\|import('electron-store')" src/backend src/sidecar --include="*.ts"` (excluding `__tests__`) returns exactly one hit: `src/backend/storeManagers/steam/bottle.ts:477`. The neighbouring `await import('backend/constants/environment')` on line 420 is NOT a defect — it is an internal module that esbuild bundles inline, never external.

**Defect 2 — confirmed.**
`electronStub.ts`'s exported `app` (lines 202-287) has exactly: `getPath, getName, setName, isPackaged, getAppPath, getVersion, userAgentFallback, whenReady, on, once, quit, exit, relaunch, requestSingleInstanceLock, setAsDefaultProtocolClient`. There is no `hide`, `show`, or `focus`. Fixing defect 1 alone converts the crash into `app.hide is not a function`.

**Adding a static import to bottle.ts adds NO new import-graph risk.** bottle.ts already reaches `electron` transitively via `backend/constants/paths` (which calls `app.getPath()` at module scope). The module-scope comment in bottle.ts warning against static imports is specifically about `backend/launcher` pulling the storeManagers barrel — it does not apply to `electron`, which is stub-intercepted and side-effect-free.

**Why jest could never catch defect 1 (load-bearing for the test design).**
Under ts-jest/CJS, `await import('electron')` is downlevelled to a `require()` through jest's module registry, so it resolves to the *mock* — `app` is defined and `app.hide()` is callable. A behavioural jest test of the fallback is therefore **green today** and structurally cannot prove defect 1. Only a source/AST-level invariant can. This is exactly the "a test must exercise the PRODUCTION call shape" trap; the production shape here lives in the esbuild output, not in jest's.
</evidence>

<decision>
## REQUIRED DECISION: what `app.hide()` does under Tauri — **option (a), wire it to Rust.**

**Chosen: forward to Tauri's `AppHandle::hide()` via a new `app_hide` rustInvoke arm.**

Verified during planning against the pinned crate (`tauri 2.11.5`, `src/app.rs:1095-1104`):

```rust
/// Hides the application.
#[cfg(target_os = "macos")]
pub fn hide(&self) -> crate::Result<()> {
  match self.runtime() {
    RuntimeOrDispatch::Runtime(r) => r.hide(),
    RuntimeOrDispatch::RuntimeHandle(h) => h.hide()?,
    _ => unreachable!(),
  }
  Ok(())
}
```

Why (a) beats (b) here, despite the proportionality note:

1. **It is an exact semantic equivalence, not an approximation.** Electron's `app.hide()` is itself macOS-only and hides the whole application. Tauri's is `#[cfg(target_os = "macos")]` and hides the whole application. This is not "new shell work" like `openDevTools`/`reload` (the two precedents in this file that stayed declared-degraded no-ops) — those had no equivalent at all. This one does.
2. **The caller is already macOS-gated.** `raiseFrontmostBottledProcess` returns early unless `isMac`, so a macOS-only forward covers 100% of reachable calls. There is no degraded platform.
3. **The cost is three small edits mirroring a shipped pattern.** One constant, one stub member byte-shaped like `app.quit()`, one dispatch arm byte-shaped like `"app_exit"`. No new crate, no new npm package, no new renderer capability grant (`capabilities/default.json` is untouched — `dispatch_rust_channel` arms are sidecar-only).
4. **Writing (b) honestly would cost MORE than (a).** An honest no-op requires a paragraph explaining why no equivalent exists — a claim that would be false, and that would mislead the next reader.

**Thread-safety (checked, not assumed):** `dispatch_rust_channel` always runs on a `thread::spawn`'d worker thread (documented in-file at the `clipboard_read_text` arm, `main.rs:3303-3315`). `AppHandle::hide()`'s off-main-thread path is the `RuntimeOrDispatch::RuntimeHandle(h) => h.hide()?` branch, which posts to the event loop — the same mechanism the already-shipped `app_exit`/`app_relaunch` arms rely on. `tauri-runtime-wry-2.11.4/src/lib.rs:2267` provides that `fn hide`.

**Non-macOS builds:** the arm must be `#[cfg]`-split — `AppHandle::hide()` does not exist on Windows/Linux and would not compile. The non-macOS branch is a loud `eprintln!` + `Ok(Value::Null)`, which is *exact Electron parity* (real `app.hide()` is a no-op off macOS too), not a concession.
</decision>

<constraints>
## CONCURRENT SESSION IN THIS WORKING TREE — READ BEFORE ANY GIT COMMAND

A second Claude session is actively working Phase 34.13 on **frontend** files in this same tree and commits regularly. `workflow.use_worktrees` is false — there is **no isolation**.

- Stage **only by explicit file path**. NEVER `git add -A`, NEVER `git add .`, NEVER `git commit -a`.
- **NEVER `git stash`, under any circumstances.** A prior session did and stranded another session's work — twice. If you think you need a stash, stop and report instead.
- No repo-wide formatter, no `lint --fix`, no codemod. Lint only the files this plan touches.
- Before **every** commit run `git status --short` and confirm nothing outside this plan's `files_modified` list is staged. If something else is staged, unstage it by path (`git restore --staged <path>`) — do not reset.
- Do not `git checkout --` any file: `.husky/post-checkout` runs a download that fails deterministically in this repo and will block you.
</constraints>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Give the sidecar stub a real app.hide, backed by a Tauri app_hide arm</name>
  <files>
src/common/types/sidecarTransport.ts
src/backend/sidecar/electronStub.ts
src-tauri/src/main.rs
src/backend/sidecar/__tests__/lifecycleStub.test.ts
src/backend/__mocks__/electron.ts
  </files>

  <behavior>
Add these tests to `src/backend/sidecar/__tests__/lifecycleStub.test.ts` FIRST and run them to observe RED. The existing `app.quit()`/`app.exit()`/`app.relaunch()` describe block in that file is the shape to copy — it already has the `requestRustInvoke` in-memory-program mock, the `jest.mock('electron', () => jest.requireActual('../electronStub'))` preamble, and the `flushMicrotasks()` helper these need.

  - Test 1a — `app.hide` is a callable member: `expect(typeof app.hide).toBe('function')`.
    RED today: `app.hide` is `undefined` (member does not exist).
  - Test 1b — happy path forwards the channel: calling `app.hide()` invokes
    `requestRustInvoke(RUST_APP_HIDE, [])` exactly once, with an empty args array.
    RED today: nothing is called (1a throws first).
  - Test 1c — channel is on the allowlist:
    `expect((RUST_INVOKE_CHANNELS as readonly string[]).includes(RUST_APP_HIDE)).toBe(true)`.
    RED today: `RUST_APP_HIDE` does not exist, so this is a compile-time RED. After you add
    the constant but BEFORE you add it to the array, re-run to observe a *runtime* RED —
    that second observation is what proves the assertion is non-vacuous rather than merely
    unresolvable. Record both observations in the SUMMARY.
  - Test 1d — failure is logged, never thrown: with the mock programmed to REJECT
    `RUST_APP_HIDE`, `app.hide()` returns void synchronously, does not throw, and after
    `await flushMicrotasks()` a `console.warn` was emitted naming the channel.
    Copy `app.quit()`'s existing failure-path test verbatim in shape.
  - Test 1e — `app.hide()` is NOT suppressed by the `relaunchInFlight` guard. Assert that
    after `app.relaunch()` has been called, a subsequent `app.hide()` still forwards.
    (`hide` is not a teardown-ownership operation, so the D-06 quit/exit suppression must
    not be copy-pasted onto it. This test pins that deliberate asymmetry so a future reader
    does not "fix" the missing guard.)
  </behavior>

  <action>
Implement in this order.

1. **`src/common/types/sidecarTransport.ts`** — add `RUST_APP_HIDE` immediately after `RUST_APP_RELAUNCH` (currently line ~220), with a doc comment in the established style of its neighbours: state that it backs `electronStub.ts`'s `app.hide()`, that it is the yield-fallback for `raiseFrontmostBottledProcess` (steam bottle install/uninstall), and that it is a no-op off macOS by design (Electron parity). Value: `'app_hide'`. Then add `RUST_APP_HIDE` to the `RUST_INVOKE_CHANNELS` array — placing it adjacent to `RUST_APP_EXIT`/`RUST_APP_RELAUNCH` so the lifecycle trio stays visually grouped. Omitting the array entry is a silent failure mode: `requestRustInvoke` pre-rejects any channel not in the allowlist (`sidecarRpc.ts:292`), so the forward would never reach Rust.

2. **`src/backend/sidecar/electronStub.ts`** — add a `hide` member to the exported `app` object (after `relaunch`). Byte-shape it on `quit()`'s forward: fire-and-forget `requestRustInvoke(RUST_APP_HIDE, []).catch(...)` with a `console.warn` naming the channel. Two deliberate differences from `quit`, both of which must be stated in the comment:
   - **No `relaunchInFlight` suppression.** That guard exists because quit/exit can race a relaunch for process-teardown ownership. Hiding a window is not teardown and cannot win that race.
   - **Never throws.** Same total-method convention as its neighbours (`sidecar-dialog-reject-crashes`).
   Write the comment to explain WHY this member exists (the raise-loop yield fallback) and WHERE it lands (Tauri `AppHandle::hide()`, macOS-only), matching the density of the surrounding members. Add the import of `RUST_APP_HIDE` to the existing `common/types/sidecarTransport` import block.

3. **`src-tauri/src/main.rs`** — add an `"app_hide"` arm to `dispatch_rust_channel` (place it directly after the `"app_relaunch"` arm at ~line 3350, keeping the lifecycle arms contiguous). Shape:

   - macOS branch: `app.hide().map_err(|e| e.to_string())?;`
   - non-macOS branch: `eprintln!` recording the declared no-op, then fall through.
   - Both branches converge on `Ok(Value::Null)`.

   Gate the two branches with `#[cfg(target_os = "macos")]` / `#[cfg(not(target_os = "macos"))]` block attributes — `AppHandle::hide()` does not exist off macOS and an ungated call will not compile there. Document the arm in the style of its `app_exit` neighbour: name the backing stub member, name the one reachable caller (`raiseFrontmostBottledProcess`'s ~18s-miss yield fallback), and record the worker-thread reasoning from this plan's `<decision>` block (dispatch always runs off the main thread, so `hide()` takes its `RuntimeHandle` branch, same as `app_exit`).

4. **`src/backend/__mocks__/electron.ts`** — add `hide: jest.fn()` (or a plain no-op function, matching whatever convention that file's `app` object already uses for its non-`getPath` members) to the exported `app`. This manual mock is auto-applied to every `src/backend` suite (`jest.config.js` sets `roots: ['<rootDir>/src/backend']`), so any existing suite that transitively reaches the new static import in Task 2 gets a defined member rather than a TypeError.

Run the Task 1 tests GREEN before moving on. Do not touch `bottle.ts` in this task.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/backend/sidecar/__tests__/lifecycleStub.test.ts src/backend/sidecar/__tests__/rustInvokeChannel.test.ts --silent</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo check 2>&1 | tail -20</automated>
  </verify>

  <done>
`typeof app.hide === 'function'`; calling it emits `requestRustInvoke('app_hide', [])`; `'app_hide'` is a member of `RUST_INVOKE_CHANNELS`; a rejecting transport logs and does not throw; `relaunchInFlight` does not suppress it; `cargo check` passes with the new arm. Both the compile-time and the runtime RED observations for test 1c are recorded.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Convert bottle.ts to a static electron import and gate the pattern permanently</name>
  <files>
src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts
src/backend/storeManagers/steam/bottle.ts
src/backend/storeManagers/steam/__tests__/bottle.test.ts
  </files>

  <behavior>
Write the gate FIRST and observe it RED against the current `bottle.ts`.

**Gate (new file `src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts`) — this is the RED-prover for defect 1.**

Use the TypeScript compiler API, not a regex. `electronReachLedger.test.ts` in the same directory already imports `typescript` and walks source files — copy its file-discovery and traversal conventions rather than inventing new ones. A depth-1 regex is the exact weakness that file's own docstring warns about.

  - Gate 1 — the invariant: recursively scan every `.ts` under `src/backend` and `src/sidecar`, EXCLUDING `__tests__` and `__mocks__` directories. Parse each with `ts.createSourceFile` and walk for `CallExpression` nodes whose `expression.kind === ts.SyntaxKind.ImportKeyword` and whose sole argument is a `StringLiteral` in the forbidden set `['electron', 'electron-store']` (these are precisely the two modules `package.json`'s `build:sidecar` marks `--external`, so they are precisely the two that esbuild leaves as native `import()` and that `Module._load` therefore cannot intercept). Assert the collected hit list is empty, and put the offending `file:line` values in the failure message so a future breakage names itself.
    RED today: exactly one hit, `src/backend/storeManagers/steam/bottle.ts:477`.
  - Gate 2 — anti-vacuity by file count: assert the scanner visited a plausible number of files (`>= 200`; confirm the real count and pick a floor comfortably under it). A resolver that silently stops traversing would otherwise make Gate 1 pass against an empty set.
  - Gate 3 — **known-bad self-test, committed, not just run at authoring time**: run the SAME detector function over an inline source string containing `const { app } = await import('electron')` and assert it reports exactly one hit; and over a control string containing `import { app } from 'electron'` plus `await import('backend/constants/environment')` and assert it reports ZERO. This is what proves Gate 1 can fail and that it discriminates the dynamic-external case from both the legal static import and the legal dynamic-internal import. Do not delete this after the fix lands — it is the permanent proof that Gate 1 is not vacuous.

Derive the forbidden-module list from a single exported `const` shared by Gate 1 and Gate 3 so the self-test cannot drift from the real check.

**bottle.test.ts additions — behavioural guards, NOT defect-1 provers.**

  - Test 2a — the miss branch calls `app.hide()`: add `hide: jest.fn()` to the existing inline `jest.mock('electron', ...)` factory at line 46. With fake timers, `mockedSpawnAsync` left at its default (`stdout: ''`, which `tryRaise` reads as a miss), fire `void tellBottledSteamToUninstall('440')`, then drive all 12 poll iterations (`for (let i = 0; i < 12; i++) await jest.advanceTimersByTimeAsync(1500)`), flush microtasks, and assert the mocked `app.hide` was called once. Call `__stopBottledRaiseLoops()` before asserting timer cleanliness, per the existing `afterEach` convention.
  - Test 2b — the miss is logged: assert `logWarning` received the `falling back to app.hide()` message.
  - **Mandatory comment on 2a/2b:** these two tests are GREEN against the current code and therefore prove nothing about defect 1. Under ts-jest/CJS, `await import('electron')` downlevels to a `require()` through jest's registry and resolves to the mock, so `app` is never `undefined` here — the production failure lives only in the esbuild output. State this in the test file so a future reader does not mistake these for the defect-1 guard and delete the AST gate as redundant. Point them at `externalDynamicImportGate.test.ts`.
  </behavior>

  <action>
1. Create the gate file and run it. **Observe and record the RED**: one hit at `bottle.ts:477`. Also confirm Gate 3 passes at this point (the self-test is independent of the repo's state) — if Gate 3 fails, the detector is wrong and Gate 1's later green would be meaningless.

2. **`src/backend/storeManagers/steam/bottle.ts`** — add `import { app } from 'electron'` to the top-level import block (place it with the other external-package imports, above the `backend/*` imports, matching `steam/constants.ts`'s convention). Then delete line 477's `const { app } = await import('electron')`, leaving `app.hide()` inside its existing `try`/`catch`.

   Keep the surrounding `try`/`catch` and the existing `logWarning` exactly as they are — the catch is still load-bearing (the stub's `hide` is total, but real Electron's `app.hide()` can throw, and this is a best-effort yield path that must never affect the install/uninstall flow).

   Replace the deleted line with a short comment recording WHY the import is static: a native dynamic `import()` bypasses the sidecar's `Module._load` electron interception (`installElectronHook.ts`), because esbuild's `--external:electron` leaves it as a real ESM import in the CJS bundle — so `app` resolved to `undefined` and this fallback threw instead of yielding. Name the gate file that now prevents recurrence. Do NOT touch the `await import('backend/constants/environment')` on line 420 — that is an internal module, bundled inline, and is correct as-is.

3. Re-run the gate: Gate 1 must now be empty while Gates 2 and 3 stay green.

4. Add tests 2a/2b to `bottle.test.ts` with the mandatory comment.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts --silent</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -rn "import('electron')\|import(\"electron\")\|import('electron-store')" src/backend src/sidecar --include="*.ts" | grep -v "__tests__" | grep -c . | grep -qx 0 && echo "CENSUS CLEAN"</automated>
  </verify>

  <done>
Gate 1 reports zero dynamic external imports; Gate 2 confirms a non-trivial scan; Gate 3's known-bad specimen still reports a hit and its control reports none; the full `bottle.test.ts` suite (82+ existing tests plus 2a/2b) passes; the raw census command prints `CENSUS CLEAN`. The pre-fix RED observation for Gate 1 is recorded in the SUMMARY with the exact `file:line`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove the fix at the PRODUCTION call shape, then commit by explicit path</name>
  <files>(no source edits — verification and commit only)</files>

  <action>
The jest suites cannot see the defect (see `<evidence>`), so the decisive check is the esbuild output — the artifact where the bug actually lived.

1. Rebuild the sidecar bundle: `pnpm build:sidecar`.

2. Assert the native dynamic import is GONE from the built artifact:
   `grep -c 'import("electron")' build/main/sidecar.js` must be `0`.
   Before trusting that zero, confirm the check discriminates: `git stash` is FORBIDDEN, so prove it by checking out nothing — instead, run the same grep against the pre-fix bundle you have already observed (the planning evidence records `build/main/sidecar.js:4911` containing `await import("electron")` before this plan ran). If your working `build/main/sidecar.js` predates step 1, capture its grep count first, then rebuild, then compare — a `1 -> 0` transition is the proof. If the pre-fix count is already 0, the bundle is stale: delete `build/main/sidecar.js`, rebuild from the PRE-fix source only if you can do so without any git checkout — otherwise record the limitation honestly in the SUMMARY rather than fabricating the transition.

3. Assert the static form landed in the bundle: `grep -c 'require("electron")' build/main/sidecar.js` must be `>= 1`.

4. Run the broader safety net for the files touched:
   - `pnpm jest src/backend/sidecar src/backend/storeManagers/steam --silent`
   - `pnpm tsc --noEmit -p tsconfig.json` (or this repo's equivalent typecheck entry point — check `package.json` scripts first)
   - `pnpm eslint <only the files this plan modified>` — **never** `pnpm lint` across the repo and **never** `lint-fix`.
   - `cd src-tauri && cargo check`

5. **Commit hygiene (concurrent session — re-read `<constraints>`):**
   - Run `git status --short`. A second session is committing frontend files in this same tree.
   - Stage ONLY these paths, explicitly, one by one:
     `src/common/types/sidecarTransport.ts src/backend/sidecar/electronStub.ts src-tauri/src/main.rs src/backend/sidecar/__tests__/lifecycleStub.test.ts src/backend/__mocks__/electron.ts src/backend/storeManagers/steam/bottle.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts`
   - Do NOT stage `build/main/sidecar.js` (build artifact).
   - Re-run `git status --short` and confirm the staged set matches that list exactly. If anything else is staged, `git restore --staged <path>` it — never `git reset`, never `git stash`.
   - Commit message: `fix(quick): wire app.hide through the sidecar stub and forbid dynamic electron imports`

If any check in steps 2-4 fails, STOP and report — do not paper over it.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm build:sidecar >/dev/null 2>&1 && test "$(grep -c 'import("electron")' build/main/sidecar.js)" = "0" && test "$(grep -c 'require("electron")' build/main/sidecar.js)" -ge 1 && echo "PRODUCTION SHAPE OK"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/backend/sidecar src/backend/storeManagers/steam --silent</automated>
  </verify>

  <done>
`PRODUCTION SHAPE OK` prints; the sidecar and steam suites pass; typecheck, scoped eslint, and `cargo check` are clean; exactly the eight listed files are committed and `git status --short` shows nothing else was staged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar (Node) -> Rust shell | The sidecar sends `rustInvoke` frames over stdio; `dispatch_rust_channel` executes them with full shell authority. This plan adds one channel to that surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-VVZ-01 | Denial of Service | new `app_hide` dispatch arm | accept | A compromised sidecar could repeatedly hide the window, making the app appear to vanish. Strictly LESS severe than the already-accepted `app_exit` arm on the identical boundary (T-33-12), which terminates the process outright. The window is recoverable from the Dock/tray; no data is lost. No new capability is granted to the renderer — `capabilities/default.json` is untouched and `dispatch_rust_channel` is reachable only from the sidecar. |
| T-VVZ-02 | Elevation of Privilege | `RUST_INVOKE_CHANNELS` allowlist | mitigate | The new channel takes NO arguments (`[]`), so there is no argument-injection surface at all — unlike `dialog_open`/`humble_login_*`, no parsing or validation code is added. `sidecarRpc.ts:292` continues to pre-reject any channel outside the allowlist; Task 1 tests that `app_hide` is on it, and `rustInvokeChannel.test.ts`'s existing Behavior-7 test continues to prove non-members reject. |
| T-VVZ-SC | Tampering | npm/pip/cargo installs | n/a | **This plan installs no packages.** `tauri`, `typescript`, and `jest` are all already direct dependencies at pinned versions. No `package.json`/`Cargo.toml` dependency edits are in scope; the Package Legitimacy Gate does not apply. If an executor finds itself reaching for an install, that is out of scope — stop and report. |
</threat_model>

<verification>
1. `pnpm jest src/backend/sidecar src/backend/storeManagers/steam --silent` — all green.
2. `grep -c 'import("electron")' build/main/sidecar.js` returns `0` after `pnpm build:sidecar`.
3. Raw census: no dynamic `import('electron')`/`import('electron-store')` anywhere under `src/backend` or `src/sidecar` outside tests.
4. `cd src-tauri && cargo check` clean (proves the `#[cfg]`-split arm compiles on this macOS host; the non-macOS branch is compile-checked by CI's cross-platform legs, not here).
5. `git status --short` shows only this plan's eight files were staged.

**Deliberately NOT live-gated.** Reproducing the miss branch requires a real macOS bottled-Steam uninstall in which no matching installer process appears for ~18 seconds — a timing-dependent, best-effort yield path that cannot be summoned on demand. Per this plan's proportionality note, demanding a live gate here would cost more than the path is worth. The production-shape check in Task 3 (step 2) is the substitute evidence: it verifies the exact artifact property that was broken. Record this as an accepted, named limitation in the SUMMARY — not as a silent omission.
</verification>

<success_criteria>
- `raiseFrontmostBottledProcess`'s fallback reaches a defined `app.hide` under the sidecar (defect 1 closed at the compiled-artifact level, not just in jest).
- `electronStub`'s `app.hide()` forwards to Tauri's `AppHandle::hide()` on macOS and logs a declared no-op elsewhere — honest either way, never a silent lie (defect 2 closed).
- The dynamic-external-import class of defect is guarded by a committed AST gate that ships with its own known-bad self-test.
- Both RED observations (Task 1's `RUST_APP_HIDE` allowlist assertion, Task 2's Gate 1) are recorded with concrete evidence in the SUMMARY.
- Nothing outside this plan's eight files was staged or committed.
</success_criteria>

<output>
Create `.planning/quick/260815-vvz-fix-the-dead-app-hide-sidecar-fallback-i/260815-vvz-SUMMARY.md` when done.

The SUMMARY must record, explicitly:
- The pre-fix RED for Gate 1 (`bottle.ts:477`) and for the `RUST_APP_HIDE` allowlist test (both the compile-time and runtime observations).
- The `import("electron")` count in `build/main/sidecar.js` before and after (or an honest note if the pre-fix bundle could not be reconstructed without a forbidden git operation).
- The decision outcome: option (a), wired to `AppHandle::hide()`, with the equivalence argument.
- The accepted limitation: the ~18s miss branch was not live-exercised, and why.
</output>
