# Deferred Items — Phase 34.3 (Tauri IPC re-plumb slice 6)

## From plan 34.3-04

Full backend `npx jest` sweep (run as part of this plan's own verification) surfaced 3
pre-existing failures, none caused by this plan's files (`src/backend/logger/index.ts`,
`src/backend/sidecar/loggerFlowRegistration.ts`, `src/backend/sidecar/__tests__/loggerFlows.test.ts`,
`src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts`). Out of scope per the executor's
scope-boundary rule (pre-existing failures in unrelated files); not fixed here.

1. **`src/backend/sidecar/__tests__/rustInvokeChannel.test.ts`** — documented Phase 34.1-era
   baseline failure, unrelated to logger channels. Already tracked across multiple prior
   SUMMARYs in this phase (34.3-01, 34.3-03).

2. **`src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts`** ("unlink of folder
   fails") — environment-path-depth-dependent test bug (asserts an error message containing an
   absolute path whose depth varies by checkout location). Already documented in
   `34.3-01-SUMMARY.md` as confirmed pre-existing via `git stash`.

3. **`src/backend/__tests__/cargoFeatures.test.ts`** ("Cargo.lock crate-name set pin") — NEW
   finding, not previously logged. Fails because plan 34.3-03 added
   `tauri-plugin-clipboard-manager` (and its transitive deps: `arboard`, `clipboard-win`,
   `wayland-*`, `x11rb*`, etc.) to `Cargo.lock`, but `EXPECTED_LOCKFILE_CRATE_NAMES` in
   `cargoFeatures.test.ts` (an AR-34.1-07/FOLLOW-UP-1 supply-chain pin) was never updated to
   match. 34.3-03's own verification ran a *targeted* jest sweep (`tauriShellSource`,
   `tauriConf`, `longRunningChannels`, `lifecycleStub`), which does not include
   `cargoFeatures.test.ts`, so the gap was never caught. Fix direction: add the 27 newly-appeared
   crate names to `EXPECTED_LOCKFILE_CRATE_NAMES` after a supply-chain review of the new
   transitive dependency tree (all already slopcheck-verified as part of 34.3-RESEARCH.md's
   package legitimacy audit for `tauri-plugin-clipboard-manager` itself, but the *transitive*
   crates were not individually audited). Natural home: the next plan in this phase that touches
   `Cargo.lock`/supply-chain pins, or a standalone follow-up.

   **RESOLVED** at the phase 34.3 wave-1 post-merge gate — pin updated, disclosure recorded
   below as AR-34.3-01. Supply-chain review of the transitive set is owed to
   `/gsd-secure-phase 34.3`.

---

## From plan 34.3-09 (Task 1, the blocking live-gate's automated sweep)

Both items below are confirmed pre-existing / out of scope — neither touches any of the 25 files
this phase's plans 34.3-01..08 modified (confirmed via `git diff --stat`). Not fixed here.

1. **`npm start` (Electron) prints a console error at renderer mount:**
   `Error occurred in handler for 'getCrossoverIndex': Error: No handler registered for
   'getCrossoverIndex'`. Root cause: a startup-timing race in `crossover_index/ipc_handler.ts`'s
   `addHandler('getCrossoverIndex', ...)` registration vs. the renderer's mount-time pull —
   `main.ts`'s own docstring (L360-368) already documents the pull-path/refresh-path split this
   racy handler sits in, from Phase 19/WR-05, well before this phase existed. Did not prevent the
   app from launching or the library from rendering (confirmed via `Starting the Download Queue` +
   full Steam library push in the log). Natural home: a future Electron-main-process debug session,
   not this Tauri-sidecar-focused phase.

2. **`src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts` is cwd-dependent.**
   Running the full backend suite via `cd src/backend && npx jest` (as this plan's own Task 1 text
   literally specifies) fails this one test — an error-string assertion embeds an absolute path
   whose depth changes depending on which directory jest was invoked from, producing a spurious
   double `src/backend/src/backend/...` path when run from inside `src/backend` itself. Running the
   identical command from the repo root (`npx jest --selectProjects Backend --config
   src/backend/jest.config.js`) passes clean, matching the corrected 115/116-suite baseline given to
   this executor. Same test/class of bug already logged from plan 34.3-04 above ("documented Phase
   34.1-era... path-depth-dependent" pattern) — recorded here again because THIS plan's own literal
   instruction text (`cd src/backend && npx jest`) is what triggers it, so the next executor should
   run the full sweep from repo root, not `src/backend`.

---

## From plan 34.3-09 (Task 1) — SEA sidecar build was broken since Phase 34.2, fixed here

`pnpm build:sidecar-sea` failed with `COMPILE GATE FAILED (D-06): esbuild SEA bundle exited 1:
Top-level await is currently not supported with the "cjs" output format` inside
`node_modules/i18next-fs-backend/esm/{writeFile,readFile}.js`. Root cause: `sidecar/bootstrap.ts`'s
`import Backend from 'i18next-fs-backend'` (commit `a8e7c8093`, **Phase 34.2 plan 01**, "initialize
i18next in sidecar bootstrap (D-02)") resolves esbuild's `import` condition to the package's ESM
build regardless of this bundle's own `--format=cjs` output (a dual-package hazard). This has been
silently broken since 2026-07-25 — nobody had re-run `build:sidecar-sea` between then and this gate.
**Fixed in this plan** (Rule 3, blocking build-config error, no package install) by adding
`--alias:i18next-fs-backend=i18next-fs-backend/cjs` to `meta/buildSidecarSea.ts`'s
`buildEsbuildArgv()`, forcing resolution to the package's genuine CJS entry. See
`34.3-LIVE-GATE.md`'s "Deviation" subsection for the full root-cause trail and verification
(re-ran the build clean, standalone-smoke-tested the resulting SEA binary with a scrubbed `PATH`).
Logged here per this file's own convention, even though it was fixed rather than deferred, because
the underlying defect's ORIGIN (Phase 34.2) is worth a permanent record for whoever next touches
`sidecar/bootstrap.ts`'s i18n init or `meta/buildSidecarSea.ts`.

---

## Supply-chain disclosure — AR-34.3-01

**Carry this entry into `34.3-SECURITY.md` when `/gsd-secure-phase 34.3` runs.**
Format mirrors AR-34.1-07 in `34.1-SECURITY.md`.

| Field | Value |
|-------|-------|
| ID | AR-34.3-01 |
| Threat | T-34.1-SC (supply chain — cargo installs) |
| Origin | Plan 34.3-03, commit `3a83772d` |
| Disclosed | 2026-07-26 |
| Owner | Grayson Mitchell |
| Status | accepted, transitive review owed to secure-phase 34.3 |

**What changed.** Plan 34.3-03 added `tauri-plugin-clipboard-manager = "2"` (resolved 2.3.2)
to `src-tauri/Cargo.toml` to build the slice's Rust clipboard seam. This pulled **27 crates
that were not previously in `Cargo.lock`**, taking the pinned crate set from 475 to 502:

`arboard`, `clipboard-win`, `crunchy`, `downcast-rs`, `error-code`, `fax`, `fixedbitset`,
`gethostname`, `half`, `nom`, `petgraph`, `quick-error`, `tauri-plugin-clipboard-manager`,
`tiff`, `tree_magic_mini`, `wayland-backend`, `wayland-client`, `wayland-protocols`,
`wayland-protocols-wlr`, `wayland-scanner`, `wayland-sys`, `weezl`, `wl-clipboard-rs`,
`x11rb`, `x11rb-protocol`, `zune-core`, `zune-jpeg`

**Structure of the addition.** All 27 are the transitive closure of `arboard` 3.6.1, the
canonical Rust cross-platform clipboard crate and `tauri-plugin-clipboard-manager`'s sole
functional dependency. They decompose into three groups:

- *Platform clipboard backends* — `clipboard-win` (Windows), `wl-clipboard-rs` +
  `wayland-*` (Linux/Wayland), `x11rb*` (Linux/X11). macOS uses the `objc2-*` crates
  already present in the lockfile. Only the current target's backend compiles.
- *Image-clipboard decoders* — `tiff`, `weezl`, `zune-jpeg`, `zune-core`, `fax`,
  `tree_magic_mini`, `half`, `crunchy`. Pure decode code, no network or process surface.
- *Small utility crates* — `nom`, `petgraph`, `fixedbitset`, `downcast-rs`, `error-code`,
  `quick-error`, `gethostname`.

**Why accepted.** (a) All 27 are checksum-pinned in `Cargo.lock` against crates.io;
(b) they arrive transitively through a first-party Tauri-org plugin, not an ad-hoc
dependency pick; (c) the decode/utility crates carry no network or process-spawn surface;
(d) the plugin is not droppable — it is the seam REQ-34.3 requires, and D-02's
zero-capability-grant stance (verified in 34.3-RESEARCH.md: clipboard-manager has no init
IIFE) already constrains its runtime reach.

**Residual risk.** 34.3-RESEARCH.md's package-legitimacy audit covered
`tauri-plugin-clipboard-manager` itself but **not** the 27 transitive crates individually.
Ownership and advisory status for the `wayland-*` / `x11rb*` / image-decode sets remain
unaudited. `/gsd-secure-phase 34.3` should close this before the phase is marked secure.

**Detection worked as designed.** The pin test added by AR-34.1-07 / FOLLOW-UP-1 exists
precisely so a dependency addition "fails a test rather than passing under a zero-packages
rollup claim." It caught this. The gap was that plan 34.3-03 ran a *targeted* jest sweep
that excluded `cargoFeatures.test.ts` — the phase-level post-merge gate is what surfaced it.
