---
phase: quick-260907-juv
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - TODO-2026-09-01-helper-orphan
files_modified:
  - src/backend/longLivedChildren.ts
  - src/backend/utils.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/platform/index.ts
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
  - src/backend/__tests__/quitTeardownWiring.test.ts
  - src/backend/sidecar/__tests__/appShellFlows.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - .planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md

must_haves:
  truths:
    - "Quitting GameLib from the in-app quit path (ipcMain 'quit' send, ctrl+q) runs a registry teardown that terminates every registered long-lived child before app.exit()."
    - "Quitting GameLib from the red-X / Cmd+Q / osascript path terminates the sidecar's whole descendant process group, so comet and the Steam bridge helper cannot be reparented to launchd."
    - "shutdownBridgeHelper() has a production caller again -- reachable without any test calling it directly."
    - "Deleting the handleExit call site fails an automated test, and deleting the process-group wiring from either sidecar spawn site fails an automated test."
    - "Neither layer alone satisfies the gate set: with only Layer A landed the Rust assertions are still RED; with only Layer B landed the Node wiring assertions are still RED."
    - "No comment in the tree still asserts a teardown wired to `main.ts`'s deleted `app.on('before-quit')` hook."
  artifacts:
    - path: "src/backend/longLivedChildren.ts"
      provides: "The single long-lived-child registry: registerLongLivedChild / shutdownLongLivedChildren / __resetLongLivedChildrenForTests"
      exports: ["registerLongLivedChild", "shutdownLongLivedChildren", "__resetLongLivedChildrenForTests"]
      min_lines: 40
    - path: "src/backend/__tests__/quitTeardownWiring.test.ts"
      provides: "Comment-stripped source gates for Layer B (Rust process-group spawn + group reap) and the comet registration site; the ONLY thing that gates Layer B in CI, since CI runs no cargo step"
      contains: "stripSourceComments"
      min_lines: 80
    - path: "src-tauri/Cargo.toml"
      provides: "`libc` declared as a unix-only direct dependency (already resolved in Cargo.lock at 0.2.186 -- must add NO new lockfile crate)"
      contains: "libc"
  key_links:
    - from: "src/backend/utils.ts (handleExit)"
      to: "src/backend/longLivedChildren.ts (shutdownLongLivedChildren)"
      via: "direct call immediately before app.exit()"
      pattern: "shutdownLongLivedChildren\\(\\)"
    - from: "src/backend/storeManagers/steam/bridge/helperProcess.ts (spawnHelperIfNeeded)"
      to: "src/backend/longLivedChildren.ts (registerLongLivedChild)"
      via: "registration at spawn time, unregistered by shutdownBridgeHelper"
      pattern: "registerLongLivedChild\\("
    - from: "src/backend/storeManagers/gog/games.ts (comet spawn)"
      to: "src/backend/longLivedChildren.ts (registerLongLivedChild)"
      via: "registration at spawn time, unregistered by the existing game-exit child.kill()"
      pattern: "registerLongLivedChild\\("
    - from: "src-tauri/src/main.rs (spawn_sidecar_dev, spawn_sidecar_packaged)"
      to: "configure_sidecar_process_group"
      via: "shared helper called at BOTH spawn sites -- parity is the assertion"
      pattern: "configure_sidecar_process_group\\("
    - from: "src-tauri/src/main.rs (SidecarState::shutdown_child)"
      to: "the sidecar's descendant process group"
      via: "libc::kill(-pgid, SIGTERM) -> bounded grace -> libc::kill(-pgid, SIGKILL) -> child.wait()"
      pattern: "libc::kill\\("
---

<objective>
Stop `comet` (GOG) and the Steam bridge helper orphaning when GameLib quits.

Both are long-lived `child_process.spawn()` children of the **Node sidecar**. The
`app.on('before-quit')` hook they both assumed died with `src/backend/main.ts` in the
Phase 35 Tauri cutover, and nothing replaced it.

Purpose: close `.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md`'s
two independent defects with the **two-layer** fix its own sketch missed, and ship a
WIRING assertion (not a behaviour assertion) so the call sites cannot silently die again.

Output: one long-lived-child registry; both teardowns registered on it; the Rust exit path
reaping the sidecar's whole process group; two stale doc comments corrected; and a
CI-runnable gate set proven RED at HEAD, proven RED with each layer alone, and proven RED
under call-site deletion.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260907-juv-fix-helper-process-orphan-on-app-quit-wi/260907-juv-CONTEXT.md
@.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md
@CLAUDE.md

Read `.claude/skills/spike-findings-gamelib/SKILL.md` (auto-load skill for Tauri/sidecar work).

**Do NOT re-derive the diagnosis.** CONTEXT.md's F1/F2/F3 were orchestrator-verified from
source before planning. The todo's own "Fix sketch" ("find the surviving quit/teardown seam
... then register both teardowns there") is **partially falsified**: there is no single seam.
`handleExit()` is Node-side and live but is NOT on the red-X/Cmd+Q/`osascript` path that
produced the 22h orphan; `RunEvent::Exit -> shutdown_child()` IS on every path but uses Rust
`Child::kill()` = **SIGKILL**, which is uncatchable, so no JS teardown can ever run there.
A single-layer plan is a false fix.
</context>

<interfaces>
<!-- Contracts the executor needs. Measured from the tree at 32324f6ec. No exploration required. -->

Layer A seam -- `src/backend/utils.ts`:
```
async function handleExit()                      // :275, exported at :1771
  // ... pending-operations confirm (cancelId: 0, response === 0 => early return) ...
  // ... killPattern('legendary'|'gogdl'|'nile'), callAllAbortControllers()  <-- OUT OF SCOPE
  mainWindow?.hide()
  await gogPresence.deletePresence()
  app.exit()                                     // <-- registry teardown goes IMMEDIATELY BEFORE THIS
```
Reached from exactly two registrations:
- `src/backend/sidecar/appShellFlowRegistration.ts:288` — `ipcMain.on('quit', () => { handleExit().catch(...) })`
- `src/backend/sidecar/shortcutsFlowRegistration.ts:299` — `case 'ctrl+q': await handleExit()`

Registration site 1 -- `src/backend/storeManagers/steam/bridge/helperProcess.ts`:
```
function spawnHelperIfNeeded(): void            // :101, module-scoped `helperProcess` handle set at :138
export function shutdownBridgeHelper(): void    // :306 -- NO PRODUCTION CALLER TODAY
export function __resetBridgeHelperStateForTests(): void  // :325
```
Its doc comment at :299-306 claims teardown "from the main-process app-quit lifecycle
(Task 3, `main.ts` before-quit)". `main.ts` does not exist.

Registration site 2 -- `src/backend/storeManagers/gog/games.ts`:
```
child = spawn(join(path.dir, path.bin), ['--from-heroic', '--username', userData.username, '--quit'])  // :728-733
...
await libraryManagerMap['gog'].runRunnerCommand(...)   // :746
if (child) { logInfo('Killing Comet!', ...); child.kill() }   // :757-760  <-- game-exit-scoped ONLY
```

Layer B -- `src-tauri/src/main.rs`:
```
struct SidecarState { ..., child: Mutex<Child> }              // :1121, child field :1145
impl SidecarState { fn shutdown_child(&self) { ... child.kill(); child.wait(); } }  // :1153-1176
fn spawn_sidecar_dev(shell_exe: &str, forward_args: &[String]) -> std::io::Result<Child>   // :8161
    // builder chain: Command::new(&node).arg(&entry).args(..).env(..).stdin/out/err(..).spawn()
fn spawn_sidecar_packaged(app, shell_exe, forward_args) -> std::io::Result<Child>          // :8207
    // `let mut std_command: Command = shell_command.into();` then .args(..).env(..).spawn()
.run(move |app_handle, event| { if let tauri::RunEvent::Exit = event {
      state.shutdown_child(); wake_lock_release_all(); ... } })                            // :9470-9494
```
`src-tauri/Cargo.toml` — `rust-version = "1.77.2"`. `std::os::unix::process::CommandExt::process_group`
is stable since 1.64. There is **no** `libc` direct dependency and no `CommandExt` import today;
`libc 0.2.186` IS already resolved in `src-tauri/Cargo.lock`.

Test infrastructure:
```
jest projects (jest.config.js): src/backend | src/common | src/frontend | src/preload | meta
src/backend/jest.config.js -> displayName: 'Backend', testMatch **/__tests__/**/*.test.ts
src/backend/testUtils/stripSourceComments.ts
  export function stripSourceComments(source: string): string        // strips /* ... */ blocks
  export function stripTrailingLineComment(line: string): string     // Rust/JS `//` line + trailing
  export function stripTrailingLineCommentTs(line: string): string   // TS-aware variant
```
Precedent for a Rust source-pinning JS gate: `src/backend/__tests__/tauriShellSource.test.ts`
(2658 lines) — two-stage strip (`stripSourceComments` THEN a local trailing-`//` pass), plus a
reusable `extractBracedBlock(code, openMarker)` brace-matcher at :1086. **Copy that convention;
do not add to that file** — author a new sibling.

Behavioural harnesses that already exist and must be extended, not rebuilt:
- `src/backend/sidecar/__tests__/appShellFlows.test.ts:440` — `writeSend(input, 'quit-1', 'quit', [])`
  then `await flush()` drives the REAL `backend/utils` `handleExit()` end-to-end and asserts
  `mockRequestRustInvoke` saw `RUST_APP_EXIT`. Narrow `jest.fn()` module mocks are the file's
  established boundary convention (see its `aborthandler` mock).
- `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` (234 lines) — mocks
  `node:child_process` `spawn` with a `FakeChildProcess extends EventEmitter` whose `kill` is a
  `jest.fn()`, and calls `__resetBridgeHelperStateForTests()` in `beforeEach`.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Author the wiring gates and OBSERVE THEM RED AT HEAD</name>
  <files>src/backend/__tests__/quitTeardownWiring.test.ts, src/backend/sidecar/__tests__/appShellFlows.test.ts, src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts</files>

  <behavior>
    Three gate surfaces. Every one must fail if a CALL SITE is deleted, not merely if a
    function misbehaves — that distinction is the whole point of this task. A unit test that
    calls `shutdownBridgeHelper()` directly is exactly how this defect stayed green for a
    whole milestone; do not write one.

    GATE A (behavioural, Layer A, in `appShellFlows.test.ts`) — reachability from the quit path:
      - Add a narrow module mock `jest.mock('../../longLivedChildren', () => ({ registerLongLivedChild: jest.fn(() => jest.fn()), shutdownLongLivedChildren: jest.fn(), __resetLongLivedChildrenForTests: jest.fn() }))`
        alongside the file's existing `aborthandler` mock, following that mock's comment convention.
      - Test A1: `writeSend(input, 'quit-1', 'quit', [])` + `await flush()` => `shutdownLongLivedChildren`
        called exactly once.
      - Test A2 (ordering): `shutdownLongLivedChildren` is called BEFORE the `RUST_APP_EXIT`
        rustInvoke — assert via `mock.invocationCallOrder`, not by eyeballing.
      - Test A3 (cancel path): with the `gamesConfigPath/lock` fixture present and the confirm
        answered `response === 0` (reuse the file's existing CR-04 describe-block fixture),
        `shutdownLongLivedChildren` is NOT called. A cancelled quit must not tear down helpers.
      - Do NOT use `{ virtual: true }` on the mock. At HEAD the module does not exist and the
        honest RED is a resolution failure; a virtual mock would let this test survive a world
        in which the registry was never created.

    GATE B (behavioural, Layer A registration, in `helperProcess.test.ts`):
      - Import `shutdownLongLivedChildren` and `__resetLongLivedChildrenForTests` from
        `backend/longLivedChildren`. Call the reset in `beforeEach` next to the existing
        `__resetBridgeHelperStateForTests()`.
      - Test B1: drive `ensureBridgeHelperReady(...)` so a `FakeChildProcess` is spawned, then
        call **`shutdownLongLivedChildren()` — never `shutdownBridgeHelper()`** — and assert the
        fake child's `kill` mock was called. This is the assertion that has teeth: it proves the
        helper is reachable from the registry, which is the property that was missing.
      - Test B2: after `shutdownLongLivedChildren()`, a second `shutdownLongLivedChildren()` does
        not call `kill` again (unregistration on teardown; idempotent).

    GATE C (comment-stripped source pins, in the new `quitTeardownWiring.test.ts`) — Layer B and
    the comet site. This is the ONLY thing that gates Layer B: **CI runs no cargo step in this
    repo**, so a `#[cfg(test)]` Rust test would never gate anything.
      - Load `src-tauri/src/main.rs` and apply the SAME two-stage strip as
        `tauriShellSource.test.ts` (`stripSourceComments` first, THEN a local trailing-`//` pass
        via `stripTrailingLineComment`). Load `src/backend/storeManagers/gog/games.ts` with the
        `stripTrailingLineCommentTs` variant. Every assertion below runs on stripped source —
        an unstripped grep would be satisfied by the very prose that documents the fix.
      - C1: stripped main.rs contains `fn configure_sidecar_process_group`.
      - C2 (BOTH spawn sites, parity): extract the bodies of `fn spawn_sidecar_dev` and
        `fn spawn_sidecar_packaged` with a local `extractBracedBlock` (copy the matcher from
        `tauriShellSource.test.ts:1086`); each body must contain `configure_sidecar_process_group(`.
      - C3 (a third spawn site cannot silently skip it): count occurrences of `.spawn()` in
        stripped main.rs and pin the count; assert the count equals the two known sidecar spawn
        sites. Include a failure message telling a future author to extend C2, not to bump C3.
      - C4 (group reap): the extracted `fn shutdown_child` body must contain `libc::kill(`, both
        `SIGTERM` and `SIGKILL`, a negated pgid argument, a bounded-grace poll using `try_wait`,
        and must still contain `child.wait()`.
      - C5 (Windows does not regress): the `shutdown_child` body contains a `#[cfg(not(unix))]`
        arm that still calls `child.kill()`.
      - C6 (supply chain): `src-tauri/Cargo.toml` declares `libc` under a `cfg(unix)` target
        dependency section.
      - C7 (comet registration): the stripped `games.ts` block containing `'--from-heroic'`
        contains `registerLongLivedChild(`.
      - C8 (no resurrected stale claim): neither stripped `helperProcess.ts` nor stripped
        `platform/index.ts`... — SKIP this as a stripped assertion, the target text lives IN
        comments. Instead assert on RAW source that the exact string
        "`main.ts` before-quit" does not appear anywhere under `src/backend/` **outside** a line
        that also contains the word `deleted` or `no longer exists`. Use `grep -v '^\s*//'`-style
        filtering only where you are asserting about CODE; here the subject IS the comment, so
        read raw and scope the exemption narrowly.

    Hazard: `stripSourceComments` EATS a leading `*` deref line in Rust source (project memory
    `strip-source-comments-eats-rust-deref-lines`). Do not write a Layer B assertion whose
    target line begins with `*`.
  </behavior>

  <action>
    Write the three gate surfaces above. Then RUN THEM AT HEAD AND RECORD THE FAILURES VERBATIM.

    Run each as its OWN command invocation — never `<write> && npx jest`, which reads a stale
    tree (project memory `jest-in-the-same-command-as-a-write-reads-stale`). Use explicit test
    paths, NOT `--selectProjects`, which is case-sensitive and can exit 0 having selected
    nothing (`jest-selectprojects-is-case-sensitive-and-exits-zero`):

      npx jest src/backend/__tests__/quitTeardownWiring.test.ts
      npx jest src/backend/sidecar/__tests__/appShellFlows.test.ts
      npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts

    A run whose summary says `No tests found` is a FAILED verification, not a pass. Confirm a
    nonzero `Tests:` count on every run.

    EXPECTED RED at 32324f6ec, and this exact shape is the deliverable — paste it verbatim into
    the SUMMARY:
      - Gates A and B: `Cannot find module '../../longLivedChildren'` /
        `Cannot find module 'backend/longLivedChildren'` — the wiring does not exist at all.
      - Gate C: assertion failures naming the absent tokens, at minimum
        `configure_sidecar_process_group`, `libc::kill(`, and `registerLongLivedChild(`.

    Do NOT commit yet. Commit ordering is handled in Task 3 so that no commit in history is RED.
    Leave the gate files in the working tree.
  </action>

  <verify>
    <automated>npx jest src/backend/__tests__/quitTeardownWiring.test.ts; npx jest src/backend/sidecar/__tests__/appShellFlows.test.ts; npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts</automated>
    Every one of the three runs must EXIT NONZERO at HEAD with a nonzero reported test count.
    A green run here means the gate is vacuous and the task is not done.
  </verify>

  <done>
    Three gate surfaces exist in the working tree. All three fail at 32324f6ec. The verbatim
    failure output for each is captured for the SUMMARY, including the specific missing-module
    and missing-token messages named above.
  </done>
</task>

<task type="auto">
  <name>Task 2: Layer A -- the long-lived-child registry, both registrations, the handleExit call site, and the two stale comments</name>
  <files>src/backend/longLivedChildren.ts, src/backend/utils.ts, src/backend/storeManagers/steam/bridge/helperProcess.ts, src/backend/storeManagers/gog/games.ts, src/backend/platform/index.ts</files>

  <action>
    Create `src/backend/longLivedChildren.ts` — the ONE module owning every long-lived child,
    as the todo asked for ("Track every long-lived child in one place rather than adding a
    second ad-hoc kill"). Exports:
      - `registerLongLivedChild(name: string, dispose: () => void): () => void` — returns an
        unregister function.
      - `shutdownLongLivedChildren(): void` — runs every registered `dispose` in its own
        `try/catch`, logs each failure and CONTINUES (one throwing helper must not strand the
        rest), clears the registry, and is idempotent.
      - `__resetLongLivedChildrenForTests(): void` — mirrors `helperProcess.ts`'s
        `__resetBridgeHelperStateForTests` test-hook convention.
    Import budget: `backend/logger` ONLY. It must NOT import `backend/utils` (utils imports it —
    a cycle would be introduced) and must not reach into any store manager.

    Wire the call site: in `handleExit()` (`src/backend/utils.ts:275`), call
    `shutdownLongLivedChildren()` immediately BEFORE `app.exit()`, after
    `await gogPresence.deletePresence()`. It must NOT run on the `response === 0` early-return —
    a cancelled quit tears nothing down. Add a short comment stating that this is the in-app
    quit path only and that the red-X/Cmd+Q path is covered by Layer B in `main.rs`, naming this
    quick task id.

    Registration site 1 — `helperProcess.ts`: in `spawnHelperIfNeeded()`, after
    `helperProcess = child` (:138), call `registerLongLivedChild('steam-bridge-helper', shutdownBridgeHelper)`
    and retain the returned unregister handle in module scope; call it from
    `shutdownBridgeHelper()` and clear it in `__resetBridgeHelperStateForTests()`.
    Then FIX the stale doc comment at :299-306: it currently claims teardown "from the
    main-process app-quit lifecycle (Task 3, `main.ts` before-quit)". Replace that clause with
    the truth — `main.ts` was deleted in the Phase 35 Tauri cutover and its `app.on('before-quit')`
    hook with it; teardown now runs via `registerLongLivedChild` from `handleExit()` (in-app quit)
    and via the Rust process-group reap on `RunEvent::Exit` (every other quit path). Keep the
    existing "no-op when no helper was ever spawned" sentence — it is still true and still useful.

    Registration site 2 — `gog/games.ts`: after the comet `spawn(...)` at :728-733, register
    `registerLongLivedChild('comet', () => child.kill())` and hold the unregister handle; call
    that handle inside the existing `if (child) { logInfo('Killing Comet!'); child.kill() }` block
    at :757-760 so the normal game-exit path deregisters rather than leaving a stale entry.
    Do NOT touch the `legendary|gogdl|nile` `killPattern` block in `handleExit` — explicitly out
    of scope (pre-existing, separately FIXME'd upstream).

    `platform/index.ts:415-421` — READ THE WHOLE BLOCK BEFORE EDITING. It is a CORRECTED (CR-04)
    block that already documents its own supersession; the false `main.ts` before-quit text is
    inside a quoted "previously asserted" passage. Do NOT delete the correction. Append a dated
    note that `src/backend/main.ts` itself no longer exists (deleted by the Phase 35 cutover) and
    that no `app.on('before-quit')` handler exists anywhere in the tree, so the quoted passage is
    stale in a SECOND way beyond the one CR-04 already recorded. Scope the note to this block; do
    not generalise.

    Then re-run the three gates as separate command invocations. EXPECTED at this point:
    Gates A and B GREEN; Gate C STILL RED (`configure_sidecar_process_group`, `libc::kill(`).
    **That partial state is evidence, not a problem** — it is the measured proof that Layer A
    alone does not fix the defect on the path that produced it. Record it verbatim.

    Commit with an explicit pathspec. Before committing, run `git status --porcelain` and confirm
    nothing unrelated is staged — commits in this repo absorb whatever is already staged
    (`gsd-sdk-commit-stages-entire-tree`), and `git commit --only` takes the WORKING TREE, not the
    index (`git-commit-only-defeats-rm-cached`). Message: `fix(260907-juv): ...`.
  </action>

  <verify>
    <automated>npx jest src/backend/sidecar/__tests__/appShellFlows.test.ts; npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts</automated>
    Both must now be GREEN with a nonzero test count. Separately run
    `npx jest src/backend/__tests__/quitTeardownWiring.test.ts` and confirm it is STILL RED on
    the Layer B assertions — capture that output. Then `pnpm codecheck` must exit 0.
  </verify>

  <done>
    `src/backend/longLivedChildren.ts` exists and is imported by `utils.ts`, `helperProcess.ts`
    and `gog/games.ts`. `shutdownBridgeHelper` has a production caller reachable without any
    test naming it. Gates A and B pass; Gate C still fails on Layer B only, with that output
    recorded. No comment in `src/backend/` still asserts a live `main.ts` before-quit hook.
    `pnpm codecheck` exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Layer B -- Rust process-group spawn and group reap; then the RED/GREEN proofs and commit ordering</name>
  <files>src-tauri/src/main.rs, src-tauri/Cargo.toml, .planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md</files>

  <action>
    Layer A cannot see the red-X / Cmd+Q / `osascript` quit path — that path never enters JS,
    and `Child::kill()` is SIGKILL, which is uncatchable. So the Rust exit path must reap the
    sidecar's DESCENDANTS, not just the sidecar.

    1. `src-tauri/Cargo.toml`: add `libc` as a direct dependency under a
       `[target.'cfg(unix)'.dependencies]` section. `libc 0.2.186` is ALREADY resolved in
       `src-tauri/Cargo.lock`, so this must add NO new crate. **HARD GATE:** after any cargo
       command, `git diff --exit-code src-tauri/Cargo.lock` must be clean. If the lockfile
       changes, STOP AND REPORT — a new crate entering the tree triggers the package-legitimacy
       protocol and also breaks `cargoFeatures.test.ts`'s `EXPECTED_LOCKFILE_CRATE_NAMES`
       (`expect(actual).toEqual(...)`, an exact-set pin).

    2. Add `fn configure_sidecar_process_group(cmd: &mut Command)` to `main.rs`. On unix it uses
       `std::os::unix::process::CommandExt::process_group(0)` (stable since 1.64;
       `rust-version = "1.77.2"`), putting the sidecar in its own process group whose pgid
       equals its pid. On non-unix it is a no-op. ONE helper, called from BOTH spawn sites —
       that shared helper is what makes the parity assertion (Gate C2) cheap and what makes a
       future third spawn site detectable.

    3. Call it at both sites. `spawn_sidecar_dev` (:8161) is a builder chain today — restructure
       it to `let mut cmd = Command::new(&node); ...; configure_sidecar_process_group(&mut cmd);
       let child = cmd.spawn();` preserving every existing arg/env/stdio and every `shell_diag`
       line. `spawn_sidecar_packaged` (:8207) already has `let mut std_command` — insert the call
       before `.spawn()`. Change nothing else at either site.

    4. Rewrite `SidecarState::shutdown_child()` (:1153) to reap the GROUP:
         - unix: read `child.id()` as the pgid, `libc::kill(-pgid, libc::SIGTERM)`, then a
           BOUNDED grace poll on `child.try_wait()` (the todo measured comet exiting 1s after a
           plain SIGTERM, so a ~2s budget in short sleep increments is ample), then
           `libc::kill(-pgid, libc::SIGKILL)` if it has not exited. Then `child.wait()`.
         - non-unix: a `#[cfg(not(unix))]` arm that keeps the existing `child.kill()` — Layer B
           must degrade safely on Windows, never regress the kill that is there today.
         - Keep the existing exit-path discipline VERBATIM: poisoned mutex recovered, every
           error logged and swallowed, never a panic. An unwind here is worse than a leak.
         - Update the WR-03 doc comment to describe the group reap. Do not let the comment claim
           anything the code does not do.
       Hazard: do not write an assertion target line beginning with `*` —
       `stripSourceComments` eats leading-`*` Rust deref lines.

    5. Build and prove: `cd src-tauri && cargo build` must succeed, then
       `git diff --exit-code src-tauri/Cargo.lock`. Note for the record that CI runs NO cargo
       step, so this build is local evidence only and the JS source pin is the actual gate.

    6. RUN ALL THREE GATES. All must be GREEN.

    7. THE PROOFS — hold the commit constant and vary the TREE. Never `git checkout --` (the
       repo's post-checkout hook fires and throws; `git-checkout-fires-post-checkout-hook`).
       Use `git show <sha>:<path> > <path>` to move between versions, and re-run jest as a
       SEPARATE command from every write.
         (a) LAYER-A-ALONE RED — already captured in Task 2 (Gate C red with Gates A/B green).
             Restate it in the SUMMARY as proof that Layer A alone is a false fix.
         (b) LAYER-B-ALONE RED — restore the pre-Task-2 versions of `utils.ts`,
             `helperProcess.ts` and `gog/games.ts` into the tree via
             `git show 32324f6ec:src/backend/utils.ts > src/backend/utils.ts` (and likewise for
             the other two), re-run Gates A and B, observe RED, then restore the fixed versions
             via `git show <task2-sha>:<path> > <path>`. Proof that Layer B alone is a false fix.
         (c) CALL-SITE-DELETION RED — with everything landed, delete ONLY the
             `shutdownLongLivedChildren()` line from `handleExit`, re-run Gate A, and confirm it
             fails with `Number of calls: 0` (not a module-resolution error). This is the
             non-vacuity proof the todo demanded: the gate must fail when the CALL SITE dies,
             which is precisely the failure mode that let defect 2 through. Restore afterwards
             and re-run to GREEN.
         (d) SPAWN-SITE-DELETION RED — delete `configure_sidecar_process_group(&mut cmd)` from
             ONE of the two spawn sites, re-run Gate C, confirm C2 reds naming that site.
             Restore and re-run to GREEN.
       Capture every one of these outputs verbatim. A gate that has never been seen failing is
       not a gate.

    8. COMMIT ORDERING. Commit the Layer B source change (`fix(260907-juv): ...`) and THEN the
       three gate files (`test(260907-juv): ...`), matching the repo's fix-then-gate precedent
       (quick 260907-j8n), so no commit in history is RED. `git status --porcelain` before each
       commit; explicit pathspecs only. Verify each commit's contents afterwards by diffing the
       committed blob against disk — `git add` fails ATOMICALLY on a nonexistent pathspec and
       stages NOTHING (`git-add-nonexistent-pathspec-stages-nothing`), so a green exit code does
       not prove the files landed.

    9. TODO DISPOSITION — append a dated disposition to
       `.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-...md`. It does
       **NOT** close. Both code defects are fixed and gated, but the todo's Verification
       Requirement #1 is a LIVE gate (launch a GOG game so comet spawns, quit via the red X,
       assert `pgrep -f comet` is empty; same for the Steam bridge helper) and that has not been
       run. Record it as an outstanding HUMAN-VERIFICATION item with the exact gesture, and set
       status accordingly rather than rounding an unrun gate to a pass.
       Also record the accepted limitation: putting the sidecar in its own process group means a
       `pnpm tauri:dev` Ctrl-C no longer reaches it via the terminal's foreground group, and if
       the dev shell is itself SIGKILLed `RunEvent::Exit` never runs — that dev-teardown orphan
       (project memory `tauri-dev-shell-does-not-reap-its-node-sidecar`) is PRE-EXISTING and is
       not made worse, but it is not fixed by this task either.
  </action>

  <verify>
    <automated>npx jest src/backend/__tests__/quitTeardownWiring.test.ts; npx jest src/backend/sidecar/__tests__/appShellFlows.test.ts; npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts; npx jest src/backend/__tests__/cargoFeatures.test.ts</automated>
    All four GREEN with nonzero test counts. Plus: `cd src-tauri && cargo build` exits 0;
    `git diff --exit-code src-tauri/Cargo.lock` exits 0; `pnpm codecheck` exits 0.
  </verify>

  <done>
    Both sidecar spawn sites set a process group via one shared helper; `shutdown_child()`
    SIGTERM-then-SIGKILLs the group with a bounded grace and still reaps the child, with a
    Windows arm preserving the existing kill. All four RED proofs — layer-A-alone,
    layer-B-alone, call-site deletion, spawn-site deletion — are recorded verbatim with the
    commands that produced them. Two commits landed in fix-then-gate order, contents verified
    by blob-vs-disk diff. The todo carries a dated disposition, stays OPEN pending its live
    gate, and names the accepted dev-teardown limitation.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Rust shell -> OS process signals | `libc::kill(-pgid, ...)` targets a process GROUP. A wrong sign or a pgid of 0/1 would signal the caller's own group or every process the user owns. |
| Sidecar -> spawned helpers | comet holds an ESTABLISHED authenticated GOG connection; the bridge helper holds a live Steam session. Both outlive the app today. |
| Cargo dependency graph | Adding a direct `libc` dependency touches the supply chain surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-juv-01 | Denial of Service | `shutdown_child()` group kill | mitigate | pgid is read from `child.id()` of a child spawned with `process_group(0)`, so pgid == that child's pid and can never be 0 or 1. Signal the negated pid only; never a literal or a computed group id. Guard the whole arm `#[cfg(unix)]`. |
| T-juv-02 | Denial of Service | `shutdown_child()` grace loop | mitigate | The grace poll is BOUNDED (~2s in short increments) and then escalates to SIGKILL. It must never loop unbounded on the exit path — a hung quit is a worse failure than a leaked helper. |
| T-juv-03 | Information Disclosure | comet's 22h ESTABLISHED authenticated GOG connection; the bridge helper's live Steam session | mitigate | This IS the defect being closed. Both layers verified by wiring assertions, not by direct-call unit tests. |
| T-juv-04 | Tampering | `shutdownLongLivedChildren()` dispose callbacks | mitigate | Each `dispose` runs in its own `try/catch` and the loop continues on throw, so one misbehaving registrant cannot strand the others on the quit path. Registry cleared after; idempotent. |
| T-juv-05 | Elevation of Privilege | Windows path | mitigate | `#[cfg(not(unix))]` arm retains the existing `child.kill()` verbatim. Layer B degrades; it never regresses the kill that ships today. |
| T-juv-SC | Tampering | cargo dependency (`libc`) | mitigate | `libc 0.2.186` is ALREADY resolved in `src-tauri/Cargo.lock`; declaring it directly must add NO new crate. Enforced by `git diff --exit-code src-tauri/Cargo.lock` plus `cargoFeatures.test.ts`'s exact-set `EXPECTED_LOCKFILE_CRATE_NAMES` pin. If the lockfile moves, STOP AND REPORT — the Package Legitimacy Gate protocol applies and no install proceeds without it. No npm/pip package is installed by this task. |
</threat_model>

<verification>
Run every jest command as its OWN invocation — a `<file write> && npx jest` reads a STALE tree.
Use explicit test paths, never `--selectProjects` (case-sensitive, can exit 0 selecting nothing).
A summary line reading `No tests found` is a FAILED verification.

    npx jest src/backend/__tests__/quitTeardownWiring.test.ts
    npx jest src/backend/sidecar/__tests__/appShellFlows.test.ts
    npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
    npx jest src/backend/__tests__/cargoFeatures.test.ts
    pnpm codecheck
    cd src-tauri && cargo build && git diff --exit-code src-tauri/Cargo.lock

Known-red-at-HEAD and NOT this task's scope (do not attempt to fix, do not claim as caused here):
`pnpm test:ci` exits 1 from a leaked 60s `rustInvoke('store_embed_open')` timer at
`src/backend/sidecar/sidecarRpc.ts:339`; `pnpm lint` sits at ~4188 warnings against a 4157
ceiling, so `.husky/pre-push` refuses every push. Commit locally; do not push.

Human verification (NOT a blocking task — documented for the todo's disposition):
1. Launch a GOG game so comet spawns (`pgrep -f comet` non-empty).
2. Quit GameLib with the red X (or Cmd+Q, or `osascript -e 'quit app "GameLib"'`) — NOT the
   in-app quit menu item, which exercises the Layer A path instead.
3. `pgrep -f comet` must be empty within a few seconds.
4. Repeat for the Steam bridge helper (`pgrep -f steam-bridge-helper`).
5. `lsof +D /Applications/GameLib.app` must be empty.
</verification>

<success_criteria>
- `src/backend/longLivedChildren.ts` exists; `shutdownBridgeHelper` and comet's teardown are
  both registered on it; `handleExit()` calls `shutdownLongLivedChildren()` before `app.exit()`
  and NOT on the cancelled-quit early return.
- `shutdown_child()` reaps the sidecar's process GROUP (SIGTERM -> bounded grace -> SIGKILL ->
  `wait()`) on unix, with the existing `child.kill()` preserved on Windows; both spawn sites
  configure the group through one shared helper.
- The gate set fails at 32324f6ec, fails with Layer A alone, fails with Layer B alone, fails
  when the `handleExit` call site is deleted, and fails when either spawn site drops the group
  helper — each proven by a recorded command and its verbatim output.
- No comment in `src/backend/` asserts a teardown wired to `main.ts`'s `app.on('before-quit')`.
- `pnpm codecheck` exits 0; `cargoFeatures.test.ts` green; `src-tauri/Cargo.lock` unchanged.
- The source todo carries a dated disposition, remains OPEN pending its live gate, and names
  the accepted `pnpm tauri:dev` Ctrl-C limitation.
</success_criteria>

<output>
Create `.planning/quick/260907-juv-fix-helper-process-orphan-on-app-quit-wi/260907-juv-SUMMARY.md` when done.
The SUMMARY must contain the verbatim RED output for all four proofs (at-HEAD, layer-A-alone,
layer-B-alone, call-site-deletion + spawn-site-deletion) together with the exact commands that
produced them. A SUMMARY that asserts the gates were RED without quoting them does not satisfy
this plan.
</output>
