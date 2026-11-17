# Domain Pitfalls

**Domain:** Incrementally porting a large stateful Node/TS backend (~129k lines in `src/backend`, 581 test files) to Rust and deleting the SEA sidecar. Milestone v0.11 (phases from 82).
**Researched:** 2026-11-17
**Overall confidence:** HIGH for repo-history findings (read from review/UAT/debug files); MEDIUM for the packaging and Keychain items (inferred from repo facts, not yet observed).

Evidence base: `.planning/phases/{63,75,79,80}-*/**-REVIEW.md`, `80-HUMAN-UAT.md`, `80-HANDOFF.md`, `80-CONTEXT.md`, `.planning/debug/**`, `.claude/skills/gamelib-conventions/SKILL.md`, `.claude/skills/spike-findings-gamelib/references/rust-migration-steam.md`, `src-tauri/crates/README.md`, `.planning/phases/68-*/68-CONTEXT.md`. Phase 73 has only UAT/VERIFICATION (no REVIEW), so its incidents come from the spike reference and the debug files.

The milestone's own constraint ("each slice deletes its TS; dual path only for a bounded window; renderer IPC unchanged") is the right shape. The pitfalls below are the ways the repo has already seen that shape fail, or is about to.

---

## Critical Pitfalls

### Pitfall 1: Fail-open error handling when a Rust call replaces a TS call
**What goes wrong:** A TS reader that used to be a synchronous in-process read becomes a `rustInvoke`. When the invoke rejects (transport failure, sidecar-to-shell hiccup, crate error), the caller's `catch` or default turns the rejection into the *permissive* answer ("not installed", "no conflicts", "no DRM").
**Evidence:** 75-REVIEW WR-01 (rejected rustInvoke becomes the permissive answer in state and safety readers; flipped the installed badge on transport failure); WR-02 (co-install delete guard ignores `ScanResult.skipped`); WR-07 (truncated or unreadable manifests read as "not installed" in every destructive guard); 63-REVIEW WR-01/WR-02 (failed `gamelib-scan-cli` read as "not CEG", "no delay evidence").
**Consequences:** Destructive paths (delete install dir, remove shim, overwrite store) run on a false negative. Silent data loss is the worst outcome.
**Prevention:** Every ported reader returns a tri-state (`Yes | No | Unknown`), and every destructive guard treats `Unknown` as "refuse". Make the Rust error type distinguish "absent" from "could not read". Add one test per ported guard that injects a rejected `rustInvoke` and asserts refusal.
**Detection:** grep new wrappers for `.catch(() => false|null|[])` and `?? false` around `rustInvoke`.
**Slice type:** every slice with a read-then-act path (stores/config, shortcuts, uninstall, engine/wine tools, download manager). Put the tri-state rule in the shared pattern (`src-tauri/crates/README.md`) before slice 1.

### Pitfall 2: Path-guard and deletion logic ported with weaker semantics (data loss)
**What goes wrong:** `remove_dir_all` and "is this path inside X" checks are re-implemented in Rust with differences in normalisation, case folding, UNC, symlinks or nested segments.
**Evidence:** 80-REVIEW A-CR-01 (library root derived from manifest content, guard was tautological, fixed); A-WR-01 (conflict scan compares a cleaned target against other manifests' raw installdirs, so co-installed `Studio/GameB` is deleted with `Studio`; still open at re-review); same bug still in TS `uninstallBottleGameDirectly` (`gameUninstall.ts:768-797`); 63-REVIEW WR-03 (`contained_real` returns a relative path for UNC on Windows); 75-REVIEW WR-04 (atomic write replaces a symlinked file with a regular file and drops its mode).
**Consequences:** Deleting a user's other game or files outside the library.
**Prevention:** (a) One shared Rust `safe_path` module (normalise both sides, case-fold on macOS/Windows only, reject `..`, drive prefixes, UNC, NUL, symlink escapes) used by every delete/overwrite; (b) never derive a trust root from the data being validated; (c) a mandatory adversarial test table per destructive op (nested installdir, `.\x`, `C:\x`, `\\server\x`, symlink, case variants, Unicode NFC/NFD) run on all three CI legs; (d) port the *bug list*, not just the code: when a TS site has a known defect, fix it in the port and record it as a 63 D-07 divergence.
**Slice type:** uninstall/game-manager slices (legendary, gogdl, nile, sideload, Humble), engine/wine/CrossOver cleanup, shortcuts.

### Pitfall 3: Persisted-format compatibility is only checked against fresh fixtures
**What goes wrong:** Rust reads/writes the same JSON store files (`electron-store`-style stores, library caches, restart hold, breadcrumbs, settings) but serde is stricter or differently lossy than JS: unknown fields dropped on rewrite, `null` vs missing, numbers as floats, key order, large u64 ids, BOM, CRLF, partially written files, files written by *older* GameLib versions.
**Evidence:** Phase 68 exists because user state and caches share directories (`store_cache/` holds non-refetchable Humble and Steam pending-adoption/restart-hold state, 68-CONTEXT D-01); 75-REVIEW WR-05 (a dropped manifest-id check made one malformed entry fail the whole update); 75-REVIEW WR-06 (installscript decode of `\n`/`\t` corrupts single-backslash Windows paths, differs from the TS decode); 80 CONTEXT D-16 (restart-hold and breadcrumb formats had to stay dual-readable); 79 D-10 precedent.
**Consequences:** Upgrade silently resets settings, drops library cache offline, loses Humble claim state, or crashes on an old file.
**Prevention:** (a) Harvest a **corpus of real store files** from the operator's profile and from older releases (sanitised) and run each store's Rust loader against it in a golden test; (b) every Rust struct that round-trips a user-owned file carries `#[serde(flatten)] extra: Map<String, Value>` (or edits a `Value`) so unknown keys survive; (c) Rust participates in the Phase 68 versioned-store mechanism (version key, ordered migration, pre-migration backup, newer-file behaviour), do not re-implement it; (d) a rewrite-roundtrip test (read, write, read; diff == empty) on every store; (e) atomic write with a unique temp name and lock (75 WR-03, 80 WR-03 STORE_LOCK pattern) in one shared helper, preserving mode and symlinks (75 WR-04); (f) corrupt-file behaviour is "back up and keep" never "reset to defaults".
**Detection:** a store diff after a no-op launch; user-visible reset of settings.
**Slice type:** "Backend foundations" (stores/config/migrations) must land first and own the shared helper; every later slice consumes it.

### Pitfall 4: Fallback / dual-path windows that never close
**What goes wrong:** The `polls=ts`-style dev flag and dual-readable formats outlive their purpose; the TS code stays "just in case" and both sides must be kept correct.
**Evidence:** Phase 80 shipped with 33 plans and the flag deleted at the end, but only because deletion was a numbered plan (80-33) gated on a recorded delete gate (`80-HUMAN-UAT.md`: "Delete gate MET"). Contrast the repo-wide pattern of "known red" suites carried across phases (`80-HANDOFF.md` lists 13+ suites "do not chase"). Phase 80 itself deferred libraryState/gameSession to v0.11 and left a TS state-event handler plus an ack protocol (D-02/D-05/D-08) that is *temporary scaffolding with real bugs*: B-WR-01, B-WR-02, C-WR-01, C-IN-04 (poison events re-sent every 10 s uncapped).
**Consequences:** Two implementations drift; the "fallback" is never exercised so it is broken when needed; or the transitional bridge becomes permanent.
**Prevention:** (a) Each slice's plan list must end with the deletion plan, and the phase is not complete until it merges; (b) a flag has an owner, a default of `rust` from day one of parity, and a CI check that fails if a `GAMELIB_*` fallback flag survives past its slice (grep gate); (c) the first v0.11 slice that moves `libraryState` into Rust must delete the Phase 80 state-event/ack handler in the same slice, not later; (d) cap fallback windows in calendar terms as well as plan terms.
**Slice type:** all; especially the Steam library state slice.

### Pitfall 5: "Green suite" does not prove parity; live gates catch what tests cannot
**What goes wrong:** Cargo and jest are green while real behaviour diverges (WKWebView vs Chromium, real Steam, real binaries, Windows).
**Evidence:** PROJECT.md Key Decisions: all 8 WKWebView-vs-Chromium divergences were found by a human, none by the ~3,500-test suite; Phase 34.5's live gate failed twice; v0.8 closed with 26 of 45 phases lacking a passed VERIFICATION. 80 live gates found real issues the harness could not (a Steam-driven handoff needs no restart hold; a 2026-11-02 nettop orphan from the old monitor). 63 live gate 7/8 with one user-accepted block. Debug `steam-install-spinner-hangs-tauri-live-g3002.md`: a never-settling await had no terminal handler; jest passed because mocks resolved instantly.
**Consequences:** Broken releases; operator becomes the test suite.
**Prevention:** Every slice defines its live smoke *before* coding (skill `live-gate-contract-authoring`), covers every OS the slice touches, and treats "operator reported pass" as a recorded artefact with expected/result per item (UAT shape rule). Add a timeout/never-settles scenario to every ported async path (kill the child, hang the CM, drop stdin).
**Slice type:** all; the sidecar-deletion slice needs its own full-matrix gate.

### Pitfall 6: Behavioural parity replay is built after the code (or skipped for non-Steam slices)
**What goes wrong:** Stateful behaviour (download queue, install flows, session state) is ported by reading code, and divergence is found in prod. Parity harnesses took large effort in 63, 79, 80 and the TS driver is deleted at the end (`steamPollParity`, `steamPollTsDriver` retired in 80-29), so there is nothing to compare against later.
**Evidence:** 80-CONTEXT D-14 (scenario replay diffing frontend messages, notifications, state events, files); 63-UAT/PARITY (4 VirtualSize-0 diffs accepted by operator); 79 REVIEW CR-01 (lease/kill-sender semantics changed behaviour of every in-flight op: `Replaced` reported and recovery skipped); 79 REVIEW C1/CR-01 (`getClient()` returns the most recently acquired lease; concurrent Refresh releases an install's client) , both are concurrency semantics that no per-function test catches.
**Prevention:** (a) Record **golden traces from the TS implementation before porting** (captured IPC frames/emits, file diffs, child-process argv) and keep the recordings in-repo as fixtures after the TS is deleted, so cargo tests keep replaying them; (b) explicitly list the concurrency model of every ported object (single owner? leases? generation counters?) in the plan and test stop/start races (80 A-WR-02: stop/start race leaves an uncancellable poller); (c) each divergence is written down (63 D-07).
**Slice type:** download manager, Epic/GOG/Amazon managers, Steam library state.

---

## Moderate Pitfalls (but likely in this milestone)

### Pitfall 7: Losing coverage when TS tests are deleted
**What goes wrong:** 581 backend test files vanish with their subjects; the Rust replacement has fewer tests, or tests that cannot fail.
**Evidence:** 80 CONTEXT D-14 ported 18 TS test files to cargo; 80-28 deleted the steam `__tests__`; 79-REVIEW tests "swallows a rejection" cannot fail (79 WR-06); `80-HANDOFF`: "80-23 init-rearm-skip and refresh status query have no dedicated rust-arm tests". Ceiling gates (`backend-di-ceilings`, jestMock baselines, tests-scope lint ceiling 661) must be *lowered in the same commit* or they go stale.
**Prevention:** Each slice keeps a **test-ledger**: TS test file, behaviours asserted, Rust test that covers it (or "dropped, reason"). Verification checks the ledger. Run mutation-style checks on 3 to 5 key tests (flip the code, confirm the test fails). Lower the ceiling baselines in the deleting commit.

### Pitfall 8: IPC contract drift with the renderer
**What goes wrong:** Payload shape, channel name, event ordering, error shape or "async where it was sync" subtleties change; the renderer keeps working until a rare path.
**Evidence:** Phase 80 D-04/D-05 (same channels, exact stream diff; state change must precede emit so the frontend never refetches a stale library); `80-HANDOFF` carry-forward: `steampoll_status` invoked with `[{}]` against an empty-tuple schema; PROJECT.md: 220 IPC endpoints (158 handlers + 62 listeners), `AsyncIPCFunctions` ~335 typed entries; 33 "capability crash" incidents wired into sidecar bootstrap (tauri-rearchitecture reference).
**Prevention:** Generate or record the IPC schema (channel, args, return, error) from the TS types *before* each slice and diff it against the Rust command registry in CI (the `ipcDomainCensus`/`flowRegistrationCensus` suites are the starting point, but they are on the known-red list: fix them first or they guard nothing). Test the error path (reject with the same `Error.message` text the renderer displays). Keep event ordering assertions for any "state then notify" sequence.
**Slice type:** all; do it once as a foundation task.

### Pitfall 9: Process spawning and output parsing for legendary, gogdl, nile
**What goes wrong:** Rust spawn semantics differ from `child_process`: argv quoting on Windows, stdout/stderr interleaving and line buffering, progress lines split mid-chunk, non-UTF-8 output (Windows code pages), env inheritance, killing the process *tree* on cancel, exit-code vs signal semantics, zombie children when the parent is SIGKILLed.
**Evidence:** Phase 66.2 routed every backend spawn through a process runner and banned `child_process`, which gives a single seam to port, but the Windows live gate for 66.2 stayed `human_needed`; `.planning/debug/resolved/gogdl-spawn-tax.md` (vendored PyInstaller `--onefile` binaries re-extract on every spawn; NO fix applied, known upstream limitation; nile debug: latency hypothesis was falsified live); `gog-download-resume-from-zero.md`; `epic-cold-jar-login-timeout.md`; 80 UAT: nettop orphan after Force Quit (T-80-16) shows children outlive their parent unless Rust owns teardown.
**Prevention:** (a) Port the *output parsers* first as pure functions with fixtures captured from real legendary/gogdl/nile runs (progress lines, error lines, JSON blobs), including partial-chunk and CRLF cases; (b) one Rust `ProcessRunner` with: process-group/job-object kill, bounded grace then SIGKILL, lossy UTF-8 decode, no shell, `Command::arg` per argument (never joined strings), env built explicitly; (c) tests must spawn via the fake-HOME helper (convention 2) for real-binary arms, with one named real-profile arm; (d) the PyInstaller spawn-tax stays: do not claim the Rust port fixes latency; (e) pin external binary versions; the output format of legendary/gogdl/nile is an unversioned contract.
**Slice type:** Epic/GOG/Amazon manager slices; the process-runner is a prerequisite slice.

### Pitfall 10: Sidecar exit contract is replaced by nothing
**What goes wrong:** Today stdin EOF + event-loop drain owns the sidecar's lifetime, with `releaseOnStdinEof()` for non-unref'able handles. Rust tokio tasks have no such contract: a task or child spawned in the shell survives the quit path, or blocks shutdown.
**Evidence:** conventions skill (exit contract; the `gog/presence.ts:39` un-unref'd interval incident: real HOME never exits, fake HOME exits in 27.7s); debug `shutdown-mid-connect-logon-survives.md` (kill -9 mid-logon; library-internal timer relogged on 7 s later; fixed at the source); 80 CONTEXT D-07/D-08 (Rust polls stop via an explicit shutdown hook; `shutdown_child()` at `main.rs` SIGTERMs the process group). 79 REVIEW A/WR-02 (on exit the owed record is cleared on a detached open that may never run).
**Consequences:** Orphaned children (legendary/gogdl, nettop) holding sessions or files; quit hangs; owed-state restoration never runs.
**Prevention:** (a) Define a single Rust `Shutdown` token that every spawned task and child registers with, and a bounded `RunEvent::Exit` drain; (b) children go in a kill-on-drop / process-group / job-object guard, tested with a SIGKILL-of-parent scenario on each OS (the Force-Quit `ps` check was a live step in 80); (c) the *deletion slice* must retire the sidecar convention text in CLAUDE.md and the skill and replace it with the Rust equivalent, or the rule is orphaned; (d) never rely on an `unref`-style "fire and forget at boot": bound in-flight boot work.
**Slice type:** a foundation slice (runtime/shutdown) before the manager slices; re-verify at deletion.

### Pitfall 11: Fake-HOME isolation and secrets leakage in Rust tests
**What goes wrong:** `fakeHomeIsolation.test.ts` detects only in-repo TS spawn sites with hand-rolled `env`. Rust tests (and `-cli` binaries run from `meta/` harnesses) can read the real `HOME`, `APPDATA`, XDG, macOS Keychain or real Steam install, and write real data to logs.
**Evidence:** conventions skill (two incidents `260912-e6k`, `260913-901`; 103 MB of unredacted captures; the two-profile rule: isolated by default *and* one deliberate real-profile arm). 80-HANDOFF: Rust tests must pass on Windows (no `join("a/b")`); earlier 80 CI runs failed windows-latest on path-separator test bugs fixed in 6ec2e9db1, d6f314aec, f078c2762.
**Prevention:** A Rust `FakeHome` helper (the eight variables, mkdtemp 0700, dispose) shared by all crates; a lint/test that greps crates for `std::env::home_dir`, `dirs::` and `Command::new` in tests without it; every crate takes its roots as parameters (no global `home_dir()` inside library code); cargo tests run on all 3 OSes in `rust-test.yml` and are the Windows gate.

### Pitfall 12: macOS Keychain prompts and secret-store access after the owner process changes
**What goes wrong:** Secrets today go through `keyring_dispatch.rs` in the shell, and Humble/SteamGrid stores have Keychain migrations. When more code moves into Rust, if a slice touches secrets from a different binary (a `-cli` helper, a re-signed bundle, the dev build without the vault flag), macOS re-prompts, or ACL ownership changes make existing items unreadable.
**Evidence:** memory note "Dev launch is `pnpm tauri:dev`; `tauri:dev:run` skips the dev-vault flag so Keychain prompts every launch"; Phase 68 CONTEXT (Keychain secrets have their own migrations); `humbleSecretStore.ts`, `steamgridSecretStore.ts`. The macOS item ACL is bound to the code signature of the accessing binary (MEDIUM confidence, platform behaviour, not yet observed here for this migration).
**Prevention:** All secret access stays behind the one shell-side `keyring_dispatch` service and its service/account names unchanged; a `-cli` never reads real Keychain (parameterise a test vault); live gate item on a signed *release* build, upgrading from the prior release with a populated Keychain, confirming zero new prompts and that sign-ins survive. Windows Credential Manager and Linux Secret Service/libsecret equivalents need their own check (Linux without a keyring daemon is a known failure mode).

### Pitfall 13: Windows/Linux build and CI breaks
**What goes wrong:** Work is developed on macOS; Windows/Linux break at CI or in the operator's rare Windows session.
**Evidence:** 80 CI: windows-latest failed on test-only path-separator bugs, three fix commits; 63 WR-03 (UNC); `steamLaunchRuntime.test.ts` red on Linux since 2026-11-12, "passes 9/9 on macOS"; Phase 66.2 Windows live gate open; spike 080 said Steam crates build on Windows/Linux but required explicit rustls provider install (steam-vent's aws-lc vs `gamelib-depot`'s ring); `gamelib-depot` needs `rust-version = 1.89` while others are 1.77.2; adding a crate changes `Cargo.lock` and `EXPECTED_LOCKFILE_CRATE_NAMES` in `cargoFeatures.test.ts`; Windows is the operator's non-primary OS, so live checks are scarce.
**Prevention:** `rust-test.yml` three-leg green is a per-slice merge criterion (already the 80 delete gate; make it universal); use `cfg(windows)`-aware APIs (winreg/windows-sys, not `reg.exe`, as in 80 D-13); path tests built segment-by-segment; schedule one batched Windows (and one Linux) live session per 2 to 3 slices with a predefined checklist so items do not pile up as `human_needed`; keep one TLS provider decision at shell start; cap new crates (each adds lockfile and compile time).

### Pitfall 14: Locale / encoding / Windows path differences in file formats and notifications
**What goes wrong:** Rust parses files differently from the JS: code pages, BOMs, `\r\n`, 8.3 and long-path prefixes (`\\?\`), case-insensitive collisions, Unicode normalisation (macOS NFD vs NFC), reserved names, trailing dots.
**Evidence:** 75 WR-06 (escape decode), 80 A-IN-04 (Unicode normalisation residual in `same_installdir`), 80 `copy_source_label` English-only (a hard-coded string slipped through the D-03 locale loader); Phase 80 built `gamelib-i18n` with i18next-style `{{var}}` interpolation across 49 locales.
**Prevention:** Fixture corpus of Windows-style paths and non-ASCII names per format; use `PathBuf` components, never string splitting on `/`; run the i18n gate (`pnpm i18n --fail-on-update`) per slice; ban literal user-facing strings in Rust via a grep gate that routes through `gamelib-i18n`.

### Pitfall 15: Logging and file-handle behaviour changes
**What goes wrong:** Sidecar logs through the TS logger to `~/Library/Logs/GameLib/gamelib.log` (and Windows/Linux equivalents); Rust `tracing` diagnostics are dropped or formatted differently; redaction is lost; file handles stay open on Windows blocking deletion/updates.
**Evidence:** 79-REVIEW WR-03 (tracing diagnostics in owned_demos and macowned silently dropped); `.planning/debug/bootstrapwirings-log-drop.md`; 80 A-IN-01 (unbounded log growth while hung); 79 REVIEW claims "secret handling clean" only after review; conventions skill (diagnostic reports embed env and cmdline).
**Prevention:** The logger slice ports first and defines one Rust `log` facade writing to the same file, same line format (live-gate scripts and debug sessions grep these lines: "scanner ... impl=rust" proof lines in 63-UAT depend on exact text), same rotation, and a redaction layer for tokens/paths. Rate-limit repeated errors (A-IN-01). On Windows open files with share-delete flags and drop handles before delete/rename.

### Pitfall 16: Reentrancy, races and stale-snapshot writes in long-running operations
**What goes wrong:** Long async operations snapshot state, await the network, then write the snapshot back, clobbering concurrent changes. Rust makes this easy to write because ownership does not catch semantic races across `.await`.
**Evidence:** 79-REVIEW (regression) WR-01 (Refresh snapshots install state before a 150 s call, then overwrites the library); WR-04 (enrichment snapshots then writes back without checking); WR-02 (sign-out during finalisation brings the account back); WR-06 (overlapping 2 s polls each finish sign-in); 80 A-WR-02 and C-WR-01 (late `launching` overwrites `playing`); debug `steam-dm-queue-wedge.md` (startup race: `currentElement` null from module load); `steam-sync-false-failed-banner.md`.
**Prevention:** Rule for every ported mutation: read-modify-write under a lock **after** the await (merge, not replace), with a generation counter for cancel/restart. Add a "concurrent Refresh + install" and "stop during start" test per stateful object. Never hold a std Mutex across `.await`.
**Slice type:** Steam library state, download manager (queue), session objects.

### Pitfall 17: Never-settling awaits and missing timeouts
**What goes wrong:** A TS path had a generous implicit time bound (steam-user timeouts, axios) that the Rust port omits, or the reverse: the Rust deadline is shorter than the sum of its stage bounds.
**Evidence:** debug `steam-install-spinner-hangs-tauri-live-g3002.md` (bare un-timed PICS calls; install never settled; no terminal handling); `depot-stall-bound-did-not-fire.md`; `steam-cm-drop-planbuild.md`; 79 WR-01 (150 s Refresh deadline shorter than its stage bounds; timeout discarded the whole library); 80 B-WR-01 (4.5 s ack deadline not re-checked after lock).
**Prevention:** Every network/child await has an explicit timeout, a terminal UI state and a retry policy written down in the plan; deadlines are budgeted top-down (outer >= sum of stages); on timeout keep the previous data. Test with a stalled peer.

### Pitfall 18: Transitional state-event/ack machinery becomes a source of defects
**What goes wrong:** Phase 80's design (Rust loops emit typed events to a thin TS handler, wait for ack, queue per appId when the sidecar is down, replay later) is complex and had the largest part of the review findings (WR-08 ordering, B-WR-02 retry thread failure, C-IN-04 poison events). Any further slice that leaves state in the sidecar will add more of the same.
**Prevention:** Prefer moving **state owners** before moving their consumers (library state, gameSession, update cache first, i.e. the dependency roots), so later slices call Rust directly instead of adding another event bridge. Do not add new Rust-to-TS callbacks for per-tick logic; if one is unavoidable, reuse the existing outbox, with a cap and a dead-letter log.
**Slice type:** slice ordering decision for the roadmap.

### Pitfall 19: Dual-runtime state during the long middle of the migration
**What goes wrong:** For most of the milestone two runtimes own overlapping state (singleton caches, in-memory maps, `StoreManager` registrations). The Phase 66 DI work reduced module-level state, but Rust cannot read a TS in-memory map, so cross-slice features (library refresh, uninstall that touches both) end up with two sources of truth.
**Evidence:** 80 CONTEXT D-02, deferred list; 79 C1/CR-01 (rustSession lease vs `getDepotClient`), Phase 66.3/66.4 "module state to zero" work; `steam-startup-resume-crash.md` (boot-time unattended work in `init()` killed the process).
**Prevention:** Draw a state-ownership table at the roadmap level (each store/cache has exactly one owner per slice boundary; the other side reads through an RPC), and sequence slices so no owner moves twice. Boot work stays bounded and user-initiated where heavy.

---

## Minor Pitfalls

### Pitfall 20: Packaging, size and signing changes when the SEA is removed
**What goes wrong:** Removing `src-tauri/binaries/gamelib-sidecar-*` (SEA built by `meta/buildSidecarSea.ts` with postject, codesign, lipo) changes bundle contents, entitlements and notarisation inputs. Some entitlements (`entitlements.plist`) existed for the Node runtime (JIT/unsigned-memory), and leftover ones widen attack surface; or removing them breaks a helper still needing them (bridge helper, vendored legendary/gogdl/nile PyInstaller binaries, which are separate executables that still need signing).
**Evidence:** `meta/buildSidecarSea.ts` header; `tauri.{macos,windows,linux}.conf.json`; `src-tauri/entitlements.plist`; Windows releases ship unsigned (todo `2026-09-14-windows-releases-ship-unsigned...`, accepted, SmartScreen warns); macOS blank-render todo (signing disproved as cause, do not re-run); `tauri build` exits 1 on updater signing after bundle complete.
**Prevention:** Deletion slice checks: `externalBin` / resources lists, `beforeBuildCommand`, CI workflows that call `build:sidecar*`, `smoke:sidecar`, `releaseLauncher`/updater artefacts, size before/after, notarisation on a release candidate, `codesign --verify --deep` of every nested executable, entitlement diff reviewed line by line; keep the PyInstaller helpers' signing path. Test an upgrade from the previous release (updater) not only a clean install. Note `pnpm tauri:dev` does not rebuild the sidecar (memory) so after the deletion any workflow/doc/script still referencing it is stale: grep for `build:sidecar`, `sidecar.js`, `smoke:sidecar`.

### Pitfall 21: Dev workflow and CI gates rot as the sidecar disappears
**What goes wrong:** Gates that reference TS backend structure (`backend-di-ceilings`, `gameinfo-narrowing-ceiling`, steam-line-ceiling, find-deadcode knip, census suites, `fakeHomeIsolation`) silently become vacuous or go red en masse. The repo already carries a long known-red list (`80-HANDOFF.md`) and a pre-push hook that is red and bypassed with `--no-verify`.
**Prevention:** First roadmap task: get the known-red list to zero or explicitly retire each suite; a gate with a vacuous-pass guard (re-read the exempt file, assert scanned count > 0, pattern of 71-19's "vacuous EOF pin"). In the deletion slice, retire gates for deleted code and replace with Rust-side equivalents, in the same commit.

### Pitfall 22: Process hygiene in this workspace
**What goes wrong:** Several sessions commit on `main` in the same checkout; `gsd-sdk query commit` sweeps all dirty `.planning`; `new-milestone` step 6 `phases.clear` deletes live phase dirs (memory notes); workspace-wide `cargo fmt` reformats ~24 unrelated shell files; pushes with `--no-verify`.
**Prevention:** Executors stage explicit paths only; rustfmt per crate; never start a v0.11 milestone-switch operation while v0.10 phases (64, 47, 77, 81) are open without checking STATE.

---

## Phase-Specific Warnings

| Slice type | Likely pitfall | Mitigation |
|------------|----------------|------------|
| Foundations: stores, config, migrations | 3 (format compat), 11 (HOME), 12 (Keychain), 15 (logger) | Real-file corpus + roundtrip + unknown-key preservation; Rust participation in Phase 68 versions; one shared atomic-write helper; logger first |
| Foundations: process runner and shutdown | 9, 10, 13 | `ProcessRunner` with kill-tree and bounded drain, tested under SIGKILL on 3 OSes before any manager slice |
| IPC schema census | 8, 21 | Fix or retire the known-red census suites; diff Rust command registry vs TS contract |
| Steam library state (`libraryState`, `gameSession`, update cache) | 4, 6, 16, 18, 19 | Move state owners first; delete the Phase 80 handler/ack in the same slice; concurrency tests (Refresh vs install, stop vs start) |
| Steam bridge (about 18k TS lines) + TS depot path | 5, 6, 2 | Largest live-gate surface ("bridge verified" is strict: HELLO + clean game log); golden traces; bottle removal still shares the A-WR-01 data-loss bug; needs deeper phase research |
| Epic/GOG/Amazon managers | 9, 2, 6, 14 | Parser-first with captured real output; vendored PyInstaller binaries stay; pin versions; per-store golden traces; Windows live gate |
| Download manager / queue | 16, 17, 6, 10 | Reuse `steam-dm-queue-wedge` and `gog-download-resume-from-zero` as regression scenarios; resume-after-quit semantics (pause before abort, per skill) |
| Humble, engine/wine/tools/CrossOver index, shortcuts, wiki, sign-in probes | 12, 1, 2, 14 | Humble secrets stay behind `keyring_dispatch`; webview-cookie flows are WKWebView-sensitive (tauri-login-webview-cookies reference); shortcuts.vdf writer uses 75's atomic write |
| Sidecar deletion | 20, 21, 10, 5 | Packaging/entitlement/notarisation diff, upgrade-from-previous-release gate, delete SEA scripts/CI/docs/CLAUDE.md conventions together, full-matrix live gate |

## Research flags for roadmap

- **Needs deeper phase research:** Steam bridge slice (size, DRM-boundary rules, live-only verification); download manager (queue persistence and resume semantics); Epic/GOG/Amazon (output formats of external binaries, Windows process-tree kill); sidecar deletion (packaging/signing/entitlements, updater from prior release).
- **Standard pattern, low research need:** pure-data services with fixtures (wiki game info, engine index, sign-in probes) once the foundations exist.
- **Do first (cross-cutting):** tri-state error rule (1), shared safe-path + atomic-write helpers (2, 3), process runner and shutdown contract (9, 10), logger (15), IPC schema diff (8), zeroing the known-red CI list (21).

## Open questions / low-confidence

- Keychain ACL behaviour when the accessing binary changes (12): inferred, needs a signed-build upgrade test.
- Whether the known-red suites (`ipcDomainCensus`, `flowRegistrationCensus`) can serve as IPC drift gates: not verified; they are red in 80-HANDOFF.
- Phase 73 has no REVIEW file in the repo; its pitfalls here come from the spike reference and debug sessions only.
- Phase 80 REVIEW is at re-review with 5 warnings open (incl. A-WR-01 data-loss and A-WR-02 stop/start race); check `80-REVIEW-FIX-*.md` and todos before assuming fixed.

## Sources

- `.planning/phases/80-*/80-CONTEXT.md`, `80-REVIEW.md`, `80-HANDOFF.md`, `80-HUMAN-UAT.md` (HIGH)
- `.planning/phases/79-*/79-REVIEW.md`, `.planning/phases/75-*/75-REVIEW.md`, `.planning/phases/63-*/63-REVIEW.md`, `63-UAT.md` (HIGH)
- `.planning/phases/68-*/68-CONTEXT.md` (HIGH)
- `.planning/debug/*.md`, `.planning/debug/resolved/*.md` (HIGH)
- `.claude/skills/gamelib-conventions/SKILL.md`, `.claude/skills/spike-findings-gamelib/references/rust-migration-steam.md`, `tauri-rearchitecture.md` (HIGH)
- `.planning/PROJECT.md` (Key Decisions, v0.11 section), `src-tauri/crates/README.md`, `meta/buildSidecarSea.ts` (HIGH)
- Keychain/packaging inferences: MEDIUM/LOW (no external verification performed)
