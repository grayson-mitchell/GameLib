---
phase: 63-rust-migration-pattern-and-executable-scanners
reviewed: 2026-11-07T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - src-tauri/crates/gamelib-scan/src/lib.rs
  - src-tauri/crates/gamelib-scan/src/reader.rs
  - src-tauri/crates/gamelib-scan/src/contain.rs
  - src-tauri/crates/gamelib-scan/src/closure.rs
  - src-tauri/crates/gamelib-scan/src/macho.rs
  - src-tauri/crates/gamelib-scan/src/pe/mod.rs
  - src-tauri/crates/gamelib-scan/src/pe/sections.rs
  - src-tauri/crates/gamelib-scan/src/pe/drm.rs
  - src-tauri/crates/gamelib-scan/src/pe/imports.rs
  - src-tauri/crates/gamelib-scan/src/pe/delay.rs
  - src-tauri/crates/gamelib-scan/Cargo.toml
  - src-tauri/crates/gamelib-scan-cli/src/main.rs
  - src-tauri/crates/gamelib-scan-cli/Cargo.toml
  - src-tauri/Cargo.toml
  - src-tauri/src/store_embed.rs
  - src-tauri/src/main.rs
  - src/backend/scanners/rustScan.ts
  - src/backend/scanners/scanTypes.ts
  - src/backend/storeManagers/steam/bridge/peScan.ts
  - src/backend/storeManagers/steam/bridge/importScan.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/gameMakerRunner.ts
  - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/tools/machoExports.ts
  - src/backend/tools/dxmt.ts
  - src/common/types/sidecarTransport.ts
  - meta/gamelibScanCli.ts
  - meta/bridgeCensus.ts
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
status: issues_found
---

# Phase 63: Code Review Report

**Reviewed:** 2026-11-07
**Depth:** standard
**Files Reviewed:** 30 (plus package.json, .gitattributes, .github/workflows/rust-test.yml diffs; tests read for coverage only)
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the `gamelib-scan` crate, the CLI, the six `dispatch_rust_channel` pass-through arms, the TS wrappers, and the sync-to-async caller changes.

**Panic and bounds safety.** I found no reachable panic, unbounded allocation or overflowing offset in the PE and Mach-O parsers:
- Every PE read goes through `RangeRead::read_at`, which uses `checked_add` and has a 512-byte maximum length. All offset arithmetic saturates or widens to `u64`/`i128`.
- Every loop is capped: 96 sections, 1024 import descriptors, 256 delay descriptors, 4096 thunks, 4096 directory entries, 256-byte names, and the Mach-O load-command walk advances at least 8 bytes per iteration.
- `dispatch` wraps each op in `catch_unwind`, and the release profile does not set `panic = "abort"`, so the guard is effective.

**Closure walk.** It cannot loop forever. It has a depth limit of 2, a cap of 32 DLLs, a visited set, and one-normal-component name containment.

**Parity with the old TS.** Delay-import VA/RVA handling matches the deleted TS line by line, and so does the `..`-prefix quirk in `contained_real`.

**Async caller migration.** Every former sync call site (`detectDrmWrapper`, `detectExeSteamDrm`, `readLaunchExeCegMarkers`, `readPeImportedDllNames`, `checkWinemacMetalViewExports`, `scanSteamApiImports`) is now awaited. Each keeps its fail-closed fallback when the transport rejects.

**What remains:**
- The native import-table reader is stricter than the `objdump` it replaced, and that strictness is on the shim-placement path.
- The census silently treats a missing CLI binary as "no evidence".
- On Windows, `contained_real` turns UNC paths into relative paths.
- The rest is stale documentation and dead parameters.

## Warnings

### WR-01: Native steam_api import reader is all-or-nothing, and an unreadable exe now fails shim placement where objdump succeeded

**File:** `src-tauri/crates/gamelib-scan/src/pe/imports.rs:39-41, 109, 128-129, 146`; `src-tauri/crates/gamelib-scan/src/pe/mod.rs:147-154`; `src-tauri/crates/gamelib-scan/src/closure.rs:191-198`
**Issue:** `steam_api_import_table` returns `None`, which `scan_steam_api_imports` reports as `"not a parseable PE"`, if any one of these is true:
- any import descriptor, including non-steam ones, has a Name RVA that `rva_to_offset` cannot map;
- any descriptor name is longer than 256 bytes or has no terminator;
- any steam_api hint/name RVA is unmapped.

`rva_to_offset` maps RVAs through section bodies only. It does not handle the header region (RVA < SizeOfHeaders, file offset == RVA), which the Windows loader and objdump both accept and which some linkers and packers use for the import directory or its strings.

The old app path read this table with `objdump --private-headers`, which reports the readable descriptors even when other parts of the table are malformed. The new reader errors instead. `placeShimForGameInner` (`shimGenerate.ts:860-866`) passes that error straight back, so on these exes shim placement now fails where it used to succeed. The real-game sweep (63-11) only covers the games in the sweep.
**Fix:**
1. Map header-region RVAs in `rva_to_offset`, for example by passing `size_of_headers` into it:
   ```rust
   if rva >= 0 && rva < i128::from(size_of_headers) { return u64::try_from(rva).ok(); }
   ```
2. In `walk_import_descriptors`, skip a descriptor whose name RVA or name read fails instead of propagating `?`. Keep failing the whole result only when a steam_api descriptor itself cannot be read.

### WR-02: bridgeCensus treats a missing or failed `gamelib-scan-cli` as "no delay evidence" and "not CEG"

**File:** `meta/bridgeCensus.ts:1435-1446`, `meta/bridgeCensus.ts:2199-2210`; `meta/gamelibScanCli.ts:84-85`
**Issue:**
- `runScanCliSync` throws a deliberately clear `missingBinaryError` when the binary is absent.
- Both census wrappers catch every exception and return `null`.
- If the census is run any way other than `pnpm bridge-census` (for example `node meta/runTs.cjs ... meta/bridgeCensus.ts` directly, or after `cargo clean`), the binary is missing. Every exe then silently reads as having no delay imports and no Steam DRM, and the census prints a plausible but wrong verdict table.
- A spawn error, non-zero exit or unparseable output is swallowed the same way.
**Fix:** Check for the binary once, up front, and abort with the message:
```ts
const cli = resolveScanCliPath()
if (!existsSync(cli)) throw new Error(`gamelib-scan-cli not found at ${cli}; run pnpm scan-cli:build`)
```
In each wrapper, swallow only the result-level case (`readError !== null` / `!parsed`). Let transport and CLI errors propagate, or at least log them.

### WR-03: `contained_real` returns a relative path for UNC paths on Windows

**File:** `src-tauri/crates/gamelib-scan/src/contain.rs:30-39`
**Issue:**
- On Windows, `std::fs::canonicalize` returns `\\?\UNC\server\share\...` for network paths.
- `display_path` strips only the `\\?\` prefix, which leaves `UNC\server\share\...`, a relative path.
- That value becomes `real` and is passed to `detectDrmWrapper` / `detectExeSteamDrm`, which resolve it against the sidecar's cwd. The read fails, so a SteamStub or CEG exe on a network share reads as "unknown, not CEG".
- The old Node `realpath` returned `\\server\share\...`.

The impact is limited if the bridge never runs on Windows, but the crate and its CLI are cross-platform, and CI runs a Windows leg.
**Fix:**
```rust
if let Some(rest) = s.strip_prefix(r"\\?\UNC\") { return Some(format!(r"\\{rest}")); }
if let Some(stripped) = s.strip_prefix(r"\\?\") { return Some(stripped.to_string()); }
```
Add a `#[cfg(windows)]` unit test for this.

## Info

### IN-01: Dead `_caller` parameters across the migrated wrappers

**File:** `src/backend/storeManagers/steam/bridge/peScan.ts:16,36`; `importScan.ts:62`; `shimGenerate.ts:519`; `drm/drmScanExe.ts:50-54`; `src/backend/tools/machoExports.ts:21`
**Issue:** Every wrapper takes a `_caller` / `caller` argument that it never reads. These look left over from the deleted flag and oracle dispatch. Callers still pass distinct labels (`'bridgeScan'`, `'gameMakerRunner'`, ...), which suggests the label shows up in logs. It does not.
**Fix:** Remove the parameters, or use them in the existing `logWarning` text.

### IN-02: Stale documentation still describes objdump and `peSteamDrm.ts`

**File:** `src/backend/storeManagers/steam/bridge/importScan.ts:26-30, 52-58`; `peScan.ts:1-4`; `shimGenerate.ts:458`; `stores.ts:319`; `meta/bridgeCensus.ts:82, 246`; `drm/steamclientLayerMode.ts:12`; `managedImports.ts:21`
**Issue:**
- The `scanSteamApiImports` doc says "Never throws -- objdump failure (non-zero exit / spawn error / missing file) surfaces as…". objdump is no longer involved.
- The module header still says the delay table is read "with the zero-spawn ranged reader in `peSteamDrm.ts`".
- `peScan.ts` says "`peSteamDrm.ts` stays the pure TS oracle substrate", but that file was deleted in 63-14.
- Several other comments point at the deleted file.
**Fix:** Point the comments at `gamelib-scan` (`pe/drm.rs`, `pe/delay.rs`, `closure.rs`) and drop the objdump wording.

### IN-03: The `OPS` doc comment contradicts its contents

**File:** `src-tauri/crates/gamelib-scan/src/lib.rs:15-26`
**Issue:** `OPS` is documented as "Ops reachable from the sidecar", but it contains `scan_pe_delay_imports`. That op has no `dispatch_rust_channel` arm and is not in `RUST_INVOKE_CHANNELS`. The CLI comment (`main.rs:39`) and `scanTypes.ts:31-35` describe the relationship correctly.
**Fix:** Change the doc to "Ops the library dispatches (superset of the sidecar channels; see `CLI_ONLY_OPS`)".

### IN-04: The "cycle guard" comment overstates what the check does

**File:** `src-tauri/crates/gamelib-scan/src/pe/drm.rs:75-78`
**Issue:**
- The comment says "a subdirectory must sit strictly after its parent", but the check only rejects `sub_rel == 0`. A subdirectory placed before the root is accepted.
- This is harmless: the walk is fixed at two levels and does not recurse, so no cycle is possible.
- The comment could mislead someone into adding recursion later on the strength of a guard that does not exist.
**Fix:** Reword the comment to say what the check does (it rejects a self-referencing RT_RCDATA directory), or enforce `sub > root` if that is the intent.

### IN-05: Crafted resource tables can make `scan_steam_drm` run for a very long time

**File:** `src-tauri/crates/gamelib-scan/src/pe/drm.rs:70-100`
**Issue:**
- A PE can declare 4096 RT_RCDATA root entries that all point at one subdirectory, which itself has 4096 named entries.
- That is about 16.7M iterations, and each one makes two or three `FileReader::read_at` calls (a seek plus a read syscall each).
- Run time can exceed the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`. The worker thread is abandoned, not cancelled.
- The old TS had the same loop structure, so this is not a regression.
**Fix:** Skip duplicate `sub` offsets with a small `HashSet<u64>`, or cap total name reads (for example at 4096).

### IN-06: A transport timeout in `detectLaunchDrmWrapper` repeats once per Unreal candidate

**File:** `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts:116-170`
**Issue:**
- Before this phase, a failed root `realpath` returned early.
- Now a rejected `scan_contained_real` (which in practice means a 60 s rustInvoke timeout) returns `reason: null`. The launch path then continues to `findUnreal` and runs a containment call for every Shipping exe candidate, and each can wait another 60 s.
- When the Rust side is wedged, launch is delayed by 60 s × (1 + candidates).
**Fix:** Have `containedUnder` report a transport failure distinctly (for example `reason: 'transport'`), and return `own` immediately on it, as it already does for `root-unresolvable`.

### IN-07: Opening a FIFO in the game folder blocks a Rust worker thread forever

**File:** `src-tauri/crates/gamelib-scan/src/reader.rs:27-31`; `src-tauri/crates/gamelib-scan/src/closure.rs:130-140`
**Issue:**
- `File::open` on a named pipe blocks until something opens the other end.
- The closure walk checks only `full.exists()`, which follows symlinks, so a `foo.dll` FIFO or a symlink to one in the game directory hangs the scan.
- The sidecar times out after 60 s, but the Rust worker thread is leaked for the life of the process.
- objdump would also have blocked, but that was a separate child process.
**Fix:** In `FileReader::open` and `read_prefix`, refuse anything that is not a regular file before opening:
```rust
if !std::fs::metadata(path)?.is_file() { return Err(io::Error::new(io::ErrorKind::InvalidInput, "not a regular file")); }
```
Or open with `O_NONBLOCK` on Unix.

---

_Reviewed: 2026-11-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
