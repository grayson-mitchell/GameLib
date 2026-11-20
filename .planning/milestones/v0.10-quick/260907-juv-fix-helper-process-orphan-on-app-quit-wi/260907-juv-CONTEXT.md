# Quick Task 260907-juv: Helper processes orphan on app quit - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning
**Source todo:** `.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md`

<domain>
## Task Boundary

Stop `comet` (GOG) and the Steam bridge helper from orphaning when GameLib quits.
Both are long-lived `child_process.spawn()` children of the **Node sidecar**.

IN SCOPE: one long-lived-child registry; both teardowns registered on it; the quit
wiring that reaches it; the two stale doc comments; a wiring assertion proven RED at HEAD.
OUT OF SCOPE: the `legendary|gogdl|nile` `killPattern` block inside `handleExit` (pre-existing,
separately FIXME'd upstream); the auto-updater; Windows job-object equivalents beyond parity.
</domain>

<decisions>
## Locked findings — ORCHESTRATOR-VERIFIED, do not re-derive

These were measured from source before planning. They **falsify the todo's own fix sketch**,
which said "find the surviving quit/teardown seam in the Tauri shell or sidecar bootstrap,
then register both teardowns there." There is no single such seam. There are TWO, and
**neither one alone fixes the observed defect.**

### F1. The sidecar dies by SIGKILL, so NO JavaScript teardown can ever run on the observed path

- `src-tauri/src/main.rs:9477` — `.run(|app_handle, event| { if let RunEvent::Exit = event { state.shutdown_child(); ... } })`
- `src-tauri/src/main.rs:1153-1176` — `SidecarState::shutdown_child()` calls `child.kill()` then `child.wait()`.
- Rust `std::process::Child::kill()` is **SIGKILL** on Unix. SIGKILL is uncatchable.
  A `process.on('SIGTERM')` handler in the sidecar would never fire on this path.
- Consequence: every `spawn()` grandchild (comet, bridge helper) is reparented to launchd/init
  and survives. This is exactly the 22h comet in the todo's evidence.
- `grep` for `SIGTERM|SIGINT|process.on('exit')|beforeExit` across `src/backend/sidecar/*.ts`
  returns **no shutdown handler at all** — consistent with F1: there would be no point.

### F2. `handleExit()` IS a live Node-side quit seam, but it is NOT on the observed quit path

- `src/backend/utils.ts:275` `async function handleExit()`, exported at `:1771`.
- Reachable from exactly two registrations:
  - `ipcMain.on('quit', () => handleExit())` in `appShellFlowRegistration.ts` (per the
    CR-04 comment at `platform/index.ts:415-421`)
  - `case 'ctrl+q': await handleExit()` in `shortcutsFlowRegistration.ts:299`
- It kills `legendary`, `gogdl`, `nile` by pattern — it does **not** know about `comet`
  or the bridge helper.
- It is NOT reached by red-X / Cmd+Q / `osascript` quit. Those go straight to
  `RunEvent::Exit` -> `shutdown_child()` (this is stated verbatim in `main.rs:9470-9475`
  and in the WR-03 doc comment at `main.rs:1153`). The todo's reproduction used
  `osascript`, i.e. the path that bypasses `handleExit` entirely.

### F3. The two dead/stale artifacts named by the todo, confirmed

- `src/backend/storeManagers/steam/bridge/helperProcess.ts:299-306` — the doc comment claims
  teardown "from the main-process app-quit lifecycle (Task 3, `main.ts` before-quit)".
  `main.ts` does not exist; `grep -rn "shutdownBridgeHelper" src/` finds callers ONLY in
  `__tests__/helperProcess.test.ts`. No production caller.
- `src/backend/platform/index.ts:415-421` — comment referring to the deleted before-quit hook.
  NOTE: this comment is a **CORRECTED** block that already documents its own supersession.
  Read it fully before editing; do not delete the correction, only the part that is now false.
- `src/backend/storeManagers/gog/games.ts:728-733` spawn, `:757-760` `child.kill()` — the kill
  is inside the same function AFTER `await runRunnerCommand(...)` resolves, so it is
  game-exit-scoped. Quit during play and it never runs.

### Required approach: BOTH layers. A single-layer fix is a false fix.

**Layer A (Node, graceful) — the registry the todo asked for.**
One module owning every long-lived child. `shutdownBridgeHelper()` and comet's teardown both
register there. Called from `handleExit()` so in-app quit is graceful. Node's
`child.kill()` defaults to SIGTERM, and the todo measured comet exiting 1s after a plain
SIGTERM — so graceful termination is known to work.

**Layer B (Rust, unconditional) — covers the path Layer A cannot see.**
The observed defect is on the red-X/Cmd+Q path, which never enters JS. `shutdown_child()`
must reap the sidecar's **descendants**, not just the sidecar. Two spawn sites to keep in
parity: `main.rs:8180` (dev) and `main.rs:8227` (packaged); neither sets a process group today.
`rust-version = 1.77.2`, so `std::os::unix::process::CommandExt::process_group` (stable 1.64)
is available. Reap the group (SIGTERM -> bounded grace -> SIGKILL) rather than the lone pid.
Layer B must degrade safely on Windows rather than regressing the existing kill.

**Why not Layer A alone:** it is unreachable on the path that produced the bug.
**Why not Layer B alone:** it leaves `shutdownBridgeHelper()` with no production caller and
its comment still asserting a wiring that does not exist — explicitly forbidden by the todo.
</decisions>

<verification>
## Verification requirements — inherited from the todo, NON-NEGOTIABLE

The todo states, correctly, that **a unit test calling the teardown directly CANNOT see this
defect** — that is precisely how `shutdownBridgeHelper()` stayed green with zero production
callers. Therefore:

1. **A WIRING assertion, not a behaviour assertion.** It must fail if the *call site* is
   deleted, not merely if the function misbehaves. Proving reachability-from-the-quit-path is
   the deliverable.
2. **Prove RED at HEAD before the fix.** Record the observed failure output. A gate that has
   never been seen failing is not a gate — see `.planning` precedent on tests that could not fail.
3. **Both directions.** Also prove the gate goes GREEN after, in the same commit-constant way.
4. Layer B needs its own coverage: assert the process-group/reap wiring exists at BOTH spawn
   sites, so adding a third spawn site or dropping the flag from one is caught.

Known local hazards to respect (from project memory):
- `jest.mock` / `--selectProjects` is case-sensitive and can exit 0 while selecting nothing.
- Hold the commit constant and vary the tree when proving RED (`git show <sha>^:file`),
  rather than `git checkout --` (the post-checkout hook fires and throws).
- A `&& npx jest` in the same command as a file write reads STALE.
</verification>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md`
- Prior art for the same shape: memory `initstoremanagers-dead-under-tauri` — a function that
  lost its call site in the Electron->Tauri migration while its tests stayed green.
</canonical_refs>
