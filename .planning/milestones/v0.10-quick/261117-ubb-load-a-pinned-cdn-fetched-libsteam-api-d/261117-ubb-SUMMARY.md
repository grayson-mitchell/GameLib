---
phase: quick-261117-ubb
plan: 01
subsystem: steam-bridge
tags: [rust, tauri, macos, steam, bridge-helper, libsteam_api, pinning, sha256, codesign, rustInvoke]
requires:
  - phase: spikes 087/088/089
    provides: the pin constants, the CDN package layout and the helper `--steam-api-dylib` shape (all VALIDATED)
provides:
  - gamelib_depot::steam_api_pin (pin record, cache then snapshot then CDN then UNPINNED resolver)
  - steam_api_pin_resolve rustInvoke channel (macOS only)
  - createSteamApiPinResolver (bounded 10 s sidecar resolver) wired through the bridge-helper registry
  - bridge_helper `--steam-api-dylib` with content-pinned validation and a PIN log line
affects: [steam-bridge, bridge-helper, gamelib-depot, rustInvoke contract]
status: complete
commits: 1
commit: 1aff893bb
plan_head_before: d4ab332e42c15bba53dbc88af955aa037e26ade5
plan_head_after: 1aff893bb
actuals:
  tokens: 23260
  tasks: 2
  commits: 1
tech-stack:
  added: [sha2 0.10 as a direct dependency of gamelib-depot (already locked at 0.10.9, no new package)]
  patterns:
    - "PinIo trait seam: network and codesign injected, resolution tested without either"
    - "Registry resolver returns a synchronous null when none is wired, so spawns stay synchronous for every existing registry and test"
    - "Helper trusts a handed path only by content: O_NOFOLLOW, regular file, own uid, not group/world-writable, CommonCrypto sha256 equals the compiled-in pin"
key-files:
  created:
    - src-tauri/crates/gamelib-depot/src/steam_api_pin.rs
    - src-tauri/crates/gamelib-depot/tests/steam_api_pin.rs
    - native/steam-bridge/helper/gamelib_steam_api_pin.h
    - src/backend/storeManagers/steam/bridge/steamApiPin.ts
    - src/backend/storeManagers/steam/bridge/__tests__/steamApiPin.test.ts
    - .planning/todos/pending/2026-11-17-ci-head-check-pinned-steam-api.md
  modified:
    - src-tauri/crates/gamelib-depot/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/crates/gamelib-depot/src/lib.rs
    - src-tauri/crates/gamelib-depot/src/container.rs
    - src-tauri/crates/gamelib-depot/src/fetch.rs
    - src-tauri/crates/gamelib-depot/tests/container.rs
    - src-tauri/crates/gamelib-depot/tests/support/encode.rs
    - src-tauri/src/depot_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/storeManagers/steam/bridge/helperRegistry.ts
    - src/backend/storeManagers/steam/bridge/helperSpawn.ts
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - native/steam-bridge/helper/bridge_helper.c
key-decisions:
  - "First launch with no cache: wait at most 10 s (STEAM_API_PIN_WAIT_MS); a slower fetch finishes in the shell worker thread and is cached for the next launch, this launch goes UNPINNED"
  - "Cache path: ~/Library/Application Support/GameLib/steam-api/<dylib sha256>/libsteam_api.dylib, derived in Rust from HOME by layout_for_home; the sidecar never hands Rust a path"
  - "decode_vz gained a one-shot retry with an unknown-size LZMA header, because Valve's client packages end the stream with an end-of-payload marker that this liblzma rejects alongside a header size"
  - "Spec item 6 (CI HEAD check) deferred to a gated pending todo"
requirements-completed: [QUICK-261117-ubb]
---

# Quick 261117-ubb: pinned, CDN-fetched libsteam_api.dylib for the macOS bridge helper

**The bridge helper now loads a Valve-signed, sha256-pinned libsteam_api.dylib (Oct 21 client build,
SteamUser v023) that the Rust shell fetches once from Valve's client-update CDN and caches under
GameLib's appFolder, and falls back visibly to the Steam client's own copy (UNPINNED) on every
failure.**

## STATUS: code complete and verified, NOT COMMITTED

Both tasks are implemented and every verify command below passed, but no commit was made. The
pre-commit protected-branch assertion (Step 0) refused: HEAD is `main`, and
`gsd_run query git.base-branch --is-protected main` returns `true` (`git.allow_default_branch_commits`
is not set in `.planning/config.json`, and an agent message cannot authorise changing that). Nothing
is staged. `commits: 0` above is therefore the measured truth, not an omission. See "Commit
hand-off" at the end for the exact commands.

## What was built

**Rust (`gamelib-depot`, new module `steam_api_pin`)**
- `PIN` record, `CDN_HOSTS`, `layout_for_home` (pure, explicit home), `cached_path`, `Resolution`
  (camelCase JSON, lowercase `source`).
- `resolve_with(layout, pin, &dyn PinIo)`: (1) cache: regular file only (`symlink_metadata`), streamed
  sha256, a mismatch is deleted; (2) snapshot of the Steam client copy when it already hashes to the
  pin, read once into memory and committed from memory; (3) CDN: HTTPS with redirects off, package
  sha256 must equal the manifest `sha2vz`, VZ decode, member extraction capped at `dylib_size`,
  dylib sha256, then `codesign -v` plus `TeamIdentifier=MXGJJ98X76` on the temp file before it enters
  the cache; (4) `unpinned` with a step-named detail such as
  `cache=miss;client=absent;cdn=<host>:sha2vz-mismatch`.
- Commit is atomic: dirs 0700, temp file `create_new` 0600 in the final dir, signature check, 0444,
  rename. The temp file never survives any path. A process-wide mutex serialises resolutions.
- `LiveIo`: one reqwest client (no redirects, connect 10 s, request 45 s), overall deadline 50 s,
  Content-Length must equal `package_size`, the chunk read stops the moment the total exceeds it.
- `container::unzip_entry_named` (central-directory walk, backslash-named siblings fine, cap
  enforced before any decode) shares its local-header body read with `unzip_first_entry`, whose
  results are unchanged (existing container and golden tests green).
- `fetch::install_crypto_provider` is now `pub(crate)`.

**Shell:** `rpc_steam_api_pin_resolve` in `depot_dispatch.rs` (non-macOS answers `unsupported` with no
network or filesystem touch, macOS reads `HOME`, wraps `resolve` in `catch_unwind`), one arm in
`rust_dispatch.rs`, `src-tauri/src/ipc_contract.rs` regenerated by `pnpm gen:ipc-contract`.

**Sidecar:** `RUST_STEAM_API_PIN_RESOLVE` channel (112 channels now). `createSteamApiPinResolver`:
macOS only, one in-flight request shared by concurrent callers, `.catch` attached at creation so a
late rejection is never unhandled, an unref'd timer cleared on settle, strict reply parse (a path is
accepted only for cached/snapshot/fetched, absolute, basename `libsteam_api.dylib`, no NUL/newline),
an injectable `log` sink. Creating it issues nothing, so boot does no resolution. The registry gains
`resolveSteamApiDylib()`; `ensureBridgeHelperReady` resolves it at most once per call, only when a
spawn will really happen (never for a reused live entry), and hands the path to the full helper, the
loop respawns and the identity-only 480 fallback as `--steam-api-dylib <path>` (argv; the launch
secret stays env-only).

**Helper (`bridge_helper.c` + `gamelib_steam_api_pin.h`):** `gl_steam_api_pin_check` validates the
handed path (absolute, no dot segments, basename, `O_NOFOLLOW`, regular file, own uid, not
group/world-writable, at most 16 MiB, CommonCrypto sha256 equals the compiled-in pin). Failure never
dlopens the handed path: it falls back to the `$HOME` Steam-tree path and logs
`PIN    source=UNPINNED reason=<why> dylib=<path> loaded=<0|1>`. Success logs
`PIN    source=pinned sha256=<pin> dylib=<path> loaded=<0|1>`, emitted right after the dlopen and
before the NULL check so a failed dlopen is logged too. `public/bin/arm64/darwin/steam-bridge-helper`
was rebuilt with `pnpm build-steam-bridge`.

## Decisions as built

- **First launch with no cache (as built):** the sidecar waits at most 10 s. A cold fetch that
  finishes inside it is pinned on that very launch. A slower one (or an unreachable CDN) sends THIS
  launch UNPINNED on the client copy while the shell worker thread finishes the fetch and caches it,
  so the next launch is pinned. A later call during that in-flight fetch joins it instead of starting
  another. The 10 s is still UNMEASURED by the operator: the live gate records `elapsedMs`. For the
  developer machine the Rust-side cold fetch plus decode plus codesign measured about 1.4 s wall in
  the `--ignored` test, so the 10 s bound has wide headroom on a normal connection.
- **Actual cache path:** `~/Library/Application Support/GameLib/steam-api/<dylib sha256>/libsteam_api.dylib`
  (`4162eb404dd42f572e7514f906f9ad5e16b7ab9c3ad29f3a532dacbc30e16bac` for the real pin).
- **Sync-null registry default:** `resolveSteamApiDylib` returns a synchronous `null` when no
  resolver is wired, so the spawn stays synchronous. Without this, every existing test that emits
  the helper's LISTEN line right after calling `ensureBridgeHelperReady` would lose its emit to the
  new await.
- **Live networked check:** the `--ignored` test RAN and PASSED (details below).
- **Deferred CI HEAD-check todo:** `.planning/todos/pending/2026-11-17-ci-head-check-pinned-steam-api.md`
  (`severity: minor`, `platform: any`, `ready: code`), passes `python3 .planning/todos/todo-frontmatter-gate.py`
  (11 pending todos, all in vocabulary).
- **Phase 47 precondition outcome:** the Task 1 `<precondition>` (`git diff --quiet` over
  `ipc_contract.rs`, `rust_dispatch.rs`, `sidecarTransport.ts`, `rustInvoke.ts`, `bootstrap.ts`)
  exited 0 at the start, and was re-checked for the files I had not yet touched immediately before
  `pnpm gen:ipc-contract`. No other session's uncommitted hunk was in those files, so the regenerated
  `ipc_contract.rs` diff is only this task's 13 added lines. Phase 47's session kept committing on
  `main` while I worked; I staged nothing.

## Deviations from Plan

**1. [Rule 1 - Bug] `decode_vz` rejected the real pinned package**
- **Found during:** Task 2, the `--ignored` live test (decode failed with `lzma data error` right
  after the sha2vz check passed, so the bytes were correct).
- **Issue:** the real `webhelpers_osx` stream ends with an LZMA end-of-payload marker. The bundled
  liblzma (xz2 `static`) rejects a marker when the 13-byte alone header also carries a size. Python's
  liblzma (spike 089) accepts it, which is why the spike's `vz.py` worked. Probed: known-size header
  fails at 8,662,079 of 8,765,881 bytes, unknown-size header decodes all 8,765,881.
- **Fix:** `decode_vz` retries once with an unknown-size header when the first attempt fails with
  `decode_failed`, still capped, and requires the decoded length to equal the footer size. Depot
  chunks decode on the first attempt and never reach the retry. Added container tests that build a
  marker-terminated VZ with liblzma's own encoder (round-trip, and a wrong footer size is rejected).
- **Files modified:** `src-tauri/crates/gamelib-depot/src/container.rs`, `tests/container.rs`.

**2. [Rule 3 - Blocking] Registry resolver typed sync-or-async**
- **Found during:** Task 1, existing `helperProcess`/`helperSpawn` tests.
- **Issue:** awaiting the resolver before the first `ensureHelperSpawned` moved the spawn after a
  microtask, so tests that emit the LISTEN line synchronously after `ensureBridgeHelperReady(...)`
  lost it.
- **Fix:** `resolveSteamApiDylib(): Promise<string | null> | null`, defaulting to a synchronous
  `null`; `ensureBridgeHelperReady` spawns synchronously unless a real resolver returned a promise.
  Plan wording (`() => Promise<string | null>` for the registry default) is satisfied by every
  production resolver; only the default differs. No existing test needed editing.

**3. [Rule 3 - Blocking] `createSteamApiPinResolver` takes an optional `log` dep**
- **Issue:** the real `backend/logger` is uninitialised under jest, and the plan wanted
  `steamApiPin.test.ts` with no `jest.mock`.
- **Fix:** optional `log` sink defaulting to `logInfo`/`logWarning` under `LogPrefix.Steam`; the test
  injects its own. Log wording is exactly as planned.

**4. [Rule 1 - Bug] knip: `STEAM_API_PIN_WAIT_MS` was exported but unused**
- **Fix:** the constant is module-private. `find-deadcode` now reports only
  `NativePortDataStyle` / `NativePortMac` in `src/common/nativePortCatalogue.ts`, which is another
  session's committed file (`b74e7c9b3`, quick 261117-r4c) and not touched here.

**6. [Rule 1 - Bug] Two repo census gates tripped by this plan's own additions**
- **Issue:** `tauriShellSource.test.ts` pins the `rust_dispatch.rs` arm count (111) and the list of
  non-34.1 arms; `moduleStateCensus.test.ts` rejected the module-level `new Set` for the pinned-source
  check in `steamApiPin.ts`.
- **Fix:** arm count 112 and `'steam_api_pin_resolve'` added to its pre-existing-arms list with a
  PROVEN / NOT ATTEMPTED note; the Set became a three-way comparison inside a function, so the
  module holds no state.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts` (add to the commit),
  `src/backend/storeManagers/steam/bridge/steamApiPin.ts`.

**5. Tests adapted to the new resolver (not plan deviations):** the three Task 1 unit tests that
asserted an exact `detail` of `cache=miss` / `cache=mismatch` now assert the prefix, since Task 2
appends the `client=` and `cdn=` steps. The `helperIntegration.test.ts` mock-clear lines were
written as separate statements to avoid an ASI hazard (a leading `(` after a `})` line).

## Verification (actual results)

| Check | Result |
| --- | --- |
| `cargo test -p gamelib-depot -p gamelib-depot-cli` | 366 passed, 0 failed |
| `cargo test -p gamelib-depot --test steam_api_pin` | 14 passed, 1 ignored (the live one) |
| `cargo test -p gamelib-depot --test steam_api_pin -- --ignored --nocapture` | **RAN, PASSED** against the real CDN: `cache=miss;client=absent;cdn=client-update.steamstatic.com:ok`, file sha256 equals `PIN.dylib_sha256`, size 395104, `codesign -v` plus `TeamIdentifier=MXGJJ98X76` passed inside the commit, second call gave `cached` |
| `cargo test --bin gamelib-shell` | 484 passed, 2 ignored |
| `cargo fmt -p gamelib-depot -- --check`, `rustfmt --check --edition 2021 src/depot_dispatch.rs` | clean |
| `cargo +1.99.1 clippy --workspace --all-targets` + `meta/clippyRatchet.cjs` | PASS (darwin, toolchain 1.99.1), every count at its ceiling, none above |
| `pnpm check:ipc-contract` | up to date |
| `pnpm build-steam-bridge` | exit 0; helper rebuilt |
| `pnpm exec jest --runTestsByPath` over the planned 9 suites | 9 suites, 296 tests passed (helperIntegration runs the real compiled helper: pinned loaded=1, production-pin sha256-mismatch, no-flag, invalid-path, symlink open-failed, 0664 unsafe-owner-or-mode, and both the full and the identity-only 480 helper load the pinned dylib through `ensureBridgeHelperReady`) |
| `pnpm codecheck` | clean |
| scoped `npx prettier --check` over the 12 TS paths (after `--file-info`, none ignored) | clean |
| `pnpm lint` | 0 errors (964 + 609 pre-existing warnings; none new in the touched code beyond the pre-existing patterns) |
| `python3 .planning/todos/todo-frontmatter-gate.py` | OK, 11 pending todos |
| `grep -c '^name = ' src-tauri/Cargo.lock` | 684 (unchanged, T-ubb-SC holds) |
| grep gates | `'--steam-api-dylib'` in helperSpawn.ts 1, `"--steam-api-dylib"` in bridge_helper.c 1, `steam_api_pin_resolve` in sidecarTransport.ts 1, `resolveSteamApiDylib` in bootstrap.ts 1 (each baseline was 0, expectation >=1) |
| `pnpm find-deadcode` | no finding names a file this plan touched; two findings in `src/common/nativePortCatalogue.ts` belong to quick 261117-r4c |
| `pnpm test:ci` (full jest) | first run: 7 suites failed, 22063 passed. TWO were mine and are fixed (see Deviation 6): `tauriShellSource.test.ts` (arm count and new-arm list) and `moduleStateCensus.test.ts` (a module-level `new Set`). Re-run green. FIVE remain red and none touches a file of this plan: `storeKinds.test.ts` and `createStores.test.ts` (an unregistered `steam_direct_launch_verdict` store from another session), `acfUpdateReplay.test.ts` (`no oracle case acfUpdate/readLocalConfigBetaKey/playtime/10`), `themeTokens.test.ts` (is-link render-site census 37 vs 34, frontend), `meta/__tests__/x86CallbackWineHarness.test.ts` (Wine harness). Not re-run on a clean HEAD (no stash allowed), so "pre-existing" is by inspection of their messages, not by A/B |

The live gate was NOT run (it needs the operator).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. All of T-ubb-01 to T-ubb-08 are mitigated as written:
T-ubb-01 sha2vz, member sha256 and codesign team ID before the cache; T-ubb-02 helper-side
content re-validation; T-ubb-03 0700/0444 atomic write and re-hash on every resolve plus again in the
helper; T-ubb-06 10 s sidecar cap with an unref'd cleared timer and a `.catch`, Rust 10/45/50 s;
T-ubb-07 Content-Length equality plus a byte-count stop on the chunk loop (tested against a local
server); T-ubb-08 strict reply parse.

## HUMAN CHECK: PASSED 2026-11-20 (steps 1, 2, 4 pass; step 3 skipped, no 480-fallback title to hand). Details in the completed todo. Plan text follows verbatim.

LIVE GATE. The operator runs it after execution. It is not an executor step, and the todo stays in pending/ until it passes. Log: ~/Library/Logs/GameLib/gamelib.log.
Prep: `pnpm build-steam-bridge`, then restart `pnpm tauri:dev` (not tauri:dev:run). tauri dev does not rebuild the sidecar, so confirm build/main/sidecar.js is newer than the last commit. Mac Steam is signed in.
1. `rm -rf ~/Library/Application\ Support/GameLib/steam-api`, then launch ELEX (411300, shim mode). Expected:
   - sidecar: `steam api pin: source=fetched ... elapsedMs=<n>` (record n)
   - helper: `bridge helper [411300]: ... PIN    source=pinned ... loaded=1`, `INIT accessor SteamUser=v023`, `READY  init=ok`, then `HELLO shim attached` and `GINIT ... ok=1`
   - Shift+Tab opens the Steam overlay in-game.
   - `~/Library/Application Support/GameLib/steam-api/4162eb40.../libsteam_api.dylib` exists, mode 0444, dir 0700.
2. Launch Avernum 6 (206060) or XCOM: EU (200510). Expected: `source=cached`, the same PIN/HELLO/GINIT ok=1 lines, and the Shift+Tab overlay works.
3. Launch a title that takes the D-51-04 identity-only (480) fallback (family-shared or licence-refused). Expected: the `--identity-only` helper's PIN line also shows `source=pinned`, status fallback-identity, and the game launches.
4. Remove the cache again. Turn the network off ONLY for this action: press Play, wait for the helper's READY line, then turn the network back on. Expected:
   - sidecar: `steam api pin: UNPINNED (cache=miss;client=...;cdn=...)`
   - helper: `PIN    source=UNPINNED reason=no-flag dylib=<...>/Steam.AppBundle/.../libsteam_api.dylib loaded=1`
   - The game still launches on the client copy.

One caution for step 1: the first cold fetch may hit an already-warm snapshot. If your current Steam
client copy still hashes to the pin (it does not after the Nov 10 update, which is the reason for this
work), the first resolve reports `source=snapshot` with no network request instead of `fetched`.

## Commit hand-off

**Resolved:** the orchestrator committed the paths below as `1aff893bb` on main (operator chose commit-on-main). Original hand-off follows.

Nothing is staged and nothing is committed. After the protected-branch override is decided (set
`git.allow_default_branch_commits: true` in `.planning/config.json`, or commit from a phase branch),
stage exactly these paths (never `git add -A`; Phase 47 and quick 261117-r4c have their own dirty
files in this tree):

```
git add native/steam-bridge/helper/gamelib_steam_api_pin.h native/steam-bridge/helper/bridge_helper.c \
  src-tauri/Cargo.lock src-tauri/crates/gamelib-depot/Cargo.toml src-tauri/crates/gamelib-depot/src/lib.rs \
  src-tauri/crates/gamelib-depot/src/steam_api_pin.rs src-tauri/crates/gamelib-depot/src/container.rs \
  src-tauri/crates/gamelib-depot/src/fetch.rs src-tauri/crates/gamelib-depot/tests/steam_api_pin.rs \
  src-tauri/crates/gamelib-depot/tests/container.rs src-tauri/crates/gamelib-depot/tests/support/encode.rs \
  src-tauri/src/depot_dispatch.rs src-tauri/src/rust_dispatch.rs src-tauri/src/ipc_contract.rs \
  src/common/types/sidecarTransport.ts src/common/types/ipc/rustInvoke.ts \
  src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/sidecar/bootstrap.ts \
  src/backend/__tests__/tauriShellSource.test.ts \
  src/backend/storeManagers/steam/bridge/steamApiPin.ts src/backend/storeManagers/steam/bridge/helperRegistry.ts \
  src/backend/storeManagers/steam/bridge/helperSpawn.ts src/backend/storeManagers/steam/bridge/helperProcess.ts \
  src/backend/storeManagers/steam/bridge/__tests__/steamApiPin.test.ts \
  src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts \
  src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts \
  src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts \
  .planning/todos/pending/2026-11-17-ci-head-check-pinned-steam-api.md
```

The two tasks cannot be split into two compiling commits: Task 1's `steam_api_pin.rs` is now the
Task 2 version (the resolver calls `container::unzip_entry_named`), so one commit
(`feat(quick-261117-ubb): load a pinned, CDN-fetched libsteam_api.dylib in the macOS bridge helper`)
is the honest unit.

## Self-Check: PASSED (files) / FAILED (commits)

- All created files exist on disk (checked below with `[ -f ]`).
- Commit existence cannot be checked: no commit was made (see STATUS).
