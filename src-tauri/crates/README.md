# Moving sidecar code to Rust: the pattern

Worked example: Phase 63, the executable scanners (`gamelib-scan`, `gamelib-scan-cli`). Second
application: the Steam depot pipeline (`gamelib-depot`, Phase 73). History lives in
`.planning/phases/63-rust-migration-pattern-and-executable-scanners/`; this file is the recipe, not
the record.

## 1. Layout

The app crate (`src-tauri`) stays the workspace root. Each port adds:

| Path                          | What                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `src-tauri/crates/<name>`     | Tauri-free library. No `tauri` dependency, ever.              |
| `src-tauri/crates/<name>-cli` | Optional bin, only if `meta/` tools need the code headlessly. |

Current crates: `gamelib-scan`, `gamelib-depot`, `gamelib-steamfiles`, each with a `-cli`.

Every crate sets `rust-version = "1.77.2"` and the two `[lints.clippy]` deny lines
(`dbg_macro`, `todo`). Exception: `gamelib-depot` and `gamelib-depot-cli` set `rust-version = "1.89"`
because their dependencies need it (aes 0.9: 1.89; cbc, sha1, prost: 1.85). Adding a crate or dependency changes `Cargo.lock`: update
`EXPECTED_LOCKFILE_CRATE_NAMES` in the same commit (`cargoFeatures.test.ts` fails otherwise).

## 2. Library contract

`gamelib-scan/src/lib.rs` is the model.

- `dispatch(op: &str, args: &[Value]) -> Result<Value, String>`; `OPS` (sorted) lists the ops that
  have an app channel, `CLI_ONLY_OPS` those reachable only from the CLI.
- `dispatch` wraps the op in `catch_unwind`; a panic becomes `Err`, never a dead sidecar.
- Args are structs with `#[serde(deny_unknown_fields, rename_all = "camelCase")]`.
- Results, not errors: an unreadable file or malformed input is a normal result value
  (`readError`, `parsed: false`). `Err` is only for bad args, an unknown op or a panic. Callers
  then decide fail-open or fail-closed in one place.
- All args are strings (paths). No bytes cross the pipe.

## 3. App path

1. A `RUST_*` const in `src/common/types/sidecarTransport.ts` and an entry in
   `RUST_INVOKE_CHANNELS`.
2. A one-line `"op" => {` arm in `dispatch_rust_channel` (`src-tauri/src/sidecar.rs`) calling
   `<crate>::dispatch`.
3. A static parity test in the style of `src/backend/scanners/__tests__/scanChannelParity.test.ts`:
   `OPS` == the channel constants == the match arms.
4. A typed helper (`invokeScan` in `src/backend/scanners/rustScan.ts`) over `requestRustInvoke`.
5. Thin per-caller wrappers (`peScan.ts`, `importScan.ts`, `shimGenerate.ts`, `drmScanExe.ts`,
   `machoExports.ts`) each with an explicit fail-closed `catch` mapping and unchanged log text.
6. Caller tests mock `requestRustInvoke` (see `bridge/__tests__/fixtures/stubRustScan.ts`); parser
   behaviour is tested in Rust only.

## 4. Headless path

- `gamelib-scan-cli`: `<op> <json-object>`, `--list`, `--ndjson` (one `{op,args}` per stdin line,
  one `{ok,...}` per line out). Exit 64 on usage errors.
- `meta/gamelibScanCli.ts` spawns it argv-form (never a shell) with a fresh
  `createFakeHomeProfile({ prefix })` per spawn; the CLI reads no profile.
- `cargo build` never runs from `meta/`: a fake HOME hides `~/.cargo`. The `scan-cli:build`
  `package.json` script builds in the real environment and is a prefix of every script needing the
  binary (`bridge-census`). A missing binary fails with that command in the message.

## 5. Fallback flag during migration

Each unit had `GAMELIB_SCANNER_<NAME>=rust|ts` and a `SCANNER_DEFAULTS` table. Defaults started at
`ts`, flipped to `rust` per unit after a clean sweep, and the whole mechanism was deleted in 63-13.
It was env-only, not AppSettings: it is a developer rollback lever with a short life, and a
persisted user setting would have needed UI, migration and a removal path.

## 6. Parity harness

- **Tier 1 (permanent).** TS-builder fixtures, a generator that ran the TS oracle to produce
  `gamelib-scan/tests/fixtures/expected.json`, Jest asserting TS == golden and
  `cargo test -p gamelib-scan --test golden` asserting Rust == golden. A deliberate divergence is a
  per-case `rustOverride` and must carry a `divergenceNote` (D-07). The normaliser (port of the old
  `scanNormalize.ts`) is the exhaustive list of what parity ignores. After the oracle was deleted
  the fixtures and `expected.json` stay; new cases are written by hand with a Rust-verified value
  and a note naming the source of truth.
- **Tier 2 (local, deleted).** A sweep diffed oracle against Rust over the real bottles with
  redacted output (hash + basename) and exit 0 clean / 1 diff / 3 no inputs. Zero inputs must fail.

## 7. Verification and deletion

- The live gate is a UAT contract authored by one plan and run by a different one, following the
  live-gate-contract-authoring standard: each item names the log line that proves the Rust path ran.
- Deletion checklist: precondition (every UAT item resolved, every default flipped, divergences
  accepted); remove call-site flag reads; `git rm` modules, oracle, generator, sweep and their tests;
  `pnpm find-deadcode` and delete fixture builders only the deleted tests used; remove package.json
  scripts and knip entries; baseline lines may only be removed.
- Deletion gate: `src/backend/__tests__/scannerPortComplete.test.ts` asserts the paths stay
  deleted, forbidden symbols are absent (comments stripped), the intended exemptions still exist,
  `expected.json` still exists, and the walk saw at least 500 files.

## 8. CI

`.github/workflows/rust-test.yml` runs an explicit `cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli`
and `clippy --workspace` on both legs. Workspace crates are not default members, so a plain
`cargo test` in `src-tauri` silently skips them. A new crate needs its own `-p` entry.

## 9. Lessons from the scanner port

- **Divergences found (D-07).** One, in `scan_steam_api_imports`: four Fallout 2 executables are
  Watcom-linked PEs whose section VirtualSize is 0. `objdump` fails ("RVA for import table not
  found") and the TS oracle reported an error; the Rust reader follows the loader rule (raw size
  spans the section) and returns ok with no imports. Rust is right; pinned by the unit test
  `zero_virtual_size_section_spans_raw_size`. The user accepted it. 103 inputs, 4 diffs, the other
  scanners 0.
- **A5 (ordinal-only static imports).** No sweep diff was attributable to it; treated as holding on
  the real corpus and still pinned by the synthetic golden `import-ordinal-mixed`.
- **Live gate passed 7 of 8.** Item 3 first failed, then passed on retest: a tier-1 known-fix
  (`CX_GRAPHICS_BACKEND`) short-circuited the code path under test. A UAT title must not be
  pre-empted by a fixes or known-fix layer that skips the path being verified; check the title's
  config before choosing it. Item 6 (the `dxmtBootUpdate` caller) was blocked and accepted: no -DXMT
  copy can be made on Wine-11.21, so that caller is covered by unit tests only.
- **Keep the exemptions explicit.** `bridgeScan.ts`, `importParse.ts` and the census objdump arm
  were deliberately kept (outside the port list); the deletion gate asserts they still exist so the
  exemption is real, not forgotten.
- **Caller-test oracles.** Deleting the oracle broke tests that used it as a mock backend; replace
  with a small stub (`stubRustScan.ts`), not a parser.

## 10. Second worked example: the depot pipeline (Phase 73)

`gamelib-depot` and `gamelib-depot-cli` replaced about 21k lines of TypeScript (manifest fetch and
parse, chunk download, decrypt and decompress, file post-processing, reconcile, ACF finalize) and a
`worker_threads` decompress pool. History lives in
`.planning/phases/73-steam-depot-download-pipeline-in-rust/`. What it added to the recipe above:

- **The `JobHost` seam.** A long job needs to call back into Node (CDN auth tokens, request codes)
  and push events (progress, warnings). The crate stays Tauri-free by taking a `JobHost` trait
  (`emit`, token and request-code calls); `src-tauri/src/depot_dispatch.rs` implements it as
  `ShellJobHost` over the two primitives the shell already had, `SidecarState::invoke` for
  request/response and `write_frame` with `kind: "send"` for events. No new transport. The event
  queue is bounded and non-blocking. `finish()` drops the sender and joins the writer, so every
  queued event reaches the pipe before the outcome response. Tests use `events::test_support`'s
  `NullHost`.
- **One unbounded run channel, cancel on EOF (D-06, D-08).** `depot_job_run` is a single
  rustInvoke on `UNBOUNDED_RUST_CHANNELS` whose response is the final outcome. There is no
  start-then-poll, so a lost event cannot strand the caller, and the sidecar keeps
  `await downloadSteamDepots(...)`. A pending Promise is not a handle, so the sidecar exit contract
  still holds. The shell owns job lifetime. When its reader hits sidecar stdout EOF it calls
  `cancel_all()` and logs `[shell] depot jobs cancelled on sidecar EOF: <n>`. At app exit it waits
  at most 5 s for finalize. On the TS side, stdin-EOF abort fires the cancel and does not wait for it.
- **Capture the TS oracle before you delete it.** 73-08 ran the real TS pipeline over the
  synthetic corpus, serving chunks from a local HTTP server, and committed the result as
  `gamelib-depot/tests/fixtures/expected.json`. The Rust golden test asserts against that file. The
  oracle went in 73-19 and the golden file stays (asserted by the deletion gate). 73-10 met it with
  no `rustOverride` and no `divergenceNote`.
- **A codec-coverage corpus, not a title list (D-14).** Seven deterministic synthetic cases
  (192 KiB, built by an in-repo Rust generator and pinned by a determinism test) cover every codec
  and wrapper (VZ/LZMA, VSZa/zstd, PK zip), encrypted and plain manifests, filename collisions and
  manifest gids above 2^53. Five live titles plus a shared-redist job (73-16) then had to give
  identical file trees, SHA1s, modes and BSD flags under both pipelines.
- **Measure the research before you pin it.** CONTEXT carried spike 067b's `--cfg aes_armv8`
  rustflag, which was measured on aes 0.8.4. aes 0.9 turns on the ARMv8 backend by default, measured
  at 15.3 GiB/s AES-256-CBC with no flag. So there is no `src-tauri/.cargo/config.toml` rustflag,
  which would otherwise have leaked into the whole Tauri build.
- **MSRV is per crate, decided up front (73-01).** aes 0.9 needs Rust 1.89, and cbc, sha1 and prost
  need 1.85. The operator chose `rust-version = "1.89"` on the two depot crates only (section 1's
  exception line) over pinning older crate versions or raising the whole workspace.
- **The flag's life (D-16).** `GAMELIB_DEPOT_PIPELINE=rust|ts` was env-only, like section 5. It
  arrived in 73-13 defaulting to `ts`, was honoured by every depot entry point in 73-14, flipped
  to `rust` in 73-17 after the operator approved parity, and was deleted with every TS branch in
  73-19 after the live gate. One flag for the whole pipeline rather than one per unit: the stages
  share a job and cannot be mixed.
- **CI finds what macOS cannot.** Four CI runs were needed. One caught a real Windows defect: the
  lexical path resolver dropped the drive prefix, which could have written depot files outside the
  library. Run the crate tests on all three legs before the delete gate.
- **Retire the packaging too.** After the code went, `lzma-native` stayed behind with its SEA asset
  embedding, win32 `liblzma.dll` side-load, prebuild gate and typedef. 73-21 removed those, but
  kept `lzma`, `zstddec` and their patches, because steam-user requires both at import. Before
  deleting a dependency, check what third-party code still loads, not only first-party imports.
- **Deletion gate:** `src/backend/__tests__/depotPortComplete.test.ts`, modelled on the scanner
  gate. It also asserts the packages and patches that must stay.

## 11. Third worked example: Steam local file formats (Phase 75)

`gamelib-steamfiles` and `gamelib-steamfiles-cli` replaced the TypeScript readers and writers of
Steam's local files (`libraryfolders.vdf`, `appmanifest_*.acf`, `registry.vdf`, `localconfig.vdf`,
`installscript.vdf`, `shortcuts.vdf`), `@node-steam/vdf` and `steam-shortcut-editor`. History lives
in `.planning/phases/75-steam-local-file-formats-in-rust/`. What it added to the recipe above:

- **One lossless text-KV tree.** A single tree type that keeps ordering and formatting replaces
  three separate TS parsers; callers read it through merged and ordered views (duplicate blocks
  merge the way Steam does).
- **Lossless binary KV.** `shortcuts.vdf` round-trips byte-identically, and writes are described
  mutations (add, update, remove an entry) applied to the tree, never a re-serialise of values
  the caller did not touch.
- **Jest parity without cargo.** The TS wrappers are tested by replaying recorded Rust results
  (`tests/fixtures/rust-results.json`) against the kept goldens (`expected.json`,
  `invocations.json`), so Jest needs no Rust toolchain. `meta/gamelibSteamfilesCli.ts` re-records them.
- **Discovery by env at spawn.** The shell computes Steam directories and passes them to the
  sidecar at spawn, because settings construction runs before the RPC server exists.
- **Divergences.** The sweep and goldens found 16 divergences from the old parsers (for
  example numeric coercion, truncated manifests, duplicate blocks); each was judged against Valve KeyValues behaviour and
  operator-accepted (`75-PARITY.md`).
- **Live gate.** CI was green on all three OSes and the live macOS UAT passed 8 of 8, after which
  both D-08 flags, the oracle and the sweep were deleted; `steamFilesPortComplete.test.ts` pins that.
