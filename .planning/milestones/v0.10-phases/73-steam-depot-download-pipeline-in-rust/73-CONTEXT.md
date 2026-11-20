# Phase 73: Steam depot download pipeline in Rust - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

The Steam depot download pipeline moves to Rust: manifest fetch and parse, chunk fetch, decrypt,
decompress, write, file post-processing and ACF writing. The TypeScript pipeline
(`src/backend/storeManagers/steam/depot/`, ~11.6k non-test lines) and `lzma-native` are then
deleted inside this phase. The reason is **retiring the sidecar, not speed or memory** (spikes
067a/067b). This is the second slice of the incremental Rust migration Phase 63 started, and it
reuses that pattern: a sibling crate in the `src-tauri/` Cargo workspace, `rustInvoke` from the
sidecar, a CLI binary for headless tools, a parity harness, a dev-only fallback flag, and
deletion once verified live.

Node keeps everything that needs the CM connection (`steam-user`): appinfo, depot selection,
manifest request codes, depot keys, CDN host lists and CDN auth tokens. It also keeps the policy
layer around an install: queue, breadcrumbs, shared-redist lease and ledger, Steam handoff.

Not in this phase: delta updates (Phase 74), a Verify or Move UI, moving any CM traffic to Rust.

</domain>

<decisions>
## Implementation Decisions

### Carried from Phase 63 (not re-asked)
- Crate layout: a new Tauri-free library crate beside `gamelib-scan`, plus CLI access for
  headless tools (63 D-01/D-02). The app calls it in-process via `rustInvoke` (63 D-03).
  Spawns from `src/`/`meta/` use `createFakeHomeProfile()` (63 D-04).
- **Bytes never cross the JSON-lines pipe**. Only job descriptions, events and small results
  do (63 D-08).
- A dev/advanced-only fallback flag, hidden from the normal UI (63 D-11). The TypeScript path is
  deleted inside the phase once verified live (63 D-13). Restart dev after sidecar changes.
- Crates from 067b: `aes` + `cbc` with `--cfg aes_armv8`, `flate2` on `zlib-rs`, `xz2` (static
  liblzma), `zstd`.

### Node/Rust boundary
- **D-01:** **Rust fetches and parses manifests.** Node supplies only CM-derived inputs per
  depot: manifest ID, manifest request code, depot key, CDN host list. Rust fetches each manifest
  from the CDN, parses it (protobuf content manifest), and caches it on disk. TypeScript
  manifest parsing (`loadContentManifestParser`, steam-user `getRawManifest` use) is deleted.
- **D-02:** TypeScript planning steps that read manifest file lists (the steam_api prescreen,
  `screenDepotPlanForSteamApi` / `prescreenBridgeDepots`, and anything else that inspects
  file paths) **ask Rust for summaries** over `rustInvoke`, such as matching paths and counts.
  They never receive the full manifest.
- **D-03:** **CDN auth tokens are requested from Node on demand.** When Rust needs a token for a
  host, or gets an auth failure (403) on one, it sends a request over the pipe and Node's
  `CdnAuthTokenCache` (`cdnAuth.ts`, including the `_send` workaround) answers. This needs a new
  **Rust→sidecar request direction** on the pipe, which doesn't exist today.
- **D-04:** **Depot selection stays in TypeScript** (`select.ts`, `appinfoOrder.ts`). It runs off
  PICS appinfo, which only Node fetches. Node hands Rust a job: depots, manifest IDs, request
  codes, keys, install dir and mode. Rust owns everything per file and per chunk, including CDN
  host health and failover (`hostHealth.ts`), stall tracking (`stallTracker.ts`) and the
  in-flight limiter (`inflightLimiter.ts`).
- **D-05:** **Delta-ready shape, no delta logic.** The job schema leaves room for Phase 74, for
  example an optional per-depot `from_manifest`, and the file and chunk writer is built to be
  reused for patching. Phase 74 implements the diff and patch.

### Progress, pause, cancel, errors
- **D-06:** **Push events on the pipe.** Add a Rust→sidecar event frame keyed by job ID. It
  carries throttled progress (bytes, files, current host, rate), per-chunk warnings, the D-03
  token requests, and the final outcome. Long jobs must not hit the 60 s `rustInvoke` timeout:
  either the start call returns at once and the outcome arrives as an event, or the channel goes
  on `UNBOUNDED_RUST_CHANNELS`. The planner picks one. The UI-facing progress shape stays as it
  is today.
- **D-07:** **Pause stays abort + reconcile** (T-23-15 semantics). Pause cancels the Rust job.
  Resume starts a new job, which reconciles what's on disk and fetches only what's missing or
  mismatched. Rust keeps no suspended in-memory state.
- **D-08:** **Rust cancels jobs when it loses the sidecar.** Jobs are owned by the sidecar
  connection. When the sidecar dies or restarts (dead-sidecar Restart, stdin EOF), Rust cancels
  every job and flushes. The restarted sidecar resumes from `resumeBreadcrumbs` through
  reconcile. No job keeps writing to disk without an owner, and there's no reattach logic.
- **D-09:** **Same error/outcome taxonomy, 1:1.** Rust emits the same outcome and error kinds
  that `outcome.ts` and the 23.2 manifest-write taxonomy define today, including stall and
  host-health errors. The sidecar maps them to the existing TypeScript types, so UI strings,
  toasts and download-queue behaviour don't change. A test asserts every kind maps.

### What else moves to Rust
- **D-10:** **All file-level post-processing moves into the Rust job.** That covers the sha1
  reconcile walk (`reconcile.ts`: `reconcilePartialState`, `verifyStructuralIntegrity`), the
  EDepotFileFlag ReadOnly/Hidden attributes (`fileAttributes.ts`), executable bits including
  the Mach-O content-gated +x fallback (`machO.ts`), the cross-depot path-collision check
  (`pathCollisions.ts`), and the flags census (`flagsCensus.ts`). All of them need the parsed
  manifest, which now lives in Rust.
- **D-11:** **ACF writing moves to Rust.** Rust measures real bytes on disk (keeping
  `finalizeToSteam`'s rule: never a manifest-derived sum, spike 001) and writes
  `appmanifest_*.acf` (the `buildAppManifestText` / `writeAppManifest` equivalent). TypeScript
  still **decides the policy inputs** (StateFlags and handoff mode, target library or
  steamapps root, bridge-bottle root) and passes them in the job. It also still owns adoption,
  Steam restart holds and library-state updates. The single-convergence rule holds: cancel,
  failure and success all go through the finalize step.
- **D-12:** **Shared redists use the same Rust job.** A Steamworks Common Redistributables
  download (`sharedRedist.ts`) becomes an ordinary Rust depot job with its own install root and
  no ACF. TypeScript keeps the lease, the per-GID ledger (`gamelib-shared-redists.json`) and
  the installer-run logic (`bridge/sharedRedistInstall.ts`).
- **D-13:** **Add a `verify_only` job mode without UI.** It runs the reconcile walk over an
  existing install and reports mismatches without fetching anything. It feeds the pending Verify
  todo later. No button or action ships in 73.

### Parity and cutover
- **D-14:** **The parity corpus is a codec-coverage set**, chosen so every codec and edge case
  is covered:
  - an LZMA-heavy game (Civ V, 067a's corpus);
  - a modern zstd/VSZa depot;
  - a zip/deflate depot;
  - a multi-depot game with a cross-depot path collision;
  - a Mac-native game that needs the Mach-O +x fallback (HUMANKIND);
  - a shared-redist job.

  Parity means byte-identical trees (SHA1 per file), identical file modes and attributes, and
  identical ACF text apart from timestamps. CI gets committed synthetic chunk and manifest
  fixtures in `cargo test`. Game content is never committed.
- **D-15:** **Delete gate: parity, live macOS run, CI builds.** All of these must hold:
  - zero corpus parity diffs;
  - a live `pnpm tauri:dev` smoke on macOS covering install, pause/resume, cancel, sidecar
    restart mid-job (D-08), a bridge install, and a shared-redist job;
  - the Rust crate builds and passes `cargo test` on all three CI legs (macOS, Linux, Windows),
    with `xz2`/liblzma statically linked.

  Windows and Linux are verified by build and test, not live. Once all three hold, the
  TypeScript `steam/depot/` pipeline, its decompress worker pool and bundle, `lzma-native`, and
  the October `lzma-native` SEA packaging code are deleted inside this phase.
- **D-16:** **One flag for the whole pipeline**, `depotPipeline: 'rust' | 'ts'`, dev/advanced
  only. It defaults to `rust` once corpus parity passes. Stages can't be mixed across the
  boundary, because manifests live on one side.
- **D-17:** **Performance gate is no regression.** On the same job and connection, Rust must
  match TypeScript throughput within noise, and its peak RSS must be no worse than the post-fix
  Node pool (`b8f015a08`, `db95a4373`). There's no speed-up target.

### Claude's Discretion
- The crate name (e.g. `gamelib-depot`), channel names, the exact event-frame and token-request
  wire shapes, and the async runtime structure (tokio tasks, `spawn_blocking` for decode).
- How the start call avoids the 60 s timeout (D-06), and where the on-disk manifest cache lives.
- Whether headless tools and tests reach the pipeline through the existing `gamelib-scan-cli`
  binary or a new one. Phase 63 D-01 requires a CLI; its form is open.
- The HTTP client crate, concurrency limits, and how much of `download.ts`/`downloadFiles.ts`
  internals carry over one-for-one versus being restructured idiomatically, as long as D-09
  and D-14 parity holds.
- Which codec-coverage titles to use for zstd and zip/deflate, picked from installed or owned
  games.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and pattern
- `.planning/ROADMAP.md` § "Phase 73: Steam depot download pipeline in Rust": goal, crate
  choices, open questions (answered above)
- `.planning/ROADMAP.md` § "Phase 74: Steam game updates": the downstream consumer of the D-05
  delta-ready shape
- `.planning/phases/63-rust-migration-pattern-and-executable-scanners/63-CONTEXT.md`: the
  migration pattern (workspace, `rustInvoke`, CLI, flag, parity tiers, delete-in-phase)
- `src-tauri/crates/README.md`, `src-tauri/crates/gamelib-scan/`,
  `src-tauri/crates/gamelib-scan-cli/`: the existing sibling-crate layout
- `src-tauri/src/rust_dispatch.rs`, `src-tauri/src/scan_dispatch.rs`, `src-tauri/src/sidecar.rs`:
  the Rust side of `rustInvoke` and the sidecar pipe (where the event and request frames are
  added)
- `src/backend/sidecar/sidecarRpc.ts`: `rustInvoke`, `UNBOUNDED_RUST_CHANNELS`, the 60 s timeout

### Spike evidence
- `.planning/spikes/067a-node-pipeline-stage-profile/README.md`: network-bound baseline
  (~18 MiB/s, Civ V corpus)
- `.planning/spikes/067b-chunk-decode-bench/README.md`: crate choices, the `aes_armv8` flag,
  the `zlib-rs` backend, the decode CPU numbers, the memory finding
- `.planning/spikes/067c-rust-depot-job/README.md`: the job-over-stdin shape and the
  "sidecar retired" trigger

### Pipeline being ported (reference implementation for parity)
- `src/backend/storeManagers/steam/depot/`: the whole directory, especially `plan.ts`,
  `download.ts`, `downloadFiles.ts`, `chunkDecode.ts`, `decompress.ts`, `crypto.ts`,
  `cdnAuth.ts`, `contentServers.ts`, `hostHealth.ts`, `stallTracker.ts`, `inflightLimiter.ts`,
  `reconcile.ts`, `fileAttributes.ts`, `machO.ts`, `pathCollisions.ts`, `flagsCensus.ts`,
  `finalize.ts`, `manifest.ts`, `outcome.ts`, `sharedRedist.ts`
- `.planning/milestones/v0.7-phases/23.2-steam-depot-selection-required-vs-optional-depots-and-skip-a/23.2-MANIFEST-WRITE-TAXONOMY.md`:
  the failure-path taxonomy D-09 must preserve
- `src/backend/storeManagers/steam/gameInstallDepot.ts`: `runNativeDepotDownload`, the queue
  entry, pause/resume (T-23-15)
- `src/backend/storeManagers/steam/gameInstallBridge.ts`: the bridge install path (steamapps root
  in the bridge bottle)
- `src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts`: resume after sidecar restart
  (D-08)
- `src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts`: the redist ledger and
  installer run that stay in TypeScript (D-12)

### Packaging being retired
- `meta/esbuildWorkerBundleShared.ts`, `src/backend/storeManagers/steam/depot/lzmaLoader*.ts`,
  `lzmaNativeBinding.ts`, `lzmaNativeResolvedPaths.generated.cjs`: the `lzma-native` SEA
  packaging deleted under D-15
- `.github/workflows/rust-test.yml`: the CI legs that must build the new crate with static
  liblzma

### Stack and conventions
- `.planning/research/STEAM-STACK.md`: the frozen Steam stack (`steam-user` stays the CM client)
- `Skill("gamelib-conventions")`: fake-HOME spawning (CLI tests), the sidecar exit contract
  (Rust jobs must not hold sidecar exit open, see D-08), the `<verify>` prettier rule

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gamelib-scan` / `gamelib-scan-cli`: the template for a Tauri-free library crate plus CLI.
- `CdnAuthTokenCache` (`cdnAuth.ts`): stays in Node and answers Rust's token requests (D-03).
- `resumeBreadcrumbs` + abort-before-restart in `gameInstallDepot.ts`: already give pause/resume
  and crash recovery the semantics D-07 and D-08 rely on.
- The 067b `rust-bench` code (`.planning/spikes/067b-chunk-decode-bench/rust-bench/`): a working
  Rust decrypt/decompress implementation with the correct crate flags (`.cargo/config.toml`).

### Established Patterns
- `rustInvoke` is **request/response only today**. Rust can't push events or send requests
  back to the sidecar. D-03 and D-06 add both directions, which is the main new plumbing in
  this phase.
- `AbortSignal` is checked before every chunk and file in `download.ts`. Cancel in Rust needs an
  equivalent cancellation token checked at the same granularity.
- `finalizeToSteam` is the single convergence point for cancel, failure and success. Keep that
  shape in Rust (D-11).

### Integration Points
- `runNativeDepotDownload` (`gameInstallDepot.ts`): the call site that switches on the D-16 flag.
- `buildDepotPlan` / `fetchDepotPlanEntry` (`plan.ts`): split so Node does CM calls and selection
  and Rust does manifest fetch and parse (D-01, D-02).
- `downloadSharedRedistDepotsLeased` (`sharedRedist.ts`): becomes a Rust job submission (D-12).
- The sidecar dispatch registration (`*FlowRegistration.ts`): the progress events feed the
  existing download-queue progress emitters unchanged.

</code_context>

<specifics>
## Specific Ideas

- Six bridge installs that Spike 070 found stale (Manor Lords, Core Keeper, Abiotic Factor,
  Planet Crafter, Hell Clock, Mining Mechs) are Phase 74 fixtures. Leave them untouched during
  73 parity runs so they stay usable as stale-build fixtures.
- 067b noted that `zstddec` re-initialises its WASM decoder per chunk. That goes away with the
  Rust port, but make sure a zstd depot is in the corpus (D-14), because 067a's corpus had none.

</specifics>

<deferred>
## Deferred Ideas

- Delta (patch) downloads: Phase 74, built on the D-05 job shape.
- A Verify button or action and Move install for Steam games: the pending todo, built on the
  D-13 `verify_only` mode.
- Moving CM traffic (appinfo, request codes, depot keys, tokens) and depot selection to Rust:
  this belongs to a later sidecar-retirement slice.
- Live Windows/Linux install runs: build- and test-verified only in 73 (D-15).

### Reviewed Todos (not folded)
- `2026-10-29-depot-selection-installs-config-optionaldlc-opt-in-dlc.md`: a selection bug, and
  selection stays in TypeScript (D-04). Fix it separately.
- "Implement Verify and Move install for Steam games": not folded. 73 supplies only the
  `verify_only` engine mode (D-13).
- "Version the per-bottle gamelib-shared-redists.json ledger with the Phase 68 engine": the
  ledger stays in TypeScript (D-12), so the work is unchanged by 73.
- Other keyword matches (Windows signing, blank-render, toast theming and the rest) are
  unrelated to the depot pipeline.

</deferred>

---

*Phase: 73-steam-depot-download-pipeline-in-rust*
*Context gathered: 2026-11-09*
