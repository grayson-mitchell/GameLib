# Phase 63: Rust migration pattern and executable scanners - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Move the executable scanners from TypeScript to Rust and settle a migration pattern that later
ports (the next one is the Steam depot download pipeline) can copy. The ported scanners are the
PE scanners in `src/backend/storeManagers/steam/bridge/`: `peSections.ts`, `importScan.ts`,
`peSteamDrm.ts` and `drm/drmScanExe.ts`. The Mach-O export reader `src/backend/tools/machoExports.ts`
is ported too. The pattern settles where ported code lives in `src-tauri/`, how the app calls it,
how headless tools call it, a parity harness, and a per-scanner TypeScript fallback flag. When
the phase ends the TS scanners are deleted. No new scanning capability is in scope.

</domain>

<decisions>
## Implementation Decisions

### Headless tool path and crate layout
- **D-01:** Headless Node tools reach Rust through a **standalone Rust CLI binary**.
  `meta/bridgeCensus.ts` (`pnpm bridge-census`) is one such tool: it runs under plain Node with no
  shell, so `rustInvoke` isn't available to it. The CLI takes a path and prints JSON. A permanent
  second TS implementation and a napi-rs native addon were both rejected, so in the end there is
  **one implementation, in Rust**.
- **D-02:** `src-tauri/` becomes a **Cargo workspace** with three members:
  - `gamelib-shell`, the existing app crate;
  - a **Tauri-free library crate** for the scanners (working name `gamelib-scan`), pure parsing
    with no Tauri dependency;
  - a thin **CLI bin crate** over the library.

  Later ports add sibling library crates the same way. This layout is part of the reusable
  pattern.
- **D-03:** **The app calls the scanners in-process through `rustInvoke`**, using the shell's
  existing sidecar→Rust request/response channel. Only headless tools spawn the CLI. Both paths
  use the same library crate.
- **D-04:** Anything in `meta/` (or `src/`) that spawns the CLI must use `createFakeHomeProfile()`
  under the fake-HOME convention (load `Skill("gamelib-conventions")`).

### importScan / objdump
- **D-05:** The Rust port **parses the PE import and delay-import tables natively**. objdump stops
  being a runtime dependency of the scanner. `peSteamDrm.ts`'s `readPeImportedDllNames` and
  `readPeSteamApiDelayImports` are the existing native reference.
- **D-06:** **The whole import-closure walk moves to Rust.** That covers following dependent DLLs
  next to the exe (`scanImportClosure`). TS sends `{ exePath }` (plus the appId if Rust needs it)
  and receives the complete closure result in one round-trip. The fail-closed behaviours carry
  over, including the T-51-06 typed error when both `steam_api.dll` and `steam_api64.dll` show up.
- **D-07:** If native parsing and the old objdump-based TS result disagree on a real game, **treat
  it as a parity failure to investigate**. objdump is not assumed to be correct. That scanner's
  flag stays on `ts` until the cause is understood and written down.

### Boundary and signatures
- **D-08:** The boundary sits at **caller-facing entry points**, with one async `rustInvoke`
  channel per operation, a path going in and a small result coming out. Candidates are
  `scanSteamApiImports`, a path-based Steam DRM detect, the PE machine arch, the PE imported DLL
  names, the steam_api delay imports, SteamStub section detection, `detectLaunchDrmWrapper`,
  `containedGameExeReal` and `checkWinemacMetalViewExports`. The planner settles the final list.
  The `Buffer`/`PeReader`-taking helpers become Rust internals, and **bytes never cross the
  JSON-lines pipe**. Neither a single "scan everything" channel nor a 1:1 mirror of every helper
  was chosen.
- **D-09:** **Sync callers become async.** The roadmap's "TypeScript function signature unchanged"
  is relaxed to: same name and result type, now `Promise`-returning and path-based. Today's sync
  call sites are:
  - `shimGenerate.ts:525`: `hasSteamStubSection(parsePeSectionNames(buf))`
  - `shimGenerate.ts:606`: `detectSteamDrmInPe(reader)`
  - `gameLaunch.ts:809`: `detectSteamDrmInPe(reader)`
  - `gameMakerRunner.ts:87`: `readPeImportedDllNames(reader)`
  - `dxmt.ts:152` and `dxmt.ts:217`: `checkWinemacMetalViewExports`
  - `meta/bridgeCensus.ts:1439` and `:2216`: `readPeSteamApiDelayImports` and `detectSteamDrmInPe`.
    These go through the CLI.

  The roadmap names `steam/games.ts` as a caller. After phase 62's split, the DRM call sites are
  in `gameLaunch.ts` and `gameBridgeLaunch.ts`.
- **D-10:** Rust must keep the security properties the TS code enforces. That means
  `containedGameExeReal`'s game-folder containment and realpath check, the numeric-appId check
  (T-24-06), and the bounded reads (`PE_SECTION_SCAN_BYTES`, `MAX_PE_SECTIONS`).

### Fallback flag and parity
- **D-11:** **A flag per scanner** (shape like `scanners.<name>: 'rust' | 'ts'`). Each scanner's
  flag **defaults to Rust once that scanner's parity passes**, and a scanner that fails parity can
  be held on `ts` alone. The flag is dev/advanced only and not shown in the normal UI.
- **D-12:** **The parity harness has two tiers:**
  1. Small synthetic or crafted PE and Mach-O fixtures, committed to the repo, run in CI through
     `cargo test` and a TS-vs-Rust parity test. They cover SteamStub sections, CEG resource
     names, delay imports, both-arch `steam_api` imports, truncated or malformed headers,
     x86/x64 and the winemac Metal exports.
  2. A local-only sweep over every installed game exe on this machine, shaped like bridge-census,
     that diffs TS against Rust per scanner. **Game binaries are never committed.**
- **D-13:** **"Verified live" means all of the following:**
  - the local sweep shows zero TS/Rust diffs;
  - a live `pnpm tauri:dev` smoke on the Rust path exercises every caller: shim generation,
    the GameMaker runner, the DRM checks in `gameLaunch`/`gameBridgeLaunch`, and the DXMT Metal
    check.

  Once that holds, **the TS scanners and their flags are deleted inside this phase**. Restart dev
  so the sidecar is rebuilt (`tauri dev` doesn't rebuild it).

### Claude's Discretion
- How headless tools get the CLI built: build on demand with incremental `cargo build`, or use a
  prebuilt binary with a staleness check. Either way, fail clearly when cargo or the binary is
  missing. The user declined to choose.
- Whether the Jest tests for TS callers mock the async scanner boundary or spawn the real CLI.
  Mocking keeps Jest free of a Rust toolchain. The user declined to choose.
- Crate and channel naming, the JSON result shapes (they mirror the existing TS result types),
  running the scans off the async runtime (e.g. `spawn_blocking`), whether the
  `rustInvoke` 60 s timeout needs an `UNBOUNDED_RUST_CHANNELS`-style exception for large closure
  walks, and keeping the workspace building on all three CI legs (macOS, Linux, Windows).
- Whether objdump can be dropped from any bundle or doc once `importScan` is verified on Rust.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` § "Phase 63: Rust migration pattern and executable scanners": goal, the
  file list, the headless-tools open question (resolved by D-01), and the depot-pipeline second step.

### Sidecar → Rust seam
- `src/backend/sidecar/sidecarRpc.ts` (`requestRustInvoke`, ~L405): the allow-list
  `RUST_INVOKE_CHANNELS`, the 60 s `RUST_INVOKE_TIMEOUT_MS`, `UNBOUNDED_RUST_CHANNELS`, and the
  `unref()`'d timers.
- `src/common/types/sidecarTransport.ts`: channel constants, mirrored in `src-tauri/src/main.rs`.
  Phase 62's D-12 parity test keeps the two in step.
- `src-tauri/src/sidecar.rs`, `src-tauri/src/main.rs`: the Rust-side dispatch.
- `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts`: the existing channel test pattern.
- `src-tauri/Cargo.toml`: the current single-crate layout that D-02 restructures.

### Scanners being ported
- `src/backend/storeManagers/steam/bridge/peSections.ts` (50 lines)
- `src/backend/storeManagers/steam/bridge/importScan.ts` (306 lines, objdump-based; see D-05)
- `src/backend/storeManagers/steam/bridge/peSteamDrm.ts` (494 lines, `PeReader` callback API)
- `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts` (148 lines)
- `src/backend/tools/machoExports.ts` (170 lines)

### Callers
- `src/backend/storeManagers/steam/bridge/shimGenerate.ts`, `bridge/gameMakerRunner.ts`,
  `steam/gameLaunch.ts`, `steam/gameBridgeLaunch.ts`, `src/backend/tools/dxmt.ts`,
  `bridge/bridgeScan.ts` (scan backend interface), `meta/bridgeCensus.ts` (headless, via the CLI)

### Conventions and project guidance
- `Skill("gamelib-conventions")`: fake-HOME spawn isolation (D-04), the sidecar exit contract,
  the `<verify>` prettier check.
- `Skill("spike-findings-gamelib")`: the Rust/Tauri rearchitecture patterns (Node sidecar, seam).
- `.planning/spikes/010-steam-user-rust-vs-sidecar/` and
  `.planning/spikes/067b-chunk-decode-bench/`, `067c-rust-depot-job/`: earlier Rust-vs-Node
  spikes, background for the pattern and the depot second step.
- `.planning/PROJECT.md` § Key Decisions "Port to Tauri v2": learning is an explicit goal, and
  verification (live gates), not porting, is what drives the cost.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requestRustInvoke()` and the Rust dispatch: the in-process path for D-03. A new channel needs
  an allow-list entry on both sides plus the phase 62 parity test.
- `readPeImportedDllNames` / `readPeSteamApiDelayImports` in `peSteamDrm.ts`: native PE import
  parsing already exists in TS. They're the reference for D-05 and can serve as the parity oracle
  alongside the objdump path.
- `createFakeHomeProfile()`: required for spawning the CLI from `meta/`.
- `bridgeScan.ts` already abstracts the import scan behind a backend interface
  (`scanImports: (p) => scanSteamApiImports(appId, p)` at `shimGenerate.ts:822`), which is a natural
  seam for the flag.

### Established Patterns
- Typed `{ status: 'error' }` results with a logged warning instead of throwing (`importScan.ts`).
- The sidecar exits by draining its event loop at stdin EOF. Anything new must not hold it open.
- Rust consts are mirrored from `sidecarTransport.ts` with marker comments (phase 62, D-12).

### Integration Points
- The workspace move touches the Tauri build (`tauri.conf.json`, the `build:sidecar-sea` and
  `tauri:dev` scripts, CI cargo/clippy legs, the clippy ratchet) wherever they assume the crate
  sits at the `src-tauri/` root.
- `meta/bridgeCensus.ts` imports `peSteamDrm` by relative path today and will call the CLI instead.

</code_context>

<specifics>
## Specific Ideas

- The pattern should be written up so the depot-pipeline port (the next migration step, which is
  waiting on a spike measured against ~10 MiB/s) can follow it without new design work. That
  means: a workspace member crate, a `rustInvoke` channel for the app, a CLI for headless tools, a
  per-unit flag, a two-tier parity harness, and deleting the TS once verified.

</specifics>

<deferred>
## Deferred Ideas

- The Steam depot download pipeline in Rust (migration step 2). It waits on its own spike, which is
  out of scope here.

### Reviewed Todos (not folded)
- `todo.match-phase 63` keyword-matched 21 pending todos (e.g. "x86 shim parity for the modern
  SteamInternal_* family", "Extend the clippy ratchet to the Windows leg"). None is about porting
  the scanners, so none was folded in.

</deferred>

---

*Phase: 63-rust-migration-pattern-and-executable-scanners*
*Context gathered: 2026-11-07*
