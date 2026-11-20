---
phase: quick-261117-ubb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-depot/Cargo.toml
  - src-tauri/Cargo.lock
  - src-tauri/crates/gamelib-depot/src/lib.rs
  - src-tauri/crates/gamelib-depot/src/steam_api_pin.rs
  - src-tauri/crates/gamelib-depot/src/container.rs
  - src-tauri/crates/gamelib-depot/src/fetch.rs
  - src-tauri/crates/gamelib-depot/tests/steam_api_pin.rs
  - src-tauri/crates/gamelib-depot/tests/container.rs
  - src-tauri/crates/gamelib-depot/tests/support/encode.rs
  - src-tauri/src/depot_dispatch.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/ipc_contract.rs
  - src/common/types/sidecarTransport.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/storeManagers/steam/bridge/steamApiPin.ts
  - src/backend/storeManagers/steam/bridge/helperRegistry.ts
  - src/backend/storeManagers/steam/bridge/helperSpawn.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/__tests__/steamApiPin.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - native/steam-bridge/helper/gamelib_steam_api_pin.h
  - native/steam-bridge/helper/bridge_helper.c
  - .planning/todos/pending/2026-11-17-ci-head-check-pinned-steam-api.md
autonomous: true
requirements: [QUICK-261117-ubb]

estimate:
  tokens: 200000
  raw_tokens: 200000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "On macOS, a bridge launch with the pinned dylib cached passes `--steam-api-dylib <cache path>` to the helper, and the helper logs `PIN    source=pinned ... loaded=1` and resolves the pin's SteamUser v023 accessor"
    - "With no cache and network up, the first bridge launch fetches the pinned webhelpers_osx package from Valve's client-update CDN, verifies its sha2vz, decodes the VZ, extracts the dylib member, verifies the dylib sha256 and the Valve team ID MXGJJ98X76, and caches it at ~/Library/Application Support/GameLib/steam-api/<dylib sha256>/libsteam_api.dylib"
    - "If the user's Steam client copy already hashes to the pin, it is snapshotted into the cache with no network request"
    - "With no cache and no network (or a CDN that no longer serves the build), the launch still proceeds on the Steam client's own libsteam_api.dylib, and both the sidecar log and the helper's PIN line say UNPINNED"
    - "Resolution never holds a launch longer than 10 s (STEAM_API_PIN_WAIT_MS); a slower fetch finishes in the shell's worker thread and is cached for the next launch; nothing is resolved at sidecar boot"
    - "The helper dlopens a handed path only when it is an absolute, non-symlink, regular file owned by the user, not group/world-writable, whose sha256 equals the pin compiled into the helper; anything else falls back to the Steam-tree lookup with `source=UNPINNED reason=<why>`"
    - "The Rust pin record, the helper's compiled-in pin, and the generated bridge_dispatch.h SteamUser surface cannot drift silently: `cargo test -p gamelib-depot` fails if they disagree"
    - "Non-macOS builds compile; the channel answers `unsupported` without touching the network or the filesystem"
  artifacts:
    - path: "src-tauri/crates/gamelib-depot/src/steam_api_pin.rs"
      provides: "Pin record (PIN), PinLayout/layout_for_home, resolve/resolve_with (cached -> snapshot -> CDN -> unpinned), PinIo + LiveIo, Resolution JSON"
      contains: "4162eb404dd42f572e7514f906f9ad5e16b7ab9c3ad29f3a532dacbc30e16bac"
    - path: "native/steam-bridge/helper/gamelib_steam_api_pin.h"
      provides: "GAMELIB_STEAM_API_PIN_SHA256 (overridable with -D for tests) and the helper-side path validator"
      contains: "GAMELIB_STEAM_API_PIN_SHA256"
    - path: "src/backend/storeManagers/steam/bridge/steamApiPin.ts"
      provides: "createSteamApiPinResolver: macOS-only, in-flight-deduped, 10 s-bounded rustInvoke of steam_api_pin_resolve; returns a validated path or null"
      exports: ["createSteamApiPinResolver"]
    - path: "src/common/types/sidecarTransport.ts"
      provides: "RUST_STEAM_API_PIN_RESOLVE channel in RUST_INVOKE_CHANNELS"
      contains: "steam_api_pin_resolve"
  key_links:
    - from: "src/backend/storeManagers/steam/bridge/helperProcess.ts"
      to: "src/backend/storeManagers/steam/bridge/helperRegistry.ts"
      via: "ensureBridgeHelperReady awaits registry.resolveSteamApiDylib() before any spawn that will actually happen"
      pattern: "resolveSteamApiDylib\\("
    - from: "src/backend/storeManagers/steam/bridge/helperSpawn.ts"
      to: "native/steam-bridge/helper/bridge_helper.c"
      via: "argv flag --steam-api-dylib <path> on full and identity-only spawns"
      pattern: "--steam-api-dylib"
    - from: "src/backend/sidecar/bootstrap.ts"
      to: "src-tauri/src/depot_dispatch.rs"
      via: "createSteamApiPinResolver({ requestRustInvoke }) -> rustInvoke steam_api_pin_resolve -> rpc_steam_api_pin_resolve -> gamelib_depot::steam_api_pin::resolve"
      pattern: "steam_api_pin_resolve"
    - from: "src-tauri/crates/gamelib-depot/src/steam_api_pin.rs"
      to: "native/steam-bridge/helper/gamelib_steam_api_pin.h"
      via: "coherence test reads the header and native/steam-bridge/generated/bridge_dispatch.h and asserts the sha256 and SteamUser023 surface match PIN"
      pattern: "GAMELIB_STEAM_API_PIN_SHA256"
---

<objective>
Make the macOS bridge helper load a pinned, Valve-signed libsteam_api.dylib (the Oct 21 client build, SteamUser v023 / MatchmakingServers v003) fetched from Valve's client-update CDN and cached locally, instead of the Steam client's own copy, which Valve replaces on every client update. The Nov 10 update broke every bridge launch this way.

Purpose: implements todo `.planning/todos/pending/2026-11-17-build-pinned-bridge-libsteam-api.md` exactly as spikes 087/088/089 (all VALIDATED) shaped it, a shape the operator has already accepted.
Output: a Rust pin record plus resolver (cache, then snapshot, then CDN, then UNPINNED) in gamelib-depot; a `steam_api_pin_resolve` rustInvoke channel; a bounded sidecar resolver that passes the path on argv; and a helper that re-validates the path against its compiled-in pin and logs which dylib it loaded.

Decisions recorded here (planner discretion where the spec left it open):
- Location of the Rust code: new module `gamelib_depot::steam_api_pin`. gamelib-depot already has reqwest, xz2, a VZa decoder (`container::unzip_manifest`) and a zip reader, so the spike's "about 15 lines of lzma" is a reuse, not a new crate. sha2 0.10 is added as a direct dependency. It is already locked at 0.10.9 (via tauri-codegen), so no new package enters Cargo.lock.
- Cache root: `$HOME/Library/Application Support/GameLib/steam-api/<dylib sha256>/libsteam_api.dylib`, literally as the todo specifies. `GameLib` equals the sidecar's `APP_NAME_SEGMENT` (src/backend/process/appPaths.ts), so the cache sits in GameLib's own appFolder. The Rust handler derives it from `HOME` itself through a pure `layout_for_home(home)` (the explicit-home pattern of `single_instance_dir` in src-tauri/src/single_instance.rs). The sidecar never hands Rust a filesystem path.
- Bounded resolution (spec item 5): the sidecar waits at most 10 s (`STEAM_API_PIN_WAIT_MS`, UNMEASURED: the spike recorded no fetch duration, so the live gate records `elapsedMs`). A cache hit returns in milliseconds. A first launch with no cache normally fetches within the window and is pinned. If it is slower, or the CDN is unreachable, THIS launch goes UNPINNED on the client copy while the shell's worker thread finishes the fetch and caches it, and the next launch is pinned. Rust bounds: connect 10 s, request 45 s, overall deadline 50 s, which is under the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`. Nothing is resolved at sidecar boot (exit contract half 2). Registry construction stays inert.
- Hand-off: argv flag `--steam-api-dylib <path>`. The path is not secret, unlike the launch secret, which stays env-only. The helper's own UNPINNED fallback is the Steam-tree path it already derives from `$HOME` (T-24-SC lineage), so Rust never returns the client-copy path for loading.
- Helper re-validation is by content: the helper hashes the handed file with CommonCrypto and requires the sha256 compiled into it (header `gamelib_steam_api_pin.h`). This closes path injection regardless of where the path points. It does not use a prefix allow-list.
- Spec item 6 (optional CI HEAD check for CDN retention): DEFERRED, because it is not trivial. It needs a workflow, a script reading the Rust pin, and a schedule. Task 2 records it as a pending todo.
- API coverage checkpoint: `api-coverage.cjs --json` over the scope returned `detected:false` (no `skipped`), so no COVERAGE.md is written. Being honest about it: this is one content-addressed static-file GET of a named package, not an API with a capability surface.
- Phase 47 is executing concurrently in this working tree (47-12's `src-tauri/src/ipc_contract.rs` hunk was uncommitted at planning time). See the Task 1 `<precondition>`.
</objective>

<assumption_delta_decision>
primary_noun: the libsteam_api.dylib the bridge helper dlopens
transition: derived -> chosen. It was derived from `$HOME`'s Steam tree; now it is chosen by a pin record.
decision: add-alongside
rationale: The pinned path is added in front of the derived path, and the derived Steam-tree lookup stays as the UNPINNED last resort. Spikes 089 and 088 require that fallback for an offline first run or a retired CDN build, and 261113-n39's runtime version probe already makes it degrade gracefully. Promoting the pin to the only source (no fallback) would turn a CDN outage into a hard launch failure. The pin only moves together with a `bridge_dispatch.h` regeneration, and the Task 1 coherence test enforces that.
</assumption_delta_decision>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-17-build-pinned-bridge-libsteam-api.md
@.planning/spikes/089-pinned-dylib-source-and-signing/README.md
@.planning/spikes/089-pinned-dylib-source-and-signing/fetch-pin.sh
@.planning/spikes/089-pinned-dylib-source-and-signing/vz.py
@.planning/spikes/088-pinned-helper-real-game/README.md

Pin constants (from 089/fetch-pin.sh, re-confirmed at planning time against the local spike artifacts with `shasum -a 256` and `nm -gU`; use them verbatim):
- package file name: `webhelpers_osx.zip.vz.6d8f8e88928b53e6d7210fc2d7dab15760bd49d9_2348800` (client build 1792618285, built 2026-10-21; package size 2348800 bytes)
- package sha256 (the manifest's `sha2vz`, NOT its `sha2`): `8b9993c58577eec72895d85d6e113dbb226b1b5ecaff019c74f2bdb93c988ddb`
- zip member: `Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib` (stored, method 0, 395104 bytes)
- dylib sha256: `4162eb404dd42f572e7514f906f9ad5e16b7ab9c3ad29f3a532dacbc30e16bac`
- expected SteamUser accessor: `SteamUser_v023` (bridge_dispatch.h's "Interfaces covered:" line spells it `SteamUser023`)
- Valve team ID: `MXGJJ98X76`
- CDN hosts, tried in order: `client-update.steamstatic.com` (fetch-pin.sh), then `client-update.akamai.steamstatic.com` (089 trail item 4: served 206 for this package). URL form: `https://<host>/<package file name>`.

Project rules that bind this plan:
- gamelib-conventions: (1) the sidecar exit contract: unref every timer, and issue no unbounded in-flight work at boot. (2) Fake-HOME isolation: every in-repo spawn in a test uses `createFakeHomeProfile()` / `profile.childEnv()`, never a hand-rolled env literal. (3) Every `<verify>` runs a scoped `npx prettier --check` over the TS paths written, after `--file-info`. .rs/.c/.h/.toml report `inferredParser: null`, so prettier cannot check them and rustfmt is used instead.
- The DI ceiling (`meta/backendDiCeilings/storeManagers.steam.bridge.json`) counts `jest.mock` calls per test file. New tests inject deps instead of adding `jest.mock`.
- The knip ratchet (`pnpm find-deadcode`) is an exact-equality baseline. Export only what production imports.
- Memory: `tauri dev` does not rebuild the sidecar. The helper binary is `public/bin/arm64/darwin/steam-bridge-helper`, built by `pnpm build-steam-bridge`.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): a cached pin flows end to end. Rust resolves it, the sidecar passes it on argv, and the helper validates, loads and logs it, with UNPINNED fallback on every failure</name>
  <precondition>`git diff --quiet -- src-tauri/src/ipc_contract.rs src-tauri/src/rust_dispatch.rs src/common/types/sidecarTransport.ts src/common/types/ipc/rustInvoke.ts src/backend/sidecar/bootstrap.ts` exits 0, meaning no other executor's uncommitted edits sit in files this task regenerates or edits. At planning time Phase 47's 47-12 hunk in `src-tauri/src/ipc_contract.rs` was uncommitted. If the check fails, halt and report; do not regenerate over another executor's hunks or commit them.</precondition>
  <files>src-tauri/crates/gamelib-depot/Cargo.toml, src-tauri/Cargo.lock, src-tauri/crates/gamelib-depot/src/lib.rs, src-tauri/crates/gamelib-depot/src/steam_api_pin.rs, src-tauri/src/depot_dispatch.rs, src-tauri/src/rust_dispatch.rs, src-tauri/src/ipc_contract.rs, src/common/types/sidecarTransport.ts, src/common/types/ipc/rustInvoke.ts, src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts, src/backend/sidecar/bootstrap.ts, src/backend/storeManagers/steam/bridge/steamApiPin.ts, src/backend/storeManagers/steam/bridge/helperRegistry.ts, src/backend/storeManagers/steam/bridge/helperSpawn.ts, src/backend/storeManagers/steam/bridge/helperProcess.ts, src/backend/storeManagers/steam/bridge/__tests__/steamApiPin.test.ts, src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts, src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts, src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts, native/steam-bridge/helper/gamelib_steam_api_pin.h, native/steam-bridge/helper/bridge_helper.c</files>
  <read_first>
    - native/steam-bridge/helper/bridge_helper.c lines 430-560 (is_valid_appid, resolve_dylib_path, load_steam_api) and 3205-3300 (main: the secret block and the argv loop). logts_f is defined at line 611, AFTER load_steam_api, so build the PIN line with snprintf + logts the way spike 088's patch did.
    - .planning/spikes/088-pinned-helper-real-game/README.md "How to Run" (the two-line patch that worked live) and "What to Expect"
    - src/backend/storeManagers/steam/bridge/helperSpawn.ts (ensureHelperSpawned args/options), helperProcess.ts lines 446-end (ensureBridgeHelperReady: three ensureHelperSpawned call sites), helperRegistry.ts (deps, slice)
    - src/backend/sidecar/bootstrap.ts lines 1660-1692 (the anonymous-client step's `requireHost(state).requestRustInvoke` and the bridge-helper-registry step)
    - src/backend/host/rustInvokeDeps.ts (RustInvokeDeps['requestRustInvoke'])
    - src/common/types/sidecarTransport.ts around line 634 (a "Rust-side channel name:" doc block to mirror) and lines 938-1050 (RUST_INVOKE_CHANNELS); src/common/types/ipc/rustInvoke.ts line 197 (`empty`) and the schema map
    - src-tauri/src/depot_dispatch.rs lines 1-70; src-tauri/src/rust_dispatch.rs (arm style); src-tauri/src/steamcm_dispatch.rs lines 173-176 (a generated empty-args `XxxArgs::from_args(args)?` handler); src-tauri/src/single_instance.rs lines 145-162 (explicit-home pure fn)
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts lines 257-430 (fake-HOME clang compile of the helper, direct spawn + stderr wait + kill)
  </read_first>
  <behavior>
    - Rust (in-module tests, tempfile): `layout_for_home(Some("/Users/x"))` gives cache_root `/Users/x/Library/Application Support/GameLib/steam-api` and client_copy `/Users/x/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib`. `None`/empty home gives None.
    - Rust: with a synthetic pin whose dylib_sha256 is the sha of some bytes written to `<cache_root>/<sha>/libsteam_api.dylib`, `resolve` returns source `cached` with that path. Mismatched bytes are removed, and the result is `unpinned` with detail `cache=mismatch`. A symlink at the cache path is not accepted (symlink_metadata). No file gives `unpinned`, `cache=miss`.
    - Rust coherence: native/steam-bridge/helper/gamelib_steam_api_pin.h has `#define GAMELIB_STEAM_API_PIN_SHA256 "<PIN.dylib_sha256>"`. The "Interfaces covered:" line of native/steam-bridge/generated/bridge_dispatch.h contains `SteamUser023`, derived from PIN.steam_user `SteamUser_v023`. Every PIN hash is 64 lowercase hex, and the package name ends with `_<package_size>`.
    - TS steamApiPin.test.ts (no jest.mock): non-mac resolves null without calling requestRustInvoke. A `cached`/`snapshot`/`fetched` reply with an absolute path ending `/libsteam_api.dylib` resolves that path. `unpinned`, `unsupported`, a relative path, a wrong basename, a non-object, or a rejection all resolve null. A reply slower than waitMs (fake timers) resolves null, and a second call during the same in-flight request reuses it (requestRustInvoke called once). A late rejection after the wait raised no unhandled rejection.
    - TS helperSpawn.test.ts: `ensureHelperSpawned(deps, id, { steamApiDylib: '/abs/libsteam_api.dylib' })` appends `--steam-api-dylib /abs/libsteam_api.dylib` to argv for full and identity-only spawns. Without it, argv is unchanged (existing assertions stay green).
    - TS helperProcess.test.ts: ensureBridgeHelperReady calls registry.resolveSteamApiDylib at most once per call, passes its result into the spawn, and never calls it when a live entry for the appId is reused.
    - Real binary (helperIntegration.test.ts, darwin only): a tiny test dylib is built with clang -dynamiclib. A second helper is compiled with `-DGAMELIB_STEAM_API_PIN_SHA256="<that dylib's sha256>"` and spawned with `--steam-api-dylib <test dylib>`, giving `PIN    source=pinned ... loaded=1`. The production-pinned helper given the same file gives `source=UNPINNED reason=sha256-mismatch`. No flag gives `reason=no-flag`. A relative path gives `reason=invalid-path`. A symlink to the test dylib, under the test-pin helper, is rejected (open-failed via O_NOFOLLOW). A group-writable copy (0664) gives `reason=unsafe-owner-or-mode`. Through the real ensureBridgeHelperReady, with a registry whose resolveSteamApiDylib returns the test dylib and helperPath is the test-pin helper, the relayed stderr (the mocked logWarning) shows `PIN    source=pinned` for the appId's helper AND for the identity-only 480 fallback helper.
  </behavior>
  <action>
Rust pin record and cache step (per spec items 1-3; the snapshot and CDN steps are Task 2):
- Add `sha2 = "0.10"` to `[dependencies]` in src-tauri/crates/gamelib-depot/Cargo.toml, and `pub mod steam_api_pin;` in lib.rs.
- Create src-tauri/crates/gamelib-depot/src/steam_api_pin.rs:
  - `pub struct SteamApiPin` with pub `&'static str`/`u64` fields: package, package_sha256 (sha2vz), package_size, member, dylib_sha256, dylib_size, steam_user, valve_team_id, client_build.
  - `pub const PIN: SteamApiPin` set to the constants in `<context>`, plus `pub const CDN_HOSTS: [&str; 2]`. A doc comment says the pin is bumped ONLY together with a `pnpm gen-vtables` regeneration of native/steam-bridge/generated/bridge_dispatch.h and the header's sha, and that the coherence test enforces this.
  - `pub struct PinLayout { pub cache_root: PathBuf, pub client_copy: PathBuf }` and `pub fn layout_for_home(home: Option<&str>) -> Option<PinLayout>`, pure with no env reads.
  - `pub fn cached_path(layout, pin) -> PathBuf`, which is `<cache_root>/<dylib_sha256>/libsteam_api.dylib`.
  - A `Resolution` struct serialized camelCase: source as a lowercase string enum `cached|snapshot|fetched|unpinned|unsupported`, `path: Option<String>`, `pinSha256`, `steamUser`, and `detail: Option<String>`, a semicolon-joined step log such as `cache=miss`.
  - `pub fn resolve(layout: &PinLayout, pin: &SteamApiPin) -> Resolution`: take a process-wide `static RESOLVE_LOCK: Mutex<()>` (recover on poison with into_inner), so concurrent worker threads never race a cache write. The cached step uses `symlink_metadata`: it must be a regular file, it is streamed through sha2::Sha256, and it must equal pin.dylib_sha256. On a mismatch, remove the file. When nothing pinned is found, return `unpinned` with path None.
  - `#[cfg(test)] mod tests` covering the behavior bullets. The coherence test reads both C files with `include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../native/..."))`.
- Shell: in src-tauri/src/depot_dispatch.rs add `pub(crate) fn rpc_steam_api_pin_resolve(args: &[Value]) -> Result<Value, String>`. It calls `SteamApiPinResolveArgs::from_args(args)?`. On non-macOS (cfg inside the body, so the shell crate gains no mac-only dead code on Windows, which matters for the win32 clippy ceiling) it returns the `unsupported` Resolution. On macOS it reads `std::env::var("HOME")`, calls `layout_for_home` (no home gives `unpinned` with detail `no-home`), then `steam_api_pin::resolve(&layout, &PIN)` wrapped in `std::panic::catch_unwind`, as `gamelib_depot::dispatch` does, and serializes. Add the one-line arm `RustInvokeChannel::SteamApiPinResolve => rpc_steam_api_pin_resolve(args),` in rust_dispatch.rs. rust_dispatch.rs is not rustfmt-clean at HEAD (rustfmt --check exits 1), so match the surrounding style and do not reformat the file.
- Channel: add `RUST_STEAM_API_PIN_RESOLVE = 'steam_api_pin_resolve' as const` to src/common/types/sidecarTransport.ts with a "Rust-side channel name:" doc block (args none; returns the Resolution shape; macOS only, `unsupported` elsewhere; bounded 50 s on the Rust side), and add it to RUST_INVOKE_CHANNELS. Add `[RUST_STEAM_API_PIN_RESOLVE]: empty` in src/common/types/ipc/rustInvoke.ts. Run `pnpm gen:ipc-contract` to regenerate src-tauri/src/ipc_contract.rs, which must not be hand-edited. Bump the count in rustInvokeSchemas.test.ts from 111 to 112.
- Sidecar resolver (spec items 4-5): create src/backend/storeManagers/steam/bridge/steamApiPin.ts exporting only `createSteamApiPinResolver(deps: { requestRustInvoke: RustInvokeDeps['requestRustInvoke']; isMac: boolean; waitMs?: number }): () => Promise<string | null>`, with a module const `STEAM_API_PIN_WAIT_MS = 10_000`.
  - Behavior: return null at once when not mac. Keep one in-flight promise for `requestRustInvoke(RUST_STEAM_API_PIN_RESOLVE, [])` with a `.catch` attached at creation, so a late rejection is never unhandled, and clear it when it settles. Race it against an unref'd, cleared-on-settle timer of waitMs.
  - Parse the reply strictly with an unexported parser. A path is accepted only for source cached/snapshot/fetched, and only if it is absolute, ends with `/libsteam_api.dylib`, and has no NUL or newline. Everything else gives null.
  - Log through backend/logger with LogPrefix.Steam:
    - pinned: `steam api pin: source=<s> path=<p> elapsedMs=<n>` (logInfo)
    - unpinned: `steam api pin: UNPINNED (<detail>) -- the bridge helper will load the Steam client's own libsteam_api.dylib` (logWarning)
    - timeout: `steam api pin: UNPINNED (still resolving after <waitMs>ms) -- this launch uses the Steam client's copy; the shell keeps fetching and caches it for the next launch` (logWarning)
  - Creating the resolver issues nothing.
- Registry: in helperRegistry.ts add an optional dep `resolveSteamApiDylib?: () => Promise<string | null>`. The registry exposes a non-optional `resolveSteamApiDylib()` that defaults to resolving null, and the method is added to the BridgeHelperSlice Pick. Every existing test registry stays valid unchanged.
- bootstrap.ts bridge-helper-registry step: pass `resolveSteamApiDylib: createSteamApiPinResolver({ requestRustInvoke: requireHost(state).requestRustInvoke, isMac })`, with isMac from backend/constants/environment. Update the step comment: construction is still inert, and the first rustInvoke is issued only from a bridge launch.
- helperSpawn.ts: ensureHelperSpawned options gain `steamApiDylib?: string | null`. When it is a non-empty string, append `'--steam-api-dylib', steamApiDylib` to BOTH argv shapes, and mention pinned vs client copy in the spawn log line. Update the doc comment: the path is argv, the secret is still env-only.
- helperProcess.ts ensureBridgeHelperReady: add a per-call memoized getter around `registry.resolveSteamApiDylib()`. Before each of the three ensureHelperSpawned calls, await the getter only when `!registry.helpers.has(appId)`, because a reused live entry needs no resolution, and pass the result as `steamApiDylib`. Mention the bound in the function doc.
- Helper C:
  - Create native/steam-bridge/helper/gamelib_steam_api_pin.h with:
    - an include guard
    - `#ifndef GAMELIB_STEAM_API_PIN_SHA256` / `#define GAMELIB_STEAM_API_PIN_SHA256 "4162eb40...6bac"` (full value) / `#endif`. The override exists only so the integration test can build a test-pinned helper; production never sets it. A comment states this and the bump-with-dispatch rule.
    - `GAMELIB_STEAM_API_PIN_STEAMUSER "SteamUser_v023"`
    - a static validator `gl_steam_api_pin_check(const char *path, const char **reasonOut)` returning 1 only if all of these hold: (1) the path is non-empty, under 1024 bytes, starts with `/`, contains no `/../` or `/./` segment and no trailing `/..`, and its basename is `libsteam_api.dylib`, else `invalid-path`; (2) `open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)` succeeds, else `open-failed`; (3) fstat shows S_ISREG, else `not-regular-file`; (4) st_uid equals getuid() and the mode has no S_IWGRP/S_IWOTH, else `unsafe-owner-or-mode`; (5) the size is at most 16 MiB, else `too-large`; (6) the file is read through CC_SHA256 (`<CommonCrypto/CommonDigest.h>`, libSystem, no new link flag), else `read-failed`; (7) the lowercase hex equals the pin, else `sha256-mismatch`. The fd is always closed.
  - In bridge_helper.c, `#include "gamelib_steam_api_pin.h"` beside the other gamelib_*.h includes. Parse `--steam-api-dylib <path>` in main's argv loop into a static `g_steam_api_dylib_arg`. Make `resolve_dylib_path` take the handed path first, but only when `gl_steam_api_pin_check` passes. Otherwise it keeps the existing `$HOME` Steam-tree path and records `UNPINNED` plus the reason (`no-flag` when absent). Rewrite its T-24-SC comment: a caller-provided path is now accepted only when its bytes hash to the compiled-in pin.
  - Right after the dlopen in load_steam_api, and before the NULL check, so a failed dlopen is logged too, emit one line with snprintf + logts in category `PIN`: either `source=pinned sha256=<pin> dylib=<path> loaded=<0|1>` or `source=UNPINNED reason=<reason> dylib=<steam-tree path> loaded=<0|1>`. Validation failure never exits the helper. It only falls back (spec item 3's last resort).
- Integration test additions in helperIntegration.test.ts: every clang invocation (the test dylib, plus the second helper built from `buildHelperCompileArgv()` with the `-D` element inserted before `-o`) and every spawn uses `profile.childEnv()`. Add no new jest.mock. Wait for the PIN line with the existing stderr-accumulate pattern, then kill the child.
- Then run `pnpm build-steam-bridge`, so public/bin/arm64/darwin/steam-bridge-helper carries the flag, and `graphify update .`.
- Commit only this task's paths. Stage named paths: never `git add -A`/`-u`/`.`, and never Phase 47's files.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-depot steam_api_pin && cargo test --bin gamelib-shell && cargo fmt -p gamelib-depot -- --check && rustfmt --check --edition 2021 src/depot_dispatch.rs && cd .. && pnpm check:ipc-contract && pnpm build-steam-bridge && pnpm exec jest --runTestsByPath src/backend/storeManagers/steam/bridge/__tests__/steamApiPin.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperRegistry.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/sidecar/__tests__/rustInvokeChannel.test.ts src/backend/host/__tests__/rustChannelAllowlist.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm codecheck && for p in src/common/types/sidecarTransport.ts src/common/types/ipc/rustInvoke.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/sidecar/bootstrap.ts src/backend/storeManagers/steam/bridge/steamApiPin.ts src/backend/storeManagers/steam/bridge/helperRegistry.ts src/backend/storeManagers/steam/bridge/helperSpawn.ts src/backend/storeManagers/steam/bridge/helperProcess.ts src/backend/storeManagers/steam/bridge/__tests__/steamApiPin.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "UNEXPECTED ignored: $p"; exit 1; }; done && npx prettier --check src/common/types/sidecarTransport.ts src/common/types/ipc/rustInvoke.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/sidecar/bootstrap.ts src/backend/storeManagers/steam/bridge/steamApiPin.ts src/backend/storeManagers/steam/bridge/helperRegistry.ts src/backend/storeManagers/steam/bridge/helperSpawn.ts src/backend/storeManagers/steam/bridge/helperProcess.ts src/backend/storeManagers/steam/bridge/__tests__/steamApiPin.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</automated>
    Grep gates (baselines measured at planning time):
    - `grep -c -- "'--steam-api-dylib'" src/backend/storeManagers/steam/bridge/helperSpawn.ts` [HEAD=0 EXPECT>=1]
    - `grep -c -- '"--steam-api-dylib"' native/steam-bridge/helper/bridge_helper.c` [HEAD=0 EXPECT>=1]
    - `grep -c "steam_api_pin_resolve" src/common/types/sidecarTransport.ts` [HEAD=0 EXPECT>=1]
    - `grep -c "resolveSteamApiDylib" src/backend/sidecar/bootstrap.ts` [HEAD=0 EXPECT>=1]
    - `grep -c '^name = ' src-tauri/Cargo.lock` [HEAD=684 EXPECT==684] (sha2 0.10.9 is already locked, so no new package)
    Formatter note: the .rs/.c/.h/.toml paths report `inferredParser: null` under `prettier --file-info`, so prettier cannot check them. Rust is covered by `cargo fmt -p gamelib-depot -- --check` plus `rustfmt --check` on depot_dispatch.rs. rust_dispatch.rs is not rustfmt-clean at HEAD (pre-existing, exit 1), and src-tauri/src/ipc_contract.rs is generated, so both are left out. The repo has no C formatter (no .clang-format); the C matches the surrounding style by hand.
  </verify>
  <done>With the pinned dylib already cached, a bridge launch passes `--steam-api-dylib` and the helper logs `PIN    source=pinned ... loaded=1`. Every failure (no cache, a tampered cache file, an invalid or unpinned handed path, a slow or failing resolve) still launches on the client copy with UNPINNED and its reason logged. The pin record, the helper header and the dispatch surface are coherence-tested. All verify commands pass, and the commit holds only this task's paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: fill resolve steps 2-3 (snapshot the matching client copy, else fetch from Valve's CDN with sha2vz, VZ decode, member extraction, sha256 and team-ID checks, and an atomic cache write)</name>
  <files>src-tauri/crates/gamelib-depot/src/steam_api_pin.rs, src-tauri/crates/gamelib-depot/src/container.rs, src-tauri/crates/gamelib-depot/src/fetch.rs, src-tauri/crates/gamelib-depot/tests/steam_api_pin.rs, src-tauri/crates/gamelib-depot/tests/container.rs, src-tauri/crates/gamelib-depot/tests/support/encode.rs, .planning/todos/pending/2026-11-17-ci-head-check-pinned-steam-api.md</files>
  <read_first>
    - .planning/spikes/089-pinned-dylib-source-and-signing/README.md "Investigation Trail" items 2, 4 and 5 (verify sha2vz plus the dylib sha256, never the manifest's sha2; both hosts serve the package), fetch-pin.sh, vz.py
    - src-tauri/crates/gamelib-depot/src/container.rs lines 180-226 (decode_vz) and 360-452 (unzip_manifest, unzip_first_entry)
    - src-tauri/crates/gamelib-depot/src/fetch.rs lines 115-150 (install_crypto_provider, http_client) and src/lib.rs lines 35-50 (the crate's `runtime()`)
    - src-tauri/crates/gamelib-depot/tests/support/encode.rs (vz_wrap, zip_wrap, crc32) and the header of tests/container.rs (`#[path = "support/encode.rs"] mod encode;`)
  </read_first>
  <behavior>
    - container: `unzip_entry_named(buf, name, cap)` returns the exact bytes of a named stored or deflated member out of a multi-entry zip, including a zip whose other entries use backslash directory names as Valve's do. A missing name, a zip64 marker, a declared size above cap, or an unsupported method each give a DecodeError. Existing `unzip_first_entry`/`unzip_manifest` behavior is byte-for-byte unchanged (the existing container and golden tests stay green).
    - steam_api_pin (integration tests, FakeIo serving bytes per URL plus a stub signature check, synthetic pin built from vz_wrap(zip_named([...junk, member]))):
      - The client copy with a matching sha is snapshotted. The result is source `snapshot`, the cache file is created, and FakeIo is never asked to fetch.
      - A client copy with a mismatched sha falls through to the fetch: source `fetched`, and the file bytes equal the member.
      - The first host failing and the second succeeding gives `fetched`.
      - A package whose sha2vz is wrong, a decoded member whose sha256 is wrong, or a signature check that rejects each give `unpinned`, with a detail naming the step (for example `cache=miss;client=absent;cdn=<host>:sha2vz-mismatch`), and no file at the final cache path.
      - A body larger than package_size is rejected without being fully buffered (FakeIo honours max_bytes).
      - A second resolve after `fetched` gives `cached`.
      - On unix the cache dir mode is 0700 and the file mode is 0444.
      - No `.partial` temp file survives any path.
    - Live (ignored, networked): `resolve_with(LiveIo)` into a tempdir layout whose client_copy does not exist gives `fetched`, a file sha equal to PIN.dylib_sha256, and on macOS a passing codesign team check. A second call gives `cached`.
  </behavior>
  <action>
- container.rs: factor the local-header body read out of `unzip_first_entry` (offset, method 0/8, csize/usize, bounds, `drain_capped` for deflate) into a private helper that both callers share, and leave `unzip_first_entry`'s results unchanged. Add `pub fn unzip_entry_named(buf: &[u8], name: &str, cap: u64) -> Result<Vec<u8>, DecodeError>`, which walks every central-directory record from the EOCD (count at eocd+10, offset at eocd+16; per record: method +10, csize +20, usize +24, name_len +28, extra_len +30, comment_len +32, local offset +42, name at +46) with checked slicing, matches the exact name bytes, and enforces cap.
- fetch.rs: make `install_crypto_provider` `pub(crate)` so the pin client reuses it.
- steam_api_pin.rs (per spec items 2-3):
  - Add `pub trait PinIo` with `fn fetch(&self, url: &str, max_bytes: u64, deadline: Instant) -> Result<Vec<u8>, String>` and `fn verify_signature(&self, path: &Path, team_id: &str) -> Result<(), String>`.
  - Add `pub struct LiveIo`:
    - fetch: a OnceLock reqwest::Client (install_crypto_provider first; redirect Policy::none; connect_timeout 10 s; timeout 45 s; user agent `GameLib`), run through `crate::runtime().block_on`. HTTP 200 only. Reject a Content-Length that differs from max_bytes. Read with `resp.chunk()` and stop with an error the moment the total exceeds max_bytes. Error strings carry a short code and the host, never a body.
    - verify_signature: on macOS, run `/usr/bin/codesign -v <path>` (it must succeed), then `/usr/bin/codesign -dv --verbose=2 <path>`, whose stderr must contain `TeamIdentifier=<team_id>`. Off macOS it returns Ok, since resolve never runs there.
  - Add `pub fn resolve_with(layout, pin, io: &dyn PinIo) -> Resolution`, which holds the lock and runs the steps in order:
    - (1) cached, from Task 1;
    - (2) snapshot: if `layout.client_copy` is a regular file whose sha256 equals pin.dylib_sha256, commit it;
    - (3) CDN: for each CDN_HOSTS entry, until the 50 s overall deadline passes, fetch `https://<host>/<package>` with max_bytes = package_size. Verify sha256(body) == package_sha256, then decode with `container::unzip_manifest` (VZa path) and extract `unzip_entry_named(zip, pin.member, pin.dylib_size)`. Verify sha256 == dylib_sha256, then commit;
    - (4) unpinned, with the accumulated detail.
  - Commit means: DirBuilder recursive with mode 0700 for cache_root and the `<sha>` dir. Write to a temp `.libsteam_api.dylib.partial-<pid>-<nanos>` in the same dir (create_new, mode 0600), `sync_all`, run `io.verify_signature(temp, pin.valve_team_id)`, set 0444, then rename onto the final name. On any error, remove the temp file.
  - Keep `pub fn resolve(layout, pin)` as `resolve_with(layout, pin, &LiveIo)` so the Task 1 shell handler needs no change. Sources: snapshot, fetched.
- tests/support/encode.rs: add `pub fn zip_named(entries: &[(&str, &[u8])]) -> Vec<u8>`, building stored entries plus a central directory and EOCD. It reuses crc32.
- tests/container.rs: add the named-entry cases.
- New tests/steam_api_pin.rs: holds the behavior cases (FakeIo, tempfile layouts, synthetic pins with `Box::leak` for computed hex strings) and the `#[ignore = "networked: fetches the real pin from Valve's client-update CDN"]` live test against the real PIN.
- Deferred spec item 6: create .planning/todos/pending/2026-11-17-ci-head-check-pinned-steam-api.md. Its frontmatter: created, title "CI: HEAD-check that Valve's CDN still serves the pinned libsteam_api package", area steam, then exactly `severity: minor`, `platform: any`, `ready: code` in that order (bare, lowercase), source quick 261117-ubb, files (steam_api_pin.rs, .github/workflows). The body says CDN retention is proven only to about 4 weeks (089 Open risks), describes a scheduled workflow that HEADs both CDN_HOSTS for PIN.package, and notes that a cached pin never needs the CDN again.
- Run `graphify update .`. Commit only this task's paths.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-depot && cargo test -p gamelib-depot --test steam_api_pin -- --ignored --nocapture && cargo fmt -p gamelib-depot -- --check && cargo test --bin gamelib-shell && cd .. && python3 .planning/todos/todo-frontmatter-gate.py</automated>
    `cargo test -p gamelib-depot` runs the unit, container, golden and steam_api_pin suites. The `--ignored` run is the one networked check: it proves the real pin constants decode end to end from Valve's CDN. If the executor's machine has no network, record that in the SUMMARY as UNRUN; the operator's live gate covers it. The todo gate script path is what `pnpm planning-gates` runs for todo frontmatter. If its invocation differs, run `pnpm planning-gates` instead.
    Formatter note: this task writes only .rs files (prettier `inferredParser: null`, covered by `cargo fmt -p gamelib-depot -- --check`) and one .planning todo, which `prettier --file-info` reports as `"ignored": true`. A prettier check there would be vacuous, so it is omitted by design. The todo is hand-matched to the existing pending todos' frontmatter.
  </verify>
  <done>From an empty cache with network up, resolve gives `fetched` and a 0444 file in a 0700 `<sha>` dir whose sha256 equals the pin, and the next resolve gives `cached`. A matching client copy is snapshotted with no fetch. Every integrity failure (sha2vz, member sha256, team ID, an oversized body) gives `unpinned` with the failing step named and no partial file left. The deferred CI HEAD check is recorded as a gated pending todo.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Valve CDN -> Rust shell | Package bytes over HTTPS from client-update hosts. Untrusted until sha2vz verifies them. |
| user filesystem -> Rust shell | Steam client copy and cache files. Re-hashed before every use. |
| sidecar -> Rust shell | Empty-args rustInvoke. The shell derives every path itself from HOME. |
| sidecar -> helper argv | `--steam-api-dylib <path>`, re-validated by the helper independently. |
| helper -> dlopen | The only code-loading step. Pinned bytes, or the Valve-installed client copy. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ubb-01 | Tampering | steam_api_pin.rs CDN fetch | high | mitigate | HTTPS only through rustls, with redirects disabled. sha256(package) must equal sha2vz before any decode. sha256(member) must equal dylib_sha256. codesign -v plus TeamIdentifier=MXGJJ98X76 run before the file enters the cache (Task 2). |
| T-ubb-02 | Elevation of Privilege | bridge_helper.c resolve_dylib_path / --steam-api-dylib | high | mitigate | gl_steam_api_pin_check re-validates in the helper: absolute, no dot segments, basename, O_NOFOLLOW, S_ISREG, owner uid, not group/world-writable, 16 MiB cap, CommonCrypto sha256 equal to the compiled-in pin. On failure it never dlopens the handed path and falls back to the $HOME Steam tree, logging UNPINNED with the reason (Task 1). |
| T-ubb-03 | Tampering | cache dir ~/Library/Application Support/GameLib/steam-api | medium | mitigate | Dirs 0700, file 0444, written atomically (create_new temp, then rename in the same dir). Rust re-hashes the cached file on every resolve and deletes a mismatch. The helper hashes it again before dlopen. |
| T-ubb-04 | Tampering | helper hash-then-dlopen window (TOCTOU) | low | accept | Exploiting it needs same-uid write access inside a 0700 dir during a microsecond window. A same-uid attacker can already replace the Steam client copy or GameLib itself, so the residual adds no capability. |
| T-ubb-05 | Tampering | forced downgrade to UNPINNED (block CDN, delete cache) | low | accept | UNPINNED is the pre-change behavior: Valve's own installed client copy, with 261113-n39's runtime probe. It is logged as UNPINNED in both the sidecar and the helper. No privilege is gained. |
| T-ubb-06 | Denial of Service | launch path awaiting resolution | medium | mitigate | The sidecar race is capped at STEAM_API_PIN_WAIT_MS 10 s with an unref'd, cleared timer and a .catch on the in-flight promise. Rust caps connect at 10 s, a request at 45 s and the whole resolve at 50 s. The launch proceeds UNPINNED. Nothing runs at sidecar boot (exit contract half 2). |
| T-ubb-07 | Denial of Service | oversized or hostile response body | low | mitigate | Content-Length must equal package_size, and the chunk read stops once max_bytes is exceeded. The decoder only ever sees bytes that already passed sha2vz, so the decoded size is Valve's. Member extraction is capped at dylib_size. |
| T-ubb-08 | Spoofing | malformed or unexpected Rust reply in the sidecar | low | mitigate | A strict parse accepts a path only for cached/snapshot/fetched, absolute, ending /libsteam_api.dylib, with no NUL or newline. Anything else is UNPINNED, and the helper re-validates regardless. |
| T-ubb-09 | Information Disclosure | dylib path visible in `ps` argv | low | accept | The path holds no secret. The WR-03 launch secret stays env-only and scrubbed. |
| T-ubb-SC | Tampering | cargo dependency sha2 = "0.10" in gamelib-depot | high | mitigate | No new package enters the supply chain. sha2 0.10.9 is already in src-tauri/Cargo.lock (via tauri-codegen). The gate `grep -c '^name = ' src-tauri/Cargo.lock` stays at 684. No npm/pip installs, so no legitimacy checkpoint is needed. |
</threat_model>

<verification>
Automated, after both tasks (cwd = checkout root):
- `cd src-tauri && cargo test -p gamelib-depot -p gamelib-depot-cli && cargo test --bin gamelib-shell && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > "${TMPDIR:-/tmp}/ubb-clippy.json" && node ../meta/clippyRatchet.cjs "${TMPDIR:-/tmp}/ubb-clippy.json"`. The darwin ceiling must hold, with no new warnings. The win32 leg is CI's, and the shell handler keeps its mac-only code inside cfg blocks for that reason.
- `pnpm check:ipc-contract && pnpm codecheck && pnpm lint && pnpm test:ci`
- `pnpm find-deadcode`: no finding may name a file this plan touched. The baseline also carries Phase 47's concurrent line, which is not ours to change.
- `pnpm build-steam-bridge` succeeds, and `public/bin/arm64/darwin/steam-bridge-helper` is newer than bridge_helper.c.

<human-check>
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
</human-check>
</verification>

<success_criteria>
- Both tasks' verify commands pass, and the overall automated verification passes, or the networked `--ignored` run is recorded as UNRUN with its reason.
- A bridge launch on macOS loads the pinned v023 dylib from the GameLib cache (fetched once, then cached), falls back visibly to UNPINNED on every failure, and never waits more than 10 s on resolution.
- The helper loads no handed path whose bytes do not match its compiled-in pin.
- The pin, the helper header and the dispatch surface are coherence-tested. Non-macOS compiles and no-ops.
- The deferred CI HEAD check is recorded as a pending todo that passes the frontmatter gate.
- The live gate is handed to the operator as written in `<verification>`.
</success_criteria>

<output>
Create `.planning/quick/261117-ubb-load-a-pinned-cdn-fetched-libsteam-api-d/261117-ubb-SUMMARY.md` when done. Include: the first-launch decision as built (10 s bound and background completion); the actual cache path; whether the `--ignored` live CDN test ran and its result; the deferred CI HEAD-check todo path; the Phase 47 precondition outcome; and the live-gate steps, verbatim, for the operator.
</output>
