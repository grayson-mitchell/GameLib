# Phase 75: Steam local file formats in Rust - Pattern Map

**Mapped:** 2026-11-13
**Files analyzed:** 27 new/modified (plus ~13 TS callers moving, listed in the caller table)
**Analogs found:** 25 / 27 (the two parsers themselves have no analog; they are net-new code)

Primary analog pair: Phase 63 `gamelib-scan` (+ `-cli`, `rustScan.ts`, `scannerPortComplete.test.ts`) and Phase 73 `gamelib-depot` (`acf.rs`, `depotPortComplete.test.ts`, `depotParitySweep.ts`, `expected.json` oracle capture). `src-tauri/crates/README.md` sections 1-10 is the written recipe.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-steamfiles/Cargo.toml` | config | n/a | `crates/gamelib-scan/Cargo.toml` | exact |
| `.../gamelib-steamfiles/src/lib.rs` (OPS, dispatch, Args) | service/dispatcher | request-response | `crates/gamelib-scan/src/lib.rs` | exact |
| `.../src/kv_text.rs` (lossless text KV1 tree + merged/ordered views) | utility/parser | transform | none (see No Analog); semantic oracle `@node-steam/vdf` + `sharedRedists.ts parseKv1` | no analog |
| `.../src/kv_bin.rs` (lossless binary KV tree) | utility/parser | transform | none; `crates/gamelib-scan/src/reader.rs` (bounded reader) and `macho.rs` for byte-parse style only | partial |
| `.../src/acf.rs` (typed readers + builder moved from depot) | model/service | file-I/O | `crates/gamelib-depot/src/acf.rs` | exact (move) |
| `.../src/library.rs` (libraryfolders roots, installed maps, registry RunningAppID) | service | file-I/O batch | `crates/gamelib-scan/src/closure.rs` (path in, typed result out); TS oracle `library/installedMap.ts` | role-match |
| `.../src/shortcuts.rs` (read/apply/atomic write) | service | file-I/O CRUD | `gamelib-depot/src/acf.rs::write_app_manifest` (tmp+fsync+rename) | role-match |
| `.../src/discover.rs` (Probe-trait Steam root discovery) | utility | request-response | TS `config.ts getSteamCompatFolder` + `isFlatpakSteamInstalled` (logic oracle); `gamelib-scan/src/contain.rs` for injected-fs style | partial |
| `.../tests/golden.rs`, `tests/roundtrip.rs`, `tests/fixtures/{expected.json,...}` | test | parity | `gamelib-scan/tests/golden.rs`, `gamelib-depot/tests/{golden.rs,fixtures/expected.json}` | exact |
| `src-tauri/crates/gamelib-steamfiles-cli/{Cargo.toml,src/main.rs,tests/cli.rs}` | CLI | request-response | `crates/gamelib-scan-cli/*` | exact |
| `src-tauri/crates/gamelib-depot/{Cargo.toml,src/acf.rs}` (depend on shared codec, re-export) | service | file-I/O | itself (builder bodies must stay byte-for-byte) | exact |
| `src-tauri/Cargo.toml` (dep + workspace members) | config | n/a | lines 16-18, 437-442 | exact |
| `src-tauri/src/steamfiles_dispatch.rs` + `main.rs` mod/use + `rust_dispatch.rs` arms | controller | request-response | `src-tauri/src/scan_dispatch.rs` | exact |
| `src-tauri/src/ipc_contract.rs` (GENERATED, do not hand-edit) | config | n/a | regenerate via `pnpm gen:ipc-contract` | generated |
| `src/common/types/sidecarTransport.ts` (RUST_STEAMFILES_* consts, `RUST_INVOKE_CHANNELS`, `RUST_STEAMFILES_CHANNELS`) | config | n/a | `RUST_SCAN_*` consts + `RUST_SCAN_CHANNELS` (lines 363-370, 624-685) | exact |
| `src/common/types/ipc/rustInvoke.ts` (zod args per channel) | config/schema | request-response | `[RUST_SCAN_STEAM_DRM]: exePath` block (lines 89, 215-219) | exact |
| `src/backend/storeManagers/steam/localFiles/steamFilesTypes.ts` (ops, args, results) | model | n/a | `src/backend/scanners/scanTypes.ts` | exact |
| `.../localFiles/rustSteamFiles.ts` (`invokeSteamFiles`) | service/adapter | request-response | `src/backend/scanners/rustScan.ts` | exact |
| `.../localFiles/*` thin wrappers keeping old names (`readAppManifestFlags`, `readAcfState`, `buildInstalledMap`, `getSteamLibraries`, `readMacRunningAppId`, ...) now `Promise` | service | file-I/O | `bridge/drm/drmScanExe.ts` (wrapper over `invokeScan`, fail-closed mapping) | role-match |
| `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts` (swap `readShortcutFile`/`writeShortcutFile` for `shortcuts_*` invokes) | service | file-I/O CRUD | same file, sole `steam-shortcut-editor` user | in-place |
| `src/backend/storeManagers/steam/depotRust/install.ts:160` (route no-depots finalize to Rust writer) | service | file-I/O | same file; `RustFinalizeSpec` shape near line 177 | in-place |
| `src/backend/config.ts` (`getSteamCompatFolder` default asks Rust) | config | request-response | same file lines 47-75 | in-place |
| `meta/gamelibSteamfilesCli.ts` + `meta/bridgeCensus.ts` edit | utility | request-response | `meta/gamelibScanCli.ts` | exact |
| `meta/steamFilesParitySweep.ts` (local, deleted at gate) | utility | batch | `meta/depotParitySweep.ts` (exit 0/1/3, redacted output) | exact |
| `meta/genSteamFilesFixtures.ts` (TS oracle capture, run BEFORE delete) | utility | batch | 73-08 oracle capture (`gamelib-depot/tests/fixtures/README.md`), `meta/genScanFixtures.ts` (in git history) | role-match |
| `src/backend/__tests__/steamFilesPortComplete.test.ts` | test | static | `src/backend/__tests__/depotPortComplete.test.ts` / `scannerPortComplete.test.ts` | exact |
| `src/backend/storeManagers/steam/localFiles/__tests__/steamFilesChannelParity.test.ts` | test | static | `src/backend/scanners/__tests__/scanChannelParity.test.ts` | exact |
| `.../fixtures/stubRustSteamFiles.ts` (replaces `jest.mock('@node-steam/vdf')`) | test util | n/a | `steam/bridge/__tests__/fixtures/stubRustScan.ts` | exact |
| `package.json` (`steamfiles-cli:build`, prefix on `bridge-census`, remove 2 deps), `.github/workflows/rust-test.yml`, `cargoFeatures.test.ts` `EXPECTED_LOCKFILE_CRATE_NAMES`, knip entries | config | n/a | `scan-cli:build` (line 83) / `bridge-census` (line 86); rust-test.yml lines 114-117 | exact |
| Dev flags (text VDF, shortcuts.vdf) | utility | n/a | `depotRust/pipelineFlag.ts` (deleted in 73-19; recover with `git show 81dff5122^:src/backend/storeManagers/steam/depotRust/pipelineFlag.ts`) | exact |

Caller sites for D-04 (13 files) are not new files; each follows the "wrapper" pattern below.

## Pattern Assignments

### `gamelib-steamfiles/Cargo.toml` and `-cli/Cargo.toml` (config)

**Analog:** `src-tauri/crates/gamelib-scan/Cargo.toml` and `gamelib-scan-cli/Cargo.toml` (MSRV 1.77.2; depot's 1.89 is the documented exception, do NOT inherit it).

```toml
[package]
name = "gamelib-steamfiles"
version = "0.1.0"
edition = "2021"
rust-version = "1.77.2"
publish = false

[lib]
path = "src/lib.rs"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
tempfile = "3"

[lints.clippy]
dbg_macro = "deny"
todo = "deny"
```
CLI: `[[bin]] name = "gamelib-steamfiles-cli" path = "src/main.rs"`, `gamelib-steamfiles = { path = "../gamelib-steamfiles" }`, `serde_json = "1"`, same lints. Windows registry: add under `[target.'cfg(windows)'.dependencies]` only (winreg is already in Cargo.lock transitively; `windows-sys` `Win32_System_Registry` is the no-new-crate alternative, see `src-tauri/Cargo.toml` lines 354-392). Register in `src-tauri/Cargo.toml` `[workspace] members` (lines 437-442) and as a path dep next to line 16/18; gamelib-depot gets `gamelib-steamfiles = { path = "../gamelib-steamfiles" }`.

---

### `gamelib-steamfiles/src/lib.rs` (dispatcher, request-response)

**Analog:** `src-tauri/crates/gamelib-scan/src/lib.rs` (whole file, 260 lines). Copy structure verbatim.

**Ops registry + args structs** (lib.rs 17-52):
```rust
pub const OPS: &[&str] = &[ /* sorted */ ];
pub const CLI_ONLY_OPS: &[&str] = &[ /* ... */ ];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExePathArgs { exe_path: String }
```

**Arg parse + dispatch + panic catch** (lib.rs 54-71, 112-117):
```rust
fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 { return Err(bad()); }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}
fn to_value<T: serde::Serialize>(op: &str, v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|_| format!("{op}:serialize"))
}
// run_op: match op { "x" => { let a: XArgs = parse_args(op, args)?; to_value(op, f(Path::new(&a.path))) } ... #[cfg(test)] "__panic_probe" => panic!("probe"), _ => Err(format!("unknown-op:{op}")) }
pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}
```

**Result-not-error rule** (lib.rs header + test `steamstub_missing_file_is_a_result`): unreadable or unparseable input RESOLVES with a typed result (`readError`, `parsed:false`); `Err` is only bad args, unknown op, panic. Keep each caller's fail-soft mapping (runningPoll returns 0; installedMap skips bad ACFs) at the TS wrapper.

**Unit tests to copy** (lib.rs 130-185): `empty_args_is_bad_args`, `extra_field_is_bad_args`, `unknown_op`, `ops_list_is_sorted_and_unique` (also asserts `__panic_probe` not in OPS), `every_op_dispatches_bad_args_on_empty_args`, `panic_is_caught`, `cli_only_ops_are_registered`, `*_missing_file_is_a_result`, and a `security_truncation_never_panics` loop (feed every prefix of fixture bytes to both parsers; add depth/size-cap cases per RESEARCH Security Domain).

Phase-75 additions with no scan analog: pure-string args for hot-path batching (`steamfiles_scan_installed { steamappsDirs: [..] }` returning an array, RESEARCH Pattern 2); shortcuts mutation as described edit (`shortcuts_apply { path, op, entry, match }`, RESEARCH Pattern 3). Atomic-write helper: extract once from depot (below) into the shared crate.

---

### `gamelib-steamfiles/src/acf.rs` (model/service, file-I/O): the single ACF codec

**Analog:** `src-tauri/crates/gamelib-depot/src/acf.rs`. This file is MOVED (builder part) into the shared crate and re-exported from depot (`pub use gamelib_steamfiles::acf::{AppManifestParams, InstalledDepot, build_app_manifest_text, write_app_manifest, vdf_escape};`). Depot's `tests/acf.rs` and `tests/golden.rs` must stay green UNCHANGED (they `use gamelib_depot::acf::*`). Keep in depot: `finalize`, `measure_installed_bytes`, `can_write_full_ownership`, `should_finalize_after_throw`, `read_existing_state_flags`, `preserve_installed_manifest`.

**Builder preconditions to preserve byte-for-byte** (acf.rs 72-170):
```rust
fn is_valid_beta_key(s: &str) -> bool {
    (1..=64).contains(&s.len())
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-')
}
fn assert_numeric_buildid(buildid: &str) -> Result<(), String> { /* "0" exempt */ }
pub fn vdf_escape(s: &str) -> String { /* backslash first, then quote; \r \n \t -> space */ }
pub fn build_app_manifest_text(p: &AppManifestParams, last_updated: u64) -> Result<String, String> { /* last_updated injected */ }
```
LastOwner and manifest GIDs stay `String` end to end (D-03; >2^53 SteamID64).

**Atomic write pattern** (acf.rs 173-195), the one to extract into a shared `atomic_write(dir, final, tmp, bytes)` helper and reuse for `shortcuts.vdf` (D-11):
```rust
let res = (|| -> std::io::Result<()> {
    let mut f = fs::File::create(&tmp_path)?;
    f.write_all(text.as_bytes())?;
    f.sync_all()?;
    drop(f);
    fs::rename(&tmp_path, &final_path)
})();
if let Err(e) = res { let _ = fs::remove_file(&tmp_path); return Err(format!("writeAppManifest: {e}")); }
```
For shortcuts use tmp name `shortcuts.vdf.tmp` in the same dir; refuse to write when the parse of the existing file failed (RESEARCH Pitfall 5).

**Test pattern** (`gamelib-depot/tests/acf.rs` 1-45): golden string compare with injected `last_updated = 1700000000`; helper `base()` params; port new typed-reader tests the same way with exact-string fixtures. Include a >2^53 LastOwner case.

**Typed reader field table** (new): before defining result structs, tabulate what each caller consumes as number vs string. Current callers: `library/manifestFlags.ts` 18-45 (`stateFlags` parseInt, `buildid` string, null on missing/unparseable), `library/installedMap.ts` (four loops at lines 58/118/174/245, each reads dir, `parse`, skips bad), `library/acfState.ts`, `acfInstalldir.ts`, `betaBranch.ts`, `cancelDelete.ts`, `macSteamAdoption.ts:154` (comments on numeric coercion), `library/resumeBreadcrumbs.ts`.

---

### `gamelib-steamfiles/src/kv_text.rs`, `kv_bin.rs` (parsers)

No in-repo Rust analog; see "No Analog Found". Structural conventions to borrow:
- bounded byte reader with `readError` strings: `gamelib-scan/src/reader.rs` (`SliceReader`) and the truncation-never-panics test in `lib.rs` 187-259.
- Semantic oracles to pin as fixtures: `node_modules/@node-steam/vdf/lib/index.js` (merge duplicates, number/bool coercion, no unescape), `steam/bridge/sharedRedists.ts:80 parseKv1(text): KvNode[]` (ordered, duplicate keys), `steam-shortcut-editor/lib/{parser,writer}.js`.
- Core tree per RESEARCH Pattern 1: `enum Node { Str(raw), Map(Vec<(key, Node)>) }` with conditional tag on keys; views `merged()` and `ordered()`.
- Add explicit `MAX_DEPTH` (e.g. 64) and byte cap; valveClient guard order carries over (size cap and forbidden-key reject BEFORE parse; `MAX_VALVE_MANIFEST_BYTES`, `FORBIDDEN_KEY_RE` at `valveClient.ts:131-136`).

---

### `gamelib-steamfiles/src/discover.rs` (utility, request-response)

**Logic oracle (TS being replaced):** `src/backend/config.ts` lines 47-75:
```ts
function getSteamCompatFolder(userHome: string) {
  if (isWindows) { return join(process.env['PROGRAMFILES(X86)'] ?? '', 'Steam') }
  else if (isMac) { return join(userHome, 'Library/Application Support/Steam') }
  else {
    const flatpakSteamPath = join(userHome, '.var/app/com.valvesoftware.Steam/.steam/steam')
    if (existsSync(flatpakSteamPath)) {
      if (isFlatpakSteamInstalled(['/var/lib/flatpak', join(userHome, '.local/share/flatpak')])) return flatpakSteamPath
    }
    return join(userHome, '.steam/steam')
  }
}
```
`isFlatpakSteamInstalled(roots)` = `roots.some(r => existsSync(join(r,'app',FLATPAK_STEAM_APP)))`. New order (D-13/D-14): Windows HKCU `Software\Valve\Steam\SteamPath` then `%PROGRAMFILES(X86)%\Steam`; Linux flatpak (with installed-check), `~/.steam/steam`, `~/.local/share/Steam`, snap `~/snap/steam/common/.local/share/Steam`; first with `steamapps/libraryfolders.vdf` wins; fallback `~/.steam/steam`.

Structure per RESEARCH Pitfall 7: pure fn over an injected `Probe` trait (`home`, `env`, `exists`, `read_registry`) so the decision logic is unit-tested on all three OS legs with a fake probe; real `cfg(windows)` impl gets compile-only coverage. The TS-side `defaultSteamPath` setting always wins; Rust only computes the default. `getSteamLibraries` (`src/backend/utils.ts:601-626`) keeps its hard-coded `/usr/share/steam` and trailing `existsSync` filter in TS (or moves both into the op; decide in plan), and turns the `libraryfolders.vdf` read into the Rust call.

---

### `src-tauri/src/steamfiles_dispatch.rs` and `rust_dispatch.rs` arms (controller)

**Analog:** `src-tauri/src/scan_dispatch.rs` (whole file, 6 one-line handlers).
```rust
use super::*;
pub(crate) fn rpc_scan_steam_drm(args: &[Value]) -> Result<Value, String> {
    ScanSteamDrmArgs::from_args(args)?;            // generated Args struct validates first
    gamelib_scan::dispatch("scan_steam_drm", args) // then pass straight through
}
```
Wire: `mod steamfiles_dispatch;` + `use steamfiles_dispatch::*;` in `main.rs` (cf. lines 134, 152; also the file lists at 2031/2077 that `include_str!` the dispatch file for source-scan tests), and one arm per channel in `src-tauri/src/rust_dispatch.rs` (line 61 pattern):
```rust
RustInvokeChannel::ScanSteamDrm => rpc_scan_steam_drm(args),
```
Add a main.rs unit test mirroring `scan_channels_are_gamelib_scan_app_ops` (main.rs ~4264-4280): every channel is in `OPS`, not in `CLI_ONLY_OPS`, and dispatch with `&[]` errors.

`ipc_contract.rs` is GENERATED from `sidecarTransport.ts` + `rustInvoke.ts` by `pnpm gen:ipc-contract` (CI: `pnpm check:ipc-contract`). Never hand-edit.

---

### `src/common/types/sidecarTransport.ts` + `ipc/rustInvoke.ts` (config)

**Analog:** `RUST_SCAN_STEAM_DRM` block.

Const + doc comment (sidecarTransport.ts 362-370):
```ts
 * Takes ONE object arg (`{ exePath }`), all string fields (D-08: paths in, never bytes).
 * Resolves a `SteamDrmScanResult` ... Bad args reject `scan_steam_drm:bad-args`; unreadable or
 * unparseable files RESOLVE with a typed result.
export const RUST_SCAN_STEAM_DRM = 'scan_steam_drm' as const
```
Then add each const to `RUST_INVOKE_CHANNELS` (lines 624-672), define a subset array + type (lines 675-685):
```ts
export const RUST_SCAN_CHANNELS = [ RUST_SCAN_STEAM_API_IMPORTS, ... ] as const
export type RustScanChannel = (typeof RUST_SCAN_CHANNELS)[number]
```
zod args (rustInvoke.ts 89, 215-219): `const exePath = z.tuple([z.object({ exePath: z.string() })])`; `[RUST_SCAN_STEAM_DRM]: exePath,`. Phase 75 note: `shortcuts_apply`'s `entry` carries typed int fields, so its schema is a non-all-string object (an intentional exception to "all-string args"; still no byte arrays). Hot-path ops must NOT go on `UNBOUNDED_RUST_CHANNELS` (only `depot_job_run`-style long jobs do).

---

### `localFiles/steamFilesTypes.ts`, `rustSteamFiles.ts` (model + adapter)

**Analog:** `src/backend/scanners/scanTypes.ts` and `rustScan.ts`.

`rustScan.ts` in full (copy, rename):
```ts
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustScanChannel } from 'common/types/sidecarTransport'
import type { ScanArgsFor, ScanResultFor } from './scanTypes'

export function invokeScan<C extends RustScanChannel>(
  deps: RustInvokeDeps, channel: C, args: ScanArgsFor<C>
): Promise<ScanResultFor<C>> {
  return deps.requestRustInvoke(channel, [args] as RustInvokeArgsOf<C>) as Promise<ScanResultFor<C>>
}
```
Header contract: "Exit contract: no timers, no handles, no work at import." `scanTypes.ts`: `SCAN_OPS` sorted const array + `CLI_ONLY_SCAN_OPS`, typed `*Args`/`*Result` per op (e.g. `readError: string | null`, `parsed: boolean`), "Types, consts and pure helpers". Result types must mirror the existing TS result types (`AppManifestFlags` at manifestFlags.ts 11-14, `RunningPoll` int, installed map shape).

Unit test: copy `src/backend/scanners/__tests__/rustScan.test.ts` (mocks `backend/logger`, asserts `requestRustInvoke` called once with `[args]`, plus `// @ts-expect-error` that a Buffer arg does not compile).

---

### TS caller wrappers (D-04 sites): `manifestFlags.ts`, `installedMap.ts`, `acfState.ts`, `runningPoll.ts`, `utils.getSteamLibraries`, `cancelDelete.ts`, `acfInstalldir.ts`, `macSteamAdoption.ts`, `betaBranch.ts`, `resumeBreadcrumbs.ts`, `valveClient.ts`, `sharedRedists.ts`

**Analog:** `bridge/drm/drmScanExe.ts` (wrapper that owns fail-closed mapping, `deps: RustInvokeDeps` injected, "Never throws"):
```ts
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { invokeScan } from 'backend/scanners/rustScan'
import { RUST_SCAN_CONTAINED_REAL } from 'common/types/sidecarTransport'
function containLeaf(rust: RustInvokeDeps, path: string, rootDir: string, _caller: string): Promise<ContainedRealResult> {
  return invokeScan(rust, RUST_SCAN_CONTAINED_REAL, { path, rootDir })
}
// "A transport failure is treated as not contained. Never throws."
```
Per-caller fail-soft contract to keep (copy from current code):
- `readAppManifestFlags` (manifestFlags.ts 20-43): `null` on missing/unparseable/NaN StateFlags; `buildid` `''` when absent. Sync today; keeps its name, becomes `Promise<AppManifestFlags | null>` (63 D-09). Callers are `await`ed; check overlapping-tick re-entrancy in `installPollOnce.ts`/`installPolling` and pin with a test that calls the poller twice (RESEARCH Pitfall: Pattern 4).
- `readMacRunningAppId` (runningPoll.ts 56-77): returns `0` on missing file, parse failure or missing key; pure readers keep the injected `deps.paths.userHome` seam, path computed in TS and passed to Rust. Linux `~/.steam/registry.vdf` (not `~/.steam/steam/`), Windows `reg.exe` arm unchanged (it is not VDF).
- `buildInstalledMap` family (installedMap.ts 58/118/174/245): batch per directory (`steamappsDirs[]` in, array of typed ACF records out); skip bad ACFs.
- `valveClient.ts parseValveClientManifest` (lines 126-140): size cap, forbidden-key reject, shape check (`win64`/`bins_win64`) move to Rust; TS writes the fetched manifest to its cache file and passes the path (RESEARCH Open Question 1; planner to confirm against the cache flow).
- Dev flag read (text-VDF flag) at the entry of each wrapper, like the 73 flag was "Read once at the entry of each public depot function".

**Dev flag analog** (recover with `git show 81dff5122^:src/backend/storeManagers/steam/depotRust/pipelineFlag.ts`):
```ts
export type DepotPipeline = 'rust' | 'ts'
export const DEPOT_PIPELINE_DEFAULT: 'rust' | 'ts' = 'rust'
let warnedBadValue = false
export function depotPipeline(): DepotPipeline {
  const raw = process.env.GAMELIB_DEPOT_PIPELINE
  if (raw === undefined || raw === '') return DEPOT_PIPELINE_DEFAULT
  if (raw === 'rust' || raw === 'ts') return raw
  if (!warnedBadValue) { warnedBadValue = true; logWarning(`... unknown value, using "${DEPOT_PIPELINE_DEFAULT}"`, LogPrefix.Steam) }
  return DEPOT_PIPELINE_DEFAULT
}
```
For 75: two flags (e.g. `GAMELIB_STEAMFILES_TEXT`, `GAMELIB_STEAMFILES_SHORTCUTS`), env-only (README section 5: no AppSettings, no UI), default `ts` until its own parity passes, then flipped to `rust`, deleted at the gate with every TS branch. Add the flag name literals to the delete-gate FORBIDDEN list.

---

### `nonesteamgame.ts` (shortcuts.vdf consumer)

In-place edit. Sole `steam-shortcut-editor` user (import at line ~6). Sites: `readShortcutFile` (line 122), `writeShortcutFile` (139, in-place `writeFileSync`, replaced by Rust atomic write), `checkIfShortcutObjectIsValid` (177), `checkIfAlreadyAdded` (209), create-if-missing `writeShortcutFile(shortcutsFile, { shortcuts: [] })` (259), add write (357), remove write (466), `isAddedToSteam` (524). Per RESEARCH Pattern 3: keep policy text and `generateShortcutId`/`generateAppId` in TS; move read/summary (`{valid, errors, existingIndex}`) and apply (add/update/remove/ensure) to ops; new file bytes must equal `\0shortcuts\0\x08\x08` (Pitfall 6). `src/common/typedefs/steam-shortcut-editor.d.ts` is deleted at the gate.

---

### `depotRust/install.ts` no-depots finalize (D-03)

In-place edit at the `if (!refs.depots.length)` branch (lines ~159-176): the `finalizeToSteam(appId, {...outcome: opts.signal?.aborted === true ? 'cancelled' : undefined})` call becomes an invoke of a Rust finalize/write-ACF op that reuses depot's `finalize` rules. `RustFinalizeSpec` (install.ts ~177-185) is the shape precedent: `steamappsDir`, `installdir`, `name`, `buildid: string|null`, `lastOwner: string|null`, `allowFullOwnership: boolean`, `betaKey`. Rules that carry unchanged: measured bytes (never a manifest sum), `canWriteFullOwnership` fail-closed, cancelled run never downgrades an installed manifest (`preserve_installed_manifest`), numeric appId/buildid assertions. Delete `depot/finalizeAcf.ts` and `depot/appManifest.ts` plus tests; `canWriteFullOwnership` in TS (finalizeAcf.ts 27-41) goes with it (Rust has its own).

---

### `meta/gamelibSteamfilesCli.ts` + `bridgeCensus.ts` (CLI helper)

**Analog:** `meta/gamelibScanCli.ts` (111 lines). Copy structure: `resolve*CliPath`, `assert*CliPresent`, pure `parseCliResult(op, status, stdout, stderr)` (0 = JSON; 2 = dispatch error; 64 = usage), `parseNdjsonLines`, and the spawn:
```ts
const profile = createFakeHomeProfile({ prefix: 'gamelib-scan-' })   // FRESH per call; use prefix 'gamelib-steamfiles-'
try {
  const r = spawnSync(cli, [op, JSON.stringify(args)], { env: profile.childEnv(process.env), encoding: 'utf-8', maxBuffer: MAX_BUFFER })
  if (r.error) throw r.error
  return parseCliResult(op, r.status, r.stdout, r.stderr) as ScanResultFor<Op>
} finally { try { profile.dispose() } catch { /* best effort */ } }
```
Build is NOT run from `meta/` (fake HOME hides `~/.cargo`); missing-binary error names `cargo build -p gamelib-steamfiles-cli --manifest-path src-tauri/Cargo.toml`. Fake-HOME gate: `fakeHomeIsolation.test.ts` covers in-repo spawn sites.

**Caveat specific to this phase:** the CLI reads real Steam files given as paths and discovery reads `$HOME`; under `createFakeHomeProfile()` discovery sees an empty fake HOME. Headless callers must pass explicit paths, and any census arm needing the real profile must be a named, justified real-profile arm (gamelib-conventions: "isolated by default, plus a named real-profile arm where a defect only arms under a populated profile").

**CLI crate main.rs analog:** `gamelib-scan-cli/src/main.rs` (77 lines): `--list`, `--ndjson`, `<op> <json-object>`; exit 0/2/64; `ndjson_reply` returns `{ok,result}`/`{ok:false,error}`. Replace `gamelib_scan::` with `gamelib_steamfiles::`. Tests: copy `gamelib-scan-cli/tests/cli.rs` (`cli()` helper with `c.env_clear()`; `list_prints_ops` asserts the exact op JSON; `bad_args_exit_2_stdout_empty`; `usage_errors_exit_64`; `ndjson_streams_in_order_and_survives_bad_lines`).

---

### Parity harness (tier 1 permanent, tier 2 local and deleted)

**Tier 1 analogs:** `gamelib-scan/tests/golden.rs` and `gamelib-depot/tests/golden.rs`. Pattern: `include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/expected.json"))`, `${FIXTURES}` token normalisation for paths, per-case `rustOverride` that REQUIRES a `divergenceNote` (D-07), new cases hand-written with a Rust-verified value and a note naming the source of truth. Capture the TS oracle (`@node-steam/vdf`, `parseKv1`, `steam-shortcut-editor`) into `expected.json` BEFORE deleting those packages (73-08 precedent; fixtures README at `gamelib-depot/tests/fixtures/README.md`). Jest asserts TS == golden until the oracle is deleted; `cargo test -p gamelib-steamfiles --test golden` asserts Rust == golden. `roundtrip.rs` additionally asserts `serialize(parse(bytes)) == bytes` for committed `shortcuts.vdf` fixtures (empty, one entry, `tags` map, unknown type, trailing bytes, sparse indexes).

**Tier 2 analog:** `meta/depotParitySweep.ts`: exit `0` clean / `1` diff / `3` no inputs ("A vacuous run is a failure"); output redacted (sha1 of relative path plus basename, never an absolute path or username); every spawn gets a FRESH `createFakeHomeProfile({ prefix: ... })`; JSON input via argv[2]. `package.json` script shape (line 85): `"depot-parity-sweep": "pnpm depot-cli:build && node meta/runTs.cjs --bundle --platform=node --target=node22 meta/depotParitySweep.ts"`. Local-only real inputs: every ACF (libraries and bottles), `libraryfolders.vdf`, `registry.vdf`, cached Valve manifests, `installscript.vdf`, and `~/Library/Application Support/Steam/userdata/35601368/config/shortcuts.vdf` (1015 bytes). Never commit real files. Record divergences in `75-PARITY.md` (shape: `73-PARITY.md`).

---

### `steamFilesPortComplete.test.ts` (delete gate)

**Analog:** `src/backend/__tests__/depotPortComplete.test.ts` (and `scannerPortComplete.test.ts`). Copy: `DELETED` list with `it.each(DELETED)('%s stays deleted', ...)`, `FORBIDDEN` symbols scanned via `walk(src)` + `walk(meta)` skipping `node_modules` and `__tests__`, `stripComments`, the self-test that proves the scan can fail, `KEPT` list (include `src-tauri/crates/gamelib-steamfiles/tests/fixtures/expected.json`), `SELF` exclusion, package.json assertions, and the walk-saw-at-least-500-files anti-vacuity check.
```ts
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
```
Phase 75 content: DELETED = `depot/finalizeAcf.ts`, `depot/appManifest.ts`, `src/common/typedefs/steam-shortcut-editor.d.ts`, TS readers/oracle/generator/sweep and their tests; FORBIDDEN = `@node-steam/vdf`, `steam-shortcut-editor`, `parseKv1`, both flag names; package.json must drop the two deps. Also check `lodash` (a steam-shortcut-editor dep) and knip baseline (`meta/knip-baseline.txt`) for other users. Keep depot's own FORBIDDEN list; note depotPortComplete's comment "finalize.ts and manifest.ts survive only as finalizeAcf.ts / appManifest.ts" must be updated when those go.

### `steamFilesChannelParity.test.ts`

**Analog:** `src/backend/scanners/__tests__/scanChannelParity.test.ts` (static reads, no spawn). Key parts:
```ts
function extractConst(source: string, name: string): string[] {
  const m = new RegExp(`pub const ${name}:[^=]*=\\s*&\\[([^\\]]*)\\]`).exec(source)
  ...
}
// channels == OPS minus CLI_ONLY_OPS; TS types ops == OPS; every shell arm is
// /^ {8}RustInvokeChannel::(Scan[A-Za-z0-9]+) => rpc_(\w+)\(args\),$/gm  with the snake-cased arm name == handler name
```
Uses `readTauriShellProductionSource` / `readHandlerBody` from `backend/testUtils/tauriShellSource` and asserts the handler body validates its generated Args then passes straight to the crate `dispatch`. Include an anti-vacuity assertion on the extracted op count.

### `stubRustSteamFiles.ts` (test util)

**Analog:** `steam/bridge/__tests__/fixtures/stubRustScan.ts`: a small `switch (op)` test double over the rustInvoke leaf doing only what caller tests need on real temp files (e.g. trivial `StateFlags`/`buildid` regex read), "not a parser". Replaces every `jest.mock('@node-steam/vdf')` (about 15 test files: library.*, removeCopies, games, macArchKnownFixRouting, steamStartupKeyringDeferral, bridgeRouteVerdict, appManifest, shortcutsFlows).

### CI, package.json, lockfile test

- `.github/workflows/rust-test.yml` line 117: `cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli` becomes `... -p gamelib-steamfiles -p gamelib-steamfiles-cli`; update the comment on line 70 ("(g) The Tauri-free crates ... are covered only by ...") and the step name on line 114. Workspace crates are not default members; a new crate needs its own `-p` entry (README section 8). The CLI is built on all three legs through that test run.
- `package.json` line 83-86: add `"steamfiles-cli:build": "cargo build -p gamelib-steamfiles-cli --manifest-path src-tauri/Cargo.toml"` and prefix it on `bridge-census` (`pnpm scan-cli:build && pnpm steamfiles-cli:build && ...`); a `steamfiles-parity-sweep` script modelled on line 85.
- `src/backend/__tests__/cargoFeatures.test.ts` `EXPECTED_LOCKFILE_CRATE_NAMES` (line 189, `// prettier-ignore` block): regenerate from `src-tauri/Cargo.lock` (`grep '^name = ' Cargo.lock | sed ... | sort -u`) if the crate list changes (the two new workspace crates, plus `winreg` only if added as a direct dep).
- Clippy ratchet (`meta/clippyRatchet.cjs`, baseline files) is shrink-only; run `cargo clippy --workspace`.

## Shared Patterns

### Paths in, typed results out; bytes never cross the pipe (63 D-08)
**Source:** `src/backend/scanners/rustScan.ts` + `scanTypes.ts` header ("Every args field is a `string`").
**Apply to:** every `steamfiles_*` channel. Only exception: `shortcuts_apply` takes a described mutation (typed entry object), still never a buffer.

### Results, not errors
**Source:** `gamelib-scan/src/lib.rs` header and `steamstub_missing_file_is_a_result`.
**Apply to:** all Rust ops. `Err` = `bad-args` / `unknown-op` / `panic` / `serialize` only. Missing/unreadable/malformed files resolve with `parsed:false` / `readError`.

### Async relaxation
**Source:** 63 D-09. **Apply to:** all sync readers (`readAppManifestFlags`, `readMacRunningAppId`, `buildInstalledMap`, `getSteamLibraries` already async). Same name, now `Promise`; every caller is `await`ed; pollers pinned against overlapping ticks.

### Sidecar exit contract
**Source:** `rustScan.ts` header; `Skill("gamelib-conventions")`.
**Apply to:** all new TS modules: no timers, handles or work at import. `config.ts` boot-time discovery must be one bounded invoke resolved before settings construction and cached (RESEARCH Pitfall 8); no unbounded in-flight work at boot.

### Fake-HOME isolation
**Source:** `meta/gamelibScanCli.ts` and `meta/depotParitySweep.ts` (`createFakeHomeProfile({ prefix })`, fresh per spawn, `profile.childEnv(process.env)`, `dispose()` in `finally`).
**Apply to:** `meta/gamelibSteamfilesCli.ts`, sweep script, any Jest test that spawns the CLI. Rust CLI tests use `env_clear()` (see `gamelib-scan-cli/tests/cli.rs`).

### Atomic same-dir write
**Source:** `gamelib-depot/src/acf.rs` 173-195. **Apply to:** ACF write and `shortcuts.vdf` write (tmp + `sync_all` + rename; remove tmp on error; no `.bak`; re-read before apply, never cache a tree across calls since Steam may rewrite the file).

### Untrusted input limits
**Source:** `valveClient.ts` (size cap before parse, forbidden keys); `gamelib-scan` truncation test.
**Apply to:** both parsers: max depth, byte cap, tolerant EOF, BOM/CRLF/non-UTF-8 handled; `installdir`/`path` values treated as untrusted (keep containment checks in `acfInstalldir.ts`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `gamelib-steamfiles/src/kv_text.rs` | parser | transform | No Rust text-VDF code exists; ACF builder in depot only WRITES. Use the oracle sources (`@node-steam/vdf@2.2.0` lib/index.js, `parseKv1`) as semantics to pin in fixtures. |
| `gamelib-steamfiles/src/kv_bin.rs` | parser | transform | No binary-KV code in repo; oracle is `steam-shortcut-editor@3.1.3` (types 0x00/0x01/0x02 only, lossy coercions). Binary tag set beyond those three is [ASSUMED] in RESEARCH (A1); the local byte-identical check on the real `shortcuts.vdf` is the proof. |
| Windows registry read (`winreg`/`windows-sys` impl of `Probe`) | utility | request-response | No Rust registry reader for Steam; only `repair_windows_gamelib_protocol_registration` in `src-tauri/src/main.rs` (quick-260925-uok) touches HKCU via `windows-sys` `Win32_System_Registry`, a usable FFI precedent. |

## Metadata

**Analog search scope:** `src-tauri/crates/*`, `src-tauri/src/{scan_dispatch,rust_dispatch,main}.rs`, `src/backend/scanners/`, `src/backend/storeManagers/steam/{depotRust,library,depot,bridge}`, `src/backend/{config,utils}.ts`, `src/backend/shortcuts/nonesteamgame/`, `src/common/types/{sidecarTransport,ipc/rustInvoke}.ts`, `meta/`, `.github/workflows/rust-test.yml`, `package.json`.
**Files scanned:** ~45 read in whole or in part (graphify used for orientation only; GRAPH_REPORT.md and graph.json not read).
**Pattern extraction date:** 2026-11-13
