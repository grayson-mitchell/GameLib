# Phase 72: Renderer trust boundary and process hardening - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 26 new/modified (grouped by research plan 72-01..72-09)
**Analogs found:** 24 / 26 (2 role-match only, 2 config-only with no repo analog)

Line numbers below were read this session. Where a line range is approximate it says so.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/workflows/rust-test.yml` (Linux leg) | config (CI) | batch | `.github/workflows/rust-test.yml` itself + `release-tauri.yml:232-238` apt step | exact |
| `.github/workflows/audit.yml` or `lint.yml` job (pnpm audit, cargo-deny) | config (CI) | batch | `rust-test.yml` job skeleton, `install-deps` action | role-match |
| `.github/dependabot.yml` | config | batch | none in repo | no analog |
| `src-tauri/deny.toml` | config | batch | none in repo | no analog |
| `package.json` overrides and deps | config | n/a | existing `pnpm.overrides` block | exact |
| `src-tauri/src/shell_open.rs` (NEW) | utility (pure policy) + request-response | request-response | `relay_commands.rs:171-221` `open_external_scheme_check` | exact |
| `src-tauri/src/store_embed.rs` `ShellOpenPath` / `ShellShowItemInFolder` arms | controller (arm) | request-response | same file, arms at ~2157-2177 | exact |
| `src/backend/sidecar/openPolicy.ts` (NEW) | utility (guard) | request-response | `src/backend/sidecar/rendererPathGuard.ts` | exact |
| `src/common/__fixtures__/openPolicyCases.json` (NEW) | test fixture | transform | no fixtures dir yet; idiom "read Rust const out of source" | partial |
| `src/backend/sidecar/__tests__/openPolicy.test.ts` (NEW) | test | request-response | `src/backend/__tests__/capabilitiesDefault.test.ts` (read-file-then-assert) | role-match |
| `src/backend/sidecar/shellFilesFlowRegistration.ts` | route (flow registration) | request-response | same file lines 148-158, 245-252 | exact |
| `src/backend/sidecar/appShellFlowRegistration.ts` (`openWebviewPage`) | route | request-response | same file | exact |
| `src/backend/utils.ts` (`openUrlOrFile`, `removeFolder`, `killPattern`, `handleExit`) | service | CRUD / event-driven | same file | exact |
| `src-tauri/capabilities/default.json`, `tauri.conf.json` | config | n/a | same file | exact |
| `src/backend/__tests__/capabilitiesDefault.test.ts` | test (source pin) | n/a | same file | exact |
| `src/backend/__tests__/tauriShellSource.test.ts` | test (source pin) | n/a | same file | exact |
| `src-tauri/src/main.rs` (opener Builder, `mod`, flag init, Job Object call) | config / wiring | n/a | `main.rs:783`, `:829-859` | exact |
| `src/frontend/index.tsx` (delegated link handler) | component (init) | event-driven | `initShortcuts` neighbour in same file | role-match |
| `src/backend/storeManagers/steam/tokenStore.ts` | service / model | CRUD | same file lines ~190-215 | exact |
| `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` | test | CRUD | same file (rewrite) | exact |
| `src-tauri/src/shell_state.rs` (`shutting_down`, `begin_shutdown`, job handle) | model (state) | event-driven | same file `shutdown_child` 60-125 | exact |
| `src-tauri/src/sidecar.rs` (`on_sidecar_eof`, job helper) | service | event-driven | same file, pure helpers 125-175 and EOF tail 545-549 | exact |
| `src/backend/sidecar/processGuards.ts` + `bootstrap.ts:815` | middleware (process guard) | event-driven | same file 238-308 | exact |
| `src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts` | test | event-driven | same file (fake EventEmitter harness) | exact |
| `src/backend/trackedChildren.ts` (NEW) | service (registry) | event-driven | `src/backend/longLivedChildren.ts` | exact |
| `src/backend/__tests__/trackedChildren.test.ts` (NEW) | test (spawn) | event-driven | `src/backend/__tests__/signMachOResources.test.ts:611-640` (`createFakeHomeProfile`) | role-match |
| `.planning/phases/72-.../72-UAT.md` | doc (UAT) | n/a | `.planning/phases/61-.../61-UAT.md`, `62-HUMAN-UAT.md` | exact |

## Pattern Assignments

### `src-tauri/src/shell_open.rs` (utility, request-response) - NEW

**Analog:** `src-tauri/src/relay_commands.rs` lines 171-221 (the scheme check) and 247-278 (test module).

**Module header convention** (`relay_commands.rs:1`; also `shell_state.rs:1`). Sibling modules use `use super::*;` and are declared in `main.rs` (`mod relay_commands;` at ~123, `mod shell_state;` ~129). Add `mod shell_open;` in the same block.

**Pure check pattern to copy** (`relay_commands.rs:187-221`):
```rust
pub(crate) const OPEN_EXTERNAL_ALLOWED_SCHEMES: &[&str] = &["https", "http", "mailto", "tel", "steam"];

pub(crate) fn open_external_scheme_check(url: &str) -> Result<(), String> {
    if OPEN_EXTERNAL_ALLOWED_EXACT_URLS.contains(&url) {
        return Ok(());
    }
    let scheme = url
        .split_once(':')
        .map(|(s, _)| s.to_ascii_lowercase())
        .ok_or_else(|| "open_external: rejected a URL with no scheme".to_string())?;
    if !OPEN_EXTERNAL_ALLOWED_SCHEMES.contains(&scheme.as_str()) {
        // Scheme name only, never the URL (T-28-04 convention).
        shell_eprintln!("[shell] open_external: rejected scheme '{scheme}'");
        return Err("open_external: scheme not allowed".to_string());
    }
    Ok(())
}
```
Copy: pure function, no `AppHandle`, error strings never contain the input (T-28-04), `shell_eprintln!` logs the category only. Write `open_path_policy_check(raw) -> Result<PathBuf, String>` the same way (research Evidence 3 gives the body). Hand the ORIGINAL path to the opener, validate on the canonical form.

**Command wrapper pattern** (`relay_commands.rs:~226-233`): check first, then act:
```rust
#[tauri::command]
pub(crate) fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    open_external_scheme_check(&url)?;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}
```
For the arms, the call is `check?` then `app.opener().open_path(path, None)` (arm at `store_embed.rs:~2170-2177`, currently unchecked) and the reveal arm at `~2157-2168` (keep `macos_finder_reselect_workaround` from `keyring_dispatch.rs:40`).

**Test module pattern** (`relay_commands.rs:247-278`):
```rust
#[cfg(test)]
mod relay_allow_list_tests {
    use super::*;
    #[test]
    fn ipc_contract_relay_rejects_unknown_channel() {
        assert!(relay_channel_verdict("definitelyNotAChannel").is_err());
        assert!(relay_channel_verdict("").is_err());
    }
    #[test]
    fn ipc_contract_relay_truncates_hostile_channel_name() { /* assert error is bounded, no control chars */ }
}
```
Name the Rust tests with a `shell_open` prefix so `cargo test --bin gamelib-shell shell_open` (the research quick command) selects them. Build filesystem cases (dir, file, `X.app` dir, symlink to `.app`, missing) in a tempdir inside the test.

---

### `src/backend/sidecar/openPolicy.ts` (utility, request-response) - NEW

**Analog:** `src/backend/sidecar/rendererPathGuard.ts` (whole file; header lines 1-58, functions 60-130).

**Imports and error-class pattern** (lines 60-70):
```typescript
import { resolve, relative, isAbsolute } from 'node:path'

/** Thrown when a renderer-supplied path resolves outside its declared root. */
export class PathContainmentError extends Error {}
export class PathShapeError extends Error {}
```
**Guard contract to copy** (lines ~88-130): `assertPlausibleAbsolutePath(candidate: unknown, context: string): void` throws `PathShapeError` (not a string, NUL byte, empty, not absolute after backslash-to-slash normalization, `..` SEGMENT). It is a gate, not a rewrite: callers forward the ORIGINAL string. Call `assertPlausibleAbsolutePath(path, 'openFolder')` first, then add the filesystem/bundle/UNC checks. Deliberately no character-class check (REQ-37-06 anti-pattern, header lines 49-56).

Mirror `OPEN_EXTERNAL_ALLOWED_SCHEMES` (Rust const above) in TS; the parity test reads the Rust const out of the source file (existing idiom, see source-pin tests below). Never log the path itself (T-34.6-32 / T-28-04); log a category only.

**Use site for the guards today**: the `installFlowRegistration.ts:70-79, 381-386, 500-510` calls (research cites them) are the model for calling a guard at the top of a registration and catching into the `logSendFailure` path.

---

### `src/backend/sidecar/shellFilesFlowRegistration.ts` (route, request-response)

**Analog:** same file, lines 148-158 and 245-252 (current state shown; these are the edit sites).

**Current send registration pattern** (lines 148-158):
```typescript
ipcMain.on('openExternalUrl', (_event: unknown, ...args: unknown[]) => {
  openUrlOrFile(args[0] as string).catch((error) =>
    logSendFailure('openExternalUrl', error)
  )
})

ipcMain.on('openFolder', (_event: unknown, ...args: unknown[]) => {
  openUrlOrFile(args[0] as string).catch((error) =>
    logSendFailure('openFolder', error)
  )
})
```
Keep the shape (`ipcMain.on`, `args[0]` cast, `.catch(... logSendFailure(name, error))`), but route `openExternalUrl` to the URL-only policy and `openFolder` to the folder policy. Errors go through `logSendFailure`, matching all neighbours. `showConfigFileInFolder` (:218-227) switches to the reveal path and adds `assertContainedPath(gamesConfigPath, `${appName}.json`, 'showConfigFileInFolder')`.

**`removeFolder` registration to DELETE** (lines 245-252):
```typescript
ipcMain.on('removeFolder', (_event: unknown, ...args: unknown[]) => {
  try {
    const [folderPath, folderName] = args[0] as [string, string]
    removeFolder(folderPath, folderName)
  } catch (error) { logSendFailure('removeFolder', error) }
})
```
Also delete the preload export (`src/preload/api/library.ts:3`), `shellFilesSyncArgs.removeFolder` in `src/common/types/ipc/shellFiles.ts:29`, the `meta/knip-baseline.txt:160` line, then `pnpm gen:ipc-contract`. Tests: `shellFilesFlows.test.ts`, `ipcSchemas/shellFiles.test.ts`, `rendererPathGuard.test.ts`.

---

### `src/backend/utils.ts` (service)

**Analog:** same file. Edit sites: `openUrlOrFile` :441-448, `handleExit` :321-333, `killPattern` :972-985, `removeFolder` :1490-1526, export at ~:1944.

**`killPattern` to DELETE** (lines 972-985): `spawnSync('pkill', ['-f', pattern])` / powershell `Stop-Process -name`. Replace each caller with `killTracked(...)`: `handleExit` (:326 loop over `['legendary','gogdl','nile']`, then `callAllAbortControllers()`), `sideload/games.ts:93`, `nile/games.ts:596`, `legendary/games.ts:1142`. Mocking tests: `downloadmanager/__tests__/utils.test.ts`, `__tests__/launcher_callRunner.test.ts`.

**`removeFolder` async replacement**: use `fs.promises.rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })`, no timer at all. Keep `resolveFolderToRemove` (`assertContainedPath(root, folderName, ...)` on the NAME). Caller `downloadqueue.ts:410` becomes `void removeFolder(...).catch(log)` because `cancelCurrentDownload` is synchronous.

---

### `src/backend/trackedChildren.ts` (service, event-driven) - NEW

**Analog:** `src/backend/longLivedChildren.ts` (sibling, same style).

**Header and import-budget convention** (lines 1-30): long doc comment naming the quick task and why, then an explicit "Import budget: `backend/logger` ONLY" line (must not import `backend/utils`, which will call it).
```typescript
import { logInfo, logWarning, LogPrefix } from 'backend/logger'

type LongLivedChildId = string
type Teardown = () => void
const registry = new Map<LongLivedChildId, Teardown>()
```
**Register-returns-unregister pattern** (lines 49-60):
```typescript
function registerLongLivedChild(id, teardown): () => void {
  registry.set(id, teardown)
  return () => {
    // Only clear the entry if it still points at THIS registration
    if (registry.get(id) === teardown) { registry.delete(id) }
  }
}
```
**Fan-out defensively** (lines ~64-80): each teardown invoked independently, one throwing must not stop the rest; no-op on empty registry. Copy for `killAllTracked()`.

Apply: `trackChild(child, {runner, key}) -> untrack`, auto-untrack on `'close'`/`'error'`; hook in `launcher.ts` `callRunner` after the spawn at :1868 (key = `abortId`/`appName`, explicit key for sideload native launches) and `runWineCommand` spawn at :1646 (`onSpawn(child)` hook exists). Windows: `taskkill /PID <pid> /T /F` (the tracked PID is powershell's, see `launcher.ts:1815-1830`). Do NOT use `detached: true` (anti-pattern: leaves the sidecar's process group, survives quit).

---

### `src/backend/__tests__/trackedChildren.test.ts` (test, event-driven) - NEW

**Analog:** `src/backend/__tests__/signMachOResources.test.ts:611-640`; also `src/backend/__tests__/fakeHomeIsolation.test.ts` (the enforcement test), `src/backend/engine/__tests__/engineDecision.test.ts`.

**Fake-HOME spawn pattern** (signMachOResources:61, 611-627):
```typescript
import { createFakeHomeProfile } from '../testUtils/fakeHomeProfile'
...
const profile = createFakeHomeProfile({ prefix: 'gamelib-macho-spawn-' })
try {
  const base: NodeJS.ProcessEnv = { ...process.env }
  if (!keepJestWorkerId) { delete base.JEST_WORKER_ID }
  const run = spawnSync(process.execPath, [...], { env: /* from profile */ })
```
Read the remainder of that function (lines 627-660) for how `profile.env` is passed and how cleanup is done before copying. Never hand-roll an `env` literal (repo convention, enforced by `fakeHomeIsolation.test.ts` for in-repo spawn sites). Use a fake `ChildProcess` EventEmitter for the pure registry cases and one real-spawn arm (`sleep 30`) under the fake HOME. Add a source-pin assertion that no `pkill` string remains in `src/backend`.

---

### `src/backend/sidecar/processGuards.ts` (middleware, event-driven)

**Analog:** same file, `installUncaughtExceptionGuard` lines 238-308 (the code being changed).

**Existing structure to preserve**: idempotent install flag, `target: NodeJS.EventEmitter = process` parameter for fake-emitter tests, synchronous re-entrancy depth counter (`uncaughtExceptionHandlerDepth`), two nested try blocks (message construction, then logging) so the guard cannot become a new crash, `stderr` only and never stdout (stdout carries RPC frames):
```typescript
target.on('uncaughtException', (error: unknown) => {
  if (uncaughtExceptionHandlerDepth > 0) { return }   // change: exit(1) here
  uncaughtExceptionHandlerDepth += 1
  try {
    let message = '[sidecar] uncaught exception: <unstringifiable error>'
    try { message = `[sidecar] uncaught exception: ${ error instanceof Error ? (error.stack ?? error.message) : String(error) }` } catch {}
    try {
      if (uncaughtExceptionLogSink === null) { process.stderr.write(`${message}\n`) }
      else { uncaughtExceptionLogSink(message) }
    } catch { try { process.stderr.write(`${message}\n`) } catch {} }
  } finally { uncaughtExceptionHandlerDepth -= 1 }
})
```
Change: add an injected `exit` parameter (default `process.exit`), await stderr write callback plus the sink promise under a bounded `Promise.race` with an `unref()`-ed cap timer, then `exit(1)`; widen the sink type to `void | Promise<void>` and make `bootstrap.ts:815` `return logError(...)`. Rewrite the header doctrine "NEITHER guard may EVER terminate the process" (lines ~21-24, ~249) for the uncaught half only; `installUnhandledRejectionGuard` (:104-135) stays log-only. Keep `installStdioErrorGuards` (:313-405).

**Test analog:** `src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts` Group 2b (around :412-760): uses a fake `EventEmitter` and a per-call fresh module load (`loadFreshProcessGuards()`-style helper) because of the module-scope singleton flag. Add cases: exit(1) called, sink awaited, never-resolving sink still exits within cap (jest fake timers), re-entry exits immediately. Existing Group 2b tests asserting "does not exit" must be rewritten.

---

### `src-tauri/src/sidecar.rs` + `src-tauri/src/shell_state.rs` (service/model, event-driven)

**Analog:** `sidecar.rs:125-175` pure `AppHandle`-free helpers (`shell_exe_env_value`, `app_root_env_value`) and their stated rationale, and the EOF tail at `:545-549`.

**Pure-seam doc pattern** (`sidecar.rs:127-130`): "Pure and `AppHandle`-free so it can be proven by `#[cfg(test)] mod tests` below -- a live spawn cannot be driven from a `#[test]`". Write `on_sidecar_eof<F: FnOnce()>(shutting_down: &AtomicBool, surface: F)` the same way, with tests: flag set means closure not called; flag unset means called once.

**EOF hook point** (`sidecar.rs:~545-549`):
```rust
// stdout has ended (EOF, or a read error such as a non-UTF-8 line), so no response can
// arrive any more. Fail every invoke still waiting instead of leaving it parked forever.
for (id, channel) in drain_pending_invokes(&state.pending, &state.abandoned) {
    shell_diag(&invoke_abandoned_message("sidecar exited", &id, &channel));
}
```
Call `on_sidecar_eof` right after this loop. Remember the loop also ends on `Err(_) => break` (non-UTF-8 line) so confirm death (`try_wait`) before claiming it.

**Dialog call to copy** (research cites `main.rs:46` `use tauri_plugin_dialog::{DialogExt, MessageDialogKind}` and `main.rs:834-841`): `app.dialog().message(..).kind(MessageDialogKind::Error).blocking_show()`; add `.buttons(MessageDialogButtons::OkCancelCustom("Restart","Quit"))`. Run on the reader's std thread, never the main thread. Restart = `app.restart()` (same as the `app_relaunch` arm `store_embed.rs:~2238`), anything else = `app.exit(0)`.

**Shutdown flag placement** - `shell_state.rs` `shutdown_child` (lines ~60-125): add `begin_shutdown()` as first statement; the Unix/Windows split is already in place:
```rust
#[cfg(unix)] { let pgid = child.id() as i32; unsafe { libc::kill(-pgid, libc::SIGTERM); } /* 2000 ms grace, try_wait loop, then SIGKILL */ }
#[cfg(not(unix))] { if let Err(e) = child.kill() { shell_eprintln!("[shell] sidecar kill() failed during exit shutdown (may have already exited): {e}"); } }
```
The Windows Job Object lands in the `#[cfg(not(unix))]` arm: `child.kill()` then drop the job handle. Mutex-poison recovery at the top of the function (`Err(poisoned) => poisoned.into_inner()`) is the pattern for the new fields. `SidecarState` is constructed only at `main.rs:859`.

**Job Object failure discipline**: log and continue, never `?`/panic, mirroring `main.rs:815-843` (`blocking_show` + `exit(1)`). Add feature `Win32_System_JobObjects` to the existing `[target.'cfg(windows)'.dependencies] windows-sys = "0.60"` in `src-tauri/Cargo.toml`.

---

### `src/backend/__tests__/tauriShellSource.test.ts` and `capabilitiesDefault.test.ts` (source pins)

**Analog:** both files themselves.

**Shell-source reader** (`tauriShellSource.test.ts:15-22`): use the shared reader, since `main.rs` was split into sibling modules:
```typescript
import {
  listTauriShellSourceFiles, GENERATED_MODULES, PRE_SPLIT_SIBLING_MODULES,
  readTauriShellFile, readTauriShellSource
} from 'backend/testUtils/tauriShellSource'
import { normalizeSourceWhitespace, stripSourceComments, stripTrailingLineComment } from '../testUtils/stripSourceComments'
```
Assert against COMMENT-STRIPPED source (header lines 8-12: prose quoting the needle would make the assertion self-satisfying). New pins: `begin_shutdown` called in the `AppExit`, `AppRelaunch`, `ExitRequested` arms and top of `shutdown_child`; `open_js_links_on_click(false)`; no `pkill` string. New `shell_open.rs` is automatically in scope (the reader discovers `.rs` files; check `PRE_SPLIT_SIBLING_MODULES` for new modules).

**Capability pin** (`capabilitiesDefault.test.ts:120-145`): read JSON, `stringPermissions(conf)`, `toContain`/find. Edit lines 132-138 to assert ABSENCE (`not.toContain('opener:default')`, `updater:default`, and no object entry with `identifier === 'shell:allow-execute'`) and keep `notification:allow-is-permission-granted`, `core:default`, `windows` equal `['main']`. Also add a `withGlobalTauri === false` assertion near `tauriConf.test.ts:165-172` (check that file for the comment prose to update).

---

### `src/backend/storeManagers/steam/tokenStore.ts` (service, CRUD)

**Analog:** same file lines ~190-215 (registry) plus the existing `TokenStore` interface.

**Registry to keep** (lines 196-215): `let activeTokenStore: TokenStore = new ElectronTokenStore()` becomes `= new UnconfiguredTokenStore()`; `setTokenStore` (logs `next.constructor.name` via `logInfo(..., LogPrefix.Steam)`) and `getTokenStore` unchanged. No env-var auto-selection (REQ-28-07/D-08 comment). `UnconfiguredTokenStore`: `isAvailable()` false, `getToken()` `''`, `readToken()` `{status:'unreadable', reason:'unavailable'}`, `setToken()` throws, `clearToken()` no-op plus `logWarning`. Delete `ElectronTokenStore`, `encryptToken/decryptToken/encryptionAvailable`, `safeStorage` import; keep `clearOrphanedElectronToken`.

**Test:** `__tests__/tokenStore.test.ts` header (lines 1-30) declares the plaintext fallback "DELIBERATE, do not remove": rewrite the header and assertions. Its mock boundary list (backend/platform `safeStorage`, `backend/logger`, `../stores` configStore, steam-session/steam-user/graceful-fs stubs) is the template for the new fail-closed tests. Suites hitting `getTokenStore()` unseeded (`electronUntouched`, `user`, `credentialsMissing`, `steamStartupKeyringDeferral`) get a shared `beforeEach(() => setTokenStore(fakeStore))`.

---

### CI: `.github/workflows/rust-test.yml` (config, batch)

**Analog:** the file itself plus `release-tauri.yml:232-238`.

**Matrix and step to edit** (`rust-test.yml` jobs block):
```yaml
jobs:
  cargo-test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]      # add ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/install-deps
```
**Apt step to copy verbatim** (`release-tauri.yml:~234-238`):
```yaml
      - name: Install Ubuntu system dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils
```
Change the guard to `if: runner.os == 'Linux'` (rust-test uses `runner.os`, the existing clippy steps use `if: runner.os == 'macOS'`, so Linux already skips clippy). Insert directly after checkout and before `install-deps` (release does it before install-deps too). Add `cargo check --all-targets` (shell: bash, working-directory: src-tauri) before `cargo test --bin gamelib-shell`; give the test step `continue-on-error: true` initially. Keep new steps contiguous and commented to ease the merge with the parallel clippy-Windows branch (it edits the same matrix line and file tail).

The placeholder-externalBin node script already derives the triple from `rustc -vV` and works on Linux (no change). The long header comment, caveat (a) ("No Linux leg"), must be rewritten; caveat (g) mentions "no Linux leg" for the scanner crates too.

**New audit jobs** (new `audit.yml` or in `lint.yml`): copy the trigger/permissions/concurrency block from `rust-test.yml` lines 1-22 (`permissions: contents: read`, `on: push/pull_request/workflow_dispatch`, `concurrency` group with `cancel-in-progress`). Do not add a `paths:` filter (the file's comment at lines 9-12 explains why a required check must not be path-filtered). Use `actions/checkout@v6` and `pnpm/action-setup@v4` to match `.github/actions/install-deps/action.yml`. State what the gate does not catch in a header comment (repo rule; advisory DB moves daily so the job can go red with no repo change).

---

### `.planning/phases/72-.../72-UAT.md` (doc)

**Analog:** `.planning/phases/61-unified-macos-engine-for-all-stores/61-UAT.md` (frontmatter + "How to run" + `## Tests`); `62-HUMAN-UAT.md` for `### N.` headings.

**Item shape** (61-UAT.md lines 25-35):
```markdown
---
status: ...
phase: 72-renderer-trust-boundary-and-process-hardening
source: [72-0N-PLAN.md, ...]
---

## Tests

### 1. Legacy shared-bottle game unchanged

expected: (D-02, D-05, D-08) ...
result: pending
```
Rules (CLAUDE.md): `### N.` at column 0; `expected:` inline; `result:` opens with a bare or bracketed status word (`pending`, `pass`, `fail`, `skipped`), prose only after it. Items needed: (1) macOS: Cmd+Q, tray Quit, red X raise no dialog, then `kill -9` the sidecar PID raises the Restart/Quit dialog (D-01/D-03); (2) live `pnpm tauri:dev` boot after capability trim, a `target=_blank` link in `ChangelogModal` and a game changelog opens, locales load, router works (D-10/D-19; use `pnpm tauri:dev`, never `tauri:dev:run`; restart dev if sidecar code changed); (3) Windows PC Job Object: launch, start legendary/gogdl, quit, Task Manager shows no child; second arm end the shell process (D-20). Per the offline-UAT memory note, only add network-off steps at the action itself.

---

## Shared Patterns

### Never put the input in an error or log line
**Source:** `src-tauri/src/relay_commands.rs:206-221` (T-28-04); `rendererPathGuard.ts` header (T-34.6-32).
**Apply to:** `shell_open.rs`, `openPolicy.ts`, `removeFolder` helper, the sidecar early-reject. Log the scheme name or a category only; error strings are fixed literals.

### Pure function plus `#[cfg(test)]` seam for anything an event loop would otherwise hide
**Source:** `sidecar.rs:125-175`, `relay_commands.rs:199`, `247-278`.
**Apply to:** `open_path_policy_check`, `on_sidecar_eof`, `begin_shutdown`, Job Object creation helper split into a testable part.

### Source-pin tests over comment-stripped Rust source
**Source:** `src/backend/__tests__/tauriShellSource.test.ts:1-50`, `src/backend/testUtils/tauriShellSource.ts`, `stripSourceComments.ts`.
**Apply to:** shutdown-flag call sites, opener Builder switch, no-`pkill`, parity read of `OPEN_EXTERNAL_ALLOWED_SCHEMES`.

### Gate-not-rewrite renderer path guards
**Source:** `src/backend/sidecar/rendererPathGuard.ts` (`assertPlausibleAbsolutePath`, `assertContainedPath`).
**Apply to:** `openFolder`, `showConfigFileInFolder`, `removeFolder` helper arg. Guards throw typed errors; callers catch into `logSendFailure(name, error)` in flow registrations. Do not use `defaultInstallPath` as a containment root (circular, `installFlowRegistration.ts:70-79`).

### Spawns in tests use the fake-HOME helper
**Source:** `src/backend/testUtils/fakeHomeProfile.ts:192` (`createFakeHomeProfile`), `signMachOResources.test.ts:611-640`, enforced by `fakeHomeIsolation.test.ts`.
**Apply to:** `trackedChildren.test.ts` real-spawn arm and any new test that spawns a child.

### Sidecar exit contract
**Source:** CLAUDE.md convention, `longLivedChildren.ts` (no timers), `processGuards.ts` cap timer.
**Apply to:** the bounded-flush cap timer must be `unref()`-ed; the fatal `exit(1)` is the one sanctioned explicit exit (document it); no unbounded boot work; `trackedChildren` must create no timers or handles that hold the loop open. `pnpm smoke:sidecar` does not cover slow exit.

### Gates that fail on removal
**Source:** `meta/knip-baseline.txt` (knip ratchet fails on a vanished finding), `pnpm check:ipc-contract`, `pnpm boundaries`, `meta/clippyRatchet.cjs` (equality ceiling on macOS).
**Apply to:** the `ipc_handler.ts` deletions, `removeFolder` channel removal, new Rust code (must not add clippy warnings), plus `npx prettier --check` scoped over exact written paths in every `<verify>` (check `--file-info` first; omit if all paths are ignored).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.github/dependabot.yml` | config | batch | No Dependabot config exists (`.github/` has FUNDING.yml, ISSUE_TEMPLATE, actions, workflows only). Use the research Code Examples block (`open-pull-requests-limit: 0`, npm `/`, cargo `/src-tauri`). |
| `src-tauri/deny.toml` | config | batch | No cargo-deny config in the repo. Use research Evidence 10 (advisories only; 0.20 removed `vulnerability`/`severity-threshold`; four reasoned `zip` ignores; `unmaintained`/`unsound = "workspace"`). |
| `src/common/__fixtures__/openPolicyCases.json` | fixture | transform | `src/common/__fixtures__/` does not exist and no Rust-reads-JSON fixture precedent was found. Closest idiom: Phase 67 `genIpcContract` single-source (research Pattern 2). Rust side uses `include_str!` plus `serde_json`; `serde_json` is already used in `sidecar.rs` frames. |

## Planner notes (conflicts and gotchas surfaced while mapping)

- Post-research amendment D-09 (delete the renderer `removeFolder` channel) is already in CONTEXT; the registration and tests listed under `shellFilesFlowRegistration.ts` follow it. Not `assertContainedPath` against install roots.
- `open_external_scheme_check` is at `relay_commands.rs:204`, not ~173; the doc comment starts earlier. `shell_open_path` lives in `store_embed.rs` (arms ~2157-2177).
- `main.rs` is already split into sibling modules (`mod sidecar; mod shell_state; mod relay_commands; ...` at lines ~118-129). New `shell_open.rs` needs a `mod shell_open;` line there and `use super::*;`.
- `rust-test.yml` and `src-tauri/src/main.rs` are touched by several plans (72-01, 04, 05, 07, 09); sequence per the research wave table.
- `tokenStore.test.ts` header explicitly says "do not remove" the plaintext assertion; D-12 reverses it, so rewrite the header, not just the cases.

## Metadata

**Analog search scope:** `src-tauri/src`, `src-tauri/capabilities`, `src/backend` (sidecar, storeManagers/steam, testUtils, `__tests__`), `.github/workflows`, `.planning/phases/*UAT.md`
**Files scanned:** about 25 read or excerpted, plus targeted greps
**Pattern extraction date:** 2026-11-08
