# Phase 82: Guardrails, hygiene and shared safety primitives - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 22 (new or modified)
**Analogs found:** 20 / 22

All analog paths below are git-tracked source (checked via `git ls-files` on the priority analogs; none sit under a gitignored `.gsd/capabilities` mirror).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src-tauri/crates/gamelib-safety/Cargo.toml` | config | n/a | `src-tauri/crates/gamelib-scan/Cargo.toml` | exact |
| `src-tauri/crates/gamelib-safety/src/lib.rs` + `dispatch.rs` (`OPS`, `dispatch`, `parse_args`) | service (Tauri-free crate) | request-response | `src-tauri/crates/gamelib-scan/src/lib.rs` (OPS + `parse_args`), `gamelib-steampoll/src/dispatch.rs` | exact |
| `gamelib-safety/src/{tri,safe_path,remove}.rs` | utility | transform / file-I/O | `gamelib-steampoll/src/acf_copies.rs` (`guard_install_root` :277, `remove_copy` :326, `UNKNOWN_CONFLICT`) | role-match |
| `gamelib-safety/tests/adversarial.rs` | test | file-I/O | `gamelib-steampoll/tests/*` plus `acf_copies.rs` unit tests | role-match |
| `src-tauri/crates/gamelib-testutil/` (`FakeHome`) | utility (test helper) | file-I/O | `src/backend/testUtils/fakeHomeProfile.ts:192` (TS twin); `gamelib-steampoll/src/testing.rs` (in-crate helper shape) | role-match |
| `src-tauri/src/safety_dispatch.rs` | controller (shell arm) | request-response | `src-tauri/src/scan_dispatch.rs` | exact |
| `src-tauri/src/rust_dispatch.rs`, `ipc_contract.rs` (variant + name map) | route/config | request-response | the `scan_*` and `steampoll_*` entries (`ipc_contract.rs:307-312`, `:480`, `rust_dispatch.rs:76`) | exact |
| `src-tauri/Cargo.toml` (dep line 16, workspace members ~448) | config | n/a | `gamelib-scan` entries | exact |
| `src/backend/__tests__/cargoFeatures.test.ts` (`EXPECTED_LOCKFILE_CRATE_NAMES`, :217) | test | n/a | same list, add `gamelib-safety`, `gamelib-testutil`, `unicode-normalization` | exact |
| `src/common/types/sidecarTransport.ts` (`RUST_SAFETY_CHANNELS`) | config | n/a | `RUST_STEAMPOLL_CHANNELS` (:1152) | exact |
| `src/backend/__tests__/safetyChannelParity.test.ts` | test | n/a | `src/backend/__tests__/steamPollChannelParity.test.ts` | exact |
| `src/backend/safety/rustSafety.ts` (one adapter, rejection -> `unknown`) | service | request-response | `src/backend/scanners/rustScan.ts` (`invokeScan`) + `acfState.ts removeCopyViaRust` catch -> "install state unknown" | exact |
| `src/backend/safety/knownInstalls.ts`, `refusal.ts` | service | request-response | `src/backend/sidecar/readOnlyStoresNotice.ts` (push helper, no timers) | role-match |
| `src/common/types/removalRefusal.ts` (closed-set reasons) + `ipc` schema entry | model/config | event-driven | `src/common/types/readOnlyStores.ts`; schema at `src/common/types/ipc/appShell.ts:101`; preload slot `src/preload/api/settings.ts:11` | exact |
| `src/frontend/state/RemovalRefusedNotice.ts` + `components/UI/RemovalRefusedNotice/` | store + component | event-driven | `src/frontend/state/ReadOnlyStoresNotice.ts`, `components/UI/ReadOnlyStoresNotice/index.tsx`; `SteamRequestNotice.ts` (per-game payload) | exact |
| `src/backend/utils/uninstaller.ts` (pre-flight before `game.uninstall`, `removePrefix`) | service | CRUD (delete) | itself, `:120-190` (refused/failed early-return with `done`) | exact |
| `gog/games.ts:1168,1180`, `sideload/games.ts:150-156`, `steam/gameUninstall.ts:309,903`, `cancelDelete.ts:225`, `bridgeBottleLifecycle.ts:222`, `utils.ts:385 resetHeroic` | service (modify) | CRUD (delete) | `gameUninstall.ts` `uninstallBottleGameDirectly` (refusal + explicit `done`) | role-match |
| Census gates (`ipcDomainCensus`, `flowRegistrationCensus`, `phase70PassthroughCensus`, `moduleStateCensus`, `*PortComplete`, `appShellImportGate`, `gameDetailsImportGate`, `bridgeCensus`) | test | transform | `meta/__tests__/rendererZodGuard.test.ts:214` ("scan is not vacuous"); `steamPollChannelParity.test.ts:36-41` (empty-extractor must throw) | exact |
| `src/backend/testUtils/censusFloor.ts` | utility | transform | `rendererZodGuard.test.ts` floor assertion | role-match |
| `src-tauri/crates/README.md` rules section | doc | n/a | existing sections 10-12 ("worked example" prose) | role-match |
| `.planning/phases/82-.../82-TEST-LEDGER.md` | doc | n/a | `.planning/milestones/v0.10-phases/78-verification-records-and-test-health-after-v0-9/78-TEST-HEALTH.md` | exact |
| `.github/workflows/rust-test.yml` (new first step for new crates) | config | n/a | step at `:114-117` | exact |
| Inventory / state-ownership table docs | doc | n/a | none | no analog |

## Pattern Assignments

### `gamelib-safety` crate (`lib.rs`, `dispatch.rs`) (service, request-response)

**Analog:** `src-tauri/crates/gamelib-scan/src/lib.rs`

**Cargo.toml** (gamelib-scan, whole file): copy verbatim, then add `unicode-normalization = "0.1"`, `dunce = "1"`, a `gamelib-testutil` dev-dep, and a `[target.'cfg(windows)'.dev-dependencies] junction = "2"` (per RESEARCH). Keep `rust-version = "1.77.2"` and the `[lints.clippy] dbg_macro/todo = "deny"` block.

**OPS + args pattern** (lib.rs 15-60):
```rust
/// Ops reachable from the sidecar. Keep sorted.
pub const OPS: &[&str] = &["scan_contained_real", /* ... */];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContainedRealArgs { path: String, root_dir: String }

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 { return Err(bad()); }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}
```
Contract (steampoll lib.rs header): "results, not errors"; `dispatch` returns `Err` only for bad args, an unknown op, or a panic (`{op}:panic`). Logging rule T-28-04: log kind/counts only, never paths that carry a user name. Name ops `safety_check_removal` and `safety_remove_tree` (RESEARCH). Expose the API so Phase 83 can re-home the module into `gamelib-core` unchanged (D-07).

### `gamelib-safety/src/{tri,safe_path,remove}.rs` (utility, transform / file-I/O)

**Analog:** `src-tauri/crates/gamelib-steampoll/src/acf_copies.rs` (`guard_install_root` :277, `remove_copy` :326 with `remove_dir_all` :405, `Absent` and `UNKNOWN_CONFLICT`). It already refuses a symlink root (D-21: it keeps doing so; do not change it). Read lines 270-420 when writing the plan action. Tri-state/`Probe<T>` skeleton is in RESEARCH "Pattern 1" (Kleene `and`, `allows()`, `NotFound` -> `Absent`, other io errors -> `Unreadable`). The TS precedent for tri-state is `src/backend/storeManagers/steam/library/acfState.ts:53` (`readAcfState` unknown state; 75 WR-01 refusal).

Windows rule (CONTEXT): build expected paths segment by segment, never `join("a/b")`.

### `gamelib-safety/tests/adversarial.rs` (test, file-I/O)

**Analog:** tests under `gamelib-steampoll/tests/` (note `tests/adoption.rs:1528` currently trips the macOS clippy `deprecated` ratchet; fix it per D-20, do not copy `fetch_update`). Rows: nested installdir, `.\x`, `C:\x`, UNC, symlink, junction (`junction` crate on Windows), case, NFC/NFD, sideload shared-folder (D-22). Use `FakeHome` for every fixture.

### `gamelib-testutil` `FakeHome` (utility, file-I/O)

**Analog:** `src/backend/testUtils/fakeHomeProfile.ts:192-225`

```ts
const root = mkdtempSync(join(parent, options.prefix ?? 'gamelib-fakehome-'))
chmodSync(root, 0o700)   // tempfile::tempdir() is NOT 0700: set it explicitly
const env = {
  HOME: root, USERPROFILE: root,
  APPDATA: join(root, 'AppData', 'Roaming'), LOCALAPPDATA: join(root, 'AppData', 'Local'),
  XDG_CONFIG_HOME: join(root, '.config'), XDG_STATE_HOME: join(root, '.local', 'state'),
  XDG_DATA_HOME: join(root, '.local', 'share'), XDG_CACHE_HOME: join(root, '.cache')
}
```
Rust twin: fresh per call, same eight env keys, `root`, `env()`, `child_env()`, drop = remove. If a `testing` feature on the safety crate is chosen instead, the in-crate precedent is `gamelib-steampoll/src/testing.rs` (`//! Fakes for ...`, `pub mod testing` behind a feature).

### `src-tauri/src/safety_dispatch.rs` (controller, request-response)

**Analog:** `src-tauri/src/scan_dispatch.rs` (whole file, 37 lines)

```rust
use super::*;
pub(crate) fn rpc_scan_contained_real(args: &[Value]) -> Result<Value, String> {
    ScanContainedRealArgs::from_args(args)?;
    gamelib_scan::dispatch("scan_contained_real", args)
}
```
Wire-up checklist (each step has an exact existing line to copy): `ipc_contract.rs` name->variant map (:307-312) and variant->name (:431+); `rust_dispatch.rs:76` arm `RustInvokeChannel::X => rpc_x(args)`; `src-tauri/Cargo.toml` dep (:16) and workspace members (:448-449); `main.rs:4372` `scan_channels_are_gamelib_scan_app_ops` style unit test (asserts OPS membership and that an empty-arg dispatch errs). The shell regex in the parity test requires exactly `RustInvokeChannel::Foo => rpc_foo(args)` and `gamelib_safety::dispatch("foo", args)` literal.

### `src/backend/__tests__/safetyChannelParity.test.ts` (test)

**Analog:** `src/backend/__tests__/steamPollChannelParity.test.ts` (lines 11-69). Copy `extractOps`, `snakeToPascal`, the anti-vacuity case (`expect(OPS).toHaveLength(N)` plus `expect(() => extractOps('nothing here')).toThrow('OPS not found')`), the channels-equal-OPS case, the "on the rustInvoke allowlist" case, and the shell-arm regex case. Add `RUST_SAFETY_CHANNELS` next to `RUST_STEAMPOLL_CHANNELS` (`sidecarTransport.ts:1152`) and include it in `RUST_INVOKE_CHANNELS`. Also update `EXPECTED_LOCKFILE_CRATE_NAMES` (`cargoFeatures.test.ts:217`, alphabetical list) in the same commit as `Cargo.lock`.

### `src/backend/safety/rustSafety.ts` (service, request-response)

**Analog:** `src/backend/scanners/rustScan.ts` (whole file)

```ts
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
export function invokeScan<C extends RustScanChannel>(deps, channel: C, args) {
  return deps.requestRustInvoke(channel, [args] as RustInvokeArgsOf<C>) as Promise<...>
}
```
Differences required by D-06: wrap in try/catch and validate the reply shape, mapping any rejection or malformed reply to `{ overall: 'unknown' }` (full sketch is RESEARCH "Pattern 2"). Keep the file's "Exit contract: no timers, no handles, no work at import" header (sidecar convention). Tests inject a fake `RustInvokeDeps`, never `jest.mock` (the `backend-di-ceilings` jestMock ratchet has no headroom for new mocks). One injected-rejection test per guard (D-12), each asserting refusal and that nothing was deleted.

### Refusal notice: backend push, schema, store, component

**Backend push analog:** `src/backend/sidecar/readOnlyStoresNotice.ts` (small helper taking a `SendFrontendMessage`, no timers). Per-game steam precedent: `gameUninstall.ts:217` `steamGame.deps.sendFrontendMessage('steamRequestNotice', {...})`. `steamRequestNotice` is Steam-only and numeric-appId-only, so a new generic channel is needed.

**Schema/closed set analog:** `src/common/types/readOnlyStores.ts` (`READ_ONLY_REASONS = [...] as const` + payload type), schema entry `src/common/types/ipc/appShell.ts:101` (`z.tuple([...])`), and preload slot `src/preload/api/settings.ts:11`:
```ts
export const handleReadOnlyStoresNotice = frontendListenerSlot('readOnlyStoresNotice')
```
Payload: `{ appName, runner, title, reason (closed set), failedCheck (closed set), otherTitle? }`. Never send paths or raw error text (logSecretGate).

**Renderer store analog:** `src/frontend/state/ReadOnlyStoresNotice.ts`: zustand `create`, a standalone `handle...Signal(_e: IpcRendererEvent, payload: unknown)` that drops anything not in the closed set (T-68-25), wired in `initStateSubscriptions.ts`.

**Component analog:** `src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx` (`useTranslation('gamelib')`, `renderNoticeSlot`, `useNoticePhaseFallback`, `useSuppressStoreEmbedWhile`, `faTriangleExclamation`, `NoticePhase` in/leaving/collapsing). The ONE difference: D-13 wants an error that auto-hides like the stack's other toasts; ReadOnlyStoresNotice deliberately does NOT auto-hide (D-15 there). Use `ThemeSaveFailedNotice/index.tsx` or `SteamEngineLaunchNotice/index.tsx` as the auto-hide template instead. i18n: add keys to `public/locales/en/gamelib.json`, run `i18n --fail-on-update`. Tests mirror `src/frontend/state/__tests__/ReadOnlyStoresNotice.test.ts` and `NoticeStack/__tests__/NoticeStack.test.tsx`; new notice SCSS must satisfy `noticeStackStylesheetGate.test.ts` and `themeTokens`.

### `src/backend/utils/uninstaller.ts` and per-store delete sites (service, delete)

**Analog:** `uninstaller.ts:120-190` `uninstallGameCallback`. Refusal pattern to copy at each pre-flight (lines ~143-155):
```ts
if (result?.refused) {
  logInfo(`Uninstall refused; keeping settings for ${runner} ${appName} (stderrLength=${result.stderr.length})`, LogPrefix.Backend)
  sendGameStatusUpdate(deps, { appName, runner, status: 'done' })
  return
}
```
Insert the D-14 pre-flight (`checkRemoval`) after the `uninstalling` status send and before `game.uninstall`; on non-`yes`: push the refusal notice, log the guard name, send `done`, return. Note the order hazards listed in RESEARCH rows 3 and 4: GOG `array.splice` and sideload `libraryStore.set` must move AFTER the guard. `removePrefix(...)` at `:182` is currently not awaited and runs after the install delete; replace with the guarded call. `resetHeroic` (`utils.ts:385`) must become async and skip the relaunch timer on refusal; it is registered as a send at `sidecar/shellFilesFlowRegistration.ts:294-304`, so the notice is its only feedback.
Keep `steam/gameUninstall.ts` under the 1000-line `steam-line-ceiling` (931 lines now): put new logic in `src/backend/safety/`.

### Census gates (test, transform)

**Analog:** `meta/__tests__/rendererZodGuard.test.ts:214-221`
```ts
test('scan is not vacuous', () => {
  expect(renderer.length).toBeGreaterThan(50)
})
```
and the extractor negative control, `steamPollChannelParity.test.ts:36-41`: `expect(() => extractOps('nothing here')).toThrow('OPS not found')`. For D-05 each gate gets (a) the floor and (b) a deliberate empty-input test. Pattern per RESEARCH matrix: extract a pure helper (`assertAtOrAboveFloor(label, scanned, floor)` in `src/backend/testUtils/censusFloor.ts`, throws naming the label), parametrise the dir reader (`registrationFiles(dir = SIDECAR_DIR)`, `census(root)`, `walk(dir)`), then `expect(() => assertAtOrAboveFloor('x', 0, 22)).toThrow()` and a truncated case. Existing floors to keep: `ipcDomainCensus` 22 files / 296 total / `>=284`; `flowRegistrationCensus` `>150`, `>=15`, `>=19`. Raise the weak `>0` floors in `appShellImportGate` and `gameDetailsImportGate` to measured values. Never lower a floor.

### `82-TEST-LEDGER.md` (doc)

**Analog:** `78-TEST-HEALTH.md` (at `.planning/milestones/v0.10-phases/78-verification-records-and-test-health-after-v0-9/`). Sections to copy: `## Proof head` (sha plus "measured from a clean `git worktree add --detach` checkout"), run counts line (`Test Suites: N failed, N skipped, N passed, ...; Tests: ...`), an attribution table (`| Suite | Red at | First green | Cause | Pair observed |`), and a `## Lint and ratchets` table (`| Check | Result |`). Add the per-suite verdict column (fixed + commit, or retired + approval date, D-04), the skipped-suite list with reasons, the CI-only reds, the D-19 move of `legendary/commands/*` and type-only files to Phase 91, and the D-21 note that `guard_install_root` keeps refusing a symlinked root while `gamelib-safety` unlinks. Worktree needs its own `pnpm install --frozen-lockfile`; a symlinked `node_modules` produced 53 false reds.

## Shared Patterns

### Rejection reads as Unknown (fail closed)
**Source:** `acfState.ts` (`removeCopyViaRust` catch -> "install state unknown") and the new `rustSafety.ts`
**Apply to:** every guarded TS call site; only the adapter has a `catch`, call sites branch on `verdict`.

### Tauri-free crate recipe
**Source:** `src-tauri/crates/README.md` sections 1-4 and 8 (layout, library contract, app path, CI), worked examples 10-12
**Apply to:** `gamelib-safety`, `gamelib-testutil`. Add the D-08 rules section: "destructive guards refuse on Unknown; readers distinguish absent from could-not-read" and "one shared `safe_path`; never derive a trust root from the data being validated". Include the D-21 symlink-root contrast.

### Fake HOME isolation
**Source:** `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts:192`) for TS; Rust `FakeHome` for crates
**Apply to:** any new test spawning a child or touching HOME-relative paths (conventions skill: never a hand-rolled `env` literal).

### Sidecar exit contract
**Source:** `rustScan.ts` / `readOnlyStoresNotice.ts` headers
**Apply to:** all new `src/backend/safety/*.ts` (no timers, no handles, no work at import).

### Never widen a ceiling
**Source:** CONTEXT D-03, 78-TEST-HEALTH. New tests use injected fakes, not `jest.mock`; knip baseline is lowered in the same commit as each dead-export deletion.

### CI ordering
**Source:** `.github/workflows/rust-test.yml:114-117`, a single `cargo test -p ... -p ...` step. Add `gamelib-safety` and `gamelib-testutil` as their OWN earlier step (or `--no-fail-fast`) so the red Windows `gamelib-depot` `tests/fetch.rs` cases cannot mask D-18's proof. Update the crate list in the comment at `:70` too.

### Verify blocks
**Source:** `Skill("gamelib-conventions")`: `<verify>` runs `npx prettier --check` over exact written paths (check `--file-info` first; omit if all are ignored).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `utils.ts`/`bootstrap.ts` responsibility inventory | doc | n/a | No existing inventory; the structural doc `.planning/research/ARCHITECTURE.md` is pre-Tauri, use it for scope only |
| Milestone-wide state-ownership table | doc | n/a | New artifact; planner defines format (one owner per store per slice boundary, sequenced so no owner moves twice) |

Dead-code deletions (`fileStore.ts`, `proxy-types.ts`, knip-baseline exports, `CI=e2e` `*/e2eMock.ts`) need no analog; the template is the commit that lowers `meta/` knip baseline alongside each deletion (`knipRatchet.cjs`). Prior phase precedent for "deleted paths stay deleted": `src/backend/__tests__/{depot,scanner,steamCm,steamFiles,steamPolls}PortComplete.test.ts`.

## Metadata

**Analog search scope:** `src-tauri/crates/`, `src-tauri/src/*_dispatch.rs`, `src/backend/{scanners,sidecar,utils,safety,testUtils,__tests__}`, `src/frontend/{state,components/UI}`, `src/common/types`, `meta/__tests__`, `.github/workflows`, `.planning/milestones/v0.10-phases/78-*`
**Files scanned:** about 30 read or grepped (RESEARCH.md lines 365-800 not read; its first 364 lines carry the inventory, matrix and API proposal used above)
**Pattern extraction date:** 2026-11-20
