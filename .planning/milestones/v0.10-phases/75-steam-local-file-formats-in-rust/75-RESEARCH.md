# Phase 75: Steam local file formats in Rust - Research

**Researched:** 2026-11-13
**Domain:** Rust port of Steam text VDF/ACF, binary shortcuts.vdf, local library scan, Steam root discovery (third slice of the Node-to-Rust migration)
**Confidence:** HIGH on pattern and parser semantics (read from the installed oracle source); MEDIUM on binary-KV edge types and Windows registry testing

## Summary

This phase is a straight reuse of the 63/73 recipe (`src-tauri/crates/README.md` sections 1-8). The new work is not plumbing; it is two parsers whose oracles have quirks that a "Steam-correct" Rust parser will not reproduce by default. The planner must treat those quirks as explicit parity cases, not surprises (D-07).

`@node-steam/vdf@2.2.0` (read from `node_modules/@node-steam/vdf/lib/index.js`) is a 114-line line-oriented regex parser. It coerces values (`"0123"`/`"1e3"`/`"0x10"` become JS numbers, `true`/`false`/`null`/`undefined` become literals), does NOT unescape backslashes, accepts unquoted `[a-z0-9_-]` tokens, merges duplicate sibling keys (object value re-opens the existing object, scalar overwrites), and is case-sensitive. `steam-shortcut-editor@3.1.3` parses binary KV with only types 0x00/0x01/0x02 and silently drops anything else, then lossily coerces 0/1 to booleans, numeric-keyed maps to arrays and `LastPlayTime` to Date. Both behaviours are what D-09/D-06 deliberately replace.

**Primary recommendation:** Create ONE new crate `gamelib-steamfiles` (+ `gamelib-steamfiles-cli`) that owns the lossless text-KV tree, binary-KV tree, typed ACF readers, scan, discovery. Make `gamelib-depot/src/acf.rs` depend on it (move the ACF text *builder* into the new crate and re-export from depot) so there is exactly one ACF codec. Do not make depot depend on a scan crate and do not duplicate the builder.

<user_constraints>
## User Constraints (from CONTEXT.md)

Locked decisions D-01..D-14 and the carried 63/73 decisions are in `75-CONTEXT.md`; the planner MUST read it. Summary of load-bearing ones:

- D-01 Rust owns typed readers + scan; TS keeps polling/state machines. No "parse anything to JSON tree" channel as the main boundary.
- D-02 owned-apps fetch/enrichment stays TS. D-03 residual TS ACF writer retired via Rust writer; delete `depot/finalizeAcf.ts`, `depot/appManifest.ts`.
- D-04 all 13 `@node-steam/vdf` import sites move. D-05 valveClient guards kept Rust-side (512 KiB cap, win64/bins_win64 shape check, forbidden keys rejected, validate BEFORE parse).
- D-06 fold `parseKv1` into the Rust parser; core tree keeps order + duplicate keys; views choose merged/last-wins or ordered list.
- D-07 Steam-correct wins; every divergence recorded in a parity record. D-08 two dev-only flags (text VDF, shortcuts.vdf), default rust after parity, deleted at the gate.
- D-09 lossless binary tree, byte-identical round-trip; D-10 two-part parity; D-11 atomic temp+rename writes, no .bak.
- D-12 discovery in Rust, `defaultSteamPath` setting always wins. D-13 Windows: HKCU `Software\Valve\Steam\SteamPath` then `%PROGRAMFILES(X86)%\Steam`. D-14 Linux order flatpak, `~/.steam/steam`, `~/.local/share/Steam`, snap; first with `steamapps/libraryfolders.vdf` wins, else `~/.steam/steam`; macOS unchanged.
- Delete gate (63 D-13 / 73 D-15): zero unexplained sweep diffs + live macOS `pnpm tauri:dev` smoke (library refresh, install polling, uninstall detection, running-app poll, add-to-Steam) + crate builds/tests on all 3 CI legs.

### Claude's Discretion
Crate placement (hard constraint: one ACF codec), channel names/JSON shapes, hot-path batching vs per-read rustInvoke, shortcuts mutation wire shape, Windows registry crate and how cargo test covers it, Jest mock-vs-spawn.

### Deferred Ideas (OUT OF SCOPE)
Porting polling state machines to Rust; owned-apps fetch/artwork enrichment (CM-client spike).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STEAM-03 | Milestone-level Steam local-file requirement (phase IDs minted by /gsd-plan-phase) | Whole document: one Rust codec for ACF/VDF/shortcuts/scan/discovery, deletion of both npm packages |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Steam stack is frozen except this phase explicitly replaces `@node-steam/vdf` (STEAM-STACK.md rejected-alternatives table stays valid for the rest). Read STEAM-STACK.md only for context.
- Conventions (`Skill("gamelib-conventions")`): any child spawn from `src/` or `meta/` uses `createFakeHomeProfile()` (CLI spawn for `bridgeCensus.ts`); sidecar timers/handles `unref()` and no unbounded in-flight work at boot (relevant to the async discovery-at-boot call); `<verify>` blocks use scoped `npx prettier --check <exact paths>` after `--file-info`; UAT item shape (`### N.` heading, `expected:`, `result:`); todos carry `severity:`/`platform:`/`ready:`.
- GSD workflow: repo edits go through a GSD command. Say `/gsd-execute-phase` (hyphen). Dev launch is `pnpm tauri:dev`, never `tauri:dev:run`. `tauri dev` does not rebuild the sidecar: restart dev / `pnpm build:sidecar` before live-testing; fresh worktree needs `build:sidecar-sea` + vite build. Run `graphify update .` after code changes.
- Project is independent of Heroic upstream; do not raise upstream mergeability.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Text KV1 parse, typed ACF/libraryfolders/registry readers | Rust crate (`gamelib-steamfiles`) | TS thin wrappers | D-01: schema knowledge in Rust |
| ACF write/finalize | Rust (`gamelib-depot` calling shared codec) | TS passes policy inputs | D-03, 73 D-11 |
| Installed-map scan across libraries + bottles | Rust | TS merges into library state | D-01 |
| shortcuts.vdf read/mutate/atomic write | Rust | TS builds entry values (icon, launch options, appid) | D-09/D-11; bytes never cross pipe |
| Steam root discovery | Rust (+CLI) | `config.ts` default + setting override | D-12 |
| Polling state machines, restartHold, resume, refresh orchestration | TS (sidecar) | - | D-01 out of scope |
| Owned-apps fetch, artwork | TS | - | D-02 |
| Valve client manifest guards | Rust | TS fetch (network stays TS) | D-05 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| serde / serde_json | 1 | dispatch args/results | Already in gamelib-scan and gamelib-depot [VERIFIED: Cargo.toml read] |
| tempfile (dev) | 3 | fixture dirs in tests | Already used by both crates [VERIFIED: Cargo.toml read] |
| winreg | 0.56.0 | Windows `HKCU\...\SteamPath`, `cfg(windows)` only | Already in Cargo.lock as transitive dep of tauri-build [VERIFIED: Cargo.lock line 1068 + `cargo search winreg`]. Alternative: `windows-sys` is already a depot dep (feature `Win32_System_Registry`) |

No parser crate: hand-write both parsers (see Don't Hand-Roll for why). `keyvalues-parser` / `steamy-vdf` exist but do not model: raw-bytes strings, `[$WIN32]` conditionals as ordered duplicates, byte-identical binary round trip, or the oracle's quirks. [ASSUMED] — not evaluated this session; rationale is the lossless requirement (D-09), which any crate would have to be audited against. Planner: do not add a third-party VDF crate without a checkpoint.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| winreg | windows-sys `Win32_System_Registry` | No new crate or lockfile entry; more unsafe FFI. Prefer winreg only if clippy ratchet allows; either way update `EXPECTED_LOCKFILE_CRATE_NAMES` if the crate list changes |
| New crate | Extend `gamelib-depot` | Pulls tokio/reqwest/zstd into scan/CLI builds and makes `rust-version` 1.89 for everything. New crate keeps 1.77.2 |

**Installation:** none (cargo). Add `gamelib-steamfiles = { path = "crates/gamelib-steamfiles" }` to `src-tauri/Cargo.toml`; depot depends on it too.

## Package Legitimacy Audit

slopcheck not run (this research session is read-mostly; install of PyPI tooling not attempted). Treat as unavailable.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| winreg | crates.io | long-established (0.56.0 current per cargo search) | high | github.com/gentoo90/winreg-rs | unavailable | [ASSUMED] for slopcheck; but already resolved in repo Cargo.lock via tauri-build, so low risk. Planner: gate the `[target.'cfg(windows)'.dependencies]` addition behind a `checkpoint:human-verify` or use windows-sys instead |

No npm installs. Packages removed: none. This phase removes two npm deps (`@node-steam/vdf`, `steam-shortcut-editor`) plus `src/common/typedefs/steam-shortcut-editor.d.ts`; check `knip` entries and `lodash` (steam-shortcut-editor's dep) for other users before assuming it leaves package.json.

## Architecture Patterns

### System Architecture Diagram

```
TS callers (steam/library/*, utils.getSteamLibraries, cancelDelete, macSteamAdoption,
            betaBranch, acfInstalldir, valveClient, nonesteamgame, config.ts)
        |  await invokeSteamFiles(deps, channel, {paths...})   (all-string args, no bytes)
        v
 rustInvoke over sidecar JSON-lines  --->  src-tauri/src/sidecar.rs dispatch_rust_channel
        |                                    "steamfiles_*" => gamelib_steamfiles::dispatch(op,args)
        v
 gamelib-steamfiles (Tauri-free, catch_unwind)
   kv_text  : tolerant KV1 tree (ordered, dup keys, raw escapes, conditionals)
   kv_bin   : lossless binary KV tree (type tags, order, unknown types)
   acf      : typed readers + builder/writer (shared with gamelib-depot)
   library  : libraryfolders -> roots; installed maps over libraries + bottles; registry RunningAppID
   shortcuts: read, add/update/remove mutation, atomic tmp+fsync+rename
   discover : per-OS root probe (winreg on cfg(windows))
        ^
        |  same dispatch
 gamelib-steamfiles-cli  <--- meta/gamelibSteamfilesCli.ts (createFakeHomeProfile per spawn) <--- meta/bridgeCensus.ts
 gamelib-depot --uses--> gamelib_steamfiles::acf (one codec)
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-steamfiles/{Cargo.toml,src/{lib.rs,kv_text.rs,kv_bin.rs,acf.rs,library.rs,shortcuts.rs,discover.rs},tests/{fixtures/,golden.rs,roundtrip.rs}}
src-tauri/crates/gamelib-steamfiles-cli/{Cargo.toml,src/main.rs,tests/cli.rs}
src/backend/storeManagers/steam/localFiles/  # invokeSteamFiles + thin wrappers keeping old names/result types
```
Mirror `gamelib-scan/src/lib.rs`: `dispatch(op,&[Value])`, sorted `OPS`, `CLI_ONLY_OPS`, `deny_unknown_fields` camelCase arg structs, results-not-errors (`readError`, `parsed:false`). Set `rust-version = "1.77.2"` and the two clippy deny lines. Moving the ACF builder out of depot: depot is `1.89` so it can depend on a `1.77.2` crate. Keep `AppManifestParams`/`build_app_manifest_text`/`write_app_manifest`/`vdf_escape` bodies byte-for-byte (depot golden tests in `gamelib-depot/tests/acf.rs` and golden.rs must stay green unchanged); keep `finalize`/`measure_installed_bytes`/`canWriteFullOwnership` in depot.

### Pattern 1: Core tree + views (D-06)
**What:** `enum Node { Str(RawStr), Map(Vec<(RawStr, Node)>) }` with a `conditional: Option<String>` on keys (`[$WIN32]`). Views: `merged(&Node)` implements @node-steam/vdf semantics (object value re-opens existing map; scalar last-wins) for ACF/libraryfolders/registry; `ordered(&Node)` for installscript.vdf.
**Wire:** typed result structs per channel, e.g. `steamfiles_read_acf {path}` -> `{parsed, readError?, appid, name, installdir, stateFlags, sizeOnDisk, buildid, lastOwner, ...}`.

### Pattern 2: Batch the hot path (discretion answer)
Install polling and runningPoll read about 1/s; `buildInstalledMap`/`buildIncompleteInstallSet`/`scanDownloadingAppIds`/`enumerateSteamInstallCopies` already loop over every ACF in a directory. Make the unit of rustInvoke "one directory/library scan" (`steamfiles_scan_installed {steamappsDirs[]}` returns an array of typed ACF records), not one invoke per ACF. Single-file reads (`readAppManifestFlags`, `readAcfState`, registry RunningAppID) are one invoke per tick, well inside the 60 s `RUST_INVOKE_TIMEOUT_MS`; no unbounded-channel needed. Verify call frequency in `installPollOnce.ts` before sizing.

### Pattern 3: shortcuts mutation as described edit (discretion answer)
Wire: `shortcuts_apply {path, op:"add"|"update"|"remove"|"ensure", entry?, match?}` with entry a typed JSON object (`{AppName:{s}, appid:{i32}...}` or plain JSON with explicit typing for int fields) — NOT read-tree/edit/write-tree, which would force the full tree (and `tags` maps, unknown fields) through TS and re-create the lossy-coercion problem. Rust: read bytes, parse lossless tree, apply, serialize, tmp+fsync+rename in same dir (copy the `write_app_manifest` helper). `checkIfShortcutObjectIsValid`/`checkIfAlreadyAdded` (title match, case-insensitive key lookup) should become result fields (`{valid, errors, existingIndex}`) from a `shortcuts_read_summary` op, keeping TS policy text.

### Pattern 4: Async relaxation (63 D-09)
Same names, now `Promise`. The cost is ordering in pollers: every `parse(readFileSync())` inside a loop becomes an await; check each tick for re-entrancy (an overlapping `setInterval` tick now can interleave). Pin with tests that call the poller twice.

### Anti-Patterns to Avoid
- Returning the parsed tree as JSON from the sync ACF path (violates D-01 and re-introduces JS number coercion in TS).
- Per-ACF rustInvoke inside `for` loops over hundreds of manifests.
- Keeping `autoConvertBooleans` semantics: Steam stores `IsHidden`, `AllowOverlay` etc. as int32; round-trip must keep int32, with TS asking for ints.
- A second ACF builder in the new crate while depot keeps its own.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file write | New temp-rename code | Copy `write_app_manifest`'s tmp + `sync_all` + rename pattern (extract to one helper in the shared crate) | Already proven; D-11 |
| catch_unwind dispatch, OPS/arm parity test | New scaffolding | Copy `gamelib-scan/src/lib.rs` + `scanChannelParity.test.ts` style static test | README section 2-3 |
| Fake-HOME CLI spawn | env literal | `createFakeHomeProfile({prefix})` (see `meta/gamelibScanCli.ts`) | Convention; fakeHomeIsolation test |
| shortcut id/appid hashing | Re-implement | Keep `generateShortcutId`/`generateAppId` in TS (policy, not file format) | Out of file-format scope |

**Key insight:** the two parsers are small; the cost is in matching/deciding quirks, not writing them. Hand-write, and pin every quirk with a fixture.

## Runtime State Inventory

Not a rename phase, but this is a codec replacement over live user data, so the equivalent:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Real user files: every ACF (Steam libraries + bridge bottles), `libraryfolders.vdf`, `registry.vdf`, cached Valve manifests, `installscript.vdf`, `userdata/35601368/config/shortcuts.vdf` (1015 bytes, exists) | Local sweep only; never commit |
| Live service config | Running Steam client may rewrite `shortcuts.vdf`/ACFs concurrently | Atomic write; re-read before apply (no cached tree across calls) |
| OS-registered state | None | None |
| Secrets/env vars | New dev flags (names to be chosen, e.g. `GAMELIB_STEAMFILES_TEXT=rust|ts`, `GAMELIB_STEAMFILES_SHORTCUTS=rust|ts`) | Env-only per README section 5; deleted at gate |
| Build artifacts | `gamelib-steamfiles-cli` binary needed by `bridge-census`; new `package.json` build script (`steamfiles-cli:build`) must prefix it; Cargo.lock + `EXPECTED_LOCKFILE_CRATE_NAMES` in `cargoFeatures.test.ts`; `.github/workflows/rust-test.yml` explicit `-p` lists (test + CLI build step) | Update all three in the crate-creating plan |

## Common Pitfalls

### Pitfall 1: Oracle value coercion changes types the callers rely on
`@node-steam/vdf` returns numbers for numeric strings (macSteamAdoption.ts:154 comments on this) and also "0123"->123, "1e3"->1000, "0x10"->16, "Infinity"... and true/false/null. Typed Rust readers must return the field type each caller actually wants (u64 vs string), and LastOwner must stay a string (D-03; a SteamID64 exceeds 2^53 so JS number coercion corrupts it — Rust is better here, record as accepted divergence).
**How to avoid:** per-field table of current caller usage (number vs string) before defining result structs; pin with fixtures including a >2^53 value.

### Pitfall 2: Escape handling
Oracle keeps `\\` and `\"` undecoded (regex captures raw). Windows `libraryfolders.vdf` paths are `C:\\Games` in the file. Check what callers do with them (`getSteamLibraries` passes them to `existsSync` directly, so on Windows the oracle returned doubled slashes, which Windows tolerates). Steam-correct decoding yields single backslashes; decide per field, document as a divergence (D-07). `parseKv1` also leaves `\\` undecoded (its own doc comment).

### Pitfall 3: Duplicate keys and conditionals
`installscript.vdf` has duplicate sibling keys (two `"4.8"` entries; second is real). Merged view for ACF/libraryfolders, ordered for installscript. `[$WIN32]`-style conditionals: oracle regex fails or mis-parses (line with trailing token) — pin behaviour with fixtures; Steam-correct is to treat the conditional as part of the key token or attach it.

### Pitfall 4: Tolerant vs strict on malformed input
Oracle throws SyntaxError on unbalanced braces; callers fail-soft (runningPoll returns 0, installedMap skips). Rust returns `{parsed:false}`; keep each caller's fail-soft mapping. Also handle UTF-8 BOM, CRLF, unterminated strings, EOF in nested map, non-UTF-8 bytes (use lossy or raw bytes; ACF names occasionally non-UTF-8).

### Pitfall 5: shortcuts.vdf binary details
Steam binary KV has more types than steam-shortcut-editor handles: 0x00 map, 0x01 string, 0x02 int32, plus 0x03 float32, 0x04 ptr, 0x05 wstring, 0x06 color, 0x07 uint64, 0x0A int64 [ASSUMED — from Valve KeyValues binary format knowledge, not verified this session]. The oracle silently drops/mis-reads unknown types (its `switch` has no default: `val` undefined and no bytes consumed, desynchronising the stream). Keep unknown-type nodes opaque or fail whole-file parse with `parsed:false` and refuse to write (never rewrite a file you cannot round-trip). Other byte-identity risks: trailing bytes after the final 0x08 (Steam writes `\x08\x08`), empty map vs empty file, duplicate keys, key order (`"0","1","10","2"` lexical vs numeric: preserve file order), strings with embedded invalid UTF-8 (store as bytes), NUL-less truncation. The oracle's arrays-by-numeric-key conversion indexes by key, so non-contiguous keys produce sparse arrays; Rust must re-key new entries as max+1 (or lowest unused) and document which Steam does [ASSUMED: oracle appended via array index; check against the oracle in the logical-parity test].
**How to avoid:** fixtures for: empty shortcuts, one entry, entry with `tags`, unknown type, trailing bytes, sparse indexes. Round-trip test: `serialize(parse(bytes)) == bytes` over the committed fixtures and the local real file.

### Pitfall 6: `new` file creation path
`nonesteamgame.ts` writes `{ shortcuts: [] }` when missing; Rust must produce the exact bytes Steam expects (`\0shortcuts\0\x08\x08`) and `mkdirSync(configDir)` currently non-recursive. Keep as TS policy or move to the same op; test creation from nothing.

### Pitfall 7: Windows/Linux discovery without a live box
`cargo test` on Windows leg: structure `discover` as pure function over an injected `Probe` trait (home, env, `read_registry(key,value)`, `exists`) with a real impl under `cfg(windows)`. Unit-test the decision logic on every OS with a fake probe; the real winreg impl gets a compile check (and a smoke that does not assert a value). Linux flatpak "installed-check" (`isFlatpakSteamInstalled` over `/var/lib/flatpak` and `~/.local/share/flatpak`, `app/<id>`) must also move behind the probe; Snap path is new.

### Pitfall 8: config.ts default is synchronous
`defaultSteamPath: getSteamCompatFolder(userHome)` runs in settings construction (`config.ts:327`). Options: resolve once in the sidecar boot path before the settings object is built and cache (preferred), or keep the TS function as the `ts` flag fallback. Caution against sidecar exit contract: the boot-time probe must be bounded (single short invoke, no timers). Headless tools get the same answer through the CLI. A user-set `defaultSteamPath` always wins; the Rust call must only compute the default. Also `getSteamLibraries` hard-codes `/usr/share/steam` and the trailing `existsSync` filter: preserve in TS or in the Rust op.

### Pitfall 9: Delete-gate test and dead code
Mirror `scannerPortComplete.test.ts` / `depotPortComplete.test.ts`: a `steamFilesPortComplete.test.ts` asserting deleted paths (`depot/finalizeAcf.ts`, `depot/appManifest.ts`, the `.d.ts`), forbidden symbols (`@node-steam/vdf`, `steam-shortcut-editor`, `parseKv1`), kept fixtures. Tests that `jest.mock('@node-steam/vdf')` (about 15 test files listed by grep: library.*, removeCopies, games, macArchKnownFixRouting, steamStartupKeyringDeferral, bridgeRouteVerdict, appManifest, shortcutsFlows) need a small stub (like `stubRustScan.ts`), not a parser.

### Pitfall 10: valveClient guard ordering
Size cap and forbidden-key regex run on text BEFORE parse (valveClient.ts:131-136). The fetch stays TS, so the text must cross the pipe to Rust, which contradicts "bytes never cross" unless written to a temp file first or sent as a bounded (<=512 KiB) string arg. Decide: TS keeps the cheap size cap on fetch (`maxBytes` already enforced at line 536) and writes the manifest to its cache file, then passes the path; Rust re-checks size and rejects forbidden keys. Flag as open question below.

## Code Examples

### Dispatch skeleton (copy from gamelib-scan)
```rust
// Source: src-tauri/crates/gamelib-scan/src/lib.rs (read via README section 2)
pub const OPS: &[&str] = &[/* sorted */];
pub fn dispatch(op: &str, args: &[serde_json::Value]) -> Result<serde_json::Value, String> {
    // catch_unwind around the op; panic => Err; bad args/unknown op => Err; I/O or parse failure => Ok(result{readError})
}
```

### Oracle behaviours to pin (verified by reading source)
```js
// node_modules/@node-steam/vdf/lib/index.js: value coercion + no unescape
if (val !== '' && !isNaN(val)) val = +val        // "0x10" -> 16, "1e3" -> 1000
if (val === 'true') val = true; // 'false','null','undefined' likewise
// duplicate key: object value re-opens existing object; scalar overwrites
```
```js
// node_modules/steam-shortcut-editor/lib/parser.js: types 0x00/0x01/0x02 only; 0/1 ints -> booleans
// (autoConvertBooleans); all-numeric keys -> array; LastPlayTime -> Date. Writer: Date/bool -> int32.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TS `@node-steam/vdf` readers + Rust ACF writer (two codecs) | One Rust codec | this phase | removes drift risk |
| In-place `writeFileSync` shortcuts.vdf | tmp + rename | this phase | no truncated file on crash |

**Deprecated/outdated:** `steam-shortcut-editor` lossy coercions; `parseKv1` duplicate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Binary KV extra type tags (0x03,0x04,0x05,0x06,0x07,0x0A) and Steam trailing `\x08\x08` layout | Pitfall 5 | Round-trip bug on real file; mitigated by local byte-identical check of the real file and "refuse to write if unparsed" rule |
| A2 | No third-party Rust VDF crate fits lossless requirement | Standard Stack | Wasted hand-roll effort; low |
| A3 | New-entry index choice (max+1 vs lowest unused) | Pitfall 5 | Steam may renumber; compare with oracle in logical parity test |
| A4 | winreg legitimacy (slopcheck unavailable) | Package audit | Mitigated: already in Cargo.lock transitively |
| A5 | Call frequency of hot-path reads is about 1/s and single-file | Pattern 2 | Need re-check in installPollOnce.ts |

## Open Questions (RESOLVED)

1. **valveClient manifest transport (Pitfall 10).** Path-after-write vs bounded string arg. Recommendation: write-to-cache-then-path; Rust re-validates size and forbidden keys. Planner to confirm against `valveClient.ts` cache flow.
   RESOLVED: plan 17 — write-to-cache-then-path: the fetched manifest is written into the run's own mkdtemp `.partial-` dir and its path is passed to `steamfiles_parse_valve_manifest`; Rust re-applies the size cap, forbidden-key reject and shape checks in the same order.
2. **Divergence list for the parity record.** Known up-front candidates: Windows `\\` unescape, big-integer fields (LastOwner), `[$WIN32]` keys, numeric-string coercion, malformed-input tolerance. Each needs a user acceptance entry in `75-PARITY.md`.
   RESOLVED: plan 24 — the local sweep writes every divergence (golden overrides plus sweep diff classes plus the D-13/D-14 discovery changes) as a DV-75-NN row in `75-PARITY.md`, and a blocking operator checkpoint accepts each one (D-07).
3. **Where does the new ACF text builder live for depot?** Recommended: shared crate re-exported by depot; planner must keep depot tests unchanged as the safety net.
   RESOLVED: plan 07 — the builder moves into `gamelib-steamfiles::acf` and is re-exported from `gamelib-depot`; depot's acf and golden tests run unchanged.
4. **config.ts async default** (Pitfall 8): boot-time cache vs lazy; planner reads `config.ts` settings construction and its callers.
   RESOLVED: plan 14 — neither: the shell computes discovery in Rust and passes it as `GAMELIB_STEAM_ROOT_DEFAULT` at sidecar spawn (plan 12); `config.ts` reads the env synchronously, so construction stays sync with no boot-time rustInvoke.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cargo/rustc | crate build/test | yes | cargo 1.99.1 | none needed |
| Real macOS Steam files (ACFs, registry.vdf, shortcuts.vdf) | local sweep, byte-identical check | yes | shortcuts.vdf (1015 B) present at `userdata/35601368/config/` | committed synthetic fixtures (CI) |
| Windows/Linux machine | discovery live check | no | - | build + cargo test with fake probe (per CONTEXT) |
| slopcheck | package audit | not run | - | winreg flagged [ASSUMED], planner gate |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (Rust crates) + Jest (TS callers, parity, delete-gate tests) |
| Config file | `src-tauri/Cargo.toml` workspace; Jest config in repo root |
| Quick run command | `cd src-tauri && cargo test -p gamelib-steamfiles -p gamelib-steamfiles-cli` |
| Full suite command | `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli` plus `pnpm jest src/backend/storeManagers/steam src/backend/shortcuts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEAM-03 | Text KV parse + views (merged/ordered), quirks pinned | unit/golden | `cargo test -p gamelib-steamfiles --test golden` | Wave 0 |
| STEAM-03 | Typed ACF/libraryfolders/registry readers == TS oracle on fixtures | Jest parity | `pnpm jest steamFilesParity` (oracle captured before deletion, then golden-only) | Wave 0 |
| STEAM-03 | shortcuts.vdf byte-identical round-trip + atomic write + logical edit parity | unit | `cargo test -p gamelib-steamfiles --test roundtrip` | Wave 0 |
| STEAM-03 | Discovery decision logic per OS (fake probe) | unit | `cargo test -p gamelib-steamfiles discover` | Wave 0 |
| STEAM-03 | OPS == channel constants == match arms | static Jest | `pnpm jest steamFilesChannelParity` | Wave 0 |
| STEAM-03 | ACF builder shared: depot goldens unchanged | unit | `cargo test -p gamelib-depot --test acf --test golden` | exists |
| STEAM-03 | finalize rules (measured bytes, fail-closed gate, cancel never downgrades) through Rust for no-depots finalize | Jest/cargo | `pnpm jest depotRust` | partly exists |
| STEAM-03 | Delete gate (paths gone, symbols absent, walk >= 500 files) | Jest | `pnpm jest steamFilesPortComplete` | Wave 0 |
| STEAM-03 | Local sweep over real files, zero unexplained diffs; zero inputs fails | script (local, deleted) | `pnpm steamfiles-parity-sweep` (exit 0 clean/1 diff/3 no inputs) | Wave 0 |
| STEAM-03 | Live macOS smoke (refresh, install poll, uninstall detect, running poll, add-to-Steam) | manual UAT | `pnpm tauri:dev`; UAT items each name the log line proving Rust path | Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test -p gamelib-steamfiles` plus the touched Jest file
- **Per wave merge:** full suite command above, `cargo clippy --workspace` (ratchet is shrink-only; baseline files in repo), `pnpm tsc` for TS wrappers
- **Phase gate:** full suite green on all CI legs + sweep clean + live UAT before the delete plan and `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `gamelib-steamfiles` and `-cli` crates, fixtures (synthetic ACF incl. quirks, libraryfolders incl. Windows paths, registry.vdf, installscript with duplicates, valve manifest, shortcuts.vdf variants), `golden.rs`, `roundtrip.rs`
- [ ] TS oracle capture generator, run BEFORE deleting `@node-steam/vdf`/`steam-shortcut-editor`/`parseKv1` (73-08 precedent), committing `expected.json`
- [ ] Stub for Jest callers replacing `jest.mock('@node-steam/vdf')`
- [ ] `rust-test.yml` `-p` entries (test + CLI build), `EXPECTED_LOCKFILE_CRATE_NAMES`, `package.json` `steamfiles-cli:build` prefixed into `bridge-census`, knip entries

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3 Auth/Session | no | - |
| V4 Access Control | no | - |
| V5 Input Validation | yes | Network-sourced Valve manifest: size cap, shape check, forbidden-key reject before parse (D-05); `deny_unknown_fields` arg structs; recursion depth limit and total-size limit in both parsers |
| V6 Cryptography | no | - |
| V12 Files | yes | Atomic same-dir temp+rename; no symlink-follow surprises; paths in = TS-resolved, containment where a path derives from file content (installdir from an ACF) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Deeply nested / huge KV causing stack overflow or OOM (a panic is caught, a stack overflow is not) | DoS | Explicit max depth (e.g. 64) and byte cap; iterative or depth-guarded recursion |
| Path traversal via ACF `installdir` or libraryfolders `path` | Tampering | Keep existing containment checks in callers (`acfInstalldir.ts`); treat values as untrusted |
| Truncated shortcuts.vdf on crash | Tampering/Availability | Atomic write (D-11), refuse write when parse failed |
| Prototype-pollution keys in manifest | Tampering | Reject for behavioural parity (D-05) |
| Test spawns reading real profile | Info disclosure | `createFakeHomeProfile()` (convention) |

## Sources

### Primary (HIGH confidence)
- Read this session: `75-CONTEXT.md`; `src-tauri/crates/README.md`; `gamelib-depot/src/acf.rs`, `Cargo.toml`; `gamelib-scan/Cargo.toml`; `node_modules/@node-steam/vdf/lib/index.js` (2.2.0); `node_modules/steam-shortcut-editor/lib/{parser,writer,constants}.js` (3.1.3); `nonesteamgame.ts`, `config.ts`, `utils.ts getSteamLibraries`, `sharedRedists.ts parseKv1`, `valveClient.ts` constants; `src-tauri/Cargo.lock` (winreg); `rust-test.yml` grep; `cargo search winreg`.

### Secondary (MEDIUM)
- `.planning/phases/73-*/73-PARITY.md`, `73-RESEARCH.md` structure (shape reference).

### Tertiary (LOW)
- Binary KV extra type tags and Steam trailing bytes: training knowledge only (A1). Not verified against Valve docs this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (reuse of existing crates), winreg MEDIUM
- Architecture: HIGH (63/73 precedent, README recipe)
- Pitfalls: HIGH for text-VDF oracle quirks (source read), MEDIUM for binary KV and hot-path frequency

**Research date:** 2026-11-13
**Valid until:** 2026-12-13
