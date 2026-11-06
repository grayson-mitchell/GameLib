# Phase 63: Rust migration pattern and executable scanners - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 22 new/modified
**Analogs found:** 19 / 22 (3 are partial; see "No Analog Found")

Line numbers are from the tree at mapping time. phases 62/64/67 touch `sidecarTransport.ts` and `store_embed.rs`; re-grep before executing.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/Cargo.toml` (add `[workspace]`) | config | n/a | itself (`[lints.clippy]` at L418-424) | exact |
| `src-tauri/crates/gamelib-scan/Cargo.toml` | config | n/a | `src-tauri/Cargo.toml` `[package]` + `[lints.clippy]` | role-match |
| `src-tauri/crates/gamelib-scan/src/lib.rs` (`dispatch`, `OPS`) | service | request-response | `dispatch_rust_channel` `wake_lock_*` arms, `store_embed.rs:4486-4506` | role-match |
| `.../gamelib-scan/src/{reader,pe/*,macho,contain,closure}.rs` | utility | file-I/O, transform | TS: `peSteamDrm.ts` (`PeReader`, `readExact`), `peSections.ts`, `machoExports.ts`, `importScan.ts` | exact (port source) |
| `.../gamelib-scan/tests/golden.rs` + `tests/fixtures/*` | test | batch | TS builders `__tests__/fixtures/importPe.ts`, `delayImportPe.ts`, `peSteamDrm.test.ts` `buildPe` | role-match |
| `src-tauri/crates/gamelib-scan-cli/src/main.rs` | utility (bin) | request-response / batch | none in Rust; closest `dispatch` arm shape | partial |
| `src-tauri/src/store_embed.rs` (new `scan_*` arms) | controller | request-response | `wake_lock_start`/`wake_lock_stop` arms | exact |
| `src-tauri/src/main.rs` (Rust unit tests for arms) | test | request-response | `wake_lock_*` tests, `main.rs:6465-6620` | exact |
| `src/common/types/sidecarTransport.ts` (`RUST_SCAN_*`, list) | config | n/a | `RUST_WAKE_LOCK_START/STOP`, L320-339, L525-565 | exact |
| `src/backend/sidecar/__tests__/transportParity.test.ts` | test | n/a | itself (no edit expected; it must go green) | exact |
| `src/backend/sidecar/sidecarRpc.ts` | config | request-response | `UNBOUNDED_RUST_CHANNELS` L96-100 (no change recommended) | exact |
| `scanners/resolveScannerImpl.ts` (flag) | utility | n/a | `experimentalFeatures` in `src/common/types.ts:106-110,155`; `GAMELIB_*` env switches | partial |
| `src/common/types.ts` (hidden `scanners?` on AppSettings) | model | n/a | `experimentalFeatures?` (L155), `enableSteamNativeDelete?` | role-match |
| `bridge/importScan.ts` (async Rust wrapper) | service | request-response | itself (`scanSteamApiImports`, L202-260) + RESEARCH wrapper skeleton | exact |
| `bridge/peSteamDrm.ts`, `peSections.ts`, `drm/drmScanExe.ts`, `tools/machoExports.ts` (wrappers) | service | request-response | same files, `importScan.ts` fail-closed shape | exact |
| callers: `shimGenerate.ts`, `gameLaunch.ts`, `gameBridgeLaunch.ts`, `gameMakerRunner.ts`, `tools/dxmt.ts` | service | request-response | themselves (sync to `await`) | exact |
| `meta/gamelibScanCli.ts` (resolve + spawn helper) | utility | request-response | `meta/buildDrmNativeParts.ts:230-262` `spawnArgvIsolated` | exact |
| `meta/scannerParitySweep.ts` | utility | batch | `meta/bridgeCensus.ts` (enumeration L1312-1400) | exact |
| `meta/genScanFixtures.ts` | utility | batch | `__tests__/fixtures/*.ts` builders | role-match |
| `meta/bridgeCensus.ts` (L1439, L2216 via CLI) | utility | batch | itself | exact |
| `src/backend/__tests__/cargoFeatures.test.ts` (lock pin) | test | n/a | itself, `EXPECTED_LOCKFILE_CRATE_NAMES` L186 | exact |
| `.github/workflows/rust-test.yml` | config | n/a | itself, steps at "cargo test (Tauri shell crate)" and clippy ratchet | exact |
| `package.json` scripts (`bridge-census`, `scanner-parity-sweep`) | config | n/a | `"bridge-census"` L79 | exact |

## Pattern Assignments

### `src/common/types/sidecarTransport.ts` (config, allow-list)

**Analog:** `RUST_WAKE_LOCK_START` / `RUST_WAKE_LOCK_STOP` (L320-339) and `RUST_INVOKE_CHANNELS` (L525-565).

Each channel: a documented `as const` string whose value equals the Rust match-arm literal, then an entry at the END of the array.

```typescript
/** Args: `[{ exePath: string }]`. ... */   // doc says the args shape and the resolved result
export const RUST_WAKE_LOCK_START = 'wake_lock_start' as const
...
export const RUST_INVOKE_CHANNELS = [
  RUST_KEYRING_GET,
  ...
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP
] as const
export type RustInvokeChannel = (typeof RUST_INVOKE_CHANNELS)[number]
```

Add the seven `RUST_SCAN_*` consts (names equal `gamelib_scan::OPS`) and append to the array. `requestRustInvoke` rejects any channel not in this array (sidecarRpc.ts L406).

### `src-tauri/src/store_embed.rs` `dispatch_rust_channel` (controller, request-response)

**Analog:** `wake_lock_start` / `wake_lock_stop` arms, `store_embed.rs:4486-4506`. Fn signature at L1810: `pub(crate) fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String>`.

```rust
"wake_lock_start" => {
    let kind = args
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| "wake_lock_start:bad-args".to_string())?;
    let id = wake_lock_start(kind)?;
    Ok(Value::from(id))
}
```

New arms: one-liner opener `"scan_xxx" => {` (several source-scan tests, including `transportParity.test.ts` `extractDispatchArms`, need a string-literal arm), body `gamelib_scan::dispatch("scan_xxx", args)`. Bad args use the `<channel>:bad-args` message style. Place arms near the `wake_lock_*` arms with a Phase-63 comment block, like the existing comment style ("this is a `dispatch_rust_channel` arm and NOT a `generate_handler!` command"). Add `gamelib-scan = { path = "crates/gamelib-scan" }` to the shell's `[dependencies]`.

**Threading:** `sidecar.rs:511-512` already runs each request in `thread::spawn(move || { let result = dispatch_rust_channel(&channel, &args, &worker_app); ...`. No `spawn_blocking` needed. Wrap the `dispatch` body in `catch_unwind` (RESEARCH Security) so a panic still answers.

### `src-tauri/src/main.rs` Rust unit tests (test)

**Analog:** `main.rs:6465-6620` `wake_lock_*` tests inside `mod tests` (opens L1854). Style: plain `#[test] fn snake_case_describing_behaviour()`, each with a comment naming the RED direction/threat. For the new crates, tests live in-crate (`#[cfg(test)]` and `tests/golden.rs`); only the arm routing tests go in `main.rs`.

### `src-tauri/Cargo.toml` + new crate manifests (config)

**Analog:** `src-tauri/Cargo.toml` L418-429.

```toml
[lints.clippy]
dbg_macro = "deny"
todo = "deny"

[profile.release]
opt-level = "s"
```

Append `[workspace] members = ["crates/gamelib-scan", "crates/gamelib-scan-cli"]` / `resolver = "2"` to the root manifest. Each new crate manifest repeats `[lints.clippy]` with the two deny lines and sets `rust-version = "1.77.2"`. Dependencies: `serde`, `serde_json` (copy the exact version lines already in the root `[dependencies]`), dev-dep `tempfile`. Do NOT add any other crate (lock pin).

### `src/backend/__tests__/cargoFeatures.test.ts` (test)

**Analog:** itself. `EXPECTED_LOCKFILE_CRATE_NAMES` (L186) is a sorted, machine-generated string array (comment at L161-163: `grep '^name = ' Cargo.lock | sed ... | sort -u`). Add `"gamelib-scan"` and `"gamelib-scan-cli"` in sorted position in the same commit as the crates. The Cargo.toml regex tests (`^keyring\s*=\s*\{...\}` with the `m` flag) only look at dependency lines, so a `[workspace]` table is harmless.

### `.github/workflows/rust-test.yml` (config)

**Analog:** itself. Existing steps:

```yaml
      - name: cargo test (Tauri shell crate)
        shell: bash
        working-directory: src-tauri
        run: cargo test --bin gamelib-shell
      ...
      - name: cargo clippy ratchet (macOS leg only, shrink-only baseline)
        if: runner.os == 'macOS'
        shell: bash
        working-directory: src-tauri
        run: |
          cargo +1.99.1 clippy --all-targets --message-format=json > "$RUNNER_TEMP/clippy.json"
          node ../meta/clippyRatchet.cjs "$RUNNER_TEMP/clippy.json" --list
```

Add a sibling step `cargo test -p gamelib-scan -p gamelib-scan-cli` (same `shell: bash`, `working-directory: src-tauri`; it needs none of the vite/sidecar prep, so it can precede them) and change clippy to `--workspace --all-targets`. The file carries a long "what this does NOT catch" comment header: extend it (caveat list a-f) rather than leave a stale claim that only the shell crate is covered. `meta/clippyRatchet.cjs` expects a `gamelib-shell` compiler-artifact; new crates must emit 0 warnings.

### `meta/gamelibScanCli.ts` and every `meta/`/`src/` CLI spawn (utility, request-response)

**Analog:** `meta/buildDrmNativeParts.ts:28` (import) and `:230-262` (`spawnArgvIsolated`). Also `meta/buildLsteamclient.ts:396`, `meta/buildSteamBridgeShims.ts:657`.

```typescript
import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
// Argv-form spawn, no shell. Every invocation gets a fresh fake-HOME profile; this build has no
// real-profile arm because nothing here is profile-dependent.
const profile = createFakeHomeProfile({ prefix: 'gamelib-drm-native-' })
const child = spawn(command, args, { cwd, env: profile.childEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] })
...
child.on('error', (e) => { done(); reject(e) })      // done() = profile.dispose() in try/catch
child.on('close', (code) => { done(); resolvePromise({ code, stdout, stderr }) })
```

Copy this verbatim and change the prefix (`gamelib-scan-`). `profile.childEnv(base)` takes a base env; `profile.dispose()` must run on both error and close. The fresh-profile-per-call rule (D4 in `fakeHomeProfile.ts` header) is why the sweep uses the CLI's `--ndjson` single-process mode and says so in a comment. `cargo build` runs OUTSIDE any profile (fake HOME hides `~/.cargo`); chain it in the package.json script. `src/backend/__tests__/fakeHomeIsolation.test.ts` scans in-repo spawn sites for hand-rolled env blocks.

### `meta/scannerParitySweep.ts` and `meta/bridgeCensus.ts` edits (utility, batch)

**Analog:** `meta/bridgeCensus.ts` (enumeration `findBridgeBottles`, `walkExes`, `isExcludedExeName` at L1312-1400; `readPeSteamApiDelayImports` at L1439; `detectSteamDrmInPe` at L2216; `scanImportsSync` L1478 stays on objdump). Script entry: `package.json` L79:

```json
"bridge-census": "node meta/runTs.cjs --bundle --platform=node --target=node21 meta/bridgeCensus.ts",
```

Copy this script shape for `scanner-parity-sweep` (prefix with `cargo build -p gamelib-scan-cli --manifest-path src-tauri/Cargo.toml &&`). Export the diff function as a pure helper with a test under `meta/__tests__/` (as `bridgeCensus.test.ts` does). The sweep imports only the legacy `*Ts` functions plus `gamelibScanCli.ts`, never the flag-resolving wrappers (they call `requestRustInvoke`, which only works inside the sidecar).

### TS async wrappers: `bridge/importScan.ts` and siblings (service, request-response)

**Analog:** `importScan.ts:202-260` (typed `{status:'error'}` plus `logWarning(..., LogPrefix.Steam)` on every failure; T-24-06 check first).

```typescript
export async function scanSteamApiImports(appId: string, exePath: string): Promise<ImportScanResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(`scanSteamApiImports: rejected non-numeric appId "${appId}" -- not spawning objdump (T-24-06)`, LogPrefix.Steam)
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }
  try { result = await spawnAsync(OBJDUMP_BIN, ['--private-headers', exePath]) }
  catch (error) { logWarning([`...failed to run for appId ${appId}`, error], LogPrefix.Steam); return { status: 'error', error: `...${String(error)}` } }
```

Keep the pre-check and the `try/catch to typed fail-closed value` shape; replace the spawn with `await requestRustInvoke(RUST_SCAN_..., [{ exePath, appId }])` (from `sidecarRpc`) and forward `diagnostics` to `logWarning`/`logInfo`. The full wrapper skeleton is in RESEARCH "TS wrapper skeleton". Keep exported module paths so the roughly 20 `jest.mock('../importScan')`-style sites survive (e.g. `drmScanExe.test.ts:37` `jest.mock('../../importScan', () => ({ scanSteamApiImports: jest.fn() }))`); only `mockReturnValue` to `mockResolvedValue` where a function turned async. Wrapper fail-closed table: `detectDrmWrapper` to `undefined`, `readPeImportedDllNames` to `null`, `readLaunchExeCegMarkers` to `[]` plus warning.

`peSections.ts` header is the Rust port spec (caps `PE_SECTION_SCAN_BYTES = 8192`, `MAX_PE_SECTIONS = 96`; "bounds-checked; hostile header yields empty list, never a throw"). The Rust equivalent returns an empty list, never panics.

### Scanner flag: `scanners/resolveScannerImpl.ts` + `AppSettings.scanners?`

**Analog:** `src/common/types.ts:106-110` (`ExperimentalFeatures`, optional sub-object) and L155 (`experimentalFeatures?: ExperimentalFeatures` on `AppSettings`); `enableSteamNativeDelete?: boolean` (L43 of the same type block) is a hidden optional flag precedent. Declare `scanners?: Partial<Record<ScannerName, 'rust' | 'ts'>>` the same way, never rendered. For the env override, the repo uses `GAMELIB_*` env switches in backend code (my grep with `--include` glob failed under zsh; the planner should `grep -rn "process.env.GAMELIB_" src/backend` to copy the exact read style). Per-scanner default constant stays `'ts'` until that scanner's sweep is clean, then flips to `'rust'`.

### Tier-1 fixtures and goldens (test, batch)

**Analog (TS builders):** `src/backend/storeManagers/steam/bridge/__tests__/fixtures/importPe.ts` (in-memory PE32/PE32+ via `Buffer.alloc`, `writeUInt32LE`; names only, no symbols) and `fixtures/delayImportPe.ts`; `peSteamDrm.test.ts:91 buildPe(f: PeFixture)` is a local builder to extract to `__tests__/fixtures/` first. Header convention: "Synthetic; no game binaries are used or checked in."

```typescript
const PE_OFFSET = 0x80; const SECTION_VA = 0x1000; const SECTION_RAW = 0x400
base.write('MZ', 0, 'latin1'); base.writeUInt32LE(PE_OFFSET, 0x3c); base.writeUInt32LE(0x00004550, PE_OFFSET)
base.writeUInt16LE(plus ? 0x8664 : 0x14c, PE_OFFSET + 4)
```

Need a NEW import-table-with-symbols builder (none exists). Other existing fixtures: `objdumpImports.ts` (objdump text), `managedPe.ts`. Rust side: `tests/golden.rs` reads `tests/fixtures/*.bin` + `expected.json`; filesystem cases (closure, containment, symlink escape) use `tempfile`.

### `meta/genScanFixtures.ts` (utility, batch)

Role-match to the builders above plus `meta/runTs.cjs` bundling. Run manually; output committed. The Jest golden test compares the TS implementation to the same `expected.json` (no Rust toolchain in the Jest lane, `test.yml`).

## Shared Patterns

### Channel allow-list parity (apply to every `RUST_SCAN_*` channel)
**Source:** `src/backend/sidecar/__tests__/transportParity.test.ts` (L1-80 header and `extractDispatchArms`). It reads only top-level `src-tauri/src/*.rs`, so arms must be string-literal arms in `store_embed.rs`, not in `crates/`. It fails on drift in either direction between `RUST_INVOKE_CHANNELS` and the arms. Run: `pnpm exec jest src/backend/sidecar/__tests__/transportParity.test.ts`.

### Jest transport test style
**Source:** `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` (PassThrough pairs, `collectLines`, `flush`, mocks `../../online_monitor`). Use only if a new wrapper-framing test is wanted; wrapper behaviour tests should mock `requestRustInvoke`/`sidecarRpc` instead.

### rustInvoke timeout and exit contract
**Source:** `sidecarRpc.ts:60` (`RUST_INVOKE_TIMEOUT_MS = 60_000`), `:96-100` (`UNBOUNDED_RUST_CHANNELS`, human-in-the-loop only: dialogs), `:420-435` (`timer.unref()`). No exception is warranted for scan channels (header reads only, at most 32 DLLs). Wrappers add no timers or boot-time work. Check: `pnpm smoke:sidecar`.

### Fail-closed typed results
**Source:** `importScan.ts` (`{status:'error'}` + `logWarning`), `peSections.ts` (empty list, never throw). Apply to all Rust results (`parsed:false`/`null`/typed error for not-a-PE or truncated; `Err("...:bad-args")` only for bad arguments; transport failure only rejects).

### Fake HOME for spawns
**Source:** `src/backend/testUtils/fakeHomeProfile.ts` (`createFakeHomeProfile`, `childEnv`, `dispose`) with `meta/buildDrmNativeParts.ts:230-262`. Enforced by `fakeHomeIsolation.test.ts`.

### Prettier verify (conventions)
`.rs`, `.toml` and committed `expected.json` are probably prettier-ignored. Run `npx prettier --file-info <path>` first and omit the check where ignored; keep `npx prettier --check <exact .ts paths>` for every TS file written.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `gamelib-scan-cli/src/main.rs` | bin | request-response, NDJSON batch | No standalone Rust bin crate exists. Use RESEARCH "CLI contract" (`<op> <json-args>` prints one JSON; `--ndjson`; `--list` from `OPS`). |
| `gamelib-scan` ranged `Read+Seek` reader and `catch_unwind` guard | utility | file-I/O | No Rust file-parsing code exists. Port from TS `PeReader`/`readExact` in `peSteamDrm.ts`; RESEARCH "Ranged reader contract" code. |
| Native import-table SYMBOL enumeration | utility | transform | No TS reader enumerates import symbols (DLL names only). Mirror the delay-table walker in `peSteamDrm.ts`; decide ordinal handling from the sweep (RESEARCH Pitfall 1, A5). |

## Metadata

**Analog search scope:** `src/common/types/`, `src/backend/sidecar/`, `src-tauri/{Cargo.toml,src/}`, `src/backend/storeManagers/steam/bridge/` (+ `__tests__`, `fixtures`), `src/backend/testUtils/`, `meta/`, `.github/workflows/rust-test.yml`, `src/backend/__tests__/cargoFeatures.test.ts`, `package.json`.
**Not re-read (taken from RESEARCH, verified by it):** `peSteamDrm.ts` internals, `drmScanExe.ts`, `machoExports.ts`, `bridgeScan.ts`, caller sites, `clippyRatchet.cjs`.
**Pattern extraction date:** 2026-11-07
