# Project Research Summary: v0.11 Node Sidecar Retirement

**Project:** GameLib
**Milestone:** v0.11 Node Sidecar Retirement (phase numbering starts at 82)
**Domain:** Incremental port of a large stateful Node/TS backend (`src/backend`, ~100k non-test lines, 511 files in the runtime bundle) to Rust inside the Tauri v2 shell, then deletion of the SEA sidecar
**Researched:** 2026-11-17
**Confidence:** MEDIUM-HIGH

Detail lives in STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md in this directory. This file is v0.11 only; `.planning/research/SUMMARY.md` belongs to an earlier milestone.

## Executive Summary

This is the last and largest step of a migration the repo has already run five times (Phases 63, 73, 75, 79, 80): per-domain Tauri-free crates with `dispatch(op, args)`, a `-cli` for headless parity, a trait-injected host, golden-trace parity replay, a short-lived `GAMELIB_<SLICE>=rust|ts` flag, and a per-slice delete gate. What is new in v0.11 is that every earlier slice was a leaf called from TS through `rustInvoke`. That stops working once a slice's callers are themselves Rust, and the renderer's front door (`sidecar_invoke` in `relay_commands.rs`) still relays everything into Node. So the first job is a native channel router with sidecar fallback, a shared `gamelib-core` (paths, `FrontendEmitter`, `Clock`, `ProcessRunner`, shutdown token), and Rust owners for stores and logging. After that every slice is a leaf over a stable Rust substrate and deletes the sidecar channels it takes over.

Recommended approach: guardrails and shared safety primitives, then seam, then foundations as owners (logger, then store host with TS as a write-through mirror), then low-risk leaves, then engine and launch pipeline, then the Steam state hub, then Steam services, then the Epic/GOG/Amazon runners and the managers on them, then the 18k-line bridge in at least three phases, then shell cutover and deletion. No new framework is needed. Additions are small: `serde_json` (preserve_order, tab indent) plus `tempfile` for a `gamelib-store` that reads and writes existing `conf` JSON byte-compatibly; an own log writer (`tracing` only as a Layer for steam-vent/reqwest events); `tokio::process`, `regex`, `shlex`, `which`, `tar`+`flate2`, `plist`, `rust-ini`, `notify`, `discord-rich-presence` (only if kept), all on the existing reqwest 0.13 / rustls-ring / tokio stack. Legendary, gogdl, comet and nile stay bundled external binaries.

The main risks are data loss and silent semantic drift, not technology. Repo review history shows recurring families: fail-open handling when a Rust call replaces a TS call, weaker path guards on delete, lossy store round-trips, fallback paths that never close, and green suites that do not prove parity. Mitigation is mostly ordering and discipline: land tri-state (`Yes|No|Unknown`, destructive guards refuse on `Unknown`), a shared `safe_path`, one atomic-write helper, a process runner with kill-tree and a shutdown contract, and an IPC-schema diff gate before any manager slice; zero the known-red CI list first; move state owners before consumers; write live gates before coding; make every slice's last plan its own deletion.

## Key Findings

### Recommended Stack (STACK.md)

Replace, do not add frameworks. Almost all backend Node deps map 1:1 to std or a small crate; the product-specific pieces (store backend, versioning, log writer) are ported as own code.

**Core technologies:**
- **tokio / tokio-util / reqwest 0.13 (in tree):** one runtime, one TLS config (rustls + ring) for all 20 axios files; `CancellationToken` for `aborthandler`.
- **`gamelib-store` (own; serde_json `preserve_order`, tab indent, `tempfile` persist, 0600/0700):** byte-compatible with `conf`; `#[serde(flatten)] extra` so unknown keys survive; migrations as pure `fn migrate(from, Value)` step tables with backup-before-migrate and refuse-newer. No confy/sled/rusqlite.
- **Own `gamelib-log` + `tracing` Layer:** per-prefix files, rotation gate, 0600 modes and line format are product behaviour that debug sessions and live-gate scripts grep; tracing-appender and tauri-plugin-log do not reproduce them.
- **`gamelib-proc` (`tokio::process`, argv-only, process-group/Job Object kill, `kill_on_drop` for jobs but not game launches, concurrent stdout/stderr line reads) behind a `ProcessRunner` trait; plus tiny `gamelib-testutil` `FakeHome`.**
- **Utilities:** regex (LazyLock, golden-tested), shlex 2, which, semver, plist, rust-ini (not `ini` 2.0), json5, tar+flate2 (entry-by-entry `unpack_in` so traversal checks stay ours), crc32fast, sanitize-filename, notify + debouncer with a poll backstop. Add zip/sevenz-rust2/quick-xml only when a slice proves a caller.
- **Version notes:** set `rust-version` honestly per crate (RustCrypto 0.11 generation ~1.85+, depot 1.89); keep base64 at 0.22 to match steamcm; update `EXPECTED_LOCKFILE_CRATE_NAMES` in the same commit as each lockfile change; keep keyring 3.x.
- **Do not add:** tauri-plugin-store/fs/log/http, a second runtime, native-tls/OpenSSL, anyhow in crates, embedded JS engines, a second VDF parser, a new IPC mechanism.

### Expected Features (FEATURES.md)

**Must keep working (table stakes):** sign-in for Epic/GOG/Amazon/Steam/Humble; unified library with metadata/artwork; install/update/repair/move/uninstall for all stores; download queue with pause/resume; launch (native, Wine/Proton/CrossOver, gamescope/mangohud, known-fix, anti-cheat); engine selection and per-game bottles; Steam on macOS via bridge/DRM/overlay; cloud saves; shortcuts; settings with versioned stores; logs; Humble key sync/claim; offline mode and `gamelib://`.

**Scope controls (anti-features):** do not reimplement Epic/GOG/Amazon protocols (Rust spawns and parses bundled binaries); no long dual TS/Rust path; do not port tests 1:1 (port the high-value oracles: Humble 12.9k, engine 9.1k, tools 4.7k, shortcuts 2.7k, downloadmanager 2.7k test lines as Rust tests or recorded fixtures; delete source-text gate tests).

**Already Rust, only TS shims remain:** steamcm, depot, steamfiles, steampoll, scan, i18n, Tauri shell. These shims (~1.4k in `host/*`, `dialog/*`, `keyringTokenStore`, `storeEmbedSeam`, plus ~2.3k of Steam shims) are cheap deletions but only die when their TS callers die.

**Zero-risk deletions early:** `sidecar/fileStore.ts` (432; see Gaps, conflicting reading), `legendary/commands/*` (~270, type-only), type-only files, ~20 unused exports in the knip baseline, `*/e2eMock.ts` (pending decision).

**Hidden costs:** `utils.ts` (1.9k) and `bootstrap.ts` (3.25k) are grab-bags whose real behaviour is DI wiring: inventory responsibilities before slicing. `ipcValidation`/`rendererPathGuard`/`openPolicy` are security semantics that must be reproduced in Rust. Low test-ratio dirs (wine 0.5x, migration, game_overrides, anticheat, recent_games, constants) need recorded fixtures before porting.

### Architecture Approach (ARCHITECTURE.md)

Today: renderer -> `relay_commands.rs` -> sidecar stdin -> `*FlowRegistration.ts`; Rust-served features are reached only by the sidecar calling back via `rustInvoke`. Target: `relay_commands.rs` checks the allowlist, then a new `native_router` (channel -> `async fn(args, &AppState)`), then falls back to the sidecar; deleting the sidecar later removes only the fallback. Logic and state live in Tauri-free crates that depend on `gamelib-core` by trait; `*_native.rs` shell modules are glue only.

**Major components:**
1. `native_router.rs` + generated `NATIVE_*_CHANNELS` sets (one owner per channel, enforced by test); serde `deny_unknown_fields` arg structs replace `ipcValidation`, with a negative test per channel.
2. `gamelib-core`: `Paths`, `StoreHost`, `Logger`, `FrontendEmitter`, `Clock`, `ProcessRunner` trait, `Shutdown` token (hoisted from steampoll). Domain crates depend on core, never on each other except by trait.
3. Store host: Rust is the only disk writer; TS `fileStore`/`typed_store` become a write-through mirror (a cache with a named deletion point), flipped per store family, global settings last. Migrations run once at shell boot with goldens; rollback lever is unsafe after the first migrated boot.
4. State actors: one owner per long-lived state (libraryState, gameSession, update cache, download queue); mutations persist then emit.
5. Event inversion: moving libraryState deletes `steamPollEventRegistration.ts`, the outbox/ack/seq code and `polls=ts`; moving the CM session turns `ShellJobHost` sidecar round trips into in-process calls.

Anti-patterns: per-field ownership flip; Rust calling into TS for settings/state; per-tick callbacks; porting `*FlowRegistration.ts` as its own slice (shrink by deletion inside each slice); trusting renderer args after validation moves; deleting packaging before the last import is gone.

### Critical Pitfalls (PITFALLS.md)

1. **Fail-open on rejected Rust calls** (75-REVIEW WR-01/02/07, 63 WR-01/02): tri-state readers; destructive guards refuse on `Unknown`; one injected-rejection test per guard. Put the rule in `crates/README.md` before slice 1.
2. **Weaker path guards on delete** (80-REVIEW A-CR-01/A-WR-01, 63 WR-03 UNC): one shared `safe_path`; never derive a trust root from the data being validated; adversarial table (nested installdir, `.\x`, `C:\x`, UNC, symlink, case, NFC/NFD) on all three OS legs; fix known TS defects in the port as recorded divergences (nested co-install bug still in TS `uninstallBottleGameDirectly`).
3. **Store format compatibility checked only against fresh fixtures:** real-file corpus from operator profile and older releases; unknown-key preservation; roundtrip diff test; participate in Phase 68 versioning; atomic write preserving mode and symlinks; corrupt file means back up and keep, never reset.
4. **Dual paths that never close:** each slice ends with its deletion plan; flag defaults to `rust` at parity and a grep gate fails if a `GAMELIB_*` flag outlives its slice; the libraryState slice deletes the Phase 80 handler/ack in the same slice.
5. **Green suites do not prove parity:** live gates authored before coding, per OS; golden traces recorded from TS before porting and kept as fixtures; concurrency model written per object; stalled-peer and never-settles tests; stale-snapshot write-back (P16) and missing timeouts (P17) apply to every stateful slice.

Also load-bearing: the sidecar exit contract (CLAUDE.md convention) must be replaced by a Rust `Shutdown` token and bounded `RunEvent::Exit` drain, SIGKILL-of-parent tested (P10); Keychain access stays behind `keyring_dispatch` and is proven on a signed-release upgrade (P12); known-red list zeroed or retired first (P21).

## Implications for Roadmap

### Reconciling the four build orders

| Source | Position | Resolution |
|---|---|---|
| ARCHITECTURE | A seam, B logger, C stores, D leaves, E engine, F Steam libState, G Steam services, H bridge, I runners, J manager/Humble, K cutover, L delete | Adopted as the spine, with the changes below |
| FEATURES | Zero-risk deletions; foundations; Steam deferred state; leaves; engine/launcher; managers + downloadmanager + Humble; bridge; delete | Adopted for: deletions first, managers before bridge |
| PITFALLS | Zero known-red; tri-state/safe-path/atomic write; process runner + shutdown; IPC schema diff; logger; state owners before consumers | Adopted as a new Phase 82, plus hoisting ProcessRunner/Shutdown into the seam phase |

Specific rulings:
1. **Foundations before or after leaves.** Guardrails (82), seam (83), logger (84), store host (85), then leaves. A leaf written against a sidecar callback for settings must be rewritten, so no leaf starts before 85.
2. **ProcessRunner placement.** ARCHITECTURE puts `process/` in E; PITFALLS says every manager needs it SIGKILL-tested first. Ruling: `ProcessRunner` trait, `Shutdown` token and `gamelib-proc` kill-tree land in 83 and are proven on three OS legs. `commandRunner` and engine consumers port in 87/88.
3. **libraryState vs engine.** libraryState depends on stores and leaves, not engine; only Steam services and the bridge need both. Ruling: engine/launch (87, 88) first, libraryState (89) immediately after. Do not split libraryState across phases.
4. **Bridge vs runners/managers.** Ruling: bridge last among ports. It needs the stable engine API and ProcessRunner exercised at volume; downloadmanager needs Steam install APIs from 90 anyway; the bridge has the largest live-only verification surface. Cost: the biggest uncertainty lands late. Mitigation: run its research spike early; phases 95-97 can overlap 91-94 if a second lane exists.
5. **Launcher placement.** Ruling: `launcher.ts`, `commandRunner`, known-fixes, `utils.ts` split go in 88. The `utils.ts` responsibility inventory is a Phase 82 deliverable. Cutover keeps only protocol, quit, boot steps.
6. **Crate naming.** Ruling: core holds traits and composition-root types; store/log/proc are implementation crates (headless-testable, `-cli` where `meta/` needs it). One crate per cohesive domain.

### Recommended phase sequence (indicative numbering from 82)

**82. Guardrails, hygiene, shared safety primitives.** Known-red suite list zeroed or each suite retired (including the `ipcDomainCensus`/`flowRegistrationCensus` drift gates); tri-state rule and `safe_path` module with adversarial table; Rust `FakeHome`; `crates/README.md` update; responsibility inventory of `utils.ts` and `bootstrap.ts`; zero-risk deletions (type-only files, dead exports, `legendary/commands/*`, `fileStore.ts` only after the Gaps check); milestone-wide state-ownership table; vacuous-pass guard on gates. Standard.

**83. Native seam and `gamelib-core`.** `native_router.rs` consulted by `relay_commands.rs` before the sidecar relay; generator extension (`NATIVE_INVOKE/SEND_CHANNELS`, one-owner test); IPC schema diff gate; `gamelib-core` skeleton with `ProcessRunner` hoisted from steampoll; `gamelib-proc`; `Shutdown` token with bounded exit drain, SIGKILL-of-parent tested on three OSes; flag helper and `*PortComplete` gate template; live-gate template; proven by moving one tiny shell-only channel. NEEDS RESEARCH (spike): send-kind channel ordering (`SidecarSendQueue`), invoke/send interleave, `[GAMELIB_IPC_INVALID_CHANNEL]` behaviour.

**84. Logger.** `gamelib-log` with identical `gamelib.log` format, per-prefix files, rotation gate, 0600 modes, `sanitizeRendererLogMessage` redaction; tracing Layer (fixes dropped diagnostics, 79 WR-03); repeated-error rate limiting; upload/delete-uploaded/show-in-folder native; TS logger becomes a fire-and-forget forwarder; shell `shell_diag` second log path removed; Windows share-delete.

**85. Store host, config and versioned migrations.** `gamelib-store` + `StoreHost`; snapshot/fetch/new/set/delete/`storeChanged` served natively; `fileStore`/`typed_store`/`store_backend` become a TS write-through mirror; `storeVersioning` + `storeMigrations` + `migration/*` ported with before/after goldens captured from TS first, Phase 68 versions, pre-migration backup, newer-file read-only; per-family flip order (caches first, global settings last); keyring names unchanged; the shared `steam_store/config.json` handled explicitly. Rollback window ends at first migrated boot. NEEDS DEEPER RESEARCH AND A SPIKE: sync TS reads over async Rust ownership, read-your-writes, `storeChanged` vs snapshot ordering, JSON byte-compat both ways, Windows atomic rename with an open file, real-file corpus harvest, signed-build Keychain upgrade test.

**86. Pure leaves (one or two phases).** `wiki_game_info` first, `crossover_index`, `storeSearch`/`discounts`, `anticheat`, `runsForMe`, `recent_games`, `game_overrides`, `steamgrid`, `images_cache`, `appshell`, `macArch`, `online_monitor`/`connectivityNow`, `cache`, `gamedetails`, `signInProbe` parser parts; delete TS and the matching registrations per slice; record fixtures first for zero-test dirs.

**87. Engine, wine, tools, CrossOver index.** `gamelib-engine` (CrossOver-first with Staging fallback, per-game bottles, ledger, launch deadlines, wine-manager releases), `wine/` downloads, `tools/` (winetricks queue, DXVK/DXMT/vkd3d). NEEDS DEEPER RESEARCH: empirical CrossOver/Staging behaviour; live gates on real engines.

**88. Launch pipeline.** `commandRunner`, `spawnAsync`, `launcher.ts`, `gamescopeCommand`, `launchSingleFlight`, `knownFixes*`, anticheat at launch, remaining `utils.ts` pieces. NEEDS DEEPER RESEARCH: golden argv/env traces recorded from TS.

**89. Steam library state.** `libraryState`, `gameSession`, update-detection cache, installedMap, refresh as one actor; deletes `steamPollEventRegistration.ts`, outbox/ack/seq, `polls=ts`, and TS poll remnants in the same phase. Resolve Phase 80 open warnings (A-WR-01, A-WR-02, poison-event cap) before or inside. NEEDS DEEPER RESEARCH.

**90. Steam services and TS depot path.** `games.ts` surface, user/sign-in/redeem glue, install/uninstall/launch routing, update detection, `bridgeInstallState.ts` leftover, `depot/` + `depotRust/`, `gameLaunch`, `steamLaunchWatch`, `macSteam*` adoption; `ShellJobHost` in-process; Steam shims deleted.

**91-92. Runners.** 91: legendary; output parsers first with real captured transcripts. 92: gog (gogdl/comet, presence per decision 1), nile, sideload, `storeManagerCommon`, `save_sync`, signInProbe rest. NEEDS DEEPER RESEARCH: external binary formats, Windows process-tree kill and quoting.

**93. Download manager.** Queue, finished list, stall watchdog, persisted state, resume-after-quit; regression scenarios from `steam-dm-queue-wedge` and `gog-download-resume-from-zero`; `easydl` replaced by reqwest Range. NEEDS DEEPER RESEARCH.

**94. Humble, shortcuts, remaining services.** Humble (best test oracle; secrets via `keyring_dispatch`), `shortcuts/`. Humble can slide to right after 86.

**95-97. Steam bridge (minimum three phases).** 95: install routing, import scan, shim placement/generation, shared-redist install. 96: launch and bottle lifecycle. 97: DRM mode, overlay, known fixes, stop/update-launch. "Bridge verified" stays strict; DRM boundary rules apply. Native code in `native/steam-bridge/` stays. NEEDS DEEPER RESEARCH per phase.

**98. Shell cutover.** `protocol.ts`, `quitHandler`, boot sequence in Rust `setup`, native quit replacing `quit_via_sidecar`, remaining `sidecar/` registrations native, `devSecretVault` per decision, `processGuards` replaced by Rust panic policy.

**99. Sidecar deletion.** `sidecar.rs`, `SidecarState`, relay half of `relay_commands.rs`, `rust_dispatch.rs`, `externalBin`, `meta/buildSidecar*`, `smoke:sidecar`, `src/backend/**`, backend jest project, SEA CI steps, entitlement tightening, `nodeRetired.test.ts` gate, size delta recorded, CLAUDE.md sidecar convention replaced. Preconditions: packaged macOS build with sidecar absent; `codesign --verify --deep`; updater-from-previous-release test; `cargo test --workspace` on three legs. NEEDS DEEPER RESEARCH.

### Phase ordering rationale
- Logger and stores are imported by nearly everything through DI; engine precedes launch precedes runners and bridge; libraryState precedes Steam services; downloadmanager follows every manager; sidecar plumbing dies last.
- State owners move before consumers so no new Rust-to-TS callbacks appear; each owner moves once.
- Risk is graded: cheap high-leverage first (82-84), one high-risk foundation early with a spike (85), bulk low-risk leaves (86), then live-gate-heavy blocks each on a stable substrate.
- Every phase's last plan is its own deletion (TS source, registrations, flag, ceilings lowered in the same commit, test ledger complete).
- Parallelism if a second lane exists: Humble and leaves after 85; bridge can overlap 91-94 after 90.

### Open human decisions
| # | Decision | Needed by | Research recommendation |
|---|---|---|---|
| 1 | Discord presence: keep via `discord-rich-presence` or drop | Phase 92 | Drop unless used; user-visible, needs consent |
| 2 | `CI=e2e` mocks (210 lines, bootstrap branch "unreachable"): keep or delete | 82 or 98 | Delete unless an e2e suite still runs |
| 3 | `migration/migrations/legendary.ts`: port or delete | 85/91 | Verify reachability; likely delete |
| 4 | `devSecretVault`: Rust dev-only equivalent | 98 | Keep, cfg-gated out of release |
| 5 | Config mirror vs port consumers first | 85 | Mirror |
| 6 | Humble position | Roadmap | 94 by default |
| 7 | Extract `gamelib-core` in 83 | 83 | Yes |
| 8 | Windows/Linux live-session cadence | Roadmap | One batched session per 2-3 slices |
| 9 | `legacyZoomDataCleanup`, `devEpicCookieSweep`, `nativeImageShim` | 98 | Delete where unreachable |
| 10 | "~129k lines" vs measured | Roadmap | ~100k non-test incl. 18k sidecar glue |

### Research Flags
Needs research-phase or spike: 83, 85, 87, 88, 89, 91-92, 93, 95-97, 99. Standard: 82, 84, 86, 90, 94, 98.

## Confidence Assessment
| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH / MEDIUM (choices) | Versions from crates.io 2026-11-17 |
| Features | HIGH (sizes) / MEDIUM-LOW (channel counts) | esbuild metafile reachability |
| Architecture | MEDIUM-HIGH | Router fallback and send ordering not spiked |
| Pitfalls | HIGH (repo history) / MEDIUM (packaging, Keychain) | Phase 73 has no REVIEW file |

### Gaps to Address
- **`fileStore.ts` contradiction:** FEATURES calls it dead (`store_backend.ts:63`); ARCHITECTURE reads it as owner of the renderer store bridge. Check in 82; if live it is 85 scope.
- Phase 80 open warnings may still be open; check `80-REVIEW-FIX-*.md` before 89.
- Router fallback and send ordering: Phase 83 spike.
- Keychain behaviour on binary change: signed-release upgrade check in 85 and 99 live gates.
- Renderer vs backend npm dep split: re-grep at each removal.
- Known-red suites as IPC drift gates: fix or replace in 82.
- Test ledger per slice (581 backend test files go away).
- Per-phase sizing rough; revisit after 85.

---
*Research completed: 2026-11-17 — synthesized from the four v0.11 research files*
