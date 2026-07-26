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
